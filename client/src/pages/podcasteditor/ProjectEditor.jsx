import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes } from '../../utils/formatBytes';
import { useUserStoreKey } from '../../lib/userStore';
import './ProjectEditor.css';

/* ─────────────────────────────────────────────────────────────
   Project Editor — multi-clip sequential editor
   Phase 1: project model, multi-clip timeline, sequential playback,
            drag-to-reorder, inspector, add/remove clips
   Phase 2: split at playhead, ripple delete, snapping,
            markers/chapters, per-clip audio meter, toolbar row
   Namespace: .pj-*
   Accent: var(--accent-teal, #2dd4bf)
   localStorage keys:
     - 'podcast:projects'      (array of projects)
     - 'podcast:recordings'    (read-only reference)
     - 'podcast:project-snap'  (boolean — snap toggle)
   ───────────────────────────────────────────────────────────── */

const PROJECTS_KEY   = 'podcast:projects';
const RECORDINGS_KEY = 'podcast:recordings';
const SNAP_KEY       = 'podcast:project-snap';
const STEMS_KEY      = 'band:stems';

const SNAP_THRESHOLD_SEC = 0.25;
const MIN_CLIP_DUR       = 0.2;

const MARKER_PALETTE = [
  '#2dd4bf', // teal
  '#fb7185', // rose
  '#facc15', // amber
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#f97316', // orange
];

