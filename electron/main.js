const { app, BrowserWindow, shell, Menu, session, systemPreferences, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

/* ─────────────────────────────────────────────────────────────
   Electron main process.

   The Express + SQLite backend is gone — all user data now lives in
   Firebase (Auth + Firestore + Storage). This file just:
     - Boots the renderer
     - Configures camera/mic permissions (for Podcast Studio)
     - Opens external links in the user's browser
     - Checks for app updates + downloads + prompts user to install
   ───────────────────────────────────────────────────────────── */

const isDev = process.env.NODE_ENV === 'development';
const CLIENT_PORT = 5173;
const DEV_ORIGIN = `http://localhost:${CLIENT_PORT}`;

let mainWindow = null;

/* ── Shell / navigation hardening ──
   Two things every Electron app should do and this one didn't:
     1. Never hand shell.openExternal() a URL we haven't checked —
        only http(s) links should ever reach the OS's default-app
        handler. Anything else (file:, javascript:, custom protocol
        handlers) gets silently dropped instead of executed.
     2. Never let a window's main frame navigate away from the app's
        own origin (the dev server in dev, or the packaged file:// in
        prod). window.open() is already caught by setWindowOpenHandler
        below — this catches the other path: an in-place redirect. */
function openExternalSafely(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') {
      shell.openExternal(url);
    } else {
      log.warn(`Blocked openExternal for disallowed protocol: ${url}`);
    }
  } catch (_) {
    log.warn(`Blocked openExternal for unparsable URL: ${url}`);
  }
}

function isAllowedNavigationTarget(url) {
  if (isDev) return url.startsWith(DEV_ORIGIN);
  return url.startsWith('file://');
}

function guardNavigation(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationTarget(url)) {
      log.warn(`Blocked navigation to disallowed origin: ${url}`);
      event.preventDefault();
    }
  });
}

