import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../../db';

const tokenLooksValid = (t: string | null): t is string =>
  !!t && /^[a-f0-9]{32,128}$/i.test(t);

const htmlPage = (title: string, message: string, accent = '#FF0040'): Response =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,Segoe UI,sans-serif;background:#f5f5f7;margin:0;min-height:100vh;display:grid;place-items:center;color:#1a1a1a;}
.card{background:#fff;padding:2rem 2.5rem;border-radius:12px;border-top:4px solid ${accent};box-shadow:0 8px 24px rgba(0,0,0,0.06);max-width:420px;text-align:center;}
h1{margin:0 0 0.5rem;font-size:1.25rem;}p{margin:0;color:#555;font-size:0.95rem;line-height:1.5;}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!tokenLooksValid(token)) {
    return htmlPage('Invalid link', 'This confirmation link is malformed.');
  }

  const db = getDbInstance();
  const [row] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.confirmToken, token))
    .limit(1);

  if (!row) {
    return htmlPage('Link not found', 'This confirmation link is invalid or has already been used.');
  }
  if (row.status === 'unsubscribed') {
    return htmlPage('Unsubscribed', 'This email has previously unsubscribed. Subscribe again to receive emails.');
  }
  if (row.confirmTokenExpiresAt && row.confirmTokenExpiresAt.getTime() < Date.now()) {
    return htmlPage('Link expired', 'This confirmation link has expired. Please subscribe again to get a fresh link.');
  }

  await db
    .update(subscribers)
    .set({
      status: 'active',
      confirmedAt: new Date(),
      confirmToken: null,
      confirmTokenExpiresAt: null,
    })
    .where(eq(subscribers.id, row.id));

  return htmlPage('Subscription confirmed', 'You will now receive new posts in your inbox.');
};
