import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const MAX_BYTES = 50 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const e = env as unknown as {
    MEDIA?: R2Bucket;
    CLIENT_SLUG?: string;
    MEDIA_PUBLIC_BASE?: string;
  };
  if (!e.MEDIA) return json({ error: 'media bucket not bound' }, 500);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'expected multipart/form-data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'missing file' }, 400);

  const ext = MIME_TO_EXT[file.type];
  if (!ext) return json({ error: `unsupported type: ${file.type || 'unknown'}` }, 415);
  if (file.size > MAX_BYTES) return json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 413);

  const slug = (e.CLIENT_SLUG ?? 'default').trim() || 'default';
  const now = new Date();
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `edgepress/${slug}/${yyyyMm}/${crypto.randomUUID()}.${ext}`;

  await e.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const base = (e.MEDIA_PUBLIC_BASE ?? '').replace(/\/$/, '');
  const url = base ? `${base}/${key}` : `/${key}`;
  const kind = file.type.startsWith('video/') ? 'video' : 'image';

  return json({ url, key, kind, size: file.size });
};
