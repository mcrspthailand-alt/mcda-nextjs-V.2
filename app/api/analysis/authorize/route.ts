import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { authorizeAnalysis } from '@/lib/membership';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบใหม่' } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_REQUEST', message: 'Request body ไม่ถูกต้อง' } },
      { status: 400 },
    );
  }

  try {
    const models = typeof body === 'object' && body !== null && 'models' in body
      ? (body as { models?: unknown }).models
      : undefined;
    const result = await authorizeAnalysis(user.id, models);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: result.code,
            message: result.message,
            lockedModels: result.lockedModels ?? [],
          },
          entitlements: result.entitlements,
        },
        { status: result.status },
      );
    }

    return NextResponse.json(
      { ok: true, entitlements: result.entitlements },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to authorize MCDA analysis', error);
    return NextResponse.json(
      { ok: false, error: { code: 'AUTHORIZATION_FAILED', message: 'ไม่สามารถตรวจสอบโควตาการวิเคราะห์ได้' } },
      { status: 500 },
    );
  }
}
