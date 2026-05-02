import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../../../../db';

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const id = params.id;
  const ct = request.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  if (!id) {
    if (isJson) return Response.json({ error: 'missing id' }, { status: 400 });
    return redirect('/admin/subscribers?error=missing+id', 303);
  }

  const db = getDbInstance();
  await db.delete(subscribers).where(eq(subscribers.id, id));

  if (isJson) return Response.json({ ok: true }, { status: 200 });
  return redirect('/admin/subscribers?saved=1', 303);
};
