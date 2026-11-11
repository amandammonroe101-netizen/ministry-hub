/* Prayer Dashboard — the default landing view for the Prayers
   page. Mirrors JournalDashboard's structure: a vertical stack
   of focused cards that summarize what's on the user's prayer
   wall right now. Clicking a stat or row jumps over to the Wall
   view filtered to the matching smart section.

   The dashboard is presentational: it receives `prayers` + a
   handful of action callbacks (jump, open detail, new) and never
   talks to Firestore directly. The parent (Prayers.jsx) still
   owns prayer mutation logic. */

import React, { useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getKind } from './Prayers';
import { buildQueue } from './PrayNowMode';
import './PrayerDashboard.css';

const ageDays = (createdAt) => {
  try { return differenceInDays(new Date(), parseISO((createdAt || '').replace(' ', 'T'))); }
  catch { return 0; }
};

/* Format a bible-api result for use in the Encouragement card.
   `fetchVerseText` emits one block per chapter, each block prefixed
   with a "Book N\n" header and the verses interleaved as "1. ... 2. ...".
   We strip the chapter header but KEEP the verse-number prefixes so
   the card reads like a real passage ("1. ... 2. ...") with the
   reference shown beneath it. */
function cleanEncouragementText(raw) {
  if (!raw) return '';
  const blocks = String(raw).split('\n\n');
  return blocks.map(block => {
    const lines = block.split('\n');
    /* Drop the first line of each block if it's a "Book Chapter"
       header (no leading verse number). If the block was just a
       single line (a manual default like Phil 4:6), keep it. */
    const body = lines.length > 1 && !/^\s*\d/.test(lines[0])
      ? lines.slice(1).join(' ')
      : lines.join(' ');
    /* Preserve "1. foo 2. bar" verse-number markers; only normalize
       runaway whitespace. */
    return body.replace(/\s+/g, ' ').trim();
  })
  .filter(Boolean)
  .join(' ')
  .trim();
}

const KIND_PILL = {
  praying:  { emoji: '🙏', label: 'Praying',  color: 'rgba(167,139,250,.18)', text: '#c4b5fd' },
  answered: { emoji: '✓',  label: 'Answered', color: 'rgba(52,211,153,.18)',  text: '#6ee7b7' },
  praise:   { emoji: '✨', label: 'Praise',   color: 'rgba(244,114,182,.18)', text: '#f9a8d4' },
};
const URGENT_PILL = { emoji: '🔥', label: 'Urgent', color: 'rgba(239,68,68,.18)', text: '#fca5a5' };