/* ── Auto-updater config ──
      electron-updater pulls release metadata from the provider
      configured in package.json's `build.publish` block (currently
      GitHub Releases). On launch we trigger a background check;
      if a newer version is found it downloads silently, and we
      prompt the user to relaunch when the download finishes.

      Logs go to ~/Library/Logs/Elite Journal Hub/main.log on mac
      and the equivalent paths on Win/Linux — useful for debugging
      "the update didn't fire" reports. */
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;          // download in background, no prompt
autoUpdater.autoInstallOnAppQuit = true;  // apply pending updates on quit

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
      /* DEV-ONLY: disable CORS / same-origin enforcement so chat
         file uploads to Firebase Storage don't get blocked when the
         bucket's CORS isn't configured yet. Electron is a controlled
         single-origin renderer — there's no third-party site that can
         exploit this. For production builds, configure CORS properly
         on the bucket (docs/storage.cors.json + gsutil) and remove
         this override. */
      ...(isDev ? { webSecurity: false } : {}),
    },
    show: false,
  });

  // Open external links in default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  guardNavigation(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Dev: load Vite dev server. Prod: load the built React app directly from disk.
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${CLIENT_PORT}`);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Detached pop-out windows ────────────────────────────────────────────────
/* A detached window renders the SAME app at a single route with the
   NavRail + AppHeader suppressed (the renderer keys off the
   `?detached=1` query param). Because each window is its own renderer
   subscribing to the same Firestore data, the popped-out page stays
   live-synced with the main window for free — no data IPC needed.

   We pass the target route via a `route=` query param rather than the
   URL path so it works identically under the dev server (http://) and
   the packaged build (file://), where BrowserRouter can't read a deep
   path off a file:// URL. The renderer reads `route` and navigates. */
/* route string is stashed on each window as `win._detachedRoute`. */
const detachedWindows = new Set();

/* Tell the main window which routes are currently popped out, so its
   NavRail can hide those items (the page lives in its own window now). */
function broadcastDetachedRoutes() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const routes = [...detachedWindows].map(w => w._detachedRoute).filter(Boolean);
  mainWindow.webContents.send('detached-routes', routes);
}

/* The "merge zone": the left strip of the main window (where the menu
   lives). Releasing a dragged pop-out here re-merges it. Returned in
   absolute screen coordinates so we can hit-test the cursor. */
function mergeZoneRect() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return null;
  const b = mainWindow.getBounds();
  return { x: b.x, y: b.y, width: Math.min(360, b.width), height: b.height };
}

function pointInRect(p, r) {
  return !!r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/* Position a freshly-created pop-out relative to the main window (the
   window the page was open in): directly below it if it fits on the
   display, otherwise above it. Extra pop-outs are staggered so they
   don't land exactly on top of each other. */
function placeDetachedWindow(win) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const work = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const main = mainWindow.getBounds();
  const size = win.getBounds(); // configured width/height

  const stagger = Math.max(0, detachedWindows.size - 1) * 30;
  const belowY = main.y + main.height;
  const aboveY = main.y - size.height;

  let y;
  if (belowY + size.height <= work.y + work.height) {
    y = belowY;                       // room below
  } else if (aboveY >= work.y) {
    y = aboveY;                       // else room above
  } else {
    y = work.y + work.height - size.height; // neither: clamp on-screen
  }

  let x = main.x + stagger;
  y += stagger;

  // Keep the whole window inside the display work area.
  x = Math.max(work.x, Math.min(x, work.x + work.width - size.width));
  y = Math.max(work.y, Math.min(y, work.y + work.height - size.height));
  win.setPosition(Math.round(x), Math.round(y));
}

/* Hand a pop-out's page back to the main window and close the pop-out. */
function putBackWindow(win) {
  if (!win || win.isDestroyed()) return;
  const routePath = win._detachedRoute;
  /* Drop it from the tracked set + tell the main window FIRST, so the
     route is no longer "popped out" before we navigate the main window
     to it — otherwise the bounce-away-from-detached-pages logic would
     immediately kick it back to the Calendar. */
  detachedWindows.delete(win);
  broadcastDetachedRoutes();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('merge-zone', false);
    if (typeof routePath === 'string' && routePath.startsWith('/')) {
      mainWindow.webContents.send('navigate', routePath);
    }
  }
  win.close();
}

function createDetachedWindow(routePath, opts) {
  // Only allow app-internal absolute routes — never a remote URL.
  if (typeof routePath !== 'string' || !routePath.startsWith('/')) return;
  const withShell = !!(opts && opts.withShell);

  // Already popped out? Just focus the existing window.
  for (const w of detachedWindows) {
    if (w._detachedRoute === routePath && !w.isDestroyed()) { w.focus(); return; }
  }

  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 480,
    minHeight: 400,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0e0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      ...(isDev ? { webSecurity: false } : {}),
    },
    show: false,
  });
  win._detachedRoute = routePath;

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  guardNavigation(win.webContents);

  const query = { detached: '1', route: routePath, ...(withShell ? { shell: '1' } : {}) };
  if (isDev) {
    const qs = new URLSearchParams(query).toString();
    win.loadURL(`http://localhost:${CLIENT_PORT}/?${qs}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'), { query });
  }

  /* ── Drag-back-to-merge ──
        There's no DOM drop event for "an OS window was dragged over
        another window," so we hit-test in the main process: while the
        pop-out is being dragged we reveal a drop zone on the main
        window's left edge; when the drag ends with the cursor inside
        that zone, we merge the page back. */
  const showZone = () => mainWindow && !mainWindow.isDestroyed()
    && mainWindow.webContents.send('merge-zone', true);
  const hideZone = () => mainWindow && !mainWindow.isDestroyed()
    && mainWindow.webContents.send('merge-zone', false);

  win.on('will-move', showZone);
  win.on('move', showZone);
  win.on('moved', () => {
    hideZone();
    if (pointInRect(screen.getCursorScreenPoint(), mergeZoneRect())) {
      putBackWindow(win);
    }
  });

  win.once('ready-to-show', () => {
    placeDetachedWindow(win);   // anchor below/above the main window
    win.show();
  });
  win.on('closed', () => {
    detachedWindows.delete(win);
    broadcastDetachedRoutes();
    // Guard against the merge-zone drop panel getting stuck visible on
    // the main window if this pop-out is closed (e.g. via its own X
    // button) while mid-drag, instead of being dragged back to merge —
    // 'moved' (which normally hides it) never fires in that case.
    hideZone();
  });

  detachedWindows.add(win);
  // Hide the item from the sidebar right away, and again once the new
  // renderer is alive (covers a main-window reload mid-open).
  broadcastDetachedRoutes();
  win.webContents.once('did-finish-load', broadcastDetachedRoutes);
}

ipcMain.on('open-detached-window', (_event, routePath, opts) => {
  createDetachedWindow(routePath, opts);
});

ipcMain.on('put-back-window', (event) => {
  putBackWindow(BrowserWindow.fromWebContents(event.sender));
});

/* The main window asks for the current list on load (covers the case
   where it reloads while pop-outs are open). */
ipcMain.on('request-detached-routes', broadcastDetachedRoutes);

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
    /* Edit menu — gives every text input the standard OS shortcuts.
       Without this, Cmd+V (and Cmd+C / Cmd+X / Cmd+A) are never
       delivered to the focused control, because Electron only honors
       OS-level shortcuts that are explicitly registered as menu items.
       The built-in `role`s come with the correct accelerators wired up
       per-platform — we don't have to spell out Cmd+V vs Ctrl+V. */
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
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

