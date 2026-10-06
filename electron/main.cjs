// Breakpoint desktop shell. Serves the game from a private, secure `app://`
// origin (module workers and WebAssembly need a real origin, which file://
// does not give) and opens it in a native window. No server, no network.
const { app, BrowserWindow, protocol, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const ROOT = path.join(__dirname, '..');
const SELF_TEST = process.env.BREAKPOINT_SELF_TEST === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Let the GPU do its job: games should never be throttled or software-rendered.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setName('Breakpoint');

async function serve(request) {
  const { pathname } = new URL(request.url);
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
  try {
    const body = await fs.readFile(file);
    return new Response(body, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0c0f',
    title: 'Breakpoint',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    if (!SELF_TEST) win.maximize();
    win.show();
  });
  // The game never navigates; anything else opens in the default browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`app://game/index.html${SELF_TEST ? '?test' : ''}`);
  return win;
}

// Self-test (used by CI and local checks): boot, wait for the town to load,
// save a screenshot, exit 0 on success or 1 on any page error.
async function selfTest(win) {
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`));
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const ready = await win.webContents.executeJavaScript('window.__ready === true').catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const ok = await win.webContents.executeJavaScript('window.__ready === true').catch(() => false);
  if (ok) {
    await win.webContents.executeJavaScript(`(async () => {
      document.getElementById('btn-play').click();
      await new Promise((r) => setTimeout(r, 1500));
      window.__game.explode([20.5, 2.5, 38.0], 1.4);
      await new Promise((r) => setTimeout(r, 1500));
    })()`).catch((e) => errors.push(String(e)));
    const img = await win.webContents.capturePage();
    const out = process.env.BREAKPOINT_SELF_TEST_SHOT;
    if (out) await fs.writeFile(out, img.toPNG());
  } else errors.push('game did not finish loading');
  console.log(errors.length ? `SELF-TEST FAILED\n${errors.join('\n')}` : 'SELF-TEST OK');
  app.exit(errors.length ? 1 : 0);
}

app.whenReady().then(() => {
  protocol.handle('app', serve);
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
      { role: 'windowMenu' },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  const win = createWindow();
  if (SELF_TEST) selfTest(win);
});

app.on('window-all-closed', () => app.quit());
