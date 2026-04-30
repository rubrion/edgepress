// @ts-check

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Read a single var from wrangler.jsonc by key — avoids full JSONC parsing
// (full parse breaks on https:// URLs being mistaken for comments).
// wrangler vars are CF Worker runtime values — process.env doesn't carry them.
function wranglerVar(key) {
  try {
    const path = fileURLToPath(new URL('./wrangler.jsonc', import.meta.url));
    const raw = readFileSync(path, 'utf-8');
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"` ));
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

const clientDomain = process.env.CLIENT_DOMAIN || wranglerVar('CLIENT_DOMAIN') || 'example.com';
const clientFont = (process.env.CLIENT_FONT || wranglerVar('CLIENT_FONT')).trim();

const fontConfig = clientFont
  ? {
      provider: fontProviders.google(),
      name: clientFont,
      cssVariable: '--font-atkinson',
      fallbacks: ['sans-serif'],
      weights: [400, 700],
      styles: ['normal'],
    }
  : {
      provider: fontProviders.local(),
      name: 'Atkinson',
      cssVariable: '--font-atkinson',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/atkinson-regular.woff'],
            weight: 400,
            style: 'normal',
            display: 'swap',
          },
          {
            src: ['./src/assets/fonts/atkinson-bold.woff'],
            weight: 700,
            style: 'normal',
            display: 'swap',
          },
        ],
      },
    };

// https://astro.build/config
export default defineConfig({
  site: `https://${clientDomain}`,
  output: 'server',
  integrations: [mdx(), react(), sitemap()],

  fonts: [fontConfig],

  adapter: cloudflare(),
});
