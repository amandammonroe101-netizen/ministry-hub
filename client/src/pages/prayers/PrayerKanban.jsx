/* PrayerKanban — three-column board view.

   Each column corresponds to one of the three consolidated
   kinds: Praying / Answered / Praise. Prayers render as small
   draggable cards; dragging a card to another column fires
   onChangeKind(p, kind) which routes through the same
   handleStatusChange the rest of the page uses, keeping the
   write path consistent.

   Native HTML5 drag-and-drop (no extra deps). Drop zones are the
   column body — they highlight while a drag is active so the
   user sees where the card will land. */

import React, { useMemo, useState } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getKind } from './Prayers';
import './PrayerKanban.css';

const COLUMNS = [
  {
    kind:    'praying',
    label:   'Praying',
    emoji:   '🙏',
    accent:  'rgba(167,139,250,.5)',
    tint:    'rgba(140,100,255,.06)',
    sub:     'Open requests',
  },
  {
    kind:    'answered',
    label:   'Answered',
    emoji:   '✓',
    accent:  'rgba(110,231,183,.5)',
    tint:    'rgba(52,211,153,.06)',
    sub:     'Testimonies of what God has done',
  },
  {
    kind:    'praise',
    label:   'Praise',
    emoji:   '✨',
    accent:  'rgba(244,114,182,.5)',
    tint:    'rgba(244,114,182,.06)',
    sub:     'Gratitude — no request attached',
  },
];

const ageDays = (createdAt) => {
  try { return differenceInDays(new Date(), parseISO((createdAt || '').replace(' ', 'T'))); }
  catch { return 0; }
};

