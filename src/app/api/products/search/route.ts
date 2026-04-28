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

async function searchGoogle(q: string, page: number): Promise<ProductSearchHit[]> {
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
        const sourceUrl =
          it.image?.contextLink?.trim() || it.link?.trim() || '';
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
    page_size: '12',
  });

  try {
    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: {
        'User-Agent': 'CluelessWardrobe/1.0 (product picker; local development)',
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

  const hasGoogle =
    Boolean(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY) &&
    Boolean(process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID);

  if (hasGoogle) {
    const googleHits = await searchGoogle(q, page);
    if (googleHits.length > 0) {
      return NextResponse.json({ products: googleHits, source: 'google' as const });
    }
  }

  const products = await searchOpenverse(q, page);
  return NextResponse.json({ products, source: 'openverse' as const });
}
