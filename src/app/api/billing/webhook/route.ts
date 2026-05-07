import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Lemon Squeezy sends a SHA-256 HMAC signature in X-Signature.
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Use service-role key so we can write to profiles without RLS.
function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type LsEvent = {
  meta: { event_name: string; custom_data?: { user_id?: string } };
  data: {
    attributes: {
      customer_id: number;
      order_id?: number;
      status?: string;
      user_email?: string;
      first_subscription_item?: { subscription_id?: number };
    };
    id: string;
  };
};

async function setProStatus(
  userId: string,
  isPro: boolean,
  patch: {
    ls_customer_id?: string;
    ls_subscription_id?: string;
    ls_subscription_status?: string;
  }
) {
  const supabase = adminSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ is_pro: isPro, ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error('[billing/webhook] profile update failed', error);
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[billing/webhook] LEMONSQUEEZY_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-signature') ?? '';

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: LsEvent;
  try {
    event = JSON.parse(rawBody) as LsEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName = event.meta.event_name;
  const userId = event.meta.custom_data?.user_id;
  const attrs = event.data.attributes;
  const customerId = String(attrs.customer_id);
  const subscriptionId = String(attrs.first_subscription_item?.subscription_id ?? event.data.id);
  const status = attrs.status ?? '';

  console.log(`[billing/webhook] ${eventName} user=${userId ?? 'unknown'} status=${status}`);

  // If no user_id in custom_data, try to look up by customer email.
  let resolvedUserId = userId;
  if (!resolvedUserId && attrs.user_email) {
    const supabase = adminSupabase();
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('ls_customer_id', customerId)
      .maybeSingle();
    resolvedUserId = data?.id;
  }

  if (!resolvedUserId) {
    console.warn('[billing/webhook] could not resolve user_id for event', eventName);
    // Return 200 so LS does not retry — we can't act without a user.
    return NextResponse.json({ received: true });
  }

  switch (eventName) {
    case 'order_created':
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed': {
      const isActive = ['active', 'trialing', 'past_due'].includes(status) || eventName === 'order_created';
      await setProStatus(resolvedUserId, isActive, {
        ls_customer_id: customerId,
        ls_subscription_id: subscriptionId,
        ls_subscription_status: status || 'active',
      });
      break;
    }
    case 'subscription_cancelled':
    case 'subscription_expired':
    case 'subscription_paused': {
      await setProStatus(resolvedUserId, false, {
        ls_customer_id: customerId,
        ls_subscription_id: subscriptionId,
        ls_subscription_status: status,
      });
      break;
    }
    default:
      // Ignore other events (e.g. order_refunded, license_*)
      break;
  }

  return NextResponse.json({ received: true });
}
