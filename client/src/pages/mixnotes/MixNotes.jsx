import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import './MixNotes.css';

/* ─────────────────────────────────────────────────────────────
   Mix Notes — per-song mix/production notes
   Naming: .mn-*
   Persistence: localStorage key "band:mix-notes"
   Accent: var(--accent-green, #6ee7b7)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'band:mix-notes';

const CATEGORIES = [
  { key: 'live',      label: 'Live'      },
  { key: 'studio',    label: 'Studio'    },
  { key: 'rehearsal', label: 'Rehearsal' },
  { key: 'reference', label: 'Reference' },
  { key: 'other',     label: 'Other'     },
];

const FILTER_PILLS = [
  { key: 'all',       label: 'All'       },
  { key: 'live',      label: 'Live'      },
  { key: 'studio',    label: 'Studio'    },
  { key: 'rehearsal', label: 'Rehearsal' },
  { key: 'reference', label: 'Reference' },
  { key: 'other',     label: 'Other'     },
];

const SECTION_BLOCKS = [
  { key: 'eq',           icon: '🎚',  label: 'EQ',                  placeholder: 'e.g. Vocals: HPF 80Hz, +2dB @ 3kHz, slight shelf -1dB above 10kHz', rows: 3 },
  { key: 'compression',  icon: '🔄', label: 'Compression',         placeholder: 'e.g. Vocal bus: 4:1 ratio, 3dB GR, slow attack',                    rows: 3 },
  { key: 'reverb',       icon: '🌊', label: 'Reverb',              placeholder: 'e.g. Plate on vocals, 2.5s, 22% wet',                               rows: 3 },
  { key: 'delay',        icon: '⏱',  label: 'Delay',               placeholder: 'e.g. 1/4 note tempo-synced, low feedback',                         rows: 3 },
  { key: 'monitors',     icon: '🎧', label: 'Monitors / In-Ears',  placeholder: 'e.g. WL kick + click forward; vocalists more piano',               rows: 3 },
  { key: 'arrangement',  icon: '🎼', label: 'Arrangement',         placeholder: 'e.g. Drop bass on V2; reverb tail on bridge',                       rows: 3 },
  { key: 'reference',    icon: '🎯', label: 'Reference Tracks',    placeholder: "e.g. Hillsong 'Oceans' — pad atmospheric similar",                 rows: 3 },
  { key: 'freeform',     icon: '📝', label: 'General Notes',       placeholder: 'Anything else worth remembering about this mix…',                   rows: 5 },
];

const CATEGORY_DEFAULT = 'live';
const DEFAULT_EXPANDED_SECTIONS = SECTION_BLOCKS.reduce(
  (acc, s) => ({ ...acc, [s.key]: true }), {}
);

function makeId() {
  return 'mn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* ignore quota errors */
  }
}

function emptyNote(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    title: '',
    songId: null,
    songTitle: '',
    category: CATEGORY_DEFAULT,
    sections: {
      eq: '',
      compression: '',
      reverb: '',
      delay: '',
      monitors: '',
      arrangement: '',
      reference: '',
      freeform: '',
    },
    tags: [],
    rating: 0,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function formatTimestamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function categoryLabel(key) {
  const c = CATEGORIES.find(c => c.key === key);
  return c ? c.label : 'Other';
}

/* ─── Star Rating ─────────────────────────────────────────────── */
function StarRating({ value, onChange, size = 'md' }) {
  return (
    <div className={`mn-stars mn-stars-${size}`} role="radiogroup" aria-label="Mix rating">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            className={`mn-star${filled ? ' on' : ''}`}
            onClick={() => onChange(value === n ? 0 : n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            title={value === n ? 'Click to clear rating' : `Set rating: ${n}`}
          >
            {filled ? '★' : '☆'}
          </button>
        );
      })}
    </div>
  );
}

