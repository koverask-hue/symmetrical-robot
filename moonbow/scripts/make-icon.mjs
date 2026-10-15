// Renders the app icon to src-tauri/app-icon.png (1024²); `npx tauri icon` derives the rest.
import { chromium } from 'playwright';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <radialGradient id="sky" cx=".5" cy=".18" r=".95">
    <stop offset="0" stop-color="#2a1f57"/><stop offset=".55" stop-color="#110c26"/><stop offset="1" stop-color="#06050b"/>
  </radialGradient>
  <linearGradient id="iris" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#9fefff"/><stop offset=".35" stop-color="#b9a8ff"/><stop offset=".68" stop-color="#ffaee0"/><stop offset="1" stop-color="#ffd9a6"/>
  </linearGradient>
  <radialGradient id="moon" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d0ff"/></radialGradient>
  <mask id="cut"><circle cx="496" cy="560" r="224" fill="#fff"/><circle cx="616" cy="464" r="192" fill="#000"/></mask>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <clipPath id="sq"><rect x="64" y="64" width="896" height="896" rx="210"/></clipPath>
</defs>
<g clip-path="url(#sq)">
  <rect x="64" y="64" width="896" height="896" fill="url(#sky)"/>
  <path d="M128 800 A432 432 0 0 1 896 416" fill="none" stroke="url(#iris)" stroke-width="120" opacity=".35" filter="url(#blur)"/>
  <circle cx="300" cy="240" r="3" fill="#fff" opacity=".7"/><circle cx="720" cy="230" r="2.5" fill="#fff" opacity=".6"/>
  <circle cx="820" cy="560" r="2" fill="#fff" opacity=".5"/><circle cx="210" cy="520" r="2" fill="#fff" opacity=".5"/>
</g>
<path d="M128 800 A432 432 0 0 1 896 416" fill="none" stroke="url(#iris)" stroke-width="56" stroke-linecap="round" opacity=".55" filter="url(#soft)"/>
<path d="M128 800 A432 432 0 0 1 896 416" fill="none" stroke="url(#iris)" stroke-width="40" stroke-linecap="round"/>
<path d="M240 832 A336 336 0 0 1 832 544" fill="none" stroke="url(#iris)" stroke-width="16" stroke-linecap="round" opacity=".5"/>
<circle cx="496" cy="560" r="224" fill="url(#moon)" mask="url(#cut)"/>
<path d="M768 144 L787 205 L848 224 L787 243 L768 304 L749 243 L688 224 L749 205 Z" fill="#fff"/>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: 'src-tauri/app-icon.png', omitBackground: true });
await browser.close();
