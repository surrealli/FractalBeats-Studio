// One-off: verify Mandelbulb v2 — no shader errors, drag orbits, wheel zooms.
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
const PORT = 8185;
const step = (m) => console.log(m);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glsl': 'text/plain', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || !existsSync(file)) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'app/octets' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(PORT, r));
step('server up');
const channels = ['chrome', 'msedge', undefined];
let browser = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ headless: true, channel });
    break;
  } catch (e) {
    console.error(`channel "${channel}" FAILED:`, e.message.split('\n')[0]);
    if (channel === undefined) throw e;
  }
}
step('browser up');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
step('page loaded');
await page.waitForSelector('#picker-overlay:not(.hidden)');
await page.setInputFiles('#audio-file', join(ROOT, 'tools', 'demo-track.wav'));
await page.click('.screen-card:nth-child(3)', { force: true }); // mandelbulb is now card #3
step('mandelbulb active');
await page.waitForTimeout(2500);

const state = () => page.evaluate(() => ({
  yaw: window.__fractalApp.current.uniforms.u_camYaw.value,
  dist: window.__fractalApp.current.uniforms.u_camDist.value,
}));
const before = await state();
const box = await page.evaluate(() => {
  const r = document.getElementById('c').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 220, cy + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
const afterDrag = await state();
await page.mouse.wheel(0, -1200);
await page.waitForTimeout(500);
const afterZoom = await state();

console.log('errors:', errors.length ? errors : 'none');
console.log(`drag: yaw ${before.yaw.toFixed(3)} -> ${afterDrag.yaw.toFixed(3)} (${Math.abs(afterDrag.yaw - before.yaw) > 0.1 ? 'MOVED ✓' : 'NO MOVE ✗'})`);
console.log(`wheel: dist ${afterDrag.dist.toFixed(2)} -> ${afterZoom.dist.toFixed(2)} (${afterZoom.dist < afterDrag.dist - 0.3 ? 'ZOOMED ✓' : 'NO ZOOM ✗'})`);
const ok = !errors.length && Math.abs(afterDrag.yaw - before.yaw) > 0.1 && afterZoom.dist < afterDrag.dist - 0.3;
console.log(ok ? 'CHECK PASSED' : 'CHECK FAILED');
await browser.close();
server.close();
process.exit(ok ? 0 : 1)