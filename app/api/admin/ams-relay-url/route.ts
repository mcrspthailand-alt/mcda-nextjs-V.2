import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { isAdminEmail } from '@/lib/admin';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { amsRelayUrl, RelayError } from '@/lib/ams-relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});

/** Read-only operator recovery. Never creates a checkout, requeues or marks paid. */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    if (!isAdminEmail(user.email)) return json({ error: { code: 'FORBIDDEN' } }, 403);
    const reference = request.nextUrl.searchParams.get('order_id') || '';
    if (!/^[A-Za-z0-9._-]{1,96}$/.test(reference)) return json({ error: { code: 'INVALID_ORDER_REFERENCE' } }, 400);
    await ensureMembershipSchema();
    const result = await getPool().query<{
      id: string; status: string; ams_payment_id: string | null; stripe_checkout_session_id: string | null;
    }>(`SELECT id, status, ams_payment_id, stripe_checkout_session_id
        FROM payment_orders WHERE external_reference = $1 LIMIT 1`, [reference]);
    const order = result.rows[0];
    if (!order) return json({ error: { code: 'ORDER_NOT_FOUND' } }, 404);
    const webhookUrl = amsRelayUrl((process.env.NEXT_PUBLIC_APP_URL || '').trim(), reference);
    return json({
      externalReference: reference, orderId: order.id, status: order.status,
      amsPaymentId: order.ams_payment_id, checkoutSessionId: order.stripe_checkout_session_id,
      webhookUrl, requiresIdentityReconciliation: !order.ams_payment_id || !order.stripe_checkout_session_id,
      instruction: 'Treat webhookUrl as a credential. After checking AMS payment/session identities, update the existing delivery endpoint in AMS and replay the original event. Do not create a new payment.',
    });
  } catch (error) {
    return json({ error: { code: error instanceof RelayError ? error.code : 'AMS_RELAY_RECOVERY_FAILED' } },
      error instanceof RelayError ? error.status : 503);
  }
}
