// Run `npm install --no-save esbuild`, then `node tools/build-standalone.cjs`.
const { build } = require('esbuild');
const { readFileSync, writeFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  const shaders = Object.fromEntries(readdirSync(path.join(root, 'src/screens'))
    .filter(name => name.endsWith('.glsl'))
    .map(name => [`./src/screens/${name}`, readFileSync(path.join(root, 'src/screens', name), 'utf8')]));
  const result = await build({
    entryPoints: [path.join(root, 'src/main.js')], bundle: true, write: false,
    format: 'iife', minify: true, target: ['chrome90', 'firefox90', 'safari15'],
    plugins: [{ name: 'inline-shaders', setup(builder) {
      builder.onLoad({ filter: /shader-screen\.js$/ }, args => ({
        contents: `const embeddedShaders = ${JSON.stringify(shaders)};\n` +
          readFileSync(args.path, 'utf8').replace(
            'fragmentSource || await (await fetch(fragmentUrl)).text()',
            'fragmentSource || embeddedShaders[fragmentUrl]'),
        resolveDir: path.dirname(args.path), loader: 'js',
      }));
    } }],
  });
  let html = readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="./src/style.css">',
    () => `<style>${readFileSync(path.join(root, 'src/style.css'), 'utf8')}</style>`);
  // Inline every local asset, including preview clips: file:// needs no fetches.
  const types = { '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webm': 'video/webm' };
  html = html.replace(/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '');
  html = html.replace(/\s*<link rel="icon"[^>]*favicon-32x32[^>]*>/g, '');
  html = html.replace(/(poster|data-src|href)="([^"\n]+)"/g, (match, attr, url) => {
    const mime = types[path.extname(url)];
    if (!mime || /^(https?:|data:)/.test(url)) return match;
    return `${attr}="data:${mime};base64,${readFileSync(path.join(root, url)).toString('base64')}"`;
  });
  html = html.replace(/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '');
  html = html.replace(/\s*<link rel="icon"[^>]*favicon-32x32[^>]*>/g, '');
  html = html.replace('<script type="module" src="./src/main.js"></script>',
    () => `<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
  writeFileSync(path.join(root, 'FractalBeats-Standalone.html'), html);
  console.log('Built FractalBeats-Standalone.html — open directly in a browser.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
