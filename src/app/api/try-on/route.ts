import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createTryOnJob } from '@/lib/vto/jobs';

const FREE_DAILY_LIMIT = 4;
const FREE_MONTHLY_LIMIT = 20;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Returns { allowed, reason } — also increments counter when allowed. */
async function checkAndIncrementQuota(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string; dailyUsed?: number; totalUsed?: number }> {
  const supabase = adminSupabase();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Check Pro status first — Pro users skip all limits.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', userId)
    .single();

  if (profile?.is_pro) return { allowed: true };

  // Upsert today's row and increment atomically via RPC.
  // We use a raw SQL upsert via rpc to avoid race conditions.
  const { data, error } = await supabase.rpc('increment_tryon_usage', {
    p_user_id: userId,
    p_date: today,
  });

  if (error) {
    console.error('[try-on quota] rpc error', error);
    // Fail open — don't block try-on if quota check errors.
    return { allowed: true };
  }

  const { day_count, total_count } = data as { day_count: number; total_count: number };

  if (total_count > FREE_MONTHLY_LIMIT) {
    await supabase.rpc('decrement_tryon_usage', { p_user_id: userId, p_date: today });
    return {
      allowed: false,
      reason: `You've used all ${FREE_MONTHLY_LIMIT} free looks this month. Upgrade to Pro for unlimited try-ons.`,
      totalUsed: total_count - 1,
    };
  }

  if (day_count > FREE_DAILY_LIMIT) {
    await supabase.rpc('decrement_tryon_usage', { p_user_id: userId, p_date: today });
    return {
      allowed: false,
      reason: `You've hit the daily limit of ${FREE_DAILY_LIMIT} looks. Come back tomorrow or upgrade to Pro.`,
      dailyUsed: day_count - 1,
    };
  }

  return { allowed: true };
}

const tryOnSchema = z.object({
  personImageUrl: z.string().min(1),
  garments: z
    .array(
      z.object({
        imageUrl: z.string().min(1),
        category: z.enum(['upper_body', 'lower_body', 'dresses']),
        prompt: z.string().optional(),
        code: z.string().optional(),
      })
    )
    .min(1)
    .optional(),
  garmentImageUrl: z.string().min(1).optional(),
  prompt: z.string().optional(),
  category: z.enum(['upper_body', 'lower_body', 'dresses']).optional(),
  crop: z.boolean().optional(),
  steps: z.number().int().min(1).max(40).optional(),
}).superRefine((value, ctx) => {
  const hasGarments = Array.isArray(value.garments) && value.garments.length > 0;
  if (!hasGarments && !value.garmentImageUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['garments'],
      message: 'Provide at least one garment image.',
    });
  }
});

export async function POST(request: NextRequest) {
  try {
    const parsed = tryOnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Auth + quota check — only when Supabase is configured.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: 'Sign in to run a try-on.', code: 'unauthenticated' },
          { status: 401 },
        );
      }

      const quota = await checkAndIncrementQuota(user.id);
      if (!quota.allowed) {
        return NextResponse.json(
          { error: quota.reason, code: 'quota_exceeded' },
          { status: 429 },
        );
      }
    }

    const garments =
      parsed.data.garments && parsed.data.garments.length > 0
        ? parsed.data.garments
        : parsed.data.garmentImageUrl
          ? [
              {
                imageUrl: parsed.data.garmentImageUrl,
                category: parsed.data.category ?? 'upper_body',
                prompt: parsed.data.prompt,
              },
            ]
          : [];

    const job = createTryOnJob({
      personImageUrl: parsed.data.personImageUrl,
      garments,
      crop: parsed.data.crop,
      steps: parsed.data.steps,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    console.error('[try-on]', error);
    return NextResponse.json(
      {
        error: 'Try-on job could not be created',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
