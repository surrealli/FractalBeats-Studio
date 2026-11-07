// Live verification: while the demo track plays on the mandelbulb screen
// (looped), sample audio bands, band uniforms and canvas pixel deltas every
// 0.5s. Confirms the cyclic shape system visibly evolves with the music and
// that the shader stays error-free. Output columns:
//   t        seconds since start
//   low/mid/high/beat/energy   audio engine bands + beat intensity + energy
//   kick/uLow/uMid/uHigh       uniforms that drive the shader
//   power/iters/size/morph     constant CPU params (power morphs inside GLSL)
//   luma     mean screen brightness (a healthy scene reads ~40-60)
//   |diff|   mean pixel change vs the previous 0.5s sample
//   |cumA    mean pixel change vs the first sample (shape evolution over time)
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
const PORT = 8186;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glsl': 'text/plain', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
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

const channels = ['chrome', 'msedge', undefined];
let browser = null;
for (const channel of channels) {
  try { browser = await chromium.launch({ headless: true, channel }); break; }
  catch { if (channel === undefined) throw new Error('no browser'); }
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#picker-overlay:not(.hidden)');
await page.setInputFiles('#audio-file', join(ROOT, 'tools', 'demo-track.wav'));
await page.click('.screen-card:nth-child(3)', { force: true }); // mandelbulb is now card #3
await page.waitForTimeout(4000); // shader compile + track ramps in

console.log('t   low   mid  high  beat  energy | kick   uLow  uMid  uHigh | power  iters  size  morph | luma  |diff|');
let prevPix = null;
let totalDiff = 0;
for (let i = 0; i < 24; i++) {
  const s = await page.evaluate(() => {
    const app = window.__fractalApp;
    const cur = app.current;
    const u = cur.uniforms;
    const a = app.engine;
    if (a.audioEl && !a.audioEl.loop) a.audioEl.loop = true; // keep feeding audio
    cur.render(); // draw now so readback sees a fresh frame (preserveDrawingBuffer is false)
    const canvas = document.getElementById('c');
    const w = 96, h = 54;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(canvas, 0, 0, w, h);
    const px = cx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let k = 0; k < px.length; k += 4) sum += px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114;
    const luma = sum / (w * h);
    return {
      low: a.low.toFixed(2), mid: a.mid.toFixed(2), high: a.high.toFixed(2),
      beat: a.beatIntensity.toFixed(2), energy: a.energy.toFixed(2),
      kick: (+u.u_kick.value).toFixed(2), uLow: (+u.u_low.value).toFixed(2),
      uMid: (+u.u_mid.value).toFixed(2), uHigh: (+u.u_high.value).toFixed(2),
      iters: (+u.u_maxIter.value).toFixed(0),
      size: (+u.u_size.value).toFixed(2),
      morph: (+u.u_morph.value).toFixed(2),
      luma: luma.toFixed(1),
      px: Array.from(px.subarray(0, 160)),
    };
  });
  let diff = 0;
  if (prevPix) {
    let d = 0;
    const n = Math.min(prevPix.length, s.px.length);
    for (let k = 0; k < n; k++) d += Math.abs(prevPix[k] - s.px[k]);
    diff = (d / n).toFixed(2);
  }
  prevPix = s.px;
  console.log(
    `${(i * 0.5).toFixed(1)}  ${s.low}  ${s.mid}  ${s.high}  ${s.beat}   ${s.energy}   | ` +
    `${s.kick}   ${s.uLow}  ${s.uMid}  ${s.uHigh} | ` +
    `${s.iters}    ${s.size}    ${s.morph}  | ${s.luma}  ${diff}`
  );
  await page.waitForTimeout(500);
}
console.log('\npageerrors:', pageErrors.length ? pageErrors : 'none');
await browser.close();
server.close();