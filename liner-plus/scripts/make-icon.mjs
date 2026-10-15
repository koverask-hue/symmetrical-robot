// Renders the app icon to src-tauri/app-icon.png (1024²); `npx tauri icon` derives the rest.
import { chromium } from 'playwright';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset=".55" stop-color="#ff5d8f"/><stop offset="1" stop-color="#8f3cff"/></linearGradient>
  <radialGradient id="h" cx=".3" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect x="64" y="64" width="896" height="896" rx="210" fill="url(#g)"/>
<rect x="64" y="64" width="896" height="896" rx="210" fill="url(#h)"/>
<g stroke="#1a0f1a" stroke-width="78" stroke-linecap="round">
  <path d="M290 372h444"/><path d="M290 524h316"/><path d="M290 676h188"/>
</g>
<circle cx="690" cy="676" r="58" fill="#1a0f1a"/>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: 'src-tauri/app-icon.png', omitBackground: true });
await browser.close();
