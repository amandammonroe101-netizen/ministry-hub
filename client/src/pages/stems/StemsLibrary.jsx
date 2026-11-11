import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WorshipShell from '../worship/WorshipShell';
import { songService } from '../../services/songService';
import { studioProjectService } from '../../services/studioProjectService';
import { sharedStudioProjectService } from '../../services/sharedStudioProjectService';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadBlob, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import './StemsLibrary.css';

/* ─────────────────────────────────────────────────────────────
   Stems Library — audio stem manager for worship teams
   Naming: .stm-*  (Subs uses .sx-*, Setlist uses .sl-*, Seaboard .sb-*)
   Persistence: localStorage key 'band:stems'
   ───────────────────────────────────────────────────────────── */

const LS_KEY = 'band:stems';

const STEM_TYPES = [
  { id: 'drums',   label: 'Drums',   icon: '🥁' },
  { id: 'bass',    label: 'Bass',    icon: '🎸' },
  { id: 'guitar',  label: 'Guitar',  icon: '🎸' },
  { id: 'keys',    label: 'Keys',    icon: '🎹' },
  { id: 'vocals',  label: 'Vocals',  icon: '🎤' },
  { id: 'pad',     label: 'Pads',    icon: '☁️' },
  { id: 'click',   label: 'Click',   icon: '⏱' },
  { id: 'other',   label: 'Other',   icon: '🎵' },
];

const TYPE_META = STEM_TYPES.reduce((m, t) => { m[t.id] = t; return m; }, {});
const typeIcon  = (t) => (TYPE_META[t] || TYPE_META.other).icon;
const typeLabel = (t) => (TYPE_META[t] || TYPE_META.other).label;

const LARGE_FILE_BYTES = 5 * 1024 * 1024;

const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8', 'Other'];

/* ─── Tag helpers ────────────────────────────────────────────── */
function normalizeTag(t) {
  return (t || '').trim().replace(/\s+/g, ' ');
}

