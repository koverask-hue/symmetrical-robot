// Drives the UI in headless Chromium against the offline demo source:
// onboarding → personalised home → mix → stage/lyrics → feedback → your sound →
// library → search. Fails on any page error.
// Usage: npm run smoke [-- --shots <dir>]

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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

let n = 0;
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  if (shots) await page.screenshot({ path: join(shots, `${String(++n).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`) });
  console.log('ok');
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const palette = async (text) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};

try {
  await step('onboarding name', async () => {
    await page.goto('http://localhost:1421/?mock');
    await page.getByRole('heading', { name: /learns you/ }).waitFor();
    await page.getByLabel('Your name').fill('Alex');
    await page.getByRole('button', { name: /Continue/ }).click();
  });

  await step('onboarding artists', async () => {
    await page.getByRole('heading', { name: /who do you/i }).waitFor();
    await page.getByRole('button', { name: 'Pale Harbor', exact: true }).click();
    await page.getByRole('button', { name: 'Neon Orchard', exact: true }).click();
    await page.getByLabel('Search artists').fill('Slow');
    await page.getByRole('button', { name: 'Slow Comet', exact: true }).click();
    assert((await page.locator('.artist.on').count()) === 3, 'expected 3 picked artists');
    await page.locator('.onb').getByRole('button', { name: 'Next' }).click();
  });

  await step('onboarding adventurous', async () => {
    await page.getByRole('heading', { name: /adventurous/ }).waitFor();
    await page.getByRole('button', { name: /Tune Moonbow/ }).click();
  });

  await step('for you', async () => {
    await page.getByRole('heading', { name: /Alex/ }).waitFor();
    await page.locator('.hero').waitFor({ timeout: 15000 });
    const title = await page.locator('.hero .title').textContent();
    assert(title && title.trim().length > 2, 'hero mix has no title');
    assert((await page.locator('.hero .reason').count()) === 1, 'hero mix should explain its first pick');
    await page.waitForTimeout(800);
  });

  await step('mix page with reasons', async () => {
    await page.getByRole('button', { name: /see why/ }).click();
    await page.locator('.list .row').first().waitFor();
    const reasons = await page.locator('.list .reason').count();
    assert(reasons >= 5, `expected reasons on mix rows, got ${reasons}`);
  });

  await step('play mix', async () => {
    await page.locator('.hdr').getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2500);
    const t = await page.locator('.capsule .time').first().textContent();
    assert(t !== '0:00', `playback did not advance (${t})`);
    assert((await page.locator('.capsule .reason').count()) === 1, 'capsule should show why this song is playing');
  });

  await step('stage lyrics', async () => {
    await palette('Signal Fire');
    await page.locator('.songs .row').first().dblclick();
    await page.waitForFunction(() => document.title.includes('Signal Fire'));
    await page.keyboard.press('l');
    await page.locator('.lyrics .line:not(.interlude)').first().click();
    await page.waitForTimeout(1300);
    const fills = await page.locator('.lyrics .line.active .w').evaluateAll((els) => els.map((e) => +getComputedStyle(e).getPropertyValue('--p')));
    assert(fills[0] > 0, `first word not filling: ${fills}`);
  });

  await step('feedback', async () => {
    await page.getByRole('button', { name: 'More like this' }).click();
    await page.locator('.toast', { hasText: 'More like' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Not for me' }).click();
    await page.locator('.toast', { hasText: 'Less like' }).waitFor();
  });

  await step('your sound', async () => {
    await page.getByRole('button', { name: 'Your sound' }).click();
    await page.getByRole('heading', { name: /What I know about/ }).waitFor();
    await page.locator('main .sky canvas').waitFor();
    await page.waitForTimeout(2000);
  });

  await step('library', async () => {
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Library' }).click();
    await page.getByRole('heading', { name: /Everything you/ }).waitFor();
    await page.locator('.list .row').first().waitFor();
  });

  await step('search and artist', async () => {
    await palette('Slow Comet');
    await page.locator('.top-result').click();
    await page.getByRole('heading', { name: 'Popular' }).waitFor();
  });

  await step('home again', async () => {
    await page.getByRole('button', { name: 'For you' }).click();
    await page.locator('.hero').waitFor();
    await page.waitForTimeout(1200);
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
