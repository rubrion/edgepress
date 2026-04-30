import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDbInstance, subscribers } from '../../db';

// Handles both one-click POST (List-Unsubscribe-Post) and GET (link click)
export const GET: APIRoute = async ({ url, redirect }) => {
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const db = getDbInstance();
  await db
    .update(subscribers)
    .set({ status: 'unsubscribed' })
    .where(eq(subscribers.id, id));

  return redirect('/?unsubscribed=1', 302);
};

export const POST: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const db = getDbInstance();
  await db
    .update(subscribers)
    .set({ status: 'unsubscribed' })
    .where(eq(subscribers.id, id));

  return new Response('Unsubscribed', { status: 200 });
};
