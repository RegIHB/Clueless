import type { ProductSearchHit } from '@/lib/products/types';

/** Normalize UPC/EAN to digits only (8–14 chars). */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

type UpcItemDbItem = {
  ean?: string;
  upc?: string;
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  images?: string[];
  offers?: Array<{ merchant?: string; price?: string; link?: string }>;
};

type UpcItemDbResponse = {
  code?: string;
  items?: UpcItemDbItem[];
};

function itemToHits(item: UpcItemDbItem, barcode: string, itemIndex: number): ProductSearchHit[] {
  const title = [item.brand, item.title].filter(Boolean).join(' — ').trim() || item.title?.trim();
  if (!title) return [];

  const offer = item.offers?.[0];
  const attribution = [offer?.merchant, offer?.price].filter(Boolean).join(' · ');
  const sourceUrl = offer?.link?.startsWith('http') ? offer.link : '';
  const images = (item.images ?? []).filter((u) => typeof u === 'string' && u.startsWith('http'));

  if (images.length === 0) return [];

  return images.slice(0, 4).map((imageUrl, imageIndex) => ({
    id: `upc-${barcode}-${itemIndex}-${imageIndex}`,
    title: title.slice(0, 200),
    imageUrl,
    thumbnailUrl: imageUrl,
    sourceUrl,
    ...(attribution ? { attribution: attribution.slice(0, 500) } : {}),
  }));
}

/** Free-tier UPCitemdb lookup (shared daily quota on trial endpoint). */
async function lookupUpcItemDb(barcode: string): Promise<ProductSearchHit[]> {
  const userKey = process.env.UPCITEMDB_USER_KEY?.trim();
  const keyType = process.env.UPCITEMDB_KEY_TYPE?.trim() || 'trial';
  const base =
    keyType === 'prod' && userKey
      ? 'https://api.upcitemdb.com/prod/v1/lookup'
      : 'https://api.upcitemdb.com/prod/trial/lookup';

  const url = `${base}?upc=${encodeURIComponent(barcode)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (userKey) {
    headers['user-key'] = userKey;
    if (keyType === 'prod') headers['key_type'] = '3scale';
  }

  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as UpcItemDbResponse;
    if (data.code !== 'OK' || !data.items?.length) return [];

    const hits: ProductSearchHit[] = [];
    for (let i = 0; i < data.items.length; i++) {
      hits.push(...itemToHits(data.items[i], barcode, i));
      if (hits.length >= 6) break;
    }
    return hits.slice(0, 6);
  } catch (e) {
    console.error('[barcode-lookup] UPCitemdb failed:', e);
    return [];
  }
}

export type BarcodeLookupResult = {
  products: ProductSearchHit[];
  source: 'upcitemdb' | null;
  barcode: string;
};

/** Barcode-only lookup — does not run text or visual search (use photo flow for that). */
export async function findProductsByBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return { products: [], source: null, barcode: barcode.trim() };
  }

  const products = await lookupUpcItemDb(normalized);
  return {
    products,
    source: products.length > 0 ? 'upcitemdb' : null,
    barcode: normalized,
  };
}
