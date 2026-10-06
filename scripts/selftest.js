// Launches the real desktop app in self-test mode: it loads the town, starts
// a mission, sets off an explosion, saves a screenshot and exits non-zero on
// any page error. Works on macOS directly and on Linux under xvfb.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electron = require('electron'); // path to the binary
const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(new URL('../smoke-out/', import.meta.url), { recursive: true });
const shot = fileURLToPath(new URL('../smoke-out/app-selftest.png', import.meta.url));

// BREAKPOINT_APP=<path to a packaged app's executable> tests the built app
// (files served from inside its asar archive) instead of the source tree.
const packaged = process.env.BREAKPOINT_APP;
const args = packaged ? [] : [root];
let cmd = packaged || electron;
if (process.platform === 'linux') {
  // Containers: no GPU, often root. Use software GL and no Chromium sandbox.
  args.push('--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (!process.env.DISPLAY) {
    args.unshift('-a', cmd);
    cmd = 'xvfb-run';
  }
}
const r = spawnSync(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, BREAKPOINT_SELF_TEST: '1', BREAKPOINT_SELF_TEST_SHOT: shot },
  timeout: 300000,
});
if (r.status !== 0) {
  console.error(`app self-test failed (exit ${r.status}${r.signal ? `, ${r.signal}` : ''})`);
  process.exit(1);
}
console.log(`app self-test passed; screenshot: ${shot}`);
