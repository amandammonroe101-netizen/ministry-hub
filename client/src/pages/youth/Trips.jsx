import { useMemo, useState, useEffect, useRef } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Trips.css';

/* Youth → Trips & Retreats
   Storage:
     youth:trips    — array of trip objects
     youth:tripDocs — array of { id, tripId, memberId, name, dataUrl, ... }
                      kept out of the trip object so the doc can't bust
                      Firestore's 1MB single-doc limit.
   Roster pulls from youth:students for names.
   Synced events go to: calendar-events (source: 'youth-trip'). */

const ACCENT = '#b8410c';
const CAL_SOURCE = 'youth-trip';
const MAX_DOC_BYTES = 500 * 1024; // 500 KB per file — keeps Firestore happy.

const DEFAULT_TRIP = () => ({
  id:             't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
  name:           '',
  location:       '',
  startDate:      new Date().toISOString().slice(0, 10),
  endDate:        '',
  cost:           0,
  registered:     0,
  syncToCalendar: false,
  description:    '',
  roster:         [],   // [string] — student id or guest name
  rooms:          [],   // [{ id, name, capacity, occupantIds: [string] }]
  packingLists:   { students: [], volunteers: [], user: [] }, // each: [{ id, item, done }]
  schedule:       [],   // [{ id, day, time, activity }]
  permissions:    {},   // { rosterIdOrName: 'signed'|'pending'|'missing' }
  notes:          '',
  createdAt:      Date.now(),
});

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/** Normalize a stored trip so newer code can rely on the modern shape
 *  regardless of when the doc was written. Migrates:
 *    • packingList (single array) → packingLists.students
 *    • room.occupants (CSV string) → room.occupantIds (empty — names
 *      can't be reliably matched to ids, so we just clear it). */
