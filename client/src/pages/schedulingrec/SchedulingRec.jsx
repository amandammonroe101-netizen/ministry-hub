import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorshipShell from '../worship/WorshipShell';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import { studioProjectService } from '../../services/studioProjectService';
import { sharedStudioProjectService } from '../../services/sharedStudioProjectService';
import { getProfileByKey, useUserProfile } from '../../lib/userProfile';
import { db, auth } from '../../lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import './SchedulingRec.css';

/* ─────────────────────────────────────────────────────────────
   Scheduling Rec. — schedule recording / production sessions
   Sister page to Scheduling (Band/Team), but for studio bookings
   instead of Sunday services.

   Namespace:    .sr-*   (distinct from .sc-* and .sb-*)
   Persistence:  localStorage key `recording:schedule`
   Reads:        localStorage key `band:roster` (members)
                 songService.getAll()              (song-link picker)
   Accent:       var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const LS_SCHED_KEY  = 'recording:schedule';
const LS_ROSTER_KEY = 'band:roster';

/* ── Session types ───────────────────────────────────────────── */
const SESSION_TYPES = [
  { key: 'tracking',    label: 'Tracking',    icon: '🎙' },
  { key: 'rehearsal',   label: 'Rehearsal',   icon: '🎼' },
  { key: 'mixing',      label: 'Mixing',      icon: '🎚' },
  { key: 'mastering',   label: 'Mastering',   icon: '💎' },
  { key: 'songwriting', label: 'Songwriting', icon: '✍' },
  { key: 'songdemo',    label: 'Song demo',   icon: '🎵' },
  { key: 'other',       label: 'Other',       icon: '📋' },
];

const TYPE_INDEX = SESSION_TYPES.reduce((acc, t) => { acc[t.key] = t; return acc; }, {});

/* ── Status ──────────────────────────────────────────────────── */
const STATUSES = [
  { key: 'scheduled',   label: 'Scheduled'   },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed',   label: 'Completed'   },
  { key: 'cancelled',   label: 'Cancelled'   },
];

/* ── Standard recording roles (slot definitions) ─────────────── */
/* `match` is used to filter the roster down to eligible members when
   assigning. A member matches a slot when their `role` equals one of
   the matchers OR their `instruments` array contains one of the
   matchers (case-insensitive). */
const STANDARD_ROLES = [
  { id: 'producer',     label: 'Producer',          match: ['Producer'] },
  { id: 'engineer',     label: 'Engineer',          match: ['Engineer', 'Audio Engineer', 'Sound', 'Audio', 'FOH'] },
  { id: 'lead-vocal',   label: 'Lead Vocal',        match: ['Worship Leader', 'Vocals', 'Vocal', 'Lead Vocal'] },
  { id: 'bg-vocals',    label: 'Background Vocals', match: ['Vocals', 'Vocal', 'Background Vocals', 'BGV'] },
  { id: 'acoustic',     label: 'Acoustic Guitar',   match: ['Acoustic Guitar', 'Guitar'] },
  { id: 'electric',     label: 'Electric Guitar',   match: ['Electric Guitar', 'Guitar'] },
  { id: 'bass',         label: 'Bass',              match: ['Bass', 'Bass Guitar'] },
  { id: 'keys',         label: 'Keys',              match: ['Keys', 'Piano', 'Keys / Piano', 'Keyboard'] },
  { id: 'drums',        label: 'Drums',             match: ['Drums', 'Drummer'] },
  { id: 'percussion',   label: 'Percussion',        match: ['Percussion', 'Drums'] },
  { id: 'other',        label: 'Other',             match: [] },
];

const TOTAL_SLOTS = STANDARD_ROLES.length;

/* ── Helpers ─────────────────────────────────────────────────── */
function uid(prefix = 'rec') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

