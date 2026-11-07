// End-to-end smoke test for the picker / previews / mobile gestures.
// Desktop checks: card-only switching, background click does nothing, previews.
// Mobile emulation (touch): swipe switch, swipe-up picker, top pull-to-refresh,
// settings drawer toggle. Run: node tools/smoke-test.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const globalNpm = join(process.env.APPDATA || '', 'npm', 'node_modules');
const { chromium } = require(join(globalNpm, '@playwright/mcp/node_modules/playwright'));

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8178;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.glsl': 'text/plain', '.svg': 'image/svg+xml', '.webm': 'video/webm',
  '.jpg': 'image/jpeg', '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || !existsSync(file)) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(PORT, r));

const channels = ['chrome', 'msedge', undefined];
let browser = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ headless: true, channel });
    break;
  } catch { if (channel === undefined) throw new Error('no browser'); }
}

let failures = 0;
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

// Dispatch a synthetic touch swipe through the window-level handlers.
const swipe = (page, x0, y0, x1, y1, steps = 12) => page.evaluate(([x0, y0, x1, y1, steps]) => {
  const mk = (x, y, type) => {
    const t = new Touch({ identifier: 1, target: document.elementFromPoint(x, y) || document.body, clientX: x, clientY: y });
    return new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [t],
      targetTouches: type === 'touchend' ? [] : [t],
      changedTouches: [t],
      bubbles: true, cancelable: true,
    });
  };
  window.dispatchEvent(mk(x0, y0, 'touchstart'));
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    window.dispatchEvent(mk(x, y, 'touchmove'));
  }
  window.dispatchEvent(mk(x1, y1, 'touchend'));
}, [x0, y0, x1, y1, steps]);

// ---------- Desktop ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#picker-overlay:not(.hidden)');

  ok((await page.locator('.screen-card').count()) === 6, '6 screen cards rendered');
  ok((await page.locator('.screen-card .preview').count()) === 6, 'every card has a preview area');

  // Order: Fractal Tunnel first, Mandelbulb third (it's the heavy one)
  const order = await page.evaluate(() => [...document.querySelectorAll('.screen-card .name')].map((n) => n.textContent.trim()));
  ok(order[0] === 'Fractal Tunnel' && order[2] === 'Mandelbulb Nebula',
    `card order is tunnel first / mandelbulb third (got: ${order.join(' › ')})`);
  const noteOnCard3 = await page.evaluate(() => document.querySelectorAll('.screen-card')[2]?.querySelector('.note')?.textContent || '');
  ok(/heavy/i.test(noteOnCard3) && noteOnCard3.length > 0, 'mandelbulb card (3) shows a "may be heavy on some setups" note');

  // Clips must play immediately on page load (picker is open)
  const autoPlaying = await page.waitForFunction(() => {
    const vs = [...document.querySelectorAll('.preview-video')];
    return vs.length === 6 && vs.every((v) => v.getAttribute('src')) && vs.every((v) => !v.paused && v.readyState >= 2);
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(autoPlaying, 'preview clips start playing on page load');

  // Click on the picker background (away from cards/title) → nothing may happen
  await page.mouse.click(30, 400);
  await page.waitForTimeout(300);
  ok(await page.locator('#picker-overlay:not(.hidden)').count() === 1, 'background click does NOT close picker / open screen');
  ok((await page.evaluate(() => window.__fractalApp.currentDef)) === null, 'background click does NOT activate a screen');

  // Click on the title → nothing
  await page.mouse.click(640, 60);
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => window.__fractalApp.currentDef)) === null, 'title click does NOT activate a screen');

  // Click card #2 (spectrum) → screen opens
  await page.click('.screen-card:nth-child(2)');
  await page.waitForTimeout(1200);
  const def3 = await page.evaluate(() => window.__fractalApp.currentDef?.id);
  ok(def3 === 'spectrum', 'clicking card 2 activates Spectrum Bloom');

  // Picker reopen via ⊞; previews play while open, pause when hidden
  await page.click('#screens-btn');
  await page.waitForTimeout(300);
  ok(await page.locator('#picker-overlay:not(.hidden)').count() === 1, '⊞ button reopens picker');
  const playing = await page.evaluate(() => [...document.querySelectorAll('.preview-video')].filter((v) => v.getAttribute('src')).every((v) => !v.paused));
  ok(playing, 'preview videos play while picker is open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => [...document.querySelectorAll('.preview-video')].every((v) => v.paused));
  ok(paused, 'preview videos pause when picker is hidden');
  await page.close();
}