function mergeTags(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(t => t.toLowerCase()));
  for (const raw of incoming) {
    const t = normalizeTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function uid() {
  return `stm_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatBytes(b) {
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExt(name) {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/* ─── Storage helpers ────────────────────────────────────────── */
function loadStems() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveStems(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err && (err.name === 'QuotaExceededError' ||
              err.code === 22 ||
              err.code === 1014 ||
              /quota/i.test(err.message || ''));
    return { ok: false, isQuota };
  }
}

/* ─── Toast ──────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="stm-toast" role="status">
      <span>{message}</span>
      <button className="stm-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Upload dialog ──────────────────────────────────────────── */
function UploadDialog({ allSongs, defaultCount, onSave, onClose, onError }) {
  const [file,      setFile]      = useState(null);
  const [name,      setName]      = useState('');
  const [type,      setType]      = useState('other');
  const [songId,    setSongId]    = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [bpm,       setBpm]       = useState('');
  const [songKey,   setSongKey]   = useState('');
  const [notes,     setNotes]     = useState('');
  const [duration,  setDuration]  = useState(0);
  const [dataUrl,   setDataUrl]   = useState('');
  const [busy,      setBusy]      = useState(false);
  const [readError, setReadError] = useState('');
  const [showSongList, setShowSongList] = useState(false);
  const fileInputRef = useRef(null);

  const songMatches = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    if (!q) return allSongs.slice(0, 8);
    return allSongs
      .filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [allSongs, songQuery]);

  const selectedSong = useMemo(
    () => allSongs.find(s => s.id === songId) || null,
    [allSongs, songId]
  );

  const isLarge = file && file.size > LARGE_FILE_BYTES;

  function handleFileChosen(f) {
    if (!f) return;
    setFile(f);
    setName(stripExt(f.name) || `Stem ${defaultCount + 1}`);
    setReadError('');
    setDataUrl('');
    setDuration(0);

    const reader = new FileReader();
    reader.onerror = () => {
      setReadError('Could not read this file. It may be too large for the browser to load.');
    };
    reader.onload = () => {
      const url = reader.result;
      setDataUrl(typeof url === 'string' ? url : '');
      // Detect duration with a throwaway audio element
      try {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          const d = probe.duration;
          if (Number.isFinite(d)) setDuration(d);
        };
        probe.onerror = () => {
          setReadError("Couldn't decode this audio file. It may be corrupt or unsupported.");
        };
        probe.src = typeof url === 'string' ? url : '';
      } catch {}
    };
    try {
      reader.readAsDataURL(f);
    } catch {
      setReadError('Could not read this file.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !dataUrl) { setReadError('Choose an audio file first.'); return; }
    if (!name.trim())      { setReadError('Name is required.'); return; }
    setBusy(true);
    const linked = selectedSong;
    /* The audio blob is NOT included on the metadata — onSave receives
       the File separately and uploads it to Firebase Storage. The
       returned stem record then carries audioUrl + storagePath instead. */
    const metadata = {
      id:        uid(),
      name:      name.trim(),
      type,
      songId:    linked ? linked.id : null,
      songTitle: linked ? (linked.title || '') : '',
      bpm:       bpm === '' ? null : Number(bpm),
      songKey:   songKey.trim() || '',
      duration,
      fileName:  file.name,
      fileSize:  file.size,
      notes:     notes.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      const result = await onSave(metadata, file);
      if (result && result.error) {
        onError(result.error);
      } else {
        onClose();
      }
    } catch (err) {
      onError(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stm-modal-overlay" onClick={onClose}>
      <div className="stm-modal" onClick={e => e.stopPropagation()}>
        <div className="stm-modal-head">
          <span>Upload Stem</span>
          <button className="stm-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="stm-modal-body" onSubmit={handleSubmit}>
          {/* File picker */}
          <div className="stm-field">
            <label className="stm-field-lbl">Audio file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              className="stm-file-input"
              onChange={e => handleFileChosen(e.target.files?.[0] || null)}
            />
            {file && (
              <div className="stm-file-meta">
                <span className="stm-file-name">{file.name}</span>
                <span className="stm-muted">
                  {formatBytes(file.size)}{duration > 0 ? ` · ${formatTime(duration)}` : ''}
                </span>
              </div>
            )}
            {isLarge && (
              <div className="stm-warn">
                ⚠ Large files may slow down storage. Consider keeping stems under 5MB.
              </div>
            )}
            {readError && <div className="stm-error">{readError}</div>}
          </div>

          {/* Name */}
          <div className="stm-field">
            <label className="stm-field-lbl">Name</label>
            <input
              className="stm-inp"
              placeholder="e.g. Drum loop - Verse"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Type */}
          <div className="stm-field">
            <label className="stm-field-lbl">Type</label>
            <select
              className="stm-inp"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              {STEM_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.icon}  {t.label}</option>
              ))}
            </select>
          </div>

          {/* Song link */}
          <div className="stm-field">
            <label className="stm-field-lbl">Link to song (optional)</label>
            {allSongs.length === 0 ? (
              <div className="stm-muted stm-field-hint">
                Add songs to your library first.{' '}
                <Link to="/worship/songs/all" className="stm-link">Go to Songs →</Link>
              </div>
            ) : (
              <div className="stm-song-picker">
                <input
                  className="stm-inp"
                  placeholder={selectedSong ? selectedSong.title : 'Search songs…'}
                  value={songQuery}
                  onChange={e => { setSongQuery(e.target.value); setShowSongList(true); }}
                  onFocus={() => setShowSongList(true)}
                />
                {selectedSong && (
                  <button
                    type="button"
                    className="stm-song-clear"
                    onClick={() => { setSongId(''); setSongQuery(''); }}
                    title="Clear song link"
                  >
                    ✕
                  </button>
                )}
                {showSongList && songMatches.length > 0 && (
                  <div className="stm-song-list">
                    {songMatches.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="stm-song-opt"
                        onClick={() => {
                          setSongId(s.id);
                          setSongQuery('');
                          setShowSongList(false);
                        }}
                      >
                        <span className="stm-song-opt-title">{s.title}</span>
                        {s.artist && <span className="stm-song-opt-artist">{s.artist}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BPM + key */}
          <div className="stm-row-2">
            <div className="stm-field">
              <label className="stm-field-lbl">BPM</label>
              <input
                className="stm-inp"
                type="number"
                min="40"
                max="240"
                placeholder="—"
                value={bpm}
                onChange={e => setBpm(e.target.value)}
              />
            </div>
            <div className="stm-field">
              <label className="stm-field-lbl">Key</label>
              <input
                className="stm-inp"
                placeholder="e.g. G, Am"
                value={songKey}
                onChange={e => setSongKey(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="stm-field">
            <label className="stm-field-lbl">Notes</label>
            <textarea
              className="stm-inp stm-textarea"
              rows={2}
              placeholder="Anything worth remembering about this stem…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="stm-modal-foot">
            <button type="button" className="stm-btn stm-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="stm-btn stm-btn-accent"
              disabled={busy || !file || !dataUrl}
            >
              {busy ? 'Uploading…' : 'Save Stem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Inline song picker for the editor ──────────────────────── */
function SongLinkPicker({ allSongs, currentId, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSongs;
    return allSongs.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q));
  }, [allSongs, query]);

  return (
    <div className="stm-modal-overlay" onClick={onClose}>
      <div className="stm-modal stm-modal-small" onClick={e => e.stopPropagation()}>
        <div className="stm-modal-head">
          <span>Link to song</span>
          <button className="stm-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stm-modal-body">
          {allSongs.length === 0 ? (
            <div className="stm-muted" style={{ padding: '10px 0' }}>
              Add songs to your library first.{' '}
              <Link to="/worship/songs/all" className="stm-link">Go to Songs →</Link>
            </div>
          ) : (
            <>
              <input
                className="stm-inp"
                placeholder="Search songs…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              <div className="stm-song-list stm-song-list-modal">
                <button
                  type="button"
                  className={`stm-song-opt${!currentId ? ' on' : ''}`}
                  onClick={() => onPick(null)}
                >
                  <span className="stm-song-opt-title">— No song —</span>
                </button>
                {filtered.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`stm-song-opt${currentId === s.id ? ' on' : ''}`}
                    onClick={() => onPick(s)}
                  >
                    <span className="stm-song-opt-title">{s.title}</span>
                    {s.artist && <span className="stm-song-opt-artist">{s.artist}</span>}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="stm-muted" style={{ padding: '8px 4px' }}>
                    No songs match your search.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible section ────────────────────────────────────── */
function Section({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`stm-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="stm-section-head"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="stm-section-caret" aria-hidden="true">▸</span>
        {icon && <span className="stm-section-icon" aria-hidden="true">{icon}</span>}
        <span className="stm-section-title">{title}</span>
      </button>
      {open && <div className="stm-section-body">{children}</div>}
    </div>
  );
}

