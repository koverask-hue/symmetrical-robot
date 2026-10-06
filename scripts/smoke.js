// End-to-end smoke test: boots the game in headless Chromium, plays it with
// scripted input, fails on any page error and saves screenshots to smoke-out/.
// Usage: npm run smoke   (needs Playwright; uses the system Chromium if set)
import { spawn, execSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(join(root, 'noop.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const out = new URL('../smoke-out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const port = 5199;
const server = spawn(process.execPath, [new URL('./serve.js', import.meta.url).pathname], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 600));

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  if (process.env.VERBOSE) console.log(`[${m.type()}] ${m.text()}`);
});

const step = async (name, fn) => {
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${Date.now() - t} ms)`);
};
const frames = (n) => page.evaluate((n) => new Promise((r) => {
  let k = 0;
  const f = () => (++k >= n ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });

try {
  await step('boot and load the town', async () => {
    await page.goto(`http://127.0.0.1:${port}/?test`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    await frames(10);
    await shot('01-menu');
  });

  await step('start playing', async () => {
    await page.click('#btn-play');
    await page.waitForFunction(() => window.__game.state === 'playing');
    await frames(20);
    await shot('02-spawn');
  });

  await step('walk forward and look around', async () => {
    await page.keyboard.down('KeyW');
    await frames(40);
    await page.keyboard.up('KeyW');
    const p = await page.evaluate(() => window.__game.player.cur);
    if (!(p[0] > 4)) throw new Error(`player did not move: ${p}`);
    await page.mouse.move(640, 360);
    await page.mouse.move(700, 340, { steps: 4 });
    await frames(5);
  });

  await step('shotgun the townhouse window glass', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.player.teleport([84 * 0.25, 1.25, 138 * 0.25]);
      g.player.yaw = Math.PI; // face +z (towards the townhouse)
      g.player.pitch = 0.08;
      g.tools.select(1);
    });
    await frames(5);
    const before = await page.evaluate(() => window.__game.destruction.voxelsDestroyed);
    await page.mouse.down();
    await frames(2);
    await page.mouse.up();
    await frames(20);
    const after = await page.evaluate(() => window.__game.destruction.voxelsDestroyed);
    if (after <= before) throw new Error('shotgun destroyed nothing');
    await shot('03-shotgun');
  });

  await step('rocket the townhouse corner and watch it collapse', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.player.teleport([70 * 0.25, 1.25, 120 * 0.25]);
      g.player.yaw = Math.PI - 0.25;
      g.player.pitch = 0.0;
      g.tools.select(3);
    });
    await frames(5);
    for (let i = 0; i < 3; i++) {
      await page.mouse.down();
      await frames(2);
      await page.mouse.up();
      await frames(80);
    }
    await shot('04-rockets');
    await frames(120);
    const s = await page.evaluate(() => ({ b: window.__game.debris.bodies.size, d: window.__game.destruction.voxelsDestroyed, f: window.__game.fire.count, cpuMs: +window.__game.cpuMs.toFixed(2) }));
    console.log('   after rockets:', JSON.stringify(s));
    await shot('05-aftermath');
  });

  await step('cutter through the vault and grab the gold', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      // Inside the bank, facing the vault wall.
      g.player.teleport([198 * 0.25, 1.5, 172 * 0.25]);
      g.player.yaw = Math.PI;
      g.player.pitch = -0.35;
      g.tools.select(4);
    });
    await frames(10);
    await page.mouse.down();
    await frames(150);
    await page.mouse.up();
    await shot('06-cutter');
    const gold = await page.evaluate(() => {
      const g = window.__game;
      const t = g.targets.find((t) => t.name === 'Gold Bars');
      const p = t.rb.translation();
      g.player.teleport([p.x, p.y - 0.2, p.z + 1.0]);
      g.player.yaw = 0;
      g.player.pitch = -0.6;
      return [p.x, p.y, p.z];
    });
    await frames(10);
    await page.keyboard.press('KeyE');
    await frames(5);
    const phase = await page.evaluate(() => window.__game.phase);
    if (phase !== 'alarm') throw new Error(`grabbing loot did not trip the alarm (phase ${phase}) at ${gold}`);
    await shot('07-alarm');
  });

  await step('pipe bomb, fire and extinguisher', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.player.teleport([50 * 0.25, 1.5, 104 * 0.25]); // in front of the barn
      g.player.yaw = Math.PI;
      g.player.pitch = 0.1;
      g.tools.select(2);
    });
    await frames(5);
    await page.mouse.down();
    await frames(2);
    await page.mouse.up();
    await frames(240);
    await shot('08-bomb');
    await page.evaluate(() => window.__game.tools.select(5));
    await page.mouse.down();
    await frames(30);
    await page.mouse.up();
  });

  await step('pause and resume', async () => {
    await page.evaluate(() => {
      window.__game.pause(true);
    });
    await frames(5);
    await page.evaluate(() => window.__game.pause(false));
    await frames(5);
  });

  await step('mission ends when the timer runs out', async () => {
    await page.evaluate(() => {
      window.__game.alarmLeft = 0.05;
    });
    await page.waitForSelector('#screen-results.show', { timeout: 10000 });
    await shot('09-results');
  });

  await step('retry reloads the mission', async () => {
    await page.click('#btn-retry');
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
    await frames(10);
  });
} catch (err) {
  errors.push(`step failed: ${err.message}`);
  await shot('zz-failure').catch(() => {});
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s):\n` + errors.join('\n'));
  process.exit(1);
}
console.log('\nSmoke test passed. Screenshots in smoke-out/');
