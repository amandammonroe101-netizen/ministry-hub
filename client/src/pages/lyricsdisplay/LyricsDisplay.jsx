import { useState, useEffect, useCallback, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { songService } from '../../services/songService';
import { setlistService } from '../../services/setlistService';
import { useUserStoreKey } from '../../lib/userStore';
import './LyricsDisplay.css';

/* ─────────────────────────────────────────────────────────────
   LyricsDisplay — full-screen lyric / chord teleprompter
   Naming: .ld-*
   ───────────────────────────────────────────────────────────── */

/* ── Background themes ─────────────────────────────────────────── */
const BACKGROUNDS = {
  dark:   { bg: '#07070a', text: '#f0f0f5',  chord: '#06b6d4' },
  black:  { bg: '#000000', text: '#ffffff',   chord: '#14b8a6' },
  light:  { bg: '#f8f8f0', text: '#0a0a0f',  chord: '#1d4ed8' },
  blue:   { bg: '#0a0f2e', text: '#e8eeff',  chord: '#60a5fa' },
  purple: { bg: '#130920', text: '#f5e8ff',  chord: '#c084fc' },
};

const BG_SWATCH_COLORS = {
  dark:   '#18181b',
  black:  '#000000',
  light:  '#f8f8f0',
  blue:   '#0a0f2e',
  purple: '#130920',
};

/* ── Chord line parser ─────────────────────────────────────────── */
/**
 * parseChordLine(text)
 * Parses a line of the form "[C]Amazing [G]grace how" and returns:
 *   [{ chord: 'C', lyric: 'Amazing ' }, { chord: 'G', lyric: 'grace how' }]
 *
 * Segments with no leading chord get chord: null.
 */
function parseChordLine(text) {
  if (!text || text.trim() === '') return [{ chord: null, lyric: '' }];

  const segments = [];
  // Split on [Chord] markers, keeping the markers
  const parts = text.split(/(\[[^\]]+\])/);

  let pendingChord = null;
  let buffer = '';

  for (const part of parts) {
    const chordMatch = part.match(/^\[([^\]]+)\]$/);
    if (chordMatch) {
      // Flush any buffered lyric text under the previous chord
      if (buffer !== '' || pendingChord !== null) {
        segments.push({ chord: pendingChord, lyric: buffer });
        buffer = '';
      }
      pendingChord = chordMatch[1];
    } else {
      buffer += part;
    }
  }
  // Flush remainder
  segments.push({ chord: pendingChord, lyric: buffer });

  // If the very first segment has no chord and no lyric (empty prefix before
  // the first [Chord] marker), drop it.
  if (segments.length > 1 && segments[0].chord === null && segments[0].lyric === '') {
    segments.shift();
  }

  return segments.length > 0 ? segments : [{ chord: null, lyric: text }];
}

