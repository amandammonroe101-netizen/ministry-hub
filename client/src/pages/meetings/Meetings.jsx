import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Meetings.css';

/* ─────────────────────────────────────────────────────────────
   Meetings — team meetings, planning sessions, vision meetings
   Naming: .mtg-*  (Multitrack uses .mt-*; do not collide)
   Persistence: localStorage key "admin:meetings"
   Reads (read-only): localStorage keys "band:roster", "band:schedule",
   "songs", "setlists"
   Accent: var(--accent-purple, #a78bfa)

   Recurrence: a meeting can repeat (weekly/biweekly/monthly). "Next
   Occurrence" clones the core details + re-invites the same attendees
   (status reset to "invited") into a new meeting sharing a `seriesId`.

   Attendance & accountability: attendee status (invited/attending/
   attended/declined) recorded per meeting is rolled up across every
   meeting (by name) into a per-person attendance rate, surfaced via the
   sidebar "Attendance" toggle — people below ATTENDANCE_FLAG_THRESHOLD
   over ATTENDANCE_MIN_SAMPLE+ meetings are flagged for follow-up.

   Notes & Follow-up: any meeting can be flagged as needing a follow-up
   (with an optional target date + note) via its own "Follow-up" section.
   Flagged meetings surface in the sidebar "Follow-ups" rollup until
   marked resolved.

   Views: the main area can switch between the single-meeting detail view
   and a "Board View" that groups every meeting into columns by status
   (Upcoming / In progress / Completed / Cancelled) for an at-a-glance
   overview, independent of the sidebar's single-selection list.
   ───────────────────────────────────────────────────────────── */

const LS_MEETINGS_KEY = 'admin:meetings';
const LS_ROSTER_KEY   = 'band:roster';

/* Mirrors Scheduling.jsx's STANDARD_ROLES labels — used only to spot
   unfilled slots on upcoming services, not for eligibility matching. */
const SCHEDULE_ROLE_LABELS = [
  'Worship Leader', 'Vocal 1', 'Vocal 2', 'Vocal 3',
  'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Keys / Piano',
  'Drums', 'Sound', 'Video', 'Lights',
];

/* ── Meeting types ───────────────────────────────────────────── */
const MEETING_TYPES = [
  { key: 'team',        label: 'Team',         icon: '🎵' },
  { key: 'planning',    label: 'Planning',     icon: '📋' },
  { key: 'one-on-one',  label: 'One-on-one',   icon: '👥' },
  { key: 'vision',      label: 'Vision',       icon: '🎯' },
  { key: 'rehearsal',   label: 'Rehearsal',    icon: '🎼' },
  { key: 'other',       label: 'Other',        icon: '🗣' },
];

const TYPE_INDEX = MEETING_TYPES.reduce((acc, t) => { acc[t.key] = t; return acc; }, {});

/* ── Sidebar filter pills ────────────────────────────────────── */
const FILTER_PILLS = [
  { key: 'all',       label: 'All'       },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'past',      label: 'Past'      },
  { key: 'cancelled', label: 'Cancelled' },
];

/* ── Status ──────────────────────────────────────────────────── */
const STATUSES = [
  { key: 'upcoming',    label: 'Upcoming'    },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed',   label: 'Completed'   },
  { key: 'cancelled',   label: 'Cancelled'   },
];

/* ── Attendee statuses (cycle order) ─────────────────────────── */
const ATTENDEE_STATUSES = ['invited', 'attending', 'attended', 'declined'];
const ATTENDEE_LABEL = {
  invited:   'Invited',
  attending: 'Attending',
  attended:  'Attended',
  declined:  'Declined',
};
function nextAttendeeStatus(curr) {
  const i = ATTENDEE_STATUSES.indexOf(curr);
  if (i < 0) return 'invited';
  return ATTENDEE_STATUSES[(i + 1) % ATTENDEE_STATUSES.length];
}

/* ── Recurrence ──────────────────────────────────────────────── */
const RECURRENCE_OPTIONS = [
  { key: 'none',     label: 'Does not repeat' },
  { key: 'weekly',   label: 'Weekly'          },
  { key: 'biweekly', label: 'Every 2 weeks'   },
  { key: 'monthly',  label: 'Monthly'         },
];
const RECURRENCE_LABEL = RECURRENCE_OPTIONS.reduce((acc, r) => { acc[r.key] = r.label; return acc; }, {});

function addInterval(dateStr, freq) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  if (freq === 'weekly')        d.setDate(d.getDate() + 7);
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
  else if (freq === 'monthly')  d.setMonth(d.getMonth() + 1);
  else return dateStr;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ── Attendance & accountability thresholds ──────────────────── */
const ATTENDANCE_MIN_SAMPLE   = 3;   // need at least this many tracked meetings before flagging
const ATTENDANCE_FLAG_THRESHOLD = 0.6; // below 60% attended triggers a follow-up flag