/* ─── helpers ──────────────────────────────────────────────── */
function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveProjects(arr) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(arr)); return true; }
  catch { return false; }
}
function loadRecordings() {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function loadSnap() {
  try {
    const v = localStorage.getItem(SNAP_KEY);
    return v === null ? true : v === 'true';
  } catch { return true; }
}
function saveSnap(b) {
  try { localStorage.setItem(SNAP_KEY, String(!!b)); } catch {}
}
function makeId(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
function formatTimeDecimal(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function relativeTime(t) {
  if (!t) return '—';
  const ms = Date.now() - new Date(t).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
function randomMarkerColor() {
  return MARKER_PALETTE[Math.floor(Math.random() * MARKER_PALETTE.length)];
}
function loadStems() {
  try {
    const raw = localStorage.getItem(STEMS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function dataUrlToBlob(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const [head, b64] = dataUrl.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch { return null; }
}
function hexToRgba(hex, alpha) {
  try {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return `rgba(0,0,0,${alpha})`;
  }
}

/* ─── Overlay defaults / presets ───────────────────────────── */
const DEFAULT_OVERLAY = {
  text: 'New overlay',
  position: { x: 0.5, y: 0.85 },
  alignment: 'center',
  fontSize: 48,
  color: '#ffffff',
  bgColor: '#000000',
  bgAlpha: 0.4,
  fontWeight: 700,
  showAtStart: 0,
  hideAtEnd: 5,
  fadeInSec: 0.3,
  fadeOutSec: 0.3,
};
const OVERLAY_PRESETS = [
  { id: 'tl', label: 'Top-L',   x: 0.05, y: 0.10, alignment: 'left'   },
  { id: 'tc', label: 'Top-C',   x: 0.50, y: 0.10, alignment: 'center' },
  { id: 'lt', label: 'Lower-⅓', x: 0.50, y: 0.85, alignment: 'center' },
  { id: 'cc', label: 'Center',  x: 0.50, y: 0.50, alignment: 'center' },
];

/* ─── Mini Toast ───────────────────────────────────────────── */
function PjToast({ message, kind, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className={`pj-toast pj-toast-${kind || 'info'}`} role="status">
      <span className="pj-toast-msg">{message}</span>
      <button className="pj-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function ProjectEditor() {
  const navigate = useNavigate();

  /* Firestore-backed via useUserStoreKey. Recordings are read-only here —
     they're written by Podcast Studio. */
  const [projects, setProjects]     = useUserStoreKey('podcast:projects',   []);
  const [recordings]                = useUserStoreKey('podcast:recordings', []);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedClipId, setSelectedClipId]       = useState(null);
  const [query, setQuery] = useState('');

  // Rename / delete-armed UI state
  const [renaming, setRenaming]     = useState(false);
  const [renameVal, setRenameVal]   = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [removeArmedClipId, setRemoveArmedClipId] = useState(null);

  // New-project modal (replaces window.prompt which Electron disables)
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName]   = useState('');

  // Playback state
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [activeUrl, setActiveUrl] = useState('');
  const [activeUrlClipId, setActiveUrlClipId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

  // Snap toggle
  const [snapEnabled, setSnapEnabled] = useState(() => loadSnap());

  // Marker label editing
  const [editingMarkerId, setEditingMarkerId] = useState(null);
  const [hoverMarkerId, setHoverMarkerId] = useState(null);

  // Toast
  const [toast, setToast]         = useState('');
  const [toastKind, setToastKind] = useState('info');
  const showToast = useCallback((msg, kind = 'info') => {
    setToastKind(kind);
    setToast(msg);
  }, []);

  // Audio meter
  const [meterLevel, setMeterLevel] = useState(0);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const meterRafRef = useRef(null);
  const audioGraphFailedRef = useRef(false);

  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);
  const objectUrlRecordingIdRef = useRef(null);
  const dragClipIdRef = useRef(null);
  const dragOverClipIdRef = useRef(null);
  const [dragOverClipId, setDragOverClipId] = useState(null);

  // ── Phase 3: Music + Overlays ─────────────────────────────
  /* Stems are also Firestore-backed (migrated earlier). The Music section
     reads from this list to pick a backing track. */
  const [stemsList]                = useUserStoreKey('band:stems', []);
  const [showMusicEditor, setShowMusicEditor] = useState(false);
  const [showStemsPicker, setShowStemsPicker] = useState(false);
  const [overlaysExpanded, setOverlaysExpanded] = useState(true);
  const [editingOverlayId, setEditingOverlayId] = useState(null);
  const [removeArmedOverlayId, setRemoveArmedOverlayId] = useState(null);

  const musicAudioRef = useRef(null);
  const musicBlobUrlRef = useRef(null);
  const musicSrcNodeRef = useRef(null);
  const musicGainNodeRef = useRef(null);
  const videoGainNodeRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const overlayRafRef = useRef(null);
  const duckStateRef = useRef(null);

  /* (Projects, recordings, and stems all autosync via useUserStoreKey's
     onSnapshot — no manual persist or storage-event listener needed.) */

  /* ── Persist snap setting (local-only — small UI preference) ─── */
  useEffect(() => {
    saveSnap(snapEnabled);
  }, [snapEnabled]);

  /* ── Listen for cross-tab snap toggle ──────────────────── */
  useEffect(() => {
    function onStorage(e) {
      if (e.key === SNAP_KEY) setSnapEnabled(loadSnap());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* ── Cleanup on unmount ────────────────────────────────── */
  useEffect(() => {
    return () => {
      /* Video object URLs no longer in use — recordings use stable
         Firebase Storage URLs that don't need revoking. */
      if (meterRafRef.current) {
        cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
      if (musicBlobUrlRef.current) {
        try { URL.revokeObjectURL(musicBlobUrlRef.current); } catch {}
        musicBlobUrlRef.current = null;
      }
      if (overlayRafRef.current) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
    };
  }, []);

  /* ── Derived: selected project + clip ───────────────────── */
  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );
  const orderedClips = useMemo(() => {
    if (!selectedProject) return [];
    return (selectedProject.clips || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [selectedProject]);
  const markers = useMemo(() => {
    if (!selectedProject) return [];
    return (selectedProject.markers || []).slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }, [selectedProject]);
  const currentClip = orderedClips[currentClipIndex] || null;
  const selectedClip = useMemo(
    () => orderedClips.find(c => c.id === selectedClipId) || null,
    [orderedClips, selectedClipId]
  );
  const recordingsById = useMemo(() => {
    const m = new Map();
    for (const r of recordings) m.set(r.id, r);
    return m;
  }, [recordings]);

  const music = selectedProject?.music || null;

  /* ── Filtered projects list ─────────────────────────────── */
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = projects.slice().sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    );
    if (!q) return arr;
    return arr.filter(p => (p.name || '').toLowerCase().includes(q));
  }, [projects, query]);

  /* ── Total project time ─────────────────────────────────── */
  const projectTotal = useMemo(() => {
    return orderedClips.reduce((sum, c) => {
      const d = Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
      return sum + d;
    }, 0);
  }, [orderedClips]);

  const offsetBeforeClip = useCallback((index) => {
    let s = 0;
    for (let i = 0; i < index; i++) {
      const c = orderedClips[i];
      if (!c) continue;
      s += Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
    }
    return s;
  }, [orderedClips]);

  const projectCurrentTime =
    currentClip
      ? offsetBeforeClip(currentClipIndex) +
        Math.max(0, videoCurrentTime - (currentClip.trimStart ?? 0))
      : 0;

  /* ── Snap anchors (project-time) for playhead snapping ──── */
  const projectAnchors = useMemo(() => {
    const anchors = new Set();
    anchors.add(0);
    let acc = 0;
    for (const c of orderedClips) {
      anchors.add(acc);
      const d = Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
      acc += d;
      anchors.add(acc);
    }
    for (const m of markers) anchors.add(m.time ?? 0);
    // Whole seconds up to total
    const total = Math.ceil(acc);
    for (let s = 0; s <= total; s++) anchors.add(s);
    return Array.from(anchors).filter(a => Number.isFinite(a)).sort((a, b) => a - b);
  }, [orderedClips, markers]);

  const snapValue = useCallback((value, anchors, threshold = SNAP_THRESHOLD_SEC) => {
    if (!snapEnabled) return value;
    let best = value;
    let bestDist = threshold;
    for (const a of anchors) {
      const d = Math.abs(a - value);
      if (d <= bestDist) {
        bestDist = d;
        best = a;
      }
    }
    return best;
  }, [snapEnabled]);

  /* ── Reset playback state when project changes ──────────── */
  useEffect(() => {
    setCurrentClipIndex(0);
    setSelectedClipId(null);
    setDeleteArmed(false);
    setRemoveArmedClipId(null);
    setRenaming(false);
    setVideoCurrentTime(0);
    setPlaying(false);
    setEditingMarkerId(null);
    setShowMusicEditor(false);
    setShowStemsPicker(false);
    setEditingOverlayId(null);
    setRemoveArmedOverlayId(null);
  }, [selectedProjectId]);

  /* ── Resolve the current clip's video URL ────────────────
     Recordings now carry a `videoUrl` (Firebase Storage), so we look it
     up by id instead of fetching a blob from IndexedDB. Sync, no async
     state machine, no object URL lifecycle. */
  useEffect(() => {
    if (!currentClip) {
      setActiveUrl('');
      setActiveUrlClipId(null);
      // Reset audio graph so a future clip can build a fresh source node
      audioGraphFailedRef.current = false;
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch {}
        sourceNodeRef.current = null;
      }
      return;
    }
    const rec = recordings.find(r => r.id === currentClip.recordingId);
    const url = rec?.videoUrl || '';
    // If we're switching to a different recording, tear down the audio graph
    // so the new <video> element can re-bind a fresh MediaElementSourceNode.
    if (objectUrlRecordingIdRef.current !== currentClip.recordingId) {
      audioGraphFailedRef.current = false;
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch {}
        sourceNodeRef.current = null;
      }
      objectUrlRecordingIdRef.current = currentClip.recordingId;
    }
    setActiveUrl(url);
    setActiveUrlClipId(currentClip.id);
  }, [currentClip, recordings]);

  /* ── Wire video element listeners ───────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeUrl || !currentClip) return undefined;

    const onLoaded = () => {
      try {
        v.currentTime = currentClip.trimStart ?? 0;
      } catch {}
      v.muted = !!currentClip.muted;
      v.volume = Math.max(0, Math.min(1, (currentClip.gain ?? 1)));
      if (playing) {
        v.play().catch(() => {});
      }
    };
    const onTime = () => {
      setVideoCurrentTime(v.currentTime);
      if (currentClip && v.currentTime >= (currentClip.trimEnd ?? Infinity) - 0.03) {
        const nextIdx = currentClipIndex + 1;
        if (nextIdx < orderedClips.length) {
          setCurrentClipIndex(nextIdx);
        } else {
          v.pause();
          setPlaying(false);
          setCurrentClipIndex(0);
        }
      }
    };
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);

    if (v.readyState >= 1) onLoaded();

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl, currentClip, currentClipIndex, orderedClips.length]);

  /* ── Apply gain (volume mapping for clip) ─────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !currentClip) return;
    v.volume = Math.max(0, Math.min(1, currentClip.gain ?? 1));
    v.muted = !!currentClip.muted;
  }, [currentClip]);

  /* ── Seek to clip start when clip changes ───────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !currentClip) return;
    if (objectUrlRecordingIdRef.current === currentClip.recordingId) {
      try {
        v.currentTime = currentClip.trimStart ?? 0;
      } catch {}
      if (playing) v.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClipIndex]);

  /* ── Audio meter: hook video element through AnalyserNode ─ */
  const setupAudioGraph = useCallback(() => {
    const v = videoRef.current;
    if (!v || audioGraphFailedRef.current) return false;
    if (sourceNodeRef.current && analyserRef.current && audioCtxRef.current) return true;
    try {
      if (!audioCtxRef.current) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) { audioGraphFailedRef.current = true; return false; }
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (!sourceNodeRef.current) {
        // createMediaElementSource throws if the element has already been
        // connected to a different context — fail gracefully.
        sourceNodeRef.current = ctx.createMediaElementSource(v);
      }
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 1024;
      }
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      return true;
    } catch {
      audioGraphFailedRef.current = true;
      return false;
    }
  }, []);

  // Start the meter loop whenever playing & graph available
  useEffect(() => {
    if (!playing) {
      if (meterRafRef.current) {
        cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
      setMeterLevel(0);
      return undefined;
    }
    const ok = setupAudioGraph();
    if (!ok) return undefined;
    try { audioCtxRef.current?.resume?.(); } catch {}

    const analyser = analyserRef.current;
    if (!analyser) return undefined;
    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      try {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        // Mute & gain are already applied to video.volume, but if muted
        // explicitly zero the level for clarity.
        const v = videoRef.current;
        const muted = v ? (v.muted || v.volume === 0) : false;
        setMeterLevel(muted ? 0 : peak);
      } catch {}
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (meterRafRef.current) {
        cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
    };
  }, [playing, currentClip, setupAudioGraph]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Music: resolve src URL (audio data URL or stem)
     ───────────────────────────────────────────────────────── */
  const musicSrcUrl = useMemo(() => {
    // Revoke any stale blob URL
    if (musicBlobUrlRef.current) {
      try { URL.revokeObjectURL(musicBlobUrlRef.current); } catch {}
      musicBlobUrlRef.current = null;
    }
    if (!music || !music.enabled) return '';
    // Prefer direct audio data URL
    if (music.audioDataUrl) {
      const blob = dataUrlToBlob(music.audioDataUrl);
      if (blob) {
        const u = URL.createObjectURL(blob);
        musicBlobUrlRef.current = u;
        return u;
      }
      return music.audioDataUrl;
    }
    // Fallback to stem reference
    if (music.stemId) {
      const stem = (stemsList || []).find(s => s.id === music.stemId);
      /* Prefer the Firebase Storage URL (new format) — usable directly.
         Fall back to legacy data-URL fields for any pre-migration data. */
      if (stem?.audioUrl) return stem.audioUrl;
      const src = stem?.audioDataUrl || stem?.dataUrl || stem?.url;
      if (src) {
        const blob = dataUrlToBlob(src);
        if (blob) {
          const u = URL.createObjectURL(blob);
          musicBlobUrlRef.current = u;
          return u;
        }
        return src;
      }
    }
    return '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music?.enabled, music?.audioDataUrl, music?.stemId, stemsList]);

  /* ── Sync music audio element with play/pause ──────────── */
  useEffect(() => {
    const a = musicAudioRef.current;
    if (!a) return;
    a.loop = true;
    if (!musicGainNodeRef.current) {
      // When no audio-graph routing, fall back to element volume
      a.volume = Math.max(0, Math.min(1, music?.volume ?? 0.4));
    }
  }, [music?.volume]);

  useEffect(() => {
    const a = musicAudioRef.current;
    const v = videoRef.current;
    if (!a) return;
    if (!music?.enabled || !musicSrcUrl) {
      try { a.pause(); } catch {}
      return;
    }
    if (playing && v && !v.paused) {
      try {
        // Snap to startOffset on (re)start if currentTime ~0
        if (a.currentTime < 0.05 && (music.startOffset ?? 0) > 0) {
          a.currentTime = Math.max(0, music.startOffset);
        }
      } catch {}
      a.play().catch(() => {});
    } else {
      try { a.pause(); } catch {}
    }
  }, [playing, music?.enabled, music?.startOffset, musicSrcUrl]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Build music audio graph node (uses shared AudioContext)
     The Phase 2 meter already wires the video element. We add the
     music node into the same context so we can route via a GainNode
     for ducking. Fails gracefully if anything throws.
     ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!music?.enabled) return;
    const a = musicAudioRef.current;
    if (!a) return;
    if (!audioCtxRef.current) {
      // Defer to meter's audio-graph setup if it hasn't run yet
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      try { audioCtxRef.current = new Ctor(); } catch { return; }
    }
    const ctx = audioCtxRef.current;
    if (!musicSrcNodeRef.current) {
      try {
        musicSrcNodeRef.current = ctx.createMediaElementSource(a);
        musicGainNodeRef.current = ctx.createGain();
        musicGainNodeRef.current.gain.value = Math.max(0, Math.min(1, music.volume ?? 0.4));
        musicSrcNodeRef.current.connect(musicGainNodeRef.current);
        musicGainNodeRef.current.connect(ctx.destination);
        // Now that we have a graph, the element shouldn't apply its own volume
        a.volume = 1;
      } catch {
        // graph setup failed — element volume will continue working
        musicSrcNodeRef.current = null;
        musicGainNodeRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music?.enabled, musicSrcUrl]);

  /* ── Apply volume changes to gain node ──────────────────── */
  useEffect(() => {
    const g = musicGainNodeRef.current;
    const a = musicAudioRef.current;
    const baseVol = Math.max(0, Math.min(1, music?.volume ?? 0.4));
    if (g) {
      try { g.gain.value = baseVol; } catch {}
    } else if (a) {
      a.volume = baseVol;
    }
  }, [music?.volume]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Ducking loop (piggybacks on Phase 2 analyser)
     ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!playing || !music?.enabled || !music?.duckOnDialogue) return undefined;
    const gainNode = musicGainNodeRef.current;
    const analyser = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!gainNode || !analyser || !ctx) return undefined;

    const DUCK_THRESHOLD = 0.05;
    const buf = new Uint8Array(analyser.fftSize);
    let raf = null;

    function tick() {
      try {
        analyser.getByteTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const s = (buf[i] - 128) / 128;
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        const baseVol = Math.max(0, Math.min(1, music.volume ?? 0.4));
        const duckAmt = Math.max(0, Math.min(1, music.duckAmount ?? 0.2));
        const now = ctx.currentTime;
        if (rms > DUCK_THRESHOLD) {
          if (duckStateRef.current !== 'down') {
            try {
              gainNode.gain.cancelScheduledValues(now);
              gainNode.gain.setValueAtTime(gainNode.gain.value, now);
              gainNode.gain.linearRampToValueAtTime(baseVol * duckAmt, now + 0.2);
            } catch {}
            duckStateRef.current = 'down';
          }
        } else {
          if (duckStateRef.current !== 'up') {
            try {
              gainNode.gain.cancelScheduledValues(now);
              gainNode.gain.setValueAtTime(gainNode.gain.value, now);
              gainNode.gain.linearRampToValueAtTime(baseVol, now + 0.8);
            } catch {}
            duckStateRef.current = 'up';
          }
        }
      } catch {}
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      // Restore gain when ducking disabled / stopped
      try {
        const baseVol = Math.max(0, Math.min(1, music?.volume ?? 0.4));
        if (gainNode) gainNode.gain.value = baseVol;
        duckStateRef.current = null;
      } catch {}
    };
  }, [playing, music?.enabled, music?.duckOnDialogue, music?.duckAmount, music?.volume]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Canvas overlay RAF loop
     ───────────────────────────────────────────────────────── */
  const drawOverlays = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const v = videoRef.current;
    if (!canvas) return;

    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 405;
    if (canvas.width !== cssW) canvas.width = cssW;
    if (canvas.height !== cssH) canvas.height = cssH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentClip) return;
    const overlays = currentClip.overlays || [];
    if (overlays.length === 0) return;

    const t = Math.max(0, (v?.currentTime ?? 0) - (currentClip.trimStart ?? 0));
    const scale = canvas.height / 1080;

    for (const o of overlays) {
      const start = Math.max(0, o.showAtStart ?? 0);
      const end = Math.max(start, o.hideAtEnd ?? (start + 5));
      if (t < start || t > end) continue;

      const fadeIn = Math.max(0, o.fadeInSec ?? 0);
      const fadeOut = Math.max(0, o.fadeOutSec ?? 0);
      let alpha = 1;
      if (fadeIn > 0 && t < start + fadeIn) {
        alpha = Math.min(1, (t - start) / fadeIn);
      }
      if (fadeOut > 0 && t > end - fadeOut) {
        alpha = Math.min(alpha, Math.max(0, (end - t) / fadeOut));
      }
      if (alpha <= 0) continue;

      const px = Math.round((o.position?.x ?? 0.5) * canvas.width);
      const py = Math.round((o.position?.y ?? 0.85) * canvas.height);
      const fontSize = Math.max(10, Math.round((o.fontSize ?? 48) * scale));
      const weight = o.fontWeight ?? 700;
      const align = o.alignment ?? 'center';

      ctx.save();
      ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const lines = String(o.text || '').split('\n');
      const lineH = Math.round(fontSize * 1.25);
      const totalH = lineH * lines.length;
      const topY = py - totalH / 2 + lineH / 2;

      // Background rect
      const bgA = Math.max(0, Math.min(1, o.bgAlpha ?? 0));
      if (bgA > 0 && o.bgColor) {
        let maxW = 0;
        for (const ln of lines) {
          const w = ctx.measureText(ln).width;
          if (w > maxW) maxW = w;
        }
        const padX = Math.round(fontSize * 0.4);
        const padY = Math.round(fontSize * 0.25);
        let bgX = px;
        if (align === 'center') bgX = px - maxW / 2;
        else if (align === 'right') bgX = px - maxW;
        ctx.fillStyle = hexToRgba(o.bgColor, bgA * alpha);
        ctx.fillRect(bgX - padX, topY - lineH / 2 - padY, maxW + padX * 2, totalH + padY * 2);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = o.color || '#ffffff';
      lines.forEach((ln, i) => {
        ctx.fillText(ln, px, topY + i * lineH);
      });
      ctx.restore();
    }
  }, [currentClip]);

  useEffect(() => {
    if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
    function loop() {
      drawOverlays();
      overlayRafRef.current = requestAnimationFrame(loop);
    }
    overlayRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
      overlayRafRef.current = null;
    };
  }, [drawOverlays]);

  /* ── Playback controls ──────────────────────────────────── */
  const playPause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Resume audio context on user gesture (needed by some browsers)
    try { audioCtxRef.current?.resume?.(); } catch {}
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekToProjectTime = useCallback((projT) => {
    let acc = 0;
    for (let i = 0; i < orderedClips.length; i++) {
      const c = orderedClips[i];
      const dur = Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
      if (projT <= acc + dur || i === orderedClips.length - 1) {
        const within = Math.max(0, projT - acc);
        setCurrentClipIndex(i);
        const v = videoRef.current;
        if (v && objectUrlRecordingIdRef.current === c.recordingId) {
          try { v.currentTime = (c.trimStart ?? 0) + within; } catch {}
        }
        return;
      }
      acc += dur;
    }
  }, [orderedClips]);

  const seekToClip = useCallback((index) => {
    if (index < 0 || index >= orderedClips.length) return;
    setCurrentClipIndex(index);
    const c = orderedClips[index];
    const v = videoRef.current;
    if (v && c && objectUrlRecordingIdRef.current === c.recordingId) {
      try { v.currentTime = c.trimStart ?? 0; } catch {}
    }
  }, [orderedClips]);

  /* ── Project actions ────────────────────────────────────── */
  const createProject = useCallback(() => {
    // Open inline modal — Electron disables window.prompt(), so we use a
    // controlled input + Save/Cancel buttons instead.
    setNewProjectName('');
    setCreatingProject(true);
  }, []);

  const confirmCreateProject = useCallback(() => {
    const name = (newProjectName || '').trim();
    if (!name) { setCreatingProject(false); return; }
    const now = new Date().toISOString();
    const p = {
      id: makeId('proj'),
      name,
      description: '',
      clips: [],
      markers: [],
      music: null,
      createdAt: now,
      updatedAt: now,
    };
    setProjects(prev => [p, ...prev]);
    setSelectedProjectId(p.id);
    setCreatingProject(false);
    setNewProjectName('');
  }, [newProjectName]);

  const cancelCreateProject = useCallback(() => {
    setCreatingProject(false);
    setNewProjectName('');
  }, []);

  const touchProject = useCallback((projId, mutator) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projId) return p;
      const next = mutator(p);
      return { ...next, updatedAt: new Date().toISOString() };
    }));
  }, []);

  const renameProject = useCallback((newName) => {
    if (!selectedProject) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) { setRenaming(false); return; }
    touchProject(selectedProject.id, p => ({ ...p, name: trimmed }));
    setRenaming(false);
  }, [selectedProject, touchProject]);

  const deleteProject = useCallback(() => {
    if (!selectedProject) return;
    setProjects(prev => prev.filter(p => p.id !== selectedProject.id));
    setSelectedProjectId(null);
    setDeleteArmed(false);
  }, [selectedProject]);

  /* ── Clip actions ───────────────────────────────────────── */
  const addClip = useCallback((rec) => {
    if (!selectedProject || !rec) return;
    const dur = Number(rec.duration) || 0;
    const newClip = {
      id: makeId('clip'),
      recordingId: rec.id,
      trimStart: Number.isFinite(rec.trimStart) ? rec.trimStart : 0,
      trimEnd:   Number.isFinite(rec.trimEnd)   ? rec.trimEnd   : dur,
      gain: 1,
      muted: false,
      order: (selectedProject.clips || []).length,
      label: rec.title || 'Untitled',
      overlays: [],
    };
    touchProject(selectedProject.id, p => ({
      ...p,
      clips: [...(p.clips || []), newClip],
    }));
    setSelectedClipId(newClip.id);
  }, [selectedProject, touchProject]);

  const updateClip = useCallback((clipId, patch) => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({
      ...p,
      clips: (p.clips || []).map(c => c.id === clipId ? { ...c, ...patch } : c),
    }));
  }, [selectedProject, touchProject]);

  const removeClip = useCallback((clipId) => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => {
      const next = (p.clips || []).filter(c => c.id !== clipId);
      next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return { ...p, clips: next.map((c, i) => ({ ...c, order: i })) };
    });
    if (selectedClipId === clipId) setSelectedClipId(null);
    setRemoveArmedClipId(null);
    setCurrentClipIndex(0);
  }, [selectedProject, selectedClipId, touchProject]);

  const rippleDeleteClip = useCallback((clipId) => {
    if (!selectedProject) return;
    removeClip(clipId);
    showToast('Ripple deleted clip', 'success');
  }, [selectedProject, removeClip, showToast]);

  /* ── Split at playhead ──────────────────────────────────── */
  const splitAtPlayhead = useCallback(() => {
    if (!selectedProject || !currentClip) {
      showToast('Nothing to split', 'warn');
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const cut = v.currentTime;
    const minS = (currentClip.trimStart ?? 0) + MIN_CLIP_DUR;
    const maxE = (currentClip.trimEnd ?? 0) - MIN_CLIP_DUR;
    if (!(cut > minS && cut < maxE)) {
      showToast('Playhead too close to clip edge', 'warn');
      return;
    }
    const origId   = currentClip.id;
    const origOrder = currentClip.order ?? 0;
    const newClip = {
      id: makeId('clip'),
      recordingId: currentClip.recordingId,
      trimStart: currentClip.trimStart ?? 0,
      trimEnd: cut,
      gain: currentClip.gain ?? 1,
      muted: !!currentClip.muted,
      order: origOrder,
      label: currentClip.label || 'Clip',
    };
    touchProject(selectedProject.id, p => {
      const list = (p.clips || []).slice();
      // Update the original clip's trimStart
      const updated = list.map(c => {
        if (c.id === origId) return { ...c, trimStart: cut };
        return c;
      });
      // Bump order of anything at >= origOrder (the original + later)
      const bumped = updated.map(c => {
        if (c.id === origId) return { ...c, order: (c.order ?? 0) + 1 };
        if ((c.order ?? 0) > origOrder) return { ...c, order: (c.order ?? 0) + 1 };
        return c;
      });
      bumped.push(newClip);
      // Re-sort and reindex to keep order contiguous
      bumped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const reindexed = bumped.map((c, i) => ({ ...c, order: i }));
      return { ...p, clips: reindexed };
    });
    // The new piece (left half) takes the original index; keep playing through it
    // The within-clip time of the cut becomes the start of the next clip — keep at the same project time.
    const projTimeAtCut = offsetBeforeClip(currentClipIndex) + Math.max(0, cut - (currentClip.trimStart ?? 0));
    showToast(`Split clip at ${formatTime(projTimeAtCut)}`, 'success');
  }, [selectedProject, currentClip, currentClipIndex, offsetBeforeClip, touchProject, showToast]);

  /* ── Marker actions ─────────────────────────────────────── */
  const addMarker = useCallback(() => {
    if (!selectedProject) return;
    const n = (selectedProject.markers || []).length + 1;
    const m = {
      id: makeId('mk'),
      time: projectCurrentTime,
      label: `Chapter ${n}`,
      color: randomMarkerColor(),
    };
    touchProject(selectedProject.id, p => ({
      ...p,
      markers: [...(p.markers || []), m],
    }));
    showToast(`Marker added at ${formatTime(projectCurrentTime)}`, 'success');
  }, [selectedProject, projectCurrentTime, touchProject, showToast]);

  const updateMarker = useCallback((markerId, patch) => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({
      ...p,
      markers: (p.markers || []).map(m => m.id === markerId ? { ...m, ...patch } : m),
    }));
  }, [selectedProject, touchProject]);

  const removeMarker = useCallback((markerId) => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({
      ...p,
      markers: (p.markers || []).filter(m => m.id !== markerId),
    }));
    if (editingMarkerId === markerId) setEditingMarkerId(null);
  }, [selectedProject, touchProject, editingMarkerId]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Music actions
     ───────────────────────────────────────────────────────── */
  const updateMusic = useCallback((patch) => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({
      ...p,
      music: { ...(p.music || {}), ...patch },
    }));
  }, [selectedProject, touchProject]);

  const enableMusic = useCallback(() => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({
      ...p,
      music: {
        fileName: '',
        audioDataUrl: '',
        stemId: '',
        volume: 0.4,
        startOffset: 0,
        duckOnDialogue: true,
        duckAmount: 0.2,
        fadeInSec: 0,
        fadeOutSec: 0,
        ...(p.music || {}),
        enabled: true,
      },
    }));
    setShowMusicEditor(true);
  }, [selectedProject, touchProject]);

  const removeMusic = useCallback(() => {
    if (!selectedProject) return;
    touchProject(selectedProject.id, p => ({ ...p, music: null }));
    setShowMusicEditor(false);
    setShowStemsPicker(false);
    // Tear down music audio graph
    try { musicSrcNodeRef.current?.disconnect(); } catch {}
    try { musicGainNodeRef.current?.disconnect(); } catch {}
    musicSrcNodeRef.current = null;
    musicGainNodeRef.current = null;
  }, [selectedProject, touchProject]);

  const handleMusicFile = useCallback((file) => {
    if (!file || !selectedProject) return;
    try {
      const reader = new FileReader();
      reader.onload = () => {
        updateMusic({
          fileName: file.name || 'Music',
          audioDataUrl: String(reader.result || ''),
          stemId: '',
        });
      };
      reader.readAsDataURL(file);
    } catch {}
  }, [selectedProject, updateMusic]);

  const pickStem = useCallback((stem) => {
    if (!stem) return;
    updateMusic({
      stemId: stem.id,
      fileName: stem.name || stem.title || 'Stem',
      audioDataUrl: '',
    });
    setShowStemsPicker(false);
  }, [updateMusic]);

  /* ─────────────────────────────────────────────────────────
     Phase 3 — Overlay actions (per-clip)
     ───────────────────────────────────────────────────────── */
  const addOverlay = useCallback(() => {
    if (!selectedClip) return;
    const clipDur = Math.max(0, (selectedClip.trimEnd ?? 0) - (selectedClip.trimStart ?? 0));
    const o = {
      ...DEFAULT_OVERLAY,
      id: makeId('ovl'),
      showAtStart: 0,
      hideAtEnd: clipDur > 0 ? Math.min(5, clipDur) : 5,
    };
    const overlays = [...(selectedClip.overlays || []), o];
    updateClip(selectedClip.id, { overlays });
    setEditingOverlayId(o.id);
    setOverlaysExpanded(true);
  }, [selectedClip, updateClip]);

  const updateOverlay = useCallback((overlayId, patch) => {
    if (!selectedClip) return;
    const overlays = (selectedClip.overlays || []).map(o =>
      o.id === overlayId ? { ...o, ...patch } : o
    );
    updateClip(selectedClip.id, { overlays });
  }, [selectedClip, updateClip]);

  const removeOverlay = useCallback((overlayId) => {
    if (!selectedClip) return;
    const overlays = (selectedClip.overlays || []).filter(o => o.id !== overlayId);
    updateClip(selectedClip.id, { overlays });
    if (editingOverlayId === overlayId) setEditingOverlayId(null);
    setRemoveArmedOverlayId(null);
  }, [selectedClip, updateClip, editingOverlayId]);

  const applyOverlayPreset = useCallback((overlayId, preset) => {
    updateOverlay(overlayId, {
      position: { x: preset.x, y: preset.y },
      alignment: preset.alignment,
    });
  }, [updateOverlay]);

  /* ── Drag-to-reorder ────────────────────────────────────── */
  const handleDragStart = useCallback((e, clipId) => {
    dragClipIdRef.current = clipId;
    try { e.dataTransfer.setData('text/plain', clipId); } catch {}
    try { e.dataTransfer.effectAllowed = 'move'; } catch {}
  }, []);
  const handleDragOver = useCallback((e, clipId) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch {}
    if (dragOverClipIdRef.current !== clipId) {
      dragOverClipIdRef.current = clipId;
      setDragOverClipId(clipId);
    }
  }, []);
  const handleDragLeave = useCallback((e, clipId) => {
    if (dragOverClipIdRef.current === clipId) {
      dragOverClipIdRef.current = null;
      setDragOverClipId(null);
    }
  }, []);
  const handleDrop = useCallback((e, targetClipId) => {
    e.preventDefault();
    const sourceId = dragClipIdRef.current;
    dragClipIdRef.current = null;
    dragOverClipIdRef.current = null;
    setDragOverClipId(null);
    if (!sourceId || sourceId === targetClipId || !selectedProject) return;

    const clipsSorted = orderedClips;
    const srcIdx = clipsSorted.findIndex(c => c.id === sourceId);
    const tgtIdx = clipsSorted.findIndex(c => c.id === targetClipId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const next = clipsSorted.slice();
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    const reindexed = next.map((c, i) => ({ ...c, order: i }));

    touchProject(selectedProject.id, p => ({ ...p, clips: reindexed }));
  }, [orderedClips, selectedProject, touchProject]);
  const handleDragEnd = useCallback(() => {
    dragClipIdRef.current = null;
    dragOverClipIdRef.current = null;
    setDragOverClipId(null);
  }, []);

  /* ── Available recordings for "Add clips" panel ─────────── */
  const sortedRecordings = useMemo(() => {
    return recordings.slice().sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [recordings]);

  /* ── Progress bar click/drag → seek (with snap) ─────────── */
  const progressBarRef = useRef(null);
  const draggingPlayheadRef = useRef(false);

  const projectTimeFromClientX = useCallback((clientX) => {
    const el = progressBarRef.current;
    if (!el || projectTotal <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * projectTotal;
  }, [projectTotal]);

  const handleProgressDown = useCallback((e) => {
    if (projectTotal <= 0) return;
    draggingPlayheadRef.current = true;
    const t = projectTimeFromClientX(e.clientX);
    const snapped = snapValue(t, projectAnchors);
    seekToProjectTime(snapped);
  }, [projectTotal, projectTimeFromClientX, snapValue, projectAnchors, seekToProjectTime]);

  useEffect(() => {
    function onMove(e) {
      if (!draggingPlayheadRef.current) return;
      const t = projectTimeFromClientX(e.clientX);
      const snapped = snapValue(t, projectAnchors);
      seekToProjectTime(snapped);
    }
    function onUp() {
      draggingPlayheadRef.current = false;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [projectTimeFromClientX, snapValue, projectAnchors, seekToProjectTime]);

  /* ── Snap helpers for trimStart/trimEnd (within-clip) ───── */
  const withinClipAnchors = useCallback((clip) => {
    if (!clip) return [];
    const rec = recordingsById.get(clip.recordingId);
    const dur = Number(rec?.duration) || (clip.trimEnd ?? 0);
    const anchors = new Set();
    anchors.add(0);
    anchors.add(dur);
    for (let s = 0; s <= Math.ceil(dur); s++) anchors.add(s);
    return Array.from(anchors).sort((a, b) => a - b);
  }, [recordingsById]);

  /* ── Keyboard shortcuts ─────────────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      const tgt = e.target;
      const tag = (tgt?.tagName || '').toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (tgt && tgt.isContentEditable);
      if (isEditable) return;
      if (!selectedProject) return;

      // S — split at playhead
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }
      // M — add marker
      if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        addMarker();
        return;
      }
      // Delete / Backspace — ripple delete selected clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClip) {
        e.preventDefault();
        rippleDeleteClip(selectedClip.id);
        return;
      }
      // [ — set selected clip's trimStart to current within-clip time
      if (e.key === '[' && selectedClip && currentClip && selectedClip.id === currentClip.id) {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        const t = Math.max(0, Math.min((selectedClip.trimEnd ?? 0) - MIN_CLIP_DUR, v.currentTime));
        const anchors = withinClipAnchors(selectedClip);
        updateClip(selectedClip.id, { trimStart: snapValue(t, anchors) });
        showToast('Set trim start', 'success');
        return;
      }
      // ] — set selected clip's trimEnd to current within-clip time
      if (e.key === ']' && selectedClip && currentClip && selectedClip.id === currentClip.id) {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        const t = Math.max((selectedClip.trimStart ?? 0) + MIN_CLIP_DUR, v.currentTime);
        const anchors = withinClipAnchors(selectedClip);
        updateClip(selectedClip.id, { trimEnd: snapValue(t, anchors) });
        showToast('Set trim end', 'success');
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProject, selectedClip, currentClip, splitAtPlayhead, addMarker, rippleDeleteClip,
      updateClip, snapValue, withinClipAnchors, showToast]);

  /* ── Meter color thresholds ─────────────────────────────── */
  const meterPct = Math.min(100, Math.max(0, meterLevel * 100));
  const meterColor =
    meterLevel >= 0.85 ? '#fb7185'
    : meterLevel >= 0.6 ? '#facc15'
    : '#2dd4bf';

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="pj-wrap">
      {/* ─── Left: project list ──────────────────────────── */}
      <aside className="pj-side">
        <div className="pj-side-head">
          <div className="pj-side-title">Projects</div>
          <button
            type="button"
            className="pj-btn pj-btn-primary pj-btn-sm"
            onClick={createProject}
            title="Create a new project"
          >+ New Project</button>
        </div>

        <div className="pj-side-search">
          <input
            className="pj-inp"
            placeholder="Search projects…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="pj-side-list">
          {filteredProjects.length === 0 ? (
            <div className="pj-side-empty">
              <div className="pj-side-empty-icon">📂</div>
              <div className="pj-side-empty-title">No projects yet</div>
              <div className="pj-side-empty-sub">
                Create a new project to start arranging clips into a sequence.
              </div>
            </div>
          ) : (
            filteredProjects.map(p => {
              const clipCount = (p.clips || []).length;
              const total = (p.clips || []).reduce((sum, c) => {
                return sum + Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
              }, 0);
              return (
                <div
                  key={p.id}
                  className={`pj-row${selectedProjectId === p.id ? ' on' : ''}`}
                  onClick={() => setSelectedProjectId(p.id)}
                >
                  <div className="pj-row-name">{p.name || 'Untitled project'}</div>
                  <div className="pj-row-meta">
                    <span>{clipCount} clip{clipCount === 1 ? '' : 's'}</span>
                    <span className="pj-row-dot">·</span>
                    <span>{formatTime(total)}</span>
                  </div>
                  <div className="pj-row-time">{relativeTime(p.updatedAt)}</div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ─── Main editor + right inspector ───────────────── */}
      <section className="pj-editor">
        {!selectedProject ? (
          <div className="pj-empty">
            <div className="pj-empty-icon">📂</div>
            <div className="pj-empty-title">No project selected</div>
            <div className="pj-empty-sub">
              Pick one from the sidebar or create a new project.
            </div>
          </div>
        ) : (
          <>
            {/* Header bar */}
            <div className="pj-head">
              <div className="pj-head-left">
                {renaming ? (
                  <input
                    autoFocus
                    className="pj-inp pj-head-rename-inp"
                    defaultValue={selectedProject.name || ''}
                    onBlur={e => renameProject(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameProject(e.currentTarget.value);
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                  />
                ) : (
                  <div
                    className="pj-head-title"
                    title="Click to rename"
                    onClick={() => { setRenameVal(selectedProject.name || ''); setRenaming(true); }}
                  >
                    {selectedProject.name || 'Untitled project'}
                  </div>
                )}
                <div className="pj-head-chips">
                  <span className="pj-chip">
                    {orderedClips.length} clip{orderedClips.length === 1 ? '' : 's'}
                  </span>
                  <span className="pj-chip pj-chip-accent">
                    ⏱ {formatTime(projectTotal)}
                  </span>
                  {markers.length > 0 && (
                    <span className="pj-chip">
                      🚩 {markers.length} marker{markers.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {music?.enabled && (
                    <span className="pj-chip pj-chip-music">
                      🎵 {music.fileName || 'Music'}
                    </span>
                  )}
                </div>
              </div>
              <div className="pj-head-right">
                <button
                  type="button"
                  className="pj-btn pj-btn-ghost pj-btn-sm"
                  onClick={() => { setRenameVal(selectedProject.name || ''); setRenaming(true); }}
                  title="Rename project"
                >✏ Rename</button>
                {deleteArmed ? (
                  <>
                    <button
                      type="button"
                      className="pj-btn pj-btn-danger pj-btn-sm"
                      onClick={deleteProject}
                    >Confirm delete</button>
                    <button
                      type="button"
                      className="pj-btn pj-btn-ghost pj-btn-sm"
                      onClick={() => setDeleteArmed(false)}
                    >Cancel</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pj-btn pj-btn-danger-ghost pj-btn-sm"
                    onClick={() => setDeleteArmed(true)}
                    title="Delete this project"
                  >🗑 Delete project</button>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="pj-preview">
              <div className="pj-preview-stage">
                {currentClip && activeUrl ? (
                  <>
                    <video
                      key={currentClip.recordingId}
                      ref={videoRef}
                      className="pj-video"
                      src={activeUrl}
                      crossOrigin="anonymous"
                      preload="metadata"
                      playsInline
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      className="pj-overlay-canvas"
                      aria-hidden="true"
                    />
                  </>
                ) : (
                  <div className="pj-preview-empty">
                    <div className="pj-preview-empty-icon">🎬</div>
                    <div className="pj-preview-empty-title">
                      {orderedClips.length === 0
                        ? 'No clips yet'
                        : 'Loading preview…'}
                    </div>
                    {orderedClips.length === 0 && (
                      <div className="pj-preview-empty-sub">
                        Add clips from your recordings below to build the project.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hidden music audio element — only mounted when enabled */}
              {music?.enabled && musicSrcUrl && (
                <audio
                  ref={musicAudioRef}
                  src={musicSrcUrl}
                  crossOrigin="anonymous"
                  preload="metadata"
                  style={{ display: 'none' }}
                />
              )}

              {/* Custom controls */}
              <div className="pj-pcontrols">
                <button
                  type="button"
                  className="pj-btn pj-btn-icon pj-btn-play"
                  onClick={playPause}
                  disabled={orderedClips.length === 0}
                  title="Play / Pause"
                >{playing ? '❚❚' : '▶'}</button>
                <div className="pj-time">
                  <span className="pj-time-cur">{formatTimeDecimal(projectCurrentTime)}</span>
                  <span className="pj-time-sep">/</span>
                  <span className="pj-time-tot">{formatTimeDecimal(projectTotal)}</span>
                </div>
                <div
                  className="pj-progress"
                  ref={progressBarRef}
                  onMouseDown={handleProgressDown}
                >
                  <div
                    className="pj-progress-fill"
                    style={{
                      width: projectTotal > 0
                        ? `${Math.max(0, Math.min(100, (projectCurrentTime / projectTotal) * 100))}%`
                        : '0%',
                    }}
                  />
                  {/* Snap-anchor ticks (very subtle) */}
                  {snapEnabled && projectTotal > 0 && projectAnchors.map((a, i) => {
                    if (a <= 0 || a >= projectTotal) return null;
                    const left = (a / projectTotal) * 100;
                    return (
                      <div key={`tick-${i}-${a}`} className="pj-progress-tick"
                        style={{ left: `${left}%` }} />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Tools row ───────────────────────────────── */}
            <div className="pj-tools">
              <div className="pj-tools-group">
                <button
                  type="button"
                  className="pj-btn pj-btn-sm"
                  onClick={splitAtPlayhead}
                  disabled={!currentClip}
                  title="Split clip at playhead (S)"
                >✂ Split <span className="pj-kbd">S</span></button>
                <button
                  type="button"
                  className="pj-btn pj-btn-sm"
                  onClick={addMarker}
                  disabled={orderedClips.length === 0}
                  title="Add marker at playhead (M)"
                >➕ Marker <span className="pj-kbd">M</span></button>
                <button
                  type="button"
                  className={`pj-btn pj-btn-sm pj-snap-btn${snapEnabled ? ' on' : ''}`}
                  onClick={() => setSnapEnabled(s => !s)}
                  title="Toggle snap-to-anchors"
                >🧲 Snap: {snapEnabled ? 'ON' : 'OFF'}</button>
              </div>
              <div className="pj-tools-divider" />
              <div className="pj-tools-meter" title="Master audio level">
                <div className="pj-meter-label">LVL</div>
                <div className="pj-meter-track">
                  <div
                    className="pj-meter-fill"
                    style={{ width: `${meterPct}%`, background: meterColor }}
                  />
                </div>
              </div>
            </div>

            {/* ── Markers strip ───────────────────────────── */}
            <div className="pj-markers-wrap">
              <div className="pj-markers-strip" aria-label="Project markers">
                {markers.length === 0 ? (
                  <div className="pj-markers-empty">No markers yet — press M to add one at the playhead</div>
                ) : (
                  projectTotal > 0 && markers.map(m => {
                    const left = Math.max(0, Math.min(100, (m.time / projectTotal) * 100));
                    const isEditing = editingMarkerId === m.id;
                    const isHover = hoverMarkerId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`pj-marker${isHover ? ' hover' : ''}`}
                        style={{ left: `${left}%`, '--mk-color': m.color }}
                        onMouseEnter={() => setHoverMarkerId(m.id)}
                        onMouseLeave={() => setHoverMarkerId(h => h === m.id ? null : h)}
                        onClick={(e) => {
                          if (isEditing) return;
                          e.stopPropagation();
                          seekToProjectTime(m.time);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingMarkerId(m.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          removeMarker(m.id);
                        }}
                        title={`${m.label} · ${formatTime(m.time)}`}
                      >
                        <div className="pj-marker-flag" />
                        <div className="pj-marker-stem" />
                        {isEditing ? (
                          <div className="pj-marker-pop" onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              className="pj-inp pj-marker-inp"
                              defaultValue={m.label}
                              onBlur={(e) => {
                                updateMarker(m.id, { label: e.target.value.trim() || m.label });
                                setEditingMarkerId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateMarker(m.id, { label: e.currentTarget.value.trim() || m.label });
                                  setEditingMarkerId(null);
                                }
                                if (e.key === 'Escape') {
                                  setEditingMarkerId(null);
                                }
                              }}
                            />
                            <div className="pj-marker-swatches">
                              {MARKER_PALETTE.map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`pj-marker-swatch${m.color === c ? ' on' : ''}`}
                                  style={{ background: c }}
                                  onClick={() => updateMarker(m.id, { color: c })}
                                  aria-label={`Set color ${c}`}
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pj-marker-tip">
                            <span className="pj-marker-tip-lbl">{m.label}</span>
                            <button
                              type="button"
                              className="pj-marker-x"
                              onClick={(e) => { e.stopPropagation(); removeMarker(m.id); }}
                              aria-label="Delete marker"
                              title="Delete marker"
                            >✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="pj-timeline">
              <div className="pj-timeline-head">
                <span className="pj-timeline-title">Timeline</span>
                <span className="pj-timeline-hint">Drag clips to reorder · Click to seek · S split · M marker</span>
              </div>
              <div className="pj-track">
                {orderedClips.length === 0 ? (
                  <div className="pj-track-empty">
                    No clips on the timeline yet.
                  </div>
                ) : (
                  orderedClips.map((c, i) => {
                    const dur = Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0));
                    const widthPct = projectTotal > 0
                      ? Math.max(6, (dur / projectTotal) * 100)
                      : 100 / Math.max(1, orderedClips.length);
                    const isPlaying = i === currentClipIndex;
                    const isSelected = selectedClipId === c.id;
                    const isDragOver = dragOverClipId === c.id;

                    // Within-clip playhead position (only for the currently
                    // playing clip) for the local indicator line
                    let playheadLeft = null;
                    if (isPlaying && dur > 0) {
                      const within = Math.max(0, Math.min(dur, videoCurrentTime - (c.trimStart ?? 0)));
                      playheadLeft = (within / dur) * 100;
                    }

                    return (
                      <div
                        key={c.id}
                        className={
                          'pj-clip'
                          + (isPlaying ? ' playing' : '')
                          + (isSelected ? ' selected' : '')
                          + (isDragOver ? ' drag-over' : '')
                        }
                        style={{ flex: `${widthPct} 0 0`, minWidth: 80 }}
                        draggable
                        onDragStart={e => handleDragStart(e, c.id)}
                        onDragOver={e => handleDragOver(e, c.id)}
                        onDragLeave={e => handleDragLeave(e, c.id)}
                        onDrop={e => handleDrop(e, c.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setSelectedClipId(c.id);
                          seekToClip(i);
                        }}
                      >
                        <div className="pj-clip-label">{c.label || 'Clip'}</div>
                        <div className="pj-clip-meta-row">
                          <span className="pj-clip-dur">{formatTime(dur)}</span>
                          {(c.overlays || []).length > 0 && (
                            <span
                              className="pj-clip-badge"
                              title={`${(c.overlays || []).length} overlay${(c.overlays || []).length === 1 ? '' : 's'}`}
                            >📝 {(c.overlays || []).length}</span>
                          )}
                        </div>
                        {playheadLeft !== null && (
                          <div className="pj-clip-playhead" style={{ left: `${playheadLeft}%` }} />
                        )}
                      </div>
                    );
                  })
                )}
                <div className="pj-clip-add">+ Add clip</div>
              </div>

              {/* ─── Phase 3 — Music track row ─── */}
              <div className="pj-music-track">
                <div className="pj-music-label">🎵 Music</div>
                <div className="pj-music-lane">
                  {!music?.enabled ? (
                    <button
                      type="button"
                      className="pj-btn pj-btn-ghost pj-btn-sm pj-music-add-btn"
                      onClick={enableMusic}
                    >+ Add Music</button>
                  ) : (
                    <div
                      className="pj-music-block"
                      onClick={() => setShowMusicEditor(v => !v)}
                      title="Click to edit music settings"
                    >
                      <div className="pj-music-block-bars" aria-hidden>
                        <span /><span /><span /><span /><span /><span /><span /><span />
                      </div>
                      <div className="pj-music-block-info">
                        <div className="pj-music-block-name">
                          {music.fileName || (music.stemId ? 'Stem track' : 'No file')}
                        </div>
                        <div className="pj-music-block-meta">
                          Vol {Math.round((music.volume ?? 0.4) * 100)}%
                          {music.duckOnDialogue && <> · Auto-duck on</>}
                          {(music.startOffset ?? 0) > 0 && <> · Offset {formatTime(music.startOffset)}</>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Music editor popover ─── */}
              {music?.enabled && showMusicEditor && (
                <div className="pj-music-editor">
                  <div className="pj-music-editor-head">
                    <span className="pj-music-editor-title">Music Settings</span>
                    <button
                      type="button"
                      className="pj-inspector-close"
                      onClick={() => setShowMusicEditor(false)}
                      title="Close"
                    >✕</button>
                  </div>

                  <div className="pj-music-editor-grid">
                    <div className="pj-field">
                      <label className="pj-field-lbl">Replace file</label>
                      <input
                        className="pj-inp"
                        type="file"
                        accept="audio/*"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleMusicFile(f);
                        }}
                      />
                    </div>

                    <div className="pj-field">
                      <label className="pj-field-lbl">From Stems Library</label>
                      <button
                        type="button"
                        className="pj-btn pj-btn-ghost pj-btn-sm"
                        onClick={() => setShowStemsPicker(true)}
                      >🎚 Pick from Stems Library</button>
                    </div>

                    <div className="pj-field">
                      <label className="pj-field-lbl">
                        Volume
                        <span className="pj-field-readout">{Math.round((music.volume ?? 0.4) * 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={music.volume ?? 0.4}
                        onChange={e => updateMusic({ volume: Number(e.target.value) })}
                        className="pj-slider"
                      />
                    </div>

                    <div className="pj-field">
                      <label className="pj-field-lbl">Start offset (s)</label>
                      <input
                        className="pj-inp"
                        type="number"
                        step="0.5"
                        min="0"
                        value={music.startOffset ?? 0}
                        onChange={e => updateMusic({ startOffset: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>

                    <div className="pj-field">
                      <label className="pj-toggle">
                        <input
                          type="checkbox"
                          checked={!!music.duckOnDialogue}
                          onChange={e => updateMusic({ duckOnDialogue: e.target.checked })}
                        />
                        <span>Auto-duck during dialogue</span>
                      </label>
                    </div>

                    <div className="pj-field">
                      <label className="pj-field-lbl">
                        Duck amount
                        <span className="pj-field-readout">{Math.round((music.duckAmount ?? 0.2) * 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={music.duckAmount ?? 0.2}
                        onChange={e => updateMusic({ duckAmount: Number(e.target.value) })}
                        className="pj-slider"
                        disabled={!music.duckOnDialogue}
                      />
                    </div>

                    <div className="pj-field-row">
                      <div className="pj-field">
                        <label className="pj-field-lbl">Fade in (s)</label>
                        <input
                          className="pj-inp"
                          type="number"
                          step="0.1"
                          min="0"
                          value={music.fadeInSec ?? 0}
                          onChange={e => updateMusic({ fadeInSec: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>
                      <div className="pj-field">
                        <label className="pj-field-lbl">Fade out (s)</label>
                        <input
                          className="pj-inp"
                          type="number"
                          step="0.1"
                          min="0"
                          value={music.fadeOutSec ?? 0}
                          onChange={e => updateMusic({ fadeOutSec: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pj-music-editor-actions">
                    <button
                      type="button"
                      className="pj-btn pj-btn-danger-ghost pj-btn-sm"
                      onClick={removeMusic}
                    >🗑 Remove music</button>
                  </div>
                </div>
              )}

              {/* ─── Stems picker modal ─── */}
              {showStemsPicker && (
                <div className="pj-stems-picker">
                  <div className="pj-stems-picker-head">
                    <span className="pj-stems-picker-title">Pick from Stems Library</span>
                    <button
                      type="button"
                      className="pj-inspector-close"
                      onClick={() => setShowStemsPicker(false)}
                    >✕</button>
                  </div>
                  {stemsList.length === 0 ? (
                    <div className="pj-stems-picker-empty">
                      No stems found in your Stems Library.
                    </div>
                  ) : (
                    <div className="pj-stems-picker-list">
                      {stemsList.map(s => (
                        <div
                          key={s.id}
                          className="pj-stems-picker-row"
                          onClick={() => pickStem(s)}
                        >
                          <div className="pj-stems-picker-thumb">🎚</div>
                          <div className="pj-stems-picker-info">
                            <div className="pj-stems-picker-name">{s.name || s.title || 'Stem'}</div>
                            <div className="pj-stems-picker-meta">
                              {s.artist || ''}{s.duration ? ` · ${formatTime(s.duration)}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Source clips panel */}
            <div className="pj-sources">
              <div className="pj-sources-head">
                <span className="pj-sources-title">Add clips from your recordings</span>
                <span className="pj-sources-count">
                  {sortedRecordings.length} recording{sortedRecordings.length === 1 ? '' : 's'}
                </span>
              </div>
              {sortedRecordings.length === 0 ? (
                <div className="pj-sources-empty">
                  No recordings yet. Record one in Podcast Studio to get started.
                </div>
              ) : (
                <div className="pj-sources-grid">
                  {sortedRecordings.map(r => (
                    <div key={r.id} className="pj-source">
                      <div className="pj-source-thumb">▶</div>
                      <div className="pj-source-info">
                        <div className="pj-source-name">{r.title || 'Untitled recording'}</div>
                        <div className="pj-source-meta">
                          <span>{formatTime(r.duration)}</span>
                          <span className="pj-row-dot">·</span>
                          <span>{formatBytes(r.size)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pj-btn pj-btn-primary pj-btn-xs"
                        onClick={() => addClip(r)}
                        title="Add this recording to the project as a clip"
                      >+ Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ─── Right: clip inspector ───────────────────────── */}
      {selectedProject && selectedClip && (
        <aside className="pj-inspector">
          <div className="pj-inspector-head">
            <span className="pj-inspector-title">Clip</span>
            <button
              type="button"
              className="pj-inspector-close"
              onClick={() => setSelectedClipId(null)}
              title="Close inspector"
            >✕</button>
          </div>

          <div className="pj-field">
            <label className="pj-field-lbl">Label</label>
            <input
              className="pj-inp"
              value={selectedClip.label || ''}
              onChange={e => updateClip(selectedClip.id, { label: e.target.value })}
            />
          </div>

          <div className="pj-field-row">
            <div className="pj-field">
              <label className="pj-field-lbl">Trim start (s)</label>
              <input
                className="pj-inp"
                type="number"
                step="0.1"
                min="0"
                value={Number.isFinite(selectedClip.trimStart) ? selectedClip.trimStart : 0}
                onChange={e => {
                  const raw = Math.max(0, Number(e.target.value) || 0);
                  const maxAllowed = Math.max(0, (selectedClip.trimEnd ?? 0) - MIN_CLIP_DUR);
                  const clamped = Math.min(raw, maxAllowed);
                  const anchors = withinClipAnchors(selectedClip);
                  updateClip(selectedClip.id, { trimStart: snapValue(clamped, anchors) });
                }}
              />
            </div>
            <div className="pj-field">
              <label className="pj-field-lbl">Trim end (s)</label>
              <input
                className="pj-inp"
                type="number"
                step="0.1"
                min="0"
                value={Number.isFinite(selectedClip.trimEnd) ? selectedClip.trimEnd : 0}
                onChange={e => {
                  const raw = Math.max(0, Number(e.target.value) || 0);
                  const minAllowed = (selectedClip.trimStart ?? 0) + MIN_CLIP_DUR;
                  const clamped = Math.max(raw, minAllowed);
                  const anchors = withinClipAnchors(selectedClip);
                  updateClip(selectedClip.id, { trimEnd: snapValue(clamped, anchors) });
                }}
              />
            </div>
          </div>

          <div className="pj-field">
            <label className="pj-field-lbl">
              Gain
              <span className="pj-field-readout">{(selectedClip.gain ?? 1).toFixed(2)}×</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={selectedClip.gain ?? 1}
              onChange={e => updateClip(selectedClip.id, { gain: Number(e.target.value) })}
              className="pj-slider"
            />
          </div>

          <div className="pj-field">
            <label className="pj-toggle">
              <input
                type="checkbox"
                checked={!!selectedClip.muted}
                onChange={e => updateClip(selectedClip.id, { muted: e.target.checked })}
              />
              <span>Mute</span>
            </label>
          </div>

          {/* ─── Phase 3 — Text Overlays section ─── */}
          <div className="pj-overlay-section">
            <div
              className="pj-overlay-section-head"
              onClick={() => setOverlaysExpanded(v => !v)}
            >
              <span className="pj-overlay-section-title">
                📝 Text Overlays
                {(selectedClip.overlays || []).length > 0 && (
                  <span className="pj-overlay-count">{(selectedClip.overlays || []).length}</span>
                )}
              </span>
              <span className="pj-overlay-section-chev">{overlaysExpanded ? '▾' : '▸'}</span>
            </div>

            {overlaysExpanded && (
              <div className="pj-overlay-body">
                <button
                  type="button"
                  className="pj-btn pj-btn-primary pj-btn-sm pj-overlay-add-btn"
                  onClick={addOverlay}
                >+ Add Overlay</button>

                {(selectedClip.overlays || []).length === 0 ? (
                  <div className="pj-overlay-empty">
                    No overlays yet. Add one to display text during this clip.
                  </div>
                ) : (
                  <div className="pj-overlay-list">
                    {(selectedClip.overlays || []).map(o => {
                      const isEditing = editingOverlayId === o.id;
                      const isArmed = removeArmedOverlayId === o.id;
                      const truncated = (o.text || '').split('\n')[0].slice(0, 22);
                      return (
                        <div key={o.id} className={`pj-overlay-row${isEditing ? ' editing' : ''}`}>
                          <div className="pj-overlay-row-head">
                            <button
                              type="button"
                              className="pj-overlay-row-text"
                              onClick={() => setEditingOverlayId(isEditing ? null : o.id)}
                              title="Edit overlay"
                            >{truncated || '(empty)'}</button>
                            {isArmed ? (
                              <>
                                <button
                                  type="button"
                                  className="pj-btn pj-btn-danger pj-btn-xs"
                                  onClick={() => removeOverlay(o.id)}
                                >Remove</button>
                                <button
                                  type="button"
                                  className="pj-btn pj-btn-ghost pj-btn-xs"
                                  onClick={() => setRemoveArmedOverlayId(null)}
                                >Cancel</button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="pj-btn pj-btn-danger-ghost pj-btn-xs"
                                onClick={() => setRemoveArmedOverlayId(o.id)}
                                title="Delete overlay"
                              >🗑</button>
                            )}
                          </div>

                          {isEditing && (
                            <div className="pj-overlay-edit">
                              <div className="pj-field">
                                <label className="pj-field-lbl">Text</label>
                                <textarea
                                  className="pj-inp pj-overlay-textarea"
                                  rows={2}
                                  value={o.text || ''}
                                  onChange={e => updateOverlay(o.id, { text: e.target.value })}
                                />
                              </div>

                              <div className="pj-field">
                                <label className="pj-field-lbl">Position preset</label>
                                <div className="pj-overlay-presets">
                                  {OVERLAY_PRESETS.map(pr => (
                                    <button
                                      key={pr.id}
                                      type="button"
                                      className="pj-btn pj-btn-ghost pj-btn-xs"
                                      onClick={() => applyOverlayPreset(o.id, pr)}
                                    >{pr.label}</button>
                                  ))}
                                </div>
                              </div>

                              <div className="pj-field-row">
                                <div className="pj-field">
                                  <label className="pj-field-lbl">X (0–1)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={o.position?.x ?? 0.5}
                                    onChange={e => updateOverlay(o.id, {
                                      position: {
                                        x: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                                        y: o.position?.y ?? 0.5,
                                      },
                                    })}
                                  />
                                </div>
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Y (0–1)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={o.position?.y ?? 0.85}
                                    onChange={e => updateOverlay(o.id, {
                                      position: {
                                        x: o.position?.x ?? 0.5,
                                        y: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                                      },
                                    })}
                                  />
                                </div>
                              </div>

                              <div className="pj-field">
                                <label className="pj-field-lbl">Alignment</label>
                                <div className="pj-overlay-segments">
                                  {['left', 'center', 'right'].map(a => (
                                    <button
                                      key={a}
                                      type="button"
                                      className={`pj-seg${o.alignment === a ? ' on' : ''}`}
                                      onClick={() => updateOverlay(o.id, { alignment: a })}
                                    >{a}</button>
                                  ))}
                                </div>
                              </div>

                              <div className="pj-field-row">
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Font size</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="1"
                                    min="8"
                                    max="200"
                                    value={o.fontSize ?? 48}
                                    onChange={e => updateOverlay(o.id, { fontSize: Math.max(8, Number(e.target.value) || 48) })}
                                  />
                                </div>
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Weight</label>
                                  <div className="pj-overlay-segments">
                                    <button
                                      type="button"
                                      className={`pj-seg${(o.fontWeight ?? 700) === 400 ? ' on' : ''}`}
                                      onClick={() => updateOverlay(o.id, { fontWeight: 400 })}
                                    >Reg</button>
                                    <button
                                      type="button"
                                      className={`pj-seg${(o.fontWeight ?? 700) === 700 ? ' on' : ''}`}
                                      onClick={() => updateOverlay(o.id, { fontWeight: 700 })}
                                    >Bold</button>
                                  </div>
                                </div>
                              </div>

                              <div className="pj-field-row">
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Text color</label>
                                  <input
                                    type="color"
                                    className="pj-overlay-color"
                                    value={o.color || '#ffffff'}
                                    onChange={e => updateOverlay(o.id, { color: e.target.value })}
                                  />
                                </div>
                                <div className="pj-field">
                                  <label className="pj-field-lbl">BG color</label>
                                  <input
                                    type="color"
                                    className="pj-overlay-color"
                                    value={o.bgColor || '#000000'}
                                    onChange={e => updateOverlay(o.id, { bgColor: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="pj-field">
                                <label className="pj-field-lbl">
                                  BG alpha
                                  <span className="pj-field-readout">{Math.round((o.bgAlpha ?? 0) * 100)}%</span>
                                </label>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={o.bgAlpha ?? 0}
                                  onChange={e => updateOverlay(o.id, { bgAlpha: Number(e.target.value) })}
                                  className="pj-slider"
                                />
                              </div>

                              <div className="pj-field-row">
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Show at (s)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={o.showAtStart ?? 0}
                                    onChange={e => updateOverlay(o.id, { showAtStart: Math.max(0, Number(e.target.value) || 0) })}
                                  />
                                </div>
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Hide at (s)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={o.hideAtEnd ?? 5}
                                    onChange={e => updateOverlay(o.id, { hideAtEnd: Math.max(0, Number(e.target.value) || 0) })}
                                  />
                                </div>
                              </div>

                              <div className="pj-field-row">
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Fade in (s)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={o.fadeInSec ?? 0.3}
                                    onChange={e => updateOverlay(o.id, { fadeInSec: Math.max(0, Number(e.target.value) || 0) })}
                                  />
                                </div>
                                <div className="pj-field">
                                  <label className="pj-field-lbl">Fade out (s)</label>
                                  <input
                                    className="pj-inp"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={o.fadeOutSec ?? 0.3}
                                    onChange={e => updateOverlay(o.id, { fadeOutSec: Math.max(0, Number(e.target.value) || 0) })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pj-field pj-inspector-meta">
            <div className="pj-field-lbl">Source</div>
            <div className="pj-inspector-source">
              {recordingsById.get(selectedClip.recordingId)?.title || '(missing recording)'}
            </div>
            <div className="pj-inspector-source-sub">
              Original duration: {formatTime(recordingsById.get(selectedClip.recordingId)?.duration)}
            </div>
          </div>

          <div className="pj-inspector-actions">
            <button
              type="button"
              className="pj-btn pj-btn-sm"
              onClick={() => rippleDeleteClip(selectedClip.id)}
              title="Ripple delete: remove this clip and shift the rest forward (Delete)"
            >🗑 Ripple Delete</button>
            {removeArmedClipId === selectedClip.id ? (
              <>
                <button
                  type="button"
                  className="pj-btn pj-btn-danger pj-btn-sm"
                  onClick={() => removeClip(selectedClip.id)}
                >Confirm remove</button>
                <button
                  type="button"
                  className="pj-btn pj-btn-ghost pj-btn-sm"
                  onClick={() => setRemoveArmedClipId(null)}
                >Cancel</button>
              </>
            ) : (
              <button
                type="button"
                className="pj-btn pj-btn-danger-ghost pj-btn-sm"
                onClick={() => setRemoveArmedClipId(selectedClip.id)}
                title="Remove this clip from the project"
              >🗑 Remove from project</button>
            )}
          </div>
        </aside>
      )}

      <PjToast
        message={toast}
        kind={toastKind}
        onClose={() => setToast('')}
      />

      {/* ─── New-project modal (replaces window.prompt) ──── */}
      {creatingProject && (
        <div
          className="pj-modal-backdrop"
          onClick={cancelCreateProject}
          role="presentation"
        >
          <div
            className="pj-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="New project"
          >
            <div className="pj-modal-head">
              <div className="pj-modal-title">New project</div>
              <button
                type="button"
                className="pj-btn pj-btn-ghost pj-btn-sm"
                onClick={cancelCreateProject}
                aria-label="Close"
              >✕</button>
            </div>
            <div className="pj-modal-body">
              <label className="pj-modal-label" htmlFor="pj-new-proj-name">
                Project name
              </label>
              <input
                id="pj-new-proj-name"
                autoFocus
                className="pj-inp"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmCreateProject();
                  if (e.key === 'Escape') cancelCreateProject();
                }}
                placeholder="e.g. Episode 12 — Sunday Recap"
                maxLength={120}
              />
            </div>
            <div className="pj-modal-actions">
              <button
                type="button"
                className="pj-btn pj-btn-ghost"
                onClick={cancelCreateProject}
              >Cancel</button>
              <button
                type="button"
                className="pj-btn pj-btn-primary"
                onClick={confirmCreateProject}
                disabled={!newProjectName.trim()}
              >Create project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
