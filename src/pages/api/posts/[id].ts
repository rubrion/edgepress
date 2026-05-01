import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDbInstance, campaigns, posts } from '../../../db';

const extractOwnedMediaKeys = (md: string, base: string, slug: string): string[] => {
  if (!base || !slug) return [];
  const escapedBase = base.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedBase}/(edgepress/${slug}/[A-Za-z0-9._/-]+)`, 'g');
  const keys = new Set<string>();
  for (const m of md.matchAll(re)) keys.add(m[1]);
  return Array.from(keys);
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const db = getDbInstance();
  const [post] = await db
    .select({ id: posts.id, contentMd: posts.contentMd })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  if (!post) return Response.json({ error: 'not found' }, { status: 404 });

  // Best-effort R2 cleanup — never block post deletion on storage errors.
  const e = env as unknown as {
    MEDIA?: R2Bucket;
    MEDIA_PUBLIC_BASE?: string;
    CLIENT_SLUG?: string;
  };
  const keys = extractOwnedMediaKeys(
    post.contentMd,
    (e.MEDIA_PUBLIC_BASE ?? '').replace(/\/$/, ''),
    e.CLIENT_SLUG ?? '',
  );
  if (e.MEDIA && keys.length > 0) {
    await Promise.allSettled(keys.map((k) => e.MEDIA!.delete(k)));
  }

  // Drop campaigns first to satisfy the FK; then the post itself.
  await db.delete(campaigns).where(eq(campaigns.postId, id));
  await db.delete(posts).where(eq(posts.id, id));
  return Response.json({ ok: true, mediaDeleted: keys.length });
};
