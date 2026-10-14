import { NextResponse } from 'next/server';
import { benefitsConfig } from '@/lib/membership-benefits-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  // Public promotion settings only: never expose ENV contents, user eligibility,
  // account IDs, administrator emails, database settings, or credentials here.
  try {
    return NextResponse.json({
      status: 'ok', service: 'mcda-nextjs-v2',
      release: 'trial-redeem-ui-20261014', membership: benefitsConfig(),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ status: 'degraded', service: 'mcda-nextjs-v2', code: 'BENEFITS_CONFIG_INVALID' }, {
      status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
