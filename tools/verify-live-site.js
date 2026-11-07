// Live-site verification: boot the deployed GitHub Pages app in headless
// Chromium and confirm it runs — picker cards + preview assets load, the
// mandelbulb screen boots its WebGL path without errors.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const globalNpm = join(process.env.APPDATA || '', 'npm', 'node_modules');
const { chromium } = require(join(globalNpm, '@playwright/mcp/node_modules/playwright'));

const URL = process.argv[2] || 'https://navid-moradimehr.github.io/FractalBeats/';
const channels = ['chrome', 'msedge', undefined];
let browser = null;
for (const channel of channels) {
  try { browser = await chromium.launch({ headless: true, channel }); break; }
  catch { if (channel === undefined) throw new Error('no browser'); }
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#picker-overlay:not(.hidden)');
await page.waitForTimeout(1200); // let preview videos kick in

const cards = await page.evaluate(() => {
  const c = document.querySelectorAll('.screen-card');
  const videos = [...document.querySelectorAll('.preview-video')];
  return {
    count: c.length,
    names: [...c].map((el) => el.textContent.trim().replace(/\s+/g, ' ').slice(0, 44)),
    order: [...c].map((el) => el.querySelector('.name')?.textContent.trim()),
    hasNote: [...c].map((el) => !!el.querySelector('.note')),
    videosWithPoster: videos.filter((v) => v.poster).length,
    videosWithSrc: videos.filter((v) => v.getAttribute('data-src')).length,
    readyStateOk: videos.filter((v) => v.readyState >= 1).length,
  };
});
console.log('cards:', cards.count, '| order:', cards.order);
console.log('notes on cards:', cards.hasNote.map((h, i) => (h ? cards.order[i] : '-')).join(', '));
console.log('previews: poster', cards.videosWithPoster, '/ src', cards.videosWithSrc, '/ metadata', cards.readyStateOk);

await page.click('.screen-card:nth-child(3)', { force: true }); // mandelbulb is now card #3
await page.waitForTimeout(3000);
const boot = await page.evaluate(() => {
  const app = window.__fractalApp;
  const cv = document.getElementById('c');
  const r = cv.getBoundingClientRect();
  return {
    app: !!app,
    screen: app && app.currentDef ? app.currentDef.id : null,
    webgl: !!app && !!app.renderer,
    canvasVisible: getComputedStyle(cv).display !== 'none',
    size: `${r.width | 0}x${r.height | 0}`,
    uniforms: app && app.current && app.current.uniforms ? Object.keys(app.current.uniforms).length : 0,
  };
});
console.log('boot:', JSON.stringify(boot));
console.log('pageerrors/console errors:', errors.length ? errors : 'none');
const ok =
  !errors.length &&
  cards.count === 4 &&
  cards.order[0] === 'Fractal Tunnel' &&
  cards.order[1] === 'Spectrum Bloom' &&
  cards.order[2] === 'Mandelbulb Nebula' &&
  cards.order[3] === 'Kaleidoscope' &&
  cards.hasNote[2] === true &&
  boot.app && boot.screen === 'mandelbulb' && boot.webgl && boot.canvasVisible && boot.size.startsWith('1280');

// --- SEO checks ---
const seo = await page.evaluate(() => {
  const meta = (name) => document.querySelector(`meta[name="${name}"]`);
  const og = (name) => document.querySelector(`meta[property="${name}"]`);
  const link = (rel) => document.querySelector(`link[rel="${rel}"]`);
  return {
    gscMeta: !!document.querySelector('meta[name="google-site-verification"]'),
    title: document.title.trim(),
    description: meta('description')?.content || '',
    canonical: link('canonical')?.href || '',
    ogTitle: og('og:title')?.content || '',
    ogImage: og('og:image')?.content || '',
    jsonld: document.querySelector('script[type="application/ld+json"]')?.textContent || '',
    bodyText: document.body.textContent || '',
  };
});
const jsonldValid = (() => { try { return JSON.parse(seo.jsonld), true; } catch { return false; } })();
const seoOk =
  seo.gscMeta &&
  seo.description.length > 50 && seo.description.length <= 165 &&
  seo.canonical.startsWith('https://navid-moradimehr.github.io/FractalBeats/') &&
  !!seo.ogTitle && seo.ogImage.includes('og-image.png') &&
  jsonldValid &&
  /Fractal Tunnel/.test(seo.bodyText) &&
  /Mandelbulb Nebula/.test(seo.bodyText) &&
  /Spectrum Bloom/.test(seo.bodyText) &&
  /Kaleidoscope/.test(seo.bodyText) &&
  /heavy on some setups/i.test(seo.bodyText);
console.log('seo: gsc=%s descLen=%d canonical=%s ogImg=%s jsonldValid=%s textHasScreens=%s heavyNote=%s',
  seo.gscMeta, seo.description.length, seo.canonical, seo.ogImage, jsonldValid,
  /Fractal Tunnel/.test(seo.bodyText) && /Mandelbulb Nebula/.test(seo.bodyText), /heavy on some setups/.test(seo.bodyText));

const liveOk = ok && seoOk;
console.log(ok ? 'CARD/SWITCH CHECKS PASSED' : 'CARD/SWITCH CHECKS FAILED');
console.log(seoOk ? 'SEO CHECKS PASSED' : 'SEO CHECKS FAILED');
console.log(liveOk ? 'LIVE CHECK PASSED' : 'LIVE CHECK FAILED');
await browser.close();
process.exit(liveOk ? 0 : 1);