// Renders the app icon to src-tauri/app-icon.png (1024²); `npx tauri icon` derives the rest.
import { chromium } from 'playwright';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17171a"/><stop offset="1" stop-color="#070708"/></linearGradient>
  <mask id="cut"><circle cx="490" cy="572" r="232" fill="#fff"/><circle cx="614" cy="472" r="196" fill="#000"/></mask>
</defs>
<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
<rect x="64.5" y="64.5" width="895" height="895" rx="199.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
<path d="M150 800 A420 420 0 0 1 884 424" fill="none" stroke="#d4ff3f" stroke-width="64" stroke-linecap="round"/>
<circle cx="490" cy="572" r="232" fill="#f4f4f5" mask="url(#cut)"/>
<circle cx="800" cy="232" r="38" fill="#f4f4f5"/>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: 'src-tauri/app-icon.png', omitBackground: true });
await browser.close();
