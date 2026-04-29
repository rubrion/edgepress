// @ts-check

import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

const clientDomain = process.env.CLIENT_DOMAIN ?? 'example.com';
const clientFont = process.env.CLIENT_FONT?.trim();

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
