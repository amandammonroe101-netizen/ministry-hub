import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import WorshipShell from '../worship/WorshipShell';
import { setlistService } from '../../services/setlistService';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import './Setlist.css';

/* ─────────────────────────────────────────────────────────────
   Setlist — worship setlist manager
   Naming: .sl-*
   ───────────────────────────────────────────────────────────── */

const KEYS = [
  'C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
  'Am','A#m','Bm','Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m',
];

const OCCASIONS = [
  'Sunday Morning',
  'Sunday Evening',
  'Wednesday Night',
  'Special Event',
  'Christmas',
  'Easter',
  'Revival',
  'Youth Service',
  'Prayer Service',
  'Conference',
  'Funeral',
  'Wedding',
  'Other',
];

/* Standard service roles — mirrors Scheduling.jsx's STANDARD_ROLES labels
   (kept local — that file doesn't export it), bucketed into sections so
   the Crew popup reads like an outline instead of one flat list. Each
   role also carries an icon, used on its avatar when unfilled. */
const SCHEDULE_ROLE_GROUPS = [
  {
    label: 'Vocals',
    icon: '🎤',
    roles: [
      { label: 'Worship Leader', icon: '🎤' },
      { label: 'Vocal 1',        icon: '🎙' },
      { label: 'Vocal 2',        icon: '🎙' },
      { label: 'Vocal 3',        icon: '🎙' },
    ],
  },
  {
    label: 'Instruments',
    icon: '🎸',
    roles: [
      { label: 'Acoustic Guitar', icon: '🎸' },
      { label: 'Electric Guitar', icon: '🎸' },
      { label: 'Bass',            icon: '🎸' },
      { label: 'Keys / Piano',    icon: '🎹' },
      { label: 'Drums',           icon: '🥁' },
    ],
  },
  {
    label: 'Tech',
    icon: '🎚',
    roles: [
      { label: 'Sound', icon: '🎚' },
      { label: 'Video', icon: '🎥' },
      { label: 'Lights', icon: '💡' },
    ],
  },
];

const SCHEDULE_ROLE_LABELS = SCHEDULE_ROLE_GROUPS.flatMap(g => g.roles.map(r => r.label));

/* Who's eligible to lead a song — Worship Leader + Vocal 1-3 from the
   linked Schedule item's crew (the "Vocals" section of the Crew popup).
   Only people actually assigned to one of those roles show up, so this
   list is always a subset of the linked service's real crew. */
function getSongLeadOptions(schedule, roster) {
  if (!schedule) return [];
  const assignments = schedule.assignments || {};
  const byId = new Map((roster || []).map(m => [m.id, m]));
  const vocalRoles = SCHEDULE_ROLE_GROUPS.find(g => g.label === 'Vocals')?.roles || [];
  const seen = new Set();
  const options = [];
  vocalRoles.forEach(role => {
    const memberId = assignments[role.label];
    const member = memberId ? byId.get(memberId) : null;
    if (!member || seen.has(member.id)) return;
    seen.add(member.id);
    options.push({ id: member.id, name: member.name, role: role.label });
  });
  return options;
}

/* Merge Roster members + people who've filled a Sub request into a single,
   de-duped, searchable list for leader/team assignment. Roster wins on
   name collisions since it carries a role. */
