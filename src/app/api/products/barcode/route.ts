import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';
import { findProductsByBarcode, normalizeBarcode } from '@/lib/products/barcode-lookup';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const limited = rateLimit({
    scope: 'api:products-barcode',
    subject: ctx.userId,
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const raw = req.nextUrl.searchParams.get('upc')?.trim() ?? '';
  const barcode = normalizeBarcode(raw);
  if (!barcode) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Enter a valid 8–14 digit barcode (UPC/EAN).' } },
      { status: 400 }
    );
  }

  try {
    const result = await findProductsByBarcode(barcode);
    return NextResponse.json({
      products: result.products,
      source: result.source,
      barcode: result.barcode,
    });
  } catch (e) {
    console.error('[products/barcode]', e);
    return NextResponse.json(
      { error: { code: 'unavailable', message: 'Barcode lookup failed. Try again.' } },
      { status: 500 }
    );
  }
}
