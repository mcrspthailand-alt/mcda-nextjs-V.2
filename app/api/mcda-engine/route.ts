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

  const compressed = Buffer.from(chunks.join(''), 'base64');
  if (!compressed.length) throw new Error('MCDA engine payload is empty');

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
