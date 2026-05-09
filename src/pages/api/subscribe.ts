import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../db';
import { loadSettings } from '../../lib/settings';
import { matchAllowedOrigin, corsHeaders } from '../../lib/cors';
import { isTurnstileEnabled, verifyTurnstile } from '../../lib/turnstile';
import { sendConfirmationEmail } from '../../lib/confirm-email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

const json = (
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

export const OPTIONS: APIRoute = async ({ request }) => {
  const settings = await loadSettings();
  const match = matchAllowedOrigin(request.headers.get('origin'), settings.widgetAllowedOrigins);
  return new Response(null, { status: 204, headers: corsHeaders(match) });
};

export const POST: APIRoute = async ({ request }) => {
  const settings = await loadSettings();
  const match = matchAllowedOrigin(request.headers.get('origin'), settings.widgetAllowedOrigins);
  const cors = corsHeaders(match);

  let email: string | undefined;
  let turnstileToken: string | null = null;
  let honeypot: string | null = null;
  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const body = (await request.json()) as { email?: string; turnstile?: string; website?: string };
      email = body.email;
      turnstileToken = body.turnstile ?? null;
      honeypot = body.website ?? null;
    } else {
      const form = await request.formData();
      const v = form.get('email');
      if (typeof v === 'string') email = v;
      const t = form.get('cf-turnstile-response') ?? form.get('turnstile');
      if (typeof t === 'string') turnstileToken = t;
      const hp = form.get('website');
      if (typeof hp === 'string') honeypot = hp;
    }
  } catch {
    return json({ error: 'invalid body' }, 400, cors);
  }

  // Honeypot — silently succeed so bots don't probe.
  if (honeypot && honeypot.trim() !== '') {
    return json({ ok: true }, 200, cors);
  }

  email = email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: 'invalid email' }, 400, cors);
  }

  if (isTurnstileEnabled(env)) {
    const remoteIp =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null;
    const verdict = await verifyTurnstile({ env, token: turnstileToken, remoteIp });
    if (!verdict.ok) return json({ error: verdict.error }, 400, cors);
  }

  const db = getDbInstance();
  const clientDomain = (env as unknown as { CLIENT_DOMAIN?: string }).CLIENT_DOMAIN ?? '';
  const origin = clientDomain ? `https://${clientDomain}` : new URL(request.url).origin;

  const [existing] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  // Already active — don't email again, idempotent success.
  if (existing && existing.status === 'active') {
    return json({ ok: true, alreadyActive: true }, 200, cors);
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIRM_TTL_MS);

  if (existing) {
    await db
      .update(subscribers)
      .set({
        status: 'pending',
        confirmToken: token,
        confirmTokenExpiresAt: expires,
      })
      .where(eq(subscribers.email, email));
  } else {
    await db.insert(subscribers).values({
      email,
      status: 'pending',
      confirmToken: token,
      confirmTokenExpiresAt: expires,
    });
  }

  const confirmUrl = `${origin}/api/subscribe/confirm?token=${token}`;
  try {
    await sendConfirmationEmail({ env, settings, to: email, confirmUrl });
  } catch (err) {
    // Don't leak the address back if email fails — caller will retry.
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: 'could not send confirmation email', detail: msg }, 502, cors);
  }

  return json({ ok: true, pending: true }, 200, cors);
};
