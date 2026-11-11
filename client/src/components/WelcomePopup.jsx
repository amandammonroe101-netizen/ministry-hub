/* WelcomePopup — a one-time greeting shown on a brand-new account's
   first app launch, in place of the Daily Summary carousel. It tells
   the user that this same after-the-verse moment is where their daily
   briefing for the Personal Pages will live from now on.

   Gating (once per account, ever) lives in App.jsx via a per-user
   store flag — this component is purely presentational. After it's
   dismissed, subsequent launches show the normal Daily Summary. */

import { useCallback, useEffect } from 'react';
import './WelcomePopup.css';

/* The Personal Pages, in the order the user named them. Icons/accents
   mirror the Daily Summary carousel so the two feel like one feature. */
const PAGES = [
  { id: 'journal',    label: 'Journal',     icon: '📖', accent: '#a78bfa' },
  { id: 'dayPlanner', label: 'Day Planner', icon: '🗓', accent: '#60a5fa' },
  { id: 'friends',    label: 'Friends',     icon: '🤝', accent: '#fbbf24' },
  { id: 'prayers',    label: 'Prayers',     icon: '🙏', accent: '#f472b6' },
  { id: 'chat',       label: 'Chat',        icon: '💬', accent: '#38bdf8' },
];

export default function WelcomePopup({ onClose }) {
  const close = useCallback(() => onClose?.(), [onClose]);

  /* Esc closes, same as the summary. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="wel-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Ministry Hub"
      onClick={close}
    >
      <div className="wel-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wel-close" type="button" onClick={close} aria-label="Close">×</button>

        <header className="wel-head">
          <div className="wel-emoji" aria-hidden="true">✨</div>
          <div className="wel-eyebrow">Welcome</div>
          <h2 className="wel-title">You&rsquo;re all set</h2>
        </header>

        <div className="wel-body">
          <p className="wel-lead">
            This is where your <strong>daily briefing</strong> will be — a quick,
            once-a-day look at what&rsquo;s new across your Personal Pages.
          </p>

          <div className="wel-pages">
            {PAGES.map((p) => (
              <span
                key={p.id}
                className="wel-chip"
                style={{ '--wel-accent': p.accent }}
              >
                <span className="wel-chip-icon" aria-hidden="true">{p.icon}</span>
                <span className="wel-chip-label">{p.label}</span>
              </span>
            ))}
          </div>

          <p className="wel-foot-note">
            It&rsquo;ll open right here each day, just after the Verse of the Day.
          </p>
        </div>

        <footer className="wel-foot">
          <button className="wel-btn" type="button" onClick={close}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