// ─── Content-Security-Policy ─────────────────────────────────────────────────
/* Last line of defense if an XSS foothold ever shows up in the React app
   (a bad dangerouslySetInnerHTML, a compromised npm package, etc.) — this
   stops it from loading/executing anything the app doesn't already need.

   The app talks to: Firebase (Auth/Firestore/Storage/Functions/AI, all on
   *.googleapis.com / *.firebaseio.com / *.firebaseapp.com), the Anthropic
   API (api.anthropic.com), and Google Fonts (index.html). Dev additionally
   needs 'unsafe-eval' + a ws:// connection for Vite's HMR client. */
function configureContentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    /* 'unsafe-inline' is only added in dev: Vite's dev server injects the
       React Fast Refresh preamble as an inline <script> (no src=) to wire
       up HMR. The production build has no inline scripts — everything is
       bundled into external files referenced via <script src>, so prod
       stays strict 'self'-only. */
    `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    `connect-src 'self' https: wss:${isDev ? ` ${DEV_ORIGIN} ws://localhost:${CLIENT_PORT}` : ''}`,
    "frame-src https://*.firebaseapp.com https://*.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];
  const csp = directives.join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// ─── Media permissions (camera / microphone) ────────────────────────────────
// Electron denies getUserMedia by default — without these handlers, the Podcast
// Studio page's recording UI silently fails. Allow media access for the app's
// own origin (the Vite dev server in dev, the bundled file:// URL in prod).
function configureMediaPermissions() {
  const sess = session.defaultSession;

  /* List of permissions we explicitly allow the renderer to use.
     - media/audio/video: getUserMedia for Podcast Studio recording
     - clipboard-read:    navigator.clipboard.readText() (Paste button
                          in Chat invite forms; without this it rejects
                          silently and the renderer never sees text)
     - clipboard-sanitized-write: navigator.clipboard.writeText() in
                          recent Electron versions checks this too */
  const ALLOWED = [
    'media',
    'mediaKeySystem',
    'audioCapture',
    'videoCapture',
    'display-capture',
    'clipboard-read',
    'clipboard-sanitized-write',
  ];

  // Async request handler (fires when the page first calls getUserMedia,
  // or the first time the renderer tries to read the clipboard).
  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED.includes(permission));
  });

  // Sync check handler (fires for "is this allowed?" probes).
  sess.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED.includes(permission);
  });

  // On macOS, ask for system-level camera/mic access up front so the OS
  // permission dialog fires the first time the app is used — saves the user
  // a confusing "nothing happens" moment when they first press record.
  if (process.platform === 'darwin' && systemPreferences && typeof systemPreferences.askForMediaAccess === 'function') {
    systemPreferences.askForMediaAccess('camera').catch(() => {});
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
}

// ─── Auto-update event wiring ────────────────────────────────────────────────
/* Each event mirrors a stage of the update lifecycle. We surface
   the important moments to the user as native dialogs so they
   know what's happening without us building a custom in-app
   update banner. */
function wireAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update…');
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version} (current ${app.getVersion()})`);
    /* Quiet at this stage — we don't want to interrupt the user
       just because a download started. The "ready to install"
       prompt below is the one that matters. */
  });

  autoUpdater.on('update-not-available', () => {
    log.info('App is up to date.');
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-update error:', err == null ? 'unknown' : (err.stack || err).toString());
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download ${progress.percent.toFixed(1)}% — ${(progress.bytesPerSecond / 1024).toFixed(0)} KB/s`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`Update downloaded: ${info.version}. Prompting to install.`);

    const { response } = await dialog.showMessageBox(mainWindow || null, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Elite Journal Hub ${info.version} is ready to install.`,
      detail:
        'A new version has been downloaded. Restart the app now to apply ' +
        "the update, or keep working and it'll install automatically the " +
        'next time you quit.',
    });

    if (response === 0) {
      /* `isSilent`: true so the user doesn't get the installer UI
          flashed at them. `isForceRunAfter`: true so the app
          relaunches once the install finishes. */
      autoUpdater.quitAndInstall(true, true);
    }
  });
}

/* Background update check — fires shortly after launch so the
   first paint isn't blocked by network. Wrapped in a try/catch so
   a missing publish config / offline state doesn't crash boot. */
function checkForUpdatesQuietly() {
  if (isDev) {
    log.info('Skipping update check in development.');
    return;
  }
  setTimeout(() => {
    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('checkForUpdates threw:', err);
    }
  }, 3000);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  configureContentSecurityPolicy();
  configureMediaPermissions();
  wireAutoUpdater();
  createWindow();
  checkForUpdatesQuietly();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