/* ─── Tag chip input ─────────────────────────────────────────── */
function TagInput({ tags, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(tags) ? tags : [];

  function commit(raw) {
    if (!raw) return;
    // Accept comma-separated input
    const parts = raw.split(',').map(normalizeTag).filter(Boolean);
    if (parts.length === 0) return;
    const next = mergeTags(list, parts);
    if (next.length !== list.length) onChange(next);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && list.length > 0) {
      e.preventDefault();
      onChange(list.slice(0, -1));
    } else if (e.key === ',') {
      e.preventDefault();
      commit(draft);
    }
  }

  function handleChange(e) {
    const v = e.target.value;
    // If input contains a comma, treat as a paste-style entry
    if (v.includes(',')) {
      commit(v);
      return;
    }
    setDraft(v);
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
  }

  function removeAt(i) {
    const next = list.slice();
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="stm-tag-input">
      {list.map((tag, i) => (
        <span className="stm-tag-chip" key={`${tag}-${i}`}>
          <span className="stm-tag-chip-lbl">{tag}</span>
          <button
            type="button"
            className="stm-tag-chip-x"
            onClick={() => removeAt(i)}
            aria-label={`Remove tag ${tag}`}
            tabIndex={-1}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="stm-tag-input-inp"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={list.length === 0 ? 'Add tags (Enter or comma to add)…' : 'Add tag…'}
      />
    </div>
  );
}

/* ─── Star rating ────────────────────────────────────────────── */
function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const display = hover || value || 0;

  function handleClick(n) {
    if (n === value) onChange(0);
    else onChange(n);
  }

  return (
    <div
      className="stm-stars"
      role="radiogroup"
      aria-label="Rating"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`stm-star${n <= display ? ' on' : ''}`}
          onClick={() => handleClick(n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={n <= (value || 0)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ─── Toggle switch ──────────────────────────────────────────── */
/* Bulletproof toggle: a real hidden checkbox wrapped in a <label>.
   The native label/checkbox pairing handles a single onChange per
   click + native keyboard (Space) + screen-reader announcement for
   free, with none of the nested-onClick double-fire weirdness the
   previous implementation could hit. */
function Toggle({ checked, onChange, label, title }) {
  return (
    <label className="stm-toggle" title={title}>
      <input
        type="checkbox"
        className="stm-toggle-input"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span
        className={`stm-toggle-track${checked ? ' on' : ''}`}
        aria-hidden="true"
      >
        <span className="stm-toggle-thumb" />
      </span>
      <span className="stm-toggle-lbl">{label}</span>
    </label>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function StemsLibrary() {
  const { user } = useAuth();
  /* Metadata array lives in Firestore. Each stem references a blob in
     Firebase Storage by `audioUrl` (for playback) + `storagePath` (for
     delete). No more base64 blobs in the doc itself. */
  const [stems,       setStems]       = useUserStoreKey('band:stems', []);
  const [allSongs,    setAllSongs]    = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [filterType,  setFilterType]  = useState('all');
  const [query,       setQuery]       = useState('');
  const [showUpload,  setShowUpload]  = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [toast,       setToast]       = useState('');

  // "Add to Studio" project picker — opened from the detail toolbar
  const [showStudioPicker, setShowStudioPicker] = useState(false);
  const [studioProjects,   setStudioProjects]   = useState([]);
  /* Collaborative shared projects the user is part of. Listed in
     the picker beside personal projects so users can add a stem
     straight into a live collab. */
  const [sharedStudioProjects, setSharedStudioProjects] = useState([]);
  const [loadingProjects,  setLoadingProjects]  = useState(false);
  const [studioErr,        setStudioErr]        = useState('');
  /* Disambiguating key while a save is in flight: `${kind}:${id}`
     so the same id can't collide between personal/shared lists. */
  const [addingToProjectId, setAddingToProjectId] = useState(null);
  const [newProjectName,   setNewProjectName]   = useState('');
  const navigate = useNavigate();

  // Inline (sidebar) playback
  const [inlinePlayingId, setInlinePlayingId] = useState(null);
  const inlineAudioRef = useRef(null);

  // Main player state
  const mainAudioRef = useRef(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [progress,   setProgress]   = useState(0);   // seconds
  const [totalTime,  setTotalTime]  = useState(0);   // seconds
  const [volume,     setVolume]     = useState(0.85);
  const [looping,    setLooping]    = useState(false);
  const [audioError, setAudioError] = useState('');
  const playerWrapRef = useRef(null);

  /* (No persist effect — useUserStoreKey writes through on setStems.
     Storage quota is now bounded by Firebase Storage rules, not the
     browser's localStorage, so the old quota-toast is no longer needed.) */

  /* ── Load song library (best-effort) ───────────────────────── */
  useEffect(() => {
    songService.getAll()
      .then(res => setAllSongs(Array.isArray(res?.data?.data) ? res.data.data : []))
      .catch(() => setAllSongs([]));
  }, []);

  /* ── Reset audio state when selection changes ──────────────── */
  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setAudioError('');
    setArmedDelete(false);
    const a = mainAudioRef.current;
    if (a) {
      try { a.pause(); } catch {}
    }
  }, [selectedId]);

  /* ── Update audio volume when slider changes ───────────────── */
  useEffect(() => {
    if (mainAudioRef.current)   mainAudioRef.current.volume   = volume;
    if (inlineAudioRef.current) inlineAudioRef.current.volume = volume;
  }, [volume]);

  /* ── Update loop flag on the live audio element ────────────── */
  useEffect(() => {
    if (mainAudioRef.current) mainAudioRef.current.loop = looping;
  }, [looping]);

  /* ── Derived ───────────────────────────────────────────────── */
  const typeCounts = useMemo(() => {
    const c = { all: stems.length };
    for (const t of STEM_TYPES) c[t.id] = 0;
    for (const s of stems) {
      if (c[s.type] != null) c[s.type] += 1;
      else c.other += 1;
    }
    return c;
  }, [stems]);

  const filteredStems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = stems.filter(s => {
      if (filterType !== 'all' && s.type !== filterType) return false;
      if (!q) return true;
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.songTitle || '').toLowerCase().includes(q) ||
        (s.type || '').toLowerCase().includes(q) ||
        typeLabel(s.type).toLowerCase().includes(q)
      );
    });

    // Group by song title, then alphabetical by name within group.
    // Stems with no song title sort after stems with a song title.
    return filtered.slice().sort((a, b) => {
      const aSong = (a.songTitle || '').toLowerCase();
      const bSong = (b.songTitle || '').toLowerCase();
      if (aSong && !bSong) return -1;
      if (!aSong && bSong) return 1;
      if (aSong !== bSong) return aSong.localeCompare(bSong);
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
  }, [stems, filterType, query]);

  const selected = useMemo(
    () => stems.find(s => s.id === selectedId) || null,
    [stems, selectedId]
  );

  // Detect if a linked song was removed from the library
  const linkedSong = useMemo(() => {
    if (!selected?.songId) return null;
    return allSongs.find(s => s.id === selected.songId) || null;
  }, [selected, allSongs]);
  const songRemoved = !!(selected?.songId && allSongs.length > 0 && !linkedSong);

  const totalBytes = useMemo(
    () => stems.reduce((sum, s) => sum + (s.fileSize || 0), 0),
    [stems]
  );

  /* ── Stem CRUD ─────────────────────────────────────────────── */
  /* addStem is async now — it uploads the file to Storage first, then
     persists the metadata (with audioUrl + storagePath) to Firestore. */
  const addStem = useCallback(async (metadata, file) => {
    if (!user?.uid) return { error: 'You must be signed in to upload stems.' };
    if (!file)      return { error: 'No file selected.' };
    try {
      const { url, path, size, contentType } = await uploadBlob(
        user.uid,
        'stems',
        file,
        { filename: file.name }
      );
      const stem = {
        ...metadata,
        audioUrl:    url,
        storagePath: path,
        fileSize:    size || metadata.fileSize,
        contentType,
      };
      setStems(prev => [stem, ...prev]);
      setSelectedId(stem.id);
      return null;
    } catch (err) {
      const code = err?.code || '';
      if (code === 'storage/unauthorized') {
        return { error: 'Upload blocked by Storage rules. Make sure docs/storage.rules is published in Firebase Console.' };
      }
      if (code === 'storage/canceled') {
        return { error: 'Upload canceled.' };
      }
      if (/size/i.test(err?.message || '')) {
        return { error: 'File too large. Each stem must be under 50 MiB.' };
      }
      return { error: 'Upload failed: ' + (err?.message || 'unknown error') };
    }
  }, [user, setStems]);

  const updateStem = useCallback((id, patch) => {
    setStems(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, [setStems]);

  /* Remove the Firestore reference AND the Storage blob. Optimistic:
     drop from the array first so the UI updates instantly, then delete
     the blob in the background. */
  const removeStem = useCallback((id) => {
    const stem = stems.find(s => s.id === id);
    setStems(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (inlinePlayingId === id) {
      try { inlineAudioRef.current?.pause(); } catch {}
      setInlinePlayingId(null);
    }
    if (stem?.storagePath) {
      // fire-and-forget — if it fails we surface a quiet toast but don't
      // re-add the row (otherwise the UI would oscillate).
      deleteBlobAtPath(stem.storagePath).catch(() => {
        setToast('Stem removed, but its audio file could not be deleted from Storage.');
      });
    }
  }, [stems, selectedId, inlinePlayingId, setStems]);

  /* ── Inline (sidebar) play / pause ─────────────────────────── */
  const toggleInlinePlay = useCallback((stem) => {
    const a = inlineAudioRef.current;
    if (!a) return;
    if (inlinePlayingId === stem.id) {
      try { a.pause(); } catch {}
      setInlinePlayingId(null);
      return;
    }
    try {
      a.src = stem.audioUrl;
      a.volume = volume;
      a.play().then(() => setInlinePlayingId(stem.id)).catch(() => {
        setInlinePlayingId(null);
      });
    } catch {
      setInlinePlayingId(null);
    }
  }, [inlinePlayingId, volume]);

  /* ── Main player handlers ──────────────────────────────────── */
  const togglePlay = useCallback(() => {
    const a = mainAudioRef.current;
    if (!a || !selected) return;
    if (a.paused) {
      a.play().then(() => setIsPlaying(true)).catch(() => {
        setAudioError("Couldn't load this audio file.");
        setIsPlaying(false);
      });
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, [selected]);

  const onTimeUpdate = () => {
    const a = mainAudioRef.current;
    if (!a) return;
    setProgress(a.currentTime || 0);
  };

  const onLoadedMetadata = () => {
    const a = mainAudioRef.current;
    if (!a) return;
    if (Number.isFinite(a.duration)) setTotalTime(a.duration);
  };

  const onEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const onMainAudioError = () => {
    setAudioError("Couldn't load this audio file.");
    setIsPlaying(false);
  };

  const scrubTo = (e) => {
    const a = mainAudioRef.current;
    if (!a || !totalTime) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * totalTime;
    a.currentTime = t;
    setProgress(t);
  };

  /* ── Keyboard: Space toggles play when focus in player ─────── */
  const handlePlayerKey = (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
  };

  /* ── Delete (armed) ────────────────────────────────────────── */
  const handleDelete = () => {
    if (!selected) return;
    if (!armedDelete) {
      setArmedDelete(true);
      setTimeout(() => setArmedDelete(curr => curr), 0);
      return;
    }
    removeStem(selected.id);
  };

  /* ── Add to Studio (Multitrack) ────────────────────────────────
     Copies the stem's audio data into Studio as a new track. The copy is
     one-way: deleting the track in Studio leaves the original stem in the
     library untouched (audio lives in two independent stores). */
  const openStudioPicker = useCallback(async () => {
    if (!selected) return;
    setShowStudioPicker(true);
    setStudioErr('');
    setNewProjectName('');
    setLoadingProjects(true);
    try {
      /* Load both personal and shared projects in parallel. Either
         one can fail independently; we only show an error if BOTH
         do, so a one-sided outage doesn't block the picker. */
      const [personalRes, sharedRes] = await Promise.allSettled([
        studioProjectService.getAll(),
        sharedStudioProjectService.getMine(),
      ]);
      if (personalRes.status === 'fulfilled') {
        const list = personalRes.value?.data?.data;
        setStudioProjects(Array.isArray(list) ? list : []);
      } else {
        setStudioProjects([]);
      }
      if (sharedRes.status === 'fulfilled') {
        setSharedStudioProjects(Array.isArray(sharedRes.value) ? sharedRes.value : []);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[stems] could not load shared projects:', sharedRes.reason);
        setSharedStudioProjects([]);
      }
      if (personalRes.status === 'rejected' && sharedRes.status === 'rejected') {
        setStudioErr('Couldn’t load Studio projects.');
      }
    } finally {
      setLoadingProjects(false);
    }
  }, [selected]);

  const closeStudioPicker = () => {
    setShowStudioPicker(false);
    setStudioErr('');
    setAddingToProjectId(null);
    setNewProjectName('');
    setSharedStudioProjects([]);
  };

  /* Add the selected stem to a Studio project. `opts.kind` chooses
     which service the write goes through:
       'personal' (default) → /users/{uid}/kv/studio-projects
       'shared'             → /sharedStudioProjects/{id}
                              (every collaborator sees the new track
                              stream in via the live subscription).
     New-project creation always goes to personal — collaborations
     have to start from the Studio's Collaborate-live flow, not
     from the stem picker. */
  const addStemToProject = async (projectId, opts = {}) => {
    if (!selected || !selected.audioUrl) return;
    const kind = opts.kind === 'shared' ? 'shared' : 'personal';
    const key  = projectId ? `${kind}:${projectId}` : 'new';
    setAddingToProjectId(key);
    setStudioErr('');
    try {
      let pid = projectId;
      let targetKind = kind;
      // If no project was passed, create a new PERSONAL one named for the stem.
      if (!pid) {
        const projName = (newProjectName || `${selected.name || 'Stem'} session`).trim() || 'Untitled session';
        const created = await studioProjectService.create({ name: projName, tempo: selected.bpm || 100 });
        pid = created.data?.data?.id;
        if (!pid) throw new Error('No project id returned');
        targetKind = 'personal';
      }
      /* Pass the stem's existing Storage URL + path straight through
         to the project service. Re-fetching + re-encoding as a base64
         data URL (the old behavior) was bloating the personal-project
         payload past Firestore's 1 MiB per-doc limit — personal
         projects all share a single doc, so a big audio_data attempt
         would silently fail. The shared service has one doc per
         project so the old behavior squeaked through there. Passing
         the URL directly avoids the bloat for both kinds. */
      const trackPayload = {
        name:          selected.name || 'Stem',
        audio_url:     selected.audioUrl,
        storage_path:  selected.storagePath || '',
        clip_offset:   0,
        trim_start:    0,
        trim_end:      0,
      };
      if (targetKind === 'shared') {
        await sharedStudioProjectService.addTrack(pid, trackPayload);
      } else {
        await studioProjectService.addTrack(pid, trackPayload);
      }
      const where = targetKind === 'shared' ? 'the shared project' : 'Studio';
      setToast(`Added "${selected.name || 'stem'}" to ${where}.`);
      closeStudioPicker();
      if (opts.navigateAfter) {
        navigate('/worship/production/multitrack');
      }
    } catch (err) {
      setStudioErr('Failed to add. ' + (err?.message || ''));
      setAddingToProjectId(null);
    }
  };

  /* ── Download original ─────────────────────────────────────── */
  const handleDownload = () => {
    if (!selected || !selected.audioUrl) return;
    // The Storage download URL is directly downloadable. Setting the
    // anchor's download attribute hints the browser to save it locally
    // instead of opening it.
    const a = document.createElement('a');
    a.href = selected.audioUrl;
    a.download = selected.fileName || `${selected.name || 'stem'}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ── Pick song from modal ──────────────────────────────────── */
  const pickSong = (song) => {
    if (!selected) return;
    if (song) {
      updateStem(selected.id, { songId: song.id, songTitle: song.title || '' });
    } else {
      updateStem(selected.id, { songId: null, songTitle: '' });
    }
    setShowSongPicker(false);
  };

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <WorshipShell title="Stems Library" icon="🎛" subtitle="Library of recorded stems for mixing and re-use across sessions.">
    <div className="stm-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* Shared <audio> for sidebar inline playback */}
      <audio
        ref={inlineAudioRef}
        crossOrigin="anonymous"
        onEnded={() => setInlinePlayingId(null)}
        onError={() => setInlinePlayingId(null)}
        style={{ display: 'none' }}
      />

      <main className="stm-main">
        <div className="stm-layout">
          {/* ─── Sidebar ──────────────────────────────────── */}
          <aside className="stm-side">
            <div className="stm-side-head">
              <span className="stm-side-title">Stems</span>
              <button
                className="stm-btn stm-btn-accent stm-btn-sm"
                onClick={() => setShowUpload(true)}
              >
                + Upload Stem
              </button>
            </div>

            {/* Type filter pills */}
            <div className="stm-pills">
              <button
                className={`stm-pill${filterType === 'all' ? ' on' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All <span className="stm-pill-count">{typeCounts.all || 0}</span>
              </button>
              {STEM_TYPES.map(t => (
                <button
                  key={t.id}
                  className={`stm-pill${filterType === t.id ? ' on' : ''}`}
                  onClick={() => setFilterType(t.id)}
                  title={t.label}
                >
                  <span aria-hidden="true">{t.icon}</span>
                  <span className="stm-pill-lbl">{t.label}</span>
                  <span className="stm-pill-count">{typeCounts[t.id] || 0}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="stm-search-wrap">
              <input
                className="stm-inp"
                placeholder="Search name, song, type…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            {/* Storage chip */}
            <div className="stm-storage-chip">
              Storage: {formatBytes(totalBytes)} used
              <span className="stm-muted"> · {stems.length} stem{stems.length === 1 ? '' : 's'}</span>
            </div>

            {/* List */}
            <div className="stm-list">
              {filteredStems.length === 0 ? (
                <div className="stm-list-empty stm-muted">
                  {stems.length === 0 ? 'No stems uploaded yet.' : 'No stems match these filters.'}
                </div>
              ) : (
                filteredStems.map(s => {
                  const sTags = Array.isArray(s.tags) ? s.tags : [];
                  const visibleTags = sTags.slice(0, 2);
                  const extraTags = sTags.length - visibleTags.length;
                  const rating = Number(s.rating) || 0;
                  return (
                    <div
                      key={s.id}
                      className={`stm-row${selectedId === s.id ? ' on' : ''}${inlinePlayingId === s.id ? ' playing' : ''}`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <button
                        className="stm-row-play"
                        onClick={e => { e.stopPropagation(); toggleInlinePlay(s); }}
                        title={inlinePlayingId === s.id ? 'Pause' : 'Play'}
                      >
                        {inlinePlayingId === s.id ? '❚❚' : '▶'}
                      </button>
                      <span className="stm-row-icon" aria-hidden="true">{typeIcon(s.type)}</span>
                      <div className="stm-row-info">
                        <div className="stm-row-name">{s.name}</div>
                        <div className="stm-row-sub">
                          {s.songTitle && <span className="stm-row-song">{s.songTitle}</span>}
                          {s.songTitle && <span className="stm-row-dot">·</span>}
                          <span className="stm-row-dur">{formatTime(s.duration)}</span>
                          {rating > 0 && (
                            <>
                              <span className="stm-row-dot">·</span>
                              <span className="stm-row-rating" title={`${rating} star${rating === 1 ? '' : 's'}`}>
                                {'★'.repeat(rating)}
                              </span>
                            </>
                          )}
                        </div>
                        {(visibleTags.length > 0 || extraTags > 0) && (
                          <div className="stm-row-tags">
                            {visibleTags.map((t, i) => (
                              <span className="stm-row-tag" key={`${t}-${i}`}>{t}</span>
                            ))}
                            {extraTags > 0 && (
                              <span className="stm-row-tag stm-row-tag-more">+{extraTags} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* ─── Detail / Player ──────────────────────────── */}
          <section className="stm-detail">
            {!selected ? (
              <div className="stm-empty">
                <div className="stm-empty-icon">🎛</div>
                <div className="stm-empty-title">
                  {stems.length === 0 ? 'No stems yet' : 'No stem selected'}
                </div>
                <div className="stm-empty-sub">
                  {stems.length === 0
                    ? 'Upload your first stem above. Common uses: drum tracks for live use, pad layers, click tracks, reference vocals.'
                    : 'Choose a stem from the sidebar to play and edit.'}
                </div>
              </div>
            ) : (
              <>
                <audio
                  ref={mainAudioRef}
                  src={selected.audioUrl}
                  crossOrigin="anonymous"
                  onTimeUpdate={onTimeUpdate}
                  onLoadedMetadata={onLoadedMetadata}
                  onEnded={onEnded}
                  onError={onMainAudioError}
                  preload="metadata"
                />

                {/* Header */}
                <div className="stm-detail-head">
                  <div className="stm-detail-head-l">
                    <input
                      className="stm-name-input"
                      value={selected.name}
                      onChange={e => updateStem(selected.id, { name: e.target.value })}
                      placeholder="Stem name"
                    />
                    <div className="stm-chips">
                      <span className="stm-chip stm-chip-type">
                        <span aria-hidden="true">{typeIcon(selected.type)}</span>
                        {typeLabel(selected.type)}
                      </span>
                      <button
                        type="button"
                        className="stm-chip stm-chip-song"
                        onClick={() => setShowSongPicker(true)}
                        title="Change linked song"
                      >
                        {selected.songId
                          ? (songRemoved
                              ? <span>{selected.songTitle || 'Linked song'} <em className="stm-muted">(song removed)</em></span>
                              : (linkedSong?.title || selected.songTitle || 'Linked song'))
                          : '+ Link to song'}
                      </button>
                      {selected.bpm != null && selected.bpm !== '' && (
                        <span className="stm-chip stm-chip-bpm">{selected.bpm} BPM</span>
                      )}
                      {selected.songKey && (
                        <span className="stm-chip stm-chip-key">{selected.songKey}</span>
                      )}
                      {selected.timeSignature && (
                        <span className="stm-chip stm-chip-ts">{selected.timeSignature}</span>
                      )}
                      {selected.loopable && (
                        <span className="stm-chip stm-chip-loop">🔁 Loops</span>
                      )}
                      {selected.source && (
                        <span className="stm-chip stm-chip-source" title={`Source: ${selected.source}`}>
                          Source: {selected.source}
                        </span>
                      )}
                      <span className="stm-chip stm-chip-file" title={selected.fileName}>
                        {selected.fileName || 'audio'} · {formatBytes(selected.fileSize)}
                      </span>
                    </div>
                  </div>
                  <div className="stm-detail-head-r">
                    <button
                      className="stm-btn stm-btn-studio"
                      onClick={openStudioPicker}
                      title="Add this stem to a Studio project as a new track"
                      disabled={!selected.audioUrl}
                    >
                      🎚 Add to Studio
                    </button>
                    <button className="stm-btn stm-btn-ghost" onClick={handleDownload}>
                      ⬇ Download Original
                    </button>
                    <button
                      className={`stm-btn${armedDelete ? ' stm-btn-danger-armed' : ' stm-btn-danger'}`}
                      onClick={handleDelete}
                      onBlur={() => setArmedDelete(false)}
                      title={armedDelete ? 'Click again to confirm' : 'Delete stem'}
                    >
                      {armedDelete ? 'Confirm Delete' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Player */}
                <div
                  className="stm-player"
                  tabIndex={0}
                  ref={playerWrapRef}
                  onKeyDown={handlePlayerKey}
                >
                  {audioError ? (
                    <div className="stm-error stm-audio-err">
                      {audioError}
                      <button
                        className="stm-btn stm-btn-danger stm-btn-sm"
                        onClick={() => removeStem(selected.id)}
                      >
                        Delete stem
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="stm-player-row">
                        <button
                          className="stm-play-big"
                          onClick={togglePlay}
                          aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? '❚❚' : '▶'}
                        </button>

                        <div className="stm-player-mid">
                          <div className="stm-bar" onClick={scrubTo} role="slider" aria-label="Seek">
                            <div
                              className="stm-bar-fill"
                              style={{ width: totalTime ? `${(progress / totalTime) * 100}%` : '0%' }}
                            />
                            <div
                              className="stm-bar-thumb"
                              style={{ left: totalTime ? `${(progress / totalTime) * 100}%` : '0%' }}
                            />
                          </div>
                          <div className="stm-player-times">
                            <span>{formatTime(progress)}</span>
                            <span className="stm-muted">{formatTime(totalTime || selected.duration)}</span>
                          </div>
                        </div>

                        <div className="stm-player-controls">
                          <button
                            className={`stm-icon-btn${looping ? ' on' : ''}`}
                            onClick={() => setLooping(v => !v)}
                            title="Loop"
                            aria-pressed={looping}
                          >
                            ↻
                          </button>
                          <div className="stm-vol">
                            <span className="stm-vol-icon" aria-hidden="true">🔊</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={Math.round(volume * 100)}
                              onChange={e => setVolume(parseInt(e.target.value, 10) / 100)}
                              className="stm-vol-slider"
                              title="Volume"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="stm-player-hint stm-muted">
                        Tip: focus the player and press <kbd>Space</kbd> to play / pause.
                      </div>
                    </>
                  )}
                </div>

                {/* Edit form (grouped sections) */}
                <div className="stm-form">
                  {/* Rating row */}
                  <div className="stm-rating-row">
                    <span className="stm-field-lbl stm-rating-lbl">Rating</span>
                    <StarRating
                      value={Number(selected.rating) || 0}
                      onChange={r => updateStem(selected.id, { rating: r })}
                    />
                  </div>

                  {/* Identity */}
                  <Section title="Identity" icon="🎵" defaultOpen>
                    <div className="stm-row-2">
                      <div className="stm-field">
                        <label className="stm-field-lbl">Type</label>
                        <select
                          className="stm-inp"
                          value={selected.type}
                          onChange={e => updateStem(selected.id, { type: e.target.value })}
                        >
                          {STEM_TYPES.map(t => (
                            <option key={t.id} value={t.id}>{t.icon}  {t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="stm-field">
                        <label className="stm-field-lbl">Linked song</label>
                        <button
                          type="button"
                          className="stm-inp stm-inp-button"
                          onClick={() => setShowSongPicker(true)}
                        >
                          {selected.songId
                            ? (songRemoved
                                ? `${selected.songTitle || 'Linked song'} (removed)`
                                : (linkedSong?.title || selected.songTitle || 'Linked song'))
                            : 'Pick a song…'}
                        </button>
                      </div>
                    </div>

                    <div className="stm-field">
                      <label className="stm-field-lbl">Source</label>
                      <input
                        className="stm-inp"
                        placeholder="e.g. Drums, Piano, AKAI - Bank A…"
                        value={selected.source || ''}
                        onChange={e => updateStem(selected.id, { source: e.target.value })}
                      />
                    </div>
                  </Section>

                  {/* Musical info */}
                  <Section title="Musical info" icon="🎼" defaultOpen>
                    <div className="stm-row-3">
                      <div className="stm-field">
                        <label className="stm-field-lbl">BPM</label>
                        <input
                          className="stm-inp"
                          type="number"
                          min="40"
                          max="240"
                          placeholder="—"
                          value={selected.bpm ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            updateStem(selected.id, { bpm: v === '' ? null : Number(v) });
                          }}
                        />
                      </div>
                      <div className="stm-field">
                        <label className="stm-field-lbl">Key</label>
                        <input
                          className="stm-inp"
                          placeholder="e.g. G, Am"
                          value={selected.songKey || ''}
                          onChange={e => updateStem(selected.id, { songKey: e.target.value })}
                        />
                      </div>
                      <div className="stm-field">
                        <label className="stm-field-lbl">Time signature</label>
                        <select
                          className="stm-inp"
                          value={selected.timeSignature || ''}
                          onChange={e => updateStem(selected.id, { timeSignature: e.target.value })}
                        >
                          <option value="">—</option>
                          {TIME_SIGNATURES.map(ts => (
                            <option key={ts} value={ts}>{ts}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </Section>

                  {/* Organization */}
                  <Section title="Organization" icon="🏷" defaultOpen>
                    <div className="stm-field">
                      <label className="stm-field-lbl">Tags</label>
                      <TagInput
                        tags={Array.isArray(selected.tags) ? selected.tags : []}
                        onChange={tags => updateStem(selected.id, { tags })}
                      />
                      <div className="stm-field-hint stm-muted">
                        Press Enter or comma to add. Backspace on empty input removes the last tag.
                      </div>
                    </div>

                    <div className="stm-row-2">
                      <div className="stm-field">
                        <label className="stm-field-lbl">Rating</label>
                        <StarRating
                          value={Number(selected.rating) || 0}
                          onChange={r => updateStem(selected.id, { rating: r })}
                        />
                      </div>
                      <div className="stm-field">
                        <label className="stm-field-lbl">Loopable</label>
                        <Toggle
                          checked={!!selected.loopable}
                          onChange={v => updateStem(selected.id, { loopable: v })}
                          label="Loops cleanly"
                          title="Toggle on if this stem loops without an audible seam"
                        />
                      </div>
                    </div>
                  </Section>

                  {/* Notes */}
                  <Section title="Notes" icon="📝" defaultOpen>
                    <div className="stm-field">
                      <textarea
                        className="stm-inp stm-textarea"
                        rows={3}
                        placeholder="Performance notes, processing details…"
                        value={selected.notes || ''}
                        onChange={e => updateStem(selected.id, { notes: e.target.value })}
                      />
                    </div>
                  </Section>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {showUpload && (
        <UploadDialog
          allSongs={allSongs}
          defaultCount={stems.length}
          onSave={addStem}
          onClose={() => setShowUpload(false)}
          onError={(msg) => setToast(msg)}
        />
      )}

      {showSongPicker && selected && (
        <SongLinkPicker
          allSongs={allSongs}
          currentId={selected.songId || null}
          onPick={pickSong}
          onClose={() => setShowSongPicker(false)}
        />
      )}

      {showStudioPicker && selected && (
        <div className="stm-modal-backdrop" onClick={closeStudioPicker}>
          <div className="stm-modal stm-studio-picker" onClick={e => e.stopPropagation()}>
            <div className="stm-modal-head">
              <span>🎚 Add stem to Studio</span>
              <button className="stm-modal-close" onClick={closeStudioPicker} aria-label="Close">✕</button>
            </div>
            <div className="stm-modal-body">
              <p className="stm-modal-sub">
                Copy <strong>{selected.name}</strong> into a Studio project as a new track.
                The original stays in your library.
              </p>

              {studioErr && <div className="stm-error">{studioErr}</div>}

              {loadingProjects ? (
                <div className="stm-muted" style={{ padding: '14px 0' }}>Loading projects…</div>
              ) : (
                <>
                  <div className="stm-studio-picker-label">Your Studio projects</div>
                  {studioProjects.length === 0 ? (
                    <div className="stm-muted stm-studio-picker-empty">
                      No personal Studio projects yet.
                    </div>
                  ) : (
                    <div className="stm-studio-picker-list">
                      {studioProjects.map(p => {
                        const rowKey = `personal:${p.id}`;
                        return (
                          <button
                            key={p.id}
                            className="stm-studio-picker-row"
                            onClick={() => addStemToProject(p.id, { kind: 'personal' })}
                            disabled={addingToProjectId === rowKey}
                          >
                            <span className="stm-studio-picker-row-name">🎚 {p.name}</span>
                            <span className="stm-studio-picker-row-meta">
                              {p.tracks?.length ?? p.trackCount ?? 0} track{(p.tracks?.length ?? p.trackCount ?? 0) === 1 ? '' : 's'}
                              {p.tempo ? ` · ${p.tempo} bpm` : ''}
                            </span>
                            {addingToProjectId === rowKey && <span className="stm-studio-picker-row-spinner">…</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Collaborative projects — only render the section
                      when the user is part of at least one, so the
                      picker stays compact for solo users. */}
                  {sharedStudioProjects.length > 0 && (
                    <>
                      <div className="stm-studio-picker-divider" />
                      <div className="stm-studio-picker-label">🤝 Collaborations</div>
                      <div className="stm-studio-picker-list">
                        {sharedStudioProjects.map(p => {
                          const rowKey = `shared:${p.id}`;
                          return (
                            <button
                              key={p.id}
                              className="stm-studio-picker-row"
                              onClick={() => addStemToProject(p.id, { kind: 'shared' })}
                              disabled={addingToProjectId === rowKey}
                            >
                              <span className="stm-studio-picker-row-name">🤝 {p.name}</span>
                              <span className="stm-studio-picker-row-meta">
                                {p.tracks?.length || 0} track{(p.tracks?.length || 0) === 1 ? '' : 's'}
                                {' · '}
                                {(p.editorUids?.length || 0)} editor{(p.editorUids?.length || 0) === 1 ? '' : 's'}
                              </span>
                              {addingToProjectId === rowKey && <span className="stm-studio-picker-row-spinner">…</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="stm-studio-picker-divider" />

                  <div className="stm-studio-picker-label">Or create a new personal project</div>
                  <div className="stm-studio-picker-newrow">
                    <input
                      className="stm-input"
                      placeholder={`${selected.name || 'Stem'} session`}
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addStemToProject(null)}
                    />
                    <button
                      className="stm-btn stm-btn-studio"
                      onClick={() => addStemToProject(null)}
                      disabled={addingToProjectId === 'new'}
                    >
                      {addingToProjectId === 'new' ? 'Creating…' : '+ Create & Add'}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="stm-modal-foot">
              <button className="stm-btn stm-btn-ghost" onClick={closeStudioPicker}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
    </WorshipShell>
  );
}
