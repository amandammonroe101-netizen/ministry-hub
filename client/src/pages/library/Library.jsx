import { useState, useEffect, useRef, useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { auth } from '../../lib/firebase';
import { uploadBlob } from '../../lib/userStorage';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import { downloadGuideDocx } from '../../lib/downloadGuideDocx';
import { LIBRARY_GUIDE } from './libraryGuide';
import './Library.css';

/* ─────────────────────────────────────────────────────────────
   Library — a single standalone page for Books and Bible
   Studies, presented as a movable sticky-note board.

   • Notes are dragged anywhere on the board and keep their x/y.
   • Double-clicking a note opens a tabbed editor; the tab set
     differs per note type (book vs study).
   • Books carry status / rating / reading progress / cover /
     start+finish dates, and feed a board-level reading goal.
   • Bible studies support scripture auto-linking, a dated
     session log, cross-references + related-note links, and a
     memory-verse flashcard mode generated from their passages.
   • Everything persists to the per-user key 'library:board'.
   ───────────────────────────────────────────────────────────── */

/* Canonical book names (+ a few common short forms) used to
   detect scripture references in free text so we can render
   them as tappable links. */
const BIBLE_BOOKS = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Psalm','Proverbs','Ecclesiastes',
  'Song of Songs','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel',
  'Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk',
  'Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts',
  'Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians',
  'Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus',
  'Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John',
  'Jude','Revelation',
  'Gen','Exod','Lev','Num','Deut','Ps','Prov','Eccl','Isa','Jer','Ezek','Matt',
  'Rom','1 Cor','2 Cor','Gal','Eph','Phil','Col','1 Thess','2 Thess','Heb','Rev',
];

/* Longest-first so "1 John" wins over "John", "Song of Songs"
   over a bare match, etc. */
const REF_REGEX = new RegExp(
  '\\b(?:' +
    [...BIBLE_BOOKS].sort((a, b) => b.length - a.length)
      .map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
  ')\\.?\\s+\\d{1,3}(?::\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?)?(?:\\s?[-–]\\s?\\d{1,3})?',
  'g'
);

function findRefs(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  const seen = new Set();
  let m;
  REF_REGEX.lastIndex = 0;
  while ((m = REF_REGEX.exec(text)) !== null) {
    const ref = m[0].trim();
    if (!seen.has(ref)) { seen.add(ref); out.push(ref); }
  }
  return out;
}

function refUrl(ref) {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=ESV`;
}

/* Per-type config: sticky color + the set of tabs. Tabs are
   either declarative (a list of `fields`) or carry a `custom`
   key handled by a dedicated renderer. */
const TYPES = {
  book: {
    label: 'Book',
    color: '#fcd34d',
    tabs: [
      { key: 'overview', label: 'Overview', icon: '📖', fields: [
        { key: 'author',   label: 'Author',          type: 'text' },
        { key: 'category', label: 'Category / Genre', type: 'text' },
        { key: 'status',   label: 'Status',          type: 'select', options: ['To Read', 'Reading', 'Finished'] },
        { key: 'rating',   label: 'Rating',          type: 'rating' },
        { key: 'coverUrl', label: 'Cover image URL', type: 'cover' },
        { key: 'progress', label: 'Reading progress', type: 'progress' },
        { key: 'started',  label: 'Date started',    type: 'date' },
        { key: 'finished', label: 'Date finished',   type: 'date' },
      ] },
      { key: 'notes',    label: 'Notes',    icon: '📝', fields: [{ key: 'notes',    type: 'textarea', placeholder: 'Your thoughts, takeaways, summaries…' }] },
      { key: 'quotes',   label: 'Quotes',   icon: '❝',  fields: [{ key: 'quotes',   type: 'textarea', placeholder: 'Favorite quotes and page numbers…' }] },
      { key: 'chapters', label: 'Chapters', icon: '📚', custom: 'chapters' },
    ],
  },
  study: {
    label: 'Bible Study',
    color: '#7dd3fc',
    tabs: [
      { key: 'overview', label: 'Overview', icon: '📘', fields: [
        { key: 'passage', label: 'Book / Passage', type: 'text' },
        { key: 'leader',  label: 'Leader / Source', type: 'text' },
        { key: 'status',  label: 'Status',          type: 'select', options: ['Planned', 'In Progress', 'Completed'] },
      ] },
      { key: 'passages',    label: 'Passages',    icon: '✝',  fields: [{ key: 'passages', type: 'scripture', placeholder: 'Key verses, one per line — e.g. John 3:16 For God so loved…' }], flashcards: true },
      { key: 'questions',   label: 'Questions',   icon: '❓', fields: [{ key: 'questions', type: 'textarea', placeholder: 'Discussion / study questions…' }] },
      { key: 'reflections', label: 'Reflections', icon: '💭', fields: [{ key: 'reflections', type: 'textarea', placeholder: 'What is God teaching you here?' }] },
      { key: 'sessions',    label: 'Sessions',    icon: '📅', custom: 'sessions' },
      { key: 'links',       label: 'Links',       icon: '🔗', custom: 'links' },
    ],
  },
};

/* Highlighter palette for the recolor quick-action — a sticky can
   be set to any of these. */
const NOTE_COLORS = [
  '#fcd34d', // amber
  '#fdba74', // orange
  '#fca5a5', // red
  '#fda4af', // rose
  '#f9a8d4', // pink
  '#c4b5fd', // violet
  '#a5b4fc', // indigo
  '#93c5fd', // blue
  '#7dd3fc', // sky
  '#67e8f9', // cyan
  '#5eead4', // teal
  '#86efac', // green
  '#bef264', // lime
  '#e2e8f0', // slate
  '#f8fafc', // white
];

const DEFAULT_BOARD = { notes: [], goal: 24, frames: [], folders: [] };

/* Default sticky footprint — used by the tidy-board layout and
   the mini-map's scaled rectangles. */
const NOTE_W = 200;
const NOTE_H = 150;

/* Folder card footprint — used to hit-test a note dragged onto a
   folder so it "jumps in," mirroring the frame drop logic. */
const FOLDER_W = 250;
const FOLDER_H = 96;

/* Little encouragements shown (with confetti) when a book is
   finished or a study completed. */
const CHEERS = [
  'Well done! 🎉',
  'Another one in the books. 📚',
  'Keep the momentum going! 🔥',
  'God is growing you. 🌱',
  'Faithful in the little things. 🙌',
  'Progress, not perfection. ✨',
];
function randomCheer() { return CHEERS[Math.floor(Math.random() * CHEERS.length)]; }

/* Fetch verse text for a reference from the free bible-api.com
   (World English Bible — no key required, CORS-enabled). */
async function fetchVerseText(ref) {
  const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=web`);
  if (!res.ok) throw new Error('verse lookup failed');
  const data = await res.json();
  return (data.text || '').replace(/\s*\n\s*/g, ' ').trim();
}

