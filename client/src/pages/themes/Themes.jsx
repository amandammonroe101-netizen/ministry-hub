import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import WorshipShell from '../worship/WorshipShell';
import './Themes.css';

/* ─────────────────────────────────────────────────────────────
   Themes — organize songs by season / occasion
   Naming: .th-*
   Persistence: localStorage key "band:themes"
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'band:themes';

const DEFAULT_THEMES = [
  { name: 'Christmas',     icon: '🎄', description: 'Advent and Christmas season songs' },
  { name: 'Easter',        icon: '✝',  description: 'Resurrection Sunday and Holy Week' },
  { name: 'Communion',     icon: '🍞', description: "Songs for the Lord's Supper" },
  { name: 'Baptism',       icon: '💦', description: 'For baptism services' },
  { name: 'Outreach',      icon: '🌍', description: 'Songs for community outreach events' },
  { name: 'Christmas Eve', icon: '🕯', description: 'Candlelight service' },
  { name: 'Good Friday',   icon: '✟',  description: 'Reflection on the cross' },
  { name: 'Thanksgiving',  icon: '🦃', description: 'Gratitude and harvest' },
];

function makeId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadThemes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveThemes(themes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    /* ignore quota errors */
  }
}

function seedDefaults() {
  const now = Date.now();
  return DEFAULT_THEMES.map((t, i) => ({
    id: makeId(),
    name: t.name,
    description: t.description,
    icon: t.icon,
    songIds: [],
    isDefault: true,
    createdAt: now + i, // preserve seeded order
  }));
}

