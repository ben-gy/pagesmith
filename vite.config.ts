// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pagesmith',
        short_name: 'Pagesmith',
        description:
          'Merge, split, reorder, rotate and delete PDF pages entirely in your browser. No uploads.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // pdf.js worker + wasm can be large; raise the precache ceiling.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,mjs,wasm}'],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Avoid Vite's inline module-preload polyfill so a strict script-src 'self' CSP holds.
    modulePreload: { polyfill: false },
  },
  worker: {
    format: 'es',
  },
});
