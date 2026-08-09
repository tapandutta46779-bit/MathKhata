import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requestLocalAion, validateAionPayload } from './local-aion.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');
const distRoot = path.join(projectRoot, 'dist');
const developmentUrl = process.env.MATHKHATA_DEV_URL || 'http://127.0.0.1:4173';
const applicationUrl = 'mathkhata://app/';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.wasm', 'application/wasm'],
]);
const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mathkhata',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.enableSandbox();
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;

function isTrustedAppUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (app.isPackaged) return parsed.protocol === 'mathkhata:' && parsed.host === 'app';
    return parsed.origin === new URL(developmentUrl).origin;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const contentsUrl = event.sender.getURL();
  const frameUrl = event.senderFrame?.url;
  if (!isTrustedAppUrl(contentsUrl) || (frameUrl && !isTrustedAppUrl(frameUrl))) {
    throw new Error('Rejected an untrusted desktop request.');
  }
}

async function registerApplicationProtocol() {
  await protocol.handle('mathkhata', async (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== 'app') return new Response('Not found', { status: 404 });
    const requestedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
    const targetPath = path.resolve(distRoot, `.${requestedPath}`);
    const relativePath = path.relative(distRoot, targetPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return new Response('Forbidden', { status: 403 });
    }
    const response = await net.fetch(pathToFileURL(targetPath).href);
    const headers = new Headers(response.headers);
    const contentType = contentTypes.get(path.extname(targetPath).toLowerCase());
    if (contentType) headers.set('Content-Type', contentType);
    if (/\.(?:woff2?|wasm)$/i.test(targetPath)) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (targetPath.endsWith('.html')) headers.set('Content-Security-Policy', productionCsp);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const parsed = JSON.parse(readFileSync(windowStatePath(), 'utf8'));
    if (![parsed.width, parsed.height].every(Number.isFinite)) return {};
    const width = Math.max(960, Math.min(2560, parsed.width));
    const height = Math.max(640, Math.min(1800, parsed.height));
    const candidate = { x: parsed.x, y: parsed.y, width, height };
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return candidate.x < area.x + area.width - 120 && candidate.x + width > area.x + 120
        && candidate.y < area.y + area.height - 80 && candidate.y + height > area.y + 80;
    });
    return visible ? candidate : { width, height };
  } catch {
    return {};
  }
}

function saveWindowState(window) {
  if (window.isMinimized() || window.isMaximized() || window.isFullScreen()) return;
  try {
    writeFileSync(windowStatePath(), JSON.stringify(window.getBounds()), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('Could not save MathKhata window state.', error);
  }
}

function sendCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:command', command);
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Save Notebook', accelerator: 'CommandOrControl+S', click: () => sendCommand('save') },
        { type: 'separator' },
        { label: 'Print / Save PDF…', accelerator: 'CommandOrControl+P', click: () => sendCommand('print') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo Notebook Action', accelerator: 'CommandOrControl+Z', click: () => sendCommand('undo') },
        { label: 'Redo Notebook Action', accelerator: 'CommandOrControl+Shift+Z', click: () => sendCommand('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureSessionPermissions() {
  const trustedMediaRequest = (webContents, permission, requestingOrigin, details = {}) => {
    if (permission !== 'media' || !isTrustedAppUrl(requestingOrigin || webContents?.getURL?.() || '')) return false;
    const mediaTypes = details.mediaTypes || [];
    return !mediaTypes.includes('video');
  };
  session.defaultSession.setPermissionCheckHandler(trustedMediaRequest);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(trustedMediaRequest(webContents, permission, details.requestingUrl, details));
  });
}

function configureWindowSecurity(window) {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') void shell.openExternal(parsed.href);
    } catch {
      // Invalid or dangerous URLs are ignored.
    }
    return { action: 'deny' };
  });
}

async function createWindow() {
  const bounds = readWindowState();
  const window = new BrowserWindow({
    title: 'MathKhata',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    ...bounds,
    show: false,
    backgroundColor: '#e9e6de',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(moduleDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: !app.isPackaged,
      additionalArguments: [`--mathkhata-version=${app.getVersion()}`],
    },
  });
  configureWindowSecurity(window);
  window.once('ready-to-show', () => window.show());
  window.on('close', () => saveWindowState(window));
  if (app.isPackaged) await window.loadURL(applicationUrl);
  else await window.loadURL(developmentUrl);
  return window;
}

function installAionBridge() {
  const activeRequests = new Map();
  const requestKey = (senderId, requestId) => `${senderId}:${requestId}`;
  const requireRequestId = (requestId) => {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
      throw new Error('AION request identifier is invalid.');
    }
    return requestId;
  };
  ipcMain.handle('aion:check', async (event) => {
    assertTrustedSender(event);
    const response = await requestLocalAion('/api/tags', { timeoutMs: 5_000, maxBytes: 2 * 1024 * 1024 });
    if (!response.ok) throw new Error(`AION returned ${response.status}.`);
    const payload = JSON.parse(response.text);
    return {
      models: Array.isArray(payload.models)
        ? payload.models.slice(0, 100).map((model) => ({ name: model?.name, model: model?.model }))
        : [],
    };
  });
  ipcMain.handle('aion:chat', async (event, request) => {
    assertTrustedSender(event);
    const requestId = requireRequestId(request?.requestId);
    const body = validateAionPayload(request?.payload);
    const key = requestKey(event.sender.id, requestId);
    if (activeRequests.has(key)) throw new Error('AION request identifier is already active.');
    const controller = new AbortController();
    const cancelDestroyedSender = () => controller.abort();
    activeRequests.set(key, controller);
    event.sender.once('destroyed', cancelDestroyedSender);
    try {
      const response = await requestLocalAion('/api/chat', {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: 180_000,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (!event.sender.isDestroyed()) event.sender.send('aion:stream', { requestId, chunk });
        },
      });
      if (!response.ok) {
        let message = `AION returned ${response.status}.`;
        try { message = JSON.parse(response.text).error || message; } catch { /* Keep the safe status message. */ }
        throw new Error(message);
      }
      return { completed: true };
    } finally {
      event.sender.removeListener('destroyed', cancelDestroyedSender);
      activeRequests.delete(key);
    }
  });
  ipcMain.on('aion:cancel', (event, rawRequestId) => {
    try {
      assertTrustedSender(event);
      const requestId = requireRequestId(rawRequestId);
      activeRequests.get(requestKey(event.sender.id, requestId))?.abort();
    } catch {
      // Invalid or untrusted cancellation messages are ignored.
    }
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: 'MathKhata',
    applicationVersion: app.getVersion(),
    version: `Version ${app.getVersion()}`,
    copyright: 'A local-first mathematical notebook.',
  });
  await registerApplicationProtocol();
  configureSessionPermissions();
  installAionBridge();
  createApplicationMenu();
  mainWindow = await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
