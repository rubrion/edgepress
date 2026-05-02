import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../../../db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const ct = request.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  let email: string | undefined;
  try {
    if (isJson) {
      const body = (await request.json()) as { email?: string };
      email = body.email;
    } else {
      const form = await request.formData();
      const v = form.get('email');
      if (typeof v === 'string') email = v;
    }
  } catch {
    if (isJson) return Response.json({ error: 'invalid body' }, { status: 400 });
    return redirect('/admin/subscribers?error=invalid+body', 303);
  }

  email = email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    if (isJson) return Response.json({ error: 'invalid email' }, { status: 400 });
    return redirect('/admin/subscribers?error=invalid+email', 303);
  }

  const db = getDbInstance();
  await db
    .insert(subscribers)
    .values({ email })
    .onConflictDoUpdate({
      target: subscribers.email,
      set: { status: sql`'active'` },
    });

  if (isJson) return Response.json({ ok: true }, { status: 200 });
  return redirect('/admin/subscribers?saved=1', 303);
};
