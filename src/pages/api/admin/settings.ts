import type { APIRoute } from 'astro';
import { COLOR_KEYS, type Settings, SETTING_KEYS, saveSettings } from '../../../lib/settings';

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
// RFC 5322-ish local-part: letters, digits, and `._%+-`. No `@`, no spaces.
const EMAIL_LOCAL = /^[A-Za-z0-9._%+-]+$/;

const CSS_LENGTH = /^\d+(\.\d+)?(px|rem|em|%|vw|vh)?$/;

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
  if (patch.widgetDefaultTheme && !['auto', 'light', 'dark'].includes(patch.widgetDefaultTheme)) {
    return { ok: false, error: 'widgetDefaultTheme must be auto, light, or dark' };
  }
  if (patch.widgetDefaultLimit) {
    const n = parseInt(patch.widgetDefaultLimit, 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return { ok: false, error: 'widgetDefaultLimit must be an integer between 1 and 50' };
    }
  }
  if (patch.widgetShowDate && !['0', '1'].includes(patch.widgetShowDate)) {
    return { ok: false, error: 'widgetShowDate must be 0 or 1' };
  }
  if (patch.widgetShowExcerpts && !['0', '1'].includes(patch.widgetShowExcerpts)) {
    return { ok: false, error: 'widgetShowExcerpts must be 0 or 1' };
  }
  if (patch.widgetHideWatermark && !['0', '1'].includes(patch.widgetHideWatermark)) {
    return { ok: false, error: 'widgetHideWatermark must be 0 or 1' };
  }
  if (patch.widgetMaxWidth && !CSS_LENGTH.test(patch.widgetMaxWidth)) {
    return { ok: false, error: 'widgetMaxWidth must be a CSS length like 720px or 100%' };
  }
  if (patch.widgetAccentOverride && !HEX_COLOR.test(patch.widgetAccentOverride)) {
    return { ok: false, error: 'widgetAccentOverride must be a hex color like #1a2b3f' };
  }
  if (patch.widgetAllowedOrigins) {
    const trimmed = patch.widgetAllowedOrigins.trim();
    if (trimmed !== '*') {
      const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        try {
          const u = new URL(p);
          if (!['http:', 'https:'].includes(u.protocol)) {
            return { ok: false, error: `widgetAllowedOrigins entry "${p}" must be http(s)` };
          }
          if (u.pathname !== '/' && u.pathname !== '') {
            return { ok: false, error: `widgetAllowedOrigins entry "${p}" must be an origin (no path)` };
          }
        } catch {
          return { ok: false, error: `widgetAllowedOrigins entry "${p}" is not a valid origin` };
        }
      }
    }
  }
  return { ok: true };
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') ?? '';

  let patch: Partial<Settings> = {};
  let redirectPath = '/admin/settings';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const k of SETTING_KEYS) {
      const v = body[k];
      if (typeof v === 'string') patch[k] = v;
    }
  } else {
    const form = await request.formData();
    for (const k of SETTING_KEYS) {
      // Use the last value so the `<input type=hidden>` + `<input type=checkbox>`
      // idiom (both sharing a name) yields the checkbox's value when checked,
      // and the hidden fallback ("0") when unchecked.
      const all = form.getAll(k);
      const v = all.length ? all[all.length - 1] : null;
      if (typeof v === 'string') patch[k] = v;
    }
    const r = form.get('_redirect');
    if (typeof r === 'string' && /^\/admin\/[A-Za-z0-9_-]+$/.test(r)) {
      redirectPath = r;
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
    return redirect(`${redirectPath}?error=${encodeURIComponent(v.error)}`, 303);
  }

  await saveSettings(patch);

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect(`${redirectPath}?saved=1`, 303);
};
