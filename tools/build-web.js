// Bundles the game into one self-contained HTML file for web hosting.
// Usage: node tools/build-web.js  ->  dist/root-cause.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('play.html');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) => `<style>\n${read(f)}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${read(f)}\n</script>`);
// Standalone copy for any static host (itch.io, Netlify, GitHub Pages) or to send as a file.
fs.mkdirSync(path.join(root, 'dist', 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'web', 'index.html'), html);
// The host supplies its own document skeleton; keep only head contents and body.
html = html.replace(/<!DOCTYPE html>\s*/i, '').replace(/<\/?html[^>]*>\s*/g, '').replace(/<\/?head>\s*/g, '').replace(/<\/?body>\s*/g, '')
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'root-cause.html'), html);
console.log('wrote dist/root-cause.html', (html.length / 1024).toFixed(1) + ' KB');