export default function PrayerDashboard({
  prayers,
  categories,            // merged built-in + custom
  display,               // live display settings (visibility toggles)
  onJump,                // (filterPreset) => switch to Wall with this filter applied
  onOpenPrayer,          // (prayer) => switch to Wall + select this prayer
  onNew,                 // (entryType) => open new-prayer form on Wall
  onStartPrayNow,        // () => launch the Pray Now liturgy overlay
}) {
  const all = Array.isArray(prayers) ? prayers : [];

  /* Each derived slice mirrors the SMART_SECTIONS in Prayers.jsx
     so the dashboard's "Open in Wall" jumps line up exactly. */
  const stats = useMemo(() => ({
    total:        all.length,
    answered:     all.filter(p => getKind(p) === 'answered').length,
    urgent:       all.filter(p => p.is_urgent && getKind(p) !== 'answered').length,
    daily:        all.filter(p => p.is_daily  && getKind(p) !== 'answered').length,
    praise:       all.filter(p => getKind(p) === 'praise').length,
    longstanding: all.filter(p =>
      getKind(p) === 'praying' &&
      ageDays(p.created_at) >= 30
    ).length,
  }), [all]);

  const answerRate = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;

  /* ── Page Settings → Display knobs ──
     `sortOrder` orders the dashboard's prayer lists (Today's Focus
     and Recent Testimonies) so the user's choice in Page Settings
     actually changes what they see here, not just on the Board.
     `cardDensity` flips the focus rows between roomy and tight
     spacing — applied as a class on each row. */
  const sortOrder   = display?.sortOrder   || 'newest';
  const cardDensity = display?.cardDensity || 'comfy';
  const cmpByDate = (dir) => (a, b) => {
    const da = new Date((a.created_at || '').replace(' ','T')).getTime() || 0;
    const db = new Date((b.created_at || '').replace(' ','T')).getTime() || 0;
    return dir === 'oldest' ? da - db : db - da;
  };
  const cmpByUpdates = (a, b) => (b.updates?.length || 0) - (a.updates?.length || 0);
  const cmpForSort = sortOrder === 'oldest'      ? cmpByDate('oldest')
                  : sortOrder === 'mostUpdated' ? cmpByUpdates
                  :                                cmpByDate('newest');

  const todaysFocus = useMemo(() => {
    /* Urgent first, then daily. Within each bucket the user's chosen
       sort order applies. Cap to 6 so the card never bloats. */
    const urgent = all
      .filter(p => p.is_urgent && getKind(p) !== 'answered')
      .sort(cmpForSort);
    const daily  = all
      .filter(p => p.is_daily  && !p.is_urgent && getKind(p) !== 'answered')
      .sort(cmpForSort);
    return [...urgent, ...daily].slice(0, 6);
  }, [all, sortOrder]);

  const recentAnswered = useMemo(() => {
    /* "Recent Testimonies" was previously hardcoded newest-first.
       Honor the user's sortOrder so the card label still makes sense
       under each option (newest = most recent answers; oldest = the
       prayers that took longest to answer; mostUpdated = the deepest
       stories). Slice last so the cap is consistent. */
    return all
      .filter(p => getKind(p) === 'answered')
      .sort(cmpForSort)
      .slice(0, 4);
  }, [all, sortOrder]);

  const longestWaiting = useMemo(() => {
    return all
      .filter(p => getKind(p) === 'praying')
      .map(p => ({ p, age: ageDays(p.created_at) }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 3);
  }, [all]);

  const categoryBars = useMemo(() => {
    const map = {};
    for (const c of categories || []) map[c] = 0;
    for (const p of all) {
      const c = p.category || 'General';
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [all, categories]);

  /* Count of things eligible for the Pray Now session — keeps
     the CTA honest when there's nothing to walk through.
     IMPORTANT: declared BEFORE the early-return for the empty
     state. React hooks must be called in the same order on every
     render — moving this below the `if (!all.length) return` would
     change the hook count when the user adds their first prayer
     and crash with "Rendered more hooks than during the previous
     render." */
  const prayNowCount = useMemo(() => buildQueue(all).length, [all]);

  /* Empty state — first-time users. */
  if (!all.length) {
    return (
      <div className="pd-root pd-empty">
        <div className="pd-empty-icon">🙏</div>
        <div className="pd-empty-title">Your prayer wall is waiting.</div>
        <div className="pd-empty-sub">
          Add your first prayer and let it grow into a story of God moving in your life.
        </div>
        <div className="pd-empty-actions">
          {/* Praise removed from the empty state — the New Prayer
              form's kind picker (Praying / Answered / Praise) is the
              single place to choose, so a separate Praise CTA was
              redundant. */}
          <button className="app-btn primary" data-tour="tour-primary-action" onClick={() => onNew?.('request')}>
            ✦ Add First Prayer
          </button>
        </div>
        <div className="pd-empty-hint">
          Once you have a few prayers on the wall, <strong>🙏 Pray Now</strong> will
          walk you through them one at a time.
        </div>
        <div className="pd-empty-verse">
          "Rejoice always, pray continually, give thanks in all circumstances."
          <span> — 1 Thessalonians 5:16-18</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pd-root">
      {/* ── Pray Now CTA ──
            Big single-action banner that launches the liturgy
            walkthrough. The whole point of the Prayer page is to
            actually pray, so this lives at the very top. */}
      {onStartPrayNow && (
        <button className="pd-praynow" onClick={onStartPrayNow}>
          <span className="pd-praynow-icon">🙏</span>
          <span className="pd-praynow-text">
            <span className="pd-praynow-title">Pray Now</span>
            <span className="pd-praynow-sub">
              {prayNowCount > 0
                ? `Walk through ${prayNowCount} prayer${prayNowCount === 1 ? '' : 's'} — urgent, daily, and long-standing`
                : 'Start a focused prayer session whenever you\'re ready'}
            </span>
          </span>
          <span className="pd-praynow-go">→</span>
        </button>
      )}

      {/* ── Today's focus ── */}
      <section className="pd-card pd-focus">
        <header className="pd-card-hd">
          <span className="pd-card-icon">🎯</span>
          <span className="pd-card-title">Today's Focus</span>
          <span className="pd-card-sub">
            {stats.urgent} urgent · {stats.daily} daily
          </span>
          <button className="pd-small-btn" onClick={() => onJump?.('daily')}>
            Open daily list →
          </button>
        </header>

        {todaysFocus.length === 0 ? (
          <div className="pd-focus-empty">
            Nothing urgent or on your daily list right now.
            <button className="pd-link" onClick={() => onNew?.('request')}>+ New prayer</button>
          </div>
        ) : (
          <div className={`pd-focus-list density-${cardDensity}`}>
            {todaysFocus.map(p => {
              const pill = p.is_urgent ? URGENT_PILL : (KIND_PILL[getKind(p)] || KIND_PILL.praying);
              const age  = ageDays(p.created_at);
              return (
                <button
                  key={p.id}
                  className={`pd-focus-row density-${cardDensity}`}
                  onClick={() => onOpenPrayer?.(p)}
                >
                  <span className="pd-focus-pill" style={{ background: pill.color, color: pill.text }}>
                    {pill.emoji}
                  </span>
                  <span className="pd-focus-info">
                    <span className="pd-focus-title">{p.title}</span>
                    <span className="pd-focus-meta">
                      {/* `is_daily` is 0/1, not a real boolean — !! avoids
                          rendering a literal "0" when the flag is off. */}
                      {!!p.is_daily && <span className="pd-tag pd-tag-daily">📆 Daily</span>}
                      {p.category && <span className="pd-tag">{p.category}</span>}
                      <span className="pd-tag pd-tag-age">
                        {age === 0 ? 'today' : `${age}d`}
                      </span>
                    </span>
                  </span>
                  <span className="pd-focus-go">→</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Stats row ──
            Each tile jumps to the matching smart section on the Wall
            view. Praise routes to the praise section, etc. */}
      <section className="pd-stats">
        <button className="pd-stat" onClick={() => onJump?.('active')}>
          <span className="pd-stat-n">{stats.total}</span>
          <span className="pd-stat-lbl">Total</span>
        </button>
        <button className="pd-stat" onClick={() => onJump?.('answered')}>
          <span className="pd-stat-n" style={{ color: '#6ee7b7' }}>{stats.answered}</span>
          <span className="pd-stat-lbl">Answered</span>
        </button>
        <button className="pd-stat" onClick={() => onJump?.('urgent')}>
          <span className="pd-stat-n" style={{ color: '#fca5a5' }}>{stats.urgent}</span>
          <span className="pd-stat-lbl">Urgent</span>
        </button>
        <button className="pd-stat" onClick={() => onJump?.('daily')}>
          <span className="pd-stat-n" style={{ color: '#fcd34d' }}>{stats.daily}</span>
          <span className="pd-stat-lbl">Daily</span>
        </button>
        <button className="pd-stat" onClick={() => onJump?.('praise')}>
          <span className="pd-stat-n" style={{ color: '#a78bfa' }}>{stats.praise}</span>
          <span className="pd-stat-lbl">Praise</span>
        </button>
        <button className="pd-stat" onClick={() => onJump?.('longstanding')}>
          <span className="pd-stat-n" style={{ color: '#7dd3fc' }}>{stats.longstanding}</span>
          <span className="pd-stat-lbl">30+ days</span>
        </button>
      </section>

      {/* ── Answer Rate ── */}
      {display?.showAnswerRate !== false && stats.total > 0 && (
        <section className="pd-card pd-rate">
          <header className="pd-card-hd">
            <span className="pd-card-icon">🎉</span>
            <span className="pd-card-title">Answer Rate</span>
            <span className="pd-card-sub">{stats.answered} of {stats.total} answered</span>
          </header>
          <div className="pd-rate-row">
            <div className="pd-rate-n">{answerRate}%</div>
            <div className="pd-rate-track">
              <div className="pd-rate-fill" style={{ width: `${answerRate}%` }}/>
            </div>
          </div>
        </section>
      )}

      {/* ── Two-column row: Recent answered + Longest waiting ── */}
      <div className="pd-grid-2">
        <section className="pd-card">
          <header className="pd-card-hd">
            <span className="pd-card-icon">✨</span>
            <span className="pd-card-title">Recent Testimonies</span>
            {recentAnswered.length > 0 && (
              <button className="pd-small-btn" onClick={() => onJump?.('answered')}>
                See all →
              </button>
            )}
          </header>
          {recentAnswered.length === 0 ? (
            <div className="pd-mini-empty">No answered prayers yet — keep praying.</div>
          ) : (
            <div className="pd-mini-list">
              {recentAnswered.map(p => (
                <button
                  key={p.id}
                  className="pd-mini-row pd-mini-row-answered"
                  onClick={() => onOpenPrayer?.(p)}
                >
                  <span className="pd-mini-emoji">🎉</span>
                  <span className="pd-mini-info">
                    <span className="pd-mini-title">{p.title}</span>
                    <span className="pd-mini-date">
                      {p.created_at
                        ? format(parseISO(p.created_at.replace(' ','T')), 'MMM d, yyyy')
                        : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="pd-card">
          <header className="pd-card-hd">
            <span className="pd-card-icon">⏳</span>
            <span className="pd-card-title">Carrying Longest</span>
            {longestWaiting.length > 0 && (
              <button className="pd-small-btn" onClick={() => onJump?.('longstanding')}>
                See all →
              </button>
            )}
          </header>
          {longestWaiting.length === 0 ? (
            <div className="pd-mini-empty">No prayers older than a few days.</div>
          ) : (
            <div className="pd-mini-list">
              {longestWaiting.map(({ p, age }) => (
                <button
                  key={p.id}
                  className="pd-mini-row"
                  onClick={() => onOpenPrayer?.(p)}
                >
                  <span className="pd-mini-emoji">🙏</span>
                  <span className="pd-mini-info">
                    <span className="pd-mini-title">{p.title}</span>
                    <span className="pd-mini-date">{age} day{age === 1 ? '' : 's'} on the wall</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Category bars ── */}
      {display?.showCategoryBars !== false && categoryBars.length > 0 && (
        <section className="pd-card">
          <header className="pd-card-hd">
            <span className="pd-card-icon">🗂</span>
            <span className="pd-card-title">By Category</span>
          </header>
          <div className="pd-cat-bars">
            {categoryBars.map(([cat, count]) => {
              const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={cat} className="pd-cat-bar">
                  <span className="pd-cat-bar-lbl">{cat}</span>
                  <div className="pd-cat-bar-track">
                    <div className="pd-cat-bar-fill" style={{ width: `${pct}%` }}/>
                  </div>
                  <span className="pd-cat-bar-n">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Encouragement ──
          Reference + verse text both come from Page Settings →
          Display → Encouragement verse. Defaults to Philippians 4:6
          (matches the previous hardcoded card) until the user picks
          their own. We strip the chapter-header lines that
          fetchVerseText emits (e.g. "Psalm 23\n1. ...") and the
          "N. " verse-number prefixes so the card reads as a single
          clean quotation instead of API-shaped output. */}
      {display?.showEncouragement !== false && (display?.encouragementRef || display?.encouragementText) && (
        <section className="pd-card pd-verse-card">
          <header className="pd-card-hd">
            <span className="pd-card-icon">📖</span>
            <span className="pd-card-title">Encouragement</span>
          </header>
          <blockquote className="pd-verse">
            {display?.encouragementText ? (
              <span className="pd-verse-text">{cleanEncouragementText(display.encouragementText)}</span>
            ) : (
              <span className="pd-verse-empty">No verse loaded yet — pick one in Page Settings.</span>
            )}
            {display?.encouragementRef && (
              <cite className="pd-verse-ref">— {display.encouragementRef}</cite>
            )}
          </blockquote>
        </section>
      )}
    </div>
  );
}
