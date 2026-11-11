/* DailySummary — the per-page "what's new" carousel. Opens once on the
   first app launch of each day, right after the Verse of the Day splash
   is dismissed (it replaced the old list-style Daily Briefing).

   One step per personal page (Journal, Prayers, Friends, Day Planner,
   Chat). Each step shows a built-in smart-summary paragraph generated
   from that page's real data. The bottom button reads "Next" and steps
   forward through the pages; on the last page it reads "Done". The
   page title deep-links into the page. Content + once-per-day gating
   live in lib/pageSummaries.js and lib/dailyBriefing.js. */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPageSummaries } from '../lib/pageSummaries';
import { markBriefingShown, briefingGreeting } from '../lib/dailyBriefing';
import './DailySummary.css';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function DailySummary({ onClose }) {
  const navigate = useNavigate();
  const [pages, setPages] = useState(null); // null = loading
  const [index, setIndex] = useState(0);

  /* Mark "shown today" as soon as it opens, so it won't reappear this
     day even if the user closes it immediately. */
  useEffect(() => {
    markBriefingShown();
    let alive = true;
    getPageSummaries()
      .then((list) => { if (alive) setPages(list); })
      .catch(() => { if (alive) setPages([]); });
    return () => { alive = false; };
  }, []);

  const close = useCallback(() => onClose?.(), [onClose]);

  const loading = pages === null;
  const empty = Array.isArray(pages) && pages.length === 0;
  const total = Array.isArray(pages) ? pages.length : 0;
  const isLast = index >= total - 1;
  const current = !loading && !empty ? pages[index] : null;

  const next = useCallback(() => {
    if (isLast) { close(); return; }
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [isLast, total, close]);

  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const openPage = useCallback((path) => {
    onClose?.();
    if (path) navigate(path);
  }, [navigate, onClose]);

  /* Keyboard: Esc closes, ← / → step through pages. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, back]);

  const accent = current?.accent || '#a78bfa';

  return (
    <div
      className="ds-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="What's new across your pages"
      onClick={close}
    >
      <div
        className="ds-modal"
        style={{ '--ds-accent': accent }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ds-close" type="button" onClick={close} aria-label="Close">×</button>

        <header className="ds-head">
          <div className="ds-eyebrow">{briefingGreeting()}</div>
          <h2 className="ds-title">Here&rsquo;s what&rsquo;s new</h2>
          <p className="ds-sub">{todayLabel()}</p>
        </header>

        <div className="ds-body">
          {loading && (
            <div className="ds-loading" aria-live="polite">
              <span /><span /><span />
            </div>
          )}

          {empty && (
            <div className="ds-empty">
              <div className="ds-empty-emoji" aria-hidden="true">✨</div>
              <p>No pages are turned on for your daily summary. You can enable them in Settings.</p>
            </div>
          )}

          {current && (
            <div className="ds-card" key={current.id}>
              <button
                className="ds-page"
                type="button"
                onClick={() => openPage(current.path)}
                title={`Open ${current.label}`}
              >
                <span className="ds-page-icon" aria-hidden="true">{current.icon}</span>
                <span className="ds-page-name">{current.label}</span>
                <span className="ds-page-go" aria-hidden="true">→</span>
              </button>
              <p className="ds-paragraph">{current.paragraph}</p>
            </div>
          )}
        </div>

        {!loading && !empty && (
          <footer className="ds-foot">
            <div className="ds-dots" role="tablist" aria-label="Pages">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`ds-dot${i === index ? ' on' : ''}${i < index ? ' done' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Go to ${p.label}`}
                  aria-selected={i === index}
                />
              ))}
            </div>

            <div className="ds-foot-btns">
              {index > 0 && (
                <button className="ds-btn ds-btn-ghost" type="button" onClick={back}>
                  Back
                </button>
              )}
              <button className="ds-btn ds-btn-primary" type="button" onClick={next}>
                {isLast ? 'Done' : 'Next'}
                {!isLast && <span className="ds-btn-arrow" aria-hidden="true">→</span>}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
