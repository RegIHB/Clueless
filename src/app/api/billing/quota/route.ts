import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';

const FREE_DAILY_LIMIT = 4;
const FREE_MONTHLY_LIMIT = 20;

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', ctx.userId)
    .single();

  if (profile?.is_pro) {
    return NextResponse.json({ isPro: true, dailyRemaining: null, totalRemaining: null });
  }

  const { data, error } = await ctx.supabase.rpc('get_tryon_quota', { p_user_id: ctx.userId });

  if (error) {
    console.error('[billing/quota]', error);
    return NextResponse.json({ isPro: false, dailyRemaining: FREE_DAILY_LIMIT, totalRemaining: FREE_MONTHLY_LIMIT });
  }

  const { day_count, total_count } = data as { day_count: number; total_count: number };

  return NextResponse.json({
    isPro: false,
    dailyUsed: day_count,
    totalUsed: total_count,
    dailyRemaining: Math.max(0, FREE_DAILY_LIMIT - day_count),
    totalRemaining: Math.max(0, FREE_MONTHLY_LIMIT - total_count),
    dailyLimit: FREE_DAILY_LIMIT,
    totalLimit: FREE_MONTHLY_LIMIT,
  });
}
