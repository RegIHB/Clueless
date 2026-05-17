import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';
import { findProductsFromImage, parseDataImageUrl } from '@/lib/products/visual-search';

const bodySchema = z.object({
  imageDataUrl: z.string().min(32).max(12_000_000),
});

export async function POST(request: Request) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const limited = rateLimit({
    scope: 'api:products-visual-search',
    subject: ctx.userId,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid JSON payload' } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid image payload' } },
      { status: 400 }
    );
  }

  const image = parseDataImageUrl(parsed.data.imageDataUrl);
  if (!image) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Unsupported or too large image. Use JPEG, PNG, or WebP under 4 MB.' } },
      { status: 400 }
    );
  }

  const hasVision = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  const hasSearch = Boolean(
    process.env.SERPAPI_KEY ||
      (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID)
  );

  if (!hasVision && !hasSearch) {
    return NextResponse.json(
      {
        error: {
          code: 'unconfigured',
          message:
            'Visual search needs GEMINI_API_KEY or OPENAI_API_KEY, plus SERPAPI_KEY (recommended) for shopping results.',
        },
      },
      { status: 503 }
    );
  }

  try {
    const result = await findProductsFromImage(image, {
      supabase: ctx.supabase,
      userId: ctx.userId,
      scanId: randomUUID(),
    });

    return NextResponse.json({
      products: result.products,
      source: result.source,
      suggestedQuery: result.suggestedQuery,
      suggestedCategory: result.suggestedCategory ?? null,
      suggestedType: result.suggestedType ?? null,
    });
  } catch (e) {
    console.error('[products/visual-search]', e);
    return NextResponse.json(
      { error: { code: 'unavailable', message: 'Visual search failed. Try again in a moment.' } },
      { status: 500 }
    );
  }
}