function monthGroupKey(dateStr) {
  if (!dateStr) return 'No date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function loadSchedule() {
  try {
    const raw = localStorage.getItem(LS_SCHED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSchedule(sessions) {
  try {
    localStorage.setItem(LS_SCHED_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('Failed to save recording schedule to localStorage', err);
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

/* Note for whoever is editing this later:
   Don't forget to publish the /scheduleRequests rule block in
   docs/firestore.rules (Firebase Console → Firestore → Rules
   → Publish). Without it, the setDoc below will fail with
   permission-denied for the sender. */

/* Push a recording-session request to the collaborator. Lives in
   the /scheduleRequests collection. Logs the attempt + result so
   we can debug delivery issues from the browser console. */
async function sendScheduleRequest(session, recipient, sender) {
  // eslint-disable-next-line no-console
  console.log('[scheduling-rec] sending request:', {
    senderUid:    sender?.uid,
    senderName:   sender?.name,
    recipientUid: recipient?.uid,
    recipientName: recipient?.name,
    sessionName:  session?.name,
  });
  if (!db) {
    // eslint-disable-next-line no-console
    console.error('[scheduling-rec] aborted: Firestore not configured');
    return null;
  }
  if (!auth?.currentUser) {
    // eslint-disable-next-line no-console
    console.error('[scheduling-rec] aborted: no signed-in user');
    return null;
  }
  if (!recipient?.uid) {
    // eslint-disable-next-line no-console
    console.error('[scheduling-rec] aborted: no recipient uid (collaborator key didn\'t resolve)');
    return null;
  }
  const id = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ref = doc(collection(db, 'scheduleRequests'), id);
  try {
    await setDoc(ref, {
      senderUid:    sender.uid,
      senderName:   sender.name || 'Member',
      recipientUid: recipient.uid,
      recipientName: recipient.name || 'Member',
      session,
      status:       'pending',     // 'pending' | 'accepted' | 'declined'
      createdAt:    serverTimestamp(),
    });
    // eslint-disable-next-line no-console
    console.log('[scheduling-rec] request written:', id);
    return id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[scheduling-rec] write failed:', err?.code || err?.message || err);
    throw err;
  }
}

function countFilled(assignments) {
  if (!assignments) return 0;
  // Count any non-empty assignment slot (covers custom roles too)
  return Object.values(assignments).filter(v => !!v).length;
}

function fillColor(filled, total) {
  if (filled === 0)    return '#ef4444';
  if (filled >= total) return '#34d399';
  return '#fbbf24';
}

function memberMatchesRole(member, role) {
  if (!member || !role) return false;
  const matchers = (role.match || []).map(m => m.toLowerCase());
  if (matchers.length === 0) return false; // e.g. "Other" — fallback to "show all"
  const memberRole = (member.role || '').toLowerCase();
  if (memberRole && matchers.includes(memberRole)) return true;
  const instruments = Array.isArray(member.instruments) ? member.instruments : [];
  for (const inst of instruments) {
    if (matchers.includes((inst || '').toLowerCase())) return true;
  }
  return false;
}

/* Is this session in the upcoming bucket (start in the future, not done)? */
function isUpcomingBucket(s) {
  if (!s) return false;
  if (s.status === 'cancelled') return false;
  if (s.status === 'completed') return false;
  if (s.status === 'in-progress') return true;
  if (!s.date) return true;
  const t = new Date((s.date) + 'T' + (s.startTime || '00:00') + ':00');
  if (isNaN(t.getTime())) return true;
  return t.getTime() >= Date.now() - 24 * 60 * 60 * 1000; // include today
}

function emptySession(overrides = {}) {
  const now = Date.now();
  return {
    id:           uid(),
    name:         '',
    date:         todayIso(),
    startTime:    '10:00',
    endTime:      '',
    duration:     120,
    location:     '',
    type:         'tracking',
    songId:       null,
    songTitle:    '',
    assignments:  {},
    goals:        '',
    notes:        '',
    status:       'scheduled',
    /* Studio-project linkage. `projectKind` is one of:
         'none'     — no project linked
         'new'      — create a fresh personal project when saving
         'personal' — link to an existing personal project
         'shared'   — link to an existing collaborative project
       `projectId` is set to the chosen id (or to the newly-created
       project's id after the session is saved with kind='new').
       `projectName` is denormalized for the card UI so we don't
       have to re-fetch the project just to show its name. */
    projectKind:  'none',
    projectId:    null,
    projectName:  '',
    /* Optional collaborator the session is being requested with.
       Looked up by their identifying key in the form. */
    collaboratorUid:  null,
    collaboratorName: '',
    createdAt:    now,
    updatedAt:    now,
    ...overrides,
  };
}

/* ─── Song autocomplete (for new + detail) ───────────────────── */
function SongAutocomplete({
  value, onChange, onPick, songs, placeholder = 'Link a song…',
  className = 'sr-inp', inputProps = {},
}) {
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!Array.isArray(songs) || songs.length === 0) return [];
    if (!q) return songs.slice(0, 8);
    return songs
      .filter(s => (s.title || '').toLowerCase().includes(q)
                || (s.artist || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [songs, value]);

  return (
    <div className="sr-ac">
      <input
        {...inputProps}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="sr-ac-dropdown">
          {matches.map(s => (
            <button
              type="button"
              key={s.id || s.title}
              className="sr-ac-option"
              onMouseDown={e => {
                e.preventDefault();
                onPick(s);
                setOpen(false);
              }}
            >
              <span className="sr-ac-name">{s.title || 'Untitled'}</span>
              {s.artist && <span className="sr-ac-role">{s.artist}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── New Session Form ───────────────────────────────────────── */
function NewSessionForm({ songs, onCreate, onCancel }) {
  const [name,      setName]      = useState('Tracking session');
  const [date,      setDate]      = useState(todayIso());
  const [startTime, setStartTime] = useState('10:00');
  const [duration,  setDuration]  = useState('120');
  const [type,      setType]      = useState('tracking');
  const [songText,  setSongText]  = useState('');
  const [songId,    setSongId]    = useState(null);
  const [notes,     setNotes]     = useState('');
  const [error,     setError]     = useState('');

  /* Project linkage state */
  const [projectKind, setProjectKind] = useState('none');  // none|new|personal|shared
  const [projectId,   setProjectId]   = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [personalProjects, setPersonalProjects] = useState([]);
  const [sharedProjects,   setSharedProjects]   = useState([]);
  const [loadingProjects,  setLoadingProjects]  = useState(false);

  /* Collaborator state — looked up by identifying key */
  const [collabKey,  setCollabKey]  = useState('');
  const [collabName, setCollabName] = useState('');
  const [collabUid,  setCollabUid]  = useState(null);
  const [collabStatus, setCollabStatus] = useState(''); // '' | 'looking' | 'found' | 'not-found'

  const { profile } = useUserProfile();

  /* Load personal + shared projects when the form mounts so the
     two project pickers are populated. Both lists are best-effort —
     a failure on one side just shows an empty dropdown for that
     category. */
  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    (async () => {
      const [personalRes, sharedRes] = await Promise.allSettled([
        studioProjectService.getAll(),
        sharedStudioProjectService.getMine(),
      ]);
      if (cancelled) return;
      if (personalRes.status === 'fulfilled') {
        const list = personalRes.value?.data?.data;
        setPersonalProjects(Array.isArray(list) ? list : []);
      }
      if (sharedRes.status === 'fulfilled') {
        setSharedProjects(Array.isArray(sharedRes.value) ? sharedRes.value : []);
      }
      setLoadingProjects(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Debounced collaborator lookup. Anything > 4 chars triggers a
     getProfileByKey call (the chat invites use the same helper).
     We strip non-alphanumerics + uppercase so users can paste a
     formatted "ABCD-EFGH" key directly. */
  useEffect(() => {
    const trimmed = (collabKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (trimmed.length < 8) {
      setCollabName('');
      setCollabUid(null);
      setCollabStatus(trimmed.length === 0 ? '' : 'looking');
      return;
    }
    let cancelled = false;
    setCollabStatus('looking');
    const t = setTimeout(async () => {
      try {
        const p = await getProfileByKey(trimmed);
        if (cancelled) return;
        if (p) {
          setCollabName(p.displayName || 'Member');
          setCollabUid(p.uid);
          setCollabStatus('found');
        } else {
          setCollabName('');
          setCollabUid(null);
          setCollabStatus('not-found');
        }
      } catch {
        if (!cancelled) {
          setCollabStatus('not-found');
          setCollabUid(null);
        }
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [collabKey]);

  function handlePickSong(s) {
    setSongText(s.title || '');
    setSongId(s.id || null);
  }

  function handleSongChange(text) {
    setSongText(text);
    if (!text.trim()) setSongId(null);
    else if (songId) setSongId(null); // typing breaks the link until re-picked
  }

  /* Resolve the selected project — for kind='new' we create it
     here so the saved session can reference the new project id.
     Returns { kind, id, name } or null on failure (already
     surfaced via setError). */
  async function resolveProjectSelection() {
    if (projectKind === 'none') return { kind: 'none', id: null, name: '' };
    if (projectKind === 'personal') {
      if (!projectId) { setError('Pick a personal project from the list.'); return null; }
      const p = personalProjects.find(x => x.id === projectId);
      return { kind: 'personal', id: projectId, name: p?.name || '' };
    }
    if (projectKind === 'shared') {
      if (!projectId) { setError('Pick a collaboration from the list.'); return null; }
      const p = sharedProjects.find(x => x.id === projectId);
      return { kind: 'shared', id: projectId, name: p?.name || '' };
    }
    if (projectKind === 'new') {
      const projName = (newProjectName || name || 'New session').trim();
      if (!projName) { setError('Type a name for the new project.'); return null; }
      try {
        const created = await studioProjectService.create({ name: projName });
        const newId = created?.data?.data?.id;
        if (!newId) throw new Error('No project id returned');
        return { kind: 'personal', id: newId, name: projName };
      } catch (e) {
        setError(`Could not create project: ${e?.message || 'unknown error'}`);
        return null;
      }
    }
    return { kind: 'none', id: null, name: '' };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!date)        { setError('Date is required.'); return; }
    /* If they typed something in the collaborator field but it
       didn't resolve, warn before submitting. */
    if (collabKey.trim() && !collabUid) {
      setError('Collaborator key didn\'t match a user. Double-check it or clear the field.');
      return;
    }
    const proj = await resolveProjectSelection();
    if (proj === null) return; // error already shown

    const dur = Number(duration) || 0;
    const session = emptySession({
      name:       name.trim(),
      date,
      startTime:  startTime || '10:00',
      duration:   dur,
      type,
      songId:     songId || null,
      songTitle:  songText.trim(),
      notes:      notes.trim(),
      projectKind: proj.kind,
      projectId:   proj.id,
      projectName: proj.name,
      collaboratorUid:  collabUid || null,
      collaboratorName: collabName || '',
    });

    /* If a collaborator was set, push the request to Firestore so
       the other user can see / accept it later. Failure here
       doesn't block creating the local session — the request is
       a nice-to-have, the session itself is what matters. */
    if (collabUid) {
      try {
        await sendScheduleRequest(session, {
          uid:  collabUid,
          name: collabName,
        }, {
          uid:  auth?.currentUser?.uid,
          name: profile?.displayName || 'Member',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[scheduling-rec] could not send request to collaborator:', err);
      }
    }

    onCreate(session);
  }

  return (
    <form className="sr-new-form" onSubmit={handleSubmit}>
      {error && <p className="sr-error">{error}</p>}
      <input
        className="sr-inp"
        placeholder="Session name (e.g. Tracking — Verse vocals)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <div className="sr-new-row">
        <input
          className="sr-inp"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <input
          className="sr-inp"
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
        />
      </div>
      <div className="sr-new-row">
        <input
          className="sr-inp"
          type="number"
          min="0"
          step="15"
          placeholder="Duration (min)"
          value={duration}
          onChange={e => setDuration(e.target.value)}
        />
        <select
          className="sr-inp"
          value={type}
          onChange={e => setType(e.target.value)}
        >
          {SESSION_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>
      <SongAutocomplete
        value={songText}
        onChange={handleSongChange}
        onPick={handlePickSong}
        songs={songs}
        placeholder="Link a song (optional)…"
      />

      {/* ── Studio project linkage ─────────────────────────────
          Dropdown switches between four modes; the second control
          (project picker / new-name input) depends on the mode. */}
      <div className="sr-new-row">
        <select
          className="sr-inp"
          value={projectKind}
          onChange={e => {
            setProjectKind(e.target.value);
            setProjectId('');     // reset selection when switching modes
          }}
        >
          <option value="none">No project linked</option>
          <option value="new">+ New project</option>
          <option value="personal" disabled={personalProjects.length === 0}>
            Already created{personalProjects.length === 0 ? ' (none yet)' : ''}
          </option>
          <option value="shared" disabled={sharedProjects.length === 0}>
            🤝 Collaborated{sharedProjects.length === 0 ? ' (none yet)' : ''}
          </option>
        </select>
        {projectKind === 'new' && (
          <input
            className="sr-inp"
            placeholder="New project name"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
          />
        )}
        {projectKind === 'personal' && (
          <select
            className="sr-inp"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            disabled={loadingProjects}
          >
            <option value="">{loadingProjects ? 'Loading…' : 'Choose a project…'}</option>
            {personalProjects.map(p => (
              <option key={p.id} value={p.id}>🎚 {p.name}</option>
            ))}
          </select>
        )}
        {projectKind === 'shared' && (
          <select
            className="sr-inp"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            disabled={loadingProjects}
          >
            <option value="">{loadingProjects ? 'Loading…' : 'Choose a collaboration…'}</option>
            {sharedProjects.map(p => (
              <option key={p.id} value={p.id}>🤝 {p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Optional collaborator ────────────────────────────────
          Enter another user's identifying key. When it resolves to
          a real user, a Firestore /scheduleRequests doc is written
          on submit so they can see + accept the session later. */}
      <div className="sr-collab-field">
        <input
          className="sr-inp"
          placeholder="Schedule with someone? Paste their identifying key (optional)"
          value={collabKey}
          onChange={e => setCollabKey(e.target.value)}
        />
        {collabStatus === 'found' && (
          <div className="sr-collab-found">
            ✓ Will send a request to <strong>{collabName}</strong>
          </div>
        )}
        {collabStatus === 'not-found' && (
          <div className="sr-collab-missing">
            No user with that identifying key.
          </div>
        )}
        {collabStatus === 'looking' && (
          <div className="sr-collab-looking">Looking up…</div>
        )}
      </div>

      <textarea
        className="sr-inp sr-textarea"
        placeholder="Notes (optional)"
        rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="sr-new-form-btns">
        <button type="submit" className="sr-btn sr-btn-accent">Create</button>
        <button type="button" className="sr-btn sr-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ─── Sidebar Session Card ───────────────────────────────────── */
function SessionCard({ session, active, onClick }) {
  const filled = countFilled(session.assignments);
  const total  = TOTAL_SLOTS;
  const color  = fillColor(filled, total);
  const t      = TYPE_INDEX[session.type] || TYPE_INDEX.other;
  return (
    <button
      className={`sr-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="sr-card-date-row">
        <span className="sr-card-type-icon" aria-hidden="true">{t.icon}</span>
        <span className="sr-card-date">{formatDateShort(session.date) || '— No date'}</span>
        <span className="sr-card-time" title="Start time">{session.startTime || ''}</span>
      </div>
      <div className="sr-card-name">{session.name || 'Untitled session'}</div>
      {session.songTitle && (
        <div className="sr-card-song" title={`Linked song: ${session.songTitle}`}>
          🎵 {session.songTitle}
        </div>
      )}
      <div className="sr-card-foot">
        <span
          className="sr-card-fill"
          style={{ '--fill-color': color }}
          title={`${filled} of ${total} roles filled`}
        >
          <span className="sr-card-fill-dot" />
          <span className="sr-card-fill-text">{filled}/{total} filled</span>
        </span>
        <span className={`sr-status-pill sr-status-${session.status || 'scheduled'}`}>
          {STATUSES.find(s => s.key === session.status)?.label || 'Scheduled'}
        </span>
      </div>
    </button>
  );
}

/* ─── Member Picker Modal ────────────────────────────────────── */
function MemberPicker({ role, roster, onPick, onClose }) {
  // For the "Other" role (empty match list), default to showing all.
  const [showAll, setShowAll] = useState(role && (role.match || []).length === 0);
  const [query,   setQuery]   = useState('');

  const matching = useMemo(
    () => roster.filter(m => memberMatchesRole(m, role)),
    [roster, role]
  );
  const list = showAll ? roster : matching;

  const filtered = list.filter(m => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (m.name || '').toLowerCase().includes(q)
        || (m.role || '').toLowerCase().includes(q)
        || (Array.isArray(m.instruments) ? m.instruments.join(' ').toLowerCase() : '').includes(q);
  });

  return (
    <div className="sr-picker-overlay" onClick={onClose}>
      <div className="sr-picker" onClick={e => e.stopPropagation()}>
        <div className="sr-picker-head">
          <div className="sr-picker-head-text">
            <span className="sr-picker-title">Assign {role.label}</span>
            <span className="sr-picker-sub">
              {matching.length} eligible {matching.length === 1 ? 'member' : 'members'} in roster
            </span>
          </div>
          <button className="sr-picker-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="sr-picker-controls">
          <input
            className="sr-picker-search"
            placeholder="Search members…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <label className="sr-picker-toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
            />
            <span>Show all members</span>
          </label>
        </div>

        <div className="sr-picker-list">
          {roster.length === 0 && (
            <div className="sr-picker-empty sr-muted">
              No team members in your roster yet.
              Add team members in the Roster tab first.
            </div>
          )}
          {roster.length > 0 && filtered.length === 0 && (
            <div className="sr-picker-empty sr-muted">
              {showAll
                ? 'No members match your search.'
                : `No eligible members for ${role.label}. Toggle "Show all members" to see everyone.`}
            </div>
          )}
          {filtered.map(m => {
            const eligible = memberMatchesRole(m, role);
            return (
              <button
                key={m.id || m.name}
                className={`sr-picker-row${!eligible ? ' off-role' : ''}`}
                onClick={() => onPick(m)}
              >
                <div className="sr-picker-row-main">
                  <span className="sr-picker-row-name">{m.name || 'Unnamed'}</span>
                  {m.role && (
                    <span className="sr-picker-row-role">{m.role}</span>
                  )}
                </div>
                {Array.isArray(m.instruments) && m.instruments.length > 0 && (
                  <div className="sr-picker-row-instruments">
                    {m.instruments.map(i => (
                      <span key={i} className="sr-picker-chip">{i}</span>
                    ))}
                  </div>
                )}
                {!eligible && (
                  <span className="sr-picker-off-tag">off-role</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Song Picker Modal ──────────────────────────────────────── */
function SongPickerModal({ songs, onPick, onClear, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!Array.isArray(songs)) return [];
    if (!q) return songs;
    return songs.filter(s =>
      (s.title || '').toLowerCase().includes(q)
      || (s.artist || '').toLowerCase().includes(q)
    );
  }, [songs, query]);

  return (
    <div className="sr-picker-overlay" onClick={onClose}>
      <div className="sr-picker" onClick={e => e.stopPropagation()}>
        <div className="sr-picker-head">
          <div className="sr-picker-head-text">
            <span className="sr-picker-title">Link a song</span>
            <span className="sr-picker-sub">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'} in library
            </span>
          </div>
          <button className="sr-picker-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="sr-picker-controls">
          <input
            className="sr-picker-search"
            placeholder="Search by title or artist…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="sr-btn sr-btn-ghost sr-btn-sm"
            onClick={onClear}
            title="Remove the song link from this session"
          >
            Clear link
          </button>
        </div>

        <div className="sr-picker-list">
          {songs.length === 0 && (
            <div className="sr-picker-empty sr-muted">
              No songs in your library yet. Add songs in the Songs tab first.
            </div>
          )}
          {songs.length > 0 && filtered.length === 0 && (
            <div className="sr-picker-empty sr-muted">
              No songs match your search.
            </div>
          )}
          {filtered.map(s => (
            <button
              key={s.id || s.title}
              className="sr-picker-row"
              onClick={() => onPick(s)}
            >
              <div className="sr-picker-row-main">
                <span className="sr-picker-row-name">{s.title || 'Untitled'}</span>
                {s.artist && <span className="sr-picker-row-role">{s.artist}</span>}
              </div>
              {(s.key || s.tempo) && (
                <div className="sr-picker-row-instruments">
                  {s.key   && <span className="sr-picker-chip">Key {s.key}</span>}
                  {s.tempo && <span className="sr-picker-chip">{s.tempo} bpm</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function SchedulingRec() {
  /* Live-synced via Firestore. */
  const [sessions,   setSessions]   = useUserStoreKey('recording:schedule', []);
  const [roster]                    = useUserStoreKey('band:roster',        []);
  const [songs,      setSongs]      = useUserStoreKey('songs',              []);
  const [searchParams, setSearchParams] = useSearchParams();

  /* Deep-link: ?id=<sessionId> auto-selects on mount, then strips the param */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    const parsed = fromUrl
      ? (Number.isNaN(Number(fromUrl)) ? fromUrl : Number(fromUrl))
      : null;
    return parsed;
  });

  useEffect(() => {
    const fromUrl = searchParams.get('id');
    if (fromUrl) {
      const parsed = Number.isNaN(Number(fromUrl)) ? fromUrl : Number(fromUrl);
      setSelectedId(parsed);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showNew,       setShowNew]       = useState(false);
  const [pickerRole,    setPickerRole]    = useState(null);  // role obj when member picker open
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');
  const [armedDelete,   setArmedDelete]   = useState(false);
  const [armedCancel,   setArmedCancel]   = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [typeMenuOpen,  setTypeMenuOpen]  = useState(false);

  /* Inline name editing */
  const [editingName, setEditingName] = useState(false);
  const [nameVal,     setNameVal]     = useState('');
  const previousIdRef = useRef(null);
  const armTimerRef = useRef(null);

  /* (No persist/listener/fetch — useUserStoreKey handles all three for
     sessions, roster, and songs.) */

  /* ── Auto-disarm danger buttons after 3s ─────────────────── */
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

  /* ── Reset transient state when selection changes ────────── */
  const selected = useMemo(
    () => sessions.find(s => s.id === selectedId) || null,
    [sessions, selectedId]
  );

  useEffect(() => {
    if (previousIdRef.current !== selectedId) {
      previousIdRef.current = selectedId;
      setArmedDelete(false);
      setArmedCancel(false);
      setStatusMenuOpen(false);
      setTypeMenuOpen(false);
      setEditingName(false);
      setShowCustomRole(false);
      setCustomRoleName('');
      setNameVal(selected?.name || '');
    }
  }, [selectedId, selected]);

  /* ── Sorted + grouped sessions ────────────────────────────── */
  const sortedSessions = useMemo(() => {
    const list = [...sessions];
    list.sort((a, b) => {
      const aUp = isUpcomingBucket(a);
      const bUp = isUpcomingBucket(b);
      if (aUp !== bUp) return aUp ? -1 : 1;
      const ad = a.date || '';
      const bd = b.date || '';
      const at = a.startTime || '00:00';
      const bt = b.startTime || '00:00';
      const aKey = `${ad}T${at}`;
      const bKey = `${bd}T${bt}`;
      if (aUp) {
        // upcoming: ascending
        if (!ad) return 1;
        if (!bd) return -1;
        return aKey.localeCompare(bKey);
      }
      // past: descending
      return bKey.localeCompare(aKey);
    });
    return list;
  }, [sessions]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const s of sortedSessions) {
      const key = monthGroupKey(s.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return Array.from(groups.entries());
  }, [sortedSessions]);

  /* ── Member lookup ────────────────────────────────────────── */
  const memberById = useMemo(() => {
    const map = new Map();
    for (const m of roster) {
      if (m && m.id != null) map.set(m.id, m);
    }
    return map;
  }, [roster]);

  /* ── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setSessions(prev => prev.map(s =>
      s.id === selectedId
        ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch), updatedAt: Date.now() }
        : s
    ));
  }, [selectedId]);

  const handleCreate = useCallback((sess) => {
    setSessions(prev => [sess, ...prev]);
    setSelectedId(sess.id);
    setShowNew(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setSessions(prev => prev.filter(s => s.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleCancelSession = useCallback(() => {
    if (!selected) return;
    if (!armedCancel) { setArmedCancel(true); return; }
    updateSelected({ status: 'cancelled' });
    setArmedCancel(false);
  }, [selected, armedCancel, updateSelected]);

  const handleStartSession = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: 'in-progress' });
  }, [selected, updateSelected]);

  const handleEndSession = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: 'completed' });
  }, [selected, updateSelected]);

  const handleStatusChange = useCallback((next) => {
    updateSelected({ status: next });
    setStatusMenuOpen(false);
  }, [updateSelected]);

  const handleTypeChange = useCallback((next) => {
    updateSelected({ type: next });
    setTypeMenuOpen(false);
  }, [updateSelected]);

  /* ── Assignments ──────────────────────────────────────────── */
  const handleAssign = useCallback((roleLabel, member) => {
    updateSelected(s => ({
      ...s,
      assignments: { ...(s.assignments || {}), [roleLabel]: member.id },
    }));
    setPickerRole(null);
  }, [updateSelected]);

  const handleUnassign = useCallback((roleLabel) => {
    updateSelected(s => {
      const next = { ...(s.assignments || {}) };
      delete next[roleLabel];
      return { assignments: next };
    });
  }, [updateSelected]);

  /* ── Custom roles ─────────────────────────────────────────── */
  const customRoles = useMemo(() => {
    if (!selected) return [];
    const standardLabels = new Set(STANDARD_ROLES.map(r => r.label));
    const fromAssignments = Object.keys(selected.assignments || {})
      .filter(label => !standardLabels.has(label));
    const fromList = Array.isArray(selected.customRoles) ? selected.customRoles : [];
    // De-dupe while preserving order
    const seen = new Set();
    const merged = [];
    [...fromList, ...fromAssignments].forEach(label => {
      if (label && !seen.has(label)) { seen.add(label); merged.push(label); }
    });
    return merged.map((label, i) => ({
      id: `custom-${i}`,
      label,
      match: [],
    }));
  }, [selected]);

  const handleAddCustomRole = useCallback(() => {
    const trimmed = customRoleName.trim();
    if (!trimmed || !selected) {
      setShowCustomRole(false);
      setCustomRoleName('');
      return;
    }
    // Avoid duplicates against standard or existing custom labels
    const existing = new Set([
      ...STANDARD_ROLES.map(r => r.label),
      ...customRoles.map(r => r.label),
    ]);
    if (existing.has(trimmed)) {
      setShowCustomRole(false);
      setCustomRoleName('');
      return;
    }
    updateSelected(s => ({
      customRoles: [...(s.customRoles || []), trimmed],
    }));
    setCustomRoleName('');
    setShowCustomRole(false);
  }, [customRoleName, selected, customRoles, updateSelected]);

  const handleRemoveCustomRole = useCallback((label) => {
    updateSelected(s => {
      const nextAssignments = { ...(s.assignments || {}) };
      delete nextAssignments[label];
      const nextList = (s.customRoles || []).filter(l => l !== label);
      return { customRoles: nextList, assignments: nextAssignments };
    });
  }, [updateSelected]);

  /* ── Song link handlers ──────────────────────────────────── */
  const handlePickSong = useCallback((song) => {
    updateSelected({
      songId:    song.id || null,
      songTitle: song.title || '',
    });
    setShowSongPicker(false);
  }, [updateSelected]);

  const handleClearSong = useCallback(() => {
    updateSelected({ songId: null, songTitle: '' });
    setShowSongPicker(false);
  }, [updateSelected]);

  /* ── Inline name commit ──────────────────────────────────── */
  const commitName = useCallback(() => {
    setEditingName(false);
    if (!selected) return;
    const trimmed = (nameVal || '').trim();
    if (!trimmed || trimmed === selected.name) {
      setNameVal(selected.name || '');
      return;
    }
    updateSelected({ name: trimmed });
  }, [selected, nameVal, updateSelected]);

  /* ── Derived header bits ─────────────────────────────────── */
  const filledCount = selected ? countFilled(selected.assignments) : 0;
  const totalSlots  = STANDARD_ROLES.length + customRoles.length;
  const fillTone    = selected ? fillColor(filledCount, totalSlots || 1) : '#ef4444';
  const typeMeta    = selected ? (TYPE_INDEX[selected.type] || TYPE_INDEX.other) : null;

  /* ── Combined role list for rendering ────────────────────── */
  const allRoles = useMemo(
    () => [...STANDARD_ROLES, ...customRoles],
    [customRoles]
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell title="Scheduling Rec." icon="🎙" subtitle="Scheduling for recording sessions — booking rooms, players, and engineers.">
    <div className="sr-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="sr-sidebar">
        <div className="sr-sidebar-head">
          <span className="sr-sidebar-title">Recording Sessions</span>
          {!showNew && (
            <button
              className="sr-new-btn"
              onClick={() => setShowNew(true)}
              title="New session"
            >
              + New Session
            </button>
          )}
        </div>

        {showNew && (
          <NewSessionForm
            songs={songs}
            onCreate={handleCreate}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="sr-list">
          {sortedSessions.length === 0 && !showNew && (
            <p className="sr-muted sr-list-empty">
              No recording sessions yet. Tap “+ New Session” to start.
            </p>
          )}
          {grouped.map(([groupName, groupSessions]) => (
            <div key={groupName} className="sr-group">
              <div className="sr-group-head">{groupName}</div>
              {groupSessions.map(sess => (
                <SessionCard
                  key={sess.id}
                  session={sess}
                  active={selectedId === sess.id}
                  onClick={() => setSelectedId(sess.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="sr-main">
        {!selected && (
          <div className="sr-empty">
            <div className="sr-empty-icon" aria-hidden="true">🎙</div>
            <div className="sr-empty-title">No recording session selected</div>
            <div className="sr-empty-sub">
              Pick a session from the sidebar, or create a new one to plan
              tracking, mixing, rehearsals, or songwriting blocks.
            </div>
            {sessions.length === 0 && (
              <button
                className="sr-btn sr-btn-accent sr-empty-cta"
                onClick={() => setShowNew(true)}
              >
                + Create your first session
              </button>
            )}
          </div>
        )}

        {selected && (
          <div className="sr-detail">
            {/* ── Detail header ── */}
            <div className="sr-detail-head">
              <div className="sr-detail-head-left">
                {editingName ? (
                  <input
                    className="sr-detail-name-inp"
                    value={nameVal}
                    onChange={e => setNameVal(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') {
                        setNameVal(selected.name || '');
                        setEditingName(false);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <h1
                    className="sr-detail-name"
                    onClick={() => { setNameVal(selected.name || ''); setEditingName(true); }}
                    title="Click to rename"
                  >
                    {selected.name || 'Untitled session'}
                    <span className="sr-edit-hint">✏</span>
                  </h1>
                )}

                <div className="sr-detail-meta">
                  <label className="sr-meta-field">
                    <span className="sr-meta-label">Date</span>
                    <input
                      className="sr-meta-inp"
                      type="date"
                      value={selected.date || ''}
                      onChange={e => updateSelected({ date: e.target.value })}
                    />
                  </label>
                  <label className="sr-meta-field">
                    <span className="sr-meta-label">Start</span>
                    <input
                      className="sr-meta-inp"
                      type="time"
                      value={selected.startTime || ''}
                      onChange={e => updateSelected({ startTime: e.target.value })}
                    />
                  </label>
                  <label className="sr-meta-field">
                    <span className="sr-meta-label">End</span>
                    <input
                      className="sr-meta-inp"
                      type="time"
                      value={selected.endTime || ''}
                      onChange={e => updateSelected({ endTime: e.target.value })}
                    />
                  </label>
                  <label className="sr-meta-field">
                    <span className="sr-meta-label">Min</span>
                    <input
                      className="sr-meta-inp sr-meta-inp-dur"
                      type="number"
                      min="0"
                      step="15"
                      value={selected.duration === 0 ? '' : selected.duration ?? ''}
                      onChange={e => updateSelected({ duration: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="sr-meta-field sr-meta-field-loc">
                    <span className="sr-meta-label">Location</span>
                    <input
                      className="sr-meta-inp"
                      type="text"
                      placeholder="Main sanctuary, Home studio…"
                      value={selected.location || ''}
                      onChange={e => updateSelected({ location: e.target.value })}
                    />
                  </label>

                  {/* Type chip (clickable to change) */}
                  <div className="sr-chip-wrap">
                    <button
                      type="button"
                      className={`sr-type-chip sr-type-${selected.type || 'other'}`}
                      onClick={() => setTypeMenuOpen(v => !v)}
                      onBlur={() => setTimeout(() => setTypeMenuOpen(false), 150)}
                      title="Change session type"
                    >
                      <span aria-hidden="true">{typeMeta?.icon}</span>
                      <span>{typeMeta?.label}</span>
                      <span className="sr-chip-caret">▾</span>
                    </button>
                    {typeMenuOpen && (
                      <div className="sr-chip-menu">
                        {SESSION_TYPES.map(t => (
                          <button
                            key={t.key}
                            type="button"
                            className={`sr-chip-menu-item${selected.type === t.key ? ' on' : ''}`}
                            onMouseDown={e => { e.preventDefault(); handleTypeChange(t.key); }}
                          >
                            <span aria-hidden="true">{t.icon}</span>
                            <span>{t.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status pill (clickable to change) */}
                  <div className="sr-chip-wrap">
                    <button
                      type="button"
                      className={`sr-status-pill sr-status-${selected.status || 'scheduled'} sr-status-pill-btn`}
                      onClick={() => setStatusMenuOpen(v => !v)}
                      onBlur={() => setTimeout(() => setStatusMenuOpen(false), 150)}
                      title="Change status"
                    >
                      {STATUSES.find(s => s.key === selected.status)?.label || 'Scheduled'}
                      <span className="sr-chip-caret">▾</span>
                    </button>
                    {statusMenuOpen && (
                      <div className="sr-chip-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            type="button"
                            className={`sr-chip-menu-item sr-status-${s.key}${
                              selected.status === s.key ? ' on' : ''
                            }`}
                            onMouseDown={e => { e.preventDefault(); handleStatusChange(s.key); }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fill stat */}
                  <div
                    className="sr-fill-pill"
                    style={{ '--fill-color': fillTone }}
                  >
                    <span className="sr-fill-dot" />
                    <span>{filledCount}/{totalSlots} filled</span>
                  </div>
                </div>

                {/* Song link chip row */}
                <div className="sr-song-row">
                  {selected.songTitle ? (
                    <button
                      type="button"
                      className="sr-song-chip on"
                      onClick={() => setShowSongPicker(true)}
                      title="Click to change linked song"
                    >
                      <span aria-hidden="true">🎵</span>
                      <span className="sr-song-chip-title">{selected.songTitle}</span>
                      <span
                        className="sr-song-chip-x"
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); handleClearSong(); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            handleClearSong();
                          }
                        }}
                        title="Clear song link"
                      >✕</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="sr-song-chip"
                      onClick={() => setShowSongPicker(true)}
                      title="Link a song from the library"
                    >
                      <span aria-hidden="true">🎵</span>
                      <span>+ Link a song</span>
                    </button>
                  )}
                </div>

                {selected.date && (
                  <div className="sr-detail-date-long">
                    {formatDateLong(selected.date)}
                  </div>
                )}
              </div>

              <div className="sr-detail-actions">
                <button
                  className={`sr-btn${armedDelete ? ' sr-btn-danger-armed' : ' sr-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete session'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Quick actions row */}
            <div className="sr-quick-actions">
              <button
                className="sr-btn sr-btn-accent sr-btn-sm"
                onClick={handleStartSession}
                disabled={selected.status === 'in-progress' || selected.status === 'completed'}
                title="Mark session as in-progress"
              >
                ▶ Start
              </button>
              <button
                className="sr-btn sr-btn-ghost sr-btn-sm"
                onClick={handleEndSession}
                disabled={selected.status === 'completed'}
                title="Mark session as completed"
              >
                ⏹ End
              </button>
              <button
                className={`sr-btn sr-btn-sm${armedCancel ? ' sr-btn-danger-armed' : ' sr-btn-danger'}`}
                onClick={handleCancelSession}
                onBlur={() => setArmedCancel(false)}
                disabled={selected.status === 'cancelled'}
                title={armedCancel ? 'Click again to confirm cancellation' : 'Cancel session'}
              >
                {armedCancel ? 'Confirm Cancel' : 'Cancel'}
              </button>
            </div>

            {/* Roster-empty banner */}
            {roster.length === 0 && (
              <div className="sr-banner-info">
                <span className="sr-banner-icon">ℹ</span>
                Add team members in the Roster tab first to start assigning roles.
              </div>
            )}

            {/* Body sections */}
            <div className="sr-body">

              {/* ── Goals ── */}
              <section className="sr-sec">
                <div className="sr-sec-head">
                  <span className="sr-sec-icon" aria-hidden="true">🎯</span>
                  <span className="sr-sec-label">Goals</span>
                  <span className="sr-sec-hint">What we want to accomplish</span>
                </div>
                <div className="sr-sec-body">
                  <textarea
                    className="sr-inp sr-textarea"
                    placeholder="e.g. Capture lead vocal for verses 1–2, comp BGV stack, finalize bass DI take…"
                    rows={4}
                    value={selected.goals || ''}
                    onChange={e => updateSelected({ goals: e.target.value })}
                  />
                </div>
              </section>

              {/* ── Role assignments grid ── */}
              <section className="sr-sec">
                <div className="sr-sec-head">
                  <span className="sr-sec-icon" aria-hidden="true">🎚</span>
                  <span className="sr-sec-label">Role assignments</span>
                  <span className="sr-sec-count">{filledCount} / {totalSlots}</span>
                  <div className="sr-sec-actions">
                    {!showCustomRole ? (
                      <button
                        type="button"
                        className="sr-btn sr-btn-ghost sr-btn-sm"
                        onClick={() => setShowCustomRole(true)}
                      >
                        + Custom role
                      </button>
                    ) : (
                      <div className="sr-custom-role-row">
                        <input
                          className="sr-inp sr-custom-role-inp"
                          placeholder="Role name (e.g. Strings)"
                          value={customRoleName}
                          onChange={e => setCustomRoleName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddCustomRole(); }
                            if (e.key === 'Escape') { setShowCustomRole(false); setCustomRoleName(''); }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="sr-btn sr-btn-accent sr-btn-sm"
                          onClick={handleAddCustomRole}
                          disabled={!customRoleName.trim()}
                        >Add</button>
                        <button
                          type="button"
                          className="sr-btn sr-btn-ghost sr-btn-sm"
                          onClick={() => { setShowCustomRole(false); setCustomRoleName(''); }}
                        >Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="sr-sec-body">
                  <div className="sr-roles">
                    {allRoles.map(role => {
                      const memberId = selected.assignments?.[role.label];
                      const member   = memberId ? memberById.get(memberId) : null;
                      const missing  = memberId && !member;
                      const isCustom = !STANDARD_ROLES.some(r => r.label === role.label);
                      return (
                        <div className="sr-role-row" key={`${role.id}-${role.label}`}>
                          <div className="sr-role-label">
                            {role.label}
                            {isCustom && (
                              <button
                                type="button"
                                className="sr-role-remove"
                                onClick={() => handleRemoveCustomRole(role.label)}
                                title="Remove custom role"
                              >✕</button>
                            )}
                          </div>
                          {member ? (
                            <div className="sr-role-assigned">
                              <button
                                className="sr-role-member"
                                onClick={() => setPickerRole(role)}
                                title="Click to change assignment"
                              >
                                <span className="sr-role-avatar">
                                  {(member.name || '?').trim().charAt(0).toUpperCase() || '?'}
                                </span>
                                <span className="sr-role-member-info">
                                  <span className="sr-role-member-name">{member.name || 'Unnamed'}</span>
                                  {member.role && member.role !== role.label && (
                                    <span className="sr-role-member-sub">{member.role}</span>
                                  )}
                                </span>
                              </button>
                              <button
                                className="sr-role-unassign"
                                onClick={() => handleUnassign(role.label)}
                                title="Unassign"
                              >✕</button>
                            </div>
                          ) : missing ? (
                            <div className="sr-role-assigned">
                              <button
                                className="sr-role-member sr-role-member-missing"
                                onClick={() => setPickerRole(role)}
                                title="Previously assigned member is no longer in your roster"
                              >
                                <span className="sr-role-avatar sr-role-avatar-missing">?</span>
                                <span className="sr-role-member-info">
                                  <span className="sr-role-member-name">Removed from roster</span>
                                  <span className="sr-role-member-sub">Click to re-assign</span>
                                </span>
                              </button>
                              <button
                                className="sr-role-unassign"
                                onClick={() => handleUnassign(role.label)}
                                title="Clear"
                              >✕</button>
                            </div>
                          ) : (
                            <button
                              className="sr-role-assign"
                              onClick={() => setPickerRole(role)}
                              disabled={roster.length === 0}
                              title={roster.length === 0 ? 'Add roster members first' : `Assign someone to ${role.label}`}
                            >
                              + Assign
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* ── Session notes ── */}
              <section className="sr-sec">
                <div className="sr-sec-head">
                  <span className="sr-sec-icon" aria-hidden="true">📝</span>
                  <span className="sr-sec-label">Session notes</span>
                  <span className="sr-sec-hint">Notes & debrief — auto-saved</span>
                </div>
                <div className="sr-sec-body">
                  <textarea
                    className="sr-inp sr-textarea"
                    placeholder="Track sheet, mic positions, takes used, follow-ups…"
                    rows={6}
                    value={selected.notes || ''}
                    onChange={e => updateSelected({ notes: e.target.value })}
                  />
                </div>
              </section>

              <div className="sr-meta-footer">
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

      {/* ── Member Picker Modal ── */}
      {pickerRole && selected && (
        <MemberPicker
          role={pickerRole}
          roster={roster}
          onPick={(m) => handleAssign(pickerRole.label, m)}
          onClose={() => setPickerRole(null)}
        />
      )}

      {/* ── Song Picker Modal ── */}
      {showSongPicker && selected && (
        <SongPickerModal
          songs={songs}
          onPick={handlePickSong}
          onClear={handleClearSong}
          onClose={() => setShowSongPicker(false)}
        />
      )}
    </div>
    </WorshipShell>
  );
}