// ---------- Mobile emulation (touch) ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#picker-overlay:not(.hidden)');

  ok(await page.locator('#gui-btn').isVisible(), '⚙ settings button visible on mobile');
  ok(!(await page.locator('#fs-btn').isVisible()), 'fullscreen button hidden on mobile');
  const transportPos = await page.evaluate(() => document.querySelector('.transport').getBoundingClientRect().bottom);
  ok(transportPos > 700, 'transport docked at bottom of screen');

  // Background tap (on the subtitle, never a card) does nothing
  const sub = await page.locator('.picker-sub').boundingBox();
  await page.touchscreen.tap(sub.x + sub.width / 2, sub.y + sub.height / 2);
  await page.waitForTimeout(250);
  ok(await page.locator('#picker-overlay:not(.hidden)').count() === 1, 'mobile: background tap does NOT close picker');

  // Activate screen 1 via card (now Fractal Tunnel) → picker closes
  await page.click('.screen-card:nth-child(1)');
  await page.waitForTimeout(1500);
  ok(await page.locator('#picker-overlay.hidden').count() === 1, 'mobile: card tap activates screen and closes picker');
  const card1Def = await page.evaluate(() => window.__fractalApp.currentDef?.id);
  ok(card1Def === 'tunnel', `mobile: card #1 activates Fractal Tunnel (got: ${card1Def})`);

  // Settings drawer toggle (picker closed → ⚙ reachable)
  await page.click('#gui-btn');
  ok(await page.locator('#gui-host.open').count() === 1, '⚙ opens settings drawer');
  await page.click('#gui-btn');
  ok(await page.locator('#gui-host.open').count() === 0, '⚙ closes settings drawer');

  // Swipe left → next screen (spectrum; order is tunnel→spectrum→mandelbulb→kaleidoscope)
  await swipe(page, 320, 400, 60, 405);
  await page.waitForTimeout(800);
  const afterLeft = await page.evaluate(() => window.__fractalApp.currentDef?.id);
  ok(afterLeft === 'spectrum', `swipe left switches to next screen (got: ${afterLeft})`);

  // Swipe right → previous (back to tunnel)
  await swipe(page, 60, 400, 330, 395);
  await page.waitForTimeout(800);
  const afterRight = await page.evaluate(() => window.__fractalApp.currentDef?.id);
  ok(afterRight === 'tunnel', `swipe right switches to previous screen (got: ${afterRight})`);

  // Swipe up → picker opens
  await swipe(page, 195, 650, 195, 300);
  const pickerOpened = await page
    .waitForSelector('#picker-overlay:not(.hidden)', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  ok(pickerOpened, 'swipe up opens the picker');

  // Pull down from top edge → page reloads
  await page.evaluate(() => { window.__reloadMarker = 1; });
  await page.keyboard.press('s'); // close picker without picking (mobile has no ⊞ access under the overlay)
  await page.waitForTimeout(300);
  await swipe(page, 195, 40, 195, 220, 16);
  await page.waitForTimeout(1500);
  const marker = await page.evaluate(() => window.__reloadMarker);
  const defAfter = await page.evaluate(() => window.__fractalApp.currentDef?.id ?? null);
  ok(marker === undefined && defAfter === null, 'pull down from top edge refreshes the page');

  await ctx.close();
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
