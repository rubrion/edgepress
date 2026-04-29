import type { APIRoute } from 'astro';
import { buildAdminLogoutCookie } from '../../../lib/auth';

export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 303,
    headers: {
      'Set-Cookie': buildAdminLogoutCookie(import.meta.env.PROD),
      Location: '/admin/login',
    },
  });
};