/* ─── New Note Form (inline in sidebar) ──────────────────────── */
function NewNoteForm({ allSongs, onSave, onCancel }) {
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState(CATEGORY_DEFAULT);
  const [songId, setSongId]     = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [showSongList, setShowSongList] = useState(false);

  // Sync songQuery -> songId when user picks
  const songMatches = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    if (!q) return allSongs.slice(0, 8);
    return allSongs
      .filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allSongs, songQuery]);

  const pickedSong = useMemo(
    () => allSongs.find(s => String(s.id) === String(songId)) || null,
    [allSongs, songId]
  );

  function handleSubmit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onSave({
      title: t,
      category,
      songId: pickedSong ? pickedSong.id : null,
      songTitle: pickedSong ? pickedSong.title || '' : '',
    });
  }

  return (
    <form className="mn-new-form" onSubmit={handleSubmit}>
      <input
        className="mn-inp"
        placeholder="Note title (e.g. Live Mix — Sunday AM)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <select
        className="mn-inp"
        value={category}
        onChange={e => setCategory(e.target.value)}
      >
        {CATEGORIES.map(c => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>

      <div className="mn-song-autocomplete">
        <input
          className="mn-inp"
          placeholder="Link a song (optional)…"
          value={pickedSong ? (pickedSong.title || '') : songQuery}
          onFocus={() => setShowSongList(true)}
          onChange={e => {
            setSongId('');
            setSongQuery(e.target.value);
            setShowSongList(true);
          }}
          onBlur={() => setTimeout(() => setShowSongList(false), 150)}
        />
        {pickedSong && (
          <button
            type="button"
            className="mn-song-clear"
            onClick={() => { setSongId(''); setSongQuery(''); }}
            title="Clear song link"
          >
            ✕
          </button>
        )}
        {showSongList && !pickedSong && songMatches.length > 0 && (
          <div className="mn-song-dropdown">
            {songMatches.map(s => (
              <button
                key={s.id}
                type="button"
                className="mn-song-option"
                onMouseDown={e => {
                  e.preventDefault();
                  setSongId(s.id);
                  setSongQuery(s.title || '');
                  setShowSongList(false);
                }}
              >
                <span className="mn-song-option-title">{s.title}</span>
                {s.artist && <span className="mn-song-option-artist">{s.artist}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mn-new-form-btns">
        <button
          type="submit"
          className="mn-btn mn-btn-accent"
          disabled={!title.trim()}
        >
          Create
        </button>
        <button
          type="button"
          className="mn-btn mn-btn-ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Sidebar note row ───────────────────────────────────────── */
function NoteRow({ note, active, onClick }) {
  const tags = Array.isArray(note.tags) ? note.tags : [];
  return (
    <button
      className={`mn-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="mn-card-top">
        {note.pinned && <span className="mn-pin-icon" title="Pinned">📌</span>}
        <span className="mn-card-name">{note.title || 'Untitled note'}</span>
      </div>
      {note.songTitle && (
        <div className="mn-card-song" title={note.songTitle}>
          ♪ {note.songTitle}
        </div>
      )}
      <div className="mn-card-meta">
        <span className={`mn-cat-chip mn-cat-${note.category || 'other'}`}>
          {categoryLabel(note.category)}
        </span>
        {note.rating > 0 && (
          <span className="mn-card-rating" title={`${note.rating} of 5`}>
            {'★'.repeat(note.rating)}
            <span className="mn-card-rating-dim">{'☆'.repeat(5 - note.rating)}</span>
          </span>
        )}
      </div>
      {tags.length > 0 && (
        <div className="mn-card-chips">
          {tags.slice(0, 3).map((t, i) => (
            <span key={i} className="mn-card-chip">{t}</span>
          ))}
          {tags.length > 3 && (
            <span className="mn-card-chip mn-card-chip-more">+{tags.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Collapsible Section Block ──────────────────────────────── */
function SectionBlock({ block, value, expanded, onToggle, onChange }) {
  return (
    <div className={`mn-sec${expanded ? ' open' : ' closed'}`}>
      <button
        type="button"
        className="mn-sec-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="mn-sec-icon" aria-hidden="true">{block.icon}</span>
        <span className="mn-sec-label">{block.label}</span>
        {value && value.trim() && !expanded && (
          <span className="mn-sec-preview">
            {value.trim().slice(0, 60)}{value.trim().length > 60 ? '…' : ''}
          </span>
        )}
        <span className="mn-sec-caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className="mn-sec-body">
          <textarea
            className="mn-inp mn-textarea"
            placeholder={block.placeholder}
            value={value || ''}
            rows={block.rows}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function MixNotes() {
  /* Live-synced via Firestore. */
  const [notes, setNotes]           = useUserStoreKey('worship:mix-notes', []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [showNew, setShowNew]       = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [tagDraft, setTagDraft]     = useState('');
  const [expandedSecs, setExpandedSecs] = useState(DEFAULT_EXPANDED_SECTIONS);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [editingSongLink, setEditingSongLink] = useState(false);
  const [songLinkQuery, setSongLinkQuery] = useState('');

  const [allSongs, setAllSongs]     = useUserStoreKey('songs', []);

  const armTimerRef = useRef(null);

  /* (No persist effect — useUserStoreKey writes through on setNotes.) */

  /* ── Auto-disarm delete after 3s ──────────────────────────── */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* ── Reset transient UI on selection change ───────────────── */
  useEffect(() => {
    setArmedDelete(false);
    setTagDraft('');
    setShowCategoryMenu(false);
    setEditingSongLink(false);
    setSongLinkQuery('');
  }, [selectedId]);

  /* (Songs are live-synced via useUserStoreKey above — no fetch needed.) */

  /* ── Derived: counts per category ─────────────────────────── */
  const counts = useMemo(() => {
    const c = { all: notes.length };
    CATEGORIES.forEach(cat => { c[cat.key] = 0; });
    notes.forEach(n => {
      const k = n.category || 'other';
      if (c[k] != null) c[k] += 1;
    });
    return c;
  }, [notes]);

  /* ── Derived: filtered + sorted ───────────────────────────── */
  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter(n => {
        if (filter !== 'all' && n.category !== filter) return false;
        if (!q) return true;
        const tagsStr = (Array.isArray(n.tags) ? n.tags : []).join(' ').toLowerCase();
        const sectionsStr = Object.values(n.sections || {}).join(' ').toLowerCase();
        return (
          (n.title || '').toLowerCase().includes(q) ||
          (n.songTitle || '').toLowerCase().includes(q) ||
          tagsStr.includes(q) ||
          sectionsStr.includes(q)
        );
      })
      .sort((a, b) => {
        // Pinned first, then by updatedAt desc
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }, [notes, query, filter]);

  const selected = useMemo(
    () => notes.find(n => n.id === selectedId) || null,
    [notes, selectedId]
  );

  /* ── Song-link autocomplete inside detail header ──────────── */
  const songLinkMatches = useMemo(() => {
    const q = songLinkQuery.trim().toLowerCase();
    if (!q) return allSongs.slice(0, 8);
    return allSongs
      .filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allSongs, songLinkQuery]);

  /* ── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setNotes(prev => prev.map(n =>
      n.id === selectedId
        ? { ...n, ...patch, updatedAt: Date.now() }
        : n
    ));
  }, [selectedId]);

  const updateSection = useCallback((key, value) => {
    if (!selectedId) return;
    setNotes(prev => prev.map(n =>
      n.id === selectedId
        ? {
            ...n,
            sections: { ...(n.sections || {}), [key]: value },
            updatedAt: Date.now(),
          }
        : n
    ));
  }, [selectedId]);

  const handleNewSaved = useCallback((data) => {
    const note = emptyNote(data);
    setNotes(prev => [note, ...prev]);
    setSelectedId(note.id);
    setShowNew(false);
    setExpandedSecs(DEFAULT_EXPANDED_SECTIONS);
  }, []);

  const handleCreateFromEmpty = useCallback(() => {
    // Quick-create without the form: open the form
    setShowNew(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setNotes(prev => prev.filter(n => n.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const now = Date.now();
    const copy = {
      ...selected,
      id: makeId(),
      title: `${selected.title || 'Untitled'} (copy)`,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      sections: { ...(selected.sections || {}) },
      tags: [...(selected.tags || [])],
    };
    setNotes(prev => [copy, ...prev]);
    setSelectedId(copy.id);
  }, [selected]);

  const handleTogglePinned = useCallback(() => {
    if (!selected) return;
    updateSelected({ pinned: !selected.pinned });
  }, [selected, updateSelected]);

  const handleAddTag = useCallback(() => {
    const v = tagDraft.trim();
    if (!v || !selected) return;
    const existing = Array.isArray(selected.tags) ? selected.tags : [];
    if (existing.some(x => x.toLowerCase() === v.toLowerCase())) {
      setTagDraft('');
      return;
    }
    updateSelected({ tags: [...existing, v] });
    setTagDraft('');
  }, [tagDraft, selected, updateSelected]);

  const handleRemoveTag = useCallback((tag) => {
    if (!selected) return;
    updateSelected({
      tags: (selected.tags || []).filter(x => x !== tag),
    });
  }, [selected, updateSelected]);

  const handleToggleSection = useCallback((key) => {
    setExpandedSecs(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSetCategory = useCallback((cat) => {
    updateSelected({ category: cat });
    setShowCategoryMenu(false);
  }, [updateSelected]);

  const handlePickSongLink = useCallback((song) => {
    updateSelected({
      songId: song.id,
      songTitle: song.title || '',
    });
    setEditingSongLink(false);
    setSongLinkQuery('');
  }, [updateSelected]);

  const handleClearSongLink = useCallback(() => {
    updateSelected({ songId: null, songTitle: '' });
    setEditingSongLink(false);
    setSongLinkQuery('');
  }, [updateSelected]);

  const handleResetFilters = useCallback(() => {
    setFilter('all');
    setQuery('');
  }, []);

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <WorshipShell title="Mix Notes" icon="📝" subtitle="Notes and feedback on mixes across sessions and songs.">
    <div className="mn-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="mn-sidebar">
        <div className="mn-sidebar-head">
          <span className="mn-sidebar-title">Mix Notes</span>
          {!showNew && (
            <button
              className="mn-new-btn"
              onClick={() => setShowNew(true)}
              title="New mix note"
            >
              + New Note
            </button>
          )}
        </div>

        {showNew && (
          <NewNoteForm
            allSongs={allSongs}
            onSave={handleNewSaved}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="mn-sidebar-controls">
          <input
            className="mn-inp"
            placeholder="Search notes, songs, tags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="mn-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`mn-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="mn-pill-label">{p.label}</span>
                <span className="mn-pill-count">{counts[p.key] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mn-list">
          {filteredNotes.length === 0 && notes.length > 0 && (
            <div className="mn-list-empty">
              <p className="mn-muted">No notes match these filters.</p>
              <button
                className="mn-btn mn-btn-ghost mn-btn-sm"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            </div>
          )}
          {filteredNotes.length === 0 && notes.length === 0 && !showNew && (
            <p className="mn-muted mn-list-empty-msg">
              No mix notes yet. Tap “+ New Note” to start.
            </p>
          )}
          {filteredNotes.map(n => (
            <NoteRow
              key={n.id}
              note={n}
              active={selectedId === n.id}
              onClick={() => setSelectedId(n.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="mn-main">
        {!selected && notes.length === 0 && (
          <div className="mn-empty">
            <div className="mn-empty-icon" aria-hidden="true">📝</div>
            <div className="mn-empty-title">No mix notes yet</div>
            <div className="mn-empty-sub">
              Capture mix decisions per song — EQ, compression, reverb, reference tracks
              and free-form notes — so you can dial it back in next time.
            </div>
            <button
              className="mn-btn mn-btn-accent mn-empty-cta"
              onClick={handleCreateFromEmpty}
            >
              + Create your first note
            </button>
          </div>
        )}

        {!selected && notes.length > 0 && (
          <div className="mn-empty">
            <div className="mn-empty-icon" aria-hidden="true">📝</div>
            <div className="mn-empty-title">No mix note selected</div>
            <div className="mn-empty-sub">
              Pick a note from the sidebar, or create a new one.
            </div>
          </div>
        )}

        {selected && (
          <div className="mn-detail">
            {/* ── Detail header ── */}
            <div className="mn-detail-head">
              <div className="mn-detail-head-info">
                <div className="mn-title-row">
                  <button
                    className={`mn-pin-btn${selected.pinned ? ' on' : ''}`}
                    onClick={handleTogglePinned}
                    title={selected.pinned ? 'Unpin' : 'Pin to top'}
                    aria-label={selected.pinned ? 'Unpin note' : 'Pin note'}
                  >
                    📌
                  </button>
                  <input
                    className="mn-title-inp"
                    placeholder="Note title"
                    value={selected.title}
                    onChange={e => updateSelected({ title: e.target.value })}
                  />
                </div>

                <div className="mn-detail-meta">
                  {/* Category chip (clickable to change) */}
                  <div className="mn-cat-wrap">
                    <button
                      type="button"
                      className={`mn-cat-chip mn-cat-${selected.category || 'other'} mn-cat-chip-btn`}
                      onClick={() => setShowCategoryMenu(v => !v)}
                      onBlur={() => setTimeout(() => setShowCategoryMenu(false), 150)}
                      title="Change category"
                    >
                      {categoryLabel(selected.category)} ▾
                    </button>
                    {showCategoryMenu && (
                      <div className="mn-cat-menu">
                        {CATEGORIES.map(c => (
                          <button
                            key={c.key}
                            type="button"
                            className={`mn-cat-menu-item mn-cat-${c.key}${
                              selected.category === c.key ? ' on' : ''
                            }`}
                            onMouseDown={e => {
                              e.preventDefault();
                              handleSetCategory(c.key);
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Song link chip */}
                  {!editingSongLink && selected.songTitle && (
                    <span
                      className="mn-chip mn-chip-song"
                      title="Click to change linked song"
                    >
                      ♪ {selected.songTitle}
                      <button
                        type="button"
                        className="mn-chip-edit"
                        onClick={() => {
                          setEditingSongLink(true);
                          setSongLinkQuery(selected.songTitle || '');
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="mn-chip-x"
                        onClick={handleClearSongLink}
                        title="Remove song link"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {!editingSongLink && !selected.songTitle && (
                    <button
                      type="button"
                      className="mn-chip mn-chip-link-cta"
                      onClick={() => {
                        setEditingSongLink(true);
                        setSongLinkQuery('');
                      }}
                    >
                      + Link a song
                    </button>
                  )}
                  {editingSongLink && (
                    <div className="mn-song-autocomplete mn-song-autocomplete-inline">
                      <input
                        className="mn-inp"
                        autoFocus
                        placeholder="Search songs…"
                        value={songLinkQuery}
                        onChange={e => setSongLinkQuery(e.target.value)}
                        onBlur={() => setTimeout(() => setEditingSongLink(false), 180)}
                      />
                      {songLinkMatches.length > 0 && (
                        <div className="mn-song-dropdown">
                          {songLinkMatches.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              className="mn-song-option"
                              onMouseDown={e => {
                                e.preventDefault();
                                handlePickSongLink(s);
                              }}
                            >
                              <span className="mn-song-option-title">{s.title}</span>
                              {s.artist && (
                                <span className="mn-song-option-artist">{s.artist}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <span className="mn-updated">
                    Updated {formatTimestamp(selected.updatedAt)}
                  </span>
                </div>

                <div className="mn-rating-row">
                  <span className="mn-rating-label">Rating</span>
                  <StarRating
                    value={selected.rating || 0}
                    onChange={(v) => updateSelected({ rating: v })}
                    size="lg"
                  />
                </div>
              </div>

              <div className="mn-detail-actions">
                <button
                  className="mn-btn mn-btn-ghost"
                  onClick={handleDuplicate}
                  title="Duplicate this note as a new entry"
                >
                  Duplicate
                </button>
                <button
                  className={`mn-btn${armedDelete ? ' mn-btn-danger-armed' : ' mn-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete note'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* ── Detail body ── */}
            <div className="mn-form">
              {/* Tags */}
              <div className="mn-field">
                <span className="mn-label">Tags</span>
                <div className="mn-chip-input">
                  <div className="mn-chip-list">
                    {(selected.tags || []).map((tag, i) => (
                      <span key={i} className="mn-tag-chip">
                        {tag}
                        <button
                          type="button"
                          className="mn-tag-chip-x"
                          onClick={() => handleRemoveTag(tag)}
                          title="Remove tag"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="mn-chip-inp"
                      placeholder={
                        (selected.tags || []).length === 0
                          ? 'Type a tag and press Enter…'
                          : 'Add another tag…'
                      }
                      value={tagDraft}
                      onChange={e => setTagDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        } else if (
                          e.key === 'Backspace' &&
                          tagDraft === '' &&
                          (selected.tags || []).length > 0
                        ) {
                          e.preventDefault();
                          const last = selected.tags[selected.tags.length - 1];
                          handleRemoveTag(last);
                        }
                      }}
                      onBlur={handleAddTag}
                    />
                  </div>
                </div>
                <span className="mn-hint">
                  Press Enter to add. Tags like “live”, “bass-heavy”, “warm” help you find this later.
                </span>
              </div>

              {/* Section blocks */}
              <div className="mn-sections">
                {SECTION_BLOCKS.map(block => (
                  <SectionBlock
                    key={block.key}
                    block={block}
                    value={(selected.sections || {})[block.key] || ''}
                    expanded={!!expandedSecs[block.key]}
                    onToggle={() => handleToggleSection(block.key)}
                    onChange={(v) => updateSection(block.key, v)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
