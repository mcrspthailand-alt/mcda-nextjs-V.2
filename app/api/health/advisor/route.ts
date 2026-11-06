import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_OLLAMA_URL = 'http://ams_mcda-advisor-ollama:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3:4b';

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

  const localUrl = (process.env.MCDA_LOCAL_LLM_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const localModel = process.env.MCDA_LOCAL_LLM_MODEL || DEFAULT_OLLAMA_MODEL;
  let localHealth = false;
  let localStatus: number | null = null;
  let localModelAvailable = false;

  try {
    const response = await fetch(`${localUrl}/api/tags`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    localStatus = response.status;
    localHealth = response.ok;

    if (response.ok) {
      const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      localModelAvailable = Boolean(
        payload.models?.some((item) => item.name === localModel || item.model === localModel),
      );
    }
  } catch {
    localHealth = false;
  }

  return NextResponse.json(
    {
      configured: Boolean((serviceUrl && hasSecret) || localHealth),
      primary: serviceUrl && hasSecret ? 'remote-with-local-fallback' : 'local',
      remote: {
        configured: Boolean(serviceUrl && hasSecret),
        health: remoteHealth,
        status: remoteStatus,
      },
      local: {
        configured: true,
        health: localHealth,
        status: localStatus,
        model: localModel,
        modelAvailable: localModelAvailable,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