export default function PrayerKanban({
  prayers,
  allFriends = [],        // full friends list — used to resolve linked names on each card
  display,                // page-settings display knobs (sortOrder, cardDensity)
  onChangeKind,           // (prayer, kind) => Promise
  onOpenPrayer,           // (prayer) => void  (open detail in Wall)
  onNew,                  // (entryType) => void
}) {
  /* Pull settings off the display prop with safe defaults so a
     missing key (Firestore default never reached, brand-new user)
     doesn't crash sort/density logic. */
  const sortOrder   = display?.sortOrder   || 'newest';
  const cardDensity = display?.cardDensity || 'comfy';

  const grouped = useMemo(() => {
    const map = { praying: [], answered: [], praise: [] };
    for (const p of prayers || []) map[getKind(p)]?.push(p);

    /* Page-settings sort order — applied per column. The Page
       Settings → Display dropdown was stored but never read; this
       hooks it up. Newest/Oldest sort by created_at, "Most updates"
       sorts by the count of items in p.updates. */
    const cmpNewest      = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');
    const cmpOldest      = (a, b) => (a.created_at || '').localeCompare(b.created_at || '');
    const cmpMostUpdated = (a, b) => (b.updates?.length || 0) - (a.updates?.length || 0);
    const cmp = sortOrder === 'oldest'      ? cmpOldest
              : sortOrder === 'mostUpdated' ? cmpMostUpdated
              :                               cmpNewest;
    for (const k of Object.keys(map)) map[k].sort(cmp);

    /* Urgent cards still float to the top within Praying — applied
       AFTER the user's sort so urgency wins, but within urgent/
       non-urgent groups the user's order is preserved. */
    map.praying.sort((a, b) => Number(!!b.is_urgent) - Number(!!a.is_urgent));
    return map;
  }, [prayers, sortOrder]);

  /* id → friend name lookup so each card can show the names of the
     people it's linked to. Built once per friends-list change so we
     don't re-scan the array for every card render. */
  const friendsById = useMemo(() => {
    const m = new Map();
    for (const f of allFriends || []) m.set(f.id, f.name || 'Friend');
    return m;
  }, [allFriends]);

  /* drag state — tracks the prayer being dragged + the column
     currently being hovered for visual feedback. */
  const [draggingId, setDraggingId] = useState(null);
  const [hoverKind,  setHoverKind]  = useState(null);

  const handleDragStart = (e, p) => {
    setDraggingId(p.id);
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
    try { e.dataTransfer.setData('text/plain', String(p.id)); } catch { /* noop */ }
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setHoverKind(null);
  };
  const handleDragOver = (e, kind) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
    if (hoverKind !== kind) setHoverKind(kind);
  };
  const handleDragLeave = (kind) => {
    if (hoverKind === kind) setHoverKind(null);
  };
  const handleDrop = async (e, targetKind) => {
    e.preventDefault();
    setHoverKind(null);
    const id = draggingId ?? Number(e.dataTransfer.getData('text/plain'));
    setDraggingId(null);
    if (!id) return;
    const p = (prayers || []).find(x => x.id === id);
    if (!p) return;
    if (getKind(p) === targetKind) return;
    try { await onChangeKind?.(p, targetKind); } catch { /* surfaced upstream */ }
  };

  const totalCount = (prayers || []).length;

  return (
    <div className="pk-root">
      <div className="pk-hd">
        <div className="pk-hd-title">📋 Prayer Board</div>
        <div className="pk-hd-sub">
          {totalCount === 0
            ? 'Add a prayer to get started — drag cards between columns to update their status.'
            : 'Drag cards between columns to update their status.'}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="pk-empty">
          <div className="pk-empty-icon">🙏</div>
          <div className="pk-empty-title">No prayers yet.</div>
          <div className="pk-empty-actions">
            {/* Praise was removed as a separate empty-state CTA —
                the kind picker inside the New Prayer form already
                handles Praise alongside Praying / Answered, so a
                separate button just duplicated the option. */}
            <button className="app-btn primary" onClick={() => onNew?.('request')}>
              ✦ New Prayer
            </button>
          </div>
        </div>
      ) : (
        <div className="pk-columns">
          {COLUMNS.map(col => {
            const list = grouped[col.kind] || [];
            const isHover = hoverKind === col.kind;
            return (
              <section
                key={col.kind}
                className={`pk-col ${isHover ? 'hover' : ''}`}
                style={{ '--pk-accent': col.accent, '--pk-tint': col.tint }}
                onDragOver={(e) => handleDragOver(e, col.kind)}
                onDragLeave={() => handleDragLeave(col.kind)}
                onDrop={(e) => handleDrop(e, col.kind)}
              >
                <header className="pk-col-hd">
                  <span className="pk-col-emoji">{col.emoji}</span>
                  <span className="pk-col-title">{col.label}</span>
                  {/* Only render the count badge when there's
                      actually something to count — empty columns
                      were showing a "0" pill next to the label. */}
                  {list.length > 0 && (
                    <span className="pk-col-count">{list.length}</span>
                  )}
                </header>
                <div className="pk-col-sub">{col.sub}</div>

                <div className="pk-col-body">
                  {list.length === 0 ? (
                    <div className="pk-col-empty">
                      Drop prayers here to mark them {col.label.toLowerCase()}.
                    </div>
                  ) : (
                    list.map(p => (
                      <KanbanCard
                        key={p.id}
                        prayer={p}
                        friendsById={friendsById}
                        density={cardDensity}
                        dragging={draggingId === p.id}
                        onDragStart={(e) => handleDragStart(e, p)}
                        onDragEnd={handleDragEnd}
                        onOpen={() => onOpenPrayer?.(p)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KanbanCard({ prayer, friendsById, density = 'comfy', dragging, onDragStart, onDragEnd, onOpen }) {
  const age = ageDays(prayer.created_at);
  /* Compact density hides the body snippet — keep the chips + title
     + footer so the card stays useful, just less tall. CSS picks up
     the density class for typography / padding tweaks. */
  const compact = density === 'compact';

  /* Resolve linked friend ids → names so the card can show who
     this prayer is for. Source of truth is `friend_ids` (that's
     what prayerService.setFriends writes); the legacy `friends`
     field is checked as a fallback in case a future caller embeds
     hydrated objects. Names that can't be resolved (deleted
     friend, stale id) are silently skipped. */
  const linkedIds = Array.isArray(prayer.friend_ids)
    ? prayer.friend_ids
    : Array.isArray(prayer.friends)
      ? prayer.friends.map(f => f?.id).filter(Boolean)
      : [];
  const linkedNames = linkedIds
    .map(id => friendsById?.get(id))
    .filter(Boolean);

  return (
    <article
      className={`pk-card density-${density} ${dragging ? 'dragging' : ''} ${prayer.is_urgent ? 'urgent' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title="Click to open · Drag to move"
    >
      <div className="pk-card-pills">
        {/* is_urgent / is_daily are stored as 0/1 numbers (not real
            booleans) so a bare `{prayer.is_urgent && …}` renders a
            literal "0" when the flag is off. !! coerces to boolean
            so React short-circuits cleanly. */}
        {!!prayer.is_urgent && <span className="pk-tag pk-tag-urgent">🔥 Urgent</span>}
        {!!prayer.is_daily && <span className="pk-tag pk-tag-daily">📆 Daily</span>}
        {prayer.category && <span className="pk-tag">{prayer.category}</span>}
      </div>
      <div className="pk-card-title">{prayer.title}</div>
      {/* Snippet hidden in compact density to give a tighter card —
          the chip row + title + footer carry the essentials. */}
      {!compact && prayer.content && (
        <div className="pk-card-snip">
          {prayer.content.slice(0, 110)}{prayer.content.length > 110 ? '…' : ''}
        </div>
      )}

      {/* Friend names — one chip per linked person so the user
          knows at a glance who the prayer is for. Sits between the
          snippet and the footer so it stays close to the content
          it describes. Hidden when nothing is linked. */}
      {linkedNames.length > 0 && (
        <div className="pk-card-friends" title={`Praying for: ${linkedNames.join(', ')}`}>
          <span className="pk-card-friends-icon" aria-hidden="true">👥</span>
          {linkedNames.map((name, i) => (
            <span key={i} className="pk-friend-chip">{name}</span>
          ))}
        </div>
      )}

      <div className="pk-card-foot">
        <span className="pk-card-age">
          {age === 0
            ? 'today'
            : prayer.created_at
              ? format(parseISO(prayer.created_at.replace(' ', 'T')), 'MMM d')
              : ''}
        </span>
      </div>
    </article>
  );
}
