import { NextRequest, NextResponse } from 'next/server';

// Server-side image proxy: fetches a remote image (e.g. expiring Replicate URL)
// and returns it as binary so the client can re-upload it to durable storage.
// Keeps credentials off the client and avoids browser CORS restrictions.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
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
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('[persist-image]', err);
    return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 });
  }
}
