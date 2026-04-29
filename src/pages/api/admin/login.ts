import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildAdminCookie } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, url }) => {
  const masterKey = (env as unknown as { MASTER_ADMIN_KEY?: string }).MASTER_ADMIN_KEY;
  if (!masterKey) {
    return new Response('admin disabled (MASTER_ADMIN_KEY unset)', { status: 503 });
  }

  let key: string | undefined;
  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const body = (await request.json()) as { key?: string };
      key = body.key;
    } else {
      const form = await request.formData();
      const v = form.get('key');
      if (typeof v === 'string') key = v;
    }
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  if (!key || key !== masterKey) {
    return Response.redirect(new URL('/admin/login?error=1', url), 303);
  }

  return new Response(null, {
    status: 303,
    headers: {
      'Set-Cookie': buildAdminCookie(masterKey, import.meta.env.PROD),
      Location: '/admin',
    },
  });
};
