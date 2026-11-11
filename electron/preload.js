const { contextBridge, ipcRenderer } = require('electron');

/* ── Fan-out subscriptions ──
   The main process pushes two streams to the renderer: the set of
   routes currently popped out (`detached-routes`) and whether the
   merge drop-zone should be shown (`merge-zone`). The renderer may
   mount MULTIPLE NavRail instances (a global one plus per-page ones),
   so a naive single ipc listener / removeAllListeners approach would
   let instances clobber each other. Instead we register ONE ipc
   listener per channel here at preload load, cache the latest value,
   and fan it out to every React subscriber. New subscribers get the
   cached value immediately so a freshly-mounted rail is correct even
   if it mounted after the last broadcast. */
function makeStream(channel) {
  const subs = new Set();
  let latest = undefined;
  ipcRenderer.on(channel, (_event, value) => {
    latest = value;
    subs.forEach(cb => { try { cb(value); } catch (_) {} });
  });
  return {
    subscribe(cb) {
      subs.add(cb);
      if (latest !== undefined) cb(latest);   // replay last value
      return () => subs.delete(cb);            // unsubscribe
    },
  };
}

const detachedRoutesStream = makeStream('detached-routes');
const mergeZoneStream = makeStream('merge-zone');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onNavigate: (callback) => ipcRenderer.on('navigate', (_event, path) => callback(path)),

  /* Pop the given route out into its own sidebar-less window.
     `opts.withShell` keeps a ministry's own bespoke shell nav (e.g.
     Women's/Hospitality) instead of suppressing all chrome — used when
     dragging the ministry category itself off the main rail, not a
     single leaf page. */
  openDetached: (path, opts) => ipcRenderer.send('open-detached-window', path, opts),

  /* From inside a detached window: hand the page back to the main
     window (which navigates to it) and close this pop-out. */
  putBack: () => ipcRenderer.send('put-back-window'),

  /* Subscribe to the routes currently popped out. Returns an
     unsubscribe function. Fires immediately with the cached value. */
  onDetachedRoutes: (cb) => detachedRoutesStream.subscribe(cb),
  requestDetachedRoutes: () => ipcRenderer.send('request-detached-routes'),

  /* Subscribe to the merge drop-zone toggle. Returns an unsubscribe. */
  onMergeZone: (cb) => mergeZoneStream.subscribe(cb),
});
