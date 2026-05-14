const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development';
const SERVER_PORT = 5000;
const CLIENT_PORT = 5173;

let mainWindow = null;
let serverProcess = null;

// ─── Spawn the Express backend ───────────────────────────────────────────────
function startServer() {
  const serverPath = isDev
    ? path.join(__dirname, '../server/index.js')
    : path.join(process.resourcesPath, 'server/index.js');

  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: SERVER_PORT },
    stdio: isDev ? 'inherit' : 'ignore',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  console.log('✅ Express server spawned');
}

// ─── Wait for a URL to respond ───────────────────────────────────────────────
function waitForUrl(url, retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve();
        else if (n > 0) setTimeout(() => attempt(n - 1), delay);
        else reject(new Error('Server not ready after retries'));
      }).on('error', () => {
        if (n > 0) setTimeout(() => attempt(n - 1), delay);
        else reject(new Error(`Could not connect to ${url}`));
      });
    };
    attempt(retries);
  });
}

// ─── Create the main window ──────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0e0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // Open external links in default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Dev: load Vite dev server. Prod: load from Express which serves built files.
  const url = isDev
    ? `http://localhost:${CLIENT_PORT}`
    : `http://localhost:${SERVER_PORT}`;

  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App menu ────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [{
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
        }]
      : []),
    {
      label: 'File',
      submenu: [process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' }, { role: 'front' }]
          : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  startServer();

  try {
    await waitForUrl(`http://localhost:${SERVER_PORT}/api/health`);
    console.log('✅ Server ready');
  } catch (err) {
    console.error('Server failed to start:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
