import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { claimTrial, getMembershipBenefits, redeemMembershipCode } from '@/lib/membership-benefits';
import { BenefitError } from '@/lib/membership-benefits-config';
import { benefitsFailure, benefitsJson, readBenefitJson } from '@/lib/membership-benefits-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
    return benefitsJson(await getMembershipBenefits(user));
  } catch (error) { return benefitsFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
    const input = await readBenefitJson(request);
    if (input.action === 'trial') return benefitsJson({ ok: true, ...await claimTrial(user) });
    if (input.action === 'redeem') return benefitsJson({ ok: true, ...await redeemMembershipCode(user, input.code) });
    throw new BenefitError('INVALID_ACTION', 'รายการที่ขอไม่ถูกต้อง');
  } catch (error) { return benefitsFailure(error); }
}
