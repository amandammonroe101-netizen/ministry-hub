import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { useUserStoreKey } from '../../lib/userStore';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { useWritingDocs } from '../../lib/writingDocsStore';
import { fetchVerseText } from '../../lib/bibleLookup';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import writingGuideDocxUrl from '../../assets/writing-how-to-guide.docx?url';
import './Writing.css';

/* ─────────────────────────────────────────────────────────────
   Writing Mode — a standalone, distraction-free space for a
   zoned-in writer.

   Two surfaces:
     • Library  — your saved documents (create / open / rename /
                  delete), with word counts and session history.
     • Focus    — a fullscreen, Microsoft-Word-style editor: a page
                  sheet on a gray canvas with a tabbed ribbon
                  (Home / Insert / Layout / References / View),
                  page setup, headers & footers, table of contents,
                  outline pane, zoom, checklists, find & replace,
                  autosave, a word goal, and optional flow aids
                  (paragraph dimming, typewriter scrolling, sprints,
                  and a no-delete hardcore mode).

   Bodies are stored as HTML (rich text). Older plain-text docs are
   upgraded to paragraphs on open.

   Storage (all Firestore, per-user):
     /users/{uid}/writingDocs/{id} → one doc per document
                                     (see lib/writingDocsStore)
     'writing:folders'   → array of series/folders (kv blob)
     'writing:prefs'     → shared { theme, fontSize, dim, ... } (kv)
   ───────────────────────────────────────────────────────────── */

const ACCENT = '#7dd3fc';

const THEMES = [
  { key: 'paper',    label: 'Paper',    bg: '#faf7ef', text: '#2b2b2b', faint: 'rgba(43,43,43,0.45)' },
  { key: 'sepia',    label: 'Sepia',    bg: '#f3ead6', text: '#4b3f2f', faint: 'rgba(75,63,47,0.45)' },
  { key: 'midnight', label: 'Midnight', bg: '#1a1d24', text: '#dce1e9', faint: 'rgba(220,225,233,0.40)' },
  { key: 'forest',   label: 'Forest',   bg: '#16271f', text: '#d6e8df', faint: 'rgba(214,232,223,0.40)' },
];

const DEFAULT_PREFS = {
  theme: 'paper',
  fontSize: 18,
  dim: true,           // focus-paragraph dimming
  typewriter: false,   // keep caret line vertically centered
  hardcore: false,     // block deletions — forces a rough draft
  soundscape: 'off',   // ambient sound bed key (see SOUNDSCAPES)
  soundVolume: 0.5,    // 0..1
};

/* Ambient soundscapes, synthesized with the Web Audio API so no
   audio files need to ship. Each key maps to a noise bed + filter
   in createSoundscapeEngine(). */
const SOUNDSCAPES = [
  { key: 'off',   label: 'Off',         icon: '🔇' },
  { key: 'rain',  label: 'Rain',        icon: '🌧️' },
  { key: 'ocean', label: 'Ocean waves', icon: '🌊' },
  { key: 'wind',  label: 'Wind',        icon: '🍃' },
  { key: 'brown', label: 'Deep noise',  icon: '🟤' },
  { key: 'white', label: 'White noise', icon: '⚪' },
];

const SPRINT_PRESETS = [5, 10, 15, 25];

/* ─────────────────────────────────────────────────────────────
   In-app "How to Use" guide, shown in the Profile modal's
   Writing tab (mirrors docs/WRITING_HOW_TO_USE.md) and offered
   as a plain-text download via the ⬇ Download Guide button. */
/* Block style options for the Styles gallery. Maps a label to the
   HTML tag applied via execCommand('formatBlock'). */
const STYLE_OPTIONS = [
  { tag: 'P',  label: 'Normal' },
  { tag: 'H1', label: 'Title' },
  { tag: 'H2', label: 'Heading 1' },
  { tag: 'H3', label: 'Heading 2' },
  { tag: 'BLOCKQUOTE', label: 'Quote' },
];

/* Block tags the style dropdown reflects back from the caret. */
const KNOWN_BLOCKS = ['H1', 'H2', 'H3', 'BLOCKQUOTE'];

/* Font families offered in the font picker. */
const FONTS = [
  'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Segoe UI', 'Calibri', 'Century Gothic', 'Franklin Gothic Medium', 'Impact',
  'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Palatino Linotype',
  'Book Antiqua', 'Courier New', 'Consolas', 'Lucida Console', 'Comic Sans MS',
];

/* Line-spacing presets. */
const LINE_SPACINGS = ['1.0', '1.15', '1.5', '2.0', '2.5'];

/* Page sizes (px @ 96dpi) and margin presets, à la Word's Layout tab. */
const PAGE_SIZES = {
  letter: { w: 816, h: 1056, label: 'Letter (8.5 × 11")' },
  a4:     { w: 794, h: 1123, label: 'A4 (210 × 297mm)' },
  legal:  { w: 816, h: 1344, label: 'Legal (8.5 × 14")' },
};
const MARGIN_PRESETS = {
  normal:   { v: 96, h: 96,  label: 'Normal (1")' },
  narrow:   { v: 48, h: 48,  label: 'Narrow (0.5")' },
  moderate: { v: 96, h: 72,  label: 'Moderate' },
  wide:     { v: 96, h: 192, label: 'Wide (2" sides)' },
};

/* Change-case modes for the Aa control. */
const CASE_OPTIONS = [
  { mode: 'sentence', label: 'Sentence case' },
  { mode: 'lower',    label: 'lowercase' },
  { mode: 'upper',    label: 'UPPERCASE' },
  { mode: 'title',    label: 'Capitalize Each Word' },
];

/* Symbol palette for Insert ▸ Symbol. */
const SYMBOLS = [
  '—', '–', '•', '·', '…', '©', '®', '™', '§', '¶', '†', '‡',
  '✝', '✞', '☩', '✠', '→', '←', '↔', '⇒', '≈', '≠', '≤', '≥',
  '×', '÷', '±', '°', '′', '″', '¼', '½', '¾', '«', '»', '“', '”',
  '‘', '’', '€', '£', '¥', '¢',
];

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

/* Gray gutter (px) shown on the desk between consecutive page sheets. */
const PAGE_GAP = 28;

const RIBBON_TABS = [
  { id: 'home',       label: 'Home' },
  { id: 'insert',     label: 'Insert' },
  { id: 'layout',     label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'view',       label: 'View' },
];

const escapeHtml = (s) => (s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* A short, soft chime via Web Audio — played when a sprint ends. */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* audio not available — fail silently */ }
}

/* Build a 4-second looping noise buffer. 'brown' is integrated
   (random-walk) noise — deep and rumbly; otherwise plain white. */
function makeNoiseBuffer(ctx, kind) {
  const len = Math.floor(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/* A self-contained ambient soundscape player. Returns a controller
   that swaps between noise beds (rain/ocean/wind/brown/white) and
   rides a master gain for volume. Ocean & wind add a slow LFO swell
   so they breathe instead of sitting as flat static. */
function createSoundscapeEngine() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  let nodes = [];

  const stopNodes = () => {
    nodes.forEach(n => {
      try { n.stop?.(); } catch { /* already stopped */ }
      try { n.disconnect?.(); } catch { /* already gone */ }
    });
    nodes = [];
  };

  const setType = (type) => {
    stopNodes();
    if (!type || type === 'off') return;
    const deep = type === 'brown' || type === 'ocean' || type === 'wind';
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, deep ? 'brown' : 'white');
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    if (type === 'rain')        { filter.type = 'highpass'; filter.frequency.value = 1200; }
    else if (type === 'white')  { filter.type = 'lowpass';  filter.frequency.value = 8000; }
    else if (type === 'brown')  { filter.type = 'lowpass';  filter.frequency.value = 500; }
    else if (type === 'ocean')  { filter.type = 'lowpass';  filter.frequency.value = 650; }
    else if (type === 'wind')   { filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = 0.7; }

    const swell = ctx.createGain();
    swell.gain.value = (type === 'ocean' || type === 'wind') ? 0.55 : 1;

    src.connect(filter).connect(swell).connect(master);
    src.start();
    nodes.push(src, filter, swell);

    if (type === 'ocean' || type === 'wind') {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = type === 'ocean' ? 0.1 : 0.2;
      lfoGain.gain.value = type === 'ocean' ? 0.4 : 0.3;
      lfo.connect(lfoGain).connect(swell.gain);
      lfo.start();
      nodes.push(lfo, lfoGain);
    }
  };

  const setVolume = (v) => {
    const target = Math.max(0, Math.min(1, v)) * 0.45;
    try { master.gain.setTargetAtTime(target, ctx.currentTime, 0.2); }
    catch { master.gain.value = target; }
  };

  const resume = () => { try { if (ctx.state === 'suspended') ctx.resume(); } catch { /* no-op */ } };
  const destroy = () => { stopNodes(); try { ctx.close(); } catch { /* no-op */ } };

  return { setType, setVolume, resume, destroy };
}

/* Strip HTML to plain text so word counts and card snippets work
   whether a body is rich HTML or legacy plain text. */
const stripHtml = (s) => (s || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

const countWords = (s) => {
  const t = stripHtml(s);
  return t ? t.split(/\s+/).length : 0;
};

const isHtmlBody = (s) =>
  /^\s*<[a-z]/i.test(s || '');

/* Convert a legacy plain-text body into paragraph HTML for the
   rich-text editor. Bodies already in HTML pass through untouched. */
function htmlFromBody(text) {
  if (!text) return '<p><br></p>';
  if (isHtmlBody(text)) return text;
  const html = text
    .split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>') || '<br>'}</p>`)
    .join('');
  return html || '<p><br></p>';
}

/* Drop the caret at the end of an element's contents. */
function placeCaretEnd(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /* no-op */ }
}

const newId = () =>
  'wd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

const newDoc = () => {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: 'Untitled',
    body: '',
    wordGoal: 0,
    folderId: null,
    pageSetup: { size: 'letter', orientation: 'portrait', margins: 'normal' },
    header: '',
    footer: '',
    hasHeader: false,
    hasFooter: false,
    showPageNum: false,
    createdAt: now,
    updatedAt: now,
    sessions: [],
  };
};

