import type { APIRoute } from 'astro';
import { type Settings, SETTING_KEYS, saveSettings } from '../../../lib/settings';

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validate = (patch: Partial<Settings>): { ok: true } | { ok: false; error: string } => {
  if (patch.themePrimaryColor && !HEX_COLOR.test(patch.themePrimaryColor)) {
    return { ok: false, error: 'themePrimaryColor must be a hex like #1a2b3f' };
  }
  if (patch.emailFromAddress && !EMAIL.test(patch.emailFromAddress)) {
    return { ok: false, error: 'emailFromAddress must be a valid email' };
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
