import { NextRequest, NextResponse } from 'next/server';
import { subscribeTryOnJob } from '@/lib/vto/jobs';
import { requireAuth } from '@/app/api/_helpers/auth';
import { rateLimit } from '@/app/api/_helpers/rate-limit';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  const limited = rateLimit({
    scope: 'api:try-on-events',
    subject: ctx.userId,
    limit: 30,
    windowMs: 5 * 60 * 1000,
  });
  if (limited) return limited;

  const { jobId } = await params;
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const unsubscribe = subscribeTryOnJob(jobId, ctx.userId, (snapshot) => {
        send('progress', snapshot);
        if (snapshot.status === 'completed' || snapshot.status === 'failed') {
          send('end', snapshot);
          unsubscribe?.();
          controller.close();
        }
      });

      if (!unsubscribe) {
        send('error', { error: 'Job not found' });
        controller.close();
        return;
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(enc.encode(': keepalive\n\n'));
      }, 15000);

      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