const newFolderId = () =>
  'wf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const fmtClock = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const timeAgo = (iso) => {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return 'recently'; }
};

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
export default function Writing() {
  /* Documents now live one-per-Firestore-doc (was a single kv blob)
     so each save stays well under Firestore's 1 MB per-document cap.
     The hook also migrates any legacy 'writing:documents' blob once. */
  const {
    docs,
    createDoc: createDocFs,
    updateDoc: updateDocFs,
    removeDoc: removeDocFs,
    updateMany: updateManyFs,
  } = useWritingDocs();
  const [folders, setFolders] = useUserStoreKey('writing:folders', []);
  const [prefs, setPrefs] = useUserStoreKey('writing:prefs', DEFAULT_PREFS);
  const [openId, setOpenId] = useState(null);
  const [openMode, setOpenMode] = useState('edit'); // mode FocusWriter starts in: 'view' | 'edit'
  const [lastSession, setLastSession] = useState(null);
  const [openSeriesId, setOpenSeriesId] = useState(null); // series whose document page is open
  const [seriesDraft, setSeriesDraft] = useState(null); // { mode:'create'|'rename', id, value, desc }
  const [tab, setTab] = useState('folders'); // 'folders' | 'docs'

  /* Topbar: notification bell + profile avatar (shared modal). */
  const [showProfile, setShowProfile] = useState(false);
  const [psSub, setPsSub] = useState('prefs'); // Profile modal's "Writing" tab: 'prefs' | 'howto'
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showBell, setShowBell] = useState(false);
  const bellTimer = useRef(null);
  const openBell = () => { if (bellTimer.current) clearTimeout(bellTimer.current); setShowBell(true); };
  const scheduleCloseBell = () => {
    if (bellTimer.current) clearTimeout(bellTimer.current);
    bellTimer.current = setTimeout(() => setShowBell(false), 220);
  };

  const list = Array.isArray(docs) ? docs : [];
  const foldersList = Array.isArray(folders) ? folders : [];
  const safePrefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
  const openDoc = list.find(d => d.id === openId) || null;

  const sorted = useMemo(
    () => [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [list]
  );

  /* Documents grouped by series, plus the loose (un-filed) ones. */
  const docsByFolder = useMemo(() => {
    const m = {};
    foldersList.forEach(f => { m[f.id] = []; });
    sorted.forEach(d => { if (d.folderId && m[d.folderId]) m[d.folderId].push(d); });
    return m;
  }, [foldersList, sorted]);

  const looseDocs = useMemo(
    () => sorted.filter(d => !d.folderId || !foldersList.some(f => f.id === d.folderId)),
    [sorted, foldersList]
  );

  /* The series whose document page is currently open (null = library). */
  const openSeries = openSeriesId ? foldersList.find(f => f.id === openSeriesId) || null : null;

  /* Bell items — light writing nudges derived from the documents:
     a "you haven't written today" prompt and any unmet word goals.
     Clicking an item opens that document. */
  const bellItems = useMemo(() => {
    const items = [];
    const today = new Date().toDateString();
    const editedToday = list.some(d => {
      try { return new Date(d.updatedAt).toDateString() === today; } catch { return false; }
    });
    if (sorted.length > 0 && !editedToday) {
      const d = sorted[0];
      items.push({
        id: 'resume', icon: '✍️', docId: d.id,
        title: "You haven't written today",
        body: `Pick up “${d.title || 'Untitled'}”`,
      });
    }
    list.forEach(d => {
      const w = countWords(d.body);
      if (d.wordGoal > 0 && w < d.wordGoal) {
        items.push({
          id: 'goal_' + d.id, icon: '🎯', docId: d.id,
          title: d.title || 'Untitled',
          body: `${(d.wordGoal - w).toLocaleString()} words to your goal`,
        });
      }
    });
    return items.slice(0, 8);
  }, [list, sorted]);

  const totalWords = useMemo(
    () => list.reduce((sum, d) => sum + countWords(d.body), 0),
    [list]
  );

  const create = () => {
    const doc = newDoc();
    createDocFs(doc);
    setOpenMode('edit');
    setOpenId(doc.id);
  };

  const createInSeries = (folderId) => {
    const doc = { ...newDoc(), folderId };
    createDocFs(doc);
    setOpenMode('edit');
    setOpenId(doc.id);
  };

  const patchDoc = useCallback((id, patch) => {
    updateDocFs(id, patch);
  }, [updateDocFs]);

  const removeDoc = (id) => {
    removeDocFs(id);
    if (openId === id) setOpenId(null);
  };

  /* Documents open in a read-only view inside FocusWriter; its
     Edit button flips that same page into the full editor. */
  const viewDocument = (id) => { setOpenMode('view'); setOpenId(id); };
  const editDocument = (id) => { setOpenMode('edit'); setOpenId(id); };

  const assignDoc = (id, folderId) => patchDoc(id, { folderId });

  /* Series naming uses an in-app modal rather than window.prompt(),
     which Electron does not support (it returns null, so the old
     prompt-based create/rename silently did nothing). */
  const createFolder = () => setSeriesDraft({ mode: 'create', id: null, value: '', desc: '' });
  const renameFolder = (id) => {
    const cur = foldersList.find(f => f.id === id);
    setSeriesDraft({ mode: 'rename', id, value: cur?.name || '', desc: cur?.description || '' });
  };
  const commitSeries = () => {
    const name = (seriesDraft?.value || '').trim();
    if (!name) return;
    const description = (seriesDraft?.desc || '').trim();
    if (seriesDraft.mode === 'create') {
      const f = { id: newFolderId(), name, description, createdAt: new Date().toISOString() };
      setFolders([f, ...foldersList]);
    } else {
      setFolders(foldersList.map(f => (f.id === seriesDraft.id ? { ...f, name, description } : f)));
    }
    setSeriesDraft(null);
  };

  /* Deleting a series keeps its documents — they just return to the
     loose list. We never destroy a doc when removing its folder. */
  const deleteFolder = (id) => {
    const members = docsByFolder[id] || [];
    if (members.length > 0 &&
        !window.confirm(`Delete this folder? Its ${members.length} document${members.length === 1 ? '' : 's'} will stay, just un-filed.`)) {
      return;
    }
    updateManyFs(members.map(d => d.id), { folderId: null });
    setFolders(foldersList.filter(f => f.id !== id));
  };

  const addSession = useCallback((id, session) => {
    updateDocFs(id, d => ({ sessions: [...(d.sessions || []), session] }));
    setLastSession(session);
  }, [updateDocFs]);

  return (
    <>
      <PageTourHost pageId="writing" />

      {/* TOPBAR — logo · writing nudges bell · profile avatar, matching
          the bell + avatar pattern used on Journal / Friends. Rendered
          as a direct app-shell child (sibling of .wm-wrap) so it sits
          flush at the top like the shared header it replaces. */}
      <div className="app-topbar" data-tour="tour-topbar" style={{ '--wm-accent': ACCENT }}>
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag">Writing Mode</span>
        </div>
        <div className="app-tb-actions">
          <div
            className="wm-tb-bell-wrap"
            onMouseEnter={openBell}
            onMouseLeave={scheduleCloseBell}
          >
            <button
              className="wm-tb-bell"
              onClick={() => setShowBell(v => !v)}
              aria-label={`${bellItems.length} notifications`}
              title={`${bellItems.length} notification${bellItems.length === 1 ? '' : 's'}`}
            >
              🔔
              {bellItems.length > 0 && (
                <span className="wm-tb-bell-badge">{bellItems.length}</span>
              )}
            </button>
            {showBell && (
              <div
                className="wm-bell-popover"
                role="dialog"
                aria-label="Writing nudges"
                onMouseEnter={openBell}
                onMouseLeave={scheduleCloseBell}
              >
                <div className="wm-bell-hd">
                  <span className="wm-bell-title">Writing nudges</span>
                </div>
                {bellItems.length === 0 ? (
                  <div className="wm-bell-empty">You're all caught up.</div>
                ) : (
                  <div className="wm-bell-list">
                    {bellItems.map(n => (
                      <button
                        key={n.id}
                        className="wm-bell-item"
                        onClick={() => { setShowBell(false); viewDocument(n.docId); }}
                      >
                        <span className="wm-bell-icon">{n.icon}</span>
                        <div className="wm-bell-text">
                          <div className="wm-bell-item-title">{n.title}</div>
                          <div className="wm-bell-item-body">{n.body}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      <div className="wm-wrap" style={{ '--wm-accent': ACCENT }}>
      {openSeries ? (
        <div className="wm-shell">
          <SeriesView
            series={openSeries}
            docs={docsByFolder[openSeries.id] || []}
            allFolders={foldersList}
            onBack={() => setOpenSeriesId(null)}
            onOpenDoc={viewDocument}
            onDeleteDoc={removeDoc}
            onAssign={assignDoc}
            onNewDoc={() => createInSeries(openSeries.id)}
            onRename={() => renameFolder(openSeries.id)}
            onDelete={() => { deleteFolder(openSeries.id); setOpenSeriesId(null); }}
          />
        </div>
      ) : (
      <div className="wm-shell">
        <header className="wm-header">
          <div className="wm-title-row">
            <span className="wm-title-icon" aria-hidden="true">✍️</span>
            <h1 className="wm-title">Writing Mode</h1>
          </div>
          <p className="wm-desc">
            A quiet, fullscreen page to disappear into the words. Open a
            document, set a word goal, and let everything else fall away.
          </p>
        </header>

        <div className="wm-stats">
          <Stat label="Documents" value={list.length} />
          <Stat label="Total words" value={totalWords.toLocaleString()} />
          <Stat
            label="Sessions"
            value={list.reduce((s, d) => s + (d.sessions?.length || 0), 0)}
          />
        </div>

        {lastSession && (
          <div className="wm-lastsession">
            <span>
              Last session — <b>{lastSession.wordsAdded.toLocaleString()}</b> words
              in <b>{Math.max(1, Math.round(lastSession.durationSec / 60))} min</b>.
            </span>
            <button className="app-btn ghost icon-only" onClick={() => setLastSession(null)} title="Dismiss">✕</button>
          </div>
        )}

        <div className="wm-toolbar">
          <button className="app-btn primary" data-tour="tour-primary-action" onClick={create}>+ New document</button>
          {sorted.length > 0 && (
            <button
              className="app-btn ghost"
              onClick={() => editDocument(sorted[0].id)}
              title={`Resume “${sorted[0].title || 'Untitled'}”`}
            >▶ Resume last</button>
          )}
          <button className="app-btn ghost" onClick={createFolder} title="Bundle documents into a folder">
            📚 New Folder
          </button>
        </div>

        <div className="wm-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'folders'}
            className={`wm-tab ${tab === 'folders' ? 'on' : ''}`}
            onClick={() => setTab('folders')}
          >
            Folders {foldersList.length > 0 && <span className="wm-tab-count">{foldersList.length}</span>}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'docs'}
            className={`wm-tab ${tab === 'docs' ? 'on' : ''}`}
            onClick={() => setTab('docs')}
          >
            Other Documents {looseDocs.length > 0 && <span className="wm-tab-count">{looseDocs.length}</span>}
          </button>
        </div>

        {tab === 'folders' ? (
          foldersList.length === 0 ? (
            <div className="wm-empty">
              <div className="wm-empty-icon">📚</div>
              <div className="wm-empty-title">No folders yet</div>
              <div className="wm-empty-sub">Make one with “📚 New Folder” to bundle documents together.</div>
            </div>
          ) : (
            <div className="wm-folder-list">
              {foldersList.map(f => (
                <FolderBlock
                  key={f.id}
                  folder={f}
                  docs={docsByFolder[f.id] || []}
                  onOpen={() => setOpenSeriesId(f.id)}
                  onRename={() => renameFolder(f.id)}
                  onDelete={() => deleteFolder(f.id)}
                />
              ))}
            </div>
          )
        ) : (
          looseDocs.length === 0 ? (
            <div className="wm-empty">
              <div className="wm-empty-icon">✍️</div>
              <div className="wm-empty-title">No loose documents</div>
              <div className="wm-empty-sub">Create a document to enter Writing Mode.</div>
            </div>
          ) : (
            <div className="wm-doc-grid">
              {looseDocs.map(d => (
                <DocCard
                  key={d.id}
                  doc={d}
                  folders={foldersList}
                  onOpen={() => viewDocument(d.id)}
                  onDelete={() => removeDoc(d.id)}
                  onAssign={assignDoc}
                />
              ))}
            </div>
          )
        )}
      </div>
      )}

      {openDoc && (
        <FocusWriter
          key={openDoc.id}
          doc={openDoc}
          initialMode={openMode}
          prefs={safePrefs}
          onPrefs={setPrefs}
          onPatch={patchDoc}
          onSession={addSession}
          onClose={() => setOpenId(null)}
          onDiscard={removeDoc}
        />
      )}

      {seriesDraft && (
        <div className="wm-series-modal-scrim" onClick={() => setSeriesDraft(null)}>
          <div
            className="wm-series-modal"
            role="dialog"
            aria-label={seriesDraft.mode === 'create' ? 'New Folder' : 'Rename folder'}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="wm-series-modal-title">
              {seriesDraft.mode === 'create' ? '📚 New Folder' : 'Rename folder'}
            </h3>
            <input
              className="wm-series-modal-input"
              autoFocus
              value={seriesDraft.value}
              placeholder="Folder name…"
              onChange={e => setSeriesDraft(d => ({ ...d, value: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') commitSeries();
                else if (e.key === 'Escape') setSeriesDraft(null);
              }}
            />
            <textarea
              className="wm-series-modal-textarea"
              value={seriesDraft.desc}
              placeholder="Description (shown on the folder face)…"
              rows={3}
              onChange={e => setSeriesDraft(d => ({ ...d, desc: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Escape') setSeriesDraft(null); }}
            />
            <div className="wm-series-modal-actions">
              <button className="app-btn ghost" onClick={() => setSeriesDraft(null)}>Cancel</button>
              <button
                className="app-btn primary"
                onClick={commitSeries}
                disabled={!seriesDraft.value.trim()}
              >
                {seriesDraft.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Writing"
        pageSettings={
          <div className="pm-body">
            <div className="wm-ps-subtabs">
              <button
                type="button"
                className={`wm-ps-subtab ${psSub === 'prefs' ? 'on' : ''}`}
                onClick={() => setPsSub('prefs')}
              >
                <span className="wm-ps-subtab-icon">⚙️</span>
                <span className="wm-ps-subtab-name">Preferences</span>
              </button>
              <button
                type="button"
                className={`wm-ps-subtab ${psSub === 'howto' ? 'on' : ''}`}
                onClick={() => setPsSub('howto')}
              >
                <span className="wm-ps-subtab-icon">❓</span>
                <span className="wm-ps-subtab-name">How to Use</span>
              </button>
            </div>

            {psSub === 'prefs' && (
              <div className="wm-ps-section">
                <div className="wm-ps-section-title">⚙️ Preferences</div>
                <p style={{ margin: '0 0 8px', color: 'var(--text-faint)' }}>
                  Writing Mode preferences — themes, flow aids (paragraph dimming,
                  typewriter scrolling, hardcore mode), writing sprints, and ambient
                  soundscapes — live inside the editor toolbar. Open any document to
                  adjust them; your choices are remembered for next time.
                </p>
              </div>
            )}

            {psSub === 'howto' && (
              /* ───────── ❓ How to Use (typed-out in-app guide) ─────────
                  Mirrors docs/WRITING_HOW_TO_USE.md so users don't have
                  to go hunting for documentation. The same content is
                  offered as a real Word doc download via the button below. */
              <div className="wm-ps-section">
                <div className="wm-ps-howto-header">
                  <div className="wm-ps-section-title">❓ How to Use Writing Mode</div>
                  <a
                    className="wm-ps-howto-download"
                    href={writingGuideDocxUrl}
                    download="Writing Mode - How to Use.docx"
                  >
                    ⬇ Download as Word doc
                  </a>
                </div>

                <div className="wm-ps-howto-feedback">
                  <span className="wm-ps-howto-feedback-ic">🛠</span>
                  <span>
                    <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
                    click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
                  </span>
                </div>

                <div className="wm-ps-howto-intro">
                  A full walkthrough of Writing Mode — the Library, folders, the Focus
                  Editor, formatting, scripture lookups, flow tools, sprints, soundscapes,
                  and more. Skim the headers below, or download the whole guide as a file.
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🏠 The Library</div>
                  <div className="wm-ps-howto-p">
                    Click <b>Writing</b> in the nav rail to land on the Library, with
                    <b> Folders</b> and <b>Other Documents</b> tabs.
                  </div>
                  <ul className="wm-ps-howto-list">
                    <li><b>New document</b> — creates a blank document and opens it immediately.</li>
                    <li><b>📚 New Folder</b> — opens a naming modal to create a folder/series.</li>
                    <li><b>Resume Last</b> — reopens your most recently edited document.</li>
                    <li><b>Last session summary</b> — a dismissible line like "240 words in 12 min."</li>
                    <li><b>Library stats</b> — total documents and total words.</li>
                  </ul>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">📚 Folders (Series)</div>
                  <div className="wm-ps-howto-p">
                    Folders group related documents — a sermon series, a devotional set,
                    chapters of the same project.
                  </div>
                  <ul className="wm-ps-howto-list">
                    <li>Create with <b>📚 New Folder</b> — name (required) and an optional description shown on the card face.</li>
                    <li>Hover a folder card for <b>✎ Rename</b> and <b>🗑 Delete</b>.</li>
                    <li>Click a folder to drill into its <b>Series view</b>, with a back button, totals, and "+ New document in this folder."</li>
                    <li>Deleting a folder asks for confirmation; its documents become un-filed rather than deleted.</li>
                  </ul>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">📄 Creating & Opening Documents</div>
                  <div className="wm-ps-howto-p">
                    <b>New document</b> opens a blank, untitled document straight into the
                    Focus Editor. Documents opened from a <b>writing nudge</b> (🔔 bell)
                    open in view mode instead of edit mode. Empty documents you back out of
                    are auto-discarded, so peeking in and exiting won't clutter your library.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🖥 The Focus Editor</div>
                  <ul className="wm-ps-howto-list">
                    <li><b>← Exit</b> (or Esc) saves and returns to the Library.</li>
                    <li><b>Title</b> autosaves shortly after you stop typing.</li>
                    <li>A <b>word goal bar</b> appears once you've set a goal, turning green when met.</li>
                    <li>The ribbon and top bar <b>auto-hide</b> after a few idle seconds — move the mouse or type to bring them back.</li>
                    <li><b>Footer</b> shows live word/page count, reading time, save status, and zoom.</li>
                    <li><b>Themes</b> — Paper, Sepia, Midnight, Forest — and <b>font size</b> (A−/A+) are remembered across documents.</li>
                  </ul>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🧰 The Ribbon (Formatting Tools)</div>
                  <ul className="wm-ps-howto-list">
                    <li><b>Home</b> — undo/redo, fonts, bold/italic/underline/strike, case changer, lists, alignment, line spacing, block styles, Find & Replace.</li>
                    <li><b>Insert</b> — tables, pictures, symbols, header/footer, page numbers, date, horizontal line, scripture verses, page breaks.</li>
                    <li><b>Layout</b> — margins, orientation, page size.</li>
                    <li><b>References</b> — insert/update a Table of Contents from your headings.</li>
                    <li><b>View</b> — Outline pane, formatting marks, zoom, word count, Print, Export to Word, and a Focus button that hides all chrome.</li>
                  </ul>
                  <div className="wm-ps-howto-p">
                    Shortcuts: <b>Ctrl/Cmd+B/I/U</b> bold/italic/underline, <b>Ctrl/Cmd+F</b> find,
                    <b> Ctrl/Cmd+H</b> find & replace, <b>Ctrl/Cmd+S</b> save now, <b>Esc</b> exit.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">📖 Scripture Lookup</div>
                  <div className="wm-ps-howto-p">
                    From the <b>Insert</b> tab's Verse/Scripture tool, type a reference (e.g.
                    <i> John 3:16</i>), pick a translation (KJV, WEB, BBE, OEB, ASV), and the
                    verse is fetched and inserted as a formatted, citation-labeled quote.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🌊 Flow Tools</div>
                  <ul className="wm-ps-howto-list">
                    <li><b>✅ Grammar Check</b> — a built-in, pattern-based side panel (no external service).</li>
                    <li><b>◐ Paragraph Dimming</b> — fades every paragraph except your current one.</li>
                    <li><b>⌖ Typewriter Scrolling</b> — keeps your current line vertically centered.</li>
                    <li><b>🔒 Hardcore Mode</b> — disables backspace/delete for a forward-only rough draft.</li>
                  </ul>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">⏱ Writing Sprints</div>
                  <div className="wm-ps-howto-p">
                    Click <b>⏱ Sprint</b> and pick 5/10/15/25 minutes. A chime plays and a
                    toast shows your word count when time's up — dismiss with "Keep writing"
                    or stop early with <b>Stop</b>.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🎧 Soundscapes</div>
                  <div className="wm-ps-howto-p">
                    Click <b>🎧</b> for ambient sound, generated live in your browser: Rain,
                    Ocean waves, Wind, Deep noise, or White noise, with a volume slider. Your
                    pick and volume are remembered; sound stops when you exit the editor.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🎯 Word Goals & Word Count</div>
                  <div className="wm-ps-howto-p">
                    Set a target near the top bar to get a progress bar that turns green when
                    met. Click <b>📊 Count</b> (View tab) for word/character counts and an
                    estimated reading time.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🖨 Page Setup, Print & Export</div>
                  <div className="wm-ps-howto-p">
                    Set page size, orientation, and margins under <b>Layout</b> — the document
                    re-paginates automatically. From <b>View</b>: <b>🖨 Print</b>, or
                    <b> ⬇ Word</b> to export a Word-compatible .doc file.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">👁 View-Only Mode</div>
                  <div className="wm-ps-howto-p">
                    Documents opened from a nudge open read-only with a <b>👁 Viewing</b>
                    badge. Grammar Check still works; click <b>✎ Edit</b> to switch to full
                    edit mode.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">💾 Saving & Multi-Device Sync</div>
                  <div className="wm-ps-howto-p">
                    Writing Mode autosaves as you type (footer shows "Saving…" → "Saved");
                    <b> Ctrl/Cmd+S</b> forces a save now. Each document is stored as its own
                    record, so a large document — especially one with embedded images —
                    won't hold up any of your others, and changes sync across devices once saved.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🔔 Writing Nudges</div>
                  <div className="wm-ps-howto-p">
                    Click the bell to see "You haven't written today" and per-document unmet
                    word-goal nudges. Clicking one opens that document in view mode.
                  </div>
                </div>

                <div className="wm-ps-howto-block">
                  <div className="wm-ps-howto-h">🛠 Troubleshooting</div>
                  <ul className="wm-ps-howto-list">
                    <li><b>Soundscape doesn't play at first</b> — browsers block audio until you've clicked something on the page; click the option again.</li>
                    <li><b>Scripture verse won't insert</b> — check the reference format or your connection.</li>
                    <li><b>Backspace/Delete does nothing</b> — Hardcore Mode is on; turn it off in the flow toggles.</li>
                    <li><b>A blank "Untitled" doc disappeared</b> — expected; empty documents are discarded automatically on exit.</li>
                    <li><b>Latest edits missing on another device</b> — give autosave a moment to finish before switching devices.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        }
      />
      </div>
    </>
  );
}

/* ── Lightweight, dependency-free grammar/spell checker ─────────
   Not a real NLP model — a set of pattern-based heuristics (typo
   dictionary, repeated words, article agreement, punctuation and
   capitalization slips) good enough to surface obvious mistakes
   inside the editor's Grammar Check panel without shipping an
   external service. */
const GRAMMAR_DICTIONARY = {
  alot: 'a lot', becuase: 'because', definately: 'definitely', definitly: 'definitely',
  seperate: 'separate', seperately: 'separately', occured: 'occurred', occurence: 'occurrence',
  recieve: 'receive', wich: 'which', teh: 'the', thier: 'their', untill: 'until',
  apparant: 'apparent', arguement: 'argument', acheive: 'achieve', adress: 'address',
  begining: 'beginning', beleive: 'believe', calender: 'calendar', cemetary: 'cemetery',
  collegue: 'colleague', comming: 'coming', commited: 'committed', concious: 'conscious',
  embarass: 'embarrass', enviroment: 'environment', existance: 'existence', familar: 'familiar',
  finaly: 'finally', foriegn: 'foreign', goverment: 'government', grammer: 'grammar',
  happend: 'happened', harrass: 'harass', immediatly: 'immediately', independant: 'independent',
  knowlege: 'knowledge', liason: 'liaison', maintainance: 'maintenance', mispell: 'misspell',
  neccessary: 'necessary', noticable: 'noticeable', occassion: 'occasion',
  perseverence: 'perseverance', personel: 'personnel', posession: 'possession',
  prefered: 'preferred', priviledge: 'privilege', publically: 'publicly',
  questionaire: 'questionnaire', reccommend: 'recommend', refering: 'referring',
  relevent: 'relevant', religous: 'religious', remeber: 'remember', similiar: 'similar',
  succesful: 'successful', suprise: 'surprise', tommorow: 'tomorrow', truely: 'truly',
  writting: 'writing', irregardless: 'regardless',
};

function checkGrammar(text) {
  if (!text) return [];
  const issues = [];

  const addAll = (re, build) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const built = build(m);
      if (built) {
        const start = built.start ?? m.index;
        const end = built.end ?? (m.index + m[0].length);
        issues.push({
          start, end, match: built.match ?? m[0],
          type: built.type, label: built.label,
          message: built.message, suggestion: built.suggestion,
        });
      }
      if (m[0].length === 0) re.lastIndex += 1;
    }
  };

  // Repeated word, e.g. "the the"
  addAll(/\b([A-Za-z]+)\s+\1\b/gi, (m) => ({
    type: 'repetition', label: 'Repeated word',
    message: `"${m[1]}" appears twice in a row.`,
    suggestion: m[1],
  }));

  // Space before punctuation
  addAll(/ +([,.!?;:])/g, (m) => ({
    type: 'spacing', label: 'Extra space',
    message: 'Remove the space before punctuation.',
    suggestion: m[1],
  }));

  // Missing space after a sentence-ending punctuation mark
  addAll(/([a-z])([.!?])([A-Z])/g, (m) => ({
    type: 'spacing', label: 'Missing space',
    message: 'Add a space after the sentence.',
    suggestion: `${m[1]}${m[2]} ${m[3]}`,
  }));

  // Doubled punctuation, e.g. "wait,, really??"
  addAll(/([!?,;:])\1+/g, (m) => ({
    type: 'punctuation', label: 'Repeated punctuation',
    message: 'Simplify the repeated punctuation.',
    suggestion: m[1],
  }));

  // "could of" / "should of" / "would of" / "must of"
  addAll(/\b(could|should|would|must)\s+of\b/gi, (m) => ({
    type: 'grammar', label: 'Grammar',
    message: `Use "have" instead of "of" after "${m[1]}".`,
    suggestion: `${m[1]} have`,
  }));

  // Common misspellings
  addAll(/\b[a-zA-Z]+\b/g, (m) => {
    const fix = GRAMMAR_DICTIONARY[m[0].toLowerCase()];
    if (!fix) return null;
    return {
      type: 'spelling', label: 'Spelling',
      message: `"${m[0]}" may be misspelled.`,
      suggestion: fix,
    };
  });

  // "a"/"an" article agreement
  addAll(/\b(a|an)\s+([a-zA-Z]+)/gi, (m) => {
    const article = m[1].toLowerCase();
    const word = m[2].toLowerCase();
    const wantAnExceptions = new Set(['hour', 'hours', 'honest', 'honor', 'honorable', 'heir']);
    const wantAExceptions = new Set(['university', 'unicorn', 'european', 'one', 'once', 'user', 'usual', 'uniform', 'unique']);
    let wantAn = /^[aeiou]/.test(word);
    if (wantAnExceptions.has(word)) wantAn = true;
    if (wantAExceptions.has(word)) wantAn = false;
    const start = m.index;
    const end = m.index + m[1].length;
    if (wantAn && article === 'a') {
      return { start, end, match: m[1], type: 'grammar', label: 'Article', message: `Use "an" before "${m[2]}".`, suggestion: 'an' };
    }
    if (!wantAn && article === 'an') {
      return { start, end, match: m[1], type: 'grammar', label: 'Article', message: `Use "a" before "${m[2]}".`, suggestion: 'a' };
    }
    return null;
  });

  // Sentence should start with a capital letter
  addAll(/(^|[.!?]\s+)([a-z])/g, (m) => {
    const start = m.index + m[1].length;
    return {
      start, end: start + 1, match: m[2],
      type: 'capitalization', label: 'Capitalize',
      message: 'Sentences should start with a capital letter.',
      suggestion: m[2].toUpperCase(),
    };
  });

  issues.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const clean = [];
  let lastEnd = -1;
  for (const iss of issues) {
    if (iss.start >= lastEnd) { clean.push(iss); lastEnd = iss.end; }
  }
  return clean.slice(0, 200);
}

/* ─────────────────────────────────────────────────────────────
   Library cards
   ───────────────────────────────────────────────────────────── */

/* A single document card. The 🗂 menu files the doc into a series
   (or removes it). Used both as a loose card and inside a series. */
function DocCard({ doc, folders, onOpen, onDelete, onAssign }) {
  const [menu, setMenu] = useState(false);
  const words = countWords(doc.body);
  const sessions = doc.sessions?.length || 0;
  const snippet = stripHtml(doc.body);
  return (
    <article className="wm-doc-card" onClick={onOpen}>
      <h3 className="wm-doc-title">{doc.title || 'Untitled'}</h3>
      <p className="wm-doc-snippet">
        {snippet
          ? snippet.slice(0, 160)
          : <span className="wm-doc-empty">Empty — start writing…</span>}
      </p>
      <div className="wm-doc-meta">
        <span>{words.toLocaleString()} words</span>
        {sessions > 0 && <span>· {sessions} session{sessions === 1 ? '' : 's'}</span>}
        <span>· {timeAgo(doc.updatedAt || doc.createdAt)}</span>
      </div>
      <div className="wm-doc-actions" onClick={e => e.stopPropagation()}>
        <button className="app-btn ghost" onClick={onOpen}>👁 View</button>
        <div className="wm-doc-menu-wrap">
          <button
            className="app-btn ghost icon-only"
            title="Add to a folder"
            onClick={() => setMenu(v => !v)}
          >🗂</button>
          {menu && (
            <>
              <div className="wm-doc-menu-scrim" onClick={() => setMenu(false)} />
              <div className="wm-doc-menu" role="menu">
                <div className="wm-doc-menu-label">Move to folder</div>
                {folders.length === 0 && (
                  <div className="wm-doc-menu-empty">No folders yet — make one with “📚 New Folder”.</div>
                )}
                {folders.map(f => (
                  <button
                    key={f.id}
                    className={`wm-doc-menu-item ${doc.folderId === f.id ? 'on' : ''}`}
                    onClick={() => { onAssign(doc.id, f.id); setMenu(false); }}
                  >
                    {doc.folderId === f.id ? '✓ ' : ''}{f.name}
                  </button>
                ))}
                {doc.folderId && (
                  <button
                    className="wm-doc-menu-item danger"
                    onClick={() => { onAssign(doc.id, null); setMenu(false); }}
                  >Remove from folder</button>
                )}
              </div>
            </>
          )}
        </div>
        <button
          className="app-btn ghost icon-only"
          title="Delete"
          onClick={onDelete}
        >🗑</button>
      </div>
    </article>
  );
}

/* A series block — a bundle of documents shown as one clickable
   card. The whole card drills into the series page (onOpen); the
   rename/delete actions in the head stop propagation so they don't
   trigger the drill-in. A small stack preview hints at what's inside. */
function FolderBlock({ folder, docs, onOpen, onRename, onDelete }) {
  return (
    <div
      className="wm-folder"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <div className="wm-folder-head">
        <span className="wm-folder-icon" aria-hidden="true">📚</span>
        <div className="wm-folder-info">
          <h3 className="wm-folder-name">{folder.name}</h3>
          <div className="wm-folder-meta">
            {docs.length} doc{docs.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="wm-folder-head-actions" onClick={e => e.stopPropagation()}>
          <button className="app-btn ghost icon-only" title="Rename folder" onClick={onRename}>✎</button>
          <button className="app-btn ghost icon-only" title="Delete folder" onClick={onDelete}>🗑</button>
        </div>
        <span className="wm-folder-chev" aria-hidden="true">▸</span>
      </div>

      <div className="wm-folder-desc">
        {folder.description
          ? folder.description
          : <span className="wm-folder-desc-empty">No description yet — open to add documents.</span>}
      </div>
    </div>
  );
}

/* SeriesView — the drill-in page for a single series. Replaces the
   library while open: a back button returns to the full library,
   the header shows the series name + counts with rename/delete, and
   the body lists every document in the series as DocCards. */
function SeriesView({
  series, docs, allFolders,
  onBack, onOpenDoc, onDeleteDoc, onAssign, onNewDoc, onRename, onDelete,
}) {
  const totalWords = docs.reduce((s, d) => s + countWords(d.body), 0);
  return (
    <div className="wm-series-view">
      <button className="wm-series-back" onClick={onBack}>← All documents</button>

      <header className="wm-series-header">
        <span className="wm-series-icon" aria-hidden="true">📚</span>
        <div className="wm-series-info">
          <h1 className="wm-series-name">{series.name}</h1>
          {series.description && (
            <p className="wm-series-desc">{series.description}</p>
          )}
          <div className="wm-series-meta">
            {docs.length} doc{docs.length === 1 ? '' : 's'} · {totalWords.toLocaleString()} words
          </div>
        </div>
        <div className="wm-series-header-actions">
          <button className="app-btn ghost icon-only" title="Rename folder" onClick={onRename}>✎</button>
          <button className="app-btn ghost icon-only" title="Delete folder" onClick={onDelete}>🗑</button>
        </div>
      </header>

      <div className="wm-toolbar">
        <button className="app-btn primary" onClick={onNewDoc}>+ New document in this folder</button>
      </div>

      {docs.length === 0 ? (
        <div className="wm-empty">
          <div className="wm-empty-icon">📚</div>
          <div className="wm-empty-title">No documents yet</div>
          <div className="wm-empty-sub">Add one with the button above, or file an existing document here.</div>
        </div>
      ) : (
        <div className="wm-doc-grid">
          {docs.map(d => (
            <DocCard
              key={d.id}
              doc={d}
              folders={allFolders}
              onOpen={() => onOpenDoc(d.id)}
              onDelete={() => onDeleteDoc(d.id)}
              onAssign={onAssign}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="wm-stat">
      <div className="wm-stat-value">{value}</div>
      <div className="wm-stat-label">{label}</div>
    </div>
  );
}

/* A labelled ribbon group (mirrors Word's grouped ribbon). */
function Grp({ label, children }) {
  return (
    <div className="wm-grp">
      <div className="wm-grp-body">{children}</div>
      <div className="wm-grp-cap">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FocusWriter — fullscreen, Word-style editor.

   The body is a single contentEditable "sheet" (uncontrolled — we
   set its HTML once on open and read innerHTML on input, so the
   caret never jumps). The ribbon applies block styles and inline
   marks via execCommand. Paragraph dimming fades every direct child
   block except the one the caret sits in (.wm-active).
   ───────────────────────────────────────────────────────────── */
function FocusWriter({ doc, prefs, onPrefs, onPatch, onSession, onClose, onDiscard, initialMode }) {
  const [mode, setMode] = useState(initialMode === 'view' ? 'view' : 'edit'); // 'view' | 'edit'
  const viewOnly = mode === 'view';
  const [showGrammar, setShowGrammar] = useState(false);
  const [grammarIssues, setGrammarIssues] = useState([]);
  const [title, setTitle] = useState(doc.title || 'Untitled');
  const [words, setWords] = useState(() => countWords(doc.body));
  const [saveState, setSaveState] = useState('saved'); // 'saving' | 'saved'
  const [chromeVisible, setChromeVisible] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [blockFmt, setBlockFmt] = useState('P');
  const [fontName, setFontName] = useState('Arial');
  const [fontPx, setFontPx] = useState(prefs.fontSize || 18);
  const [showCount, setShowCount] = useState(false);
  const [showSprint, setShowSprint] = useState(false);
  const [sprint, setSprint] = useState(null);          // { endsAt, mins, startWords }
  const [sprintLeft, setSprintLeft] = useState(0);
  const [sprintResult, setSprintResult] = useState(null);

  const [showSound, setShowSound] = useState(false);

  const [ribbonTab, setRibbonTab] = useState('home');
  const [showOutline, setShowOutline] = useState(false);
  const [outline, setOutline] = useState([]);
  const [showMarks, setShowMarks] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showSym, setShowSym] = useState(false);
  const [showVerse, setShowVerse] = useState(false);
  const [verseRef, setVerseRef] = useState('');
  const [verseTrans, setVerseTrans] = useState('kjv');
  const [verseBusy, setVerseBusy] = useState(false);
  const [verseErr, setVerseErr] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [marks, setMarks] = useState({}); // live execCommand states for button highlighting

  const edRef = useRef(null);
  const stageRef = useRef(null);
  const saveTimer = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const fileRef = useRef(null);
  const savedRange = useRef(null); // last selection inside the editor (survives focusing toolbar inputs)
  const resizing = useRef(null);   // active image-resize drag state
  const sessionStart = useRef({ at: Date.now(), words: countWords(doc.body) });

  const theme = THEMES.find(t => t.key === prefs.theme) || THEMES[0];
  const wordsRef = useRef(words);
  wordsRef.current = words;

  /* ── Ambient soundscape ─────────────────────────────────────
     Lazily spun up the first time a non-off bed is chosen (audio
     needs a user gesture, which the menu click provides). Torn
     down when the writer leaves Focus mode. */
  const soundType = prefs.soundscape || 'off';
  const soundVol = prefs.soundVolume ?? 0.5;
  const soundRef = useRef(null);
  useEffect(() => {
    if (soundType === 'off') {
      soundRef.current?.setType('off');
      return;
    }
    if (!soundRef.current) soundRef.current = createSoundscapeEngine();
    const eng = soundRef.current;
    if (!eng) return;
    eng.resume();
    eng.setVolume(soundVol);
    eng.setType(soundType);
  }, [soundType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    soundRef.current?.setVolume(soundVol);
  }, [soundVol]);
  useEffect(() => () => { soundRef.current?.destroy(); soundRef.current = null; }, []);

  /* While a document is open, hide the global NavRail ☰ trigger so the
     writing surface is distraction-free. Exit via the "← Exit" button. */
  useEffect(() => {
    document.body.classList.add('wm-in-document');
    return () => document.body.classList.remove('wm-in-document');
  }, []);

  const setSound = (key) => onPrefs({ ...prefs, soundscape: key });
  const setSoundVol = (v) => onPrefs({ ...prefs, soundVolume: v });

  /* ── Page geometry (Layout tab) ─────────────────────────── */
  const ps = { size: 'letter', orientation: 'portrait', margins: 'normal', ...(doc.pageSetup || {}) };
  const sizeDef = PAGE_SIZES[ps.size] || PAGE_SIZES.letter;
  const portrait = ps.orientation !== 'landscape';
  const pageW = portrait ? sizeDef.w : sizeDef.h;
  const pageH = portrait ? sizeDef.h : sizeDef.w;
  const margin = MARGIN_PRESETS[ps.margins] || MARGIN_PRESETS.normal;

  const pageStyle = {
    '--wm-page-w': `${pageW}px`,
    '--wm-page-h': `${pageH}px`,
    '--wm-pad-v': `${margin.v}px`,
    '--wm-pad-h': `${margin.h}px`,
    '--wm-gap': `${PAGE_GAP}px`,
    zoom: zoom / 100,
  };

  /* Direct-child block of the body editor that contains a node. */
  const blockOf = (node) => {
    const ed = edRef.current;
    if (!ed) return null;
    let n = node;
    while (n && n.parentNode && n.parentNode !== ed) n = n.parentNode;
    return n && n.nodeType === 1 && n.parentNode === ed ? n : null;
  };

  const centerBlock = (el) => {
    const stage = stageRef.current;
    if (!stage || !el) return;
    const sr = stage.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    const delta = (br.top - sr.top) - stage.clientHeight / 2 + br.height / 2;
    if (Math.abs(delta) > 4) stage.scrollBy({ top: delta, behavior: 'auto' });
  };

  /* Real pagination. Walks the editor's top-level blocks and inserts a
     non-editable spacer wherever a block would overflow the current
     page's text area. Each spacer fills the rest of the current page
     (its bottom margin), the gray gutter, and the next page's top
     margin — so content always resumes inside the next sheet's
     margins, giving accurate top AND bottom margins on every page.

     Geometry (layout px, relative to the editor's top, which equals
     the page's top): page n's text area is
       [padV + n·(pageH+gap),  padV + n·(pageH+gap) + (pageH − 2·padV)].
     Rects are divided by the zoom factor to recover layout pixels.
     Spacers are stripped before the body is saved. */
  const paginate = useCallback(() => {
    const ed = edRef.current;
    if (!ed) return 1;
    const z = (zoom || 100) / 100;
    const padV = margin.v;
    const textH = pageH - 2 * padV;          // usable text height per page
    ed.querySelectorAll(':scope > .wm-spacer').forEach(s => s.remove());
    if (textH <= 0) return 1;

    const edTop = ed.getBoundingClientRect().top;
    const relTop = (el) => (el.getBoundingClientRect().top - edTop) / z;
    const relBottom = (el) => (el.getBoundingClientRect().bottom - edTop) / z;

    const nextBlock = (n) => {
      let x = n;
      while (x && x.classList.contains('wm-spacer')) x = x.nextElementSibling;
      return x;
    };

    let p = 0;                                // current page index
    let node = ed.firstElementChild;
    let guard = 0;
    while (node && guard++ < 5000) {
      if (node.classList.contains('wm-spacer')) { node = node.nextElementSibling; continue; }

      // Forced page break (Insert ▸ Break): push the following content
      // to the top of the next page regardless of remaining room.
      if (node.classList.contains('wm-forced-break')) {
        const nb = nextBlock(node.nextElementSibling);
        if (nb) {
          const nextTop = padV + (p + 1) * (pageH + PAGE_GAP);
          const spH = nextTop - relTop(nb);
          if (spH > 1) {
            const sp = document.createElement('div');
            sp.className = 'wm-spacer';
            sp.setAttribute('contenteditable', 'false');
            sp.style.height = `${spH}px`;
            ed.insertBefore(sp, nb);
          }
          p++;
          node = nb;
          continue;
        }
        node = node.nextElementSibling;
        continue;
      }

      const pageTop = padV + p * (pageH + PAGE_GAP);
      const pageBottom = pageTop + textH;
      const top = relTop(node);
      const bottom = relBottom(node);

      if (bottom <= pageBottom + 1) { node = node.nextElementSibling; continue; } // fits

      // A single block taller than a page can't be pushed further; let
      // it overflow, advance the page, and move on.
      if (top >= pageTop - 1 && (bottom - top) > textH + 1) {
        p++; node = node.nextElementSibling; continue;
      }

      // Push this block to the top of the next page via a spacer.
      const nextTop = padV + (p + 1) * (pageH + PAGE_GAP);
      const spH = nextTop - top;
      if (spH > 1) {
        const sp = document.createElement('div');
        sp.className = 'wm-spacer';
        sp.setAttribute('contenteditable', 'false');
        sp.style.height = `${spH}px`;
        ed.insertBefore(sp, node);
      }
      p++; // re-evaluate the same node on the new page (don't advance)
    }
    return p + 1;
  }, [pageH, zoom, margin.v]);

  /* Recompute the outline list, repaginate, and set the page count. */
  const updateMeta = useCallback(() => {
    const ed = edRef.current;
    if (!ed) return;
    const heads = Array.from(ed.querySelectorAll('h1,h2,h3'));
    setOutline(heads.map((h, i) => {
      if (!h.id) h.id = `wmh_${i}_${Math.random().toString(36).slice(2, 6)}`;
      return { id: h.id, level: h.tagName.toLowerCase(), text: (h.textContent || '').trim() || '(untitled)' };
    }));
    setPageCount(Math.max(1, paginate()));
  }, [paginate]);

  /* Flag the caret's block as active (full opacity) + sync dropdown. */
  const markActive = useCallback(() => {
    const ed = edRef.current;
    if (!ed) return;
    const sel = window.getSelection();
    let active = null;
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      active = blockOf(sel.anchorNode);
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
    Array.from(ed.children).forEach(c => c.classList.toggle('wm-active', c === active));
    if (active && prefs.typewriter) centerBlock(active);
    try {
      const v = (document.queryCommandValue('formatBlock') || 'p').toUpperCase();
      setBlockFmt(KNOWN_BLOCKS.includes(v) ? v : 'P');
      const fn = (document.queryCommandValue('fontName') || '')
        .replace(/^['"]|['"]$/g, '').split(',')[0].trim();
      if (fn && FONTS.includes(fn)) setFontName(fn);
      setMarks({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        subscript: document.queryCommandState('subscript'),
        superscript: document.queryCommandState('superscript'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
      });
    } catch { /* not supported */ }
  }, [prefs.typewriter]);

  /* Restore the last in-editor selection — used before applying a
     command from a toolbar control that stole focus (e.g. the font-
     size number box). Returns whether a usable range was restored. */
  const restoreSel = useCallback(() => {
    const ed = edRef.current;
    const r = savedRange.current;
    if (!ed || !r || !ed.contains(r.commonAncestorContainer)) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }, []);

  /* Mount — seed the editor (uncontrolled), focus, mark active. */
  useEffect(() => {
    const ed = edRef.current;
    if (!ed) return;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, true);
    } catch { /* ok */ }
    ed.innerHTML = htmlFromBody(doc.body);
    ed.focus();
    placeCaretEnd(ed);
    markActive();
    updateMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Seed header/footer bands when they appear. */
  useEffect(() => {
    if (headerRef.current && doc.hasHeader) headerRef.current.innerHTML = doc.header || '';
    if (footerRef.current && doc.hasFooter) footerRef.current.innerHTML = doc.footer || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.hasHeader, doc.hasFooter]);

  /* Re-evaluate dimming when dim/typewriter prefs change. */
  useEffect(() => { markActive(); }, [prefs.dim, prefs.typewriter, markActive]);

  /* Recount pages when zoom or page geometry changes. */
  useEffect(() => { updateMeta(); }, [zoom, pageH, updateMeta]);

  /* Track selection changes inside the body editor. */
  useEffect(() => {
    const handler = () => {
      const ed = edRef.current;
      const sel = window.getSelection();
      if (ed && sel && sel.rangeCount && ed.contains(sel.anchorNode)) markActive();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [markActive]);

  /* Live elapsed clock. */
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStart.current.at) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* Auto-hide chrome after a short idle; any input brings it back. */
  useEffect(() => {
    let t;
    const show = () => {
      setChromeVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setChromeVisible(false), 3200);
    };
    show();
    window.addEventListener('mousemove', show);
    window.addEventListener('keydown', show);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', show);
      window.removeEventListener('keydown', show);
    };
  }, []);

  /* Persist title (debounced). */
  useEffect(() => {
    const t = setTimeout(() => {
      if (title !== doc.title) onPatch(doc.id, { title: title.trim() || 'Untitled' });
    }, 500);
    return () => clearTimeout(t);
  }, [title, doc.id, doc.title, onPatch]);

  /* Sprint countdown — chime + result toast when time runs out. */
  useEffect(() => {
    if (!sprint) return;
    const id = setInterval(() => {
      const left = Math.round((sprint.endsAt - Date.now()) / 1000);
      if (left <= 0) {
        setSprintLeft(0);
        playChime();
        setSprintResult({
          mins: sprint.mins,
          words: Math.max(0, wordsRef.current - sprint.startWords),
        });
        setSprint(null);
      } else {
        setSprintLeft(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [sprint]);

  /* Editor HTML with layout spacers stripped — what we persist. */
  const cleanBody = useCallback(() => {
    const ed = edRef.current;
    if (!ed) return doc.body;
    const clone = ed.cloneNode(true);
    clone.querySelectorAll('.wm-spacer').forEach(s => s.remove());
    clone.querySelectorAll('.wm-img-sel').forEach(w => w.classList.remove('wm-img-sel'));
    return clone.innerHTML;
  }, [doc.body]);

  const flushSave = useCallback(() => {
    if (edRef.current) onPatch(doc.id, { body: cleanBody() });
  }, [doc.id, onPatch, cleanBody]);

  /* Grammar Check — scans the current text (live editor content if
     mounted, otherwise the saved body) with the lightweight
     checkGrammar() heuristic and lists results in a side panel. */
  const runGrammarCheck = useCallback(() => {
    const text = edRef.current ? (edRef.current.innerText || '') : stripHtml(doc.body);
    setGrammarIssues(checkGrammar(text));
  }, [doc.body]);

  const toggleGrammar = () => {
    setShowGrammar(v => {
      const next = !v;
      if (next) runGrammarCheck();
      return next;
    });
  };

  /* Set once we begin closing so the unmount / beforeunload flush
     below never fires a second save (which, combined with the
     optimistic store, was leaving a stray blank doc behind on exit). */
  const closingRef = useRef(false);

  const finish = useCallback(() => {
    closingRef.current = true;
    const html = edRef.current ? cleanBody() : doc.body;
    const cleanTitle = title.trim();

    /* Discard-on-exit for a still-empty document: if the writer is
       leaving a doc with no title (or the default "Untitled"), no text,
       and no images, drop it instead of saving. This stops blank
       "Untitled" docs from piling up every time the user opens a new
       document and backs out without writing. */
    const isEmptyDoc =
      countWords(html) === 0 &&
      !/<img\b/i.test(html || '') &&
      (!cleanTitle || cleanTitle.toLowerCase() === 'untitled');
    if (isEmptyDoc && onDiscard) {
      onDiscard(doc.id);
      onClose();
      return;
    }

    onPatch(doc.id, { body: html, title: cleanTitle || 'Untitled' });
    const durationSec = Math.round((Date.now() - sessionStart.current.at) / 1000);
    const wordsAdded = Math.max(0, countWords(html) - sessionStart.current.words);
    if (durationSec >= 5 || wordsAdded > 0) {
      onSession(doc.id, {
        id: 'ws_' + Date.now().toString(36),
        startedAt: new Date(sessionStart.current.at).toISOString(),
        endedAt: new Date().toISOString(),
        durationSec,
        wordsAdded,
      });
    }
    onClose();
  }, [doc.id, doc.body, title, onPatch, onSession, onClose, onDiscard]);

  /* Persist any pending edits when leaving without Esc/Exit — e.g.
     navigating away from Writing (component unmount) or closing the
     app/window. Kept in a ref so the listeners always see the latest
     body + title without re-subscribing on every keystroke. */
  const saveRef = useRef(null);
  saveRef.current = () => {
    /* Skip if we're already closing via finish() — it has handled the
       save (or the discard) and a second write here is what created the
       stray duplicate document on exit. */
    if (closingRef.current) return;
    if (!edRef.current) return;
    onPatch(doc.id, { body: cleanBody(), title: title.trim() || 'Untitled' });
  };
  useEffect(() => {
    const flush = () => saveRef.current?.();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      clearTimeout(saveTimer.current);
      flush();
    };
  }, []);

  /* Esc exits (or closes a popover first). */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (showSym) setShowSym(false);
      else if (showVerse) setShowVerse(false);
      else if (showSound) setShowSound(false);
      else if (showSprint) setShowSprint(false);
      else if (showFind) setShowFind(false);
      else finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, showSprint, showFind, showSym, showVerse, showSound]);

  /* Editor input — recount, debounce autosave, retrack caret + meta. */
  const onInput = () => {
    const ed = edRef.current;
    if (!ed) return;
    setWords(countWords(ed.innerHTML));
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
      setSaveState('saved');
    }, 600);
    markActive();
    updateMeta();
  };

  const onBeforeInput = (e) => {
    const type = e.nativeEvent?.inputType || '';
    if (prefs.hardcore && type.startsWith('delete')) e.preventDefault();
  };

  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) { e.preventDefault(); setShowFind(true); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); setSaveState('saved'); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
      return;
    }
    if (prefs.hardcore && (e.key === 'Backspace' || e.key === 'Delete')) e.preventDefault();
  };

  /* Toggle a checkbox when a checklist box is clicked. The native
     click already flipped `.checked`; mirror it to the attribute so
     the state survives innerHTML serialization, and sync the strike.
     Also handle image alignment buttons and image selection. */
  const onEditorClick = (e) => {
    if (viewOnly) return;
    const t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'checkbox') {
      if (t.checked) t.setAttribute('checked', ''); else t.removeAttribute('checked');
      t.closest('li')?.classList.toggle('wm-checked', t.checked);
      onInput();
      return;
    }
    // Delete an image.
    const delBtn = t.closest?.('.wm-img-del');
    if (delBtn) {
      e.preventDefault();
      delBtn.closest('.wm-img-wrap')?.remove();
      onInput();
      return;
    }
    // Image alignment buttons (left / center / right).
    const alignBtn = t.closest?.('.wm-img-al');
    if (alignBtn) {
      e.preventDefault();
      const wrap = alignBtn.closest('.wm-img-wrap');
      const al = alignBtn.dataset.al;
      if (wrap) {
        // Returning to an alignment drops free-floating mode + position.
        wrap.classList.remove('wm-img-left', 'wm-img-center', 'wm-img-right', 'wm-img-free');
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.classList.add(`wm-img-${al}`);
        onInput();
      }
      return;
    }
    // Select an image (shows tools + resize handle).
    const wrap = t.closest?.('.wm-img-wrap');
    const ed = edRef.current;
    if (ed) ed.querySelectorAll('.wm-img-wrap.wm-img-sel').forEach(w => { if (w !== wrap) w.classList.remove('wm-img-sel'); });
    if (wrap) { wrap.classList.add('wm-img-sel'); return; }
    markActive();
  };

  /* Begin an image resize when the corner handle is dragged. Width is
     tracked in layout px (rects divided by the zoom factor); height
     stays auto so the aspect ratio is preserved — like a Word image. */
  const onEditorMouseDown = (e) => {
    if (viewOnly) return;
    const z = (zoom || 100) / 100;

    /* Corner handle → resize. */
    const handle = e.target.closest?.('.wm-img-handle');
    if (handle) {
      e.preventDefault();
      const wrap = handle.closest('.wm-img-wrap');
      const img = wrap?.querySelector('img');
      if (!img) return;
      resizing.current = { img, startX: e.clientX, startW: img.getBoundingClientRect().width / z };
      const move = (ev) => {
        const r = resizing.current;
        if (!r) return;
        const w = Math.max(40, r.startW + (ev.clientX - r.startX) / z);
        r.img.style.width = `${Math.round(w)}px`;
        r.img.style.height = 'auto';
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        resizing.current = null;
        onInput();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }

    /* Image body → free move (follows the cursor, Word-style "in front
       of text"). On first drag the wrap is switched to absolute
       positioning anchored to the editor; left/top are saved inline so
       the position persists. Ignore clicks on the align mini-toolbar. */
    const img = e.target.closest?.('.wm-img');
    if (!img || e.target.closest?.('.wm-img-tools')) return;
    const wrap = img.closest('.wm-img-wrap');
    const ed = edRef.current;
    if (!wrap || !ed) return;
    e.preventDefault();

    ed.querySelectorAll('.wm-img-wrap.wm-img-sel').forEach(w => { if (w !== wrap) w.classList.remove('wm-img-sel'); });
    wrap.classList.add('wm-img-sel');

    const edRect = ed.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const grabX = (e.clientX - wRect.left) / z;  // cursor offset inside the image
    const grabY = (e.clientY - wRect.top) / z;
    const startLeft = (wRect.left - edRect.left) / z;
    const startTop = (wRect.top - edRect.top) / z;
    const maxLeft = ed.clientWidth - wRect.width / z;
    let moved = false;

    const move = (ev) => {
      const dx = (ev.clientX - e.clientX) / z;
      const dy = (ev.clientY - e.clientY) / z;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // tolerate a click
      if (!moved) {
        moved = true;
        wrap.classList.add('wm-img-free');
        wrap.classList.remove('wm-img-left', 'wm-img-center', 'wm-img-right');
      }
      let left = (ev.clientX - edRect.left) / z - grabX;
      let top = (ev.clientY - edRect.top) / z - grabY;
      left = Math.max(0, Math.min(left, Math.max(0, maxLeft)));
      top = Math.max(0, top);
      wrap.style.left = `${Math.round(left)}px`;
      wrap.style.top = `${Math.round(top)}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (moved) onInput();
    };
    // Seed a starting position so the first move doesn't jump.
    wrap.style.left = `${Math.round(startLeft)}px`;
    wrap.style.top = `${Math.round(startTop)}px`;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /* Run a rich-text command against the body editor, keeping focus. */
  const exec = (cmd, val) => {
    edRef.current?.focus();
    restoreSel();
    try { document.execCommand(cmd, false, val); } catch { /* ok */ }
    onInput();
  };
  const onStyle = (e) => exec('formatBlock', e.target.value);

  /* Keep selection alive when a ribbon BUTTON is pressed, but let
     selects/inputs (font, color, size) focus normally. */
  const keepFocus = (e) => {
    if (e.target.closest('button')) e.preventDefault();
  };

  const onFont = (e) => { setFontName(e.target.value); exec('fontName', e.target.value); };

  /* Arbitrary font size: execCommand only takes 1–7, so we tag the
     selection with size 7 (with styleWithCSS OFF so it emits a
     <font> element we can find) then rewrite those wrappers to the
     exact px. Needs a real selection — restore the editor's last one
     in case a toolbar input stole focus. */
  const applyFontSize = (px) => {
    const ed = edRef.current;
    if (!ed || !px) return;
    setFontPx(px);
    ed.focus();
    restoreSel();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return; // nothing selected — just remember the size
    try { document.execCommand('styleWithCSS', false, false); } catch { /* ok */ }
    document.execCommand('fontSize', false, '7');
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ok */ }
    ed.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      f.style.fontSize = `${px}px`;
    });
    onInput();
  };
  const growFont = () => applyFontSize(Math.min(400, (parseInt(fontPx, 10) || 18) + 1));
  const shrinkFont = () => applyFontSize(Math.max(6, (parseInt(fontPx, 10) || 18) - 1));

  const setHilite = (color) => {
    edRef.current?.focus();
    restoreSel();
    if (!document.execCommand('hiliteColor', false, color)) {
      document.execCommand('backColor', false, color);
    }
    onInput();
  };

  const selectedBlocks = () => {
    const ed = edRef.current;
    const sel = window.getSelection();
    if (!ed || !sel || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    return Array.from(ed.children)
      .filter(c => !c.classList.contains('wm-spacer') && range.intersectsNode(c));
  };

  const setLineSpacing = (v) => {
    if (!v) return;
    edRef.current?.focus();
    restoreSel();
    const blocks = selectedBlocks();
    const targets = blocks.length
      ? blocks
      : Array.from(edRef.current?.children || []).filter(c => !c.classList.contains('wm-spacer'));
    targets.forEach(b => { b.style.lineHeight = v; });
    onInput();
  };

  const changeCase = (mode) => {
    if (!mode) return;
    edRef.current?.focus();
    restoreSel();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    let out = text;
    if (mode === 'upper') out = text.toUpperCase();
    else if (mode === 'lower') out = text.toLowerCase();
    else if (mode === 'title') out = text.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    else if (mode === 'sentence') out = text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase());
    exec('insertText', out);
  };

  const clearFormatting = () => {
    edRef.current?.focus();
    document.execCommand('removeFormat');
    document.execCommand('unlink');
    onInput();
  };

  const insertDate = () => exec('insertText', format(new Date(), 'MMMM d, yyyy'));

  /* Forced page break: drop a break marker and a fresh paragraph, then
     move the caret into that paragraph. Pagination pushes everything
     after the marker to the top of the next page, so the typing line
     lands on the new page. */
  const insertPageBreak = () => {
    const ed = edRef.current;
    if (!ed) return;
    ed.focus();
    restoreSel();
    document.execCommand('insertHTML', false,
      '<div class="wm-forced-break" contenteditable="false"></div><p class="wm-break-target"><br></p>');
    const target = ed.querySelector('.wm-break-target');
    if (target) { target.classList.remove('wm-break-target'); placeCaretEnd(target); }
    onInput();
  };

  const insertChecklist = () =>
    exec('insertHTML', '<ul class="wm-checklist"><li><input type="checkbox" contenteditable="false">&nbsp;To-do item</li></ul><p><br></p>');

  /* Insert a Scripture block from the Verse popover. Type a reference
     (e.g. "John 3:16") and we auto-fetch the verse text, then drop a
     formatted blockquote with the words + citation — no manual typing. */
  const insertVerse = async () => {
    const ref = verseRef.trim();
    if (!ref || verseBusy) return;
    setVerseErr('');
    setVerseBusy(true);
    let text = '';
    try { text = await fetchVerseText(ref, verseTrans); } catch { text = ''; }
    setVerseBusy(false);
    if (!text) {
      setVerseErr('Couldn’t find that reference. Check the spelling (e.g. “John 3:16”).');
      return;
    }
    const label = `${ref}${verseTrans ? ` (${verseTrans.toUpperCase()})` : ''}`;
    const body = escapeHtml(text).replace(/\n/g, '<br>');
    exec('insertHTML',
      `<blockquote class="wm-verse">${body}<cite>${escapeHtml(label)}</cite></blockquote><p><br></p>`);
    setVerseRef('');
    setVerseErr('');
    setShowVerse(false);
  };

  const insertSymbol = (s) => { exec('insertText', s); setShowSym(false); };

  const insertTable = () => {
    const r = parseInt(window.prompt('Number of rows:', '2'), 10);
    const c = parseInt(window.prompt('Number of columns:', '2'), 10);
    if (!r || !c) return;
    let html = '<table class="wm-table"><tbody>';
    for (let i = 0; i < r; i++) { html += '<tr>'; for (let j = 0; j < c; j++) html += '<td><br></td>'; html += '</tr>'; }
    html += '</tbody></table><p><br></p>';
    exec('insertHTML', html);
  };

  const onPickImage = () => fileRef.current?.click();
  const onImageChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => exec('insertHTML',
      '<span class="wm-img-wrap wm-img-center" contenteditable="false">' +
        `<img class="wm-img" src="${reader.result}" alt="" draggable="false">` +
        '<span class="wm-img-tools" contenteditable="false">' +
          '<button type="button" class="wm-img-al" data-al="left" title="Align left">⯇</button>' +
          '<button type="button" class="wm-img-al" data-al="center" title="Center">≡</button>' +
          '<button type="button" class="wm-img-al" data-al="right" title="Align right">⯈</button>' +
          '<button type="button" class="wm-img-del" title="Delete image">🗑</button>' +
        '</span>' +
        '<span class="wm-img-handle" contenteditable="false" title="Drag to resize"></span>' +
      '</span><p><br></p>');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertTOC = () => {
    const ed = edRef.current;
    if (!ed) return;
    ed.querySelectorAll('.wm-toc').forEach(n => n.remove());
    const heads = Array.from(ed.querySelectorAll('h1,h2,h3'));
    if (!heads.length) { window.alert('Add some headings first (Title / Heading).'); return; }
    const items = heads.map(h =>
      `<li class="wm-toc-${h.tagName.toLowerCase()}">${escapeHtml(h.textContent || '')}</li>`
    ).join('');
    exec('insertHTML', `<div class="wm-toc" contenteditable="false"><div class="wm-toc-title">Contents</div><ul>${items}</ul></div><p><br></p>`);
  };

  /* Headers / footers (Insert tab). */
  const saveHeader = () => onPatch(doc.id, { header: headerRef.current?.innerHTML || '' });
  const saveFooter = () => onPatch(doc.id, { footer: footerRef.current?.innerHTML || '' });
  const addHeader = () => onPatch(doc.id, { hasHeader: true });
  const addFooter = () => onPatch(doc.id, { hasFooter: true });
  const togglePageNum = () => onPatch(doc.id, { showPageNum: !doc.showPageNum, hasFooter: true });

  const setPageSetup = (patch) => onPatch(doc.id, { pageSetup: { ...ps, ...patch } });

  /* Find & Replace. */
  const findNext = () => { if (findText && window.find) window.find(findText); };
  const replaceAll = () => {
    const ed = edRef.current;
    if (!ed || !findText) return;
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = new RegExp(escapeRe(findText), 'gi');
    nodes.forEach(node => {
      if (re.test(node.textContent)) { node.textContent = node.textContent.replace(re, replaceText); }
      re.lastIndex = 0;
    });
    onInput();
  };
  const replaceOne = () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().toLowerCase() === findText.toLowerCase()) {
      exec('insertText', replaceText);
    }
    findNext();
  };

  const printDoc = () => window.print();

  /* Export the current document as a Word-openable .doc (HTML). */
  const exportDoc = () => {
    const inner = edRef.current ? cleanBody() : doc.body;
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body><h1>${escapeHtml(title)}</h1>${inner}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'document').replace(/[^\w\- ]/g, '')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setTheme = (key) => onPrefs({ ...prefs, theme: key });
  const toggle = (key) => onPrefs({ ...prefs, [key]: !prefs[key] });
  const bumpFont = (delta) =>
    onPrefs({ ...prefs, fontSize: Math.min(34, Math.max(13, (prefs.fontSize || 18) + delta)) });
  const setGoal = (val) =>
    onPatch(doc.id, { wordGoal: Math.max(0, parseInt(val, 10) || 0) });

  const startSprint = (mins) => {
    setSprint({ endsAt: Date.now() + mins * 60000, mins, startWords: words });
    setSprintLeft(mins * 60);
    setSprintResult(null);
    setShowSprint(false);
    edRef.current?.focus();
  };
  const stopSprint = () => { setSprint(null); setSprintLeft(0); };

  const goToHeading = (id) => {
    const el = edRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const wordPct = doc.wordGoal ? Math.min(100, Math.round((words / doc.wordGoal) * 100)) : 0;
  const wordDone = doc.wordGoal && words >= doc.wordGoal;
  const readMin = Math.max(1, Math.round(words / 200));

  const countStats = showCount ? (() => {
    const t = edRef.current?.textContent || '';
    return { chars: t.length, noSpace: t.replace(/\s/g, '').length };
  })() : null;

  /* Small helpers to keep the ribbon JSX tidy. A button highlights
     when its command is the active state at the caret (e.g. bold). */
  const Btn = ({ cmd, val, title, children, onClick }) => (
    <button
      className={`wm-rt-btn ${cmd && marks[cmd] ? 'on' : ''}`}
      title={title}
      onClick={onClick || (() => exec(cmd, val))}
    >{children}</button>
  );

  return (
    <div
      className={`wm-focus ${prefs.hardcore ? 'hardcore' : ''}`}
      style={{ '--wm-bg': theme.bg, '--wm-text': theme.text, '--wm-faint': theme.faint }}
    >
      <input ref={fileRef} type="file" accept="image/*" onChange={onImageChosen} style={{ display: 'none' }} />

      <div className={`wm-chrome ${chromeVisible ? 'show' : 'hide'}`}>
        {/* Meta bar */}
        <div className="wm-focus-bar">
          <div className="wm-fb-left">
            <button className="wm-fb-exit" onClick={finish} title="Exit (Esc)">← Exit</button>
            {viewOnly ? (
              <>
                <span className="wm-fb-title-view">{title || 'Untitled'}</span>
                <span className="wm-view-badge">👁 Viewing</span>
              </>
            ) : (
              <input
                className="wm-fb-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Untitled"
                spellCheck={false}
              />
            )}
          </div>

          <div className="wm-fb-center">
            {doc.wordGoal > 0 && (
              <div className={`wm-goal ${wordDone ? 'done' : ''}`} title="Word goal">
                <div className="wm-goal-track"><div className="wm-goal-fill" style={{ width: `${wordPct}%` }} /></div>
                <span className="wm-goal-text">{words}/{doc.wordGoal}w</span>
              </div>
            )}
          </div>

          <div className="wm-fb-right">
            {viewOnly ? (
              <>
                <button
                  className={`wm-flow ${showGrammar ? 'on' : ''}`}
                  onClick={toggleGrammar}
                  title="Grammar & spelling check"
                >✅ Grammar</button>
                <button className="app-btn primary" onClick={() => setMode('edit')}>✎ Edit</button>
              </>
            ) : (
            <>
            <div className="wm-flowtoggles">
              <button className={`wm-flow ${showGrammar ? 'on' : ''}`} onClick={toggleGrammar} title="Grammar & spelling check">✅</button>
              <button className={`wm-flow ${prefs.dim ? 'on' : ''}`} onClick={() => toggle('dim')} title="Focus paragraph (dim the rest)">◐</button>
              <button className={`wm-flow ${prefs.typewriter ? 'on' : ''}`} onClick={() => toggle('typewriter')} title="Typewriter scrolling">⌖</button>
              <button className={`wm-flow ${prefs.hardcore ? 'on' : ''}`} onClick={() => toggle('hardcore')} title="Hardcore — no deleting">🔒</button>
            </div>

            <div className="wm-sprint-wrap">
              {sprint ? (
                <button className="wm-sprint-live" onClick={stopSprint} title="Stop sprint">⏱ {fmtClock(sprintLeft)} · Stop</button>
              ) : (
                <button className="wm-flow" onClick={() => setShowSprint(s => !s)} title="Start a writing sprint">⏱ Sprint</button>
              )}
              {showSprint && !sprint && (
                <div className="wm-sprint-menu">
                  <div className="wm-sprint-menu-label">Sprint for…</div>
                  <div className="wm-sprint-presets">
                    {SPRINT_PRESETS.map(m => <button key={m} onClick={() => startSprint(m)}>{m}m</button>)}
                  </div>
                </div>
              )}
            </div>

            <div className="wm-sound-wrap">
              <button
                className={`wm-flow ${soundType !== 'off' ? 'on' : ''}`}
                onClick={() => setShowSound(s => !s)}
                title="Ambient soundscape"
              >🎧</button>
              {showSound && (
                <div className="wm-sound-menu">
                  <div className="wm-sound-menu-label">Ambient sound</div>
                  <div className="wm-sound-opts">
                    {SOUNDSCAPES.map(s => (
                      <button
                        key={s.key}
                        className={`wm-sound-opt ${soundType === s.key ? 'on' : ''}`}
                        onClick={() => setSound(s.key)}
                      >
                        <span className="wm-sound-opt-icon">{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="wm-sound-vol">
                    <span aria-hidden="true">🔈</span>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={soundVol}
                      onChange={e => setSoundVol(parseFloat(e.target.value))}
                      disabled={soundType === 'off'}
                      aria-label="Soundscape volume"
                    />
                    <span aria-hidden="true">🔊</span>
                  </div>
                </div>
              )}
            </div>

            <div className="wm-goal-inputs" title="Set a word goal">
              <input type="number" min="0" className="wm-goal-input" value={doc.wordGoal || ''} placeholder="words" onChange={e => setGoal(e.target.value)} />
            </div>
            <div className="wm-themes">
              {THEMES.map(t => (
                <button key={t.key} className={`wm-theme-dot ${prefs.theme === t.key ? 'on' : ''}`} style={{ background: t.bg, borderColor: t.text }} title={t.label} onClick={() => setTheme(t.key)} />
              ))}
            </div>
            <div className="wm-font">
              <button onClick={() => bumpFont(-2)} title="Smaller page font">A−</button>
              <button onClick={() => bumpFont(2)} title="Larger page font">A+</button>
            </div>
            </>
            )}
          </div>
        </div>

        {/* Ribbon tab strip — hidden in view mode, there's nothing to format */}
        {viewOnly && (
          <div className="wm-view-hint">
            👁 Viewing — this document is read-only. Click <b>Edit</b> to make changes.
          </div>
        )}

        {!viewOnly && (
        <>
        <div className="wm-ribbon-tabs">
          {RIBBON_TABS.map(t => (
            <button
              key={t.id}
              className={`wm-ribbon-tab ${ribbonTab === t.id ? 'on' : ''}`}
              onClick={() => setRibbonTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        {/* Ribbon body */}
        <div className="wm-ribbon" onMouseDown={keepFocus}>
          {ribbonTab === 'home' && (
            <>
              <Grp label="Undo">
                <Btn cmd="undo" title="Undo (Ctrl+Z)">↶</Btn>
                <Btn cmd="redo" title="Redo (Ctrl+Y)">↷</Btn>
              </Grp>

              <Grp label="Font">
                <div className="wm-rt-row">
                  <select className="wm-style-select wm-font-select" value={fontName} onChange={onFont} title="Font">
                    {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                  </select>
                  <input
                    className="wm-num"
                    type="number" min="6" max="400" value={fontPx}
                    onChange={e => setFontPx(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyFontSize(parseInt(fontPx, 10)); } }}
                    onBlur={() => applyFontSize(parseInt(fontPx, 10))}
                    title="Font size (px) — Enter to apply"
                  />
                  <button className="wm-rt-btn" onClick={growFont} title="Grow font">A▲</button>
                  <button className="wm-rt-btn" onClick={shrinkFont} title="Shrink font">A▼</button>
                </div>
                <div className="wm-rt-row">
                  <Btn cmd="bold" title="Bold (Ctrl+B)"><b>B</b></Btn>
                  <Btn cmd="italic" title="Italic (Ctrl+I)"><i>I</i></Btn>
                  <Btn cmd="underline" title="Underline (Ctrl+U)"><u>U</u></Btn>
                  <Btn cmd="strikeThrough" title="Strikethrough"><s>S</s></Btn>
                  <Btn cmd="subscript" title="Subscript">X₂</Btn>
                  <Btn cmd="superscript" title="Superscript">X²</Btn>
                  <select className="wm-mini-select" defaultValue="" onChange={e => { changeCase(e.target.value); e.target.value = ''; }} title="Change case">
                    <option value="" disabled>Aa</option>
                    {CASE_OPTIONS.map(c => <option key={c.mode} value={c.mode}>{c.label}</option>)}
                  </select>
                  <button className="wm-rt-btn" onClick={clearFormatting} title="Clear all formatting">A⌫</button>
                  <label className="wm-color-wrap" title="Font color">
                    <span className="wm-color-icon">A</span>
                    <input type="color" className="wm-color" onInput={e => exec('foreColor', e.target.value)} />
                  </label>
                  <label className="wm-color-wrap" title="Text highlight color">
                    <span className="wm-color-icon wm-hl">▆</span>
                    <input type="color" className="wm-color" defaultValue="#ffff00" onInput={e => setHilite(e.target.value)} />
                  </label>
                </div>
              </Grp>

              <Grp label="Paragraph">
                <div className="wm-rt-row">
                  <Btn cmd="insertUnorderedList" title="Bullets">•≡</Btn>
                  <Btn cmd="insertOrderedList" title="Numbering">1.≡</Btn>
                  <button className="wm-rt-btn" onClick={insertChecklist} title="Checklist">☑≡</button>
                  <Btn cmd="outdent" title="Decrease indent">⇤</Btn>
                  <Btn cmd="indent" title="Increase indent">⇥</Btn>
                  <button className={`wm-rt-btn ${showMarks ? 'on' : ''}`} onClick={() => setShowMarks(s => !s)} title="Show/hide formatting marks">¶</button>
                </div>
                <div className="wm-rt-row">
                  <Btn cmd="justifyLeft" title="Align left">⯇</Btn>
                  <Btn cmd="justifyCenter" title="Center">≡</Btn>
                  <Btn cmd="justifyRight" title="Align right">⯈</Btn>
                  <Btn cmd="justifyFull" title="Justify">☰</Btn>
                  <select className="wm-mini-select" defaultValue="" onChange={e => { setLineSpacing(e.target.value); e.target.value = ''; }} title="Line spacing">
                    <option value="" disabled>↕</option>
                    {LINE_SPACINGS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </Grp>

              <Grp label="Styles">
                <select className="wm-style-select" value={blockFmt} onChange={onStyle} title="Paragraph style">
                  {STYLE_OPTIONS.map(o => <option key={o.tag} value={o.tag}>{o.label}</option>)}
                </select>
              </Grp>

              <Grp label="Editing">
                <button className="wm-rt-btn wm-rt-wide" onClick={() => setShowFind(true)} title="Find (Ctrl+F)">🔍 Find</button>
                <button className="wm-rt-btn wm-rt-wide" onClick={() => setShowFind(true)} title="Replace (Ctrl+H)">⇄ Replace</button>
              </Grp>
            </>
          )}

          {ribbonTab === 'insert' && (
            <>
              <Grp label="Tables">
                <button className="wm-rt-btn wm-rt-wide" onClick={insertTable} title="Insert table">▦ Table</button>
              </Grp>
              <Grp label="Illustrations">
                <button className="wm-rt-btn wm-rt-wide" onClick={onPickImage} title="Insert picture">🖼 Picture</button>
                <div className="wm-sym-wrap">
                  <button className="wm-rt-btn wm-rt-wide" onClick={() => setShowSym(s => !s)} title="Insert symbol">Ω Symbol</button>
                  {showSym && (
                    <div className="wm-sym-menu">
                      {SYMBOLS.map(s => <button key={s} onClick={() => insertSymbol(s)}>{s}</button>)}
                    </div>
                  )}
                </div>
              </Grp>
              <Grp label="Header & Footer">
                <button className="wm-rt-btn wm-rt-wide" onClick={addHeader} title="Add header">⌅ Header</button>
                <button className="wm-rt-btn wm-rt-wide" onClick={addFooter} title="Add footer">⌄ Footer</button>
                <button className={`wm-rt-btn wm-rt-wide ${doc.showPageNum ? 'on' : ''}`} onClick={togglePageNum} title="Page numbers"># Page №</button>
              </Grp>
              <Grp label="Text">
                <button className="wm-rt-btn" onClick={insertDate} title="Insert today's date">📅</button>
                <button className="wm-rt-btn" onClick={() => exec('insertHorizontalRule')} title="Horizontal line">―</button>
                <div className="wm-verse-wrap">
                  <button className={`wm-rt-btn wm-rt-wide ${showVerse ? 'on' : ''}`} onClick={() => setShowVerse(s => !s)} title="Insert Scripture">✝ Verse</button>
                  {showVerse && (
                    <div className="wm-verse-pop">
                      <input
                        className="wm-find-input"
                        placeholder="Reference (e.g. John 3:16)"
                        value={verseRef}
                        onChange={e => { setVerseRef(e.target.value); setVerseErr(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insertVerse(); } }}
                        autoFocus
                      />
                      <select
                        className="wm-mini-select wm-verse-trans"
                        value={verseTrans}
                        onChange={e => setVerseTrans(e.target.value)}
                      >
                        <option value="kjv">KJV</option>
                        <option value="web">WEB</option>
                        <option value="bbe">BBE</option>
                        <option value="oeb-us">OEB</option>
                        <option value="asv">ASV</option>
                      </select>
                      {verseErr && <div className="wm-verse-err">{verseErr}</div>}
                      <div className="wm-verse-actions">
                        <button className="wm-rt-btn" onClick={() => { setShowVerse(false); setVerseErr(''); }}>Cancel</button>
                        <button className="wm-rt-btn wm-verse-go" onClick={insertVerse} disabled={!verseRef.trim() || verseBusy}>
                          {verseBusy ? 'Fetching…' : 'Insert'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Grp>
              <Grp label="Pages">
                <button className="wm-rt-btn wm-rt-wide" onClick={insertPageBreak} title="Insert page break">⎘ Break</button>
              </Grp>
            </>
          )}

          {ribbonTab === 'layout' && (
            <Grp label="Page Setup">
              <label className="wm-field">
                <span>Margins</span>
                <select className="wm-style-select" value={ps.margins} onChange={e => setPageSetup({ margins: e.target.value })}>
                  {Object.entries(MARGIN_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="wm-field">
                <span>Orientation</span>
                <select className="wm-style-select" value={ps.orientation} onChange={e => setPageSetup({ orientation: e.target.value })}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label className="wm-field">
                <span>Size</span>
                <select className="wm-style-select" value={ps.size} onChange={e => setPageSetup({ size: e.target.value })}>
                  {Object.entries(PAGE_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
            </Grp>
          )}

          {ribbonTab === 'references' && (
            <Grp label="Table of Contents">
              <button className="wm-rt-btn wm-rt-wide" onClick={insertTOC} title="Insert / update contents">▤ Insert / Update</button>
            </Grp>
          )}

          {ribbonTab === 'view' && (
            <>
              <Grp label="Show">
                <button className={`wm-rt-btn wm-rt-wide ${showOutline ? 'on' : ''}`} onClick={() => setShowOutline(s => !s)} title="Outline / navigation pane">☰ Outline</button>
                <button className={`wm-rt-btn wm-rt-wide ${showMarks ? 'on' : ''}`} onClick={() => setShowMarks(s => !s)} title="Formatting marks">¶ Marks</button>
              </Grp>
              <Grp label="Zoom">
                <button className="wm-rt-btn" onClick={() => setZoom(z => Math.max(50, z - 10))} title="Zoom out">−</button>
                <select className="wm-mini-select" value={zoom} onChange={e => setZoom(parseInt(e.target.value, 10))} title="Zoom">
                  {ZOOM_LEVELS.map(z => <option key={z} value={z}>{z}%</option>)}
                </select>
                <button className="wm-rt-btn" onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in">+</button>
              </Grp>
              <Grp label="Document">
                <button className="wm-rt-btn wm-rt-wide" onClick={() => setShowCount(s => !s)} title="Word count">📊 Count</button>
                <button className="wm-rt-btn wm-rt-wide" onClick={printDoc} title="Print">🖨 Print</button>
                <button className="wm-rt-btn wm-rt-wide" onClick={exportDoc} title="Export to Word (.doc)">⬇ Word</button>
                <button className="wm-rt-btn wm-rt-wide" onClick={() => setChromeVisible(false)} title="Hide toolbars (move mouse to bring back)">⛶ Focus</button>
              </Grp>
              {showCount && countStats && (
                <div className="wm-count-pop wm-count-inline">
                  <div className="wm-count-row"><span>Words</span><b>{words.toLocaleString()}</b></div>
                  <div className="wm-count-row"><span>Characters</span><b>{countStats.chars.toLocaleString()}</b></div>
                  <div className="wm-count-row"><span>No spaces</span><b>{countStats.noSpace.toLocaleString()}</b></div>
                  <div className="wm-count-row"><span>Reading time</span><b>{readMin} min</b></div>
                </div>
              )}
            </>
          )}
        </div>

        {showFind && (
          <div className="wm-find">
            <input className="wm-find-input" placeholder="Find" value={findText} onChange={e => setFindText(e.target.value)} autoFocus />
            <input className="wm-find-input" placeholder="Replace with" value={replaceText} onChange={e => setReplaceText(e.target.value)} />
            <button className="wm-rt-btn" onClick={findNext} title="Find next">Find</button>
            <button className="wm-rt-btn" onClick={replaceOne} title="Replace">Replace</button>
            <button className="wm-rt-btn" onClick={replaceAll} title="Replace all">All</button>
            <button className="wm-rt-btn" onClick={() => setShowFind(false)} title="Close">✕</button>
          </div>
        )}
        </>
        )}
      </div>

      <div className="wm-workspace">
        {showOutline && !viewOnly && (
          <aside className="wm-outline">
            <div className="wm-outline-title">Outline</div>
            {outline.length === 0 ? (
              <div className="wm-outline-empty">No headings yet. Apply Title / Heading styles to build an outline.</div>
            ) : (
              <ul>
                {outline.map(o => (
                  <li key={o.id} className={`wm-ol-${o.level}`}>
                    <button onClick={() => goToHeading(o.id)}>{o.text}</button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        <div className="wm-canvas" ref={stageRef}>
          <div className="wm-page" style={pageStyle}>
            {/* Background: one real sheet per page; grows as you write. */}
            <div className="wm-sheets" aria-hidden="true">
              {Array.from({ length: pageCount }).map((_, i) => (
                <div className="wm-sheet" key={i}>
                  {doc.showPageNum && (
                    <span className="wm-sheet-num">
                      Page {i + 1}{pageCount > 1 ? ` of ${pageCount}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Foreground: header band, editor, footer band — overlaid. */}
            <div className="wm-pagebody">
              {doc.hasHeader && (
                <div className="wm-band wm-band-h">
                  <div className="wm-band-edit" contentEditable={!viewOnly} suppressContentEditableWarning ref={headerRef} onBlur={saveHeader} data-ph="Header" />
                </div>
              )}

              <div
                ref={edRef}
                className={`wm-body ${prefs.dim ? 'wm-dim-on' : ''} ${showMarks ? 'wm-show-marks' : ''} ${viewOnly ? 'wm-body-readonly' : ''}`}
                contentEditable={!viewOnly}
                suppressContentEditableWarning
                spellCheck={!viewOnly}
                onInput={onInput}
                onBeforeInput={onBeforeInput}
                onKeyDown={onKeyDown}
                onClick={onEditorClick}
                onMouseDown={onEditorMouseDown}
                style={{ fontSize: `${prefs.fontSize || 18}px` }}
              />

              {doc.hasFooter && (
                <div className="wm-band wm-band-f">
                  <div className="wm-band-edit" contentEditable={!viewOnly} suppressContentEditableWarning ref={footerRef} onBlur={saveFooter} data-ph="Footer" />
                </div>
              )}
            </div>
          </div>
        </div>

        {showGrammar && (
          <aside className="wm-grammar">
            <div className="wm-grammar-head">
              <span>
                {grammarIssues.length === 0
                  ? 'Grammar Check'
                  : `${grammarIssues.length} suggestion${grammarIssues.length === 1 ? '' : 's'}`}
              </span>
              <button onClick={runGrammarCheck} title="Re-check the current text">🔄</button>
            </div>
            {grammarIssues.length === 0 ? (
              <div className="wm-grammar-empty">No issues found 🎉</div>
            ) : (
              grammarIssues.map((iss, i) => (
                <div key={i} className="wm-gm-issue-card">
                  <span className={`wm-gm-tag wm-gm-tag-${iss.type}`}>{iss.label}</span>
                  <div className="wm-gm-issue-text">
                    “{iss.match}”{iss.suggestion ? <> → <strong>{iss.suggestion}</strong></> : null}
                  </div>
                  <div className="wm-gm-issue-msg">{iss.message}</div>
                </div>
              ))
            )}
          </aside>
        )}
      </div>

      <div className={`wm-focus-foot ${chromeVisible ? 'show' : 'hide'}`}>
        <span>{words.toLocaleString()} words</span>
        <span>·</span>
        <span>{pageCount} page{pageCount === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{readMin} min read</span>
        <span>·</span>
        <span>{fmtClock(elapsed)} elapsed</span>
        <span>·</span>
        <span className={`wm-save ${saveState}`}>{saveState === 'saving' ? 'Saving…' : 'Saved'}</span>
        {prefs.hardcore && <><span>·</span><span className="wm-hc-note">🔒 no deleting</span></>}
        <span className="wm-foot-zoom">
          <button onClick={() => setZoom(z => Math.max(50, z - 10))}>−</button>
          <span>{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 10))}>+</button>
        </span>
      </div>

      {sprintResult && (
        <div className="wm-sprint-result" role="status">
          <div className="wm-sprint-result-big">{sprintResult.words.toLocaleString()} words</div>
          <div className="wm-sprint-result-sub">in your {sprintResult.mins}-minute sprint 🎉</div>
          <button className="wm-sprint-result-close" onClick={() => setSprintResult(null)}>Keep writing</button>
        </div>
      )}
    </div>
  );
}
