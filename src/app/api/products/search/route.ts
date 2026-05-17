import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';
import { searchProductsByQuery } from '@/lib/products/search';

export const dynamic = 'force-dynamic';

export type { ProductSearchHit, ProductSearchSource } from '@/lib/products/types';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  const limited = rateLimit({
    scope: 'api:products-search',
    subject: ctx.userId,
    limit: 80,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ products: [], source: null });
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
  const { products, source } = await searchProductsByQuery(q, page);

  return NextResponse.json({ products, source });
}
