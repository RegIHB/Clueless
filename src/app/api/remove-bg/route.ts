import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';

const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  const limited = rateLimit({
    scope: 'api:remove-bg',
    subject: ctx.userId,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  let imageDataUrl: string;
  try {
    const body = await request.json();
    imageDataUrl = body?.image;
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Expected a data:image/* base64 string in the "image" field.' }, { status: 400 });
    }
    if (imageDataUrl.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Image too large.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const base64Part = imageDataUrl.split(',')[1];
    if (!base64Part) {
      return NextResponse.json({ image: imageDataUrl });
    }

    const inputBuffer = Buffer.from(base64Part, 'base64');

    const { removeBackground } = await import('@imgly/background-removal-node');
    const resultBlob = await removeBackground(inputBuffer, {
      output: { format: 'image/png', quality: 0.8 },
    });

    const resultBuffer = Buffer.from(await resultBlob.arrayBuffer());
    const resultDataUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;

    return NextResponse.json({ image: resultDataUrl });
  } catch (err) {
    console.error('[remove-bg] processing failed, returning original:', err);
    return NextResponse.json({ image: imageDataUrl });
  }
}
