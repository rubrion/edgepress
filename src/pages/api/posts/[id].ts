import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDbInstance, campaigns, posts } from '../../../db';

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const db = getDbInstance();
  // Drop campaigns first to satisfy the FK; then the post itself.
  await db.delete(campaigns).where(eq(campaigns.postId, id));
  const result = await db.delete(posts).where(eq(posts.id, id)).returning();
  if (result.length === 0) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
};
