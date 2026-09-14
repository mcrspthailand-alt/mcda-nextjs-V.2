import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'mcda-nextjs-v2',
    },
    { status: 200 },
  );
}
