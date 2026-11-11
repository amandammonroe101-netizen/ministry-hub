import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import { formatBytes } from '../../utils/formatBytes';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadBlob } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import ProjectEditor from './ProjectEditor';
import './PodcastEditor.css';

/* ─────────────────────────────────────────────────────────────
   Podcast Editor — trim & light edit for podcast recordings
   Namespace: .pe-*
   Accent: var(--accent-teal, #2dd4bf)
   Metadata: Firestore /users/{uid}/kv/podcast:recordings
   Video blobs: Firebase Storage /users/{uid}/recordings/<id>.<ext>
   ───────────────────────────────────────────────────────────── */

const LS_KEY = 'podcast:recordings';

/* ─── helpers ──────────────────────────────────────────────── */
function loadRecordings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveRecordings(arr) {
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

function makeId() {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extFromMime(mimeType = '') {
  if (/mp4/i.test(mimeType))   return 'mp4';
  if (/webm/i.test(mimeType))  return 'webm';
  if (/quicktime|mov/i.test(mimeType)) return 'mov';
  if (/x-matroska|mkv/i.test(mimeType)) return 'mkv';
  return 'webm';
}

/* Clamp helper for trim handle drag */
function clampTrim(start, end, duration) {
  const dur = Math.max(0, duration || 0);
  const MIN_GAP = 0.5; // half second min trim length
  let s = Math.max(0, Math.min(start, dur));
  let e = Math.max(0, Math.min(end, dur));
  if (e - s < MIN_GAP) {
    if (s + MIN_GAP <= dur) e = s + MIN_GAP;
    else { e = dur; s = Math.max(0, dur - MIN_GAP); }
  }
  return { trimStart: s, trimEnd: e };
}

/* ─── Toast ────────────────────────────────────────────────── */
function Toast({ message, action, onAction, onClose, kind = 'info' }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className={`pe-toast pe-toast-${kind}`} role="status">
      <span className="pe-toast-msg">{message}</span>
      {action && (
        <button
          className="pe-toast-action"
          onClick={() => { onAction?.(); onClose(); }}
        >{action}</button>
      )}
      <button className="pe-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Collapsible section ───────────────────────────────────── */
function Section({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pe-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="pe-section-head"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="pe-section-caret" aria-hidden="true">▸</span>
        {icon && <span className="pe-section-icon" aria-hidden="true">{icon}</span>}
        <span className="pe-section-title">{title}</span>
      </button>
      {open && <div className="pe-section-body">{children}</div>}
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function PodcastEditor() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  /* Firestore-backed via useUserStoreKey — same list Podcast Studio writes to
     and Podcast Recordings reads. Trimmed exports get prepended to the same list. */
  const [recordings, setRecordings] = useUserStoreKey('podcast:recordings', []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');

  // Mode toggle: 'trim' (existing Quick Trim) or 'projects' (new multi-clip editor)
  const [mode, setMode] = useState(() => {
    try {
      const stored = localStorage.getItem('podcast:editor-mode');
      return stored === 'projects' ? 'projects' : 'trim';
    } catch { return 'trim'; }
  });
  useEffect(() => {
    try { localStorage.setItem('podcast:editor-mode', mode); } catch {}
  }, [mode]);

  // Trim/edit state — staged, not yet persisted
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd]     = useState(0);
  const [muted, setMuted]         = useState(false);
  const [audioGain, setAudioGain] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [dirty, setDirty]         = useState(false);

  // Playback state
  const [duration, setDuration]   = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [volume, setVolume]       = useState(1);
  const [loopTrim, setLoopTrim]   = useState(false);

  // Object URL lifecycle
  const objectUrlRef = useRef(null);
  const [activeUrl, setActiveUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError]   = useState('');

  // Video ref + audio processing for gain control
  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Timeline drag
  const trackRef = useRef(null);
  const dragRef = useRef(null);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);

  // Toast
  const [toast, setToast]         = useState('');
  const [toastKind, setToastKind] = useState('info');
  const [toastAction, setToastAction] = useState(null);
  const [toastOnAction, setToastOnAction] = useState(null);

  const showToast = useCallback((msg, kind = 'info', action = null, onAction = null) => {
    setToastKind(kind);
    setToast(msg);
    setToastAction(action);
    setToastOnAction(() => onAction);
  }, []);

  /* (No persist/listener — useUserStoreKey autosaves and onSnapshot streams
     in updates from Podcast Studio or other devices.) */

  /* ── Deep-link: ?id=<recId> auto-select on mount ────────────── */
  useEffect(() => {
    const fromUrl = searchParams.get('id');
    if (fromUrl) {
      setSelectedId(fromUrl);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derived: filtered + sorted recordings ─────────────────── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = recordings.slice();
    arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (!q) return arr;
    return arr.filter(r => {
      const tagStr = Array.isArray(r.tags) ? r.tags.join(' ').toLowerCase() : '';
      return (
        (r.title || '').toLowerCase().includes(q) ||
        tagStr.includes(q)
      );
    });
  }, [recordings, query]);

  const selected = useMemo(
    () => recordings.find(r => r.id === selectedId) || null,
    [recordings, selectedId]
  );

  /* ── Resolve the video URL from the selected recording ───────
     Firebase URLs are stable, so we read selected.videoUrl directly.
     No async loading state, no object URL revoke dance. */
  useEffect(() => {
    setUrlError('');
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setLoadingUrl(false);
    if (!selected) {
      setActiveUrl('');
      return;
    }
    setActiveUrl(selected.videoUrl || '');
    if (!selected.videoUrl) {
      setUrlError('This recording has no cloud video. It may pre-date the Firebase migration.');
    }
  }, [selected]);

  /* ── Cleanup audio context on unmount ───────────────────────── */
  useEffect(() => {
    return () => {
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  /* ── Sync staged trim/edit state when selection changes ─────── */
  useEffect(() => {
    if (!selected) {
      setTrimStart(0);
      setTrimEnd(0);
      setMuted(false);
      setAudioGain(1);
      setEditNotes('');
      setDirty(false);
      return;
    }
    const dur = Number(selected.duration) || 0;
    const ts = Number.isFinite(selected.trimStart) ? selected.trimStart : 0;
    const te = Number.isFinite(selected.trimEnd) ? selected.trimEnd : dur;
    const { trimStart: s, trimEnd: e } = clampTrim(ts, te || dur, dur);
    setTrimStart(s);
    setTrimEnd(e || dur);
    setMuted(!!selected.muted);
    setAudioGain(Number.isFinite(selected.audioGain) ? selected.audioGain : 1);
    setEditNotes(selected.editNotes || '');
    setDirty(false);
  }, [selected]);

  /* ── Wire video element listeners (loadedmetadata, timeupdate, etc) ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeUrl) return undefined;

    const onLoaded = () => {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      setDuration(dur);
      // If selection had no trimEnd yet, set it to duration
      setTrimEnd(prev => {
        if (!prev || prev <= 0 || prev > dur) return dur;
        return prev;
      });
    };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (loopTrim && v.currentTime >= trimEnd - 0.05) {
        v.currentTime = trimStart;
      }
    };
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);

    // If metadata already loaded (cached), pull duration now
    if (v.readyState >= 1 && Number.isFinite(v.duration)) {
      onLoaded();
    }

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, [activeUrl, loopTrim, trimStart, trimEnd]);

  /* ── Apply volume + muted to video element ──────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted, activeUrl]);

  /* ── Setup audio gain pipeline (optional polish) ────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeUrl) return undefined;
    // We only need gain if it's non-1 (avoid breaking native playback for normal case)
    // Setup lazily on first non-unity gain.
    if (audioGain === 1) return undefined;

    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return undefined;
        audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = ctx.createMediaElementSource(v);
        gainNodeRef.current = ctx.createGain();
        sourceNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(ctx.destination);
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = Math.max(0, Math.min(2, audioGain));
      }
    } catch {
      /* AudioContext not available — gain becomes informational only */
    }
    return undefined;
  }, [audioGain, activeUrl]);

  /* ── Update gain when audioGain changes (after pipeline wired) ─ */
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(2, audioGain));
    }
  }, [audioGain]);

  /* ── Track dirty edits ─────────────────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    const dur = Number(selected.duration) || 0;
    const origStart = Number.isFinite(selected.trimStart) ? selected.trimStart : 0;
    const origEnd   = Number.isFinite(selected.trimEnd)   ? selected.trimEnd   : dur;
    const origGain  = Number.isFinite(selected.audioGain) ? selected.audioGain : 1;
    const origMuted = !!selected.muted;
    const origNotes = selected.editNotes || '';
    const changed =
      Math.abs(trimStart - origStart) > 0.001 ||
      Math.abs(trimEnd   - origEnd)   > 0.001 ||
      Math.abs(audioGain - origGain)  > 0.001 ||
      muted !== origMuted ||
      editNotes !== origNotes;
    setDirty(changed);
  }, [selected, trimStart, trimEnd, audioGain, muted, editNotes]);

  /* ── Playback helpers ──────────────────────────────────────── */
  const playPause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // If audio context exists, ensure resumed (browser autoplay policy)
      try { audioCtxRef.current?.resume?.(); } catch {}
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const seekTo = useCallback((t) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(t, duration || 0));
    v.currentTime = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const jumpToIn  = useCallback(() => seekTo(trimStart), [seekTo, trimStart]);
  const jumpToOut = useCallback(() => seekTo(trimEnd),   [seekTo, trimEnd]);

  const setInToCurrent = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setTrimStart(prev => {
      const c = clampTrim(t, trimEnd, duration);
      return c.trimStart;
    });
    setTrimEnd(prev => {
      const c = clampTrim(t, prev, duration);
      return c.trimEnd;
    });
  }, [trimEnd, duration]);

  const setOutToCurrent = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setTrimEnd(prev => {
      const c = clampTrim(trimStart, t, duration);
      return c.trimEnd;
    });
    setTrimStart(prev => {
      const c = clampTrim(prev, t, duration);
      return c.trimStart;
    });
  }, [trimStart, duration]);

  const resetTrim = useCallback(() => {
    setTrimStart(0);
    setTrimEnd(duration);
  }, [duration]);

  /* ── Timeline pointer drag ─────────────────────────────────── */
  const handleTrackPointerDown = useCallback((e) => {
    // Click on empty track → seek
    const track = trackRef.current;
    if (!track) return;
    if (e.target.closest('.pe-tl-handle')) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * duration;
    seekTo(t);
  }, [duration, seekTo]);

  const handleHandlePointerDown = useCallback((e, which) => {
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    dragRef.current = { which, rect };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleHandlePointerMove = useCallback((e) => {
    const ds = dragRef.current;
    if (!ds) return;
    const x = Math.max(0, Math.min(ds.rect.width, e.clientX - ds.rect.left));
    const t = (x / ds.rect.width) * duration;
    if (ds.which === 'in') {
      setTrimStart(prev => {
        const c = clampTrim(t, trimEnd, duration);
        return c.trimStart;
      });
      // Re-clamp end too in case in approached end
      setTrimEnd(prev => {
        const c = clampTrim(t, prev, duration);
        return c.trimEnd;
      });
    } else {
      setTrimEnd(prev => {
        const c = clampTrim(trimStart, t, duration);
        return c.trimEnd;
      });
      setTrimStart(prev => {
        const c = clampTrim(prev, t, duration);
        return c.trimStart;
      });
    }
  }, [duration, trimStart, trimEnd]);

  const handleHandlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  /* ── Save trim (non-destructive) ───────────────────────────── */
  const saveTrim = useCallback(() => {
    if (!selected) return;
    setRecordings(prev => prev.map(r => r.id === selected.id ? {
      ...r,
      trimStart,
      trimEnd,
      audioGain,
      muted,
      editNotes,
      editedAt: Date.now(),
    } : r));
    showToast('Trim saved — non-destructive edits applied.', 'success');
  }, [selected, trimStart, trimEnd, audioGain, muted, editNotes, showToast]);

  /* ── Discard staged changes ────────────────────────────────── */
  const discardChanges = useCallback(() => {
    if (!selected) return;
    const dur = Number(selected.duration) || 0;
    const ts = Number.isFinite(selected.trimStart) ? selected.trimStart : 0;
    const te = Number.isFinite(selected.trimEnd) ? selected.trimEnd : dur;
    const { trimStart: s, trimEnd: e } = clampTrim(ts, te || dur, dur);
    setTrimStart(s);
    setTrimEnd(e || dur);
    setMuted(!!selected.muted);
    setAudioGain(Number.isFinite(selected.audioGain) ? selected.audioGain : 1);
    setEditNotes(selected.editNotes || '');
  }, [selected]);

  /* ── Export-as-new flow ────────────────────────────────────── */
  const exportAsNew = useCallback(async () => {
    if (!selected) return;
    const v = videoRef.current;
    if (!v) return;
    if (typeof v.captureStream !== 'function' && typeof v.mozCaptureStream !== 'function') {
      showToast('Re-encoding not supported in this browser. The trim points are saved — playback will respect them in Recordings.', 'warn');
      return;
    }
    if (exporting) return;

    setExporting(true);
    setExportProgress(0);

    try {
      // Pause first so we can seek precisely.
      v.pause();
      // Seek to trimStart
      const seekPromise = new Promise(resolve => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
        v.currentTime = trimStart;
      });
      await seekPromise;

      const stream = (v.captureStream
        ? v.captureStream()
        : v.mozCaptureStream()).clone();

      // Pick a mimeType — prefer source's; fall back through common ones.
      const candidates = [
        selected.mimeType,
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ].filter(Boolean);
      let mimeType = '';
      for (const c of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(c)) {
          mimeType = c;
          break;
        }
      }

      chunksRef.current = [];
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      const stopPromise = new Promise((resolve) => {
        rec.onstop = () => resolve();
      });

      rec.start(250); // collect chunks every 250ms

      // Progress + auto-stop tick
      const trimDuration = Math.max(0.1, trimEnd - trimStart);
      let rafId = 0;
      const progressTick = () => {
        if (!v || rec.state === 'inactive') return;
        const elapsed = v.currentTime - trimStart;
        const pct = Math.max(0, Math.min(1, elapsed / trimDuration));
        setExportProgress(pct);
        if (v.currentTime >= trimEnd - 0.02 || v.ended) {
          try { rec.stop(); } catch {}
          v.pause();
          return;
        }
        rafId = requestAnimationFrame(progressTick);
      };
      try { audioCtxRef.current?.resume?.(); } catch {}
      await v.play();
      rafId = requestAnimationFrame(progressTick);

      await stopPromise;
      if (rafId) cancelAnimationFrame(rafId);

      // Stop tracks on cloned stream
      try { stream.getTracks().forEach(t => t.stop()); } catch {}

      const blobType = mimeType || selected.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: blobType });
      const newId = makeId();
      if (!user?.uid) throw new Error('Sign in required to save trimmed export.');
      /* Upload the trimmed blob to Firebase Storage. */
      const ext = /webm/i.test(blobType) ? '.webm'
                : /mp4/i.test(blobType)  ? '.mp4'
                : '';
      const { url, path, size, contentType } = await uploadBlob(
        user.uid,
        'recordings',
        blob,
        { filename: `${newId}${ext}`, contentType: blobType }
      );

      const newRec = {
        id: newId,
        title: `${selected.title || 'Untitled'} (trimmed)`,
        duration: trimDuration,
        size: size || blob.size,
        mimeType: contentType || blobType,
        videoUrl: url,
        storagePath: path,
        createdAt: new Date().toISOString(),
        tags: Array.isArray(selected.tags) ? [...selected.tags, 'trimmed'] : ['trimmed'],
        notes: selected.notes || '',
        videoWidth: selected.videoWidth,
        videoHeight: selected.videoHeight,
        framerate: selected.framerate,
        cameraLabel: selected.cameraLabel,
        micLabel: selected.micLabel,
        sourceId: selected.id,
        editNotes,
      };
      setRecordings(prev => [newRec, ...prev]);
      setExportProgress(1);
      showToast(
        `Exported "${newRec.title}" — ${formatBytes(blob.size)}`,
        'success',
        'View in Recordings',
        () => navigate(`/podcast-recordings?id=${encodeURIComponent(newId)}`),
      );
    } catch (err) {
      showToast(`Export failed: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setExporting(false);
      setTimeout(() => setExportProgress(0), 1500);
      recorderRef.current = null;
      chunksRef.current = [];
    }
  }, [selected, trimStart, trimEnd, editNotes, exporting, navigate, showToast, user, setRecordings]);

  /* ── Keyboard shortcuts ────────────────────────────────────── */
  useEffect(() => {
    if (!selected) return undefined;
    function onKey(e) {
      // Ignore when typing in form fields
      const tag = (e.target?.tagName || '').toLowerCase();
      const isField = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (isField) return;

      const v = videoRef.current;
      switch (e.key) {
        case ' ':
        case 'Spacebar': {
          e.preventDefault();
          playPause();
          break;
        }
        case 'i':
        case 'I': {
          e.preventDefault();
          setInToCurrent();
          break;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          setOutToCurrent();
          break;
        }
        case 'ArrowLeft': {
          if (!v) break;
          e.preventDefault();
          seekTo(v.currentTime - (e.shiftKey ? 10 : 1));
          break;
        }
        case 'ArrowRight': {
          if (!v) break;
          e.preventDefault();
          seekTo(v.currentTime + (e.shiftKey ? 10 : 1));
          break;
        }
        case 'Home': {
          e.preventDefault();
          jumpToIn();
          break;
        }
        case 'End': {
          e.preventDefault();
          jumpToOut();
          break;
        }
        default: break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, playPause, setInToCurrent, setOutToCurrent, seekTo, jumpToIn, jumpToOut]);

  /* ── Render helpers ────────────────────────────────────────── */
  const trimDur = Math.max(0, trimEnd - trimStart);
  const inPct  = duration > 0 ? (trimStart / duration) * 100 : 0;
  const outPct = duration > 0 ? (trimEnd   / duration) * 100 : 100;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="pe-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>
      <NavRail />

      <main className="pe-main">
        {/* ─── Mode tabs ──────────────────────────────────── */}
        <div className="pe-mode-tabs" role="tablist" aria-label="Editor mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'trim'}
            onClick={() => setMode('trim')}
            className={`pe-mode-tab${mode === 'trim' ? ' on' : ''}`}
          >
            ✂ Quick Trim
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'projects'}
            onClick={() => setMode('projects')}
            className={`pe-mode-tab${mode === 'projects' ? ' on' : ''}`}
          >
            📂 Projects
          </button>
        </div>

        {mode === 'projects' ? (
          <ProjectEditor />
        ) : (
        <div className="pe-layout">
          {/* ─── Sidebar ───────────────────────────────────── */}
          <aside className="pe-side">
            <div className="pe-side-head">
              <div className="pe-side-title-wrap">
                <span className="pe-side-title">Editor</span>
                <span className="pe-side-sub pe-muted">Pick a recording to trim</span>
              </div>
              <span className="pe-side-count pe-muted">
                {recordings.length}
              </span>
            </div>

            <div className="pe-search-wrap">
              <input
                className="pe-inp"
                placeholder="Search title, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div className="pe-list">
              {filtered.length === 0 ? (
                <div className="pe-list-empty pe-muted">
                  {recordings.length === 0
                    ? 'No recordings yet. Record one in Podcast Studio.'
                    : 'No recordings match your search.'}
                </div>
              ) : (
                filtered.map(r => {
                  const trimmed =
                    (Number.isFinite(r.trimStart) && r.trimStart > 0) ||
                    (Number.isFinite(r.trimEnd) && Number.isFinite(r.duration) && r.trimEnd < r.duration - 0.01);
                  return (
                    <div
                      key={r.id}
                      className={`pe-row${selectedId === r.id ? ' on' : ''}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className="pe-row-thumb" aria-hidden="true">
                        <span className="pe-row-thumb-icon">▶</span>
                      </div>
                      <div className="pe-row-info">
                        <div className="pe-row-name">{r.title || 'Untitled recording'}</div>
                        <div className="pe-row-sub">
                          <span className="pe-row-dur">{formatTime(r.duration)}</span>
                          <span className="pe-row-dot">·</span>
                          <span className="pe-row-size">{formatBytes(r.size)}</span>
                        </div>
                        {trimmed && (
                          <div className="pe-row-badges">
                            <span className="pe-row-badge pe-row-badge-trim">✂ trimmed</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* ─── Editor pane ───────────────────────────────── */}
          <section className="pe-editor">
            {!selected ? (
              <div className="pe-empty">
                <div className="pe-empty-icon">✂</div>
                <div className="pe-empty-title">No recording selected</div>
                <div className="pe-empty-sub">
                  {recordings.length === 0
                    ? 'Record a video in Podcast Studio first — your takes will appear in the sidebar so you can trim and lightly edit them here.'
                    : 'Pick a recording from the sidebar to set in/out points, preview the trim, and either save trim metadata or export the trimmed segment as a new recording.'}
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="pe-detail-head">
                  <div className="pe-detail-head-l">
                    <div className="pe-detail-title">{selected.title || 'Untitled recording'}</div>
                    <div className="pe-chips">
                      <span className="pe-chip pe-chip-dur">⏱ {formatTime(selected.duration)}</span>
                      <span className="pe-chip pe-chip-size">{formatBytes(selected.size)}</span>
                      <span className="pe-chip pe-chip-mime">{extFromMime(selected.mimeType).toUpperCase()}</span>
                      {dirty && <span className="pe-chip pe-chip-dirty">● Unsaved edits</span>}
                    </div>
                  </div>
                </div>

                {/* Video player */}
                <div className="pe-player">
                  {loadingUrl ? (
                    <div className="pe-player-loading pe-muted">Loading video…</div>
                  ) : urlError ? (
                    <div className="pe-error">{urlError}</div>
                  ) : activeUrl ? (
                    <video
                      key={selected.id}
                      ref={videoRef}
                      className="pe-video"
                      src={activeUrl}
                      crossOrigin="anonymous"
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <div className="pe-player-loading pe-muted">No video available.</div>
                  )}
                </div>

                {/* Custom playback controls */}
                <div className="pe-controls">
                  <button
                    type="button"
                    className="pe-btn pe-btn-icon pe-btn-play"
                    onClick={playPause}
                    title="Play / Pause (Space)"
                  >
                    {playing ? '❚❚' : '▶'}
                  </button>
                  <div className="pe-time-readout">
                    <span className="pe-time-current">{formatTimeDecimal(currentTime)}</span>
                    <span className="pe-time-sep">/</span>
                    <span className="pe-time-total">{formatTimeDecimal(duration)}</span>
                  </div>
                  <button
                    type="button"
                    className="pe-btn pe-btn-ghost pe-btn-sm"
                    onClick={jumpToIn}
                    title="Jump to In point (Home)"
                  >⏮ Jump to In</button>
                  <button
                    type="button"
                    className="pe-btn pe-btn-ghost pe-btn-sm"
                    onClick={jumpToOut}
                    title="Jump to Out point (End)"
                  >⏭ Jump to Out</button>
                  <label className={`pe-loop-toggle${loopTrim ? ' on' : ''}`} title="Loop the trimmed region during playback">
                    <input
                      type="checkbox"
                      checked={loopTrim}
                      onChange={e => setLoopTrim(e.target.checked)}
                    />
                    <span>🔁 Loop trim</span>
                  </label>
                  <div className="pe-vol-wrap">
                    <span className="pe-vol-icon" aria-hidden="true">🔊</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={e => setVolume(Number(e.target.value))}
                      className="pe-vol-slider"
                      title="Playback volume"
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="pe-timeline">
                  <div
                    className="pe-tl-track"
                    ref={trackRef}
                    onPointerDown={handleTrackPointerDown}
                  >
                    {/* Trim region */}
                    <div
                      className="pe-tl-region"
                      style={{
                        left: `${inPct}%`,
                        width: `${Math.max(0, outPct - inPct)}%`,
                      }}
                    />
                    {/* In handle */}
                    <div
                      className="pe-tl-handle pe-tl-handle-in"
                      style={{ left: `${inPct}%` }}
                      onPointerDown={(e) => handleHandlePointerDown(e, 'in')}
                      onPointerMove={handleHandlePointerMove}
                      onPointerUp={handleHandlePointerUp}
                      role="slider"
                      aria-label="Trim in point"
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={trimStart}
                    >
                      <div className="pe-tl-tooltip">{formatTime(trimStart)}</div>
                    </div>
                    {/* Out handle */}
                    <div
                      className="pe-tl-handle pe-tl-handle-out"
                      style={{ left: `${outPct}%` }}
                      onPointerDown={(e) => handleHandlePointerDown(e, 'out')}
                      onPointerMove={handleHandlePointerMove}
                      onPointerUp={handleHandlePointerUp}
                      role="slider"
                      aria-label="Trim out point"
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={trimEnd}
                    >
                      <div className="pe-tl-tooltip">{formatTime(trimEnd)}</div>
                    </div>
                    {/* Playhead */}
                    <div
                      className="pe-tl-playhead"
                      style={{ left: `${playheadPct}%` }}
                      aria-hidden="true"
                    >
                      <div className="pe-tl-playhead-cap"/>
                    </div>
                  </div>

                  {/* Ruler ticks */}
                  <div className="pe-tl-ruler" aria-hidden="true">
                    <span className="pe-tl-ruler-tick">0:00</span>
                    <span className="pe-tl-ruler-tick">{formatTime(duration * 0.25)}</span>
                    <span className="pe-tl-ruler-tick">{formatTime(duration * 0.5)}</span>
                    <span className="pe-tl-ruler-tick">{formatTime(duration * 0.75)}</span>
                    <span className="pe-tl-ruler-tick">{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="pe-quick">
                  <button
                    type="button"
                    className="pe-btn pe-btn-ghost"
                    onClick={setInToCurrent}
                    title="Set In point to current playback time (I)"
                  >⏮ Set In to Current</button>
                  <button
                    type="button"
                    className="pe-btn pe-btn-ghost"
                    onClick={setOutToCurrent}
                    title="Set Out point to current playback time (O)"
                  >⏭ Set Out to Current</button>
                  <button
                    type="button"
                    className="pe-btn pe-btn-ghost"
                    onClick={resetTrim}
                    title="Reset trim points to full clip"
                  >↺ Reset Trim</button>
                  <div className="pe-trim-dur" title="Length of the resulting trimmed segment">
                    <span className="pe-trim-dur-lbl pe-muted">Trim duration:</span>
                    <span className="pe-trim-dur-val">{formatTime(trimDur)}</span>
                  </div>
                </div>

                {/* Edit sections */}
                <div className="pe-form">
                  <Section title="Audio" icon="🎚" defaultOpen>
                    <div className="pe-field-row">
                      <label className="pe-toggle">
                        <input
                          type="checkbox"
                          checked={muted}
                          onChange={e => setMuted(e.target.checked)}
                        />
                        <span>Mute audio</span>
                      </label>
                    </div>
                    <div className="pe-field">
                      <label className="pe-field-lbl">
                        Audio gain
                        <span className="pe-field-readout pe-muted">{audioGain.toFixed(2)}×</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        value={audioGain}
                        onChange={e => setAudioGain(Number(e.target.value))}
                        className="pe-gain-slider"
                      />
                      <div className="pe-field-hint pe-muted">
                        Affects export volume. Real-time playback gain applies via AudioContext when supported.
                      </div>
                    </div>
                  </Section>

                  <Section title="Notes" icon="📝" defaultOpen>
                    <textarea
                      className="pe-inp pe-textarea"
                      rows={3}
                      placeholder='Edit notes — e.g. "removed coughing at 1:20", "trimmed intro pause"…'
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                    />
                  </Section>
                </div>

                {/* Export progress bar (when exporting) */}
                {exporting && (
                  <div className="pe-export-progress">
                    <div className="pe-export-progress-label">
                      Encoding trimmed segment… {Math.round(exportProgress * 100)}%
                    </div>
                    <div className="pe-export-bar">
                      <div
                        className="pe-export-bar-fill"
                        style={{ width: `${Math.round(exportProgress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action bar */}
                <div className="pe-action-bar">
                  <button
                    type="button"
                    className="pe-btn pe-btn-discard"
                    onClick={discardChanges}
                    disabled={!dirty || exporting}
                    title="Revert unsaved trim changes"
                  >🗑 Discard Changes</button>
                  <div className="pe-action-spacer"/>
                  <button
                    type="button"
                    className="pe-btn pe-btn-save"
                    onClick={saveTrim}
                    disabled={exporting}
                    title="Save trim metadata (non-destructive)"
                  >💾 Save Trim</button>
                  <button
                    type="button"
                    className="pe-btn pe-btn-export"
                    onClick={exportAsNew}
                    disabled={exporting || duration <= 0}
                    title="Re-encode the trimmed segment as a new recording"
                  >
                    {exporting ? 'Exporting…' : '📤 Export as New Recording'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
        )}
      </main>

      <Toast
        message={toast}
        kind={toastKind}
        action={toastAction}
        onAction={toastOnAction}
        onClose={() => { setToast(''); setToastAction(null); setToastOnAction(null); }}
      />
    </div>
  );
}