/* ── ChordLine renderer ────────────────────────────────────────── */
function ChordLine({ line, showChords, chordColor }) {
  const segments = parseChordLine(line);
  const hasAnyChord = segments.some(s => s.chord !== null);

  return (
    <div className="ld-line">
      {segments.map((seg, i) => (
        <span key={i} className="ld-chord-block">
          {/* Chord row — always render to keep height consistent */}
          {showChords && hasAnyChord ? (
            seg.chord ? (
              <span className="ld-chord" style={{ color: chordColor }}>
                {seg.chord}
              </span>
            ) : (
              /* Invisible spacer so lyric rows stay vertically aligned */
              <span className="ld-chord-spacer">{' '}</span>
            )
          ) : null}
          {/* Lyric row */}
          {seg.lyric !== '' && (
            <span className="ld-lyric">{seg.lyric}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ── Section content renderer ──────────────────────────────────── */
function SectionContent({ content, showChords, chordColor, fontSize }) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div
      className="ld-content"
      style={{ '--ld-font-size': `${fontSize}px`, fontSize: `${fontSize}px` }}
    >
      {lines.map((line, i) => (
        <ChordLine
          key={i}
          line={line}
          showChords={showChords}
          chordColor={chordColor}
        />
      ))}
    </div>
  );
}

/* ── Toggle component ──────────────────────────────────────────── */
function Toggle({ on, onChange, label }) {
  return (
    <label className="ld-chord-toggle" onClick={() => onChange(!on)}>
      <span className={`ld-toggle-track ${on ? 'on' : ''}`}>
        <span className="ld-toggle-thumb" />
      </span>
      <span className="ld-toggle-label">{label}</span>
    </label>
  );
}

/* ── localStorage keys ─────────────────────────────────────────── */
const LS_BG_IMAGE_KEY = 'lyrics:bg-image';

/* ── Main component ────────────────────────────────────────────── */
export default function LyricsDisplay() {
  /* ── Panel state ─────────────────────────────── */
  const [panelTab, setPanelTab] = useState('songs'); // 'songs' | 'setlists'
  const [searchQuery, setSearchQuery] = useState('');

  /* ── Data — live-synced via Firestore ──────── */
  const [allSongs, setAllSongs]         = useUserStoreKey('songs',    []);
  const [setlistsRaw]                   = useUserStoreKey('setlists', []);
  const [allSetlists, setAllSetlists]   = useState([]);
  const [loadingList, setLoadingList]   = useState(false);

  /* ── Current song ────────────────────────────── */
  const [currentSong, setCurrentSong]   = useState(null); // full song with sections
  const [loadingSong, setLoadingSong]   = useState(false);
  const [sectionIdx, setSectionIdx]     = useState(0);

  /* ── Queue (setlist mode) ────────────────────── */
  const [queue, setQueue]       = useState([]); // [{ id, title, song_key }]
  const [queueIdx, setQueueIdx] = useState(0);
  const [activeSetlistId, setActiveSetlistId] = useState(null);

  /* ── Display settings ────────────────────────── */
  const [fontSize, setFontSize]       = useState(36);
  const [showChords, setShowChords]   = useState(true);
  const [bgKey, setBgKey]             = useState('dark');

  /* ── Custom background image (Feature 1) ─────── */
  const [bgImage, setBgImage] = useState(() => {
    try {
      return localStorage.getItem(LS_BG_IMAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [bgImageError, setBgImageError] = useState('');
  const fileInputRef = useRef(null);

  /* ── Performance / fullscreen state (Feature 2) ─ */
  const [performanceMode, setPerformanceMode] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const [cursorIdle, setCursorIdle] = useState(false);
  const stageRef = useRef(null);
  const exitHintTimer = useRef(null);
  const cursorIdleTimer = useRef(null);

  /* ── Fade transition ─────────────────────────── */
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef(null);

  const theme = BACKGROUNDS[bgKey];

  /* Songs live-sync via useUserStoreKey above. Setlists need hydration
     (embed full song objects), so we re-hydrate via the service whenever
     either underlying doc changes. */
  useEffect(() => {
    let alive = true;
    setLoadingList(true);
    setlistService.getAll()
      .then(res => { if (alive) setAllSetlists(res.data.data || res.data || []); })
      .catch(console.error)
      .finally(() => { if (alive) setLoadingList(false); });
    return () => { alive = false; };
  }, [setlistsRaw, allSongs]);

  /* ── Load a single song by id ────────────────── */
  const loadSong = useCallback(async (id) => {
    setLoadingSong(true);
    try {
      const res = await songService.getOne(id);
      const song = res.data.data || res.data;
      // Ensure sections are sorted
      if (song.sections) {
        song.sections = [...song.sections].sort((a, b) => a.sort_order - b.sort_order);
      }
      setCurrentSong(song);
      setSectionIdx(0);
    } catch (err) {
      console.error('Failed to load song', err);
    } finally {
      setLoadingSong(false);
    }
  }, []);

  /* ── Section helpers ─────────────────────────── */
  const sections = currentSong?.sections || [];
  const totalSections = sections.length;
  const currentSection = sections[sectionIdx] || null;

  /* ── Transition helper ───────────────────────── */
  const transitionTo = useCallback((fn) => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setFading(true);
    fadeTimer.current = setTimeout(() => {
      fn();
      setFading(false);
    }, 160);
  }, []);

  /* ── Navigation ──────────────────────────────── */
  const goPrevSection = useCallback(() => {
    if (sectionIdx > 0) {
      transitionTo(() => setSectionIdx(i => i - 1));
    }
  }, [sectionIdx, transitionTo]);

  const goNextSection = useCallback(() => {
    if (sectionIdx < totalSections - 1) {
      transitionTo(() => setSectionIdx(i => i + 1));
    }
  }, [sectionIdx, totalSections, transitionTo]);

  const goPrevSong = useCallback(() => {
    if (queue.length > 0 && queueIdx > 0) {
      const nextIdx = queueIdx - 1;
      setQueueIdx(nextIdx);
      loadSong(queue[nextIdx].id);
    }
  }, [queue, queueIdx, loadSong]);

  const goNextSong = useCallback(() => {
    if (queue.length > 0 && queueIdx < queue.length - 1) {
      const nextIdx = queueIdx + 1;
      setQueueIdx(nextIdx);
      loadSong(queue[nextIdx].id);
    }
  }, [queue, queueIdx, loadSong]);

  /* ── Keyboard handler ────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      // Ignore when focus is in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          goNextSection();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrevSection();
          break;
        case ' ':
          e.preventDefault();
          goNextSection();
          break;
        case 'ArrowDown':
          e.preventDefault();
          goNextSong();
          break;
        case 'ArrowUp':
          e.preventDefault();
          goPrevSong();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNextSection, goPrevSection, goNextSong, goPrevSong]);

  /* ── Click handlers ──────────────────────────── */
  function handleSongClick(song) {
    setQueue([]);
    setActiveSetlistId(null);
    loadSong(song.id);
  }

  function handleSetlistClick(setlist) {
    if (!setlist.songs || setlist.songs.length === 0) return;
    setActiveSetlistId(setlist.id);
    const songs = setlist.songs;
    setQueue(songs);
    setQueueIdx(0);
    loadSong(songs[0].id);
  }

  function handleQueueSongClick(song, idx) {
    setQueueIdx(idx);
    loadSong(song.id);
  }

  function handleSectionClick(idx) {
    transitionTo(() => setSectionIdx(idx));
  }

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  }

  /* ── Background image handlers (Feature 1) ───── */
  function handleBgImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgImageError('');

    // Size guard — warn if larger than ~5 MB (localStorage caps ~5–10 MB)
    if (file.size > 5 * 1024 * 1024) {
      setBgImageError('Image is larger than 5 MB and may not persist.');
    }

    if (!file.type.startsWith('image/')) {
      setBgImageError('Please pick an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== 'string') return;
      setBgImage(dataUrl);
      try {
        localStorage.setItem(LS_BG_IMAGE_KEY, dataUrl);
      } catch (err) {
        // Quota exceeded or storage unavailable — keep image in memory but warn
        console.warn('Could not persist bg image to localStorage', err);
        setBgImageError('Image too large to persist between reloads.');
      }
    };
    reader.onerror = () => setBgImageError('Could not read image file.');
    reader.readAsDataURL(file);

    // Reset the input so re-uploading the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClearBgImage() {
    setBgImage(null);
    setBgImageError('');
    try {
      localStorage.removeItem(LS_BG_IMAGE_KEY);
    } catch {
      /* no-op */
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /* ── Performance / fullscreen mode (Feature 2) ── */
  const enterPerformanceMode = useCallback(() => {
    setPerformanceMode(true);
    // Show exit hint, fade after 2s
    setShowExitHint(true);
    if (exitHintTimer.current) clearTimeout(exitHintTimer.current);
    exitHintTimer.current = setTimeout(() => setShowExitHint(false), 2000);

    // Request native fullscreen on the stage element if supported
    const el = stageRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(err => {
        console.warn('Fullscreen API failed; continuing with CSS-only fullscreen', err);
      });
    }
  }, []);

  const exitPerformanceMode = useCallback(() => {
    setPerformanceMode(false);
    setShowExitHint(false);
    setCursorIdle(false);
    if (exitHintTimer.current) clearTimeout(exitHintTimer.current);
    if (cursorIdleTimer.current) clearTimeout(cursorIdleTimer.current);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ignore */ });
    }
  }, []);

  // Listen for native fullscreenchange — sync our state if user hits Esc
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement && performanceMode) {
        exitPerformanceMode();
      }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [performanceMode, exitPerformanceMode]);

  // Cursor hide after 3s of inactivity while in performance mode
  useEffect(() => {
    if (!performanceMode) return undefined;
    function resetCursorIdle() {
      setCursorIdle(false);
      if (cursorIdleTimer.current) clearTimeout(cursorIdleTimer.current);
      cursorIdleTimer.current = setTimeout(() => setCursorIdle(true), 3000);
    }
    resetCursorIdle();
    window.addEventListener('mousemove', resetCursorIdle);
    return () => {
      window.removeEventListener('mousemove', resetCursorIdle);
      if (cursorIdleTimer.current) clearTimeout(cursorIdleTimer.current);
    };
  }, [performanceMode]);

  /* ── Stage tap-to-advance (Feature 3) ────────── */
  function handleStageClick(e) {
    if (!performanceMode) return;
    // Don't advance if user clicked an input or button bubbled up
    const tag = e.target?.tagName;
    if (['INPUT', 'BUTTON', 'A', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    goNextSection();
  }

  function handleStageContextMenu(e) {
    if (!performanceMode) return;
    e.preventDefault();
    goPrevSection();
  }

  /* ── Filtered song list ──────────────────────── */
  const filteredSongs = allSongs.filter(s => {
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.artist?.toLowerCase().includes(q)
    );
  });

  /* ── Section label formatter ─────────────────── */
  function sectionDisplayLabel(section, index) {
    if (!section) return '';
    if (section.label) return section.label;
    const type = section.section_type || 'section';
    // Capitalize and append a number for verses/choruses where there are multiples
    const sameType = sections.filter(s => s.section_type === type);
    if (sameType.length > 1) {
      const n = sameType.indexOf(section) + 1;
      return `${type} ${n}`;
    }
    return type;
  }

  /* ── Render ──────────────────────────────────── */
  return (
    <WorshipShell
      title="Lyrics Display"
      icon="📺"
      subtitle="Live lyrics display for the stage/screens during service."
    >
    <div className={`ld-root ${performanceMode ? 'performance-mode' : ''}`}>
      {!performanceMode && (
        <div className="app-bg" aria-hidden="true">
          <div className="orb o1"/><div className="orb o2"/>
          <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
        </div>
      )}

      {/* ── Left panel ─────────────────────────── */}
      {!performanceMode && (
      <div className="ld-panel">
        {/* Tab switcher */}
        <div className="ld-panel-tabs">
          <button
            className={`ld-tab-btn ${panelTab === 'songs' ? 'active' : ''}`}
            onClick={() => setPanelTab('songs')}
          >
            Songs
          </button>
          <button
            className={`ld-tab-btn ${panelTab === 'setlists' ? 'active' : ''}`}
            onClick={() => setPanelTab('setlists')}
          >
            Setlists
          </button>
        </div>

        {/* ── Songs tab ── */}
        {panelTab === 'songs' && (
          <>
            <div className="ld-search-wrap">
              <input
                className="ld-search"
                type="text"
                placeholder="Search songs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="ld-list">
              {loadingList && <div className="ld-loading">Loading…</div>}
              {!loadingList && filteredSongs.length === 0 && (
                <div className="ld-empty">No songs found.</div>
              )}
              {filteredSongs.map(song => (
                <div
                  key={song.id}
                  className={`ld-song-item ${currentSong?.id === song.id && queue.length === 0 ? 'active' : ''}`}
                  onClick={() => handleSongClick(song)}
                >
                  <span className="ld-song-title">{song.title || 'Untitled'}</span>
                  <span className="ld-song-meta">
                    {[song.artist, song.song_key].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Setlists tab ── */}
        {panelTab === 'setlists' && (
          <>
            <div className="ld-list">
              {loadingList && <div className="ld-loading">Loading…</div>}
              {!loadingList && allSetlists.length === 0 && (
                <div className="ld-empty">No setlists yet.</div>
              )}
              {allSetlists.map(sl => (
                <div
                  key={sl.id}
                  className={`ld-setlist-item ${activeSetlistId === sl.id ? 'active' : ''}`}
                  onClick={() => handleSetlistClick(sl)}
                >
                  <span className="ld-setlist-name">{sl.name || 'Untitled Setlist'}</span>
                  <span className="ld-setlist-sub">
                    {sl.songs?.length ?? 0} song{sl.songs?.length !== 1 ? 's' : ''}
                    {sl.occasion ? ` · ${sl.occasion}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Queue of songs in selected setlist */}
            {queue.length > 0 && (
              <>
                <div className="ld-panel-divider" />
                <div className="ld-queue-header">Queue</div>
                <div className="ld-list" style={{ maxHeight: 160 }}>
                  {queue.map((song, idx) => (
                    <div
                      key={song.id}
                      className={`ld-queue-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => handleQueueSongClick(song, idx)}
                    >
                      <span className="ld-queue-num">{idx + 1}</span>
                      <span className="ld-queue-title">{song.title || 'Untitled'}</span>
                      {song.song_key && (
                        <span className="ld-queue-key">{song.song_key}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Section navigation (always shown when a song is loaded) ── */}
        {currentSong && sections.length > 0 && (
          <>
            <div className="ld-panel-divider" />
            <div className="ld-sections-header">Sections</div>
            <div className="ld-sections-list">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id ?? idx}
                  className={`ld-section-item ${sectionIdx === idx ? 'active' : ''}`}
                  onClick={() => handleSectionClick(idx)}
                >
                  <span className="ld-section-item-label">
                    {sectionDisplayLabel(sec, idx)}
                  </span>
                  <span className="ld-section-item-idx">{idx + 1}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Display options (bg image + performance mode) ─────────── */}
        <div className="ld-panel-divider" />
        <div className="ld-panel-options">
          <div className="ld-options-header">Display</div>

          {/* Custom background image upload (Feature 1) */}
          <label className="ld-bg-upload-btn">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBgImageUpload}
              style={{ display: 'none' }}
            />
            <span>{bgImage ? 'Change Background…' : 'Background Image…'}</span>
          </label>
          {bgImage && (
            <button
              type="button"
              className="ld-bg-clear-btn"
              onClick={handleClearBgImage}
            >
              Remove Image
            </button>
          )}
          {bgImageError && (
            <div className="ld-bg-err">{bgImageError}</div>
          )}

          {/* Performance / fullscreen entry (Feature 2) */}
          <button
            type="button"
            className="ld-perf-btn"
            onClick={enterPerformanceMode}
            disabled={!currentSong}
          >
            ▶ Go Fullscreen
          </button>
        </div>
      </div>
      )}

      {/* ── Main display ───────────────────────── */}
      <div className="ld-main">

        {/* Settings bar — hidden in performance mode */}
        {!performanceMode && (
        <div className="ld-settings">

          {/* Font size */}
          <div className="ld-settings-group">
            <span className="ld-settings-label">Size</span>
            <input
              className="ld-size-slider"
              type="range"
              min={16}
              max={72}
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
            />
            <span className="ld-size-value">{fontSize}</span>
          </div>

          {/* Chords toggle */}
          <Toggle
            on={showChords}
            onChange={setShowChords}
            label="Chords"
          />

          {/* Background picker */}
          <div className="ld-settings-group">
            <span className="ld-settings-label">BG</span>
            <div className="ld-bg-picker">
              {Object.entries(BG_SWATCH_COLORS).map(([key, color]) => (
                <button
                  key={key}
                  className={`ld-bg-swatch ${bgKey === key ? 'active' : ''}`}
                  style={{ background: color }}
                  title={key}
                  onClick={() => setBgKey(key)}
                  aria-label={`${key} background`}
                />
              ))}
            </div>
          </div>

          {/* Fullscreen */}
          <button className="ld-fs-btn" onClick={handleFullscreen}>
            ⛶ Fullscreen
          </button>
        </div>
        )}

        {/* Stage */}
        <div
          ref={stageRef}
          className={`ld-stage ${performanceMode ? 'is-performance' : ''} ${cursorIdle ? 'cursor-hidden' : ''} ${bgImage ? 'has-bg-image' : ''}`}
          style={{
            background: theme.bg,
            color: theme.text,
            ...(bgImage ? {
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            } : {}),
          }}
          onClick={handleStageClick}
          onContextMenu={handleStageContextMenu}
        >
          {/* Overlay for readability when a bg image is set */}
          {bgImage && <div className="ld-bg-overlay" aria-hidden="true" />}

          {/* Prev section arrow — hidden in performance mode */}
          {!performanceMode && (
          <button
            className="ld-nav-prev"
            onClick={goPrevSection}
            disabled={!currentSong || sectionIdx === 0}
            aria-label="Previous section"
            style={{ color: theme.text }}
          >
            ‹
          </button>
          )}

          {/* Content */}
          {!currentSong && !loadingSong && (
            <div className="ld-placeholder">
              <div className="ld-placeholder-icon">♪</div>
              <div className="ld-placeholder-text">No song selected</div>
              <div className="ld-placeholder-sub">
                Pick a song or setlist from the panel on the left to begin.
              </div>
            </div>
          )}

          {loadingSong && (
            <div className="ld-loading" style={{ color: theme.text }}>
              Loading…
            </div>
          )}

          {currentSong && !loadingSong && (
            <div className={`ld-content-wrap ${fading ? 'fading' : ''}`}>
              {currentSection && (
                <div className="ld-section-label" style={{ color: theme.text }}>
                  {sectionDisplayLabel(currentSection, sectionIdx)}
                </div>
              )}
              <SectionContent
                content={currentSection?.content || ''}
                showChords={showChords}
                chordColor={theme.chord}
                fontSize={fontSize}
              />
            </div>
          )}

          {/* Next section arrow — hidden in performance mode */}
          {!performanceMode && (
          <button
            className="ld-nav-next"
            onClick={goNextSection}
            disabled={!currentSong || sectionIdx >= totalSections - 1}
            aria-label="Next section"
            style={{ color: theme.text }}
          >
            ›
          </button>
          )}

          {/* Footer — hidden in performance mode */}
          {currentSong && !performanceMode && (
            <div className="ld-footer">
              <div className="ld-footer-title" style={{ color: theme.text }}>
                {currentSong.title}
                {currentSong.artist ? ` — ${currentSong.artist}` : ''}
                {currentSong.song_key ? ` (${currentSong.song_key})` : ''}
              </div>
              <div className="ld-footer-meta" style={{ color: theme.text }}>
                Section {sectionIdx + 1} of {totalSections}
              </div>
              {queue.length > 0 && (
                <div className="ld-footer-queue" style={{ color: theme.text }}>
                  Song {queueIdx + 1} of {queue.length} in queue
                </div>
              )}
            </div>
          )}

          {/* Keyboard hint — hidden in performance mode */}
          {!performanceMode && (
            <div className="ld-kbd-hint" style={{ color: theme.text }}>
              ← → sections · ↑ ↓ songs · Space next
            </div>
          )}

          {/* Performance-mode exit hint (fades after 2s) */}
          {performanceMode && (
            <div
              className={`ld-exit-hint ${showExitHint ? 'visible' : ''}`}
              style={{ color: theme.text }}
            >
              Press Esc to exit · Tap to advance
            </div>
          )}
        </div>
      </div>
    </div>
    </WorshipShell>
  );
}
