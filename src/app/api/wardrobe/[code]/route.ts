import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/app/api/_helpers/auth';
import { softDeleteWardrobeItem } from '@/lib/supabase/sync/mutations';

type Params = { params: Promise<{ code: string }> };

const deleteSchema = z.object({
  clientMutationId: z.string().min(1).max(120).optional(),
});

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const { code } = await params;
  const decoded = decodeURIComponent(code);

  let mutationId: string | undefined;
  if (request.headers.get('content-length')) {
    try {
      const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
      if (parsed.success) mutationId = parsed.data.clientMutationId;
    } catch {
      /* ignore body parse failures */
    }
  }

  const result = await softDeleteWardrobeItem(ctx.supabase, ctx.userId, decoded, mutationId);
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
