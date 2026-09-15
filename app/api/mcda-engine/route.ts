import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENGINE_PARTS = [
  'part-01.txt',
  'part-02.txt',
  'part-03.txt',
  'part-04.txt',
  'part-05.txt',
  'part-06.txt',
];

// SHA-256 of the known-good v26 gzip payload stored in public/engine-data.
// Membership/quota enforcement is injected only after this integrity check.
const EXPECTED_GZIP_SHA256 = 'f35840c13cdf13f486f0a11050e925ecde38c70bf95d342803dbb3c3713cbe3a';

let cachedEngineSource: string | null = null;

function replaceRequired(source: string, needle: string, replacement: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`MCDA membership patch target not found: ${label}`);
  }
  return source.replace(needle, replacement);
}

function injectMembershipAccessGuard(source: string) {
  let patched = replaceRequired(
    source,
    "const DEFAULT_MODELS = Object.freeze(['topsis','saw','promethee','vikor','moora','waspas','edas']);",
    "const DEFAULT_MODELS = Object.freeze(['topsis','promethee','moora','electre']);",
    'default free models',
  );

  const validationNeedle = "    const err=validate();if(err){toast(err);return;}";
  const authorizationBlock = `${validationNeedle}\n    const accessGuard=globalThis.MCDA_ACCESS_GUARD;\n    if(!accessGuard || typeof accessGuard.authorize!=='function'){\n      toast('ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้ กรุณารีเฟรชหน้าเว็บ');\n      return;\n    }\n    const access=await accessGuard.authorize(selectedModelList());\n    if(!access || access.ok!==true){\n      if(access?.message) toast(access.message);\n      return;\n    }`;

  patched = replaceRequired(
    patched,
    validationNeedle,
    authorizationBlock,
    'analysis authorization hook',
  );

  return patched;
}

async function getEngineSource() {
  if (cachedEngineSource) return cachedEngineSource;

  const engineDirectory = join(process.cwd(), 'public', 'engine-data');
  const chunks = await Promise.all(
    ENGINE_PARTS.map(async (fileName) => {
      const content = await readFile(join(engineDirectory, fileName), 'utf8');
      const chunk = content.trim();
      if (!chunk) throw new Error(`MCDA engine part is empty: ${fileName}`);
      return chunk;
    }),
  );

  const base64 = chunks.join('');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error('MCDA engine payload is not valid base64');
  }

  const compressed = Buffer.from(base64, 'base64');
  if (!compressed.length) throw new Error('MCDA engine payload is empty');

  const gzipSha256 = createHash('sha256').update(compressed).digest('hex');
  if (gzipSha256 !== EXPECTED_GZIP_SHA256) {
    throw new Error(
      `MCDA engine integrity check failed: expected ${EXPECTED_GZIP_SHA256}, received ${gzipSha256}`,
    );
  }

  const source = gunzipSync(compressed).toString('utf8');
  if (!source.trim()) throw new Error('MCDA engine decompressed to an empty script');

  cachedEngineSource = injectMembershipAccessGuard(source);
  return cachedEngineSource;
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return new Response('console.error("Authentication required for MCDA engine");', {
      status: 401,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  try {
    const source = await getEngineSource();

    return new Response(source, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-MCDA-Engine-Version': '28',
      },
    });
  } catch (error) {
    console.error('MCDA engine server bootstrap failed', error);

    return new Response('console.error("MCDA engine could not be prepared by the server");', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
