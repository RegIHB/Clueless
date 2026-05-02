import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { z } from 'zod';

const tryOnSchema = z.object({
  personImageUrl: z.string().min(1),
  garmentImageUrl: z.string().min(1),
  prompt: z.string().optional(),
});

/** Working public model; previous slug `prithivMLmods/idm-vton` no longer exists on Replicate. */
const IDM_VTON_MODEL =
  'cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f';

function coerceImageForReplicate(url: string): string | Buffer {
  const u = url.trim();
  const data = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(u);
  if (data) {
    return Buffer.from(data[2], 'base64');
  }
  return u;
}

function extractImageUrl(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === 'string' && output.startsWith('http')) return output;
  if (Array.isArray(output) && output.length > 0) {
    return extractImageUrl(output[0]);
  }
  if (typeof output === 'object' && output !== null && 'url' in output) {
    const o = output as { url: unknown };
    if (typeof o.url === 'function') {
      try {
        const href = (o.url as () => URL)();
        return href?.href ?? null;
      } catch {
        return null;
      }
    }
    if (typeof o.url === 'string' && o.url.startsWith('http')) return o.url;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = tryOnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN?.trim();
    if (!token) {
      return NextResponse.json({ error: 'Missing REPLICATE_API_TOKEN' }, { status: 500 });
    }

    const humanImg = coerceImageForReplicate(parsed.data.personImageUrl);
    const garmImg = coerceImageForReplicate(parsed.data.garmentImageUrl);

    const replicate = new Replicate({ auth: token });
    const rawOutput = await replicate.run(IDM_VTON_MODEL, {
      input: {
        human_img: humanImg,
        garm_img: garmImg,
        garment_des: (parsed.data.prompt ?? 'garment').slice(0, 500),
      },
    });

    const imageUrl = extractImageUrl(rawOutput);
    if (!imageUrl) {
      return NextResponse.json(
        {
          error: 'Try-on produced no image URL',
          details: 'Model finished but output format was unexpected.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ imageUrl, output: rawOutput });
  } catch (error) {
    console.error('[try-on]', error);

    const message = error instanceof Error ? error.message : String(error);
    let httpStatus: number | undefined;
    let apiDetail: string | undefined;

    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response instanceof Response
    ) {
      httpStatus = error.response.status;
      try {
        const j = (await error.response.clone().json()) as {
          detail?: string;
          title?: string;
        };
        apiDetail = j.detail ?? j.title;
      } catch {
        /* body not JSON */
      }
    }

    const blob = `${message} ${apiDetail ?? ''}`;
    const isPaymentRequired =
      httpStatus === 402 ||
      /\b402\b|payment required|insufficient credit/i.test(blob);

    if (isPaymentRequired) {
      return NextResponse.json(
        {
          error: 'Insufficient Replicate credit',
          code: 'REPLICATE_PAYMENT_REQUIRED',
          details:
            apiDetail ??
            'This try-on model uses paid GPU time. Add credit in your Replicate account, wait a few minutes, then try again.',
          billingUrl: 'https://replicate.com/account/billing',
        },
        { status: 402 },
      );
    }

    return NextResponse.json(
      {
        error: 'Try-on service failed',
        details: apiDetail ?? message,
      },
      { status: 500 },
    );
  }
}
