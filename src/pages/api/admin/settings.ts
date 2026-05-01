import type { APIRoute } from 'astro';
import { COLOR_KEYS, type Settings, SETTING_KEYS, saveSettings } from '../../../lib/settings';

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
// RFC 5322-ish local-part: letters, digits, and `._%+-`. No `@`, no spaces.
const EMAIL_LOCAL = /^[A-Za-z0-9._%+-]+$/;

const validate = (patch: Partial<Settings>): { ok: true } | { ok: false; error: string } => {
  for (const key of COLOR_KEYS) {
    const v = patch[key];
    if (v && !HEX_COLOR.test(v)) {
      return { ok: false, error: `${key} must be a hex color like #1a2b3f` };
    }
  }
  if (patch.emailFromLocal && !EMAIL_LOCAL.test(patch.emailFromLocal)) {
    return { ok: false, error: 'emailFromLocal must contain only letters, digits, and ._%+- (no @ or spaces)' };
  }
  return { ok: true };
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') ?? '';

  let patch: Partial<Settings> = {};
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const k of SETTING_KEYS) {
      const v = body[k];
      if (typeof v === 'string') patch[k] = v;
    }
  } else {
    const form = await request.formData();
    for (const k of SETTING_KEYS) {
      const v = form.get(k);
      if (typeof v === 'string') patch[k] = v;
    }
  }

  const v = validate(patch);
  if (!v.ok) {
    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/admin/settings?error=${encodeURIComponent(v.error)}`, 303);
  }

  await saveSettings(patch);

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect('/admin/settings?saved=1', 303);
};
