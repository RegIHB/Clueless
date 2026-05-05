import { NextRequest, NextResponse } from 'next/server';
import { getTryOnJob } from '@/lib/vto/jobs';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const snapshot = getTryOnJob(jobId);
  if (!snapshot) {
    return NextResponse.json(
      { error: 'Job not found', details: 'Try-on job expired or does not exist.' },
      { status: 404 }
    );
  }
  return NextResponse.json(snapshot);
}

