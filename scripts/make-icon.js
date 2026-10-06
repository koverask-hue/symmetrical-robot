// Renders the app icon (build/icon.png, 1024x1024) from a generated SVG:
// an isometric voxel cube with its corner blown out. Requires Playwright.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright'));
}

const S = 1024, u = 74; // unit cube edge in px (isometric)
const cx = S / 2, cy = S / 2 + 40;
const iso = (x, y, z) => [cx + (x - z) * u * 0.866, cy + (x + z) * u * 0.5 - y * u];
const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`;
function cube(x, y, z, top, left, right) {
  const p = (a, b, c) => iso(x + a, y + b, z + c);
  return poly([p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], top) +
    poly([p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], left) +
    poly([p(1, 0, 0), p(1, 0, 1), p(1, 1, 1), p(1, 1, 0)], right);
}
const N = 4;
const missing = new Set(['3,3,3', '2,3,3', '3,3,2', '3,2,3', '2,3,2', '3,2,2', '2,2,3']);
let cubes = [];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
  if (missing.has(`${x},${y},${z}`)) continue;
  const brick = (x + y + z) % 2 ? ['#ff9a3c', '#b8461f', '#d9622a'] : ['#ffad55', '#c4512a', '#e46f33'];
  cubes.push([x - N / 2, y - N / 2, z - N / 2, ...brick]);
}
// Flying debris from the blown corner.
const flying = [[2.6, 2.9, 2.4, 0.55], [3.4, 2.2, 1.6, 0.4], [1.7, 3.6, 3.1, 0.45], [3.1, 3.6, 3.4, 0.3], [2.2, 4.4, 1.9, 0.28]];
cubes.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2])); // back to front
let body = cubes.map((c) => cube(c[0], c[1], c[2], c[3], c[4], c[5])).join('');
for (const [x, y, z, s] of flying) {
  const p = (a, b, c) => iso(x + a * s - N / 2, y + b * s - N / 2, z + c * s - N / 2);
  body += poly([p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], '#ffd28a') + poly([p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], '#c4512a') + poly([p(1, 0, 0), p(1, 0, 1), p(1, 1, 1), p(1, 1, 0)], '#e46f33');
}
const [gx, gy] = iso(1.2, 1.4, 1.2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232832"/><stop offset="1" stop-color="#0c0e12"/></linearGradient>
  <radialGradient id="glow" cx="${gx / S}" cy="${gy / S}" r="0.38"><stop offset="0" stop-color="#ffb347" stop-opacity="0.85"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>
</defs>
<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#glow)"/>
<g stroke="#2a160c" stroke-width="3" stroke-linejoin="round">${body}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: S, height: S } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
const out = fileURLToPath(new URL('../build/icon.png', import.meta.url));
await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: S, height: S } });
await browser.close();
console.log('wrote', out);
