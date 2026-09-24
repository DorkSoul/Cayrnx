#!/usr/bin/env node
// `pnpm icons`: renders the PNG app icons in apps/web/public from the cairn in favicon.svg
// (Android and iOS want PNGs for the home-screen icon). Rerun after changing the mark.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Browsers live in .dev/ms-playwright (dev boundary), as for the E2E tests.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(REPO, '.dev', 'ms-playwright');
const { chromium } = await import('@playwright/test'); // after the env var: Playwright reads it on load

const PUB = path.join(REPO, 'apps', 'web', 'public');
const BG = '#15181b';
const CAIRN = '<g fill="#e3a857"><ellipse cx="12" cy="18.6" rx="8" ry="3"/><ellipse cx="11.2" cy="12.4" rx="5.6" ry="2.6"/><ellipse cx="12.4" cy="7" rx="3.4" ry="2.1"/></g>';

// rounded: the favicon as is (transparent corners). square: full bleed, the OS rounds it.
// maskable: full bleed with the cairn shrunk into the central safe zone, since Android crops it to any shape.
const svg = (kind) => {
  if (kind === 'rounded') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${BG}"/>${CAIRN}</svg>`;
  const k = kind === 'maskable' ? 0.62 : 0.86;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${BG}"/><g transform="translate(12 12) scale(${k}) translate(-12 -13.25)">${CAIRN}</g></svg>`;
};

const icons = [
  ['icon-192.png', 192, 'rounded'],
  ['icon-512.png', 512, 'rounded'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'square'],
];

const browser = await chromium.launch();
try {
  for (const [file, size, kind] of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const html = `<html><body style="margin:0;background:transparent">${svg(kind).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: path.join(PUB, file), omitBackground: true });
    await page.close();
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
