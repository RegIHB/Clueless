import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductSearchHit, ProductSearchSource } from '@/lib/products/types';
import { searchProductsByQuery } from '@/lib/products/search';

export const PRODUCT_SCANS_BUCKET = 'product-scans';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type ParsedImage = {
  mimeType: string;
  buffer: Buffer;
};

export function parseDataImageUrl(dataUrl: string): ParsedImage | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const mimeType = match[1].toLowerCase().replace('jpg', 'jpeg');
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

export type GarmentVisionResult = {
  searchQuery: string;
  suggestedCategory?: 'tops' | 'bottoms' | 'outerwear' | 'footwear' | 'accessories';
  suggestedType?: string;
};

const VISION_PROMPT = `You analyze photos of a single clothing item or accessory for a wardrobe app.
Reply with ONLY valid JSON (no markdown):
{
  "searchQuery": "short shopping search phrase, e.g. navy wool peacoat men",
  "suggestedCategory": "tops|bottoms|outerwear|footwear|accessories",
  "suggestedType": "one of: Top, Dress, Pants, Jacket, Sneakers, Bag, etc."
}
Focus on garment type, color, material, and style. If unsure, still give your best searchQuery.`;

function parseVisionJson(text: string): GarmentVisionResult | null {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/\{[\s\S]*\}/);
  const raw = jsonBlock ? jsonBlock[0] : trimmed;
  try {
    const parsed = JSON.parse(raw) as {
      searchQuery?: string;
      suggestedCategory?: string;
      suggestedType?: string;
    };
    const searchQuery = parsed.searchQuery?.trim();
    if (!searchQuery) return null;
    const category = parsed.suggestedCategory?.trim().toLowerCase();
    const validCategories = ['tops', 'bottoms', 'outerwear', 'footwear', 'accessories'] as const;
    return {
      searchQuery: searchQuery.slice(0, 120),
      ...(validCategories.includes(category as (typeof validCategories)[number])
        ? { suggestedCategory: category as GarmentVisionResult['suggestedCategory'] }
        : {}),
      ...(parsed.suggestedType?.trim()
        ? { suggestedType: parsed.suggestedType.trim().slice(0, 80) }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function describeGarmentFromImage(parsed: ParsedImage): Promise<GarmentVisionResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const client = new GoogleGenerativeAI(geminiKey);
      const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
      const model = client.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([
        { text: VISION_PROMPT },
        {
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.buffer.toString('base64'),
          },
        },
      ]);
      const text = result.response.text();
      const vision = parseVisionJson(text);
      if (vision) return vision;
    } catch (e) {
      console.error('[visual-search] Gemini vision failed:', e);
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey });
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      const dataUrl = `data:${parsed.mimeType};base64,${parsed.buffer.toString('base64')}`;
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? '';
      const vision = parseVisionJson(text);
      if (vision) return vision;
    } catch (e) {
      console.error('[visual-search] OpenAI vision failed:', e);
    }
  }

  return null;
}

type LensMatch = {
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
  image?: string;
  price?: { value?: string; extracted_value?: number; currency?: string };
};

function lensMatchesToHits(matches: LensMatch[], prefix: string): ProductSearchHit[] {
  const seen = new Set<string>();
  const hits: ProductSearchHit[] = [];

  for (let i = 0; i < matches.length; i++) {
    const item = matches[i];
    const title = item.title?.trim();
    const thumb = item.thumbnail || item.image;
    const link = item.link?.trim() ?? '';
    if (!title || !thumb || !thumb.startsWith('http') || seen.has(thumb)) continue;
    seen.add(thumb);

    const priceMeta = item.price?.value
      ? String(item.price.value)
      : item.source
        ? String(item.source)
        : '';
    const imageUrl = item.image?.startsWith('http') ? item.image : thumb;

    hits.push({
      id: `${prefix}-${hits.length}-${i}`,
      title: title.slice(0, 200),
      imageUrl,
      thumbnailUrl: thumb,
      sourceUrl: link,
      ...(priceMeta ? { attribution: priceMeta.slice(0, 500) } : {}),
    });

    if (hits.length >= 12) break;
  }

  return hits;
}

/** Google Lens via SerpApi — requires a publicly reachable image URL. */
export async function searchGoogleLensProducts(imageUrl: string): Promise<ProductSearchHit[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: 'google_lens',
    url: imageUrl,
    type: 'products',
    api_key: apiKey,
    hl: 'en',
    country: 'us',
    auto_crop: 'true',
  });

  try {
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      next: { revalidate: 0 },
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      visual_matches?: LensMatch[];
      products?: LensMatch[];
    };

    if (data.error) {
      console.error('[visual-search] Google Lens error:', data.error);
      return [];
    }

    const productHits = lensMatchesToHits(data.products ?? [], 'lens-p');
    if (productHits.length > 0) return productHits;

    return lensMatchesToHits(data.visual_matches ?? [], 'lens-v');
  } catch (e) {
    console.error('[visual-search] Google Lens fetch failed:', e);
    return [];
  }
}

export async function uploadScanImage(
  supabase: SupabaseClient,
  userId: string,
  scanId: string,
  parsed: ParsedImage
): Promise<string | null> {
  const ext = parsed.mimeType.includes('png') ? 'png' : parsed.mimeType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/${scanId}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_SCANS_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: true,
    });

  if (error) {
    console.warn('[visual-search] scan upload failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(PRODUCT_SCANS_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

function mergeProductHits(primary: ProductSearchHit[], secondary: ProductSearchHit[]): ProductSearchHit[] {
  const seen = new Set<string>();
  const merged: ProductSearchHit[] = [];

  for (const hit of [...primary, ...secondary]) {
    const key = hit.thumbnailUrl || hit.imageUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= 12) break;
  }

  return merged;
}

export type VisualSearchResult = {
  products: ProductSearchHit[];
  source: ProductSearchSource | null;
  suggestedQuery: string | null;
  suggestedCategory?: GarmentVisionResult['suggestedCategory'];
  suggestedType?: string;
};

/**
 * Find similar / matching products online from a clothing photo (photo path only — not barcodes).
 * Uses Google Lens when SerpApi + public scan URL are available, plus vision → shopping text search.
 */
export async function findProductsFromImage(
  parsed: ParsedImage,
  options: { supabase: SupabaseClient; userId: string; scanId: string }
): Promise<VisualSearchResult> {
  const visionPromise = describeGarmentFromImage(parsed);

  let lensHits: ProductSearchHit[] = [];
  let lensSource: ProductSearchSource | null = null;

  if (process.env.SERPAPI_KEY) {
    const publicUrl = await uploadScanImage(options.supabase, options.userId, options.scanId, parsed);
    if (publicUrl) {
      lensHits = await searchGoogleLensProducts(publicUrl);
      if (lensHits.length > 0) lensSource = 'google_lens';
    }
  }

  const vision = await visionPromise;
  const suggestedQuery = vision?.searchQuery ?? null;

  let textHits: ProductSearchHit[] = [];
  let textSource: ProductSearchSource | null = null;
  if (suggestedQuery) {
    const textResult = await searchProductsByQuery(suggestedQuery);
    textHits = textResult.products;
    textSource = textResult.source;
  }

  const products = mergeProductHits(lensHits, textHits);
  const source = lensSource ?? textSource ?? (vision ? 'vision' : null);

  return {
    products,
    source,
    suggestedQuery,
    ...(vision?.suggestedCategory ? { suggestedCategory: vision.suggestedCategory } : {}),
    ...(vision?.suggestedType ? { suggestedType: vision.suggestedType } : {}),
  };
}
