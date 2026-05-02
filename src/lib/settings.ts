import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDbInstance, settings } from '../db';

export type Settings = {
  clientName: string;
  clientTagline: string;
  clientLogoUrl: string;
  clientFaviconUrl: string;
  emailFromLocal: string;
  aboutBodyEn: string;
  aboutBodyPt: string;
  // Light theme colors
  themePrimaryColor: string;
  colorBgLight: string;
  colorHeaderBgLight: string;
  colorHeadingLight: string;
  colorTextLight: string;
  colorMutedLight: string;
  colorBorderLight: string;
  // Dark theme colors
  colorBgDark: string;
  colorHeaderBgDark: string;
  colorHeadingDark: string;
  colorTextDark: string;
  colorMutedDark: string;
  colorBorderDark: string;
};

export const SETTING_KEYS = [
  'clientName',
  'clientTagline',
  'clientLogoUrl',
  'clientFaviconUrl',
  'emailFromLocal',
  'aboutBodyEn',
  'aboutBodyPt',
  'themePrimaryColor',
  'colorBgLight',
  'colorHeaderBgLight',
  'colorHeadingLight',
  'colorTextLight',
  'colorMutedLight',
  'colorBorderLight',
  'colorBgDark',
  'colorHeaderBgDark',
  'colorHeadingDark',
  'colorTextDark',
  'colorMutedDark',
  'colorBorderDark',
] as const satisfies readonly (keyof Settings)[];

export type SettingKey = (typeof SETTING_KEYS)[number];

export const COLOR_KEYS = [
  'themePrimaryColor',
  'colorBgLight',
  'colorHeaderBgLight',
  'colorHeadingLight',
  'colorTextLight',
  'colorMutedLight',
  'colorBorderLight',
  'colorBgDark',
  'colorHeaderBgDark',
  'colorHeadingDark',
  'colorTextDark',
  'colorMutedDark',
  'colorBorderDark',
] as const satisfies readonly SettingKey[];

export type ColorKey = (typeof COLOR_KEYS)[number];

const FALLBACKS: Settings = {
  clientName: 'EdgePress',
  clientTagline: '',
  clientLogoUrl: '',
  clientFaviconUrl: '',
  emailFromLocal: 'noreply',
  aboutBodyEn: '{name} is a newsletter and blog. Subscribe to receive new posts in your inbox.',
  aboutBodyPt: '{name} é uma newsletter e blog. Assine para receber novas publicações na sua caixa de entrada.',
  themePrimaryColor: '#FF0040',
  // Defaults match the previous hard-coded values in src/styles/global.css.
  colorBgLight: '#FFFFFF',
  colorHeaderBgLight: '#FFFFFF',
  colorHeadingLight: '#0F1219',
  colorTextLight: '#222939',
  colorMutedLight: '#60739F',
  colorBorderLight: '#E5E9F0',
  colorBgDark: '#0F1119',
  colorHeaderBgDark: '#1B1E2D',
  colorHeadingDark: '#F0F3FA',
  colorTextDark: '#C8D2E6',
  colorMutedDark: '#8291AF',
  colorBorderDark: '#262B3C',
};

// Optional seed-fallback env-var name for each setting. Vars may or may not be
// in wrangler.jsonc; we look them up by string against an unknown-cast env bag.
// emailFromLocal has no env fallback (the legacy EMAIL_FROM_ADDRESS was a full
// address, not a local-part).
const ENV_KEY: Partial<Record<SettingKey, string>> = {
  clientName: 'CLIENT_NAME',
  clientTagline: 'CLIENT_TAGLINE',
  clientLogoUrl: 'CLIENT_LOGO_URL',
  clientFaviconUrl: 'CLIENT_FAVICON_URL',
  themePrimaryColor: 'THEME_PRIMARY_COLOR',
};

const envValue = (key: SettingKey): string => {
  const name = ENV_KEY[key];
  if (!name) return '';
  const v = (env as unknown as Record<string, string | undefined>)[name];
  return typeof v === 'string' ? v : '';
};

export const loadSettings = async (): Promise<Settings> => {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await getDbInstance()
      .select({ key: settings.key, value: settings.value })
      .from(settings);
  } catch {
    // Settings table may not exist yet (e.g. fresh deploy before migration). Fall back gracefully.
    rows = [];
  }
  const dbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const out = {} as Settings;
  for (const key of SETTING_KEYS) {
    out[key] = (dbMap[key]?.trim() || envValue(key).trim() || FALLBACKS[key]) as string;
  }
  return out;
};

export const saveSettings = async (patch: Partial<Settings>): Promise<void> => {
  const db = getDbInstance();
  const now = new Date();
  for (const key of SETTING_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value === '') {
      // Empty ⇒ revert to env fallback by removing the override row.
      await db.delete(settings).where(eq(settings.key, key));
      continue;
    }
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  }
};

// Convert "#RRGGBB" / "#RGB" to "r, g, b" tuple string, suitable for use in
// `rgb(var(--token))` / `rgba(var(--token), x%)` in global.css.
export const hexToRgbTuple = (hex: string): string => {
  const m = hex.trim().replace(/^#/, '');
  const expand = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(expand)) return '0, 0, 0';
  const n = parseInt(expand, 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
};