function normalizeTrip(t) {
  if (!t) return t;
  const next = { ...t };
  if (!next.packingLists || typeof next.packingLists !== 'object') {
    next.packingLists = {
      students:   Array.isArray(t.packingList) ? t.packingList : [],
      volunteers: [],
      user:       [],
    };
  } else {
    next.packingLists = {
      students:   Array.isArray(t.packingLists.students)   ? t.packingLists.students   : [],
      volunteers: Array.isArray(t.packingLists.volunteers) ? t.packingLists.volunteers : [],
      user:       Array.isArray(t.packingLists.user)       ? t.packingLists.user       : [],
    };
  }
  next.rooms = (Array.isArray(t.rooms) ? t.rooms : []).map(r => ({
    ...r,
    occupantIds: Array.isArray(r.occupantIds) ? r.occupantIds : [],
  }));
  next.permissions = t.permissions && typeof t.permissions === 'object' ? t.permissions : {};
  next.roster = Array.isArray(t.roster) ? t.roster : [];
  return next;
}

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function Trips() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [tripsRaw, setTrips, { loading }] = useUserStoreKey('youth:trips', []);
  const [students] = useUserStoreKey('youth:students', []);
  const [calendarEvents, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [docs, setDocs] = useUserStoreKey('youth:tripDocs', []);

  const list        = useMemo(() => (Array.isArray(tripsRaw) ? tripsRaw : []).map(normalizeTrip), [tripsRaw]);
  const studentList = Array.isArray(students) ? students : [];
  const docList     = Array.isArray(docs) ? docs : [];

  const [openId, setOpenId] = useState(null);
  const [mode,   setMode]   = useState('view');
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => { if (openId) setMode('view'); }, [openId]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => {
    const f = list.filter(t =>
      filter === 'upcoming' ? (t.endDate || t.startDate || '') >= today :
      filter === 'past'     ? (t.endDate || t.startDate || '') <  today : true
    );
    return [...f].sort((a, b) =>
      filter === 'past'
        ? (b.startDate || '').localeCompare(a.startDate || '')
        : (a.startDate || '').localeCompare(b.startDate || '')
    );
  }, [list, filter, today]);

  const open = openId ? list.find(t => t.id === openId) : null;
  const openDocs = open ? docList.filter(d => d.tripId === open.id) : [];

  /* ── Calendar sync helpers ──────────────────────────────────── */
  const upsertCalendarFor = (trip) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const payload = {
        title:           trip.name || `Trip ${trip.startDate}`,
        description:     [trip.location, trip.description].filter(Boolean).join(' — '),
        event_date:      trip.startDate || '',
        end_date:        trip.endDate   || '',
        event_time:      '',
        color:           '#b8410c',
        category:        'youth',
        source:          CAL_SOURCE,
        source_id:       trip.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      const idx = evList.findIndex(e => e.source === CAL_SOURCE && e.source_id === trip.id);
      if (idx >= 0) {
        const next = [...evList];
        next[idx] = { ...evList[idx], ...payload };
        return next;
      }
      return [
        { id: 'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          created_at: new Date().toISOString(),
          ...payload },
        ...evList,
      ];
    });
  };
  const removeCalendarFor = (tripId) =>
    setCalendarEvents(prev =>
      (prev || []).filter(e => !(e.source === CAL_SOURCE && e.source_id === tripId))
    );

  /* ── Mutations ─────────────────────────────────────────────── */
  const add = () => {
    const t = DEFAULT_TRIP();
    setTrips(prev => [t, ...(prev || [])]);
    setOpenId(t.id);
    setMode('edit');
  };

  const update = (id, patch) => {
    const current = list.find(t => t.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setTrips(prev => (prev || []).map(t => t.id === id ? next : t));
    if (next.syncToCalendar) upsertCalendarFor(next);
  };

  const remove = (id) => {
    if (!confirm('Remove this trip?')) return;
    setTrips(prev => (prev || []).filter(t => t.id !== id));
    removeCalendarFor(id);
    setDocs(prev => (prev || []).filter(d => d.tripId !== id));
    if (openId === id) setOpenId(null);
  };

  const toggleSync = (id) => {
    const current = list.find(t => t.id === id);
    if (!current) return;
    const willSync = !current.syncToCalendar;
    const next = { ...current, syncToCalendar: willSync };
    setTrips(prev => (prev || []).map(t => t.id === id ? next : t));
    if (willSync) upsertCalendarFor(next);
    else          removeCalendarFor(id);
  };

  /* ── Doc upload / download / delete ──────────────────────────
     Stored in a separate Firestore key so the trip object stays small. */
  const addDoc = async (tripId, memberId, file) => {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      alert(`File "${file.name}" is too large (${Math.round(file.size/1024)} KB). Max ${Math.round(MAX_DOC_BYTES/1024)} KB.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const doc = {
        id:         'td_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        tripId,
        memberId,
        name:       file.name,
        dataUrl,
        size:       file.size,
        type:       file.type,
        uploadedAt: new Date().toISOString(),
      };
      setDocs(prev => [doc, ...(prev || [])]);
    } catch (err) {
      console.error('[Trips] upload failed:', err);
      alert('Upload failed.');
    }
  };
  const removeDoc = (docId) => {
    setDocs(prev => (prev || []).filter(d => d.id !== docId));
  };
  const removeDocsForMember = (tripId, memberId) => {
    setDocs(prev => (prev || []).filter(d => !(d.tripId === tripId && d.memberId === memberId)));
  };

  /* ── Interactive view-mode action: toggle a user packing item ── */
  const toggleUserPackingItem = (tripId, itemId) => {
    const t = list.find(x => x.id === tripId);
    if (!t) return;
    const userList = (t.packingLists?.user || []).map(i =>
      i.id === itemId ? { ...i, done: !i.done } : i
    );
    update(tripId, { packingLists: { ...t.packingLists, user: userList } });
  };

  const stats = [
    { n: list.filter(t => (t.endDate || t.startDate || '') >= today).length, label: 'upcoming' },
    { n: list.filter(t => (t.endDate || t.startDate || '') <  today).length, label: 'past' },
    { n: list.length, label: 'total' },
  ];

  return (
    <YouthShell
      groupLabel="Events" groupIcon="📅"
      icon="🏕" title="Trips & Retreats"
      accent={ACCENT}
      subtitle="Per-trip dashboard for roster, rooms, packing list, schedule, and permission slips. Double-click a card to view; toggle Sync to push it to your Calendar."
      actions={<button className="yps-add-btn" onClick={add}>＋ New trip</button>}
      stats={stats}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yt-tabs">
        <button className={`yps-chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button className={`yps-chip ${filter === 'past'     ? 'on' : ''}`} onClick={() => setFilter('past')}>Past</button>
        <button className={`yps-chip ${filter === 'all'      ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">🏕</div><div className="yps-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">🏕</div>
          <div className="yps-empty-title">{list.length === 0 ? 'No trips planned' : 'No trips in this view'}</div>
          <div className="yps-empty-sub">{list.length === 0 ? 'Tap "＋ New trip" to plan your first retreat or mission trip.' : 'Try switching filter.'}</div>
        </div>
      ) : (
        <div className="yt-grid">
          {visible.map(t => {
            const days = countDays(t.startDate, t.endDate);
            const rosterCount = t.roster.length;
            const signed = Object.values(t.permissions || {}).filter(v => v === 'signed').length;
            return (
              <article
                key={t.id}
                className="yt-card"
                onDoubleClick={() => { setOpenId(t.id); setMode('view'); }}
                title="Double-click to view"
              >
                <header className="yt-card-hd">
                  <h3 className="yt-card-name">{t.name || 'Untitled trip'}</h3>
                  {days > 0 && <span className="yps-pill accent">{days}d</span>}
                </header>
                <div className="yt-card-when">📅 {fmtRange(t.startDate, t.endDate)}</div>
                {t.location && <div className="yt-card-loc">📍 {t.location}</div>}
                <div className="yt-card-stats">
                  {!!t.registered && <span>📝 {t.registered} registered</span>}
                  <span>👥 {rosterCount} roster</span>
                  <span>✓ {signed} signed</span>
                  {!!t.cost && <span>💰 ${t.cost}/pp</span>}
                </div>
                <div className="yt-row-actions" onClick={e => e.stopPropagation()}>
                  <label className="yt-sync" title="Sync this trip to the Calendar">
                    <input type="checkbox" checked={!!t.syncToCalendar} onChange={() => toggleSync(t.id)} />
                    <span>📆 Sync</span>
                  </label>
                  <button type="button" className="yt-delete-btn" onClick={() => remove(t.id)} title="Delete this trip">🗑</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <TripModal
          trip={open}
          students={studentList}
          docs={openDocs}
          mode={mode}
          onSetMode={setMode}
          onChange={(p) => update(open.id, p)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
          onToggleSync={() => toggleSync(open.id)}
          onAddDoc={(memberId, file) => addDoc(open.id, memberId, file)}
          onRemoveDoc={removeDoc}
          onRemoveDocsForMember={(memberId) => removeDocsForMember(open.id, memberId)}
          onToggleUserItem={(itemId) => toggleUserPackingItem(open.id, itemId)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

function countDays(s, e) {
  if (!s) return 0;
  if (!e || e === s) return 1;
  const a = new Date(s); const b = new Date(e);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
function fmtRange(s, e) {
  if (!s) return 'TBD';
  if (!e || e === s) return s;
  return `${s} → ${e}`;
}

/* ─────────────────────────────────────────────────────────────
   Modal — View / Edit
   ───────────────────────────────────────────────────────────── */
function TripModal({
  trip, students, docs, mode, onSetMode,
  onChange, onDelete, onClose, onToggleSync,
  onAddDoc, onRemoveDoc, onRemoveDocsForMember,
  onToggleUserItem,
}) {
  return (
    <div className="yt-modal-backdrop" onClick={onClose}>
      <div className="yt-modal" onClick={e => e.stopPropagation()}>
        <header className="yt-modal-hd">
          <div className="yt-modal-hd-main">
            <div className="yt-modal-hd-crumb">
              {mode === 'view' ? '👁 Viewing' : '✎ Editing'} · {fmtRange(trip.startDate, trip.endDate)}
            </div>
            <h2>{trip.name || 'New trip'}</h2>
          </div>
          <div className="yt-modal-hd-actions">
            <label className="yt-sync yt-sync-modal" title="Sync this trip to the Calendar">
              <input type="checkbox" checked={!!trip.syncToCalendar} onChange={onToggleSync} />
              <span>📆 Sync</span>
            </label>
            <button className="yps-btn ghost" onClick={onClose}>✕</button>
          </div>
        </header>

        {mode === 'view'
          ? <TripView
              trip={trip}
              students={students}
              docs={docs}
              onToggleUserItem={onToggleUserItem}
            />
          : <TripEdit
              trip={trip}
              students={students}
              docs={docs}
              onChange={onChange}
              onAddDoc={onAddDoc}
              onRemoveDoc={onRemoveDoc}
              onRemoveDocsForMember={onRemoveDocsForMember}
            />
        }

        <footer className="yt-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete trip</button>
          <div className="yt-modal-ft-right">
            {mode === 'view' ? (
              <button className="yps-add-btn" onClick={() => onSetMode('edit')}>✎ Edit</button>
            ) : (
              <button className="yps-add-btn" onClick={() => onSetMode('view')}>✓ Done editing</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   View mode — read-only, hides empty sections
   ───────────────────────────────────────────────────────────── */
function TripView({ trip, students, docs, onToggleUserItem }) {
  const isMulti     = trip.endDate && trip.endDate !== trip.startDate;
  const days        = countDays(trip.startDate, trip.endDate);
  const rosterCount = trip.roster.length;
  const signedCount = Object.values(trip.permissions || {}).filter(v => v === 'signed').length;

  const memberName = (id) => {
    const stu = students.find(s => s.id === id);
    return stu ? (stu.name || '(unnamed)') : id;
  };
  const docsFor = (memberId) => docs.filter(d => d.memberId === memberId);

  const hasStats =
    Number(trip.registered) > 0 || rosterCount > 0 || Number(trip.cost) > 0;
  const hasRoster   = rosterCount > 0;
  const hasRooms    = trip.rooms?.some(r => r.name || (r.occupantIds && r.occupantIds.length));
  const hasSchedule = trip.schedule?.some(s => s.activity || s.day || s.time);

  const pl = trip.packingLists || { students: [], volunteers: [], user: [] };
  const hasStudentsPack   = pl.students.some(p => p.item);
  const hasVolunteersPack = pl.volunteers.some(p => p.item);
  const hasUserPack       = pl.user.some(p => p.item);

  return (
    <div className="yt-view">
      <section className="yt-view-hero">
        <div className="yt-view-date">
          📅 {fmtRange(trip.startDate, trip.endDate)}
          {isMulti && <span className="yps-pill accent">{days}-day trip</span>}
        </div>
        {trip.location    && <div className="yt-view-loc">📍 {trip.location}</div>}
        {trip.description && <p className="yt-view-desc">{trip.description}</p>}
      </section>

      {hasStats && (
        <section className="yt-view-stats">
          {Number(trip.registered) > 0 && <ViewStat emoji="📝" label="Registered" value={trip.registered} />}
          {rosterCount > 0              && <ViewStat emoji="👥" label="Roster"     value={rosterCount} />}
          {Number(trip.cost) > 0        && <ViewStat emoji="💰" label="Per person" value={`$${trip.cost}`} />}
          {rosterCount > 0 && (
            <ViewStat emoji="✍" label="Permissions" value={`${signedCount}/${rosterCount}`} />
          )}
        </section>
      )}

      {hasRoster && (
        <ViewSection title="Roster" emoji="👥">
          <ul className="yt-view-list">
            {trip.roster.map(r => {
              const stu = students.find(s => s.id === r);
              const name = stu ? stu.name : r;
              const perm = trip.permissions?.[r] || 'pending';
              const mdocs = docsFor(r);
              return (
                <li key={r} className="yt-view-roster-row">
                  <span className="yt-view-name">{name || '(unnamed)'}</span>
                  {!stu && <span className="yps-pill">guest</span>}
                  <span className={`yt-view-perm yt-perm-${perm}`}>{perm}</span>
                  {mdocs.length > 0 && (
                    <div className="yt-view-docs">
                      {mdocs.map(d => (
                        <a
                          key={d.id}
                          className="yt-doc-chip"
                          href={d.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
                        >
                          📎 {d.name}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ViewSection>
      )}

      {hasRooms && (
        <ViewSection title="Rooms / Cabins" emoji="🛏">
          <ul className="yt-view-list">
            {trip.rooms.filter(r => r.name || (r.occupantIds && r.occupantIds.length)).map(r => (
              <li key={r.id} className="yt-view-room-row">
                <span className="yt-view-room-name">{r.name || '—'}</span>
                {r.capacity > 0 && (
                  <span className="yps-pill">
                    {(r.occupantIds || []).length}/{r.capacity}
                  </span>
                )}
                {(r.occupantIds || []).length > 0 && (
                  <span className="yt-view-occupants">
                    {(r.occupantIds || []).map(memberName).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {hasStudentsPack && (
        <ViewSection
          title="Students Packing List" emoji="🧒"
          action={
            <button
              className="yps-btn"
              onClick={() => downloadPackingList({
                tripName: trip.name,
                dateRange: fmtRange(trip.startDate, trip.endDate),
                listLabel: 'Students Packing List',
                items: pl.students,
              })}
            >📥 Download</button>
          }
        >
          <ul className="yt-view-list">
            {pl.students.filter(p => p.item).map(p => (
              <li key={p.id} className="yt-view-pack-row yt-view-pack-plain">
                <span className="yt-view-pack-bullet">•</span>
                <span>{p.item}</span>
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {hasVolunteersPack && (
        <ViewSection
          title="Volunteers Packing List" emoji="🙋"
          action={
            <button
              className="yps-btn"
              onClick={() => downloadPackingList({
                tripName: trip.name,
                dateRange: fmtRange(trip.startDate, trip.endDate),
                listLabel: 'Volunteers Packing List',
                items: pl.volunteers,
              })}
            >📥 Download</button>
          }
        >
          <ul className="yt-view-list">
            {pl.volunteers.filter(p => p.item).map(p => (
              <li key={p.id} className="yt-view-pack-row yt-view-pack-plain">
                <span className="yt-view-pack-bullet">•</span>
                <span>{p.item}</span>
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {hasUserPack && (
        <ViewSection title="My Packing List" emoji="🎒">
          <ul className="yt-view-list">
            {pl.user.filter(p => p.item).map(p => (
              <li key={p.id} className={`yt-view-pack-row yt-view-pack-interactive ${p.done ? 'yt-done' : ''}`}>
                <label className="yt-view-check-label">
                  <input
                    type="checkbox"
                    checked={!!p.done}
                    onChange={() => onToggleUserItem(p.id)}
                  />
                  <span>{p.item}</span>
                </label>
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {hasSchedule && (
        <ViewSection title="Schedule" emoji="📋">
          <ul className="yt-view-list">
            {trip.schedule.filter(s => s.activity || s.day || s.time).map(s => (
              <li key={s.id} className="yt-view-sched-row">
                <span className="yt-view-sched-day">{s.day || '—'}</span>
                <span className="yt-view-sched-time">{s.time || '—'}</span>
                <span className="yt-view-sched-act">{s.activity || <em className="yps-muted">—</em>}</span>
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {trip.notes && (
        <ViewSection title="Notes" emoji="📝">
          <div className="yt-view-text">{trip.notes}</div>
        </ViewSection>
      )}

      {!trip.location && !trip.description && !hasStats && !hasRoster && !hasRooms
        && !hasStudentsPack && !hasVolunteersPack && !hasUserPack
        && !hasSchedule && !trip.notes && (
        <div className="yt-view-empty">
          Nothing filled in yet — click <b>Edit</b> below to start planning this trip.
        </div>
      )}
    </div>
  );
}

function ViewSection({ title, emoji, action, children }) {
  return (
    <section className="yt-view-section">
      <header className="yt-view-section-hd">
        <h3 className="yt-view-section-title">{emoji} {title}</h3>
        {action && <div className="yt-view-section-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}
function ViewStat({ emoji, label, value }) {
  return (
    <div className="yt-view-stat">
      <div className="yt-view-stat-emoji">{emoji}</div>
      <div className="yt-view-stat-value">{value}</div>
      <div className="yt-view-stat-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Edit mode
   ───────────────────────────────────────────────────────────── */
function TripEdit({
  trip, students, docs,
  onChange, onAddDoc, onRemoveDoc, onRemoveDocsForMember,
}) {
  const [tab, setTab] = useState('details');

  const rosterDisplay = trip.roster.map(r => {
    const stu = students.find(s => s.id === r);
    return stu ? { id: r, name: stu.name || '(unnamed)', linked: true } : { id: r, name: r, linked: false };
  });

  const setPermission = (memberId, status) =>
    onChange({ permissions: { ...trip.permissions, [memberId]: status } });

  const addStudent = (sid) => {
    if (trip.roster.includes(sid)) return;
    onChange({ roster: [...trip.roster, sid], permissions: { ...trip.permissions, [sid]: 'pending' } });
  };
  const addGuest = (name) => {
    if (!name.trim()) return;
    if (trip.roster.includes(name)) return;
    onChange({ roster: [...trip.roster, name], permissions: { ...trip.permissions, [name]: 'pending' } });
  };
  const removeMember = (id) => {
    const nextPerm = { ...trip.permissions }; delete nextPerm[id];
    /* Also strip them from every room. */
    const nextRooms = trip.rooms.map(r => ({
      ...r,
      occupantIds: (r.occupantIds || []).filter(oid => oid !== id),
    }));
    onChange({
      roster:      trip.roster.filter(r => r !== id),
      permissions: nextPerm,
      rooms:       nextRooms,
    });
    onRemoveDocsForMember(id);
  };

  /* Packing list per audience. */
  const setPackingList = (which, items) =>
    onChange({ packingLists: { ...trip.packingLists, [which]: items } });

  return (
    <>
      <nav className="yt-tabs-row">
        {['details', 'roster', 'rooms', 'packing', 'schedule'].map(t => (
          <button key={t} className={`yps-chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {tab === 'details' && (
        <div className="yt-grid">
          <Field label="Name" full><input className="yps-input" value={trip.name} onChange={e => onChange({ name: e.target.value })} /></Field>
          <Field label="Location" full><input className="yps-input" value={trip.location} onChange={e => onChange({ location: e.target.value })} /></Field>
          <Field label="Start date"><input type="date" className="yps-input" value={trip.startDate} onChange={e => onChange({ startDate: e.target.value })} /></Field>
          <Field label="End date (optional)"><input type="date" className="yps-input" value={trip.endDate} min={trip.startDate || ''} onChange={e => onChange({ endDate: e.target.value })} /></Field>
          <Field label="Cost per person ($)">
            <NumberStepper value={trip.cost} onChange={(v) => onChange({ cost: v })} step={5} />
          </Field>
          <Field label="Registered">
            <NumberStepper value={trip.registered} onChange={(v) => onChange({ registered: v })} />
          </Field>
          <Field label="Description" full><textarea className="yps-textarea" rows={4} value={trip.description} onChange={e => onChange({ description: e.target.value })} placeholder="Theme, partner organization, ages, what to expect…" /></Field>
          <Field label="Notes" full><textarea className="yps-textarea" rows={3} value={trip.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Travel logistics, dietary needs, prayer points…" /></Field>
        </div>
      )}

      {tab === 'roster' && (
        <RosterPanel
          students={students}
          roster={rosterDisplay}
          permissions={trip.permissions}
          docs={docs}
          onAddStudent={addStudent}
          onAddGuest={addGuest}
          onRemove={removeMember}
          onSetPermission={setPermission}
          onAddDoc={onAddDoc}
          onRemoveDoc={onRemoveDoc}
        />
      )}

      {tab === 'rooms' && (
        <RoomsEditor
          rooms={trip.rooms}
          roster={rosterDisplay}
          onChange={(items) => onChange({ rooms: items })}
        />
      )}

      {tab === 'packing' && (
        <PackingPanel
          lists={trip.packingLists}
          onChange={setPackingList}
          tripName={trip.name}
          dateRange={fmtRange(trip.startDate, trip.endDate)}
        />
      )}

      {tab === 'schedule' && (
        <ListEditor
          label="Schedule"
          items={trip.schedule}
          onChange={(items) => onChange({ schedule: items })}
          shape={() => ({ id: makeId('sc'), day: 'Day 1', time: '9:00 AM', activity: '' })}
          render={(item, set) => (
            <>
              <input className="yps-input yt-w-sm" value={item.day} onChange={e => set({ day: e.target.value })} />
              <input className="yps-input yt-w-sm" value={item.time} onChange={e => set({ time: e.target.value })} />
              <input className="yps-input" placeholder="Activity" value={item.activity} onChange={e => set({ activity: e.target.value })} />
            </>
          )}
          emptyText="No schedule items yet."
        />
      )}
    </>
  );
}

function NumberStepper({ value, onChange, min = 0, step = 1 }) {
  const v = Number(value) || 0;
  return (
    <div className="yt-stepper">
      <button type="button" className="yt-stepper-btn" onClick={() => onChange(Math.max(min, v - step))} title="Decrease" aria-label="Decrease">−</button>
      <input type="number" className="yt-stepper-input" value={v} min={min} step={step} onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))} />
      <button type="button" className="yt-stepper-btn" onClick={() => onChange(v + step)} title="Increase" aria-label="Increase">＋</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Roster panel — adds per-member doc upload, but only when
   that member's permission status is 'signed'.
   ───────────────────────────────────────────────────────────── */
function RosterPanel({
  students, roster, permissions, docs,
  onAddStudent, onAddGuest, onRemove, onSetPermission,
  onAddDoc, onRemoveDoc,
}) {
  const [guest, setGuest] = useState('');
  const available = students.filter(s => !roster.some(r => r.id === s.id));

  return (
    <div className="yt-panel">
      <div className="yt-roster-add">
        <select className="yps-select" defaultValue="" onChange={e => { if (e.target.value) { onAddStudent(e.target.value); e.target.value = ''; } }}>
          <option value="">＋ Add from Students…</option>
          {available.map(s => <option key={s.id} value={s.id}>{s.name || '(unnamed)'} {s.grade ? `· ${s.grade}` : ''}</option>)}
        </select>
        <div className="yt-guest-add">
          <input className="yps-input" placeholder="Or add a guest name…" value={guest} onChange={e => setGuest(e.target.value)} />
          <button className="yps-btn" onClick={() => { onAddGuest(guest); setGuest(''); }} disabled={!guest.trim()}>＋ Guest</button>
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="yps-muted yt-empty">No one on the roster yet.</div>
      ) : (
        <ul className="yt-roster">
          {roster.map(m => {
            const perm = permissions[m.id] || 'pending';
            const memberDocs = docs.filter(d => d.memberId === m.id);
            const isSigned = perm === 'signed';
            return (
              <li key={m.id} className="yt-roster-row">
                <div className="yt-roster-main">
                  <span className="yt-roster-name">
                    {m.name}
                    {!m.linked && <span className="yps-pill">guest</span>}
                  </span>
                  <div className="yt-roster-perm">
                    {['signed', 'pending', 'missing'].map(s => (
                      <button
                        key={s}
                        className={`yps-chip yt-perm-${s} ${perm === s ? 'on' : ''}`}
                        onClick={() => onSetPermission(m.id, s)}
                      >{s}</button>
                    ))}
                  </div>
                  <button className="yps-btn ghost" onClick={() => onRemove(m.id)}>✕</button>
                </div>

                {/* Doc upload — only visible when this member is marked Signed. */}
                {isSigned && (
                  <div className="yt-roster-docs">
                    <DocUploader memberId={m.id} onAddDoc={onAddDoc} />
                    {memberDocs.length > 0 && (
                      <div className="yt-doc-list">
                        {memberDocs.map(d => (
                          <div key={d.id} className="yt-doc-pill">
                            <a
                              className="yt-doc-pill-link"
                              href={d.dataUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
                            >📎 {d.name}</a>
                            <button
                              type="button"
                              className="yt-doc-pill-x"
                              onClick={() => onRemoveDoc(d.id)}
                              title="Remove this file"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DocUploader({ memberId, onAddDoc }) {
  const inputRef = useRef(null);
  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      // sequentially to avoid racing on the same Firestore doc
      // eslint-disable-next-line no-await-in-loop
      await onAddDoc(memberId, f);
    }
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <label className="yt-doc-upload">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        onChange={onPick}
      />
      <span>📎 Upload signed doc</span>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────
   Rooms editor — occupants is a chip multi-select drawn from
   the trip's roster (linked students + guests).
   ───────────────────────────────────────────────────────────── */
function RoomsEditor({ rooms, roster, onChange }) {
  const add = () => onChange([...(rooms || []), { id: makeId('rm'), name: '', capacity: 4, occupantIds: [] }]);
  const update = (id, patch) => onChange(rooms.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRoom = (id) => onChange(rooms.filter(r => r.id !== id));

  const toggleOccupant = (roomId, memberId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const occ = Array.isArray(room.occupantIds) ? room.occupantIds : [];
    const next = occ.includes(memberId)
      ? occ.filter(x => x !== memberId)
      : [...occ, memberId];
    update(roomId, { occupantIds: next });
  };

  return (
    <div className="yt-panel">
      <header className="yt-panel-hd">
        <h3>Rooms / Cabins</h3>
        <button className="yps-btn" onClick={add}>＋ Add room</button>
      </header>

      {(!rooms || rooms.length === 0) ? (
        <div className="yps-muted yt-empty">No rooms yet.</div>
      ) : roster.length === 0 ? (
        <div className="yps-muted yt-empty">Add roster members first — rooms pull occupants from the roster.</div>
      ) : (
        <ul className="yt-rooms-list">
          {rooms.map(room => {
            const occ = Array.isArray(room.occupantIds) ? room.occupantIds : [];
            const cap = Number(room.capacity) || 0;
            return (
              <li key={room.id} className="yt-room">
                <header className="yt-room-hd">
                  <input
                    className="yps-input yt-room-name"
                    placeholder="Room name"
                    value={room.name}
                    onChange={e => update(room.id, { name: e.target.value })}
                  />
                  <label className="yt-room-cap">
                    <span>Cap</span>
                    <input
                      type="number"
                      className="yps-input"
                      value={room.capacity}
                      min={0}
                      onChange={e => update(room.id, { capacity: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <span className={`yps-pill ${cap > 0 && occ.length > cap ? 'yt-room-over' : ''}`}>
                    {occ.length}{cap > 0 ? `/${cap}` : ''}
                  </span>
                  <button className="yps-btn ghost" onClick={() => removeRoom(room.id)}>✕</button>
                </header>
                <OccupantPicker
                  roster={roster}
                  selected={occ}
                  onToggle={(memberId) => toggleOccupant(room.id, memberId)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* Dropdown-style multi-select. Closed it shows the chosen names
   as chips; open it shows a checkbox list of every roster member. */
function OccupantPicker({ roster, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectedSet = new Set(selected);

  return (
    <div className="yt-occ" ref={wrapRef}>
      <button type="button" className="yt-occ-trigger" onClick={() => setOpen(o => !o)}>
        {selected.length === 0 ? (
          <span className="yps-muted">＋ Add occupants from roster</span>
        ) : (
          <div className="yt-occ-chips">
            {selected.map(id => {
              const m = roster.find(r => r.id === id);
              return (
                <span key={id} className="yt-occ-chip">
                  {m?.name || id}
                </span>
              );
            })}
          </div>
        )}
        <span className="yt-occ-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="yt-occ-menu">
          {roster.length === 0 ? (
            <div className="yt-occ-empty yps-muted">Roster is empty.</div>
          ) : roster.map(m => {
            const checked = selectedSet.has(m.id);
            return (
              <label key={m.id} className={`yt-occ-opt ${checked ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(m.id)}
                />
                <span className="yt-occ-opt-name">{m.name}</span>
                {!m.linked && <span className="yps-pill">guest</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Packing panel — three audience-specific lists.
   Students + Volunteers are template lists (no checkboxes; download
   button to hand out). User list keeps an interactive checkbox so
   the planner can mark items as packed.
   ───────────────────────────────────────────────────────────── */
function PackingPanel({ lists, onChange, tripName, dateRange }) {
  const renderPlain = (item, set) => (
    <input
      className="yps-input"
      value={item.item}
      onChange={e => set({ item: e.target.value })}
      placeholder="Bring this…"
    />
  );
  const renderChecked = (item, set) => (
    <>
      <label className="yt-check">
        <input type="checkbox" checked={item.done} onChange={e => set({ done: e.target.checked })} />
      </label>
      <input
        className={`yps-input ${item.done ? 'yt-strike' : ''}`}
        value={item.item}
        onChange={e => set({ item: e.target.value })}
        placeholder="Bring this…"
      />
    </>
  );

  const downloadFor = (label) => () => downloadPackingList({
    tripName, dateRange, listLabel: label,
    items: lists?.[label.toLowerCase().split(' ')[0]] || [],
  });

  return (
    <div className="yt-panel yt-packing-panel">
      <ListEditor
        label="🧒 Students Packing List"
        items={lists?.students || []}
        onChange={(items) => onChange('students', items)}
        shape={() => ({ id: makeId('pl'), item: '' })}
        render={renderPlain}
        emptyText="No items yet."
        extraActions={
          <button
            className="yps-btn"
            onClick={() => downloadPackingList({
              tripName, dateRange,
              listLabel: 'Students Packing List',
              items: lists?.students || [],
            })}
            disabled={!(lists?.students || []).some(i => i.item)}
          >📥 Download</button>
        }
      />

      <ListEditor
        label="🙋 Volunteers Packing List"
        items={lists?.volunteers || []}
        onChange={(items) => onChange('volunteers', items)}
        shape={() => ({ id: makeId('pl'), item: '' })}
        render={renderPlain}
        emptyText="No items yet."
        extraActions={
          <button
            className="yps-btn"
            onClick={() => downloadPackingList({
              tripName, dateRange,
              listLabel: 'Volunteers Packing List',
              items: lists?.volunteers || [],
            })}
            disabled={!(lists?.volunteers || []).some(i => i.item)}
          >📥 Download</button>
        }
      />

      <ListEditor
        label="🎒 My Packing List"
        items={lists?.user || []}
        onChange={(items) => onChange('user', items)}
        shape={() => ({ id: makeId('pl'), item: '', done: false })}
        render={renderChecked}
        emptyText="No items yet."
      />
    </div>
  );
}

/* Build a plain-text packing list and trigger a download. Output:

     <Trip Name> — <List Label>
     <Date range>

     • Item 1
     • Item 2
     ...
*/
function downloadPackingList({ tripName, dateRange, listLabel, items }) {
  const lines = [
    `${tripName || 'Untitled trip'} — ${listLabel}`,
    dateRange || '',
    '',
    ...items.filter(i => i.item).map(i => `• ${i.item}`),
    '',
  ];
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = slugify(tripName || 'trip') + '-' + slugify(listLabel) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slugify(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'list';
}

function ListEditor({ label, items, onChange, shape, render, emptyText, extraActions }) {
  const add = () => onChange([...(items || []), shape()]);
  const update = (id, patch) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id) => onChange(items.filter(i => i.id !== id));

  return (
    <div className="yt-list-block">
      <header className="yt-panel-hd">
        <h3>{label}</h3>
        <div className="yt-panel-hd-actions">
          {extraActions}
          <button className="yps-btn" onClick={add}>＋ Add</button>
        </div>
      </header>
      {(!items || items.length === 0) ? (
        <div className="yps-muted yt-empty">{emptyText}</div>
      ) : (
        <ul className="yt-list">
          {items.map(item => (
            <li key={item.id} className="yt-list-row">
              {render(item, (patch) => update(item.id, patch))}
              <button className="yps-btn ghost" onClick={() => remove(item.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yt-field ${full ? 'full' : ''}`}>
      <span className="yt-field-label">{label}</span>
      {children}
    </label>
  );
}