function buildPeople(roster, subs) {
  const seen = new Set();
  const list = [];
  (roster || []).forEach(m => {
    const name = m?.name;
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ id: m.id || `roster_${key}`, name, role: m.role || '' });
  });
  (subs || []).forEach(s => {
    const name = s?.filledBy;
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ id: `sub_${key}`, name, role: s.role || '' });
  });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(totalSeconds) {
  if (!totalSeconds) return '';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Best-known length for a song, pulled from its most recent recording. */
function songDuration(song) {
  const rec = Array.isArray(song.recordings) ? song.recordings[0] : null;
  return rec?.duration > 0 ? rec.duration : null;
}

/* ─── New Setlist Form ───────────────────────────────────────── */
function NewSetlistForm({ onSave, onCancel }) {
  const [name, setName]           = useState('');
  const [eventDate, setEventDate] = useState('');
  const [occasion, setOccasion]   = useState('Sunday Morning');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await setlistService.create({ name: name.trim(), event_date: eventDate || null, occasion });
      onSave(res.data.data);
    } catch {
      setError('Failed to create setlist.');
      setSaving(false);
    }
  }

  return (
    <form className="sl-new-form" onSubmit={handleSubmit}>
      {error && <p className="sl-error">{error}</p>}
      <input
        className="sl-inp"
        placeholder="Setlist name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <input
        className="sl-inp"
        type="date"
        value={eventDate}
        onChange={e => setEventDate(e.target.value)}
      />
      <select
        className="sl-inp"
        value={occasion}
        onChange={e => setOccasion(e.target.value)}
      >
        {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <div className="sl-new-form-btns">
        <button type="submit" className="sl-btn sl-btn-accent" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="sl-btn sl-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Setlist Card ───────────────────────────────────────────── */
const SetlistCard = forwardRef(function SetlistCard({ setlist, active, onClick }, ref) {
  // Derive song count from either the .songs array (when full object) or .song_count
  const count = setlist.song_count != null
    ? setlist.song_count
    : Array.isArray(setlist.songs)
      ? setlist.songs.length
      : null;
  return (
    <button
      ref={ref}
      className={`sl-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="sl-card-name">{setlist.name}</div>
      {setlist.event_date && (
        <div className="sl-card-date">{formatDate(setlist.event_date)}</div>
      )}
      {setlist.occasion && (
        <div className="sl-card-occ">{setlist.occasion}</div>
      )}
      <div className="sl-card-count">
        {count != null
          ? `${count} song${count !== 1 ? 's' : ''}`
          : ''}
      </div>
    </button>
  );
});

/* ─── Key badge — click to override the key for this setlist only ──── */
function KeyBadge({ song, onChange }) {
  const [editing, setEditing] = useState(false);
  const effective  = song.song_key || '';
  const overridden = !!song.override_key;

  if (editing) {
    return (
      <select
        className="sl-song-key-select"
        autoFocus
        defaultValue={song.override_key || ''}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => { onChange(song.link_id, e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
      >
        <option value="">
          {song.original_key ? `Original (${song.original_key})` : '— none —'}
        </option>
        {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
    );
  }

  return (
    <button
      type="button"
      className={`sl-song-key${effective ? '' : ' empty'}${overridden ? ' overridden' : ''}`}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title={overridden
        ? `Transposed to ${effective} for this setlist only (originally ${song.original_key || '—'})`
        : 'Click to set a key for this setlist only'}
    >
      {effective || '+ key'}
    </button>
  );
}

/* ─── Person picker — searches Roster + Sub people ───────────── */
function PersonPicker({ value, people, onSelect, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery]     = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setEditing(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (!editing) {
    return (
      <button
        type="button"
        className={`sl-person-btn${value ? '' : ' empty'}`}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setQuery(''); setEditing(true); }}
      >
        {value?.name || placeholder || '+ assign'}
      </button>
    );
  }

  const q = query.toLowerCase().trim();
  const matches = people
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="sl-person-edit" ref={wrapRef} onMouseDown={e => e.stopPropagation()}>
      <input
        className="sl-inp sl-person-inp"
        autoFocus
        placeholder="Search Roster & Subs…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
      />
      <div className="sl-person-dropdown">
        {value && (
          <button
            type="button"
            className="sl-person-option sl-person-clear"
            onClick={() => { onSelect(null); setEditing(false); }}
          >
            ✕ Clear
          </button>
        )}
        {matches.map(p => (
          <button
            key={p.id}
            type="button"
            className="sl-person-option"
            onClick={() => { onSelect({ id: p.id, name: p.name }); setEditing(false); }}
          >
            <span>{p.name}</span>
            {p.role && <span className="sl-person-option-role">{p.role}</span>}
          </button>
        ))}
        {matches.length === 0 && (
          <div className="sl-person-empty">No matches in Roster or Subs.</div>
        )}
      </div>
    </div>
  );
}

/* ─── Crew Modal — fancy popup showing the linked Schedule-page
   service's role/crew assignments as a grouped, numbered outline.
   Triggered by the "Crew" button on the setlist detail header once
   a Schedule item is linked. Unfilled roles sort to the top of each
   section and are called out in amber so gaps are easy to spot;
   clicking a row (or the footer button) deep-links into Scheduling
   via its `?id=` param to fix the assignment. ─────────────────── */
function CrewModal({ schedule, roster, onClose }) {
  const navigate = useNavigate();
  const memberById = new Map((roster || []).map(m => [m.id, m]));
  const assignments = schedule.assignments || {};
  const filled = SCHEDULE_ROLE_LABELS.filter(r => assignments[r] && memberById.get(assignments[r])).length;
  const total = SCHEDULE_ROLE_LABELS.length;
  const pct = total ? Math.round((filled / total) * 100) : 0;

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function openInScheduling() {
    onClose();
    navigate(`/worship/team/scheduling?id=${encodeURIComponent(schedule.id)}`);
  }

  let counter = 0;

  return (
    <div className="sl-crew-overlay" onClick={onClose}>
      <div className="sl-crew-modal" onClick={e => e.stopPropagation()}>
        <div className="sl-crew-head">
          <div className="sl-crew-head-text">
            <div className="sl-crew-title">👥 Crew</div>
            <div className="sl-crew-sub">
              {schedule.name || 'Untitled Service'}
              {schedule.date && ` · ${formatDate(schedule.date)}${schedule.startTime ? ` · ${schedule.startTime}` : ''}`}
            </div>
          </div>
          <button className="sl-crew-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="sl-crew-progress-wrap">
          <div className="sl-crew-progress-label">
            <span>{filled}/{total} roles filled</span>
            <span>{pct}%</span>
          </div>
          <div className="sl-crew-progress-track">
            <div className="sl-crew-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="sl-crew-list">
          {SCHEDULE_ROLE_GROUPS.map(group => {
            const rows = [...group.roles].sort((a, b) => {
              const aFilled = !!(assignments[a.label] && memberById.get(assignments[a.label]));
              const bFilled = !!(assignments[b.label] && memberById.get(assignments[b.label]));
              return aFilled === bFilled ? 0 : (aFilled ? 1 : -1);
            });
            return (
              <div key={group.label} className="sl-crew-section">
                <div className="sl-crew-section-head">
                  <span>{group.icon}</span>
                  <span>{group.label}</span>
                </div>
                <div className="sl-crew-section-rows">
                  {rows.map(role => {
                    const memberId = assignments[role.label];
                    const member = memberId ? memberById.get(memberId) : null;
                    counter += 1;
                    return (
                      <button
                        key={role.label}
                        type="button"
                        className={`sl-crew-row${member ? '' : ' is-unassigned'}`}
                        onClick={openInScheduling}
                        title="Open in Scheduling to assign this role"
                      >
                        <span className="sl-crew-row-num">{counter}</span>
                        <span className={`sl-crew-avatar${member ? '' : ' empty'}`}>
                          {member ? ((member.name || '?').trim().charAt(0).toUpperCase() || '?') : role.icon}
                        </span>
                        <span className="sl-crew-role">{role.label}</span>
                        <span className={`sl-crew-member${member ? '' : ' empty'}`}>
                          {member ? (member.name || 'Unnamed') : 'Unassigned'}
                        </span>
                        <span className="sl-crew-row-arrow">→</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sl-crew-footer">
          <button type="button" className="sl-btn sl-btn-accent sl-crew-footer-btn" onClick={openInScheduling}>
            Open in Scheduling →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Song Row (drag-to-reorder) ─────────────────────────────── */
function SongRow({ song, index, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onRemove, onNotesChange, onKeyChange, leadOptions, onLeaderChange }) {
  const [notes, setNotes]     = useState(song.notes || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setNotes(song.notes || ''); }, [song.notes]);

  function commit() {
    setEditing(false);
    const trimmed = notes.trim();
    if (trimmed !== (song.notes || '')) onNotesChange(song.link_id, trimmed);
  }

  return (
    <div
      className={`sl-song${dragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <span className="sl-song-handle" title="Drag to reorder">⠿</span>
      <span className="sl-song-num">{index + 1}</span>
      <div className="sl-song-info">
        <div className="sl-song-title">{song.title}</div>
        {song.artist && <div className="sl-song-artist">{song.artist}</div>}
        {editing ? (
          <input
            className="sl-song-notes-inp"
            value={notes}
            placeholder="Add a note…"
            autoFocus
            onChange={e => setNotes(e.target.value)}
            onBlur={commit}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setNotes(song.notes || ''); setEditing(false); }
            }}
          />
        ) : (
          <button
            type="button"
            className={`sl-song-notes-btn${song.notes ? ' has-note' : ''}`}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setEditing(true); }}
          >
            {song.notes || '+ note'}
          </button>
        )}
      </div>
      <div className="sl-song-meta">
        <KeyBadge song={song} onChange={onKeyChange} />
        {leadOptions.length > 0 && (
          <select
            className={`sl-song-leader-select${song.leader_id ? '' : ' empty'}`}
            value={song.leader_id || ''}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onChange={e => onLeaderChange(song.link_id, e.target.value || null)}
            title="Who leads this song — from the linked service's Worship Leader/Vocal crew"
          >
            <option value="">🎤 + leader</option>
            {leadOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name} — {o.role}</option>
            ))}
          </select>
        )}
        {song.tempo     && <span className="sl-song-tempo">{song.tempo} bpm</span>}
        {song.time_signature && <span className="sl-song-sig">{song.time_signature}</span>}
      </div>
      <button
        className="sl-song-remove"
        title="Remove from setlist"
        onClick={() => onRemove(song.link_id)}
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Key / tempo transition badge ───────────────────────────── */
function TransitionBadge({ prev, next }) {
  const parts = [];
  if (prev.song_key && next.song_key && prev.song_key !== next.song_key) {
    parts.push(`Key ${prev.song_key} → ${next.song_key}`);
  }
  const t1 = Number(prev.tempo), t2 = Number(next.tempo);
  if (t1 && t2 && Math.abs(t1 - t2) >= 20) {
    parts.push(`Tempo ${t1} → ${t2} bpm`);
  }
  if (parts.length === 0) return null;
  return (
    <div className="sl-transition">
      <span className="sl-transition-line" />
      <span className="sl-transition-label">⚠ {parts.join('  ·  ')}</span>
      <span className="sl-transition-line" />
    </div>
  );
}

