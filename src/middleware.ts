import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { isAdminAuthed } from './lib/auth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/login']);

const requiresAdmin = (path: string): boolean => {
  if (PUBLIC_ADMIN_PATHS.has(path)) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (path === '/api/publish') return true;
  if (path === '/api/media/upload') return true;
  if (path.startsWith('/api/posts/')) return true;
  if (path.startsWith('/api/admin/')) return true;
  return false;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, cookies, redirect } = context;
  if (!requiresAdmin(url.pathname)) return next();

  const masterKey = (env as unknown as { MASTER_ADMIN_KEY?: string }).MASTER_ADMIN_KEY;
  if (isAdminAuthed(request, cookies, masterKey)) return next();

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect('/admin/login');
});