/* ─── Theme Card (sidebar) ───────────────────────────────────── */
function ThemeCard({ theme, songCount, active, onClick }) {
  return (
    <button
      className={`th-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="th-card-top">
        <span className="th-card-icon" aria-hidden="true">{theme.icon || '🏷'}</span>
        <span className="th-card-name">{theme.name || 'Untitled'}</span>
        {theme.isDefault && (
          <span className="th-card-default-badge" title="Seeded theme">default</span>
        )}
      </div>
      {theme.description && (
        <div className="th-card-desc">{theme.description}</div>
      )}
      <span className="th-card-count">
        {songCount} song{songCount !== 1 ? 's' : ''}
      </span>
    </button>
  );
}

/* ─── New Theme Form ─────────────────────────────────────────── */
function NewThemeForm({ onSave, onCancel }) {
  const [name, setName]         = useState('');
  const [icon, setIcon]         = useState('🏷');
  const [description, setDesc]  = useState('');
  const [error, setError]       = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    onSave({
      name: trimmed,
      icon: icon.trim() || '🏷',
      description: description.trim(),
    });
  }

  return (
    <form className="th-new-form" onSubmit={handleSubmit}>
      {error && <p className="th-error">{error}</p>}
      <div className="th-new-form-row">
        <input
          className="th-inp th-inp-icon"
          placeholder="🏷"
          value={icon}
          onChange={e => setIcon(e.target.value)}
          maxLength={4}
          aria-label="Emoji"
        />
        <input
          className="th-inp"
          placeholder="Theme name"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>
      <input
        className="th-inp"
        placeholder="Short description (optional)"
        value={description}
        onChange={e => setDesc(e.target.value)}
      />
      <div className="th-new-form-btns">
        <button type="submit" className="th-btn th-btn-accent">Create</button>
        <button type="button" className="th-btn th-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Song Picker Modal ──────────────────────────────────────── */
function SongPicker({ allSongs, themeSongIdSet, onToggle, onClose }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = allSongs.filter(s => {
    if (!q) return true;
    return (
      (s.title  || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="th-picker-overlay" onClick={onClose}>
      <div className="th-picker" onClick={e => e.stopPropagation()}>
        <div className="th-picker-head">
          <span>Add from Library</span>
          <button className="th-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="th-picker-search-wrap">
          <input
            className="th-picker-search"
            placeholder="Search by title or artist…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="th-picker-list">
          {filtered.length === 0 && (
            <div className="th-picker-empty th-muted">
              {query ? 'No songs match your search.' : 'No songs in your library.'}
            </div>
          )}
          {filtered.map(s => {
            const inTheme = themeSongIdSet.has(s.id);
            return (
              <button
                key={s.id}
                className={`th-picker-song${inTheme ? ' in-theme' : ''}`}
                onClick={() => onToggle(s.id)}
                title={inTheme ? 'Remove from theme' : 'Add to theme'}
              >
                <span className="th-picker-song-check" aria-hidden="true">
                  {inTheme ? '✓' : ''}
                </span>
                <div className="th-picker-song-info">
                  <span className="th-picker-song-title">{s.title || 'Untitled'}</span>
                  {s.artist && <span className="th-picker-song-artist">{s.artist}</span>}
                </div>
                <div className="th-picker-song-meta">
                  {s.song_key && <span className="th-song-key">{s.song_key}</span>}
                  {s.tempo    && <span className="th-song-tempo">{s.tempo} bpm</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="th-picker-foot">
          <button className="th-btn th-btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Themes() {
  /* ── Themes state (Firestore-backed, live-synced) ─────────── */
  const [rawThemes, setRawThemes] = useUserStoreKey('worship:themes', null);
  const themes = useMemo(() => {
    if (Array.isArray(rawThemes) && rawThemes.length > 0) return rawThemes;
    return seedDefaults();
  }, [rawThemes]);
  const setThemes = useCallback((next) => {
    if (typeof next === 'function') {
      setRawThemes((prev) => next(Array.isArray(prev) && prev.length > 0 ? prev : seedDefaults()));
    } else {
      setRawThemes(next);
    }
  }, [setRawThemes]);

  /* Seed Firestore on first visit so defaults persist instead of regenerating. */
  useEffect(() => {
    if (rawThemes === null) setRawThemes(seedDefaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawThemes === null]);

  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew]       = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  /* ── Song library — live-synced from Songs page ──────────── */
  const [allSongs, setAllSongs]         = useUserStoreKey('songs', []);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError]     = useState('');

  const armTimerRef = useRef(null);

  /* Songs are live-synced via useUserStoreKey above — no fetch needed. */

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* Reset armed-delete on selection change */
  useEffect(() => {
    setArmedDelete(false);
    setShowPicker(false);
  }, [selectedId]);

  /* ─── Lookups ──────────────────────────────────────────────── */
  const songsById = useMemo(() => {
    const map = new Map();
    for (const s of allSongs) map.set(s.id, s);
    return map;
  }, [allSongs]);

  /* Sort: defaults first (by createdAt), then custom by createdAt asc */
  const sortedThemes = useMemo(() => {
    return [...themes].sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }, [themes]);

  const selected = useMemo(
    () => themes.find(t => t.id === selectedId) || null,
    [themes, selectedId]
  );

  /* Resolved (filtered) songs for the selected theme */
  const selectedSongs = useMemo(() => {
    if (!selected) return [];
    return (selected.songIds || [])
      .map(id => songsById.get(id))
      .filter(Boolean);
  }, [selected, songsById]);

  /* Sidebar count uses live filtering against song library too */
  function countForTheme(theme) {
    if (!theme) return 0;
    const ids = theme.songIds || [];
    if (allSongs.length === 0) return ids.length;
    let n = 0;
    for (const id of ids) if (songsById.has(id)) n++;
    return n;
  }

  const themeSongIdSet = useMemo(
    () => new Set(selectedSongs.map(s => s.id)),
    [selectedSongs]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setThemes(prev => prev.map(t => (t.id === selectedId ? { ...t, ...patch } : t)));
  }, [selectedId]);

  const handleCreateTheme = useCallback((data) => {
    const t = {
      id: makeId(),
      name: data.name,
      icon: data.icon,
      description: data.description,
      songIds: [],
      isDefault: false,
      createdAt: Date.now(),
    };
    setThemes(prev => [...prev, t]);
    setShowNew(false);
    setSelectedId(t.id);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setThemes(prev => prev.filter(t => t.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleToggleSong = useCallback((songId) => {
    if (!selectedId) return;
    setThemes(prev => prev.map(t => {
      if (t.id !== selectedId) return t;
      const ids = t.songIds || [];
      const next = ids.includes(songId)
        ? ids.filter(x => x !== songId)
        : [...ids, songId];
      return { ...t, songIds: next };
    }));
  }, [selectedId]);

  const handleRemoveSongFromTheme = useCallback((songId) => {
    if (!selectedId) return;
    setThemes(prev => prev.map(t => {
      if (t.id !== selectedId) return t;
      return { ...t, songIds: (t.songIds || []).filter(x => x !== songId) };
    }));
  }, [selectedId]);

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <WorshipShell title="Themes" icon="🏷" subtitle="Organize songs by theme or topic for service planning.">
    <div className="th-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="th-sidebar">
        <div className="th-sidebar-head">
          <span className="th-sidebar-title">Themes</span>
          {!showNew && (
            <button
              className="th-new-btn"
              onClick={() => setShowNew(true)}
              title="Create new theme"
            >
              + New Theme
            </button>
          )}
        </div>

        {showNew && (
          <NewThemeForm
            onSave={handleCreateTheme}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="th-list">
          {sortedThemes.length === 0 && (
            <p className="th-muted th-list-empty">No themes yet.</p>
          )}
          {sortedThemes.map(t => (
            <ThemeCard
              key={t.id}
              theme={t}
              songCount={countForTheme(t)}
              active={selectedId === t.id}
              onClick={() => setSelectedId(t.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="th-main">
        {!selected && (
          <div className="th-empty">
            <div className="th-empty-icon" aria-hidden="true">🏷</div>
            <div className="th-empty-title">No theme selected</div>
            <div className="th-empty-sub">
              Pick a theme from the sidebar to view its songs, or create a new one
              to organize your library by season or occasion.
            </div>
          </div>
        )}

        {selected && (
          <div className="th-detail">
            {/* Detail header */}
            <div className="th-detail-head">
              <div className="th-detail-head-left">
                <div className="th-detail-icon-wrap">
                  <input
                    className="th-detail-icon-inp"
                    value={selected.icon || ''}
                    onChange={e => updateSelected({ icon: e.target.value })}
                    maxLength={4}
                    aria-label="Theme emoji"
                    title="Edit emoji"
                  />
                </div>
                <div className="th-detail-head-info">
                  <input
                    className="th-name-inp"
                    placeholder="Theme name"
                    value={selected.name || ''}
                    onChange={e => updateSelected({ name: e.target.value })}
                  />
                  <input
                    className="th-desc-inp"
                    placeholder="Add a description…"
                    value={selected.description || ''}
                    onChange={e => updateSelected({ description: e.target.value })}
                  />
                  <div className="th-detail-meta">
                    <span className="th-chip th-chip-count">
                      {selectedSongs.length} song{selectedSongs.length !== 1 ? 's' : ''}
                    </span>
                    {selected.isDefault && (
                      <span className="th-chip th-chip-default">default</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="th-detail-actions">
                <button
                  className="th-btn th-btn-accent"
                  onClick={() => setShowPicker(true)}
                  disabled={songsError || (allSongs.length === 0 && !songsLoading)}
                  title={
                    songsError
                      ? 'Song library failed to load'
                      : allSongs.length === 0 && !songsLoading
                        ? 'Add songs to your library first'
                        : 'Add songs to this theme'
                  }
                >
                  + Add Songs
                </button>
                <button
                  className={`th-btn${armedDelete ? ' th-btn-danger-armed' : ' th-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete theme'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Songs grid / empty state */}
            <div className="th-songs">
              {songsLoading && (
                <div className="th-songs-empty">
                  <p className="th-muted">Loading song library…</p>
                </div>
              )}

              {!songsLoading && songsError && (
                <div className="th-songs-empty">
                  <div className="th-songs-empty-icon">⚠</div>
                  <div className="th-songs-empty-title">Couldn't load your library</div>
                  <div className="th-songs-empty-sub">
                    {songsError} You can still rename or delete this theme.
                  </div>
                </div>
              )}

              {!songsLoading && !songsError && allSongs.length === 0 && (
                <div className="th-songs-empty">
                  <div className="th-songs-empty-icon">♫</div>
                  <div className="th-songs-empty-title">No songs in your library</div>
                  <div className="th-songs-empty-sub">
                    Add songs to your library first, then come back to organize them
                    into themes.
                  </div>
                  <a href="/worship/songs/all" className="th-btn th-btn-accent th-songs-empty-cta">
                    Go to Songs
                  </a>
                </div>
              )}

              {!songsLoading && !songsError && allSongs.length > 0 && selectedSongs.length === 0 && (
                <div className="th-songs-empty">
                  <div className="th-songs-empty-icon">♬</div>
                  <div className="th-songs-empty-title">No songs in this theme yet</div>
                  <div className="th-songs-empty-sub">
                    Add songs from your library to build out this theme.
                  </div>
                  <button
                    className="th-btn th-btn-accent th-songs-empty-cta"
                    onClick={() => setShowPicker(true)}
                  >
                    + Add Songs
                  </button>
                </div>
              )}

              {!songsLoading && !songsError && selectedSongs.length > 0 && (
                <div className="th-songs-grid">
                  {selectedSongs.map(song => (
                    <div key={song.id} className="th-song-card">
                      <button
                        className="th-song-remove"
                        title="Remove from theme"
                        onClick={() => handleRemoveSongFromTheme(song.id)}
                      >
                        ✕
                      </button>
                      <div className="th-song-title">{song.title || 'Untitled'}</div>
                      {song.artist && (
                        <div className="th-song-artist">{song.artist}</div>
                      )}
                      <div className="th-song-meta">
                        {song.song_key && (
                          <span className="th-song-key">{song.song_key}</span>
                        )}
                        {song.tempo && (
                          <span className="th-song-tempo">{song.tempo} bpm</span>
                        )}
                        {song.time_signature && (
                          <span className="th-song-sig">{song.time_signature}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Song picker modal ── */}
      {showPicker && selected && (
        <SongPicker
          allSongs={allSongs}
          themeSongIdSet={themeSongIdSet}
          onToggle={handleToggleSong}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
    </WorshipShell>
  );
}
