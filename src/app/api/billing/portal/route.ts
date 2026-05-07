import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';

// Returns the Lemon Squeezy customer portal URL for the authed user.
// The client redirects the user there to manage/cancel their subscription.
export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('ls_customer_id')
    .eq('id', ctx.userId)
    .single();

  const customerId = profile?.ls_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 500 });
  }

  const res = await fetch(`https://api.lemonsqueezy.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/vnd.api+json' },
  });

  if (!res.ok) {
    console.error('[billing/portal] LS API error', res.status, await res.text());
    return NextResponse.json({ error: 'Could not fetch portal URL' }, { status: 502 });
  }

  const json = await res.json() as { data?: { attributes?: { urls?: { customer_portal?: string } } } };
  const portalUrl = json.data?.attributes?.urls?.customer_portal;

  if (!portalUrl) {
    return NextResponse.json({ error: 'Portal URL not available' }, { status: 502 });
  }

  return NextResponse.json({ url: portalUrl });
}
