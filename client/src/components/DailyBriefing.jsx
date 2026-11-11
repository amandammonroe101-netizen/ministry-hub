/* DailyBriefing — the "Your Day at a Glance" popup. Opens once on the
   first app launch of each day, right after the Verse of the Day
   splash is dismissed. Content + the once-per-day gating live in
   lib/dailyBriefing.js. Each line deep-links into its page. */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getBriefing,
  markBriefingShown,
  briefingGreeting,
  PRIORITY_LABEL,
} from '../lib/dailyBriefing';
import './DailyBriefing.css';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function DailyBriefing({ onClose }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null); // null = loading

  /* Mark "shown today" as soon as it opens, so it won't reappear this
     day even if the user closes it immediately. */
  useEffect(() => {
    markBriefingShown();
    let alive = true;
    getBriefing()
      .then((list) => { if (alive) setItems(list); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const close = useCallback(() => onClose?.(), [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const openItem = useCallback((path) => {
    onClose?.();
    if (path) navigate(path);
  }, [navigate, onClose]);

  const loading = items === null;
  const empty = Array.isArray(items) && items.length === 0;

  return (
    <div
      className="db-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Your day at a glance"
      onClick={close}
    >
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <button className="db-close" type="button" onClick={close} aria-label="Close">×</button>

        <header className="db-head">
          <div className="db-eyebrow">{briefingGreeting()}</div>
          <h2 className="db-title">Your day at a glance</h2>
          <p className="db-sub">{todayLabel()}</p>
        </header>

        <div className="db-body">
          {loading && (
            <div className="db-loading" aria-live="polite">
              <span /><span /><span />
            </div>
          )}

          {empty && (
            <div className="db-empty">
              <div className="db-empty-emoji" aria-hidden="true">✨</div>
              <p>You&rsquo;re all caught up. Nothing needs your attention today.</p>
            </div>
          )}

          {!loading && !empty && (
            <ul className="db-list">
              {items.map((it) => (
                <li
                  key={it.id}
                  className={`db-item db-item--p${it.priority}${it.path ? ' db-item--link' : ''}`}
                  style={{ '--db-accent': it.accent || '#60a5fa' }}
                  role={it.path ? 'button' : undefined}
                  tabIndex={it.path ? 0 : undefined}
                  onClick={it.path ? () => openItem(it.path) : undefined}
                  onKeyDown={
                    it.path
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openItem(it.path);
                          }
                        }
                      : undefined
                  }
                >
                  <span className="db-item-icon" aria-hidden="true">{it.icon}</span>
                  <div className="db-item-main">
                    <span className="db-item-text">{it.text}</span>
                    <span className="db-item-page">{it.page}</span>
                  </div>
                  <span className={`db-chip db-chip--p${it.priority}`}>
                    {PRIORITY_LABEL[it.priority]}
                  </span>
                  {it.path && <span className="db-item-go" aria-hidden="true">→</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="db-foot">
          <button className="db-done" type="button" onClick={close}>
            Start my day
          </button>
        </footer>
      </div>
    </div>
  );
}
