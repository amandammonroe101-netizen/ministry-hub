import { useMemo, useState, useEffect } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './WeeklyNights.css';

/* Youth → Weekly Nights
   Storage: youth:weeklyNights — array of night objects.
   Synced events go to: calendar-events (source: 'youth-weekly-night'). */

const ACCENT = '#b8410c';
const CAL_SOURCE = 'youth-weekly-night';

const DEFAULT_NIGHT = () => ({
  id:             'wn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
  date:           new Date().toISOString().slice(0, 10),
  endDate:        '',
  theme:          '',
  bigIdea:        '',
  scripture:      '',
  runSheet:       [],
  worshipSet:     '',
  lessonNotes:    '',
  gameId:         '',
  announcements:  '',
  attendance:     0,
  guests:         0,
  registered:     0,
  syncToCalendar: false,
  notes:          '',
  createdAt:      Date.now(),
});

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function WeeklyNights() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [nights, setNights, { loading }] = useUserStoreKey('youth:weeklyNights', []);
  const [games] = useUserStoreKey('youth:games', []);
  const [students, setStudents] = useUserStoreKey('youth:students', []);
  const [calendarEvents, setCalendarEvents] = useUserStoreKey('calendar-events', []);

  const list        = Array.isArray(nights)   ? nights   : [];
  const gameList    = Array.isArray(games)    ? games    : [];
  const studentList = Array.isArray(students) ? students : [];

  /** Persist a night's attendance checklist AND propagate the date
   *  back to each student's firstAttended / lastAttended so the
   *  Parent-page pastoral nudges can fire. Run on every attendance
   *  change — idempotent, only updates students whose dates would
   *  actually move. */
  const setNightAttendance = (nightId, attendedIds) => {
    setNights(prev => (prev || []).map(n => n.id === nightId
      ? { ...n, attendedStudentIds: attendedIds, attendance: attendedIds.length + (Number(n.guests) || 0) }
      : n));
    const night = list.find(n => n.id === nightId);
    const date  = night?.date;
    if (!date) return;
    setStudents(prev => (prev || []).map(s => {
      if (!attendedIds.includes(s.id)) return s;
      const next = { ...s };
      if (!next.firstAttended) next.firstAttended = date;
      if (!next.lastAttended || date > next.lastAttended) next.lastAttended = date;
      return next;
    }));
  };

  const [openId,   setOpenId]   = useState(null);
  const [mode,     setMode]     = useState('view'); // 'view' | 'edit'
  const [filter,   setFilter]   = useState('upcoming');

  /* Always open a freshly-selected night in view mode. */
  useEffect(() => { if (openId) setMode('view'); }, [openId]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => {
    const f = list.filter(n =>
      filter === 'upcoming' ? (n.endDate || n.date || '') >= today :
      filter === 'past'     ? (n.endDate || n.date || '') <  today : true
    );
    return [...f].sort((a, b) =>
      filter === 'past'
        ? (b.date || '').localeCompare(a.date || '')
        : (a.date || '').localeCompare(b.date || '')
    );
  }, [list, filter, today]);

  const open = openId ? list.find(n => n.id === openId) : null;

  /* ── Calendar sync helpers ──────────────────────────────────
     Push a deterministic event keyed by source_id = night.id so
     repeated syncs upsert in place instead of duplicating. */
  const upsertCalendarFor = (night) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const payload = {
        title:           night.theme || `Youth Night ${night.date}`,
        description:     [night.bigIdea, night.scripture].filter(Boolean).join(' — '),
        event_date:      night.date || '',
        end_date:        night.endDate || '',
        event_time:      (night.runSheet?.[0]?.time) || '',
        color:           '#b8410c',
        category:        'youth',
        source:          CAL_SOURCE,
        source_id:       night.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      const idx = evList.findIndex(e => e.source === CAL_SOURCE && e.source_id === night.id);
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
  const removeCalendarFor = (nightId) => {
    setCalendarEvents(prev =>
      (prev || []).filter(e => !(e.source === CAL_SOURCE && e.source_id === nightId))
    );
  };

  /* ── Mutations ─────────────────────────────────────────────── */
  const add = () => {
    const n = DEFAULT_NIGHT();
    setNights(prev => [n, ...(prev || [])]);
    setOpenId(n.id);
    setMode('edit');
  };

  /** Patch a night, then keep its synced calendar event in step. */
  const update = (id, patch) => {
    const current = list.find(n => n.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setNights(prev => (prev || []).map(n => n.id === id ? next : n));
    if (next.syncToCalendar) upsertCalendarFor(next);
  };

  const remove = (id) => {
    if (!confirm('Remove this week?')) return;
    setNights(prev => (prev || []).filter(n => n.id !== id));
    removeCalendarFor(id);
    if (openId === id) setOpenId(null);
  };

  const toggleSync = (id) => {
    const current = list.find(n => n.id === id);
    if (!current) return;
    const willSync = !current.syncToCalendar;
    const next = { ...current, syncToCalendar: willSync };
    setNights(prev => (prev || []).map(n => n.id === id ? next : n));
    if (willSync) upsertCalendarFor(next);
    else          removeCalendarFor(id);
  };

  const stats = useMemo(() => {
    const past = list.filter(n => (n.endDate || n.date || '') < today);
    const total = past.reduce((s, n) => s + (Number(n.attendance) || 0), 0);
    const avg = past.length ? Math.round(total / past.length) : 0;
    return {
      upcoming: list.filter(n => (n.endDate || n.date || '') >= today).length,
      past:     past.length,
      avg,
    };
  }, [list, today]);

  return (
    <YouthShell
      groupLabel="Events" groupIcon="📅"
      icon="🌙" title="Weekly Nights"
      accent={ACCENT}
      subtitle="Plan each youth night — run sheet, worship, lesson, game, attendance. Double-click a card to view; toggle Sync to push it to your Calendar."
      actions={<button className="yps-add-btn" onClick={add}>＋ New week</button>}
      stats={[
        { n: stats.upcoming, label: 'upcoming' },
        { n: stats.past,     label: 'past' },
        { n: stats.avg,      label: 'avg attendance' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yw-tabs">
        <button className={`yps-chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button className={`yps-chip ${filter === 'past'     ? 'on' : ''}`} onClick={() => setFilter('past')}>Past</button>
        <button className={`yps-chip ${filter === 'all'      ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">🌙</div><div className="yps-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">🌙</div>
          <div className="yps-empty-title">{list.length === 0 ? 'No weeks planned yet' : 'Nothing in this view'}</div>
          <div className="yps-empty-sub">{list.length === 0 ? 'Tap "＋ New week" to plan your first youth night.' : 'Try switching filter.'}</div>
        </div>
      ) : (
        <div className="yw-list">
          {visible.map(n => (
            <article
              key={n.id}
              className="yw-card"
              onDoubleClick={() => { setOpenId(n.id); setMode('view'); }}
              title="Double-click to view"
            >
              <div className="yw-date">
                <div className="yw-date-num">{(n.date || '').slice(-2) || '—'}</div>
                <div className="yw-date-month">{shortMonth(n.date)}</div>
                {n.endDate && n.endDate !== n.date && (
                  <div className="yw-date-multi">→ {(n.endDate || '').slice(-2)} {shortMonth(n.endDate)}</div>
                )}
              </div>
              <div className="yw-info">
                <div className="yw-theme">{n.theme || '(no theme)'}</div>
                {n.bigIdea && <div className="yw-bigidea">💡 {n.bigIdea}</div>}
                {n.scripture && <div className="yw-scripture">📖 {n.scripture}</div>}
              </div>
              <div className="yw-side">
                {!!n.registered && <div className="yw-side-stat">📝 {n.registered}</div>}
                {!!n.attendance && <div className="yw-side-stat">👥 {n.attendance}</div>}
              </div>
              <div className="yw-row-actions" onClick={e => e.stopPropagation()}>
                <label className="yw-sync" title="Sync this night to the Calendar">
                  <input
                    type="checkbox"
                    checked={!!n.syncToCalendar}
                    onChange={() => toggleSync(n.id)}
                  />
                  <span>📆 Sync</span>
                </label>
                <button
                  type="button"
                  className="yw-delete-btn"
                  onClick={() => remove(n.id)}
                  title="Delete this week"
                >🗑</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <NightModal
          night={open}
          games={gameList}
          students={studentList}
          mode={mode}
          onSetMode={setMode}
          onChange={(p) => update(open.id, p)}
          onSetAttendance={(ids) => setNightAttendance(open.id, ids)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
          onToggleSync={() => toggleSync(open.id)}
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

function shortMonth(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('en-US', { month: 'short' }); }
  catch { return ''; }
}

/* ─────────────────────────────────────────────────────────────
   Modal — View / Edit
   ───────────────────────────────────────────────────────────── */
function NightModal({ night, games, students, mode, onSetMode, onChange, onSetAttendance, onDelete, onClose, onToggleSync }) {
  return (
    <div className="yw-modal-backdrop" onClick={onClose}>
      <div className="yw-modal" onClick={e => e.stopPropagation()}>
        <header className="yw-modal-hd">
          <div className="yw-modal-hd-main">
            <div className="yw-modal-hd-crumb">
              {mode === 'view' ? '👁 Viewing' : '✎ Editing'} · {fmtDateRange(night.date, night.endDate)}
            </div>
            <h2>{night.theme || 'Untitled week'}</h2>
          </div>
          <div className="yw-modal-hd-actions">
            <label className="yw-sync yw-sync-modal" title="Sync this night to the Calendar">
              <input type="checkbox" checked={!!night.syncToCalendar} onChange={onToggleSync} />
              <span>📆 Sync</span>
            </label>
            <button className="yps-btn ghost" onClick={onClose}>✕</button>
          </div>
        </header>

        {mode === 'view'
          ? <NightView night={night} games={games} students={students} />
          : <NightEdit night={night} games={games} students={students} onChange={onChange} onSetAttendance={onSetAttendance} />
        }

        <footer className="yw-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete week</button>
          <div className="yw-modal-ft-right">
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

function fmtDateRange(start, end) {
  if (!start) return 'No date';
  if (!end || end === start) return start;
  return `${start} → ${end}`;
}

/* ─────────────────────────────────────────────────────────────
   View mode — read-only, hides empty sections
   ───────────────────────────────────────────────────────────── */
function NightView({ night, games, students = [] }) {
  const game = night.gameId ? games.find(g => g.id === night.gameId) : null;
  const hasRunSheet = night.runSheet?.some(r => r.item || r.time || r.owner);
  const hasStats = (Number(night.registered) > 0) ||
                   (Number(night.attendance) > 0) ||
                   (Number(night.guests)     > 0);
  const isMulti = night.endDate && night.endDate !== night.date;

  return (
    <div className="yw-view">
      <section className="yw-view-hero">
        <div className="yw-view-date">
          📅 {fmtDateRange(night.date, night.endDate)}
          {isMulti && <span className="yps-pill accent">multi-night</span>}
        </div>
        {night.bigIdea  && <div className="yw-view-bigidea">💡 {night.bigIdea}</div>}
        {night.scripture && <div className="yw-view-scripture">📖 {night.scripture}</div>}
      </section>

      {hasStats && (
        <section className="yw-view-stats">
          {Number(night.registered) > 0 && <ViewStat label="Registered" value={night.registered} emoji="📝" />}
          {Number(night.attendance) > 0 && <ViewStat label="Attended"   value={night.attendance} emoji="👥" />}
          {Number(night.guests)     > 0 && <ViewStat label="Guests"     value={night.guests}     emoji="👋" />}
        </section>
      )}

      {hasRunSheet && (
        <ViewSection title="Run Sheet" emoji="📋">
          <ul className="yw-view-run">
            {night.runSheet.map(r => (
              <li key={r.id} className="yw-view-run-row">
                <span className="yw-view-run-time">{r.time || '—'}</span>
                <span className="yw-view-run-dur">{r.duration ? `${r.duration}m` : ''}</span>
                <span className="yw-view-run-item">{r.item || <em className="yps-muted">—</em>}</span>
                {r.owner && <span className="yw-view-run-owner">{r.owner}</span>}
              </li>
            ))}
          </ul>
        </ViewSection>
      )}

      {night.worshipSet && (
        <ViewSection title="Worship Set" emoji="🎵">
          <div className="yw-view-text">{night.worshipSet}</div>
        </ViewSection>
      )}

      {game && (
        <ViewSection title="Game" emoji="🎲">
          <div className="yw-view-game">
            <div className="yw-view-game-name">{game.name || 'Untitled game'}</div>
            <div className="yw-view-game-meta">
              {[game.energy && `${game.energy} energy`,
                (game.minPlayers || game.maxPlayers) && `${game.minPlayers}–${game.maxPlayers} players`,
                game.duration && `${game.duration}m`,
                game.location].filter(Boolean).join(' · ')}
            </div>
            {game.supplies && <div className="yw-view-game-supplies"><b>Need:</b> {game.supplies}</div>}
          </div>
        </ViewSection>
      )}

      {night.lessonNotes && (
        <ViewSection title="Lesson Notes" emoji="📖">
          <div className="yw-view-text">{night.lessonNotes}</div>
        </ViewSection>
      )}

      {night.announcements && (
        <ViewSection title="Announcements" emoji="📢">
          <div className="yw-view-text">{night.announcements}</div>
        </ViewSection>
      )}

      {night.notes && (
        <ViewSection title="Notes / Debrief" emoji="📝">
          <div className="yw-view-text">{night.notes}</div>
        </ViewSection>
      )}

      {(night.attendedStudentIds || []).length > 0 && (
        <ViewSection title="Attended" emoji="🧒">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(night.attendedStudentIds || []).map(sid => {
              const s = students.find(x => x.id === sid);
              return <span key={sid} className="yps-pill">{s ? (s.name || '(unnamed)') : '(removed)'}</span>;
            })}
          </div>
        </ViewSection>
      )}

      {/* Truly empty night — gentle nudge to edit. */}
      {!night.bigIdea && !night.scripture && !hasRunSheet && !night.worshipSet
        && !game && !night.lessonNotes && !night.announcements && !night.notes && !hasStats
        && (night.attendedStudentIds || []).length === 0 && (
        <div className="yw-view-empty">
          Nothing filled in yet — click <b>Edit</b> below to start planning this week.
        </div>
      )}
    </div>
  );
}

/* Compact checklist of every student — toggling a student here both
   stores the night's roster AND back-propagates the date to that
   student's firstAttended (if blank) / lastAttended (if newer).
   Search box at the top handles 100+ student rosters. */
function AttendanceChecklist({ students, attendedIds, onChange }) {
  const [q, setQ] = useState('');
  const set = new Set(attendedIds);
  const toggle = (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };
  const markAll = () => onChange(students.map(s => s.id));
  const clearAll = () => onChange([]);
  const filtered = q.trim()
    ? students.filter(s => (s.name || '').toLowerCase().includes(q.trim().toLowerCase()))
    : students;
  if (students.length === 0) {
    return <div className="yps-muted">No students on the roster yet — add some on All Students first.</div>;
  }
  return (
    <div className="yw-attend">
      <div className="yw-attend-tools">
        <input
          className="yps-input yw-attend-search"
          placeholder={`🔍 Search ${students.length} students…`}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <span className="yw-attend-count">{attendedIds.length} of {students.length} checked in</span>
        <button type="button" className="yps-btn" onClick={markAll}>✓ All</button>
        <button type="button" className="yps-btn ghost" onClick={clearAll}>Clear</button>
      </div>
      <ul className="yw-attend-list">
        {filtered.map(s => (
          <li key={s.id}>
            <label className={`yw-attend-row ${set.has(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={set.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="yw-attend-name">{s.name || '(unnamed)'}</span>
              {s.grade && <span className="yw-attend-grade">{s.grade}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ViewSection({ title, emoji, children }) {
  return (
    <section className="yw-view-section">
      <h3 className="yw-view-section-title">{emoji} {title}</h3>
      {children}
    </section>
  );
}
function ViewStat({ label, value, emoji }) {
  return (
    <div className="yw-view-stat">
      <div className="yw-view-stat-emoji">{emoji}</div>
      <div className="yw-view-stat-value">{value}</div>
      <div className="yw-view-stat-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Edit mode — the existing form, with end-date + stepper
   ───────────────────────────────────────────────────────────── */
function NightEdit({ night, games, students, onChange, onSetAttendance }) {
  const updateRun = (newRun) => onChange({ runSheet: newRun });
  const addRunItem = () => updateRun([
    ...(night.runSheet || []),
    { id: makeId('rs'), time: '', duration: 5, item: '', owner: '' },
  ]);

  return (
    <>
      <div className="yw-grid">
        <Field label="Start date"><input type="date" className="yps-input" value={night.date} onChange={e => onChange({ date: e.target.value })} /></Field>
        <Field label="End date (optional)"><input type="date" className="yps-input" value={night.endDate} onChange={e => onChange({ endDate: e.target.value })} min={night.date || ''} /></Field>
        <Field label="Theme" full><input className="yps-input" value={night.theme} onChange={e => onChange({ theme: e.target.value })} placeholder="e.g. Identity in Christ" /></Field>
        <Field label="Big idea" full><input className="yps-input" value={night.bigIdea} onChange={e => onChange({ bigIdea: e.target.value })} placeholder="One sentence — what should they leave with?" /></Field>
        <Field label="Scripture" full><input className="yps-input" value={night.scripture} onChange={e => onChange({ scripture: e.target.value })} placeholder="e.g. John 15:1-17" /></Field>
      </div>

      <section className="yw-section">
        <header className="yw-section-hd">
          <h3>Run sheet</h3>
          <button className="yps-btn" onClick={addRunItem}>＋ Add</button>
        </header>
        {(night.runSheet || []).length === 0 ? (
          <div className="yps-muted yw-section-empty">No items yet. Build your timeline — doors open → game → worship → message → small groups.</div>
        ) : (
          <ul className="yw-run">
            <li className="yw-run-row yw-run-hd">
              <span>Time</span><span>Min</span><span>Item</span><span>Owner</span><span></span>
            </li>
            {night.runSheet.map(item => (
              <li key={item.id} className="yw-run-row">
                <input className="yps-input yw-w-sm" value={item.time}     onChange={e => updateRun(night.runSheet.map(r => r.id === item.id ? { ...r, time: e.target.value } : r))} placeholder="7:00" />
                <input type="number" className="yps-input yw-w-xs" value={item.duration} onChange={e => updateRun(night.runSheet.map(r => r.id === item.id ? { ...r, duration: Number(e.target.value) } : r))} />
                <input className="yps-input" value={item.item} onChange={e => updateRun(night.runSheet.map(r => r.id === item.id ? { ...r, item: e.target.value } : r))} placeholder="What's happening" />
                <input className="yps-input yw-w-md" value={item.owner} onChange={e => updateRun(night.runSheet.map(r => r.id === item.id ? { ...r, owner: e.target.value } : r))} placeholder="Owner" />
                <button className="yps-btn ghost" onClick={() => updateRun(night.runSheet.filter(r => r.id !== item.id))}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="yw-grid">
        <Field label="Worship set" full>
          <textarea className="yps-textarea" rows={3} value={night.worshipSet} onChange={e => onChange({ worshipSet: e.target.value })} placeholder="Songs — comma-separated, or link to a Studio setlist…" />
        </Field>
        <Field label="Game">
          <select className="yps-select" value={night.gameId} onChange={e => onChange({ gameId: e.target.value })}>
            <option value="">— pick from catalog (optional) —</option>
            {games.map(g => <option key={g.id} value={g.id}>{g.name || '(unnamed)'} · {g.energy}</option>)}
          </select>
        </Field>

        <Field label="Registered">
          <NumberStepper value={night.registered} onChange={(v) => onChange({ registered: v })} />
        </Field>
        <Field label="Attended (count)">
          <NumberStepper value={night.attendance} onChange={(v) => onChange({ attendance: v })} />
        </Field>
        <Field label="Guests">
          <NumberStepper value={night.guests} onChange={(v) => onChange({ guests: v })} />
        </Field>

        <Field label="Attendance check-in" full>
          <AttendanceChecklist
            students={students || []}
            attendedIds={night.attendedStudentIds || []}
            onChange={onSetAttendance}
          />
        </Field>

        <Field label="Lesson notes" full>
          <textarea className="yps-textarea" rows={5} value={night.lessonNotes} onChange={e => onChange({ lessonNotes: e.target.value })} placeholder="Outline, illustrations, discussion questions…" />
        </Field>
        <Field label="Announcements" full>
          <textarea className="yps-textarea" rows={3} value={night.announcements} onChange={e => onChange({ announcements: e.target.value })} placeholder="Upcoming events, parent reminders, dates to know…" />
        </Field>
        <Field label="Notes / debrief" full>
          <textarea className="yps-textarea" rows={3} value={night.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="What went well, what to change for next week…" />
        </Field>
      </div>
    </>
  );
}

function NumberStepper({ value, onChange, min = 0 }) {
  const v = Number(value) || 0;
  return (
    <div className="yw-stepper">
      <button
        type="button"
        className="yw-stepper-btn"
        onClick={() => onChange(Math.max(min, v - 1))}
        title="Decrease"
        aria-label="Decrease"
      >−</button>
      <input
        type="number"
        className="yw-stepper-input"
        value={v}
        min={min}
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
      />
      <button
        type="button"
        className="yw-stepper-btn"
        onClick={() => onChange(v + 1)}
        title="Increase"
        aria-label="Increase"
      >＋</button>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yw-field ${full ? 'full' : ''}`}>
      <span className="yw-field-label">{label}</span>
      {children}
    </label>
  );
}
