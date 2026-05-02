import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type ProductSearchHit = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  attribution?: string;
};

export type ProductSearchSource = 'serpapi' | 'google' | 'openverse';

/**
 * Google Shopping via SerpApi — same approach as sibling project Clueless (`/api/product-search`).
 * Shopping results are product listings with thumbnails (ideal for wardrobe picker).
 */
async function searchSerpApiShopping(q: string): Promise<ProductSearchHit[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q,
    api_key: apiKey,
    gl: 'us',
    hl: 'en',
  });

  try {
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      next: { revalidate: 0 },
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      shopping_results?: SerpShoppingItem[];
      inline_shopping_results?: SerpShoppingItem[];
    };

    if (data.error) {
      console.error('[products/search] SerpApi error:', data.error);
      return [];
    }

    const shopping = data.shopping_results ?? [];
    const inline = data.inline_shopping_results ?? [];
    const combined = [...shopping, ...inline];
    const seen = new Set<string>();
    const hits: ProductSearchHit[] = [];

    for (let i = 0; i < combined.length; i++) {
      const item = combined[i];
      const title = item.title?.trim();
      const thumb = item.thumbnail || item.serpapi_thumbnail;
      const link = item.link || item.product_link;
      if (!title || !thumb || seen.has(thumb)) continue;
      seen.add(thumb);

      const price = item.price;
      const source = item.source;
      const meta = [price, source].filter(Boolean).join(' · ');

      hits.push({
        id: `serp-${hits.length}-${i}`,
        title: title.slice(0, 200),
        imageUrl: thumb,
        thumbnailUrl: thumb,
        sourceUrl: String(link ?? '').trim(),
        ...(meta ? { attribution: meta.slice(0, 500) } : {}),
      });

      if (hits.length >= 12) break;
    }

    return hits;
  } catch (e) {
    console.error('[products/search] SerpApi fetch failed:', e);
    return [];
  }
}

type SerpShoppingItem = {
  title?: string;
  thumbnail?: string;
  serpapi_thumbnail?: string;
  link?: string;
  product_link?: string;
  price?: string;
  source?: string;
};

async function searchGoogleImage(q: string, page: number): Promise<ProductSearchHit[]> {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!key || !cx) return [];

  const start = (page - 1) * 10 + 1;
  const params = new URLSearchParams({
    key,
    cx,
    q,
    searchType: 'image',
    num: '10',
    start: String(start),
    safe: 'active',
  });

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        image?: { thumbnailLink?: string; contextLink?: string };
      }>;
    };
    const items = data.items ?? [];
    return items
      .map((it, i) => {
        const imageUrl = it.link?.trim() ?? '';
        const thumb = it.image?.thumbnailLink?.trim() || imageUrl;
        const sourceUrl = it.image?.contextLink?.trim() || it.link?.trim() || '';
        return {
          id: `g-${start}-${i}`,
          title: (it.title ?? q).slice(0, 200),
          imageUrl,
          thumbnailUrl: thumb,
          sourceUrl,
        };
      })
      .filter((p) => p.imageUrl.startsWith('http'));
  } catch {
    return [];
  }
}

async function searchOpenverse(q: string, page: number): Promise<ProductSearchHit[]> {
  const params = new URLSearchParams({
    q,
    page: String(page),
    page_size: '20',
  });

  try {
    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: {
        'User-Agent': 'CluelessWardrobe/1.0 (product picker)',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id?: string;
        title?: string;
        url?: string;
        thumbnail?: string;
        foreign_landing_url?: string;
        attribution?: string;
      }>;
    };
    const results = data.results ?? [];
    return results
      .map((r) => {
        const imageUrl = String(r.url ?? '').trim();
        const thumb = String(r.thumbnail ?? r.url ?? '').trim();
        return {
          id: String(r.id ?? imageUrl),
          title: String(r.title ?? 'Photo').slice(0, 200),
          imageUrl,
          thumbnailUrl: thumb || imageUrl,
          sourceUrl: String(r.foreign_landing_url ?? r.url ?? '').trim(),
          attribution: r.attribution ? String(r.attribution).slice(0, 500) : undefined,
        };
      })
      .filter((p) => p.imageUrl.startsWith('http'));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ products: [] as ProductSearchHit[], source: null });
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1);

  const serpHits = await searchSerpApiShopping(q);
  if (serpHits.length > 0) {
    return NextResponse.json({ products: serpHits, source: 'serpapi' satisfies ProductSearchSource });
  }

  const hasGoogle =
    Boolean(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY) &&
    Boolean(process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID);

  if (hasGoogle) {
    const googleHits = await searchGoogleImage(q, page);
    if (googleHits.length > 0) {
      return NextResponse.json({ products: googleHits.slice(0, 12), source: 'google' satisfies ProductSearchSource });
    }
  }

  const openverseHits = await searchOpenverse(q, page);
  return NextResponse.json({
    products: openverseHits.slice(0, 12),
    source: 'openverse' satisfies ProductSearchSource,
  });
}
