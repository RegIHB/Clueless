import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function parseAllowedImageUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isReplicateDelivery =
    hostname === 'replicate.delivery' || hostname.endsWith('.replicate.delivery');

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !isReplicateDelivery) {
    return null;
  }

  return parsed;
}

// Server-side image proxy: fetches a remote image (e.g. expiring Replicate URL)
// and returns it as binary so the client can re-upload it to durable storage.
// Keeps credentials off the client and avoids browser CORS restrictions.
export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  const limited = rateLimit({
    scope: 'api:persist-image',
    subject: ctx.userId,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const parsedUrl = parseAllowedImageUrl(url);
  if (!parsedUrl) {
    return NextResponse.json({ error: 'Unsupported image URL' }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsedUrl, {
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream did not return an image' }, { status: 415 });
    }

    const contentLength = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[persist-image]', err);
    return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 });
  }
}
