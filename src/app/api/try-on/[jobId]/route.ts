import { NextRequest, NextResponse } from 'next/server';
import { getTryOnJob } from '@/lib/vto/jobs';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  const limited = rateLimit({
    scope: 'api:try-on-status',
    subject: ctx.userId,
    limit: 180,
    windowMs: 5 * 60 * 1000,
  });
  if (limited) return limited;

  const { jobId } = await params;
  const snapshot = getTryOnJob(jobId, ctx.userId);
  if (!snapshot) {
    return NextResponse.json(
      { error: 'Job not found', details: 'Try-on job expired or does not exist.' },
      { status: 404 }
    );
  }
  return NextResponse.json(snapshot);
}

