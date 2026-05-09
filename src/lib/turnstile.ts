// Cloudflare Turnstile token verification.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// Returns:
//  - { ok: true }  when verification succeeds OR Turnstile is not configured
//    for this tenant (so the feature is opt-in by setting TURNSTILE_SECRET).
//  - { ok: false, error } on bad/missing token when configured.

type Env = { TURNSTILE_SECRET?: string };

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export const isTurnstileEnabled = (env: unknown): boolean => {
  const e = env as Env;
  return typeof e.TURNSTILE_SECRET === 'string' && e.TURNSTILE_SECRET.length > 0;
};

export const verifyTurnstile = async ({
  env,
  token,
  remoteIp,
}: {
  env: unknown;
  token: string | null;
  remoteIp?: string | null;
}): Promise<TurnstileResult> => {
  const e = env as Env;
  if (!e.TURNSTILE_SECRET) return { ok: true };
  if (!token) return { ok: false, error: 'turnstile token required' };

  const form = new FormData();
  form.append('secret', e.TURNSTILE_SECRET);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  let res: Response;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
  } catch {
    return { ok: false, error: 'turnstile network error' };
  }
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    'error-codes'?: string[];
  };
  if (data.success) return { ok: true };
  return {
    ok: false,
    error: `turnstile failed: ${(data['error-codes'] ?? []).join(',') || 'unknown'}`,
  };
};
