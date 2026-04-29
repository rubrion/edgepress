import type { AstroCookies } from 'astro';

export const ADMIN_COOKIE = 'edgepress_admin';

export const isAdminAuthed = (
  request: Request,
  cookies: AstroCookies,
  masterKey: string | undefined,
): boolean => {
  if (!masterKey) return false;
  const cookieValue = cookies.get(ADMIN_COOKIE)?.value;
  if (cookieValue && cookieValue === masterKey) return true;
  const auth = request.headers.get('authorization');
  if (auth && auth === `Bearer ${masterKey}`) return true;
  return false;
};

export const buildAdminCookie = (key: string, prod: boolean): string => {
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000'];
  if (prod) flags.push('Secure');
  return `${ADMIN_COOKIE}=${encodeURIComponent(key)}; ${flags.join('; ')}`;
};

export const buildAdminLogoutCookie = (prod: boolean): string => {
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (prod) flags.push('Secure');
  return `${ADMIN_COOKIE}=; ${flags.join('; ')}`;
};
