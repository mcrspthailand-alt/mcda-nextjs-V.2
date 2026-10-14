import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { createMembershipCode, listMembershipCodes, setMembershipCodeActive } from '@/lib/membership-benefits';
import { BenefitError } from '@/lib/membership-benefits-config';
import { benefitsFailure, benefitsJson, readBenefitJson } from '@/lib/membership-benefits-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
    const params = new URL(request.url).searchParams;
    return benefitsJson(await listMembershipCodes(user, Number(params.get('page') || '1'), params.get('codeId') || undefined));
  } catch (error) { return benefitsFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
    const input = await readBenefitJson(request);
    return benefitsJson({ code: await createMembershipCode(user, input) }, 201);
  } catch (error) { return benefitsFailure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
    const input = await readBenefitJson(request);
    return benefitsJson({ code: await setMembershipCodeActive(user, input.id, input.active) });
  } catch (error) { return benefitsFailure(error); }
}
