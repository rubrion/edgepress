import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDbInstance, settings } from '../db';

export type Settings = {
  clientName: string;
  clientTagline: string;
  clientLogoUrl: string;
  clientFaviconUrl: string;
  themePrimaryColor: string;
  emailFromAddress: string;
};

export const SETTING_KEYS = [
  'clientName',
  'clientTagline',
  'clientLogoUrl',
  'clientFaviconUrl',
  'themePrimaryColor',
  'emailFromAddress',
] as const satisfies readonly (keyof Settings)[];

export type SettingKey = (typeof SETTING_KEYS)[number];

const FALLBACKS: Settings = {
  clientName: 'EdgePress',
  clientTagline: '',
  clientLogoUrl: '',
  clientFaviconUrl: '',
  themePrimaryColor: '#FF0040',
  emailFromAddress: '',
};

// Optional seed-fallback env-var name for each setting. These vars may or may
// not be present in wrangler.jsonc — `Env` only includes those that are, so we
// look them up by string against an unknown-cast env bag.
const ENV_KEY: Record<SettingKey, string> = {
  clientName: 'CLIENT_NAME',
  clientTagline: 'CLIENT_TAGLINE',
  clientLogoUrl: 'CLIENT_LOGO_URL',
  clientFaviconUrl: 'CLIENT_FAVICON_URL',
  themePrimaryColor: 'THEME_PRIMARY_COLOR',
  emailFromAddress: 'EMAIL_FROM_ADDRESS',
};

const envValue = (key: SettingKey): string => {
  const v = (env as unknown as Record<string, string | undefined>)[ENV_KEY[key]];
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