/* ── Agenda templates ────────────────────────────────────────── */
const TEMPLATES = [
  {
    key:   'worship-monthly',
    label: 'Worship team monthly',
    type:  'team',
    items: [
      { title: 'Welcome & catch-up',  duration: 10 },
      { title: 'Song discussion',     duration: 20 },
      { title: 'Scheduling',          duration: 15 },
      { title: 'Prayer & dismiss',    duration: 10 },
    ],
  },
  {
    key:   'planning',
    label: 'Planning meeting',
    type:  'planning',
    items: [
      { title: 'Vision check',   duration: 10 },
      { title: 'Event review',   duration: 20 },
      { title: 'Next steps',     duration: 20 },
      { title: 'Prayer',         duration: 10 },
    ],
  },
  {
    key:   'rehearsal',
    label: 'Rehearsal',
    type:  'rehearsal',
    items: [
      { title: 'Warm-up',          duration: 10 },
      { title: 'Song rehearsal',   duration: 60 },
      { title: 'Tech check',       duration: 15 },
      { title: 'Debrief',          duration: 10 },
    ],
  },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function uid(prefix = 'mtg') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadMeetings() {
  try {
    const raw = localStorage.getItem(LS_MEETINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMeetings(list) {
  try {
    localStorage.setItem(LS_MEETINGS_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(LS_ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateChip(dateStr) {
  if (!dateStr) return { mon: '—', day: '—' };
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { mon: '—', day: '—' };
  return {
    mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function formatCompletedAt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* "19:00" → "7:00 PM" — used for the polished, read-only view of a meeting's time. */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h)) return timeStr;
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* Full weekday + date, for the view-mode detail header — e.g. "Sunday, Mar 8, 2026". */
function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function isPast(meeting) {
  if (!meeting.date) return false;
  const d = new Date((meeting.date) + 'T' + (meeting.startTime || '00:00') + ':00');
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function emptyMeeting(overrides = {}) {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    date: todayIso(),
    startTime: '19:00',
    duration: 60,
    location: '',
    type: 'team',
    attendees: [],
    agenda: [],
    actionItems: [],
    generalNotes: '',
    setlistId: null,
    songNotes: {},
    techNotes: '',
    recurrence: 'none',
    seriesId: null,
    followUpNeeded: false,
    followUpDate: '',
    followUpNotes: '',
    status: 'upcoming',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* ─── New Meeting Form ───────────────────────────────────────── */
function NewMeetingForm({ onSave, onCancel, meetings }) {
  const [title,     setTitle]     = useState('');
  const [date,      setDate]      = useState(todayIso());
  const [startTime, setStartTime] = useState('19:00');
  const [duration,  setDuration]  = useState('60');
  const [location,  setLocation]  = useState('');
  const [type,      setType]      = useState('team');
  const [template,  setTemplate]  = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [error,     setError]     = useState('');
  const [carryForward, setCarryForward] = useState(true);

  /* Most recent meeting of the same type that still has open action
     items — offered as a one-click carry-forward into the new meeting. */
  const priorMeeting = useMemo(() => {
    if (!Array.isArray(meetings)) return null;
    const candidates = meetings
      .filter(m => m.type === type && (m.actionItems || []).some(a => !a.done))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    return candidates[0] || null;
  }, [meetings, type]);

  const priorOpenActions = useMemo(() => {
    if (!priorMeeting) return [];
    return (priorMeeting.actionItems || []).filter(a => !a.done);
  }, [priorMeeting]);

  useEffect(() => { setCarryForward(true); }, [priorMeeting?.id]);

  function applyTemplate(key) {
    setTemplate(key);
    const tpl = TEMPLATES.find(t => t.key === key);
    if (!tpl) return;
    setType(tpl.type);
    if (!title.trim()) setTitle(tpl.label);
    const totalDur = tpl.items.reduce((acc, it) => acc + (it.duration || 0), 0);
    if (totalDur > 0) setDuration(String(totalDur));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) { setError('Title is required.'); return; }
    if (!date) { setError('Date is required.'); return; }

    let agenda = [];
    if (template) {
      const tpl = TEMPLATES.find(x => x.key === template);
      if (tpl) {
        agenda = tpl.items.map(it => ({
          id: uid('ag'),
          title: it.title,
          owner: '',
          duration: it.duration || 0,
          notes: '',
          done: false,
        }));
      }
    }

    let actionItems = [];
    if (carryForward && priorOpenActions.length > 0) {
      actionItems = priorOpenActions.map(a => ({
        id: uid('ac'),
        text: a.text,
        assignee: a.assignee || '',
        dueDate: a.dueDate || '',
        done: false,
        completedAt: null,
        carriedFrom: priorMeeting.id,
      }));
    }

    onSave({
      title:    t,
      date,
      startTime,
      duration: Number(duration) || 0,
      location: location.trim(),
      type,
      recurrence,
      agenda,
      actionItems,
    });
  }

  return (
    <form className="mtg-new-form" onSubmit={handleSubmit}>
      {error && <p className="mtg-error">{error}</p>}
      <input
        className="mtg-inp"
        placeholder="Title (e.g. Worship team monthly)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <div className="mtg-new-row">
        <input
          className="mtg-inp"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <input
          className="mtg-inp"
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
        />
      </div>
      <div className="mtg-new-row">
        <input
          className="mtg-inp"
          type="number"
          min="0"
          step="5"
          placeholder="Duration (min)"
          value={duration}
          onChange={e => setDuration(e.target.value)}
        />
        <select
          className="mtg-inp"
          value={type}
          onChange={e => setType(e.target.value)}
        >
          {MEETING_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>
      <input
        className="mtg-inp"
        placeholder="Location (e.g. Sanctuary, Zoom)"
        value={location}
        onChange={e => setLocation(e.target.value)}
      />
      <select
        className="mtg-inp"
        value={template}
        onChange={e => applyTemplate(e.target.value)}
        title="Apply an agenda template"
      >
        <option value="">Apply template… (optional)</option>
        {TEMPLATES.map(t => (
          <option key={t.key} value={t.key}>{t.label}</option>
        ))}
      </select>
      <select
        className="mtg-inp"
        value={recurrence}
        onChange={e => setRecurrence(e.target.value)}
        title="Repeats"
      >
        {RECURRENCE_OPTIONS.map(r => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>

      {priorOpenActions.length > 0 && (
        <label className="mtg-carry-forward">
          <input
            type="checkbox"
            checked={carryForward}
            onChange={e => setCarryForward(e.target.checked)}
          />
          <span>
            Carry forward {priorOpenActions.length} open action item{priorOpenActions.length === 1 ? '' : 's'} from
            &nbsp;“{priorMeeting.title || 'Untitled meeting'}” ({formatDateShort(priorMeeting.date)})
          </span>
        </label>
      )}

      <div className="mtg-new-form-btns">
        <button type="submit" className="mtg-btn mtg-btn-accent" disabled={!title.trim()}>
          Create
        </button>
        <button type="button" className="mtg-btn mtg-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Sidebar meeting card ───────────────────────────────────── */
function MeetingCard({ meeting, active, onClick }) {
  const chip = formatDateChip(meeting.date);
  const t = TYPE_INDEX[meeting.type] || TYPE_INDEX.other;
  const attendeeCount = (meeting.attendees || []).length;

  return (
    <button
      className={`mtg-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className={`mtg-card-date mtg-card-date-${meeting.status || 'upcoming'}`}>
        <div className="mtg-card-date-mon">{chip.mon}</div>
        <div className="mtg-card-date-day">{chip.day}</div>
      </div>
      <div className="mtg-card-body">
        <div className="mtg-card-title">{meeting.title || 'Untitled meeting'}</div>
        <div className="mtg-card-meta">
          <span className={`mtg-type-chip mtg-type-${meeting.type || 'other'}`}>
            <span aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </span>
          {meeting.recurrence && meeting.recurrence !== 'none' && (
            <span className="mtg-recur-icon" title={`Repeats ${RECURRENCE_LABEL[meeting.recurrence] || ''}`}>🔁</span>
          )}
          {meeting.startTime && <span className="mtg-card-time">{meeting.startTime}</span>}
        </div>
        <div className="mtg-card-meta">
          <span className="mtg-card-meta-item" title="Attendees">
            👤 {attendeeCount}
          </span>
          {meeting.location && (
            <span className="mtg-card-meta-item mtg-card-loc" title={meeting.location}>
              📍 {meeting.location}
            </span>
          )}
          {meeting.followUpNeeded && (
            <span
              className="mtg-card-meta-item mtg-followup-chip"
              title={meeting.followUpDate ? `Follow up by ${formatDateShort(meeting.followUpDate)}` : 'Needs follow-up'}
            >
              🔔{meeting.followUpDate ? ` ${formatDateShort(meeting.followUpDate)}` : ''}
            </span>
          )}
        </div>
        <div className="mtg-card-status-row">
          <span className={`mtg-status-pill mtg-status-${meeting.status || 'upcoming'}`}>
            {STATUSES.find(s => s.key === meeting.status)?.label || 'Upcoming'}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Roster autocomplete (text input + dropdown) ────────────── */
function RosterAutocomplete({
  value, onChange, onPick, roster, placeholder,
  className = 'mtg-inp', inputProps = {}, readOnly = false,
}) {
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!Array.isArray(roster) || roster.length === 0) return [];
    if (!q) return roster.slice(0, 6);
    return roster
      .filter(m => (m.name || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [roster, value]);

  return (
    <div className="mtg-ac">
      <input
        {...inputProps}
        className={className}
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        onChange={e => { if (readOnly) return; onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (!readOnly) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {!readOnly && open && matches.length > 0 && (
        <div className="mtg-ac-dropdown">
          {matches.map(m => (
            <button
              type="button"
              key={m.id || m.name}
              className="mtg-ac-option"
              onMouseDown={e => {
                e.preventDefault();
                onPick(m);
                setOpen(false);
              }}
            >
              <span className="mtg-ac-name">{m.name}</span>
              {m.role && <span className="mtg-ac-role">{m.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Song autocomplete (link an agenda item to a song) ───────── */
function SongAutocomplete({ songs, onPick, placeholder }) {
  const [value, setValue] = useState('');
  const [open,  setOpen]  = useState(false);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!Array.isArray(songs) || songs.length === 0) return [];
    if (!q) return songs.slice(0, 6);
    return songs
      .filter(s => (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [songs, value]);

  return (
    <div className="mtg-ac">
      <input
        className="mtg-inp"
        placeholder={placeholder}
        value={value}
        onChange={e => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="mtg-ac-dropdown">
          {matches.map(s => (
            <button
              type="button"
              key={s.id}
              className="mtg-ac-option"
              onMouseDown={e => {
                e.preventDefault();
                onPick(s);
                setValue('');
                setOpen(false);
              }}
            >
              <span className="mtg-ac-name">{s.title || 'Untitled'}</span>
              {(s.song_key || s.artist) && (
                <span className="mtg-ac-role">{s.song_key || s.artist}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Add attendee inline ────────────────────────────────────── */
function AddAttendee({ roster, onAdd }) {
  const [name, setName] = useState('');

  function commit(rawName) {
    const n = (rawName || '').trim();
    if (!n) return;
    onAdd(n);
    setName('');
  }

  return (
    <div className="mtg-add-attendee">
      <RosterAutocomplete
        value={name}
        onChange={setName}
        onPick={(m) => commit(m.name)}
        roster={roster}
        placeholder="+ Add attendee"
        inputProps={{
          onKeyDown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(name); }
          },
        }}
      />
      {name.trim() && (
        <button
          type="button"
          className="mtg-btn mtg-btn-accent mtg-btn-sm"
          onMouseDown={e => { e.preventDefault(); commit(name); }}
        >
          Add
        </button>
      )}
    </div>
  );
}

/* ─── Agenda Row ─────────────────────────────────────────────── */
function AgendaRow({
  item, roster, songs, viewOnly,
  onChange, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
  isDragging,
}) {
  const [expanded, setExpanded] = useState(false);
  const linkedSong = item.songId ? (songs || []).find(s => s.id === item.songId) : null;

  return (
    <div
      className={`mtg-agenda-row${item.done ? ' done' : ''}${isDragging ? ' dragging' : ''}`}
      draggable={!viewOnly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="mtg-agenda-main">
        {!viewOnly && (
          <span className="mtg-drag-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
        )}
        <input
          type="checkbox"
          className="mtg-check"
          checked={!!item.done}
          onChange={e => onChange({ done: e.target.checked })}
          title={item.done ? 'Mark as not done' : 'Mark as done'}
        />
        {viewOnly ? (
          <span className="mtg-agenda-title mtg-view-text mtg-view-text-strong">
            {item.title || 'Untitled item'}
          </span>
        ) : (
          <input
            className="mtg-inp mtg-agenda-title"
            placeholder="Agenda item…"
            value={item.title}
            onChange={e => onChange({ title: e.target.value })}
          />
        )}
        {viewOnly ? (
          item.owner && <span className="mtg-view-tag">👤 {item.owner}</span>
        ) : (
          <RosterAutocomplete
            value={item.owner || ''}
            onChange={v => onChange({ owner: v })}
            onPick={m => onChange({ owner: m.name })}
            roster={roster}
            placeholder="Owner"
            className="mtg-inp mtg-agenda-owner"
          />
        )}
        {viewOnly ? (
          !!item.duration && <span className="mtg-view-tag">{item.duration} min</span>
        ) : (
          <input
            className="mtg-inp mtg-agenda-dur"
            type="number"
            min="0"
            step="5"
            placeholder="min"
            value={item.duration === 0 ? '' : item.duration ?? ''}
            onChange={e => onChange({ duration: Number(e.target.value) || 0 })}
          />
        )}
        <button
          type="button"
          className="mtg-icon-btn"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Hide notes' : 'Show notes'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        {!viewOnly && (
          <button
            type="button"
            className="mtg-icon-btn mtg-icon-btn-danger"
            onClick={onRemove}
            title="Remove agenda item"
          >
            ✕
          </button>
        )}
      </div>
      {expanded && (
        <div className="mtg-agenda-expanded">
          {viewOnly ? (
            item.notes
              ? <p className="mtg-view-note">{item.notes}</p>
              : <span className="mtg-muted mtg-sec-empty">No notes.</span>
          ) : (
            <textarea
              className="mtg-inp mtg-textarea mtg-agenda-notes"
              placeholder="Notes for this agenda item…"
              rows={3}
              value={item.notes || ''}
              onChange={e => onChange({ notes: e.target.value })}
            />
          )}
          <div className="mtg-agenda-song">
            {linkedSong ? (
              <span className="mtg-song-chip">
                <span className="mtg-song-chip-icon" aria-hidden="true">🎵</span>
                <span className="mtg-song-chip-title">{linkedSong.title || 'Untitled song'}</span>
                {linkedSong.song_key && <span className="mtg-song-chip-meta">{linkedSong.song_key}</span>}
                {linkedSong.tempo && <span className="mtg-song-chip-meta">{linkedSong.tempo} BPM</span>}
                <Link
                  to={`/worship/songs/all?id=${linkedSong.id}`}
                  className="mtg-song-chip-open"
                  title="Open in Songs"
                >
                  ↗
                </Link>
                {!viewOnly && (
                  <button
                    type="button"
                    className="mtg-song-chip-x"
                    onClick={() => onChange({ songId: null })}
                    title="Unlink song"
                  >
                    ✕
                  </button>
                )}
              </span>
            ) : viewOnly ? (
              <span className="mtg-muted mtg-sec-empty">No song linked.</span>
            ) : (
              <SongAutocomplete
                songs={songs}
                onPick={(s) => onChange({ songId: s.id })}
                placeholder="🎵 Link a song to this item…"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Action Item Row ────────────────────────────────────────── */
function ActionRow({ item, roster, viewOnly, onChange, onRemove }) {
  return (
    <div className={`mtg-action-row${item.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        className="mtg-check"
        checked={!!item.done}
        onChange={e => {
          const done = e.target.checked;
          onChange({
            done,
            completedAt: done ? Date.now() : null,
          });
        }}
        title={item.done ? 'Mark as not done' : 'Mark as done'}
      />
      {item.carriedFrom && (
        <span className="mtg-action-carried" title="Carried forward from a previous meeting">↩</span>
      )}
      {viewOnly ? (
        <span className="mtg-action-text mtg-view-text mtg-view-text-strong">
          {item.text || 'Untitled action'}
        </span>
      ) : (
        <input
          className="mtg-inp mtg-action-text"
          placeholder="Action item…"
          value={item.text}
          onChange={e => onChange({ text: e.target.value })}
        />
      )}
      {viewOnly ? (
        item.assignee && <span className="mtg-view-tag">👤 {item.assignee}</span>
      ) : (
        <RosterAutocomplete
          value={item.assignee || ''}
          onChange={v => onChange({ assignee: v })}
          onPick={m => onChange({ assignee: m.name })}
          roster={roster}
          placeholder="Assignee"
          className="mtg-inp mtg-action-assignee"
        />
      )}
      {viewOnly ? (
        item.dueDate && <span className="mtg-view-tag">📅 {formatDateShort(item.dueDate)}</span>
      ) : (
        <input
          className="mtg-inp mtg-action-due"
          type="date"
          value={item.dueDate || ''}
          onChange={e => onChange({ dueDate: e.target.value })}
          title="Due date"
        />
      )}
      {item.done && item.completedAt && (
        <span className="mtg-action-completed" title="Completed">
          ✓ {formatCompletedAt(item.completedAt)}
        </span>
      )}
      {!viewOnly && (
        <button
          type="button"
          className="mtg-icon-btn mtg-icon-btn-danger"
          onClick={onRemove}
          title="Remove action item"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ─── Open Action Items rollup (across every meeting) ──────────── */
function ActionsRollup({ items, onJump, onToggleDone }) {
  return (
    <div className="mtg-rollup">
      <div className="mtg-rollup-head">
        <span className="mtg-rollup-icon" aria-hidden="true">✅</span>
        <span className="mtg-rollup-title">Open Action Items</span>
        <span className="mtg-sec-count">{items.length}</span>
      </div>
      {items.length === 0 && (
        <p className="mtg-muted mtg-list-empty-msg">
          No open action items across any meeting. Nice work.
        </p>
      )}
      <div className="mtg-rollup-list">
        {items.map(item => (
          <div key={`${item.meetingId}-${item.id}`} className="mtg-action-row mtg-rollup-row">
            <input
              type="checkbox"
              className="mtg-check"
              checked={false}
              onChange={() => onToggleDone(item.meetingId, item.id)}
              title="Mark complete"
            />
            {item.carriedFrom && (
              <span className="mtg-action-carried" title="Carried forward from a previous meeting">↩</span>
            )}
            <div className="mtg-rollup-row-main">
              <span className="mtg-rollup-text">{item.text}</span>
              <div className="mtg-rollup-meta">
                {item.assignee && <span className="mtg-rollup-assignee">👤 {item.assignee}</span>}
                {item.dueDate && <span className="mtg-rollup-due">📅 {formatDateShort(item.dueDate)}</span>}
                <button
                  type="button"
                  className="mtg-rollup-meeting-link"
                  onClick={() => onJump(item.meetingId)}
                >
                  from “{item.meetingTitle || 'Untitled meeting'}” — {formatDateShort(item.meetingDate)} →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Attendance & accountability rollup (across every meeting) ─── */
function AttendanceRollup({ stats }) {
  return (
    <div className="mtg-rollup">
      <div className="mtg-rollup-head">
        <span className="mtg-rollup-icon" aria-hidden="true">📊</span>
        <span className="mtg-rollup-title">Attendance & Accountability</span>
        <span className="mtg-sec-count">{stats.length}</span>
      </div>
      {stats.length === 0 && (
        <p className="mtg-muted mtg-list-empty-msg">
          No attendance data yet. Add attendees to meetings to track it here.
        </p>
      )}
      <div className="mtg-attendance-list">
        {stats.map(r => {
          const flagged = r.total >= ATTENDANCE_MIN_SAMPLE && r.rate < ATTENDANCE_FLAG_THRESHOLD;
          const pct = Math.round(r.rate * 100);
          return (
            <div key={r.name} className={`mtg-attendance-row${flagged ? ' flagged' : ''}`}>
              <div className="mtg-attendance-row-top">
                <span className="mtg-attendance-name">{r.name}</span>
                {flagged && (
                  <span className="mtg-attendance-flag" title={`Attended fewer than ${Math.round(ATTENDANCE_FLAG_THRESHOLD * 100)}% of tracked meetings`}>
                    ⚠ Needs follow-up
                  </span>
                )}
                <span className="mtg-attendance-pct">{pct}%</span>
              </div>
              <div className="mtg-attendance-bar-track">
                <div className="mtg-attendance-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="mtg-attendance-row-meta">
                {r.attended} attended · {r.declined} declined · {r.total} tracked
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Follow-ups rollup (meetings flagged for follow-up) ─────────── */
function FollowUpsRollup({ items, onJump, onResolve }) {
  return (
    <div className="mtg-rollup">
      <div className="mtg-rollup-head">
        <span className="mtg-rollup-icon" aria-hidden="true">🔔</span>
        <span className="mtg-rollup-title">Follow-ups</span>
        <span className="mtg-sec-count">{items.length}</span>
      </div>
      {items.length === 0 && (
        <p className="mtg-muted mtg-list-empty-msg">
          Nothing flagged for follow-up.
        </p>
      )}
      <div className="mtg-rollup-list">
        {items.map(m => (
          <div key={m.id} className="mtg-action-row mtg-rollup-row">
            <button
              type="button"
              className="mtg-icon-btn mtg-followup-resolve"
              onClick={() => onResolve(m.id)}
              title="Mark follow-up resolved"
            >
              ✓
            </button>
            <div className="mtg-rollup-row-main">
              <span className="mtg-rollup-text">{m.title || 'Untitled meeting'}</span>
              {m.followUpNotes && <span className="mtg-rollup-followup-notes">{m.followUpNotes}</span>}
              <div className="mtg-rollup-meta">
                {m.followUpDate && <span className="mtg-rollup-due">📅 {formatDateShort(m.followUpDate)}</span>}
                <button
                  type="button"
                  className="mtg-rollup-meeting-link"
                  onClick={() => onJump(m.id)}
                >
                  from “{m.title || 'Untitled meeting'}” — {formatDateShort(m.date)} →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Board View — every meeting grouped into columns by status ──── */
function BoardView({ meetings, onSelect }) {
  const columns = STATUSES.map(s => ({
    ...s,
    items: meetings.filter(m => (m.status || 'upcoming') === s.key),
  }));

  return (
    <div className="mtg-board">
      {columns.map(col => (
        <div key={col.key} className="mtg-board-col">
          <div className="mtg-board-col-head">
            <span className={`mtg-status-pill mtg-status-${col.key}`}>{col.label}</span>
            <span className="mtg-sec-count">{col.items.length}</span>
          </div>
          <div className="mtg-board-col-list">
            {col.items.length === 0 && (
              <span className="mtg-muted mtg-sec-empty">No meetings</span>
            )}
            {col.items.map(m => {
              const chip = formatDateChip(m.date);
              const t = TYPE_INDEX[m.type] || TYPE_INDEX.other;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="mtg-board-card"
                  onClick={() => onSelect(m.id)}
                >
                  <div className="mtg-board-card-top">
                    <span className={`mtg-type-chip mtg-type-${m.type || 'other'}`}>
                      <span aria-hidden="true">{t.icon}</span>
                      <span>{t.label}</span>
                    </span>
                    {m.recurrence && m.recurrence !== 'none' && (
                      <span className="mtg-recur-icon" aria-hidden="true">🔁</span>
                    )}
                    {m.followUpNeeded && (
                      <span className="mtg-recur-icon" aria-hidden="true" title="Needs follow-up">🔔</span>
                    )}
                  </div>
                  <div className="mtg-board-card-title">{m.title || 'Untitled meeting'}</div>
                  <div className="mtg-board-card-meta">
                    <span>{chip.mon} {chip.day}</span>
                    {m.startTime && <span>{m.startTime}</span>}
                    <span>👤 {(m.attendees || []).length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function Meetings() {
  const [meetings,   setMeetings]   = useUserStoreKey('admin:meetings', []);
  const [searchParams, setSearchParams] = useSearchParams();
  /* If we arrived via deep-link (e.g. ?id=mtg-123 from Calendar), open that
     meeting on mount. The id is consumed from the URL so subsequent renders
     don't keep forcing the selection. */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    return fromUrl || null;
  });

  useEffect(() => {
    const fromUrl = searchParams.get('id');
    if (fromUrl) {
      setSelectedId(fromUrl);
      // Strip the param so refreshes don't keep reselecting.
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [query,      setQuery]      = useState('');
  const [filter,     setFilter]     = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showNew,    setShowNew]    = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [armedCancel, setArmedCancel] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [roster]            = useUserStoreKey('band:roster', []);
  const [schedule]          = useUserStoreKey('band:schedule', []);
  const [songs]             = useUserStoreKey('songs', []);
  const [setlists]          = useUserStoreKey('setlists', []);
  const [viewMode, setViewMode] = useState('meeting'); // 'meeting' | 'actions' | 'attendance' | 'followups' | 'board'
  /* A selected meeting opens read-only ("view") by default — every
     checkbox (attendee status, agenda done, action done, follow-up flag)
     stays interactive so a meeting can be run/checked-off live, but text
     fields are locked until "✏️ Edit" is tapped. Freshly created meetings
     open straight into "edit" since they need to be filled in. */
  const [detailMode, setDetailMode] = useState('view'); // 'view' | 'edit'

  // Drag state for agenda reordering
  const [dragId, setDragId] = useState(null);

  // Inline "add" form state for agenda + actions
  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [newActionText,  setNewActionText]  = useState('');

  const viewOnly = detailMode === 'view';

  const armTimerRef = useRef(null);

  /* (Both meetings and roster autosync via useUserStoreKey.) */

  /* ── Auto-disarm danger buttons after 3s ──────────────────── */
  useEffect(() => {
    if (!armedDelete && !armedCancel) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => {
      setArmedDelete(false);
      setArmedCancel(false);
    }, 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete, armedCancel]);

  /* ── Reset transient UI when switching meetings ───────────── */
  useEffect(() => {
    setArmedDelete(false);
    setArmedCancel(false);
    setStatusMenuOpen(false);
    setNewAgendaTitle('');
    setNewActionText('');
  }, [selectedId]);

  /* ── Counts per filter pill ───────────────────────────────── */
  const counts = useMemo(() => {
    const c = { all: meetings.length, upcoming: 0, past: 0, cancelled: 0 };
    meetings.forEach(m => {
      if (m.status === 'cancelled') { c.cancelled += 1; return; }
      if (m.status === 'completed') { c.past += 1; return; }
      if (isPast(m) && m.status !== 'in-progress') { c.past += 1; return; }
      c.upcoming += 1;
    });
    return c;
  }, [meetings]);

  /* ── Filter + sort ────────────────────────────────────────── */
  const filteredMeetings = useMemo(() => {
    const q = query.trim().toLowerCase();

    function matchesFilterPill(m) {
      if (filter === 'all')       return true;
      if (filter === 'cancelled') return m.status === 'cancelled';
      if (filter === 'past') {
        if (m.status === 'cancelled') return false;
        if (m.status === 'completed') return true;
        return isPast(m) && m.status !== 'in-progress';
      }
      if (filter === 'upcoming') {
        if (m.status === 'cancelled') return false;
        if (m.status === 'completed') return false;
        if (isPast(m) && m.status !== 'in-progress') return false;
        return true;
      }
      return true;
    }

    function isUpcomingBucket(m) {
      if (m.status === 'cancelled') return false;
      if (m.status === 'completed') return false;
      if (isPast(m) && m.status !== 'in-progress') return false;
      return true;
    }

    function dateKey(m) {
      const d = m.date || '0000-00-00';
      const t = m.startTime || '00:00';
      return `${d}T${t}`;
    }

    const filtered = meetings.filter(m => {
      if (!matchesFilterPill(m)) return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        (m.title || '').toLowerCase().includes(q) ||
        (m.location || '').toLowerCase().includes(q)
      );
    });

    return filtered.sort((a, b) => {
      const aUp = isUpcomingBucket(a);
      const bUp = isUpcomingBucket(b);
      if (aUp !== bUp) return aUp ? -1 : 1;
      if (aUp) {
        // upcoming bucket: asc by date
        return dateKey(a).localeCompare(dateKey(b));
      }
      // past/cancelled bucket: desc by date
      return dateKey(b).localeCompare(dateKey(a));
    });
  }, [meetings, query, filter, typeFilter]);

  const selected = useMemo(
    () => meetings.find(m => m.id === selectedId) || null,
    [meetings, selectedId]
  );

  /* ── Song lookup (read-only, from the Songs page) ─────────── */
  const songIndex = useMemo(() => {
    const map = new Map();
    (songs || []).forEach(s => map.set(s.id, s));
    return map;
  }, [songs]);

  /* ── Upcoming service staffing gaps (read-only, from Scheduling) ── */
  const upcomingGaps = useMemo(() => {
    const today = todayIso();
    return (schedule || [])
      .filter(s => s.date && s.date >= today)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 3)
      .map(s => {
        const assigned = s.assignments || {};
        const gaps = SCHEDULE_ROLE_LABELS.filter(label => !assigned[label]);
        return { id: s.id, name: s.name, date: s.date, gaps };
      });
  }, [schedule]);

  /* ── Rehearsal songs — hydrated from the linked setlist ──────── */
  const rehearsalSongs = useMemo(() => {
    if (!selected || !selected.setlistId) return [];
    const sl = (setlists || []).find(s => s.id === selected.setlistId);
    if (!sl) return [];
    return (sl.songs || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(row => {
        const song = songIndex.get(row.song_id);
        return song ? { song_id: row.song_id, title: song.title, song_key: song.song_key, tempo: song.tempo } : null;
      })
      .filter(Boolean);
  }, [selected, setlists, songIndex]);

  /* ── All open action items across every meeting ──────────────── */
  const allOpenActions = useMemo(() => {
    const rows = [];
    meetings.forEach(m => {
      (m.actionItems || []).forEach(a => {
        if (!a.done) rows.push({ ...a, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date });
      });
    });
    return rows.sort((a, b) => {
      const ad = a.dueDate || '9999-99-99';
      const bd = b.dueDate || '9999-99-99';
      return ad.localeCompare(bd);
    });
  }, [meetings]);

  /* ── Attendance & accountability — per-person rollup across meetings ── */
  const attendanceStats = useMemo(() => {
    const map = new Map(); // name (lowercased) -> { name, total, attended, declined }
    meetings.forEach(m => {
      if (m.status === 'cancelled') return;
      (m.attendees || []).forEach(a => {
        const key = (a.name || '').trim().toLowerCase();
        if (!key) return;
        if (!map.has(key)) map.set(key, { name: a.name, total: 0, attended: 0, declined: 0 });
        const rec = map.get(key);
        rec.total += 1;
        if (a.status === 'attended') rec.attended += 1;
        if (a.status === 'declined') rec.declined += 1;
      });
    });
    return Array.from(map.values())
      .map(r => ({ ...r, rate: r.total > 0 ? r.attended / r.total : 0 }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);
  }, [meetings]);

  const flaggedAttendanceCount = useMemo(
    () => attendanceStats.filter(r => r.total >= ATTENDANCE_MIN_SAMPLE && r.rate < ATTENDANCE_FLAG_THRESHOLD).length,
    [attendanceStats]
  );

  /* ── Meetings flagged for follow-up, across every meeting ────── */
  const followUpMeetings = useMemo(() => {
    return meetings
      .filter(m => m.followUpNeeded)
      .sort((a, b) => (a.followUpDate || '9999-99-99').localeCompare(b.followUpDate || '9999-99-99'));
  }, [meetings]);

  /* ── Board View — every meeting (search/type filtered, but not by the
     status pill, since the whole point of the board is showing every
     status side by side) ────────────────────────────────────────── */
  const boardMeetings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings.filter(m => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        (m.title || '').toLowerCase().includes(q) ||
        (m.location || '').toLowerCase().includes(q)
      );
    });
  }, [meetings, query, typeFilter]);

  const handleJumpToMeeting = useCallback((meetingId) => {
    setSelectedId(meetingId);
    setViewMode('meeting');
    setDetailMode('view');
  }, []);

  const handleToggleRollupAction = useCallback((meetingId, actionId) => {
    setMeetings(prev => prev.map(m => m.id === meetingId
      ? {
          ...m,
          actionItems: (m.actionItems || []).map(a =>
            a.id === actionId ? { ...a, done: true, completedAt: Date.now() } : a
          ),
          updatedAt: Date.now(),
        }
      : m
    ));
  }, []);

  const handleResolveFollowUp = useCallback((meetingId) => {
    setMeetings(prev => prev.map(m => m.id === meetingId
      ? { ...m, followUpNeeded: false, updatedAt: Date.now() }
      : m
    ));
  }, []);

  /* ── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setMeetings(prev => prev.map(m =>
      m.id === selectedId
        ? { ...m, ...patch, updatedAt: Date.now() }
        : m
    ));
  }, [selectedId]);

  const handleCreate = useCallback((data) => {
    const m = emptyMeeting(data);
    setMeetings(prev => [m, ...prev]);
    setSelectedId(m.id);
    setShowNew(false);
    setViewMode('meeting');
    setDetailMode('edit');
  }, []);

  /* Create the next occurrence of a recurring meeting — advances the date
     by the recurrence interval, carries over the core details + recurrence,
     and re-invites the same attendees (status reset to "invited"), but
     leaves agenda/action items/notes blank for the new occurrence.
     Both meetings share a `seriesId` so future "view series" tooling has
     something to key off of. */
  const handleCreateNextOccurrence = useCallback(() => {
    if (!selected || !selected.recurrence || selected.recurrence === 'none') return;
    const seriesId = selected.seriesId || selected.id;
    const next = emptyMeeting({
      title:      selected.title,
      date:       addInterval(selected.date, selected.recurrence),
      startTime:  selected.startTime,
      duration:   selected.duration,
      location:   selected.location,
      type:       selected.type,
      recurrence: selected.recurrence,
      seriesId,
      attendees:  (selected.attendees || []).map(a => ({ id: uid('at'), name: a.name, status: 'invited' })),
    });
    setMeetings(prev => {
      const withSeries = prev.map(m => (m.id === selected.id && !m.seriesId) ? { ...m, seriesId } : m);
      return [next, ...withSeries];
    });
    setSelectedId(next.id);
    setViewMode('meeting');
    setDetailMode('edit');
  }, [selected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setMeetings(prev => prev.filter(m => m.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleCancelMeeting = useCallback(() => {
    if (!selected) return;
    if (!armedCancel) { setArmedCancel(true); return; }
    updateSelected({ status: 'cancelled' });
    setArmedCancel(false);
  }, [selected, armedCancel, updateSelected]);

  const handleStartMeeting = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: 'in-progress' });
  }, [selected, updateSelected]);

  const handleEndMeeting = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: 'completed' });
  }, [selected, updateSelected]);

  const handleStatusChange = useCallback((next) => {
    updateSelected({ status: next });
    setStatusMenuOpen(false);
  }, [updateSelected]);

  /* ── Attendees ────────────────────────────────────────────── */
  const handleAddAttendee = useCallback((name) => {
    if (!selected) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = selected.attendees || [];
    if (existing.some(a => a.name.toLowerCase() === trimmed.toLowerCase())) return;
    const next = [
      ...existing,
      { id: uid('at'), name: trimmed, status: 'invited' },
    ];
    updateSelected({ attendees: next });
  }, [selected, updateSelected]);

  const handleCycleAttendee = useCallback((id) => {
    if (!selected) return;
    const next = (selected.attendees || []).map(a =>
      a.id === id ? { ...a, status: nextAttendeeStatus(a.status) } : a
    );
    updateSelected({ attendees: next });
  }, [selected, updateSelected]);

  const handleRemoveAttendee = useCallback((id) => {
    if (!selected) return;
    const next = (selected.attendees || []).filter(a => a.id !== id);
    updateSelected({ attendees: next });
  }, [selected, updateSelected]);

  /* ── Agenda ───────────────────────────────────────────────── */
  const handleAddAgenda = useCallback((titleArg) => {
    if (!selected) return;
    const t = (titleArg ?? newAgendaTitle).trim();
    if (!t) return;
    const item = {
      id: uid('ag'),
      title: t,
      owner: '',
      duration: 0,
      notes: '',
      songId: null,
      done: false,
    };
    updateSelected({ agenda: [...(selected.agenda || []), item] });
    setNewAgendaTitle('');
  }, [selected, newAgendaTitle, updateSelected]);

  const handleAgendaChange = useCallback((id, patch) => {
    if (!selected) return;
    const next = (selected.agenda || []).map(it =>
      it.id === id ? { ...it, ...patch } : it
    );
    updateSelected({ agenda: next });
  }, [selected, updateSelected]);

  const handleAgendaRemove = useCallback((id) => {
    if (!selected) return;
    const next = (selected.agenda || []).filter(it => it.id !== id);
    updateSelected({ agenda: next });
  }, [selected, updateSelected]);

  const handleAgendaReorder = useCallback((fromId, toId) => {
    if (!selected || !fromId || !toId || fromId === toId) return;
    const list = [...(selected.agenda || [])];
    const fromIdx = list.findIndex(it => it.id === fromId);
    const toIdx   = list.findIndex(it => it.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    updateSelected({ agenda: list });
  }, [selected, updateSelected]);

  /* ── Action items ─────────────────────────────────────────── */
  const handleAddAction = useCallback((textArg) => {
    if (!selected) return;
    const t = (textArg ?? newActionText).trim();
    if (!t) return;
    const item = {
      id: uid('ac'),
      text: t,
      assignee: '',
      dueDate: '',
      done: false,
      completedAt: null,
    };
    updateSelected({ actionItems: [...(selected.actionItems || []), item] });
    setNewActionText('');
  }, [selected, newActionText, updateSelected]);

  const handleActionChange = useCallback((id, patch) => {
    if (!selected) return;
    const next = (selected.actionItems || []).map(it =>
      it.id === id ? { ...it, ...patch } : it
    );
    updateSelected({ actionItems: next });
  }, [selected, updateSelected]);

  const handleActionRemove = useCallback((id) => {
    if (!selected) return;
    const next = (selected.actionItems || []).filter(it => it.id !== id);
    updateSelected({ actionItems: next });
  }, [selected, updateSelected]);

  /* ── Derived: agenda totals + action stats ────────────────── */
  const agendaTotal = useMemo(() => {
    if (!selected) return 0;
    return (selected.agenda || []).reduce((acc, it) => acc + (Number(it.duration) || 0), 0);
  }, [selected]);

  const agendaOver = selected ? agendaTotal > (Number(selected.duration) || 0) && (selected.duration || 0) > 0 : false;

  const actionStats = useMemo(() => {
    if (!selected) return { open: 0, completed: 0 };
    const all = selected.actionItems || [];
    const completed = all.filter(a => a.done).length;
    return { open: all.length - completed, completed };
  }, [selected]);

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <WorshipShell title="Meetings" icon="🗣" subtitle="Team meeting notes and agendas.">
    <div className="mtg-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="mtg-sidebar">
        <div className="mtg-sidebar-head">
          <span className="mtg-sidebar-title">Meetings</span>
          {!showNew && (
            <button
              className="mtg-new-btn"
              onClick={() => setShowNew(true)}
              title="New meeting"
            >
              + New Meeting
            </button>
          )}
        </div>

        {showNew && (
          <NewMeetingForm
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
            meetings={meetings}
          />
        )}

        {!showNew && (
          <div className="mtg-toggle-row">
            <button
              type="button"
              className={`mtg-actions-toggle${viewMode === 'actions' ? ' on' : ''}`}
              onClick={() => setViewMode(v => v === 'actions' ? 'meeting' : 'actions')}
              title="View all open action items"
            >
              <span>✅ Open Action Items</span>
              <span className="mtg-actions-toggle-count">{allOpenActions.length}</span>
            </button>
            <button
              type="button"
              className={`mtg-actions-toggle${viewMode === 'attendance' ? ' on' : ''}`}
              onClick={() => setViewMode(v => v === 'attendance' ? 'meeting' : 'attendance')}
              title="View attendance & accountability across all meetings"
            >
              <span>📊 Attendance</span>
              {flaggedAttendanceCount > 0 && (
                <span className="mtg-actions-toggle-count mtg-actions-toggle-count-warn">{flaggedAttendanceCount}</span>
              )}
            </button>
            <button
              type="button"
              className={`mtg-actions-toggle${viewMode === 'followups' ? ' on' : ''}`}
              onClick={() => setViewMode(v => v === 'followups' ? 'meeting' : 'followups')}
              title="View meetings flagged for follow-up"
            >
              <span>🔔 Follow-ups</span>
              <span className="mtg-actions-toggle-count">{followUpMeetings.length}</span>
            </button>
            <button
              type="button"
              className={`mtg-actions-toggle${viewMode === 'board' ? ' on' : ''}`}
              onClick={() => setViewMode(v => v === 'board' ? 'meeting' : 'board')}
              title="Board view — every meeting grouped by status"
            >
              <span>🗂 Board View</span>
            </button>
          </div>
        )}

        <div className="mtg-sidebar-controls">
          <input
            className="mtg-inp"
            placeholder="Search title or location…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="mtg-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`mtg-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="mtg-pill-label">{p.label}</span>
                <span className="mtg-pill-count">{counts[p.key] || 0}</span>
              </button>
            ))}
          </div>
          <select
            className="mtg-inp"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            title="Filter by meeting type"
          >
            <option value="all">All types</option>
            {MEETING_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>

        <div className="mtg-list">
          {filteredMeetings.length === 0 && meetings.length > 0 && (
            <div className="mtg-list-empty">
              <p className="mtg-muted">No meetings match these filters.</p>
              <button
                className="mtg-btn mtg-btn-ghost mtg-btn-sm"
                onClick={() => { setFilter('all'); setQuery(''); setTypeFilter('all'); }}
              >
                Reset Filters
              </button>
            </div>
          )}
          {filteredMeetings.length === 0 && meetings.length === 0 && !showNew && (
            <p className="mtg-muted mtg-list-empty-msg">
              No meetings yet. Tap “+ New Meeting” to start.
            </p>
          )}
          {filteredMeetings.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              active={viewMode === 'meeting' && selectedId === m.id}
              onClick={() => { setSelectedId(m.id); setViewMode('meeting'); setDetailMode('view'); }}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="mtg-main">
        {viewMode === 'actions' && (
          <ActionsRollup
            items={allOpenActions}
            onJump={handleJumpToMeeting}
            onToggleDone={handleToggleRollupAction}
          />
        )}
        {viewMode === 'attendance' && (
          <AttendanceRollup stats={attendanceStats} />
        )}
        {viewMode === 'followups' && (
          <FollowUpsRollup
            items={followUpMeetings}
            onJump={handleJumpToMeeting}
            onResolve={handleResolveFollowUp}
          />
        )}
        {viewMode === 'board' && (
          <BoardView meetings={boardMeetings} onSelect={handleJumpToMeeting} />
        )}
        {viewMode === 'meeting' && !selected && (
          <div className="mtg-empty">
            <div className="mtg-empty-icon" aria-hidden="true">🗣</div>
            <div className="mtg-empty-title">No meeting selected</div>
            <div className="mtg-empty-sub">
              {meetings.length === 0
                ? 'Track worship-team meetings, planning sessions, and vision casts — with agendas, attendees, notes, and action items. Tap “+ New Meeting” to start.'
                : 'Pick a meeting from the sidebar, or create a new one.'}
            </div>
            {meetings.length === 0 && (
              <button
                className="mtg-btn mtg-btn-accent mtg-empty-cta"
                onClick={() => setShowNew(true)}
              >
                + Create your first meeting
              </button>
            )}
          </div>
        )}

        {viewMode === 'meeting' && selected && (
          <div className="mtg-detail">
            {/* ── Detail header ── */}
            <div className="mtg-detail-head">
              <div className="mtg-detail-head-info">
                {viewOnly ? (
                  <h2 className="mtg-title-view">{selected.title || 'Untitled meeting'}</h2>
                ) : (
                  <input
                    className="mtg-title-inp"
                    placeholder="Meeting title"
                    value={selected.title}
                    onChange={e => updateSelected({ title: e.target.value })}
                  />
                )}
                <div className="mtg-detail-meta">
                  {viewOnly ? (
                    <>
                      {selected.date && (
                        <span className="mtg-meta-chip mtg-meta-chip-view">📅 {formatDateFull(selected.date)}</span>
                      )}
                      {selected.startTime && (
                        <span className="mtg-meta-chip mtg-meta-chip-view">🕐 {formatTime(selected.startTime)}</span>
                      )}
                      {selected.duration > 0 && (
                        <span className="mtg-meta-chip mtg-meta-chip-view">⏱ {selected.duration} min</span>
                      )}
                      {selected.location && (
                        <span className="mtg-meta-chip mtg-meta-chip-view">📍 {selected.location}</span>
                      )}
                      <span className={`mtg-type-chip mtg-type-${selected.type || 'other'}`}>
                        {TYPE_INDEX[selected.type]?.icon || '🗣'} {TYPE_INDEX[selected.type]?.label || 'Other'}
                      </span>
                      {selected.recurrence && selected.recurrence !== 'none' && (
                        <span className="mtg-meta-chip mtg-meta-chip-view mtg-recur-chip-view">
                          🔁 {RECURRENCE_LABEL[selected.recurrence]}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type="date"
                        className="mtg-chip-inp"
                        value={selected.date || ''}
                        onChange={e => updateSelected({ date: e.target.value })}
                        title="Date"
                      />
                      <input
                        type="time"
                        className="mtg-chip-inp"
                        value={selected.startTime || ''}
                        onChange={e => updateSelected({ startTime: e.target.value })}
                        title="Start time"
                      />
                      <input
                        type="number"
                        min="0"
                        step="5"
                        className="mtg-chip-inp mtg-chip-inp-dur"
                        placeholder="min"
                        value={selected.duration === 0 ? '' : selected.duration ?? ''}
                        onChange={e => updateSelected({ duration: Number(e.target.value) || 0 })}
                        title="Duration (minutes)"
                      />
                      <input
                        type="text"
                        className="mtg-chip-inp mtg-chip-inp-loc"
                        placeholder="Location"
                        value={selected.location || ''}
                        onChange={e => updateSelected({ location: e.target.value })}
                      />
                      <select
                        className={`mtg-type-chip mtg-type-${selected.type || 'other'} mtg-type-select`}
                        value={selected.type || 'other'}
                        onChange={e => updateSelected({ type: e.target.value })}
                        title="Meeting type"
                      >
                        {MEETING_TYPES.map(t => (
                          <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                        ))}
                      </select>
                      <select
                        className={`mtg-chip-inp mtg-recur-select${selected.recurrence && selected.recurrence !== 'none' ? ' on' : ''}`}
                        value={selected.recurrence || 'none'}
                        onChange={e => updateSelected({ recurrence: e.target.value })}
                        title="Repeats"
                      >
                        {RECURRENCE_OPTIONS.map(r => (
                          <option key={r.key} value={r.key}>{r.key === 'none' ? r.label : `🔁 ${r.label}`}</option>
                        ))}
                      </select>
                    </>
                  )}

                  <div className="mtg-status-wrap">
                    <button
                      type="button"
                      className={`mtg-status-pill mtg-status-${selected.status || 'upcoming'} mtg-status-pill-btn`}
                      onClick={() => setStatusMenuOpen(v => !v)}
                      onBlur={() => setTimeout(() => setStatusMenuOpen(false), 150)}
                      title="Change status"
                    >
                      {STATUSES.find(s => s.key === selected.status)?.label || 'Upcoming'} ▾
                    </button>
                    {statusMenuOpen && (
                      <div className="mtg-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            type="button"
                            className={`mtg-status-menu-item mtg-status-${s.key}${
                              selected.status === s.key ? ' on' : ''
                            }`}
                            onMouseDown={e => {
                              e.preventDefault();
                              handleStatusChange(s.key);
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mtg-quick-actions">
                  <button
                    className="mtg-btn mtg-btn-accent mtg-btn-sm"
                    onClick={handleStartMeeting}
                    disabled={selected.status === 'in-progress' || selected.status === 'completed'}
                    title="Mark meeting as in-progress"
                  >
                    ▶ Start Meeting
                  </button>
                  <button
                    className="mtg-btn mtg-btn-ghost mtg-btn-sm"
                    onClick={handleEndMeeting}
                    disabled={selected.status === 'completed'}
                    title="Mark meeting as completed"
                  >
                    ⏹ End Meeting
                  </button>
                  {selected.recurrence && selected.recurrence !== 'none' && (
                    <button
                      className="mtg-btn mtg-btn-ghost mtg-btn-sm"
                      onClick={handleCreateNextOccurrence}
                      title={`Create the next occurrence (${RECURRENCE_LABEL[selected.recurrence]}) with the same attendees re-invited`}
                    >
                      🔁 Next Occurrence
                    </button>
                  )}
                  <button
                    className={`mtg-btn mtg-btn-sm${armedCancel ? ' mtg-btn-danger-armed' : ' mtg-btn-danger'}`}
                    onClick={handleCancelMeeting}
                    onBlur={() => setArmedCancel(false)}
                    disabled={selected.status === 'cancelled'}
                    title={armedCancel ? 'Click again to confirm cancellation' : 'Cancel meeting'}
                  >
                    {armedCancel ? 'Confirm Cancel' : 'Cancel'}
                  </button>
                </div>
              </div>

              <div className="mtg-detail-actions">
                <button
                  type="button"
                  className="mtg-btn mtg-btn-ghost mtg-btn-sm mtg-mode-toggle"
                  onClick={() => setDetailMode(viewOnly ? 'edit' : 'view')}
                  title={viewOnly ? 'Switch to Edit Mode' : 'Switch to View Mode'}
                >
                  {viewOnly ? '✏️ Edit' : '👁 View'}
                </button>
                {!viewOnly && (
                  <button
                    className={`mtg-btn${armedDelete ? ' mtg-btn-danger-armed' : ' mtg-btn-danger'}`}
                    onClick={handleDelete}
                    onBlur={() => setArmedDelete(false)}
                    title={armedDelete ? 'Click again to confirm deletion' : 'Delete meeting'}
                  >
                    {armedDelete ? 'Confirm Delete' : 'Delete'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Detail body ── */}
            <div className="mtg-form">

              {/* ── Section: Attendees ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">👥</span>
                  <span className="mtg-sec-label">Attendees</span>
                  <span className="mtg-sec-count">{(selected.attendees || []).length}</span>
                </div>
                <div className="mtg-sec-body">
                  <div className="mtg-attendee-list">
                    {(selected.attendees || []).map(a => (
                      <span
                        key={a.id}
                        className={`mtg-attendee-chip mtg-att-${a.status}`}
                        onClick={() => handleCycleAttendee(a.id)}
                        title={`${ATTENDEE_LABEL[a.status] || a.status} — click to cycle status`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCycleAttendee(a.id); }}
                      >
                        <span className="mtg-att-dot" aria-hidden="true" />
                        <span className="mtg-att-name">{a.name}</span>
                        {!viewOnly && (
                          <button
                            type="button"
                            className="mtg-att-x"
                            onClick={e => { e.stopPropagation(); handleRemoveAttendee(a.id); }}
                            title="Remove attendee"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                    {(selected.attendees || []).length === 0 && (
                      <span className="mtg-muted mtg-sec-empty">No attendees yet.</span>
                    )}
                  </div>
                  {!viewOnly && <AddAttendee roster={roster} onAdd={handleAddAttendee} />}
                  <span className="mtg-hint">
                    Click an attendee chip to cycle status: invited → attending → attended → declined.
                  </span>
                </div>
              </section>

              {/* ── Section: Roster & Scheduling ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">🎯</span>
                  <span className="mtg-sec-label">Roster & Scheduling</span>
                </div>
                <div className="mtg-sec-body">
                  {upcomingGaps.length === 0 && (
                    <span className="mtg-muted mtg-sec-empty">No upcoming services scheduled yet.</span>
                  )}
                  <div className="mtg-gap-list">
                    {upcomingGaps.map(g => {
                      const chip = formatDateChip(g.date);
                      return (
                        <div key={g.id} className="mtg-gap-row">
                          <div className="mtg-gap-date">
                            <span className="mtg-gap-date-mon">{chip.mon}</span>
                            <span className="mtg-gap-date-day">{chip.day}</span>
                          </div>
                          <div className="mtg-gap-body">
                            <div className="mtg-gap-title">{g.name || 'Service'}</div>
                            {g.gaps.length === 0 ? (
                              <span className="mtg-gap-filled">✓ Fully staffed</span>
                            ) : (
                              <div className="mtg-gap-roles">
                                {g.gaps.map(role => (
                                  <span key={role} className="mtg-gap-role-chip">{role}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Link to="/worship/team/scheduling" className="mtg-hint mtg-gap-link">
                    Open Scheduling →
                  </Link>
                </div>
              </section>

              {/* ── Section: Agenda ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">📋</span>
                  <span className="mtg-sec-label">Agenda</span>
                  <span className="mtg-sec-count">{(selected.agenda || []).length}</span>
                  <span className={`mtg-agenda-total${agendaOver ? ' over' : ''}`}>
                    {agendaTotal} min
                    {selected.duration > 0 && (
                      <> / {selected.duration} min{agendaOver ? ' (over!)' : ''}</>
                    )}
                  </span>
                </div>
                <div className="mtg-sec-body">
                  <div className="mtg-agenda-list">
                    {(selected.agenda || []).map(item => (
                      <AgendaRow
                        key={item.id}
                        item={item}
                        roster={roster}
                        songs={songs}
                        viewOnly={viewOnly}
                        isDragging={dragId === item.id}
                        onChange={(patch) => handleAgendaChange(item.id, patch)}
                        onRemove={() => handleAgendaRemove(item.id)}
                        onDragStart={(e) => {
                          setDragId(item.id);
                          e.dataTransfer.effectAllowed = 'move';
                          try { e.dataTransfer.setData('text/plain', item.id); } catch { /* noop */ }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId = dragId || (e.dataTransfer.getData && e.dataTransfer.getData('text/plain'));
                          handleAgendaReorder(fromId, item.id);
                          setDragId(null);
                        }}
                        onDragEnd={() => setDragId(null)}
                      />
                    ))}
                    {(selected.agenda || []).length === 0 && (
                      <span className="mtg-muted mtg-sec-empty">No agenda items yet.</span>
                    )}
                  </div>
                  {!viewOnly && (
                    <div className="mtg-add-inline">
                      <input
                        className="mtg-inp"
                        placeholder="+ Add agenda item — press Enter"
                        value={newAgendaTitle}
                        onChange={e => setNewAgendaTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAgenda(); } }}
                      />
                      <button
                        type="button"
                        className="mtg-btn mtg-btn-accent mtg-btn-sm"
                        onClick={() => handleAddAgenda()}
                        disabled={!newAgendaTitle.trim()}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Section: Rehearsal Details (rehearsal meetings only) ── */}
              {selected.type === 'rehearsal' && (
                <section className="mtg-sec">
                  <div className="mtg-sec-head">
                    <span className="mtg-sec-icon" aria-hidden="true">🎼</span>
                    <span className="mtg-sec-label">Rehearsal Details</span>
                  </div>
                  <div className="mtg-sec-body">
                    {viewOnly ? (
                      <span className="mtg-view-tag mtg-view-tag-lg">
                        🎶 {setlists.find(sl => sl.id === selected.setlistId)?.name || 'No setlist linked'}
                      </span>
                    ) : (
                      <select
                        className="mtg-inp"
                        value={selected.setlistId || ''}
                        onChange={e => updateSelected({ setlistId: e.target.value || null })}
                      >
                        <option value="">No setlist linked</option>
                        {setlists.map(sl => (
                          <option key={sl.id} value={sl.id}>
                            {sl.name || 'Untitled setlist'}{sl.event_date ? ` — ${formatDateShort(sl.event_date)}` : ''}
                          </option>
                        ))}
                      </select>
                    )}

                    {rehearsalSongs.length > 0 && (
                      <div className="mtg-rehearsal-songs">
                        {rehearsalSongs.map(rs => (
                          <div key={rs.song_id} className="mtg-rehearsal-song-row">
                            <span className="mtg-rehearsal-song-title">{rs.title}</span>
                            {rs.song_key && <span className="mtg-rehearsal-song-meta">{rs.song_key}</span>}
                            {rs.tempo && <span className="mtg-rehearsal-song-meta">{rs.tempo} BPM</span>}
                            {viewOnly ? (
                              (selected.songNotes || {})[rs.song_id] && (
                                <span className="mtg-view-text mtg-rehearsal-song-notes-view">
                                  {(selected.songNotes || {})[rs.song_id]}
                                </span>
                              )
                            ) : (
                              <input
                                className="mtg-inp mtg-rehearsal-song-notes"
                                placeholder="Notes for this song (click, transitions, cues)…"
                                value={(selected.songNotes || {})[rs.song_id] || ''}
                                onChange={e => updateSelected({
                                  songNotes: { ...(selected.songNotes || {}), [rs.song_id]: e.target.value },
                                })}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {selected.setlistId && rehearsalSongs.length === 0 && (
                      <span className="mtg-muted mtg-sec-empty">Linked setlist has no songs yet.</span>
                    )}

                    {viewOnly ? (
                      selected.techNotes
                        ? <p className="mtg-view-note">{selected.techNotes}</p>
                        : <span className="mtg-muted mtg-sec-empty">No tech notes.</span>
                    ) : (
                      <textarea
                        className="mtg-inp mtg-textarea"
                        placeholder="Click-track / tech notes — tempo map, playback cues, in-ear mix notes…"
                        rows={3}
                        value={selected.techNotes || ''}
                        onChange={e => updateSelected({ techNotes: e.target.value })}
                      />
                    )}
                  </div>
                </section>
              )}

              {/* ── Section: Action Items ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">✅</span>
                  <span className="mtg-sec-label">Action Items</span>
                  <span className="mtg-sec-count">{(selected.actionItems || []).length}</span>
                  <span className="mtg-action-stats">
                    {actionStats.open} open · {actionStats.completed} completed
                  </span>
                </div>
                <div className="mtg-sec-body">
                  <div className="mtg-action-list">
                    {(selected.actionItems || []).map(item => (
                      <ActionRow
                        key={item.id}
                        item={item}
                        roster={roster}
                        viewOnly={viewOnly}
                        onChange={(patch) => handleActionChange(item.id, patch)}
                        onRemove={() => handleActionRemove(item.id)}
                      />
                    ))}
                    {(selected.actionItems || []).length === 0 && (
                      <span className="mtg-muted mtg-sec-empty">No action items yet.</span>
                    )}
                  </div>
                  {!viewOnly && (
                    <div className="mtg-add-inline">
                      <input
                        className="mtg-inp"
                        placeholder="+ Add action item — press Enter"
                        value={newActionText}
                        onChange={e => setNewActionText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAction(); } }}
                      />
                      <button
                        type="button"
                        className="mtg-btn mtg-btn-accent mtg-btn-sm"
                        onClick={() => handleAddAction()}
                        disabled={!newActionText.trim()}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Section: Follow-up ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">🔔</span>
                  <span className="mtg-sec-label">Follow-up</span>
                  {selected.followUpNeeded && <span className="mtg-followup-badge">Needed</span>}
                </div>
                <div className="mtg-sec-body">
                  <label className="mtg-followup-toggle">
                    <input
                      type="checkbox"
                      checked={!!selected.followUpNeeded}
                      onChange={e => updateSelected({ followUpNeeded: e.target.checked })}
                    />
                    <span>This meeting needs a follow-up</span>
                  </label>
                  {selected.followUpNeeded && (
                    <div className="mtg-followup-fields">
                      {viewOnly ? (
                        <>
                          {selected.followUpDate && (
                            <span className="mtg-view-tag">📅 {formatDateShort(selected.followUpDate)}</span>
                          )}
                          {selected.followUpNotes
                            ? <p className="mtg-view-note">{selected.followUpNotes}</p>
                            : <span className="mtg-muted mtg-sec-empty">No follow-up notes.</span>}
                        </>
                      ) : (
                        <>
                          <input
                            type="date"
                            className="mtg-inp mtg-followup-date"
                            value={selected.followUpDate || ''}
                            onChange={e => updateSelected({ followUpDate: e.target.value })}
                            title="Follow up by"
                          />
                          <textarea
                            className="mtg-inp mtg-textarea"
                            placeholder="What needs to happen — who to check in with, what to revisit…"
                            rows={2}
                            value={selected.followUpNotes || ''}
                            onChange={e => updateSelected({ followUpNotes: e.target.value })}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* ── General notes ── */}
              <section className="mtg-sec">
                <div className="mtg-sec-head">
                  <span className="mtg-sec-icon" aria-hidden="true">📝</span>
                  <span className="mtg-sec-label">General Notes</span>
                </div>
                <div className="mtg-sec-body">
                  {viewOnly ? (
                    selected.generalNotes
                      ? <p className="mtg-view-note">{selected.generalNotes}</p>
                      : <span className="mtg-muted mtg-sec-empty">No notes yet.</span>
                  ) : (
                    <textarea
                      className="mtg-inp mtg-textarea"
                      placeholder="Free-form notes from the meeting — discussion points, decisions, ideas…"
                      rows={5}
                      value={selected.generalNotes || ''}
                      onChange={e => updateSelected({ generalNotes: e.target.value })}
                    />
                  )}
                </div>
              </section>

              <div className="mtg-meta-footer">
                Last updated {selected.updatedAt
                  ? new Date(selected.updatedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                    })
                  : '—'}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