/* ── Tiny, dependency-free Markdown renderer ──
   The source is HTML-escaped first, then only our own tags are
   injected, so the output is safe for dangerouslySetInnerHTML.
   Links are restricted to http/https/mailto schemes. */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(s) {
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
    const url = u.trim();
    return /^(https?:|mailto:)/i.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${t}</a>`
      : m;
  });
  return s;
}
function mdToHtml(src) {
  if (!src) return '';
  const lines = escapeHtml(src).split('\n');
  const out = [];
  let i = 0, inList = null;
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeList();
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    if (/^[-*]\s+/.test(line)) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`); i++; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`); i++; continue;
    }
    if (!line.trim()) { closeList(); i++; continue; }
    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

function statusOptions(type) {
  const ov = TYPES[type].tabs[0].fields?.find(f => f.key === 'status');
  return ov?.options || [];
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const y = new Date(dateStr).getFullYear();
  return Number.isFinite(y) ? y : null;
}

/* First meaningful free-text value for the board preview. */
function previewText(note) {
  const fields = note.fields || {};
  for (const tab of TYPES[note.type].tabs) {
    if (!tab.fields) continue;
    for (const f of tab.fields) {
      if (f.type !== 'textarea' && f.type !== 'scripture') continue;
      const v = fields[f.key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

const STATUS_CLASS = {
  'To Read': 'toread', 'Reading': 'reading', 'Finished': 'finished',
  'Planned': 'toread', 'In Progress': 'reading', 'Completed': 'finished',
};

/* PowerPoint-style smart guides. Given the dragged item's box and
   the boxes of everything else on the board, snap its edges/centers
   to nearby ones and return the adjusted position plus the guide
   lines to draw (each line spans from the dragged item to its
   alignment partner). */
const SNAP_THRESHOLD = 6;
function computeSnap(box, others) {
  const dragX = [box.x, box.x + box.w / 2, box.x + box.w];           // left, center, right
  const dragY = [box.y, box.y + box.h / 2, box.y + box.h];           // top, middle, bottom
  let bestX = null, bestY = null;
  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w];
    const oy = [o.y, o.y + o.h / 2, o.y + o.h];
    for (const dv of dragX) for (const ov of ox) {
      const d = ov - dv;
      if (Math.abs(d) <= SNAP_THRESHOLD && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, pos: ov, target: o };
    }
    for (const dv of dragY) for (const ov of oy) {
      const d = ov - dv;
      if (Math.abs(d) <= SNAP_THRESHOLD && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, pos: ov, target: o };
    }
  }
  const x = box.x + (bestX ? bestX.delta : 0);
  const y = box.y + (bestY ? bestY.delta : 0);
  const guides = [];
  if (bestX) {
    const t = bestX.target;
    guides.push({ axis: 'v', pos: bestX.pos, start: Math.min(y, t.y), end: Math.max(y + box.h, t.y + t.h) });
  }
  if (bestY) {
    const t = bestY.target;
    guides.push({ axis: 'h', pos: bestY.pos, start: Math.min(x, t.x), end: Math.max(x + box.w, t.x + t.w) });
  }
  return { x, y, guides };
}

export default function Library() {
  const [board, setBoard, { loading }] = useUserStoreKey('library:board', DEFAULT_BOARD);
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* Local working copy hydrated once, then drives the UI. A
     debounced effect pushes back so dragging/typing doesn't
     hammer Firestore on every event. */
  const [notes, setNotes] = useState(null);
  const [goal, setGoal] = useState(24);
  const [frames, setFrames] = useState(null);
  const [folders, setFolders] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [mode, setMode] = useState('view');        // 'view' | 'edit'
  const [paletteId, setPaletteId] = useState(null); // note id whose recolor popover is open
  const [showMap, setShowMap] = useState(true);     // mini-map visibility
  const [toast, setToast] = useState(null);         // delight toast message
  const [confetti, setConfetti] = useState(null);   // active confetti burst id
  const goalCelebrated = useRef(false);

  useEffect(() => {
    if (notes === null && !loading) {
      setNotes(Array.isArray(board?.notes) ? board.notes : []);
      setGoal(Number(board?.goal) || 24);
      setFrames(Array.isArray(board?.frames) ? board.frames : []);
      setFolders(Array.isArray(board?.folders) ? board.folders : []);
    }
  }, [loading, board, notes]);

  useEffect(() => {
    if (notes === null) return;
    const t = setTimeout(() => {
      setBoard({ notes, goal, frames: frames || [], folders: folders || [] });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, goal, frames, folders]);

  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const frameDragRef = useRef(null);
  const folderDragRef = useRef(null);
  const resizeRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [draggingFrame, setDraggingFrame] = useState(null);
  const [draggingFolder, setDraggingFolder] = useState(null);
  const [hoverFrameId, setHoverFrameId] = useState(null);  // frame highlighted during a note drag
  const [hoverFolderId, setHoverFolderId] = useState(null);// folder highlighted while a note is dragged over it
  const [dropId, setDropId] = useState(null);              // note highlighted during a cover file-drop
  const [openFolderId, setOpenFolderId] = useState(null);  // folder whose drill-in board is showing
  const [folderMenuId, setFolderMenuId] = useState(null);  // note whose "file into series" menu is open
  const [guides, setGuides] = useState([]);                // active alignment guide lines while dragging

  /* Filter to known types so any note saved under a removed type
     (e.g. a former Devotion) doesn't crash the render. */
  const list = (notes || []).filter(n => TYPES[n.type]);
  const openNote = list.find(n => n.id === openId) || null;

  /* Reading-goal stat: books finished this calendar year (count
     a finished book with no recorded date toward this year). */
  const thisYear = new Date().getFullYear();
  const finishedThisYear = useMemo(
    () => list.filter(n =>
      n.type === 'book'
      && n.fields?.status === 'Finished'
      && (yearOf(n.fields?.finished) === thisYear || !n.fields?.finished)
    ).length,
    [list, thisYear]
  );

  /* ── Motivation / delight ── */
  function celebrate(msg) {
    const id = Date.now();
    setToast(msg);
    setConfetti(id);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 3200);
    setTimeout(() => setConfetti(c => (c === id ? null : c)), 2800);
  }

  /* Fire a one-time celebration the moment the yearly goal is met. */
  useEffect(() => {
    if (goal > 0 && finishedThisYear >= goal) {
      if (!goalCelebrated.current) {
        goalCelebrated.current = true;
        celebrate(`🎉 ${thisYear} reading goal reached — ${finishedThisYear}/${goal} books!`);
      }
    } else {
      goalCelebrated.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedThisYear, goal]);

  function addNote(type) {
    const scroll = boardRef.current;
    const baseX = (scroll?.scrollLeft || 0) + 40 + (list.length % 5) * 24;
    const baseY = (scroll?.scrollTop || 0) + 40 + (list.length % 5) * 24;
    const note = {
      id: makeId(),
      type,
      title: `New ${TYPES[type].label}`,
      x: baseX,
      y: baseY,
      rot: (Math.random() * 4 - 2),
      pinned: false,
      color: '',
      fields: {},
      sessions: [],
      relatedIds: [],
      folderId: openFolderId || null,   // new notes land in the open folder, or on the main board
    };
    setNotes(ns => [...(ns || []), note]);
    setActiveTab(TYPES[type].tabs[0].key);
    setMode('edit');           // new notes open straight into edit mode
    setOpenId(note.id);
  }

  function openNoteView(id) {
    const n = list.find(x => x.id === id);
    if (!n) return;
    setActiveTab(TYPES[n.type].tabs[0].key);
    setMode('view');
    setOpenId(id);
  }

  function updateNote(id, patch) {
    setNotes(ns => ns.map(n => (n.id === id ? { ...n, ...patch } : n)));
  }
  function updateField(id, key, value) {
    setNotes(ns => ns.map(n => (n.id === id ? { ...n, fields: { ...n.fields, [key]: value } } : n)));
  }
  function deleteNote(id) {
    setNotes(ns => ns.filter(n => n.id !== id).map(n => ({
      ...n,
      relatedIds: (n.relatedIds || []).filter(r => r !== id),
    })));
    if (openId === id) setOpenId(null);
  }

  /* ── Sticky quick actions (no modal) ── */
  function cycleStatus(note) {
    const opts = statusOptions(note.type);
    if (!opts.length) return;
    const cur = note.fields?.status || opts[0];
    const i = opts.indexOf(cur);
    const next = opts[(i + 1) % opts.length];
    updateField(note.id, 'status', next);
    if ((next === 'Finished' || next === 'Completed') && cur !== next) {
      celebrate(`${next === 'Finished' ? '📖' : '✅'} ${note.title || TYPES[note.type].label} — ${randomCheer()}`);
    }
  }
  function setRating(note, n) {
    const stars = '★'.repeat(n);
    updateField(note.id, 'rating', (note.fields?.rating === stars) ? '—' : stars);
  }
  function bumpPage(note, delta) {
    const tot = Number(note.fields?.totalPages) || 0;
    let next = (Number(note.fields?.currentPage) || 0) + delta;
    next = Math.max(0, tot ? Math.min(tot, next) : next);
    updateField(note.id, 'currentPage', String(next));
    if (tot && next >= tot) {
      if (note.fields?.status !== 'Finished') celebrate(`📖 Finished "${note.title || TYPES[note.type].label}" — ${randomCheer()}`);
      updateField(note.id, 'status', 'Finished');
    } else if (next > 0 && note.fields?.status === 'To Read') {
      updateField(note.id, 'status', 'Reading');
    }
  }
  function duplicateNote(note) {
    const copy = {
      ...note,
      id: makeId(),
      title: `${note.title || TYPES[note.type].label} (copy)`,
      x: note.x + 26,
      y: note.y + 26,
      pinned: false,
      fields: { ...note.fields },
      sessions: (note.sessions || []).map(s => ({ ...s, id: makeId() })),
      relatedIds: [...(note.relatedIds || [])],
    };
    setNotes(ns => [...ns, copy]);
  }
  function togglePin(note) { updateNote(note.id, { pinned: !note.pinned }); }
  function recolor(note, color) { updateNote(note.id, { color }); setPaletteId(null); }

  /* ── Frame helpers ── */
  /* Topmost frame whose rectangle contains the point, or null. */
  function frameAt(cx, cy) {
    const fs = frames || [];
    for (let i = fs.length - 1; i >= 0; i--) {
      const fr = fs[i];
      if (cx >= fr.x && cx <= fr.x + fr.w && cy >= fr.y && cy <= fr.y + fr.h) return fr;
    }
    return null;
  }

  function addFrame() {
    const scroll = boardRef.current;
    const x = (scroll?.scrollLeft || 0) + 60;
    const y = (scroll?.scrollTop || 0) + 60;
    setFrames(fs => [...(fs || []), { id: makeId(), title: 'New group', x, y, w: 380, h: 300 }]);
  }
  function updateFrame(id, patch) {
    setFrames(fs => (fs || []).map(fr => (fr.id === id ? { ...fr, ...patch } : fr)));
  }
  /* Deleting a frame un-groups its member notes (they stay put). */
  function deleteFrame(id) {
    setFrames(fs => (fs || []).filter(fr => fr.id !== id));
    setNotes(ns => ns.map(n => (n.frameId === id ? { ...n, frameId: null } : n)));
  }

  /* Bounding boxes of everything on the current board (minus the
     item being dragged) — fed to the smart-guide snapper. */
  function boardBoxes(excludeId) {
    const boxes = [];
    const scope = (notes || []).filter(n => TYPES[n.type] && (openFolderId ? n.folderId === openFolderId : !n.folderId));
    for (const n of scope) {
      if (n.id === excludeId) continue;
      boxes.push({ x: n.x, y: n.y, w: n.w || NOTE_W, h: n.h || NOTE_H });
    }
    if (!openFolderId) {
      for (const fr of (frames || [])) { if (fr.id === excludeId) continue; boxes.push({ x: fr.x, y: fr.y, w: fr.w, h: fr.h }); }
      for (const fd of (folders || [])) { if (fd.id === excludeId) continue; boxes.push({ x: fd.x, y: fd.y, w: fd.w || FOLDER_W, h: fd.h || FOLDER_H }); }
    }
    return boxes;
  }

  /* ── Note drag (pointer capture keeps events on the note) ── */
  function onPointerDown(e, note) {
    if (e.button !== 0 || note.pinned) return;
    dragRef.current = { id: note.id, startX: e.clientX, startY: e.clientY, origX: note.x, origY: note.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setNotes(ns => {
      const target = ns.find(n => n.id === note.id);
      return [...ns.filter(n => n.id !== note.id), target];
    });
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDraggingId(d.id); }
    const note = (notes || []).find(n => n.id === d.id);
    const w = (note?.w) || NOTE_W, h = (note?.h) || NOTE_H;
    const snap = computeSnap({ x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy), w, h }, boardBoxes(d.id));
    const x = Math.max(0, snap.x), y = Math.max(0, snap.y);
    setGuides(snap.guides);
    updateNote(d.id, { x, y });
    const cx = x + w / 2;
    const cy = y + h / 2;
    const fd = folderAt(cx, cy);
    setHoverFolderId(fd ? fd.id : null);
    const fr = fd ? null : frameAt(cx, cy);   // a folder drop wins over a frame
    setHoverFrameId(fr ? fr.id : null);
  }
  function onPointerUp() {
    const d = dragRef.current;
    if (d && d.moved) {
      setNotes(ns => ns.map(n => {
        if (n.id !== d.id) return n;
        const cx = n.x + ((n.w) || NOTE_W) / 2, cy = n.y + ((n.h) || NOTE_H) / 2;
        const fd = folderAt(cx, cy);
        if (fd) return { ...n, folderId: fd.id, frameId: null };  // jumped into a folder
        const fr = frameAt(cx, cy);
        return { ...n, frameId: fr ? fr.id : null };
      }));
    }
    dragRef.current = null;
    setDraggingId(null);
    setHoverFrameId(null);
    setHoverFolderId(null);
    setGuides([]);
  }

  /* ── Frame drag — moves the frame and every note inside it ── */
  function onFramePointerDown(e, fr) {
    if (e.button !== 0) return;
    const members = (notes || []).filter(n => n.frameId === fr.id).map(n => ({ id: n.id, x: n.x, y: n.y }));
    frameDragRef.current = { id: fr.id, startX: e.clientX, startY: e.clientY, origX: fr.x, origY: fr.y, members, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onFramePointerMove(e) {
    const d = frameDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDraggingFrame(d.id); }
    updateFrame(d.id, { x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy) });
    setNotes(ns => ns.map(n => {
      const m = d.members.find(mm => mm.id === n.id);
      return m ? { ...n, x: Math.max(0, m.x + dx), y: Math.max(0, m.y + dy) } : n;
    }));
  }
  function onFramePointerUp() {
    frameDragRef.current = null;
    setDraggingFrame(null);
  }

  /* ── Folders — movable "series" cards (styled like Writing mode)
     that notes get filed into. Tapping one drills into its own
     sticky-note board; notes carry a `folderId`. ── */
  function addFolder() {
    const scroll = boardRef.current;
    const x = (scroll?.scrollLeft || 0) + 80;
    const y = (scroll?.scrollTop || 0) + 80;
    setFolders(fs => [...(fs || []), { id: makeId(), name: 'New series', description: '', x, y }]);
  }
  function updateFolder(id, patch) {
    setFolders(fs => (fs || []).map(f => (f.id === id ? { ...f, ...patch } : f)));
  }
  /* Deleting a folder un-files its notes back onto the main board. */
  function deleteFolder(id) {
    setFolders(fs => (fs || []).filter(f => f.id !== id));
    setNotes(ns => ns.map(n => (n.folderId === id ? { ...n, folderId: null } : n)));
    if (openFolderId === id) setOpenFolderId(null);
  }
  function fileNote(noteId, folderId) {
    updateNote(noteId, { folderId: folderId || null });
    setFolderMenuId(null);
  }

  /* Topmost folder whose card contains the point, or null. Only
     active on the main board (folders aren't shown inside a folder). */
  function folderAt(cx, cy) {
    if (openFolderId) return null;
    const fs = folders || [];
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      const fw = f.w || FOLDER_W, fh = f.h || FOLDER_H;
      if (cx >= f.x && cx <= f.x + fw && cy >= f.y && cy <= f.y + fh) return f;
    }
    return null;
  }

  /* ── Folder drag (pointer capture, header is the grab handle).
     A clean click (no drag) drills into the folder's own board. ── */
  function onFolderPointerDown(e, fd) {
    if (e.button !== 0) return;
    folderDragRef.current = { id: fd.id, startX: e.clientX, startY: e.clientY, origX: fd.x, origY: fd.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onFolderPointerMove(e) {
    const d = folderDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDraggingFolder(d.id); }
    const fd = (folders || []).find(f => f.id === d.id);
    const w = (fd?.w) || FOLDER_W, h = (fd?.h) || FOLDER_H;
    const snap = computeSnap({ x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy), w, h }, boardBoxes(d.id));
    setGuides(snap.guides);
    updateFolder(d.id, { x: Math.max(0, snap.x), y: Math.max(0, snap.y) });
  }
  function onFolderPointerUp(e, onOpen) {
    const d = folderDragRef.current;
    const wasClick = d && !d.moved;   // started on the head and never dragged
    folderDragRef.current = null;
    setDraggingFolder(null);
    setGuides([]);
    if (wasClick && onOpen) onOpen();
  }

  /* ── Drag-to-resize (notes and frames share the move/up logic) ── */
  function onNoteResizeDown(e, note) {
    e.stopPropagation();
    if (e.button !== 0) return;
    resizeRef.current = { kind: 'note', id: note.id, startX: e.clientX, startY: e.clientY, w: note.w || NOTE_W, h: note.h || NOTE_H };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onFrameResizeDown(e, fr) {
    e.stopPropagation();
    if (e.button !== 0) return;
    resizeRef.current = { kind: 'frame', id: fr.id, startX: e.clientX, startY: e.clientY, w: fr.w, h: fr.h };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onFolderResizeDown(e, fd) {
    e.stopPropagation();
    if (e.button !== 0) return;
    resizeRef.current = { kind: 'folder', id: fd.id, startX: e.clientX, startY: e.clientY, w: fd.w || FOLDER_W, h: fd.h || FOLDER_H };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onResizeMove(e) {
    const r = resizeRef.current;
    if (!r) return;
    const w = r.w + (e.clientX - r.startX);
    const h = r.h + (e.clientY - r.startY);
    if (r.kind === 'note') updateNote(r.id, { w: Math.max(160, w), h: Math.max(120, h) });
    else if (r.kind === 'folder') updateFolder(r.id, { w: Math.max(200, w), h: Math.max(110, h) });
    else updateFrame(r.id, { w: Math.max(200, w), h: Math.max(140, h) });
  }
  function onResizeUp() { resizeRef.current = null; }

  /* ── Drag an image file onto a book note to set its cover ── */
  function onNoteDragOver(e, note) {
    if (note.type !== 'book') return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    if (dropId !== note.id) setDropId(note.id);
  }
  function onNoteDragLeave(e, note) {
    if (dropId === note.id) setDropId(null);
  }
  async function onNoteDrop(e, note) {
    if (note.type !== 'book') return;
    e.preventDefault();
    setDropId(null);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const res = await uploadBlob(auth.currentUser?.uid, 'library-covers', file);
      if (res?.url) updateField(note.id, 'coverUrl', res.url);
    } catch (err) {
      console.error('Library cover upload failed', err);
    }
  }

  /* ── Tidy board — grid-arrange loose (unpinned, unframed) notes ── */
  function tidyBoard() {
    const width = boardRef.current?.clientWidth || 1000;
    const cols = Math.max(1, Math.floor((width - 60) / (NOTE_W + 24)));
    let i = 0;
    setNotes(ns => ns.map(n => {
      if (n.pinned || n.frameId) return { ...n, rot: 0 };
      const col = i % cols, row = Math.floor(i / cols);
      i++;
      return { ...n, x: 30 + col * (NOTE_W + 24), y: 30 + row * (NOTE_H + 24), rot: 0 };
    }));
  }

  if (loading || notes === null) {
    return <div className="lib-wrap"><div className="lib-empty"><span>Loading board…</span></div></div>;
  }

  const goalPct = goal > 0 ? Math.min(100, Math.round((finishedThisYear / goal) * 100)) : 0;

  /* The board shows either the main canvas (loose, unfiled notes) or
     a single folder's drill-in canvas (just that folder's notes). */
  const openFolder = (folders || []).find(f => f.id === openFolderId) || null;
  const inFolder = !!openFolder;
  const boardNotes = inFolder
    ? list.filter(n => n.folderId === openFolder.id)
    : list.filter(n => !n.folderId);

  return (
    <div className="lib-wrap">
      <PageTourHost pageId="library" />

      <div className="lib-toolbar" data-tour="tour-topbar">
        {inFolder ? (
          <>
            <button className="lib-add ghost" onClick={() => setOpenFolderId(null)} title="Back to the main board">← All notes</button>
            <h1 className="lib-folder-crumb">📚 {openFolder.name || 'Series'}</h1>
            <span className="lib-sub">{boardNotes.length} {boardNotes.length === 1 ? 'note' : 'notes'} in this series — drag to arrange, double-click to open</span>

            {Object.entries(TYPES).filter(([type]) => type === 'book').map(([type, cfg]) => (
              <button key={type} className="lib-add" onClick={() => addNote(type)}>
                <span className="dot" style={{ background: cfg.color }} />
                New {cfg.label}
              </button>
            ))}
          </>
        ) : (
          <>
            <h1>📚 Library</h1>
            <span className="lib-sub">Books · Bible Studies — drag to arrange, double-click to open</span>

            <div className={`lib-goal ${goal > 0 && finishedThisYear >= goal ? 'done' : ''}`} title={`${finishedThisYear} of ${goal} books finished in ${thisYear}`}>
              <span className="lib-goal-label">📖 {thisYear} goal</span>
              <span className="lib-goal-count">{finishedThisYear}/</span>
              <input
                className="lib-goal-input"
                type="number"
                min="0"
                value={goal}
                onChange={e => setGoal(Math.max(0, Number(e.target.value) || 0))}
                aria-label="Reading goal"
              />
              <span className="lib-goal-bar"><span style={{ width: `${goalPct}%` }} /></span>
            </div>

            {Object.entries(TYPES).filter(([type]) => type === 'book').map(([type, cfg]) => (
              <button key={type} className="lib-add" data-tour="tour-primary-action" onClick={() => addNote(type)}>
                <span className="dot" style={{ background: cfg.color }} />
                New {cfg.label}
              </button>
            ))}

            <button className="lib-add ghost" onClick={addFolder} title="Add a series folder — drag notes in, click to open">📚 New Series</button>
          </>
        )}

        {/* Profile avatar — same shared modal Journal/Prayers/Friends use
            (Profile · Page Settings), with Library's own Page Settings
            body (How-To Guide) passed in below. */}
        <button
          className="pm-tb-avatar"
          data-tour="tour-settings"
          onClick={() => setShowProfile(true)}
          title={avatarSourceName || 'Profile'}
          aria-label="Open profile"
        >{initials}</button>
      </div>

      <div className="lib-board" ref={boardRef}>
        {boardNotes.length === 0 && (inFolder || ((frames || []).length === 0 && (folders || []).length === 0)) && (
          <div className="lib-empty">
            <span className="big">{inFolder ? '📚' : '📌'}</span>
            <span>
              {inFolder
                ? 'This series is empty — add a Book or Bible Study, or drag one in from the main board.'
                : 'No notes yet — add a Book or Bible Study to start your board.'}
            </span>
          </div>
        )}

        {/* Frames + folders only paint on the main board. */}
        {!inFolder && (frames || []).map(fr => {
          const count = (notes || []).filter(n => n.frameId === fr.id).length;
          return (
            <div
              key={fr.id}
              className={`lib-frame ${draggingFrame === fr.id ? 'dragging' : ''} ${hoverFrameId === fr.id ? 'hover' : ''}`}
              style={{ left: fr.x, top: fr.y, width: fr.w, height: fr.h }}
            >
              <div
                className="lib-frame-head"
                onPointerDown={e => onFramePointerDown(e, fr)}
                onPointerMove={onFramePointerMove}
                onPointerUp={onFramePointerUp}
              >
                <input
                  className="lib-frame-title"
                  value={fr.title}
                  onChange={e => updateFrame(fr.id, { title: e.target.value })}
                  onPointerDown={e => e.stopPropagation()}
                  placeholder="Group name"
                />
                <span className="lib-frame-count">{count}</span>
                <button className="lib-frame-del" title="Delete frame (keeps notes)" onPointerDown={e => e.stopPropagation()} onClick={() => deleteFrame(fr.id)}>✕</button>
              </div>
              <span
                className="lib-frame-resize"
                onPointerDown={e => onFrameResizeDown(e, fr)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
              />
            </div>
          );
        })}

        {!inFolder && (folders || []).map(fd => (
          <FolderCard
            key={fd.id}
            folder={fd}
            count={list.filter(n => n.folderId === fd.id).length}
            dragging={draggingFolder === fd.id}
            over={hoverFolderId === fd.id}
            onPointerDown={onFolderPointerDown}
            onPointerMove={onFolderPointerMove}
            onPointerUp={onFolderPointerUp}
            onOpen={() => setOpenFolderId(fd.id)}
            onRename={name => updateFolder(fd.id, { name })}
            onDesc={description => updateFolder(fd.id, { description })}
            onDelete={() => deleteFolder(fd.id)}
            onResizeDown={onFolderResizeDown}
            onResizeMove={onResizeMove}
            onResizeUp={onResizeUp}
          />
        ))}

        {boardNotes.map(note => {
          const cfg = TYPES[note.type];
          const preview = previewText(note);
          const f = note.fields || {};
          const status = f.status;
          const cur = Number(f.currentPage), tot = Number(f.totalPages);
          const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
          const ratingN = (f.rating && f.rating !== '—') ? f.rating.length : 0;
          const stop = e => e.stopPropagation();
          return (
            <div
              key={note.id}
              className={`lib-note ${draggingId === note.id ? 'dragging' : ''} ${note.pinned ? 'pinned' : ''} ${dropId === note.id ? 'drop' : ''}`}
              style={{
                left: note.x, top: note.y, width: note.w || undefined, minHeight: note.h || undefined,
                '--note-bg': note.color || cfg.color,
                transform: `rotate(${draggingId === note.id ? 0 : (note.rot || 0)}deg)`,
              }}
              onPointerDown={e => onPointerDown(e, note)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={() => openNoteView(note.id)}
              onDragOver={e => onNoteDragOver(e, note)}
              onDragLeave={e => onNoteDragLeave(e, note)}
              onDrop={e => onNoteDrop(e, note)}
            >
              {/* Hover toolbar — quick actions that don't open the modal */}
              <div className="lib-note-bar" onPointerDown={stop} onDoubleClick={stop}>
                <button title="Open" onClick={() => openNoteView(note.id)}>🔍</button>
                <button title="File into a series" className={note.folderId ? 'on' : ''} onClick={() => setFolderMenuId(folderMenuId === note.id ? null : note.id)}>🗂</button>
                <button title="Recolor" onClick={() => setPaletteId(paletteId === note.id ? null : note.id)}>🎨</button>
                <button title="Duplicate" onClick={() => duplicateNote(note)}>⧉</button>
                <button title={note.pinned ? 'Unpin' : 'Pin'} className={note.pinned ? 'on' : ''} onClick={() => togglePin(note)}>📌</button>
                <button title="Delete" className="danger" onClick={() => deleteNote(note.id)}>🗑</button>
              </div>

              {paletteId === note.id && (
                <div className="lib-note-palette" onPointerDown={stop} onDoubleClick={stop}>
                  {NOTE_COLORS.map(c => (
                    <button key={c} style={{ background: c }} onClick={() => recolor(note, c)} aria-label={`Color ${c}`} />
                  ))}
                </div>
              )}

              {folderMenuId === note.id && (
                <div className="lib-note-folders" onPointerDown={stop} onDoubleClick={stop}>
                  <div className="lib-note-folders-label">File into series</div>
                  {(folders || []).length === 0 && (
                    <div className="lib-note-folders-empty">No series yet — make one with “📚 New Series”.</div>
                  )}
                  {(folders || []).map(fd => (
                    <button
                      key={fd.id}
                      className={`lib-note-folders-item ${note.folderId === fd.id ? 'on' : ''}`}
                      onClick={() => fileNote(note.id, fd.id)}
                    >{note.folderId === fd.id ? '✓ ' : ''}📚 {fd.name}</button>
                  ))}
                  {note.folderId && (
                    <button className="lib-note-folders-item danger" onClick={() => fileNote(note.id, null)}>
                      Remove from series
                    </button>
                  )}
                </div>
              )}

              {note.pinned && <span className="lib-note-pin" title="Pinned">📌</span>}

              <div className="lib-note-top">
                {status && (
                  <button
                    className={`lib-status-pill ${STATUS_CLASS[status] || ''}`}
                    onPointerDown={stop}
                    onDoubleClick={stop}
                    onClick={() => cycleStatus(note)}
                    title="Click to change status"
                  >{status}</button>
                )}
              </div>

              {note.type === 'book' && f.coverUrl && (
                <img className="lib-note-cover" src={f.coverUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
              )}

              <div className="lib-note-title">{note.title || `Untitled ${cfg.label}`}</div>

              {note.type === 'book' && (
                <div className="lib-stars" onPointerDown={stop} onDoubleClick={stop}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={`lib-star ${n <= ratingN ? 'on' : ''}`}
                      onClick={() => setRating(note, n)}
                      title={`Rate ${n}`}
                    >★</button>
                  ))}
                </div>
              )}

              {preview && <div className="lib-note-preview">{preview}</div>}

              {note.type === 'book' && tot > 0 && (
                <>
                  <div className="lib-note-progress" title={`${cur} / ${tot} pages`}>
                    <span style={{ width: `${pct}%` }} />
                    <em>{pct}%</em>
                  </div>
                  <div className="lib-note-pages" onPointerDown={stop} onDoubleClick={stop}>
                    <button onClick={() => bumpPage(note, -1)} title="Back a page">−</button>
                    <span>p.{cur || 0}</span>
                    <button onClick={() => bumpPage(note, 1)} title="Read a page">+1</button>
                    <button onClick={() => bumpPage(note, 10)} title="Read 10 pages">+10</button>
                  </div>
                </>
              )}

              {!(note.type === 'book' && tot > 0) && (
                <span className="lib-note-hint">Double-click to open</span>
              )}

              {note.type === 'book' && dropId === note.id && (
                <div className="lib-note-droplay">Drop image to set cover</div>
              )}

              <span
                className="lib-note-resize"
                title="Drag to resize"
                onPointerDown={e => onNoteResizeDown(e, note)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                onDoubleClick={stop}
              />
            </div>
          );
        })}

        {/* PowerPoint-style alignment guides while dragging */}
        {guides.map((g, i) => (
          <div
            key={i}
            className={`lib-guide ${g.axis}`}
            style={g.axis === 'v'
              ? { left: g.pos, top: g.start, height: Math.max(1, g.end - g.start) }
              : { left: g.start, top: g.pos, width: Math.max(1, g.end - g.start) }}
          />
        ))}
      </div>

      {showMap && (boardNotes.length > 0 || (!inFolder && (frames || []).length > 0)) && (
        <MiniMap notes={boardNotes} frames={inFolder ? [] : (frames || [])} boardRef={boardRef} />
      )}

      {confetti && <Confetti key={confetti} />}
      {toast && <div className="lib-toast" role="status">{toast}</div>}

      {openNote && (
        <NoteModal
          note={openNote}
          allNotes={list}
          mode={mode}
          setMode={setMode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onTitle={title => updateNote(openNote.id, { title })}
          onField={(key, value) => updateField(openNote.id, key, value)}
          onPatch={patch => updateNote(openNote.id, patch)}
          onOpenNote={openNoteView}
          onDelete={() => deleteNote(openNote.id)}
          onClose={() => setOpenId(null)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageSettings={<LibraryPageSettings />}
      />
    </div>
  );
}

/* ───────────────────── Page Settings — How-To Guide ───────────────────── */

function LibraryPageSettings() {
  const [activeSub, setActiveSub] = useState('howto');
  const SUB_TABS = [
    { id: 'howto', label: '❓', name: 'How-To Guide' },
  ];

  return (
    <div className="lib-ps-root">
      <div className="pm-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`pm-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="pm-ps-subtab-icon">{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {/* ───────── ❓ How-To Guide (howto sub-tab) ─────────
            A full, typed-out reference guide to the Library page,
            written in-app so users don't have to go hunting for
            documentation. Mirrors docs/LIBRARY_HOW_TO_USE.docx and
            the Journal/Prayers/Friends How-To sub-tabs. */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="lib-ps-howto-title-row">
          <div className="pm-ps-section-title">❓ How-To Guide — Library</div>
          <button
            type="button"
            className="lib-ps-howto-download"
            onClick={() => downloadGuideDocx(LIBRARY_GUIDE, 'Library-How-To-Use.docx')}
          >⬇ Download as Word doc</button>
        </div>

        <div className="lib-ps-howto-feedback">
          <span className="lib-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="lib-ps-howto-intro">
          A full walkthrough of the Library page — your Books and Bible Studies sticky-note
          board. Skim the headers below or read start to finish.
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">📚 Adding a Book or Bible Study</div>
          <div className="lib-ps-howto-p">
            <b>New Book</b> and <b>New Bible Study</b> in the toolbar drop a new sticky note
            onto the board near your current scroll position and open it straight into
            <b> Edit mode</b> so you can start filling it in right away.
          </div>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">📌 Working with Sticky Notes</div>
          <div className="lib-ps-howto-p">
            Notes behave like real sticky notes on a corkboard:
          </div>
          <ul className="lib-ps-howto-list">
            <li><b>Drag</b> a note anywhere to move it — alignment guides snap it to nearby notes, groups, and folders as you go.</li>
            <li><b>Resize</b> by dragging the handle in a note's bottom-right corner.</li>
            <li><b>Double-click</b> a note to open the full editor.</li>
            <li><b>Drag an image file</b> onto a Book note to set its cover.</li>
          </ul>
          <div className="lib-ps-howto-p">
            Hover a note to reveal quick actions: <b>🔍 Open</b>, <b>🗂 File into a series</b>,
            <b> 🎨 Recolor</b>, <b>⧉ Duplicate</b>, <b>📌 Pin</b> (locks it in place), and
            <b> 🗑 Delete</b>.
          </div>
          <div className="lib-ps-howto-p">
            Right on the note itself: click the <b>status pill</b> to cycle its status
            (finishing a book or completing a study triggers a confetti celebration), click a
            <b> star</b> to rate a book 1–5, and use the <b>−, +1, +10 page buttons</b> to log
            reading progress once a total page count is set.
          </div>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">📖 Book Notes</div>
          <ul className="lib-ps-howto-list">
            <li><b>Overview</b> — author, category, status, rating, cover image, reading progress, and start/finish dates.</li>
            <li><b>Notes</b> — a Markdown area for thoughts, takeaways, and summaries.</li>
            <li><b>Quotes</b> — a separate Markdown area for favorite quotes and page numbers.</li>
            <li><b>Chapters</b> — one sub-tab per chapter, each with its own notes; add, rename, or delete chapters freely.</li>
          </ul>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">📘 Bible Study Notes</div>
          <ul className="lib-ps-howto-list">
            <li><b>Overview</b> — book/passage, leader or source, and status.</li>
            <li><b>Passages</b> — key verses, one per line; also launches the memory-verse flashcards.</li>
            <li><b>Questions</b> and <b>Reflections</b> — Markdown areas for discussion questions and personal reflection.</li>
            <li><b>Sessions</b> — a dated log of each sitting or week of the study.</li>
            <li><b>Links</b> — cross-references plus a checklist to connect this study to any other note as a related note.</li>
          </ul>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">✝ Scripture Tools</div>
          <div className="lib-ps-howto-p">
            Anywhere you type Bible text, recognized references (e.g. "Romans 8:28") turn into
            clickable chips linking to BibleGateway (ESV). Click the <b>📥</b> button next to a
            chip to auto-fetch its verse text (World English Bible). On a Bible Study's Passages
            tab, click <b>🎴 Memory-verse flashcards</b> to turn each line into a flip card for
            memorization practice.
          </div>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">🗂 Organizing Your Board</div>
          <ul className="lib-ps-howto-list">
            <li><b>Groups</b> — a labeled rectangle you drag notes into to cluster them visually; delete a group and its notes stay put.</li>
            <li><b>Series (folders)</b> — a movable card you drag notes onto to file them; click its header to drill into a dedicated sub-board for that series, with a "← All notes" button to return. Deleting a series returns its notes to the main board.</li>
            <li><b>Tidy Board</b> — snaps loose (unpinned, ungrouped) notes into a clean grid.</li>
            <li><b>Mini-map</b> — click anywhere on it to jump the board to that spot.</li>
          </ul>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">🎯 Your Reading Goal</div>
          <div className="lib-ps-howto-p">
            The toolbar's reading-goal tracker counts books marked Finished this calendar year
            against a target you set — type a new number into the field at any time. Reaching
            your goal triggers a one-time confetti celebration.
          </div>
        </div>

        <div className="lib-ps-howto-block">
          <div className="lib-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="lib-ps-howto-list">
            <li><b>"The board looks empty."</b> — check whether you're inside a series; click "← All notes" to return to the main board.</li>
            <li><b>"I can't drag a note."</b> — it's likely pinned; click 📌 in its hover toolbar to unpin it.</li>
            <li><b>"My cover image didn't upload."</b> — only image files can be dropped, and only onto Book notes; you can also paste a direct image URL into the Cover field.</li>
            <li><b>"Changes don't seem to be saving."</b> — everything autosaves shortly after you stop typing or dragging; make sure you're signed in and online.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}

/* ───────────────────────── Modal ───────────────────────── */

function NoteModal({ note, allNotes, mode, setMode, activeTab, setActiveTab, onTitle, onField, onPatch, onOpenNote, onDelete, onClose }) {
  const cfg = TYPES[note.type];
  const accent = note.color || cfg.color;
  const tab = cfg.tabs.find(t => t.key === activeTab) || cfg.tabs[0];
  const fields = note.fields || {};
  const [flash, setFlash] = useState(false);
  const [tabPalette, setTabPalette] = useState(null); // tab key whose color picker is open
  const tabColors = note.tabColors || {};
  const editing = mode === 'edit';

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { if (flash) setFlash(false); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, flash]);

  return (
    <div className="lib-overlay" onMouseDown={onClose}>
      <div className={`lib-modal ${editing ? 'is-edit' : 'is-view'}`} style={{ '--note-color': accent }} onMouseDown={e => e.stopPropagation()}>
        <div className="lib-modal-head">
          <span className="lib-modal-swatch" style={{ background: accent }} />
          {editing ? (
            <input className="lib-modal-title" value={note.title} onChange={e => onTitle(e.target.value)} placeholder={`Untitled ${cfg.label}`} />
          ) : (
            <span className="lib-modal-title view">{note.title || `Untitled ${cfg.label}`}</span>
          )}
          <span className="lib-modal-kind">{cfg.label}</span>
          {editing
            ? <button className="lib-mode-btn" onClick={() => setMode('view')}>✓ Done</button>
            : <button className="lib-mode-btn primary" onClick={() => setMode('edit')}>✏ Edit</button>}
          <button className="lib-modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {editing && (
          <div className="lib-tabs">
            {cfg.tabs.map((t, i) => {
              const active = t.key === tab.key;
              const color = tabColors[t.key] || NOTE_COLORS[i % NOTE_COLORS.length];
              return (
                <div className="lib-tab-wrap" key={t.key}>
                  <button
                    className={`lib-tab ${active ? 'on' : ''}`}
                    style={{ '--bubble': color }}
                    title={active ? `${t.label} — click to recolor` : t.label}
                    onClick={() => {
                      if (active) setTabPalette(p => (p === t.key ? null : t.key));
                      else { setActiveTab(t.key); setTabPalette(null); }
                    }}
                  >
                    <span className="lib-tab-icon">{t.icon}</span>
                    <span className="lib-tab-label">{t.label}</span>
                  </button>
                  {tabPalette === t.key && (
                    <>
                      <div className="lib-tab-palette-scrim" onClick={() => setTabPalette(null)} />
                      <div className="lib-tab-palette">
                        {NOTE_COLORS.map(c => (
                          <button
                            key={c}
                            style={{ background: c }}
                            aria-label={`Color ${c}`}
                            onClick={() => {
                              onPatch({ tabColors: { ...tabColors, [t.key]: c } });
                              setTabPalette(null);
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="lib-tab-body">
          {editing ? (
            tab.custom === 'sessions' ? (
              <SessionsTab note={note} onPatch={onPatch} />
            ) : tab.custom === 'chapters' ? (
              <ChaptersTab note={note} onPatch={onPatch} />
            ) : tab.custom === 'links' ? (
              <LinksTab note={note} allNotes={allNotes} onField={onField} onPatch={onPatch} onOpenNote={onOpenNote} />
            ) : (
              <>
                {tab.flashcards && (
                  <button className="lib-flash-launch" onClick={() => setFlash(true)}>🎴 Memory-verse flashcards</button>
                )}
                {tab.fields.map(f => (
                  <FieldRenderer key={f.key} field={f} fields={fields} onField={onField} />
                ))}
              </>
            )
          ) : (
            <NoteView note={note} allNotes={allNotes} onOpenNote={onOpenNote} onFlash={() => setFlash(true)} />
          )}
        </div>

        <div className="lib-modal-foot">
          <button className="lib-delete" onClick={onDelete}>Delete note</button>
          <span className="lib-saved">{editing ? 'Changes save automatically' : 'Double-click any note to view'}</span>
        </div>
      </div>

      {flash && (
        <Flashcards passages={fields.passages || ''} onClose={() => setFlash(false)} />
      )}
    </div>
  );
}

/* ─────────────────── Read-only view body ─────────────────── */

function NoteView({ note, allNotes, onOpenNote, onFlash }) {
  const cfg = TYPES[note.type];
  const f = note.fields || {};

  const Text = ({ label, value }) => {
    if (!value || !String(value).trim()) return null;
    return (
      <div className="lib-v-block">
        <h4>{label}</h4>
        <div className="lib-v-text lib-md-preview" dangerouslySetInnerHTML={{ __html: mdToHtml(String(value)) }} />
      </div>
    );
  };

  const Scripture = ({ label, value }) => {
    if (!value || !value.trim()) return null;
    const refs = findRefs(value);
    return (
      <div className="lib-v-block">
        <h4>{label}</h4>
        <p className="lib-v-text">{value}</p>
        {refs.length > 0 && (
          <div className="lib-ref-chips">
            {refs.map(r => <a key={r} className="lib-ref-chip" href={refUrl(r)} target="_blank" rel="noopener noreferrer">✝ {r}</a>)}
          </div>
        )}
      </div>
    );
  };

  if (note.type === 'book') {
    const cur = Number(f.currentPage), tot = Number(f.totalPages);
    const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
    return (
      <div className="lib-view">
        <div className="lib-v-hero">
          {f.coverUrl && <img className="lib-v-cover" src={f.coverUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}
          <div className="lib-v-meta">
            {f.author && <div><span>Author</span>{f.author}</div>}
            {f.category && <div><span>Genre</span>{f.category}</div>}
            {f.status && <div><span>Status</span><b className={`lib-status-pill ${STATUS_CLASS[f.status] || ''}`}>{f.status}</b></div>}
            {f.rating && f.rating !== '—' && <div><span>Rating</span><b className="lib-v-stars">{f.rating}</b></div>}
            {f.started && <div><span>Started</span>{f.started}</div>}
            {f.finished && <div><span>Finished</span>{f.finished}</div>}
          </div>
        </div>
        {tot > 0 && (
          <div className="lib-v-block">
            <h4>Progress — {cur || 0} of {tot} pages ({pct}%)</h4>
            <div className="lib-progress-track"><span style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        <Text label="Notes" value={f.notes} />
        <Text label="Quotes" value={f.quotes} />
        {(() => {
          const chs = readChapters(note).filter(c => (c.title || '').trim() || (c.body || '').trim());
          if (chs.length === 0) return null;
          return (
            <div className="lib-v-block">
              <h4>Chapters</h4>
              {chs.map((c, i) => (
                <div className="lib-v-chapter" key={c.id}>
                  <h5>{c.title?.trim() || `Chapter ${i + 1}`}</h5>
                  {c.body && c.body.trim() && (
                    <div className="lib-v-text lib-md-preview" dangerouslySetInnerHTML={{ __html: mdToHtml(c.body) }} />
                  )}
                </div>
              ))}
            </div>
          );
        })()}
        {!f.author && !f.notes && !f.quotes && readChapters(note).length === 0 && tot === 0 && (
          <p className="lib-muted">Nothing recorded yet — hit <b>Edit</b> to add details.</p>
        )}
      </div>
    );
  }

  // Bible study
  const sessions = note.sessions || [];
  const related = (note.relatedIds || []).map(id => allNotes.find(n => n.id === id)).filter(Boolean);
  return (
    <div className="lib-view">
      <div className="lib-v-meta solo">
        {f.passage && <div><span>Passage</span>{f.passage}</div>}
        {f.leader && <div><span>Leader / Source</span>{f.leader}</div>}
        {f.status && <div><span>Status</span><b className={`lib-status-pill ${STATUS_CLASS[f.status] || ''}`}>{f.status}</b></div>}
      </div>

      {f.passages && f.passages.trim() && (
        <div className="lib-v-block">
          <div className="lib-v-headrow">
            <h4>Passages</h4>
            <button className="lib-flash-launch sm" onClick={onFlash}>🎴 Flashcards</button>
          </div>
          <p className="lib-v-text">{f.passages}</p>
          {findRefs(f.passages).length > 0 && (
            <div className="lib-ref-chips">
              {findRefs(f.passages).map(r => <a key={r} className="lib-ref-chip" href={refUrl(r)} target="_blank" rel="noopener noreferrer">✝ {r}</a>)}
            </div>
          )}
        </div>
      )}

      <Text label="Questions" value={f.questions} />
      <Text label="Reflections" value={f.reflections} />

      {sessions.length > 0 && (
        <div className="lib-v-block">
          <h4>Sessions</h4>
          {sessions.map((s, i) => (
            <div className="lib-v-session" key={s.id}>
              <div className="lib-v-session-head"><b>#{i + 1}</b> {s.date} {s.title && <span>· {s.title}</span>}</div>
              {s.notes && <p className="lib-v-text">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Scripture label="Cross-references" value={f.crossRefs} />

      {related.length > 0 && (
        <div className="lib-v-block">
          <h4>Related notes</h4>
          <div className="lib-related-chips">
            {related.map(n => (
              <button key={n.id} className="lib-related-chip" onClick={() => onOpenNote(n.id)} style={{ borderColor: n.color || TYPES[n.type].color }}>
                🔗 {n.title || TYPES[n.type].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!f.passage && !f.passages && !f.questions && !f.reflections && sessions.length === 0 && (
        <p className="lib-muted">Nothing recorded yet — hit <b>Edit</b> to add details.</p>
      )}
    </div>
  );
}

/* ─────────────────── Chapter notes (custom tab) ─────────────────── */

/* Read a book's chapter notes, migrating any legacy single-textarea
   `chapters` field into the first chapter the first time it's opened. */
function readChapters(note) {
  if (Array.isArray(note.chapterNotes)) return note.chapterNotes;
  const legacy = (note.fields && note.fields.chapters) || '';
  return legacy.trim() ? [{ id: 'legacy', title: 'Notes', body: legacy }] : [];
}

/* A notes-app-style page: one addable tab per chapter, each holding
   its own separate notes. Writes straight to `note.chapterNotes`,
   which the board persists immediately on every change. */
function ChaptersTab({ note, onPatch }) {
  const chapters = readChapters(note);
  const [activeId, setActiveId] = useState(chapters[0]?.id || null);

  const commit = next => onPatch({ chapterNotes: next });

  const add = () => {
    const ch = { id: makeId(), title: `Chapter ${chapters.length + 1}`, body: '' };
    commit([...chapters, ch]);
    setActiveId(ch.id);
  };
  const update = (id, patch) => commit(chapters.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const remove = id => {
    const next = chapters.filter(c => c.id !== id);
    commit(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  };

  const active = chapters.find(c => c.id === activeId) || chapters[0] || null;

  return (
    <div className="lib-chapters">
      <div className="lib-ch-tabs">
        {chapters.map((c, i) => {
          const on = active && c.id === active.id;
          return on ? (
            <input
              key={c.id}
              className="lib-ch-tab on"
              value={c.title}
              placeholder={`Chapter ${i + 1}`}
              onChange={e => update(c.id, { title: e.target.value })}
              size={Math.max(8, (c.title || '').length || 9)}
            />
          ) : (
            <button
              key={c.id}
              className="lib-ch-tab"
              onClick={() => setActiveId(c.id)}
              title={c.title || `Chapter ${i + 1}`}
            >
              {c.title?.trim() || `Chapter ${i + 1}`}
            </button>
          );
        })}
        <button className="lib-ch-add" onClick={add} title="Add chapter">＋ Chapter</button>
      </div>

      {active ? (
        <div className="lib-ch-editor" key={active.id}>
          <MarkdownTextarea
            value={active.body}
            placeholder="Notes for this chapter…"
            onChange={v => update(active.id, { body: v })}
          />
          <button className="lib-ch-del" onClick={() => remove(active.id)}>🗑 Delete chapter</button>
        </div>
      ) : (
        <p className="lib-muted">No chapters yet. Add one tab per chapter to keep your notes separate.</p>
      )}
    </div>
  );
}

/* ─────────────────── Declarative field renderer ─────────────────── */

function FieldRenderer({ field: f, fields, onField }) {
  const val = fields[f.key];

  if (f.type === 'textarea') {
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <MarkdownTextarea value={val} placeholder={f.placeholder} onChange={v => onField(f.key, v)} />
      </div>
    );
  }

  if (f.type === 'scripture') {
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <textarea value={val || ''} placeholder={f.placeholder || ''} onChange={e => onField(f.key, e.target.value)} />
        <ScriptureRefs
          value={val}
          onAppend={(ref, text) => onField(f.key, `${val ? val.replace(/\s*$/, '') + '\n' : ''}${ref} — ${text}`)}
        />
      </div>
    );
  }

  if (f.type === 'select') {
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <select value={val || f.options[0]} onChange={e => onField(f.key, e.target.value)}>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (f.type === 'rating') {
    const current = val || '—';
    const opts = ['—', '★', '★★', '★★★', '★★★★', '★★★★★'];
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <div className="lib-rating">
          {[1, 2, 3, 4, 5].map(n => {
            const stars = '★'.repeat(n);
            const active = current.length >= n && current !== '—';
            return (
              <button
                key={n}
                type="button"
                className={`lib-rating-star ${active ? 'on' : ''}`}
                onClick={() => onField(f.key, current === stars ? '—' : stars)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >★</button>
            );
          })}
          <button type="button" className="lib-rating-clear" onClick={() => onField(f.key, '—')}>clear</button>
        </div>
      </div>
    );
  }

  if (f.type === 'date') {
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <input type="date" value={val || ''} onChange={e => onField(f.key, e.target.value)} />
      </div>
    );
  }

  if (f.type === 'cover') {
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <div className="lib-cover-field">
          <input type="text" value={val || ''} placeholder="https://…/cover.jpg" onChange={e => onField(f.key, e.target.value)} />
          {val ? <img src={val} alt="cover preview" onError={e => { e.currentTarget.style.opacity = '0.2'; }} /> : <div className="lib-cover-ph">No cover</div>}
        </div>
      </div>
    );
  }

  if (f.type === 'progress') {
    const cur = fields.currentPage || '';
    const tot = fields.totalPages || '';
    const pct = Number(tot) > 0 ? Math.min(100, Math.round((Number(cur) / Number(tot)) * 100)) : 0;
    return (
      <div className="lib-field">
        {f.label && <label>{f.label}</label>}
        <div className="lib-progress-field">
          <input type="number" min="0" value={cur} placeholder="Page" onChange={e => onField('currentPage', e.target.value)} />
          <span className="lib-progress-of">of</span>
          <input type="number" min="0" value={tot} placeholder="Total" onChange={e => onField('totalPages', e.target.value)} />
          <span className="lib-progress-pct">{pct}%</span>
        </div>
        <div className="lib-progress-track"><span style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }

  // default: text
  return (
    <div className="lib-field">
      {f.label && <label>{f.label}</label>}
      <input type="text" value={val || ''} placeholder={f.placeholder || ''} onChange={e => onField(f.key, e.target.value)} />
    </div>
  );
}

/* ─────────────────── Session log (custom tab) ─────────────────── */

function SessionsTab({ note, onPatch }) {
  const sessions = note.sessions || [];
  const add = () => onPatch({
    sessions: [...sessions, { id: makeId(), date: new Date().toISOString().slice(0, 10), title: '', notes: '' }],
  });
  const update = (id, patch) => onPatch({ sessions: sessions.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id) => onPatch({ sessions: sessions.filter(s => s.id !== id) });

  return (
    <div className="lib-sessions">
      <button className="lib-sub-add" onClick={add}>＋ Add session</button>
      {sessions.length === 0 && <p className="lib-muted">No sessions yet. Log each week or sitting of this study.</p>}
      {sessions.map((s, i) => (
        <div className="lib-session" key={s.id}>
          <div className="lib-session-head">
            <span className="lib-session-num">#{i + 1}</span>
            <input type="date" value={s.date} onChange={e => update(s.id, { date: e.target.value })} />
            <input type="text" placeholder="Session title" value={s.title} onChange={e => update(s.id, { title: e.target.value })} />
            <button className="lib-session-del" onClick={() => remove(s.id)} aria-label="Delete session">✕</button>
          </div>
          <textarea placeholder="What did you cover / learn this session?" value={s.notes} onChange={e => update(s.id, { notes: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

/* ────────── Cross-references + related-note linker (custom tab) ────────── */

function LinksTab({ note, allNotes, onField, onPatch, onOpenNote }) {
  const crossRefs = note.fields?.crossRefs || '';
  const relatedIds = note.relatedIds || [];
  const others = allNotes.filter(n => n.id !== note.id);

  const toggle = (id) => onPatch({
    relatedIds: relatedIds.includes(id) ? relatedIds.filter(r => r !== id) : [...relatedIds, id],
  });

  return (
    <>
      <div className="lib-field">
        <label>Cross-references</label>
        <textarea
          value={crossRefs}
          placeholder="Related passages — e.g. Romans 8:28; Jeremiah 29:11"
          onChange={e => onField('crossRefs', e.target.value)}
        />
        <ScriptureRefs
          value={crossRefs}
          onAppend={(ref, text) => onField('crossRefs', `${crossRefs ? crossRefs.replace(/\s*$/, '') + '\n' : ''}${ref} — ${text}`)}
        />
      </div>

      <div className="lib-field">
        <label>Related notes</label>
        {others.length === 0 && <p className="lib-muted">No other notes on the board yet.</p>}
        <div className="lib-related-list">
          {others.map(n => (
            <label key={n.id} className="lib-related-item">
              <input type="checkbox" checked={relatedIds.includes(n.id)} onChange={() => toggle(n.id)} />
              <span className="lib-related-type" style={{ background: TYPES[n.type].color }} />
              <span className="lib-related-title">{n.title || `Untitled ${TYPES[n.type].label}`}</span>
              <span className="lib-related-kind">{TYPES[n.type].label}</span>
            </label>
          ))}
        </div>
        {relatedIds.length > 0 && (
          <div className="lib-related-chips">
            {relatedIds.map(id => {
              const n = allNotes.find(x => x.id === id);
              if (!n) return null;
              return (
                <button key={id} className="lib-related-chip" onClick={() => onOpenNote(id)} style={{ borderColor: TYPES[n.type].color }}>
                  🔗 {n.title || TYPES[n.type].label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────── Memory-verse flashcards ─────────────────── */

function Flashcards({ passages, onClose }) {
  /* Build cards from the Passages text: each non-empty line is a
     card. If a scripture reference is present it becomes the
     prompt (front) and the full line the answer (back). */
  const cards = useMemo(() => {
    return (passages || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const ref = findRefs(line)[0];
        const back = ref ? line.replace(ref, '').replace(/^[\s—:-]+/, '').trim() : line;
        return { front: ref || line.slice(0, 60), back: back || '(add the verse text on the Passages tab)' };
      });
  }, [passages]);

  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];

  const go = (d) => { setFlipped(false); setI(p => (p + d + cards.length) % cards.length); };

  return (
    <div className="lib-flash" onMouseDown={onClose}>
      <div className="lib-flash-inner" onMouseDown={e => e.stopPropagation()}>
        <div className="lib-flash-head">
          <span>🎴 Memory verses</span>
          <button className="lib-modal-x" onClick={onClose} aria-label="Close flashcards">✕</button>
        </div>

        {cards.length === 0 ? (
          <p className="lib-muted" style={{ padding: '24px', textAlign: 'center' }}>
            Add verses on the Passages tab (one per line) to generate flashcards.
          </p>
        ) : (
          <>
            <button className={`lib-flash-card ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
              <span className="lib-flash-face front">{card.front}</span>
              <span className="lib-flash-face back">{card.back}</span>
              <em className="lib-flash-tap">click to flip</em>
            </button>
            <div className="lib-flash-nav">
              <button onClick={() => go(-1)} disabled={cards.length < 2}>‹ Prev</button>
              <span>{i + 1} / {cards.length}</span>
              <button onClick={() => go(1)} disabled={cards.length < 2}>Next ›</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Markdown textarea (write / preview) ─────────────── */

function MarkdownTextarea({ value, placeholder, onChange }) {
  const [view, setView] = useState('write');
  const html = useMemo(() => mdToHtml(value || ''), [value]);
  return (
    <div className="lib-md">
      <div className="lib-md-tabs">
        <button type="button" className={view === 'write' ? 'on' : ''} onClick={() => setView('write')}>✏ Write</button>
        <button type="button" className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>👁 Preview</button>
        <span className="lib-md-hint">**bold** · *italic* · # heading · - list · &gt; quote</span>
      </div>
      {view === 'write' ? (
        <textarea value={value || ''} placeholder={placeholder || ''} onChange={e => onChange(e.target.value)} />
      ) : (value && value.trim())
        ? <div className="lib-md-preview" dangerouslySetInnerHTML={{ __html: html }} />
        : <div className="lib-md-preview empty">Nothing to preview yet.</div>}
    </div>
  );
}

/* ─────────────── Scripture refs with verse auto-fetch ─────────────── */

function ScriptureRefs({ value, onAppend }) {
  const refs = findRefs(value || '');
  const [busy, setBusy] = useState(null);
  if (refs.length === 0) return null;

  const fetchOne = async (ref) => {
    setBusy(ref);
    try {
      const text = await fetchVerseText(ref);
      if (text) onAppend(ref, text);
    } catch {
      /* network/lookup failure — leave the field untouched */
    }
    setBusy(null);
  };

  return (
    <div className="lib-ref-chips">
      {refs.map(r => (
        <span key={r} className="lib-ref-chip group">
          <a href={refUrl(r)} target="_blank" rel="noopener noreferrer">✝ {r}</a>
          <button
            type="button"
            className="lib-ref-fetch"
            disabled={busy === r}
            onClick={() => fetchOne(r)}
            title="Fetch verse text (WEB)"
          >{busy === r ? '…' : '📥'}</button>
        </span>
      ))}
    </div>
  );
}

/* ─────────────── Movable series folder ───────────────
   Looks like a Writing-mode series card but lives on the board:
   drag the header to move it, click (without dragging) to drill
   into the folder's own sticky-note page. Notes are dragged onto
   it to file them in. */
function FolderCard({ folder, count, dragging, over, onPointerDown, onPointerMove, onPointerUp, onOpen, onRename, onDesc, onDelete, onResizeDown, onResizeMove, onResizeUp }) {
  const [editing, setEditing] = useState(false);
  const stop = e => e.stopPropagation();
  const startEdit = e => { e.stopPropagation(); setEditing(true); };

  return (
    <div
      className={`lib-folder ${dragging ? 'dragging' : ''} ${over ? 'over' : ''} ${editing ? 'editing' : ''}`}
      style={{ left: folder.x, top: folder.y, width: folder.w || undefined, height: folder.h || undefined }}
    >
      <div
        className="lib-folder-head"
        onPointerDown={e => onPointerDown(e, folder)}
        onPointerMove={onPointerMove}
        onPointerUp={e => onPointerUp(e, onOpen)}
        title="Drag to move · click to open · double-click the title to rename"
      >
        <span className="lib-folder-icon" aria-hidden="true">📚</span>
        <div className="lib-folder-info">
          {editing ? (
            <input
              className="lib-folder-name"
              value={folder.name}
              autoFocus
              onChange={e => onRename(e.target.value)}
              onPointerDown={stop}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false); } }}
              placeholder="Series name"
            />
          ) : (
            <div
              className="lib-folder-name static"
              onPointerDown={stop}
              onDoubleClick={startEdit}
              title="Double-click to rename"
            >{folder.name || 'Untitled series'}</div>
          )}
          <div className="lib-folder-meta">{count} {count === 1 ? 'note' : 'notes'}</div>
        </div>
        <div className="lib-folder-head-actions" onPointerDown={stop}>
          <button className="lib-folder-del" onClick={onDelete} title="Delete series (keeps notes)">🗑</button>
        </div>
        <span className="lib-folder-chev" aria-hidden="true">▸</span>
      </div>

      <div className="lib-folder-desc" onPointerDown={stop} onDoubleClick={startEdit}>
        {editing ? (
          <textarea
            className="lib-folder-descinput"
            value={folder.description || ''}
            onChange={e => onDesc(e.target.value)}
            onPointerDown={stop}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false); } }}
            placeholder="Describe this series…"
          />
        ) : folder.description ? (
          <div className="lib-folder-desc-text" title="Double-click to edit">{folder.description}</div>
        ) : (
          <div className="lib-folder-desc-text empty" title="Double-click to add a description">No description yet — double-click to add.</div>
        )}
      </div>

      {editing && (
        <div className="lib-folder-editfoot" onPointerDown={stop}>
          <button className="lib-folder-done" onClick={() => setEditing(false)}>✓ Done</button>
        </div>
      )}

      <span
        className="lib-folder-resize"
        title="Drag to resize"
        onPointerDown={e => onResizeDown(e, folder)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onDoubleClick={stop}
      />
    </div>
  );
}

/* ─────────────── Board mini-map ─────────────── */

function MiniMap({ notes, frames, boardRef }) {
  /* Re-render on board scroll/resize so the viewport box tracks. */
  const [, force] = useState(0);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onMove = () => force(n => n + 1);
    onMove(); // sync once now that boardRef is attached (viewport box)
    el.addEventListener('scroll', onMove);
    window.addEventListener('resize', onMove);
    return () => { el.removeEventListener('scroll', onMove); window.removeEventListener('resize', onMove); };
  }, [boardRef]);

  const el = boardRef.current;
  let maxX = el?.clientWidth || 800;
  let maxY = el?.clientHeight || 600;
  for (const n of notes) { maxX = Math.max(maxX, n.x + (n.w || NOTE_W)); maxY = Math.max(maxY, n.y + (n.h || NOTE_H)); }
  for (const fr of frames) { maxX = Math.max(maxX, fr.x + fr.w); maxY = Math.max(maxY, fr.y + fr.h); }
  maxX += 40; maxY += 40;

  const MAP_W = 184;
  const scale = MAP_W / maxX;
  const MAP_H = Math.max(70, Math.min(220, maxY * scale));

  const view = el
    ? { x: el.scrollLeft * scale, y: el.scrollTop * scale, w: el.clientWidth * scale, h: el.clientHeight * scale }
    : null;

  const jump = (e) => {
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / scale;
    const cy = (e.clientY - rect.top) / scale;
    el.scrollTo({ left: cx - el.clientWidth / 2, top: cy - el.clientHeight / 2, behavior: 'smooth' });
  };

  return (
    <div className="lib-minimap" style={{ width: MAP_W, height: MAP_H }} onClick={jump} title="Click to jump there">
      {frames.map(fr => (
        <span key={fr.id} className="mm-frame"
          style={{ left: fr.x * scale, top: fr.y * scale, width: fr.w * scale, height: fr.h * scale }} />
      ))}
      {notes.map(n => (
        <span key={n.id} className="mm-note"
          style={{
            left: n.x * scale, top: n.y * scale,
            width: Math.max(3, (n.w || NOTE_W) * scale), height: Math.max(3, (n.h || NOTE_H) * scale),
            background: n.color || TYPES[n.type].color,
          }} />
      ))}
      {view && <span className="mm-view" style={{ left: view.x, top: view.y, width: view.w, height: view.h }} />}
    </div>
  );
}

/* ─────────────── Confetti burst (celebrations) ─────────────── */

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#fcd34d', '#7dd3fc', '#86efac', '#fda4af', '#c4b5fd', '#fdba74', '#f472b6', '#34d399'];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      dur: 1.3 + Math.random() * 0.9,
      bg: colors[i % colors.length],
      size: 6 + Math.random() * 7,
      drift: (Math.random() * 2 - 1) * 80,
    }));
  }, []);
  return (
    <div className="lib-confetti" aria-hidden="true">
      {pieces.map(p => (
        <span key={p.id} style={{
          left: `${p.left}%`, background: p.bg, width: p.size, height: p.size,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--drift': `${p.drift}px`,
        }} />
      ))}
    </div>
  );
}
