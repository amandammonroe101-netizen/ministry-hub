/* PrayNowMode — focused "Pray Now" liturgy walkthrough.

   Triggered from the Dashboard's "🙏 Pray Now" CTA. Locks the
   user into a guided sequence: Urgent → Daily → Long-standing
   (top 3 oldest active) → Praise. One prayer at a time, big
   text, single forward/back/skip controls + an inline update
   textarea.

   The mode is presentational — it receives:
     • the full prayers array (we build the queue here so the
       Dashboard doesn't need to know the order rules)
     • onClose() — close the overlay and return to the Dashboard
     • onAddUpdate(prayer, text) — optional inline reflection
     • onStatusChange(prayer, status) — for the "Mark answered"
       quick action at the bottom of each prayer
     • onOpenPrayer(prayer) — bail to Wall view + detail (for
       "edit this" out-link) */

import React, { useMemo, useState, useEffect } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getKind } from './Prayers';
import './PrayNowMode.css';

const ageDays = (createdAt) => {
  try { return differenceInDays(new Date(), parseISO((createdAt || '').replace(' ', 'T'))); }
  catch { return 0; }
};

/* Build the queue: urgent (active) → daily (active, not already
   in urgent) → 3 oldest active (not already in either) → praise
   (last 3). We cap defensively so a power user with 200 prayers
   doesn't end up trapped in a 200-prayer ritual. */
export function buildQueue(prayers, options = {}) {
  const max = options.max || 12;
  const all = Array.isArray(prayers) ? prayers : [];
  const seen = new Set();
  const out = [];

  const push = (list) => {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length >= max) return true;
    }
    return false;
  };

  const urgent = all.filter(p => p.is_urgent && getKind(p) === 'praying');
  if (push(urgent)) return out;

  const daily = all.filter(p => p.is_daily && getKind(p) === 'praying');
  if (push(daily)) return out;

  const longstanding = all
    .filter(p => getKind(p) === 'praying')
    .map(p => ({ p, age: ageDays(p.created_at) }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 3)
    .map(x => x.p);
  if (push(longstanding)) return out;

  /* A handful of praise/thanksgiving entries at the end so the
     session closes on gratitude — even just 1-2 reframes the
     ritual. */
  const praise = all.filter(p => getKind(p) === 'praise').slice(0, 3);
  push(praise);

  return out;
}

const KIND_PILL = {
  praying:  { emoji: '🙏', label: 'Praying',  color: 'rgba(167,139,250,.18)', text: '#c4b5fd' },
  answered: { emoji: '✓',  label: 'Answered', color: 'rgba(52,211,153,.18)',  text: '#6ee7b7' },
  praise:   { emoji: '✨', label: 'Praise',   color: 'rgba(244,114,182,.18)', text: '#f9a8d4' },
};
const URGENT_PILL = { emoji: '🔥', label: 'Urgent', color: 'rgba(239,68,68,.18)', text: '#fca5a5' };

