import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../../../../db';

const VALID = new Set(['active', 'unsubscribed']);

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const id = params.id;
  const ct = request.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  if (!id) {
    if (isJson) return Response.json({ error: 'missing id' }, { status: 400 });
    return redirect('/admin/subscribers?error=missing+id', 303);
  }

  let status: string | undefined;
  try {
    if (isJson) {
      const body = (await request.json()) as { status?: string };
      status = body.status;
    } else {
      const form = await request.formData();
      const v = form.get('status');
      if (typeof v === 'string') status = v;
    }
  } catch {
    if (isJson) return Response.json({ error: 'invalid body' }, { status: 400 });
    return redirect('/admin/subscribers?error=invalid+body', 303);
  }

  if (!status || !VALID.has(status)) {
    if (isJson) return Response.json({ error: 'invalid status' }, { status: 400 });
    return redirect('/admin/subscribers?error=invalid+status', 303);
  }

  const db = getDbInstance();
  await db
    .update(subscribers)
    .set({ status: status as 'active' | 'unsubscribed' })
    .where(eq(subscribers.id, id));

  if (isJson) return Response.json({ ok: true }, { status: 200 });
  return redirect('/admin/subscribers?saved=1', 303);
};
