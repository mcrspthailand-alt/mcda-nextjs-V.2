import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const serviceUrl = process.env.MCDA_ADVISOR_SERVICE_URL?.replace(/\/+$/, '');
  const hasSecret = Boolean(process.env.MCDA_ADVISOR_SERVICE_SECRET);

  let remoteHealth = false;
  let remoteStatus: number | null = null;

  if (serviceUrl) {
    try {
      const response = await fetch(`${serviceUrl}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      remoteStatus = response.status;
      remoteHealth = response.ok;
    } catch {
      remoteHealth = false;
    }
  }

  return NextResponse.json(
    {
      configured: Boolean(serviceUrl && hasSecret),
      serviceUrlConfigured: Boolean(serviceUrl),
      serviceSecretConfigured: hasSecret,
      remoteHealth,
      remoteStatus,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
