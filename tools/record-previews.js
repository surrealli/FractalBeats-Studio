// Records a short looping preview clip of every visualizer screen by driving
// the real app in Chromium (Playwright) with the generated demo track playing,
// capturing the active canvas via MediaRecorder. Output: tools/raw/<id>.webm
//
// Uses the Playwright package installed with the global @playwright/mcp, so no
// local npm install and no browser download are needed.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const globalNpm = join(process.env.APPDATA || '', 'npm', 'node_modules');
const { chromium } = require(join(globalNpm, '@playwright/mcp/node_modules/playwright'));

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root
const PORT = 8177;
const ALL_IDS = ['tunnel', 'spectrum', 'mandelbulb', 'kaleidoscope'];
const SCREEN_IDS = process.argv.slice(2).length ? process.argv.slice(2) : ALL_IDS;
const CLIP_MS = 4500; // raw recording length per screen
const DEMO_WAV = join(ROOT, 'tools', 'demo-track.wav');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.glsl': 'text/plain', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT)) throw new Error('forbidden');
    if (!existsSync(file)) throw new Error('not found');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));
console.log(`Serving ${ROOT} on http://localhost:${PORT}`);

const rawDir = join(ROOT, 'tools', 'raw');
await mkdir(rawDir, { recursive: true });

// System browser channels — avoids needing a matching Playwright browser build.
const channels = ['chrome', 'msedge', undefined];
let browser = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ headless: false, channel, args: ['--window-size=1320,780'] });
    console.log(`Launched Chromium (${channel || 'bundled'})`);
    break;
  } catch (e) {
    if (channel === undefined) throw e;
    console.log(`channel "${channel}" not available, trying next…`);
  }
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const id of SCREEN_IDS) {
  const idx = ALL_IDS.indexOf(id); // card position in the picker matches the full list
  console.log(`\n=== ${id} ===`);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#picker-overlay:not(.hidden)');
  // Load the demo track — the app auto-plays it (user gesture comes from Playwright's trusted click)
  await page.setInputFiles('#audio-file', DEMO_WAV);
  // Click the matching card → hides picker, switches screen, keeps audio playing.
  // force:true skips Playwright's hit-target actionability (the fullscreen stage
  // can briefly intercept the click point during the picker's entrance) — the
  // vote simply selects the screen, so this is safe.
  await page.click(`.screen-card:nth-child(${idx + 1})`, { force: true });
  await page.waitForTimeout(3000); // shader compile + envelopes settle + track ramps in

  const recorded = await page.evaluate(async (ms) => {
    const glCanvas = document.getElementById('c');
    const canvas = getComputedStyle(glCanvas).display !== 'none'
      ? glCanvas
      : document.querySelector('#stage canvas');
    if (!canvas) throw new Error('no active canvas found');
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(250);
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await done;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CH));
    }
    return btoa(binary);
  }, CLIP_MS);

  const out = join(rawDir, `${id}.webm`);
  await writeFile(out, Buffer.from(recorded, 'base64'));
  console.log(`saved ${out} (${(recorded.length * 3 / 4 / 1024) | 0} KB)`);
}

await browser.close();
server.close();
console.log('\nDone. Now run the ffmpeg step (tools/optimize-previews).');
