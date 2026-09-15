import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

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

// SHA-256 of the known-good gzip regenerated from
// MCDA_MultiMethod_DynamicSelectedModelPDF_v26.html.
const EXPECTED_GZIP_SHA256 = 'f35840c13cdf13f486f0a11050e925ecde38c70bf95d342803dbb3c3713cbe3a';

let cachedEngineSource: string | null = null;

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

  cachedEngineSource = source;
  return source;
}

export async function GET() {
  try {
    const source = await getEngineSource();

    return new Response(source, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'X-MCDA-Engine-Version': '26',
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