/* ─── Song Picker Modal ──────────────────────────────────────── */
function SongPicker({ allSongs, setlistSongIds, onAdd, onClose }) {
  const [query, setQuery] = useState('');

  const filtered = allSongs.filter(s => {
    if (setlistSongIds.has(s.id)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) ||
           (s.artist || '').toLowerCase().includes(q);
  });

  return (
    <div className="sl-picker-overlay" onClick={onClose}>
      <div className="sl-picker" onClick={e => e.stopPropagation()}>
        <div className="sl-picker-head">
          <span>Add from Library</span>
          <button className="sl-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="sl-picker-search-wrap">
          <input
            className="sl-picker-search"
            placeholder="Search by title or artist…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="sl-picker-list">
          {filtered.length === 0 && (
            <div className="sl-picker-empty sl-muted">
              {query ? 'No songs match your search.' : 'All library songs are already in this setlist.'}
            </div>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              className="sl-picker-song"
              onClick={() => onAdd(s.id)}
            >
              <div className="sl-picker-song-info">
                <span className="sl-picker-song-title">{s.title}</span>
                {s.artist && <span className="sl-picker-song-artist">{s.artist}</span>}
              </div>
              <div className="sl-picker-song-meta">
                {s.song_key && <span className="sl-song-key">{s.song_key}</span>}
                {s.tempo    && <span className="sl-song-tempo">{s.tempo} bpm</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Print / Export View — order-of-service sheet for the band ─── */
function PrintView({ setlist, onClose, roster }) {
  const songs = Array.isArray(setlist.songs) ? setlist.songs : [];
  const memberById = new Map((roster || []).map(m => [m.id, m]));

  return (
    <div className="sl-print-overlay" onClick={onClose}>
      <div className="sl-print-modal" onClick={e => e.stopPropagation()}>
        <div className="sl-print-toolbar">
          <span>Order of Service</span>
          <div className="sl-print-toolbar-btns">
            <button className="sl-btn sl-btn-accent" onClick={() => window.print()}>
              🖨 Print
            </button>
            <button className="sl-btn sl-btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="sl-print-area">
          <div className="sl-print-head">
            <h1 className="sl-print-title">{setlist.name || 'Untitled Setlist'}</h1>
            <div className="sl-print-meta">
              {setlist.event_date && <span>{formatDate(setlist.event_date)}</span>}
              {setlist.occasion && <span>{setlist.occasion}</span>}
            </div>
            {setlist.leader?.name && (
              <div className="sl-print-leader">Leader: {setlist.leader.name}</div>
            )}
          </div>

          <div className="sl-print-section-label">Song Order</div>
          <ol className="sl-print-queue">
            {songs.length === 0 && (
              <li className="sl-print-queue-empty">No songs in this setlist yet.</li>
            )}
            {songs.map((song, idx) => {
              const leader = song.leader_id ? memberById.get(song.leader_id) : null;
              return (
                <li key={song.link_id} className="sl-print-queue-item">
                  <span className="sl-print-queue-num">{idx + 1}</span>
                  <span className="sl-print-queue-title">{song.title || 'Untitled'}</span>
                  {song.song_key && <span className="sl-print-queue-key">{song.song_key}</span>}
                  {leader && <span className="sl-print-queue-leader">🎤 {leader.name}</span>}
                  {song.notes && <span className="sl-print-queue-notes">{song.notes}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Setlist() {
  /* Setlist data is HYDRATED (each setlist embeds full song objects via
     the service shim). useUserStoreKey subscribes to the raw doc — whenever
     it changes (cross-device or local mutation), the trigger effect below
     re-hydrates by re-calling setlistService.getAll(). */
  const [setlistsRaw]                 = useUserStoreKey('setlists', []);
  const [songsRaw]                    = useUserStoreKey('songs',    []);
  const [setlists, setSetlists]       = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError]   = useState('');
  const [showNew, setShowNew]         = useState(false);

  /* ── Roster + Subs — for leader/team assignment search ────── */
  const [rosterRaw] = useUserStoreKey('band:roster', []);
  const [subsRaw]   = useUserStoreKey('band:subs',   []);
  const people = useMemo(() => buildPeople(rosterRaw, subsRaw), [rosterRaw, subsRaw]);

  /* ── Schedule page services — for the "Linked Service" outline ─ */
  const [scheduleRaw] = useUserStoreKey('band:schedule', []);

  /* ── Selected setlist state ───────────────────────────────── */
  const [selected, setSelected]       = useState(null);   // full setlist object
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [armedDelete, setArmedDelete] = useState(false);

  /* ── Song library — hydrated via the raw key for live sync ─ */
  const [allSongs, setAllSongs]       = useState([]);
  const [showPicker, setShowPicker]   = useState(false);
  const [showPrint, setShowPrint]     = useState(false);
  const [showCrew, setShowCrew]       = useState(false);

  /* ── Drag state ───────────────────────────────────────────── */
  const dragIndex  = useRef(null);
  const [dragOver, setDragOver]       = useState(null);

  /* ── Load setlist list (called on mount + whenever the raw doc changes) ── */
  const loadSetlists = useCallback(async () => {
    setListsError('');
    try {
      const res = await setlistService.getAll();
      setSetlists(res.data.data || []);
    } catch {
      setListsError('Failed to load setlists.');
    }
  }, []);

  /* Re-hydrate whenever the underlying Firestore doc changes (mutations
     on this device or anywhere else). Also re-runs when songs change so
     embedded song fields (title/key/tempo) stay current. */
  useEffect(() => {
    loadSetlists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistsRaw, songsRaw, loadSetlists]);

  /* Song library — re-fetch when songs change. */
  useEffect(() => {
    songService.getAll()
      .then(res => setAllSongs(res.data.data || []))
      .catch(() => {});
  }, [songsRaw]);

  /* ── Sidebar card refs (for scroll-to-new) ────────────────── */
  const cardRefs = useRef(new Map());
  const pendingScrollId = useRef(null);

  /* ── Select a setlist ─────────────────────────────────────── */
  const selectSetlist = useCallback(async (id) => {
    setArmedDelete(false);
    setShowCrew(false);
    setDetailLoading(true);
    setDetailError('');
    setSelected(null);
    try {
      const res = await setlistService.getOne(id);
      const data = res.data.data || {};
      // Always guarantee a songs array so the detail view never crashes
      setSelected({ ...data, songs: Array.isArray(data.songs) ? data.songs : [] });
    } catch {
      setDetailError('Failed to load setlist details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ── Create new setlist ───────────────────────────────────── */
  const handleNewSaved = useCallback((newSetlist) => {
    // Normalise — make sure the new setlist has a songs array so anything that
    // reads .songs (sidebar card count, detail view, etc.) never crashes.
    const normalised = {
      ...newSetlist,
      songs: Array.isArray(newSetlist?.songs) ? newSetlist.songs : [],
    };
    setSetlists(prev => [normalised, ...prev]);
    setShowNew(false);
    // Optimistically show the new setlist immediately so the detail area is
    // never blank while getOne is in flight.
    setSelected(normalised);
    pendingScrollId.current = normalised.id;
    selectSetlist(normalised.id);
  }, [selectSetlist]);

  /* ── Scroll newly-created card into view ──────────────────── */
  useEffect(() => {
    const id = pendingScrollId.current;
    if (id == null) return;
    const el = cardRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      pendingScrollId.current = null;
    }
  }, [setlists]);

  /* ── Delete setlist ───────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    try {
      await setlistService.delete(selected.id);
      setSetlists(prev => prev.filter(s => s.id !== selected.id));
      setSelected(null);
      setArmedDelete(false);
    } catch {
      setDetailError('Failed to delete setlist.');
    }
  }, [selected, armedDelete]);

  /* ── Add song from picker ─────────────────────────────────── */
  const handleAddSong = useCallback(async (songId) => {
    if (!selected) return;
    try {
      await setlistService.addSong(selected.id, songId, '');
      // Reload the full setlist to get updated song list with link_ids
      const res = await setlistService.getOne(selected.id);
      const data = res.data.data || {};
      const updated = { ...data, songs: Array.isArray(data.songs) ? data.songs : [] };
      setSelected(updated);
      // Update song count in sidebar list
      setSetlists(prev => prev.map(s =>
        s.id === updated.id
          ? { ...s, song_count: updated.songs.length }
          : s
      ));
    } catch {
      setDetailError('Failed to add song.');
    }
  }, [selected]);

  /* ── Remove song ─────────────────────────────────────────── */
  const handleRemoveSong = useCallback(async (linkId) => {
    if (!selected) return;
    try {
      await setlistService.removeSong(selected.id, linkId);
      const currentSongs = Array.isArray(selected.songs) ? selected.songs : [];
      const newSongs = currentSongs.filter(s => s.link_id !== linkId);
      const updated = { ...selected, songs: newSongs };
      setSelected(updated);
      setSetlists(prev => prev.map(s =>
        s.id === updated.id ? { ...s, song_count: newSongs.length } : s
      ));
    } catch {
      setDetailError('Failed to remove song.');
    }
  }, [selected]);

  /* ── Update per-song note ─────────────────────────────────── */
  const handleNotesChange = useCallback(async (linkId, notes) => {
    if (!selected) return;
    const prevSongs = Array.isArray(selected.songs) ? selected.songs : [];
    const nextSongs = prevSongs.map(s => s.link_id === linkId ? { ...s, notes } : s);
    setSelected(prev => ({ ...prev, songs: nextSongs }));
    try {
      await setlistService.updateSongNotes(selected.id, linkId, notes);
    } catch {
      setSelected(prev => ({ ...prev, songs: prevSongs }));
      setDetailError('Failed to save note.');
    }
  }, [selected]);

  /* ── Update per-song key override ─────────────────────────── */
  const handleKeyChange = useCallback(async (linkId, overrideKey) => {
    if (!selected) return;
    const prevSongs = Array.isArray(selected.songs) ? selected.songs : [];
    const nextSongs = prevSongs.map(s => s.link_id === linkId
      ? { ...s, override_key: overrideKey, song_key: overrideKey || s.original_key || '' }
      : s);
    setSelected(prev => ({ ...prev, songs: nextSongs }));
    try {
      await setlistService.updateSongKey(selected.id, linkId, overrideKey);
    } catch {
      setSelected(prev => ({ ...prev, songs: prevSongs }));
      setDetailError('Failed to save key.');
    }
  }, [selected]);

  /* ── Assign who leads a song — constrained to the linked service's
     Worship Leader / Vocal crew (see getSongLeadOptions). ───────── */
  const handleSongLeaderChange = useCallback(async (linkId, leaderId) => {
    if (!selected) return;
    const prevSongs = Array.isArray(selected.songs) ? selected.songs : [];
    const nextSongs = prevSongs.map(s => s.link_id === linkId ? { ...s, leader_id: leaderId || null } : s);
    setSelected(prev => ({ ...prev, songs: nextSongs }));
    try {
      await setlistService.updateSongLeader(selected.id, linkId, leaderId || null);
    } catch {
      setSelected(prev => ({ ...prev, songs: prevSongs }));
      setDetailError('Failed to save song leader.');
    }
  }, [selected]);

  /* ── Assign leader (searches Roster + Subs) ────────────────── */
  const handleLeaderChange = useCallback(async (leader) => {
    if (!selected) return;
    const prevLeader = selected.leader || null;
    setSelected(prev => ({ ...prev, leader }));
    try {
      await setlistService.update(selected.id, { leader });
      setSetlists(prev => prev.map(s => s.id === selected.id ? { ...s, leader } : s));
    } catch {
      setSelected(prev => ({ ...prev, leader: prevLeader }));
      setDetailError('Failed to update leader.');
    }
  }, [selected]);

  /* ── Mark as Played — confirms the service happened, tightening
     the CCLI compliance loop (CcliLog only auto-logs confirmed or
     already-past services). ─────────────────────────────────── */
  const handleTogglePlayed = useCallback(async () => {
    if (!selected) return;
    const prevPlayedAt = selected.played_at || null;
    const nextPlayedAt = prevPlayedAt ? null : new Date().toISOString();
    setSelected(prev => ({ ...prev, played_at: nextPlayedAt }));
    try {
      await setlistService.update(selected.id, { played_at: nextPlayedAt });
      setSetlists(prev => prev.map(s => s.id === selected.id ? { ...s, played_at: nextPlayedAt } : s));
    } catch {
      setSelected(prev => ({ ...prev, played_at: prevPlayedAt }));
      setDetailError('Failed to update played status.');
    }
  }, [selected]);

  /* ── Link to a Schedule-page service — its role/crew assignments
     render as an outline underneath this setlist's songs. ───────── */
  const handleLinkChange = useCallback(async (scheduleId) => {
    if (!selected) return;
    const prevId = selected.scheduled_item_id || null;
    setSelected(prev => ({ ...prev, scheduled_item_id: scheduleId }));
    try {
      await setlistService.update(selected.id, { scheduled_item_id: scheduleId });
      setSetlists(prev => prev.map(s => s.id === selected.id ? { ...s, scheduled_item_id: scheduleId } : s));
    } catch {
      setSelected(prev => ({ ...prev, scheduled_item_id: prevId }));
      setDetailError('Failed to update linked service.');
    }
  }, [selected]);

  /* ── Duplicate / "Save as template" ────────────────────────── */
  const handleDuplicate = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await setlistService.duplicate(selected.id);
      handleNewSaved(res.data.data);
    } catch {
      setDetailError('Failed to duplicate setlist.');
    }
  }, [selected, handleNewSaved]);

  /* ── Drag handlers ───────────────────────────────────────── */
  const handleDragStart = useCallback((e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  }, []);

  const handleDrop = useCallback(async (e, dropIndex) => {
    e.preventDefault();
    setDragOver(null);
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    if (fromIndex == null || fromIndex === dropIndex || !selected) return;

    const currentSongs = Array.isArray(selected.songs) ? selected.songs : [];
    const reordered = [...currentSongs];
    const [moved]   = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    // Update local state immediately
    setSelected(prev => ({ ...prev, songs: reordered }));

    // Persist to server
    try {
      const orderArray = reordered.map(s => s.link_id);
      await setlistService.reorderSongs(selected.id, orderArray);
    } catch {
      // Revert on failure
      setSelected(prev => ({ ...prev, songs: currentSongs }));
      setDetailError('Failed to save new order.');
    }
  }, [selected]);

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    setDragOver(null);
  }, []);

  /* ── Derived ─────────────────────────────────────────────── */
  const setlistSongIds = new Set((selected?.songs || []).map(s => s.id));
  const linkedSchedule = scheduleRaw.find(s => s.id === selected?.scheduled_item_id) || null;
  const songLeadOptions = useMemo(
    () => getSongLeadOptions(linkedSchedule, rosterRaw),
    [linkedSchedule, rosterRaw]
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell
      title="Setlist"
      icon="📋"
      subtitle="Build and manage the setlist for each service — song order, keys, and transitions."
    >
    <div className="sl-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Left Sidebar ── */}
      <aside className="sl-sidebar">
        <div className="sl-sidebar-head">
          <span className="sl-sidebar-title">Setlists</span>
          {!showNew && (
            <button
              className="sl-new-btn"
              onClick={() => setShowNew(true)}
              title="New setlist"
            >
              + New
            </button>
          )}
        </div>

        {showNew && (
          <NewSetlistForm
            onSave={handleNewSaved}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="sl-list">
          {listsLoading && (
            <p className="sl-muted" style={{ padding: '12px 14px' }}>Loading…</p>
          )}
          {listsError && (
            <p className="sl-error" style={{ margin: '8px 10px' }}>{listsError}</p>
          )}
          {!listsLoading && !listsError && setlists.length === 0 && (
            <p className="sl-muted" style={{ padding: '12px 14px', fontStyle: 'italic' }}>
              No setlists yet. Create one above.
            </p>
          )}
          {setlists.map(sl => (
            <SetlistCard
              key={sl.id}
              ref={el => {
                if (el) cardRefs.current.set(sl.id, el);
                else cardRefs.current.delete(sl.id);
              }}
              setlist={sl}
              active={selected?.id === sl.id}
              onClick={() => selectSetlist(sl.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="sl-main">
        {detailLoading && (
          <div className="sl-empty">
            <p className="sl-muted">Loading setlist…</p>
          </div>
        )}

        {!detailLoading && !selected && !detailError && (
          <div className="sl-empty">
            <div className="sl-empty-icon">♩</div>
            <div className="sl-empty-title">No setlist selected</div>
            <div className="sl-empty-sub">
              Choose a setlist from the sidebar, or create a new one.
            </div>
          </div>
        )}

        {!detailLoading && detailError && (
          <div className="sl-empty">
            <p className="sl-error">{detailError}</p>
          </div>
        )}

        {!detailLoading && selected && (() => {
          // Defensive: never let an undefined .songs array crash the detail view.
          const songs = Array.isArray(selected.songs) ? selected.songs : [];
          const knownDurations = songs.map(songDuration).filter(d => d != null);
          const totalDuration  = knownDurations.reduce((a, b) => a + b, 0);
          return (
          <>
            {/* Detail Header */}
            <div className="sl-detail-head">
              <div>
                <div className="sl-detail-name">{selected.name}</div>
                <div className="sl-detail-sub">
                  {selected.event_date && (
                    <span className="sl-chip sl-chip-date">{formatDate(selected.event_date)}</span>
                  )}
                  {selected.occasion && (
                    <span className="sl-chip sl-chip-occ">{selected.occasion}</span>
                  )}
                  <span className="sl-chip sl-chip-count">
                    {songs.length} song{songs.length !== 1 ? 's' : ''}
                  </span>
                  {knownDurations.length > 0 && (
                    <span
                      className="sl-chip sl-chip-duration"
                      title={knownDurations.length < songs.length
                        ? `Based on ${knownDurations.length} of ${songs.length} songs with a recording`
                        : 'Total recorded length'}
                    >
                      ⏱ {formatDuration(totalDuration)}{knownDurations.length < songs.length ? '*' : ''}
                    </span>
                  )}
                  {selected.played_at && (
                    <span
                      className="sl-chip sl-chip-played"
                      title={`Marked as played on ${formatDate(selected.played_at.slice(0, 10))}`}
                    >
                      ✓ Played {formatDate(selected.played_at.slice(0, 10))}
                    </span>
                  )}
                </div>
                <div className="sl-leader-row">
                  <span className="sl-leader-label">Leader</span>
                  <PersonPicker
                    value={selected.leader}
                    people={people}
                    placeholder="+ assign leader"
                    onSelect={handleLeaderChange}
                  />
                </div>
                <div className="sl-linked-row">
                  <span className="sl-leader-label">Linked Service</span>
                  <select
                    className="sl-inp sl-linked-select"
                    value={selected.scheduled_item_id || ''}
                    onChange={e => handleLinkChange(e.target.value || null)}
                  >
                    <option value="">— none —</option>
                    {scheduleRaw.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || 'Untitled Service'}
                        {s.date ? ` — ${formatDate(s.date)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selected.description && (
                  <div className="sl-detail-desc">{selected.description}</div>
                )}
              </div>
              <div className="sl-detail-actions">
                {linkedSchedule && (
                  <button className="sl-btn sl-btn-ghost" onClick={() => setShowCrew(true)}>
                    👥 Crew
                  </button>
                )}
                <button className="sl-btn sl-btn-ghost" onClick={() => setShowPrint(true)}>
                  🖨 Print
                </button>
                <button className="sl-btn sl-btn-ghost" onClick={handleDuplicate}>
                  ⧉ Duplicate
                </button>
                <button
                  className={`sl-btn ${selected.played_at ? 'sl-btn-ghost' : 'sl-btn-accent'}`}
                  onClick={handleTogglePlayed}
                  title={selected.played_at
                    ? 'Unmark as played — will fall back to the event date for CCLI reporting'
                    : 'Confirm this service was performed, timestamping it for CCLI reporting'}
                >
                  {selected.played_at ? '✓ Played' : 'Mark as Played'}
                </button>
                <button
                  className="sl-btn sl-btn-accent"
                  onClick={() => { setDetailError(''); setShowPicker(true); }}
                >
                  + Add Song
                </button>
                <button
                  className={`sl-btn${armedDelete ? ' sl-btn-danger-armed' : ' sl-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete setlist'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Song List */}
            <div className="sl-songs">
              {songs.length === 0 ? (
                <div className="sl-songs-empty">
                  <div className="sl-songs-empty-icon">♬</div>
                  <div className="sl-songs-empty-title">No songs yet</div>
                  <div className="sl-songs-empty-sub">
                    Build your setlist by adding songs from your library.
                  </div>
                  <button
                    className="sl-btn sl-btn-accent sl-songs-empty-cta"
                    onClick={() => { setDetailError(''); setShowPicker(true); }}
                  >
                    + Add your first song
                  </button>
                </div>
              ) : (
                songs.map((song, index) => (
                  <Fragment key={song.link_id}>
                    {index > 0 && <TransitionBadge prev={songs[index - 1]} next={song} />}
                    <SongRow
                      song={song}
                      index={index}
                      dragOver={dragOver === index}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      onRemove={handleRemoveSong}
                      onNotesChange={handleNotesChange}
                      onKeyChange={handleKeyChange}
                      leadOptions={songLeadOptions}
                      onLeaderChange={handleSongLeaderChange}
                    />
                  </Fragment>
                ))
              )}
            </div>
          </>
          );
        })()}
      </main>

      {/* ── Song Picker Modal ── */}
      {showPicker && selected && (
        <SongPicker
          allSongs={allSongs}
          setlistSongIds={setlistSongIds}
          onAdd={handleAddSong}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* ── Print / Export View ── */}
      {showPrint && selected && (
        <PrintView setlist={selected} onClose={() => setShowPrint(false)} roster={rosterRaw} />
      )}

      {/* ── Crew Modal ── */}
      {showCrew && linkedSchedule && (
        <CrewModal schedule={linkedSchedule} roster={rosterRaw} onClose={() => setShowCrew(false)} />
      )}
    </div>
    </WorshipShell>
  );
}
