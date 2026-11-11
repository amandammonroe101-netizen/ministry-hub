import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import WorshipShell from '../worship/WorshipShell';
import './ChordCharts.css';

/* ─────────────────────────────────────────────────────────────
   ChordCharts — print-friendly chord chart viewer & packet builder
   Naming: .ch-*
   ───────────────────────────────────────────────────────────── */

/* ── localStorage keys ─────────────────────────────────────── */
const LS_PACKET_KEY = 'band:packet-current';

/* ── Chord parsing & transposition ─────────────────────────── */
const CHROMATIC   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONIC  = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };
const CHORD_TOKEN = /^([A-G][#b]?)(.*)$/;     // root + suffix (e.g. maj7, m, sus4, m7b5)
const CHORD_REGEX = /\[([^\]]+)\]/g;          // [Chord] markers in section content

const normalizeRoot = (r) => ENHARMONIC[r] || r;

/**
 * transposeChord — bumps a single chord token by N semitones.
 * Handles slash chords ("D/F#"), extensions ("Cmaj7"), modifiers ("F#sus4"),
 * and wraps modulo 12. Returns the original input if unparseable.
 */
function transposeChord(chord, semitones) {
  if (!chord || typeof chord !== 'string') return chord;
  const trimmed = chord.trim();
  if (!trimmed) return chord;
  // N.C. / "no chord" markers pass through untouched.
  if (/^(N\.?C\.?|n\.?c\.?)$/.test(trimmed)) return chord;

  // Slash chord — transpose both halves.
  if (trimmed.includes('/')) {
    const [a, b] = trimmed.split('/');
    return `${transposeChord(a, semitones)}/${transposeChord(b, semitones)}`;
  }

  const match = trimmed.match(CHORD_TOKEN);
  if (!match) return chord;
  const root = normalizeRoot(match[1]);
  const suffix = match[2] || '';
  const idx = CHROMATIC.indexOf(root);
  if (idx < 0) return chord;
  // (+ 12 * 100) prevents negative modulo wraps for negative semitones.
  const newRoot = CHROMATIC[(idx + semitones + 12 * 100) % 12];
  return newRoot + suffix;
}

/** transposeLine — rewrites every [Chord] inside a line by N semitones. */
function transposeLine(line, semitones) {
  if (!semitones) return line;
  return (line || '').replace(CHORD_REGEX, (_, chord) => `[${transposeChord(chord, semitones)}]`);
}

/**
 * keyDiff — returns semitone delta from `fromKey` to `toKey`.
 * Used to compute the absolute transpose offset for the song's current key.
 */
function keyDiff(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  const a = CHROMATIC.indexOf(normalizeRoot(fromKey.match(/^([A-G][#b]?)/)?.[1] || fromKey));
  const b = CHROMATIC.indexOf(normalizeRoot(toKey.match(/^([A-G][#b]?)/)?.[1] || toKey));
  if (a < 0 || b < 0) return 0;
  return (b - a + 12) % 12;
}

/* ── Chord/lyric line parser (same format as Songs/LyricsDisplay) ── */
function parseChordLine(text) {
  if (!text || text.trim() === '') return [{ chord: null, lyric: '' }];
  const segments = [];
  const parts = text.split(/(\[[^\]]+\])/);
  let pendingChord = null;
  let buffer = '';
  for (const part of parts) {
    const chordMatch = part.match(/^\[([^\]]+)\]$/);
    if (chordMatch) {
      if (buffer !== '' || pendingChord !== null) {
        segments.push({ chord: pendingChord, lyric: buffer });
        buffer = '';
      }
      pendingChord = chordMatch[1];
    } else {
      buffer += part;
    }
  }
  segments.push({ chord: pendingChord, lyric: buffer });
  if (segments.length > 1 && segments[0].chord === null && segments[0].lyric === '') {
    segments.shift();
  }
  return segments.length > 0 ? segments : [{ chord: null, lyric: text }];
}

/* ── ChordLine renderer — two-row, chord-above-syllable ────── */
function ChordLine({ line, semitones }) {
  const segments = parseChordLine(line);
  const hasAnyChord = segments.some(s => s.chord !== null);
  return (
    <div className="ch-line">
      {segments.map((seg, i) => (
        <span key={i} className="ch-block">
          {hasAnyChord && (
            seg.chord ? (
              <span className="ch-chord">{transposeChord(seg.chord, semitones)}</span>
            ) : (
              <span className="ch-chord ch-chord-spacer">&nbsp;</span>
            )
          )}
          {seg.lyric !== '' && <span className="ch-lyric">{seg.lyric}</span>}
        </span>
      ))}
    </div>
  );
}

/* ── Section renderer ──────────────────────────────────────── */
function SectionView({ section, semitones, fontSize }) {
  const content = section?.content || '';
  const lines = content.split('\n');
  const label = (section?.label || section?.section_type || 'section').toUpperCase();
  return (
    <div className="ch-section" style={{ fontSize: `${fontSize}px` }}>
      <div className="ch-section-label">{label}</div>
      <div className="ch-section-body">
        {lines.map((line, i) => (
          <ChordLine key={i} line={line} semitones={semitones} />
        ))}
      </div>
    </div>
  );
}

/* ── Sort helpers ──────────────────────────────────────────── */
const SORTS = [
  { key: 'title',  label: 'Title A–Z' },
  { key: 'recent', label: 'Recently added' },
  { key: 'key',    label: 'Key' },
];

function sortSongs(list, mode) {
  const copy = [...list];
  if (mode === 'title') {
    copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (mode === 'recent') {
    copy.sort((a, b) => {
      const at = new Date(a.created_at || a.updated_at || 0).getTime();
      const bt = new Date(b.created_at || b.updated_at || 0).getTime();
      return bt - at;
    });
  } else if (mode === 'key') {
    copy.sort((a, b) => (a.song_key || '').localeCompare(b.song_key || ''));
  }
  return copy;
}

/* ── Main component ────────────────────────────────────────── */
export default function ChordCharts() {
  /* ── List state ────────────────────────────── */
  /* Live-synced via Firestore. */
  const [allSongs, setAllSongs]   = useUserStoreKey('songs', []);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [sortMode, setSortMode]   = useState('title');

  /* ── Current song state ────────────────────── */
  const [currentSong, setCurrentSong] = useState(null); // full song with sections
  const [loadingSong, setLoadingSong] = useState(false);

  /* ── Viewer settings ───────────────────────── */
  const [semitones, setSemitones] = useState(0);  // applied to ALL chords in current song
  const [capo, setCapo]           = useState(0);
  const [fontSize, setFontSize]   = useState(18);

  /* ── Packet (multi-song printable bundle) ──── */
  const [packet, setPacket] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_PACKET_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [packetMode, setPacketMode]         = useState(false); // viewing packet preview
  const [packetSongs, setPacketSongs]       = useState([]);    // full songs for the packet
  const [loadingPacket, setLoadingPacket]   = useState(false);

  /* ── Drag-to-reorder for packet ────────────── */
  const dragIdx     = useRef(null);
  const dragOverIdx = useRef(null);

  /* ── Persist packet to localStorage ────────── */
  useEffect(() => {
    try {
      localStorage.setItem(LS_PACKET_KEY, JSON.stringify(packet));
    } catch {
      /* quota or storage disabled — silently continue */
    }
  }, [packet]);

  /* (Songs are live-synced via useUserStoreKey above — no fetch needed.) */

  /* ── Filtered + sorted list ────────────────── */
  const visibleSongs = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = !q
      ? allSongs
      : allSongs.filter(s =>
          (s.title || '').toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q));
    return sortSongs(filtered, sortMode);
  }, [allSongs, search, sortMode]);

  /* ── Load a single song (with sections) ────── */
  const loadSong = useCallback(async (id) => {
    setLoadingSong(true);
    try {
      const res = await songService.getOne(id);
      const song = res.data.data || res.data;
      if (song?.sections) {
        song.sections = [...song.sections].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }
      setCurrentSong(song);
      setSemitones(0);
      setCapo(0);
    } catch (err) {
      console.error('Failed to load song', err);
      setError('Could not load that song.');
    } finally {
      setLoadingSong(false);
    }
  }, []);

  function handleSongClick(song) {
    setPacketMode(false);
    loadSong(song.id);
  }

  /* ── Transposition controls ────────────────── */
  const bumpSemitone = (delta) => {
    setSemitones(prev => ((prev + delta) % 12 + 12) % 12);
  };

  /* ── Derived: displayed key ────────────────── */
  const originalKey  = currentSong?.song_key || '';
  const displayedKey = useMemo(() => {
    if (!originalKey) return '';
    return transposeChord(originalKey, semitones);
  }, [originalKey, semitones]);

  /* ── Packet actions ────────────────────────── */
  const inPacket = useMemo(
    () => !!currentSong && packet.some(p => p.id === currentSong.id),
    [packet, currentSong]);

  function addCurrentToPacket() {
    if (!currentSong) return;
    if (packet.some(p => p.id === currentSong.id)) return;
    setPacket(prev => [...prev, {
      id: currentSong.id,
      title: currentSong.title,
      song_key: currentSong.song_key,
    }]);
  }

  function removeFromPacket(id) {
    setPacket(prev => prev.filter(p => p.id !== id));
  }

  function togglePacket() {
    if (!currentSong) return;
    if (inPacket) removeFromPacket(currentSong.id);
    else addCurrentToPacket();
  }

  function clearPacket() {
    if (packet.length === 0) return;
    if (window.confirm('Clear the current packet?')) {
      setPacket([]);
      setPacketMode(false);
    }
  }

  /* ── Drag handlers (packet reorder) ────────── */
  function handleDragStart(idx) {
    dragIdx.current = idx;
  }
  function handleDragOver(e, idx) {
    e.preventDefault();
    dragOverIdx.current = idx;
  }
  function handleDrop() {
    const from = dragIdx.current;
    const to   = dragOverIdx.current;
    dragIdx.current     = null;
    dragOverIdx.current = null;
    if (from === null || to === null || from === to) return;
    setPacket(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  /* ── Generate packet (loads full sections for every song) ── */
  async function generatePacket() {
    if (packet.length === 0) return;
    setLoadingPacket(true);
    try {
      const loaded = await Promise.all(packet.map(p => songService.getOne(p.id)));
      const songs = loaded.map(r => {
        const s = r.data.data || r.data;
        if (s?.sections) {
          s.sections = [...s.sections].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }
        return s;
      });
      setPacketSongs(songs);
      setPacketMode(true);
    } catch (err) {
      console.error('Packet generation failed', err);
      setError('Could not build the packet. Please try again.');
    } finally {
      setLoadingPacket(false);
    }
  }

  /* ── Print handlers ────────────────────────── */
  function handlePrint() {
    window.print();
  }

  /* ── Render: empty library state ───────────── */
  const libraryEmpty = !loading && allSongs.length === 0;

  /* ── Render ────────────────────────────────── */
  return (
    <WorshipShell title="Chord Charts" icon="📄" subtitle="Chord charts for the band, organized per song.">
    <div className={`ch-root ${packetMode ? 'is-packet-mode' : ''}`}>
      {/* Background orbs — hidden in print */}
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Left sidebar ───────────────────── */}
      <aside className="ch-sidebar">
        <div className="ch-sidebar-head">
          <h2 className="ch-sidebar-title">Songs</h2>
          <div className="ch-sidebar-sub">{visibleSongs.length} in library</div>
        </div>

        <div className="ch-search-wrap">
          <input
            type="text"
            className="ch-search"
            placeholder="Search title or artist…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="ch-sort-wrap">
          <label className="ch-sort-label">Sort</label>
          <select
            className="ch-sort"
            value={sortMode}
            onChange={e => setSortMode(e.target.value)}
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="ch-song-list">
          {loading && <div className="ch-list-msg">Loading…</div>}
          {error && !loading && <div className="ch-list-err">{error}</div>}
          {libraryEmpty && (
            <div className="ch-empty-lib">
              <div className="ch-empty-lib-icon">🎵</div>
              <div className="ch-empty-lib-text">No songs yet.</div>
              <a href="/worship/songs/all" className="ch-empty-lib-cta">Go to Songs →</a>
            </div>
          )}
          {!loading && !libraryEmpty && visibleSongs.length === 0 && (
            <div className="ch-list-msg">No matches.</div>
          )}
          {visibleSongs.map(song => {
            const isActive = currentSong?.id === song.id && !packetMode;
            return (
              <button
                key={song.id}
                className={`ch-song-row ${isActive ? 'active' : ''}`}
                onClick={() => handleSongClick(song)}
              >
                <div className="ch-song-row-main">
                  <div className="ch-song-row-title">{song.title || 'Untitled'}</div>
                  {song.artist && (
                    <div className="ch-song-row-artist">{song.artist}</div>
                  )}
                </div>
                <div className="ch-song-row-chips">
                  {song.song_key && <span className="ch-chip ch-chip-key">{song.song_key}</span>}
                  {song.tempo && <span className="ch-chip ch-chip-tempo">{song.tempo}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Packet builder ─────────────── */}
        <div className="ch-packet">
          <div className="ch-packet-head">
            <span className="ch-packet-title">📋 Packet</span>
            <span className="ch-packet-count">{packet.length}</span>
          </div>

          {packet.length === 0 ? (
            <div className="ch-packet-empty">
              Add songs from the viewer to build a packet.
            </div>
          ) : (
            <div className="ch-packet-list" onDrop={handleDrop}>
              {packet.map((p, idx) => (
                <div
                  key={p.id}
                  className="ch-packet-row"
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDrop}
                >
                  <span className="ch-packet-grip" aria-hidden="true">⋮⋮</span>
                  <span className="ch-packet-row-title" title={p.title}>
                    {p.title || 'Untitled'}
                  </span>
                  {p.song_key && (
                    <span className="ch-packet-row-key">{p.song_key}</span>
                  )}
                  <button
                    className="ch-packet-x"
                    onClick={() => removeFromPacket(p.id)}
                    aria-label="Remove from packet"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ch-packet-actions">
            <button
              className="ch-btn ch-btn-primary"
              onClick={generatePacket}
              disabled={packet.length === 0 || loadingPacket}
            >
              {loadingPacket ? 'Building…' : '▶ Generate Packet'}
            </button>
            <button
              className="ch-btn ch-btn-ghost"
              onClick={clearPacket}
              disabled={packet.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main viewer ────────────────────── */}
      <main className="ch-main">
        {/* ── Packet preview mode ─── */}
        {packetMode && (
          <PacketView
            songs={packetSongs}
            onExit={() => setPacketMode(false)}
            onPrint={handlePrint}
          />
        )}

        {/* ── Single song viewer ──── */}
        {!packetMode && (
          <>
            {!currentSong && !loadingSong && (
              <div className="ch-placeholder">
                <div className="ch-placeholder-icon">📄</div>
                <div className="ch-placeholder-title">Chord Chart Viewer</div>
                <div className="ch-placeholder-sub">
                  Pick a song from the sidebar to view a print-friendly chord chart.
                  Transpose on the fly, set a capo, and build a packet for your team.
                </div>
              </div>
            )}

            {loadingSong && (
              <div className="ch-placeholder">
                <div className="ch-placeholder-sub">Loading song…</div>
              </div>
            )}

            {currentSong && !loadingSong && (
              <article className="ch-chart">
                {/* Header */}
                <header className="ch-chart-head">
                  <div className="ch-chart-titles">
                    <h1 className="ch-chart-title">
                      {currentSong.title || 'Untitled'}
                    </h1>
                    {currentSong.artist && (
                      <div className="ch-chart-artist">{currentSong.artist}</div>
                    )}
                  </div>
                  <div className="ch-chart-meta">
                    {originalKey && (
                      <span className="ch-meta-pill ch-meta-key">
                        {semitones === 0
                          ? originalKey
                          : `${originalKey} → ${displayedKey}`}
                        {capo > 0 && ` (capo ${capo})`}
                      </span>
                    )}
                    {currentSong.tempo && (
                      <span className="ch-meta-pill">♩ {currentSong.tempo}</span>
                    )}
                    {currentSong.time_signature && (
                      <span className="ch-meta-pill">{currentSong.time_signature}</span>
                    )}
                  </div>
                </header>

                {/* Toolbar — hidden in print */}
                <div className="ch-toolbar">
                  <div className="ch-tool-group">
                    <span className="ch-tool-label">Transpose</span>
                    <button
                      className="ch-tool-btn"
                      onClick={() => bumpSemitone(-1)}
                      aria-label="Down a semitone"
                    >−1</button>
                    <span className="ch-tool-value">
                      {(() => {
                        // Display range is centered around 0: 7..11 become -5..-1
                        const n = semitones > 6 ? semitones - 12 : semitones;
                        if (n === 0) return '0';
                        return n > 0 ? `+${n}` : `${n}`;
                      })()}
                    </span>
                    <button
                      className="ch-tool-btn"
                      onClick={() => bumpSemitone(1)}
                      aria-label="Up a semitone"
                    >+1</button>
                  </div>

                  <div className="ch-tool-group">
                    <span className="ch-tool-label">Capo</span>
                    <select
                      className="ch-tool-select"
                      value={capo}
                      onChange={e => setCapo(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i} value={i}>{i === 0 ? 'None' : `Capo ${i}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ch-tool-group">
                    <span className="ch-tool-label">Size</span>
                    <input
                      type="range"
                      min={12}
                      max={32}
                      value={fontSize}
                      onChange={e => setFontSize(Number(e.target.value))}
                      className="ch-size-slider"
                    />
                    <span className="ch-tool-value">{fontSize}</span>
                  </div>

                  <div className="ch-tool-spacer" />

                  <button
                    className={`ch-btn ${inPacket ? 'ch-btn-checked' : 'ch-btn-secondary'}`}
                    onClick={togglePacket}
                  >
                    {inPacket ? '✓ In Packet' : '+ Add to Packet'}
                  </button>
                  <button
                    className="ch-btn ch-btn-primary"
                    onClick={handlePrint}
                  >
                    🖨 Print
                  </button>
                </div>

                {/* Chart body */}
                <div className="ch-chart-body">
                  {(!currentSong.sections || currentSong.sections.length === 0) && (
                    <div className="ch-empty-chart">
                      (no chord chart yet — open this song in <a href="/worship/songs/all">Songs</a> to add sections)
                    </div>
                  )}
                  {currentSong.sections?.map((sec, i) => (
                    <SectionView
                      key={sec.id ?? i}
                      section={sec}
                      semitones={semitones}
                      fontSize={fontSize}
                    />
                  ))}
                </div>
              </article>
            )}
          </>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}

/* ── Packet preview pane ───────────────────────────────────── */
function PacketView({ songs, onExit, onPrint }) {
  return (
    <div className="ch-packet-view">
      <div className="ch-packet-bar">
        <button className="ch-btn ch-btn-ghost" onClick={onExit}>
          ← Back to viewer
        </button>
        <div className="ch-packet-bar-title">
          Packet · {songs.length} song{songs.length === 1 ? '' : 's'}
        </div>
        <button className="ch-btn ch-btn-primary" onClick={onPrint}>
          🖨 Print Packet
        </button>
      </div>

      <div className="ch-packet-pages">
        {songs.map((song, idx) => (
          <article key={song.id} className="ch-packet-page">
            <header className="ch-chart-head ch-chart-head-print">
              <div className="ch-chart-titles">
                <h1 className="ch-chart-title">{song.title || 'Untitled'}</h1>
                {song.artist && (
                  <div className="ch-chart-artist">{song.artist}</div>
                )}
              </div>
              <div className="ch-chart-meta">
                {song.song_key && (
                  <span className="ch-meta-pill ch-meta-key">{song.song_key}</span>
                )}
                {song.tempo && <span className="ch-meta-pill">♩ {song.tempo}</span>}
                {song.time_signature && (
                  <span className="ch-meta-pill">{song.time_signature}</span>
                )}
              </div>
            </header>

            <div className="ch-chart-body">
              {(!song.sections || song.sections.length === 0) ? (
                <div className="ch-empty-chart">(no chord chart yet)</div>
              ) : (
                song.sections.map((sec, i) => (
                  <SectionView
                    key={sec.id ?? i}
                    section={sec}
                    semitones={0}
                    fontSize={16}
                  />
                ))
              )}
            </div>

            <div className="ch-packet-foot">
              Page {idx + 1} of {songs.length}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* Export the helpers for tests if they're ever wired in. */
export { transposeChord, transposeLine, parseChordLine, keyDiff };
