import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isDetached, detachedRoute } from '../lib/detached';

/* Bridges Electron window management to React Router. Renders nothing.

   - In a detached pop-out: on first mount, navigate to the route the
     main process asked us to show (passed as a `route=` query param).
   - In the main window: listen for `navigate` messages from the main
     process (a pop-out's "Put back" handing its page back), and keep
     the main window OFF any route that's currently popped out — if the
     page lives in its own window, the main window bounces to Calendar
     so the page never shows in two places at once. */
export default function WindowSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  // Detached pop-out: jump to the assigned route on first mount.
  useEffect(() => {
    if (isDetached()) {
      const route = detachedRoute();
      if (route) navigate(route, { replace: true });
    }
  }, [navigate]);

  // Main window: honor put-back navigation + track popped-out routes.
  useEffect(() => {
    if (isDetached()) return;
    window.electronAPI?.onNavigate?.((path) => {
      if (typeof path === 'string' && path.startsWith('/')) navigate(path);
    });
    const off = window.electronAPI?.onDetachedRoutes?.((routes) =>
      setDetachedRoutes(routes || []));
    window.electronAPI?.requestDetachedRoutes?.();
    return () => off?.();
  }, [navigate]);

  // Main window: if the page we're showing is now popped out into its
  // own window, leave it — bounce to the Calendar home route, or to the
  // Women's Ministry Overview if the popped-out page was a Women's
  // Ministry page (keeps the user inside that ministry's space instead
  // of dropping them all the way back out to the Calendar).
  useEffect(() => {
    if (isDetached()) return;
    if (detachedRoutes.includes(location.pathname)) {
      const fallback = location.pathname.startsWith('/womens') ? '/womens' : '/calendar';
      navigate(fallback, { replace: true });
    }
  }, [detachedRoutes, location.pathname, navigate]);

  return null;
}
