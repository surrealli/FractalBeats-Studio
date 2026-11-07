// One-off: capture final screenshots of the landing page (desktop + mobile).
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
const PORT = 8181;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glsl': 'text/plain', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.jpg': 'image/jpeg' };
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

// Desktop picker with previews
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForTimeout(2500); // let videos start playing
await page.screenshot({ path: join(ROOT, 'tools', 'shot-desktop-picker.png') });

// Active screen (spectrum) via card click — spectrum is card #2 in the current order
await page.click('.screen-card:nth-child(2)');
await page.waitForTimeout(2500);
await page.screenshot({ path: join(ROOT, 'tools', 'shot-desktop-screen.png') });
await page.close();

// Mobile picker + screen + settings drawer
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const mpage = await ctx.newPage();
await mpage.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await mpage.waitForTimeout(2500);
await mpage.screenshot({ path: join(ROOT, 'tools', 'shot-mobile-picker.png') });
await mpage.click('.screen-card:nth-child(2)');
await mpage.waitForTimeout(2000);
await mpage.click('#gui-btn');
await mpage.waitForTimeout(600);
await mpage.screenshot({ path: join(ROOT, 'tools', 'shot-mobile-screen.png') });
await ctx.close();

await browser.close();
server.close();
console.log('screenshots saved to tools/shot-*.png');
