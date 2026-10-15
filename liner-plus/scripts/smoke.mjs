// Drives the built UI in headless Chromium against the offline mock source:
// home → play → lyrics → search → album → queue → palette. Fails on any page error.
// Usage: npm run build && npm run smoke [-- --shots <dir>]

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const server = await createServer({ server: { port: 1421, strictPort: true }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  if (shots) await page.screenshot({ path: join(shots, `${name.replace(/\W+/g, '-')}.png`) });
  console.log('ok');
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

try {
  await step('home', async () => {
    await page.goto('http://localhost:1421/?mock');
    await page.getByRole('heading', { name: 'Quick picks' }).waitFor();
    assert((await page.locator('.card').count()) >= 10, 'expected home cards');
  });

  await step('play', async () => {
    await page.locator('.card').first().click();
    await page.waitForFunction(() => document.title.includes('Signal Fire'));
    await page.waitForTimeout(2500);
    const pos = await page.locator('.progress .time').first().textContent();
    assert(pos !== '0:00', `playback did not advance (${pos})`);
    assert(await page.getByRole('button', { name: 'Pause' }).first().isVisible(), 'pause button not shown');
  });

  await step('lyrics', async () => {
    await page.keyboard.press('l');
    await page.locator('.lyrics .line').first().waitFor();
    // Seek into the first sung line and confirm the word fill moves.
    await page.locator('.lyrics .line:not(.interlude)').first().click();
    await page.waitForTimeout(1200);
    const active = await page.locator('.lyrics .line.active').textContent();
    assert(active?.includes('Light a signal'), `wrong active line: ${active}`);
    const fills = await page.locator('.lyrics .line.active .w').evaluateAll((els) => els.map((e) => +getComputedStyle(e).getPropertyValue('--p')));
    assert(fills[0] > 0, `first word not filling: ${fills}`);
    const credit = await page.locator('.credit').textContent();
    assert(credit?.includes('estimated'), `credit: ${credit}`);
  });

  await step('word-synced lyrics + romanize', async () => {
    await page.keyboard.press('Shift+ArrowRight'); // Paper Lanterns (plain lyrics)
    await page.waitForFunction(() => document.title.includes('Paper Lanterns'));
    await page.locator('.credit', { hasText: 'not synced' }).waitFor();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Desert');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Top result' }).waitFor();
    await page.locator('.songs .row').first().dblclick();
    await page.waitForFunction(() => document.title.includes('Desert Mile'));
    await page.keyboard.press('l');
    await page.getByRole('button', { name: /Romanize/ }).click();
    await page.locator('.roman', { hasText: 'Odin kilometr' }).waitFor();
    await page.locator('.roman', { hasText: 'samak' }).waitFor();
    await page.getByRole('button', { name: /Romanize/ }).click();
    await page.keyboard.press('Escape');
  });

  await step('album + queue', async () => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Afterglow');
    await page.keyboard.press('Enter');
    await page.locator('.card', { hasText: 'Afterglow Machines' }).first().click();
    await page.getByRole('heading', { name: 'Afterglow Machines' }).waitFor();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.title.includes('Chrome Bloom'));
    await page.keyboard.press('q');
    await page.locator('.queue .item').first().waitFor();
    assert((await page.locator('.queue .item').count()) >= 3, 'queue too short');
    await page.keyboard.press('l');
    await page.waitForTimeout(500);
    await page.locator('.credit', { hasText: 'word-synced' }).waitFor();
    await page.locator('.lyrics .line:not(.interlude)').first().click();
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  });

  await step('like + library + playlist', async () => {
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Library' }).first().click();
    await page.locator('.row', { hasText: 'Chrome Bloom' }).waitFor();
    await page.locator('.row', { hasText: 'Chrome Bloom' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Add to playlist/ }).hover();
    await page.getByRole('menuitem', { name: 'New playlist' }).click();
    await page.locator('nav .pl', { hasText: 'Playlist 1' }).click();
    await page.locator('.row', { hasText: 'Chrome Bloom' }).waitFor();
  });

  await step('artist', async () => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Slow Comet');
    await page.keyboard.press('Enter');
    await page.locator('.top-result').click();
    await page.getByRole('heading', { name: 'Popular' }).waitFor();
  });

  await step('settings + help', async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).waitFor();
    await page.getByRole('button', { name: 'Calm' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
    await page.keyboard.press('Escape');
  });

  await step('lyrics view (final)', async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Reactive' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Chrome Bloom');
    await page.keyboard.press('Enter');
    await page.locator('.songs .row').first().dblclick();
    await page.keyboard.press('l');
    await page.locator('.lyrics .line:not(.interlude)').nth(1).click();
    await page.waitForTimeout(1600);
  });

  assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
  console.log('\nsmoke passed');
} catch (e) {
  console.error('\nFAILED:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  if (shots) await page.screenshot({ path: join(shots, 'failure.png') });
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
