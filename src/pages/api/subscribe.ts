import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  let email: string | undefined;
  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const body = (await request.json()) as { email?: string };
      email = body.email;
    } else {
      const form = await request.formData();
      const v = form.get('email');
      if (typeof v === 'string') email = v;
    }
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  email = email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid email' }, { status: 400 });
  }

  const db = getDbInstance();
  await db
    .insert(subscribers)
    .values({ email })
    .onConflictDoUpdate({
      target: subscribers.email,
      set: { status: sql`'active'` },
    });

  return Response.json({ ok: true }, { status: 200 });
};