export default function PrayNowMode({
  open, prayers, onClose,
  onAddUpdate,         // (prayer, text) => Promise
  onStatusChange,      // (prayer, status) => Promise
  onOpenPrayer,        // (prayer) => void  (closes overlay first)
}) {
  /* Build the queue once when the overlay opens. We snapshot it
     so that a status-flip (e.g. "Mark answered") doesn't kick the
     prayer out of the session mid-walkthrough. */
  const queue = useMemo(() => (open ? buildQueue(prayers) : []), [open, prayers]);

  const [idx, setIdx]                 = useState(0);
  const [updateText, setUpdateText]   = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [finished, setFinished]       = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  /* Reset session state whenever the overlay re-opens. */
  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setUpdateText('');
    setSavingUpdate(false);
    setFinished(false);
    setCompletedCount(0);
  }, [open]);

  if (!open) return null;

  /* Empty queue — nothing to walk through. */
  if (queue.length === 0) {
    return (
      <div className="pn-overlay" role="dialog" aria-label="Pray Now">
        <div className="pn-card pn-empty-card">
          <button className="pn-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="pn-empty-icon">🙏</div>
          <div className="pn-empty-title">Your wall is clear.</div>
          <div className="pn-empty-sub">
            Add a few prayers and come back — Pray Now will walk you through
            urgent requests, your daily list, and the ones you've been
            carrying longest.
          </div>
          <button className="pn-primary" onClick={onClose}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const current  = queue[idx];
  const pill     = current.is_urgent
    ? URGENT_PILL
    : (KIND_PILL[getKind(current)] || KIND_PILL.praying);
  const age      = ageDays(current.created_at);
  const isPraise = getKind(current) === 'praise';
  const isLast   = idx === queue.length - 1;
  const progress = ((idx + 1) / queue.length) * 100;

  const goPrev = () => {
    if (idx <= 0) return;
    setIdx(idx - 1);
    setUpdateText('');
  };
  const goNext = async () => {
    /* If the user wrote an inline reflection, save it before
       advancing. Save errors are surfaced to the parent but
       don't block the walkthrough — Pray Now should never feel
       like a chore. */
    const text = updateText.trim();
    if (text && onAddUpdate) {
      setSavingUpdate(true);
      try { await onAddUpdate(current, text); } catch { /* noop */ }
      setSavingUpdate(false);
    }
    setUpdateText('');
    if (isLast) {
      setCompletedCount(c => c + 1);
      setFinished(true);
    } else {
      setCompletedCount(c => c + 1);
      setIdx(idx + 1);
    }
  };
  const skipNext = () => {
    setUpdateText('');
    if (isLast) setFinished(true);
    else setIdx(idx + 1);
  };
  const markAnswered = async () => {
    if (!onStatusChange) return;
    try { await onStatusChange(current, 'answered'); } catch { /* noop */ }
    /* Auto-advance after marking answered so the user feels like
       the action moved them forward — natural ritual rhythm. */
    setCompletedCount(c => c + 1);
    setUpdateText('');
    if (isLast) setFinished(true);
    else setIdx(idx + 1);
  };

  /* Closing screen — celebrate the user finishing the session. */
  if (finished) {
    return (
      <div className="pn-overlay" role="dialog" aria-label="Pray Now — finished">
        <div className="pn-card pn-done-card">
          <button className="pn-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="pn-done-icon">✨</div>
          <div className="pn-done-title">Amen.</div>
          <div className="pn-done-sub">
            You prayed through {completedCount} request{completedCount === 1 ? '' : 's'}.
            <br/>"The prayer of a righteous person is powerful and effective." — James 5:16
          </div>
          <div className="pn-done-actions">
            <button className="pn-secondary" onClick={() => {
              setFinished(false); setIdx(0); setCompletedCount(0);
            }}>↻ Pray again</button>
            <button className="pn-primary" onClick={onClose}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pn-overlay" role="dialog" aria-label="Pray Now">
      <div className="pn-shell">
        {/* Header — progress + counter + exit. */}
        <div className="pn-hd">
          <div className="pn-hd-counter">
            {idx + 1} <span className="pn-hd-of">of</span> {queue.length}
          </div>
          <div className="pn-hd-progress">
            <div className="pn-hd-progress-fill" style={{ width: `${progress}%` }}/>
          </div>
          <button className="pn-close" onClick={onClose} aria-label="Close Pray Now">✕</button>
        </div>

        {/* Main prayer card. */}
        <div className="pn-card pn-prayer-card">
          <div className="pn-pills">
            <span className="pn-pill" style={{ background: pill.color, color: pill.text }}>
              {isPraise ? '✨ Praise' : `${pill.emoji} ${pill.label}`}
            </span>
            {!!current.is_daily && <span className="pn-pill pn-pill-daily">📆 Daily</span>}
            {current.category && <span className="pn-pill pn-pill-cat">{current.category}</span>}
            <span className="pn-pill pn-pill-age">
              {age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'} on the wall`}
            </span>
          </div>

          <h1 className="pn-title">{current.title}</h1>
          <p className="pn-body">{current.content}</p>

          {!!current.scripture && (
            <div className="pn-scripture">
              <span className="pn-scripture-lbl">Scripture</span>
              <span className="pn-scripture-txt">{current.scripture}</span>
            </div>
          )}

          {Array.isArray(current.friends) && current.friends.length > 0 && (
            <div className="pn-friends">
              <span className="pn-friends-lbl">Praying for:</span>
              {current.friends.map(f => (
                <span key={f.id} className="pn-friend-chip">{f.name}</span>
              ))}
            </div>
          )}

          {/* Inline reflection — optional, saved when user clicks
              "Done, Next →". Empty = no save. */}
          {!isPraise && (
            <div className="pn-reflection">
              <label className="pn-reflection-lbl">
                Add a quick reflection (optional)
              </label>
              <textarea
                className="pn-reflection-area"
                rows={3}
                placeholder="Something God placed on your heart while praying…"
                value={updateText}
                onChange={e => setUpdateText(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Controls. */}
        <div className="pn-controls">
          <button
            className="pn-ctrl pn-back"
            onClick={goPrev}
            disabled={idx === 0}
          >← Back</button>

          <div className="pn-ctrl-spacer"/>

          {!isPraise && (
            <button className="pn-ctrl pn-mark-answered" onClick={markAnswered}>
              ✓ Mark answered
            </button>
          )}

          <button className="pn-ctrl pn-edit" onClick={() => {
            onClose?.();
            setTimeout(() => onOpenPrayer?.(current), 0);
          }}>
            ✎ Open in Wall
          </button>

          <button className="pn-ctrl pn-skip" onClick={skipNext}>
            Skip
          </button>

          <button
            className="pn-ctrl pn-next"
            onClick={goNext}
            disabled={savingUpdate}
          >
            {savingUpdate ? 'Saving…' : (isLast ? 'Finish 🙏' : 'Done, Next →')}
          </button>
        </div>
      </div>
    </div>
  );
}
