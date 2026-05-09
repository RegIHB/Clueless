import { NextResponse } from 'next/server';

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
};

function buckets(): Map<string, Bucket> {
  const g = globalThis as typeof globalThis & { __cluelessRateLimitBuckets?: Map<string, Bucket> };
  if (!g.__cluelessRateLimitBuckets) {
    g.__cluelessRateLimitBuckets = new Map();
  }
  return g.__cluelessRateLimitBuckets;
}

/**
 * Lightweight per-process rate limiter for API cost protection. It is not a
 * replacement for durable edge/Redis limits, but it safely reduces abuse on
 * each running instance without adding infrastructure.
 */
export function rateLimit({
  scope,
  subject,
  limit,
  windowMs,
}: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  const key = `${scope}:${subject}`;
  const store = buckets();
  const current = store.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  store.set(key, bucket);

  if (bucket.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    {
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Please wait a moment and try again.',
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
      },
    }
  );
}
