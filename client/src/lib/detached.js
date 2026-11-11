/* Detached-window helpers.

   A "detached" window is a second Electron BrowserWindow that renders
   the same React app but pops a single page out on its own — no
   NavRail, no AppHeader. The window is flagged via a `?detached=1`
   query param set by the main process when it opens the window, plus
   a `route=` param telling the renderer which page to show.

   Because every window is a separate renderer that subscribes to the
   same Firestore data, the detached page stays live-synced with the
   main window automatically — no IPC needed for data. */

/* Captured ONCE at module load, before React Router runs. The flag
   lives in the URL the main process opened the window with
   (`?detached=1&route=…`), but the first in-app navigation strips the
   query string — so we snapshot it here and never re-read the live
   URL, keeping the window in detached mode for its whole lifetime. */
const INITIAL = new URLSearchParams(window.location.search);
const DETACHED = INITIAL.get('detached') === '1';
const ROUTE = INITIAL.get('route');
const WITH_SHELL = INITIAL.get('shell') === '1';

/* True when this renderer is running inside a detached pop-out window. */
export function isDetached() {
  return DETACHED;
}

/* The route a detached window was asked to display (e.g. "/journal").
   Returns null in a normal window or when no route was provided. */
export function detachedRoute() {
  return ROUTE;
}

/* True when a detached window was popped out for a whole ministry
   category (e.g. dragging "Women's Ministry" or "Hospitality Ministry"
   itself off the main rail) rather than a single leaf page. Those
   ministries have their own bespoke shell with an internal nav
   dropdown; when this is set, that shell keeps its nav dropdown
   instead of suppressing it like it does for a bare leaf-page pop-out. */
export function detachedWithShell() {
  return WITH_SHELL;
}

/* Whether the detach feature is available — only inside Electron, where
   the preload bridge exposes the window-management calls. */
export function canDetach() {
  return typeof window !== 'undefined'
    && !!window.electronAPI
    && typeof window.electronAPI.openDetached === 'function';
}
