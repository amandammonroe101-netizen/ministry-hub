/* DailyVerseSplash — full-screen welcome shown each time the app
   opens. Displays the day's verse (see lib/dailyVerse) over the sunset
   background. There is intentionally NO button: the user double-clicks
   anywhere to enter the app.

   Mounts once at the app root, so it appears on every launch/reload and
   stays dismissed (component state) for the rest of that session. */

import { useCallback, useEffect, useState } from 'react';
import { useDailyVerse } from '../lib/dailyVerse';
import './DailyVerseSplash.css';

export default function DailyVerseSplash({ onDismiss }) {
  const [visible, setVisible] = useState(true);
  const { verse, loading } = useDailyVerse();

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  /* Any key dismisses the splash too, so a keyboard-only user (or
     anyone whose trackpad double-click is finicky) is never trapped
     behind the full-screen overlay. */
  useEffect(() => {
    if (!visible) return;
    const onKey = () => dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      className="dvs-overlay"
      role="dialog"
      aria-label="Verse of the day"
      onClick={dismiss}
      onDoubleClick={dismiss}
    >
      <div className="dvs-scrim" aria-hidden="true" />

      <div className="dvs-content">
        <div className="dvs-eyebrow">Verse of the Day</div>

        {loading ? (
          <div className="dvs-loading" aria-live="polite">
            <span /><span /><span />
          </div>
        ) : (
          <>
            <blockquote className="dvs-verse">
              &ldquo;{verse?.text}&rdquo;
            </blockquote>
            {verse?.reference && (
              <div className="dvs-ref">— {verse.reference}</div>
            )}
          </>
        )}

        {/* Explicit, obvious way in — no longer relies on the user
            discovering the double-click gesture. Stops click
            propagation so the button's own click is the dismiss. */}
        <button
          type="button"
          className="dvs-enter"
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
        >
          Enter →
        </button>

        <div className="dvs-hint">Click anywhere, press any key, or use Enter</div>
      </div>
    </div>
  );
}
