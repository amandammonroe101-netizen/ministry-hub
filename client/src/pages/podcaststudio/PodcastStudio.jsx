import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import { uploadBlob } from '../../lib/userStorage';
import { getValue, setValue, useUserStoreKey } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../utils/formatBytes';
import './PodcastStudio.css';

/* ─────────────────────────────────────────────────────────────
   Podcast Recording Studio
   In-browser video recorder. Camera/mic via getUserMedia,
   capture via MediaRecorder, blob stored in IndexedDB.
   Metadata persisted at localStorage['podcast:recordings'].
   ───────────────────────────────────────────────────────────── */

const RECORDINGS_KEY = 'podcast:recordings';
const SETTINGS_KEY   = 'podcast:studio:settings';
const BLOG_POSTS_KEY = 'blog:posts';

const RESOLUTIONS = [
  { id: '720p',  label: '720p',  width: 1280, height: 720  },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p', width: 2560, height: 1440 },
];

const FRAMERATES = [24, 30, 60];

const MODES = [
  { id: 'camera',        label: 'Camera only' },
  { id: 'camera+screen', label: 'Camera + Screen' },
];

const pickMimeType = () => {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const t of candidates) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  return '';
};

const formatHMS = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
};

const defaultTakeName = () => {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `Take ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const loadRecordingsMeta = () => {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const persistRecordingsMeta = (list) => {
  try { localStorage.setItem(RECORDINGS_KEY, JSON.stringify(list)); } catch {}
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

const persistSettings = (s) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
};

const loadBlogPosts = () => {
  try {
    const raw = localStorage.getItem(BLOG_POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

export default function PodcastStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Device + capture settings ─────────────────────────────
  const initial = loadSettings() || {};
  const [cameras,    setCameras]    = useState([]);
  const [mics,       setMics]       = useState([]);
  const [cameraId,   setCameraId]   = useState(initial.cameraId || '');
  const [micId,      setMicId]      = useState(initial.micId    || '');
  const [resolution, setResolution] = useState(initial.resolution || '1080p');
  const [framerate,  setFramerate]  = useState(initial.framerate  || 30);
  const [mode,       setMode]       = useState(initial.mode       || 'camera');

  // ── Stream state ──────────────────────────────────────────
  const [stream,           setStream]           = useState(null);
  const [streamError,      setStreamError]      = useState(null);
  const [permissionAsked,  setPermissionAsked]  = useState(false);
  const [audioLevel,       setAudioLevel]       = useState(0);   // 0–1
  const [mrSupported,      setMrSupported]      = useState(true);

  // ── Recording state ───────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused,    setIsPaused]    = useState(false);
  const [elapsed,     setElapsed]     = useState(0);             // seconds

  // ── Pending review / save dialog ──────────────────────────
  const [pending,       setPending]       = useState(null);      // { blob, duration, mimeType, w, h }
  const [pendingTitle,  setPendingTitle]  = useState('');
  const [pendingTags,   setPendingTags]   = useState([]);
  const [tagDraft,      setTagDraft]      = useState('');
  const [pendingNotes,  setPendingNotes]  = useState('');
  const [pendingEp,     setPendingEp]     = useState(null);      // { postId, title }
  const [epQuery,       setEpQuery]       = useState('');
  /* Blog posts live in Firestore (migrated earlier) — fetched live so the
     "Link to episode" picker always has the latest set, including posts
     written on other devices. */
  const [blogPosts]                       = useUserStoreKey('blog:posts', []);

  // ── Storage indicator ─────────────────────────────────────
  /* `storage` state removed — was tracking browser IndexedDB usage. */
  const [savingState,  setSavingState]  = useState('idle');      // 'idle' | 'saving' | 'error'
  const [saveError,    setSaveError]    = useState(null);
  const [toast,        setToast]        = useState(null);        // { kind, text }

  // ── Refs ──────────────────────────────────────────────────
  const videoRef     = useRef(null);
  const streamRef    = useRef(null);
  const mrRef        = useRef(null);
  const chunksRef    = useRef([]);
  const recStartRef  = useRef(0);
  const recTimerRef  = useRef(null);
  const audioCtxRef  = useRef(null);
  const analyserRef  = useRef(null);
  const meterRafRef  = useRef(null);
  const toastTimerRef = useRef(null);

  // Persist settings on change
  useEffect(() => {
    persistSettings({ cameraId, micId, resolution, framerate, mode });
  }, [cameraId, micId, resolution, framerate, mode]);

  /* Blog posts auto-load via useUserStoreKey above — no explicit fetch needed. */

  /* (Storage estimate removed — recordings now live in Firebase Storage,
     not browser IndexedDB. The free 5 GiB cloud quota replaces the
     local-disk usage indicator that used to live here.) */

  // Check MediaRecorder support on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.MediaRecorder) { setMrSupported(false); return; }
    const m = pickMimeType();
    if (!m) setMrSupported(false);
  }, []);

  // ── Device enumeration ────────────────────────────────────
  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      const ms   = devices.filter(d => d.kind === 'audioinput');
      setCameras(cams);
      setMics(ms);
      setCameraId(curr => curr || cams[0]?.deviceId || '');
      setMicId(curr   => curr || ms[0]?.deviceId   || '');
    } catch (err) {
      console.warn('enumerateDevices failed', err);
    }
  }, []);

  useEffect(() => {
    enumerate();
    const onChange = () => enumerate();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onChange);
    }
    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onChange);
      }
    };
  }, [enumerate]);

  // ── Audio meter setup ─────────────────────────────────────
  const teardownMeter = useCallback(() => {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const setupMeter = useCallback((mediaStream) => {
    teardownMeter();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        // Peak deviation from 128 → 0–1
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setAudioLevel(peak);
        meterRafRef.current = requestAnimationFrame(tick);
      };
      meterRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('Audio meter setup failed', err);
    }
  }, [teardownMeter]);

  // ── Stream lifecycle ──────────────────────────────────────
  const teardownStream = useCallback(() => {
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
    teardownMeter();
  }, [teardownMeter]);

  const acquireStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError({ kind: 'unsupported', message: 'Camera capture not supported in this browser.' });
      return;
    }
    setStreamError(null);
    setPermissionAsked(true);

    // Tear down previous stream first
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;
    }

    const res = RESOLUTIONS.find(r => r.id === resolution) || RESOLUTIONS[1];
    const videoConstraints = {
      width:     { ideal: res.width  },
      height:    { ideal: res.height },
      frameRate: { ideal: framerate  },
    };
    if (cameraId) videoConstraints.deviceId = { exact: cameraId };

    const audioConstraints = {};
    if (micId) audioConstraints.deviceId = { exact: micId };

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: Object.keys(audioConstraints).length ? audioConstraints : true,
      });
      streamRef.current = s;
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      setupMeter(s);
      // After grant, labels become available — re-enumerate
      enumerate();
    } catch (err) {
      console.error('getUserMedia failed', err);
      const kind = (err && err.name === 'NotAllowedError') ? 'permission'
                 : (err && err.name === 'NotFoundError')   ? 'nodevice'
                 : 'generic';
      setStreamError({ kind, message: err?.message || 'Could not access camera or microphone.' });
    }
  }, [cameraId, micId, resolution, framerate, setupMeter, enumerate]);

  // Re-acquire when device or constraints change (only if already started once)
  useEffect(() => {
    if (!permissionAsked) return;
    if (isRecording) return;            // don't tear down mid-record
    acquireStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, micId, resolution, framerate]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    try {
      if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
    } catch {}
    teardownStream();
  }, [teardownStream]);

  // ── Recording lifecycle ───────────────────────────────────
  const startRecording = () => {
    if (!streamRef.current) return;
    if (!mrSupported) return;
    const mimeType = pickMimeType();
    let mr;
    try {
      mr = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
    } catch (err) {
      console.error('MediaRecorder construct failed', err);
      setStreamError({ kind: 'generic', message: 'Could not start recorder: ' + (err?.message || 'unknown') });
      return;
    }
    chunksRef.current = [];
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onstop = () => {
      const type = mr.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const duration = (Date.now() - recStartRef.current) / 1000;
      const v = videoRef.current;
      const w = v?.videoWidth  || 0;
      const h = v?.videoHeight || 0;
      setPending({ blob, duration, mimeType: type, w, h });
      setPendingTitle(defaultTakeName());
      setPendingTags([]);
      setTagDraft('');
      setPendingNotes('');
      setPendingEp(null);
      setEpQuery('');
    };
    mrRef.current = mr;
    try { mr.start(1000); } catch { try { mr.start(); } catch {} }
    recStartRef.current = Date.now();
    setElapsed(0);
    setIsRecording(true);
    setIsPaused(false);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = setInterval(() => {
      setElapsed((Date.now() - recStartRef.current) / 1000);
    }, 250);
  };

  const stopRecording = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    try {
      if (mrRef.current && mrRef.current.state !== 'inactive') {
        mrRef.current.stop();
      }
    } catch {}
    setIsRecording(false);
    setIsPaused(false);
  };

  const togglePause = () => {
    const mr = mrRef.current;
    if (!mr) return;
    try {
      if (mr.state === 'recording') {
        mr.pause();
        setIsPaused(true);
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
      } else if (mr.state === 'paused') {
        mr.resume();
        setIsPaused(false);
        // Shift recStartRef so elapsed stays continuous
        recStartRef.current = Date.now() - elapsed * 1000;
        recTimerRef.current = setInterval(() => {
          setElapsed((Date.now() - recStartRef.current) / 1000);
        }, 250);
      }
    } catch {}
  };

  // ── Save / discard ────────────────────────────────────────
  const showToast = (kind, text, ms = 3500) => {
    setToast({ kind, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (pendingTags.includes(t)) { setTagDraft(''); return; }
    setPendingTags(prev => [...prev, t]);
    setTagDraft('');
  };

  const removeTag = (t) => setPendingTags(prev => prev.filter(x => x !== t));

  const savePending = async () => {
    if (!pending) return;
    if (!user?.uid) {
      setSaveError('You must be signed in to save recordings.');
      setSavingState('error');
      showToast('error', 'Sign in required.', 5000);
      return;
    }
    setSavingState('saving');
    setSaveError(null);
    const id = 'rec-' + Date.now();
    const cam = cameras.find(c => c.deviceId === cameraId);
    const mic = mics.find(m => m.deviceId === micId);
    /* Best-effort file extension from the recorded MIME so the Storage
       blob has a useful filename. */
    const ext = /webm/i.test(pending.mimeType) ? '.webm'
              : /mp4/i.test(pending.mimeType)  ? '.mp4'
              : '';
    const filename = `${id}${ext}`;
    try {
      /* Upload the recorded blob to Firebase Storage. */
      const { url, path, size, contentType } = await uploadBlob(
        user.uid,
        'recordings',
        pending.blob,
        { filename, contentType: pending.mimeType }
      );
      const meta = {
        id,
        title:        pendingTitle.trim() || defaultTakeName(),
        duration:     pending.duration,
        size:         size || pending.blob.size,
        mimeType:     contentType || pending.mimeType,
        videoUrl:     url,
        storagePath:  path,
        videoWidth:   pending.w,
        videoHeight:  pending.h,
        framerate,
        cameraLabel:  cam?.label || '',
        micLabel:     mic?.label || '',
        tags:         pendingTags,
        notes:        pendingNotes,
        episodeLink:  pendingEp,
        createdAt:    new Date().toISOString(),
      };
      /* Prepend to the per-user recordings doc in Firestore. */
      const existing = (await getValue(user.uid, 'podcast:recordings')) || [];
      const all = Array.isArray(existing) ? existing : [];
      await setValue(user.uid, 'podcast:recordings', [meta, ...all]);

      setPending(null);
      setPendingTitle('');
      setPendingTags([]);
      setPendingNotes('');
      setPendingEp(null);
      setElapsed(0);
      setSavingState('idle');
      showToast('success', 'Saved to cloud. View in Recordings.');
    } catch (err) {
      console.error('Upload failed', err);
      let msg;
      if (err?.code === 'storage/unauthorized') {
        msg = 'Upload blocked. Make sure docs/storage.rules is published in Firebase Console.';
      } else if (/size/i.test(err?.message || '')) {
        msg = 'Recording too large — max 50 MiB per file. Record shorter clips or bump the limit in storage.rules.';
      } else {
        msg = 'Could not save: ' + (err?.message || 'unknown error');
      }
      setSaveError(msg);
      setSavingState('error');
      showToast('error', msg, 5000);
    }
  };

  const discardPending = () => {
    setPending(null);
    setPendingTitle('');
    setPendingTags([]);
    setPendingNotes('');
    setPendingEp(null);
    setElapsed(0);
    setSavingState('idle');
    setSaveError(null);
  };

  // ── Episode link autocomplete ─────────────────────────────
  const epMatches = (() => {
    const q = epQuery.trim().toLowerCase();
    if (!q) return [];
    return blogPosts
      .filter(p => (p.title || '').toLowerCase().includes(q))
      .slice(0, 5);
  })();

  // ── Derived ───────────────────────────────────────────────
  const meterPct      = Math.min(1, audioLevel * 1.6);
  const meterColor    = meterPct > 0.85 ? '#ef4444'
                       : meterPct > 0.6 ? '#f59e0b'
                       : '#22c55e';
  /* storagePct removed alongside the IDB storage estimate. */
  const showPrompt    = !permissionAsked && !stream && !streamError;
  const hasStream     = !!stream;

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="ps-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>
      <NavRail />

      <main className="ps-main">
        {/* ─── Top bar ─────────────────────────────── */}
        <header className="ps-topbar">
          <div className="ps-title">
            <span className="ps-title-icon">🎥</span>
            <div>
              <h1 className="ps-title-text">Recording Studio</h1>
              <p className="ps-title-sub">Capture podcast episodes through your browser</p>
            </div>
          </div>

          <div className="ps-topbar-right">
            <div className="ps-storage">
              <div className="ps-storage-text">☁ Cloud Storage</div>
            </div>
            <button
              type="button"
              className="ps-link-btn"
              onClick={() => navigate('/podcast-recordings')}
              title="View recorded takes"
            >
              Recordings
            </button>
          </div>
        </header>

        {/* ─── Preview area ────────────────────────── */}
        <section className="ps-preview-wrap">
          <div className="ps-preview">
            <video
              ref={videoRef}
              className="ps-video"
              autoPlay
              muted
              playsInline
            />

            {/* Placeholder / permission prompt */}
            {!hasStream && !streamError && (
              <div className="ps-overlay-center">
                {showPrompt ? (
                  <>
                    <div className="ps-overlay-icon">📷</div>
                    <div className="ps-overlay-title">Camera off</div>
                    <div className="ps-overlay-sub">Click "Start Camera" below to grant permission.</div>
                  </>
                ) : (
                  <>
                    <div className="ps-overlay-icon">⏳</div>
                    <div className="ps-overlay-title">Connecting…</div>
                  </>
                )}
              </div>
            )}

            {/* Error state */}
            {streamError && (
              <div className="ps-overlay-center ps-overlay-error">
                <div className="ps-overlay-icon">⚠</div>
                <div className="ps-overlay-title">
                  {streamError.kind === 'permission' ? 'Permission denied'
                    : streamError.kind === 'nodevice' ? 'No camera/mic found'
                    : streamError.kind === 'unsupported' ? 'Not supported'
                    : 'Camera error'}
                </div>
                <div className="ps-overlay-sub">{streamError.message}</div>
                <button
                  type="button"
                  className="ps-btn ps-btn-primary"
                  onClick={acquireStream}
                >
                  Try Again
                </button>
              </div>
            )}

            {/* MediaRecorder unsupported */}
            {!mrSupported && (
              <div className="ps-banner ps-banner-warn">
                Browser doesn't support video recording. Try Chrome or Edge.
              </div>
            )}

            {/* Recording overlays */}
            {isRecording && (
              <>
                <div className="ps-rec-dot" aria-label="Recording indicator">
                  <span className="ps-rec-dot-inner" />
                  REC
                </div>
                <div className="ps-timecode">{formatHMS(elapsed)}</div>
              </>
            )}
            {isRecording && isPaused && (
              <div className="ps-paused-badge">PAUSED</div>
            )}
          </div>

          {/* Audio meter */}
          <div className="ps-meter">
            <span className="ps-meter-label">Mic</span>
            <div className="ps-meter-bar">
              <span
                className="ps-meter-fill"
                style={{ width: `${meterPct * 100}%`, background: meterColor }}
              />
            </div>
            <span className="ps-meter-val">
              {hasStream ? Math.round(meterPct * 100) + '%' : '–'}
            </span>
          </div>
        </section>

        {/* ─── Controls strip ──────────────────────── */}
        <section className="ps-controls">
          <div className="ps-controls-grid">
            <div className="ps-field">
              <label className="ps-field-lbl">Camera</label>
              <select
                className="ps-select"
                value={cameraId}
                onChange={e => setCameraId(e.target.value)}
                disabled={isRecording}
              >
                {cameras.length === 0 && <option value="">No cameras detected</option>}
                {cameras.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="ps-field">
              <label className="ps-field-lbl">Microphone</label>
              <select
                className="ps-select"
                value={micId}
                onChange={e => setMicId(e.target.value)}
                disabled={isRecording}
              >
                {mics.length === 0 && <option value="">No microphones detected</option>}
                {mics.map((m, i) => (
                  <option key={m.deviceId || i} value={m.deviceId}>
                    {m.label || `Mic ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="ps-field">
              <label className="ps-field-lbl">Resolution</label>
              <div className="ps-btn-row">
                {RESOLUTIONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={`ps-pill ${resolution === r.id ? 'active' : ''}`}
                    onClick={() => setResolution(r.id)}
                    disabled={isRecording}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ps-field">
              <label className="ps-field-lbl">Framerate</label>
              <div className="ps-btn-row">
                {FRAMERATES.map(f => (
                  <button
                    key={f}
                    type="button"
                    className={`ps-pill ${framerate === f ? 'active' : ''}`}
                    onClick={() => setFramerate(f)}
                    disabled={isRecording}
                  >
                    {f}fps
                  </button>
                ))}
              </div>
            </div>

            <div className="ps-field">
              <label className="ps-field-lbl">Mode</label>
              <select
                className="ps-select"
                value={mode}
                onChange={e => setMode(e.target.value)}
                disabled={isRecording}
              >
                {MODES.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {mode === 'camera+screen' && (
                <div className="ps-field-hint">Screen capture coming soon — recording uses camera only.</div>
              )}
            </div>
          </div>

          {/* Record button row */}
          <div className="ps-record-row">
            {!hasStream && !streamError && (
              <button
                type="button"
                className="ps-btn ps-btn-primary ps-btn-lg"
                onClick={acquireStream}
              >
                Start Camera
              </button>
            )}

            {hasStream && !isRecording && !pending && (
              <button
                type="button"
                className="ps-record-btn"
                onClick={startRecording}
                disabled={!mrSupported}
                title="Start recording"
                aria-label="Start recording"
              >
                <span className="ps-record-btn-inner" />
              </button>
            )}

            {isRecording && (
              <>
                <button
                  type="button"
                  className="ps-record-btn recording"
                  onClick={stopRecording}
                  title="Stop recording"
                  aria-label="Stop recording"
                >
                  <span className="ps-record-btn-inner stop" />
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn-ghost"
                  onClick={togglePause}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <div className="ps-record-elapsed">{formatHMS(elapsed)}</div>
              </>
            )}
          </div>
        </section>

        {/* ─── Save dialog ─────────────────────────── */}
        {pending && (
          <section className="ps-save-dialog">
            <div className="ps-save-head">
              <h2 className="ps-save-title">Save take</h2>
              <div className="ps-save-meta">
                {formatHMS(pending.duration)} · {formatBytes(pending.blob.size)}
                {pending.w > 0 && ` · ${pending.w}×${pending.h}`}
              </div>
            </div>

            <div className="ps-save-grid">
              <div className="ps-field">
                <label className="ps-field-lbl">Title</label>
                <input
                  className="ps-input"
                  value={pendingTitle}
                  onChange={e => setPendingTitle(e.target.value)}
                  placeholder="Episode title…"
                  autoFocus
                />
              </div>

              <div className="ps-field">
                <label className="ps-field-lbl">Tags</label>
                <div className="ps-tag-input">
                  {pendingTags.map(t => (
                    <span key={t} className="ps-chip">
                      {t}
                      <button
                        type="button"
                        className="ps-chip-x"
                        onClick={() => removeTag(t)}
                        aria-label={`Remove tag ${t}`}
                      >×</button>
                    </span>
                  ))}
                  <input
                    className="ps-tag-field"
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Backspace' && !tagDraft && pendingTags.length) {
                        setPendingTags(prev => prev.slice(0, -1));
                      }
                    }}
                    placeholder={pendingTags.length ? '' : 'Add a tag…'}
                  />
                </div>
              </div>

              <div className="ps-field ps-field-wide">
                <label className="ps-field-lbl">Notes</label>
                <textarea
                  className="ps-textarea"
                  rows={2}
                  value={pendingNotes}
                  onChange={e => setPendingNotes(e.target.value)}
                  placeholder="Optional notes about this take…"
                />
              </div>

              <div className="ps-field ps-field-wide">
                <label className="ps-field-lbl">Link to blog post (optional)</label>
                {pendingEp ? (
                  <div className="ps-ep-chip">
                    <span>{pendingEp.title}</span>
                    <button
                      type="button"
                      className="ps-chip-x"
                      onClick={() => { setPendingEp(null); setEpQuery(''); }}
                    >×</button>
                  </div>
                ) : (
                  <>
                    <input
                      className="ps-input"
                      value={epQuery}
                      onChange={e => setEpQuery(e.target.value)}
                      placeholder={blogPosts.length ? 'Search posts…' : 'No blog posts found'}
                      disabled={blogPosts.length === 0}
                    />
                    {epMatches.length > 0 && (
                      <ul className="ps-ep-list">
                        {epMatches.map(p => (
                          <li key={p.id || p.postId || p.title}>
                            <button
                              type="button"
                              className="ps-ep-item"
                              onClick={() => {
                                setPendingEp({ postId: p.id || p.postId, title: p.title });
                                setEpQuery('');
                              }}
                            >
                              {p.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>

            {saveError && <div className="ps-save-error">{saveError}</div>}

            <div className="ps-save-actions">
              <button
                type="button"
                className="ps-btn ps-btn-ghost"
                onClick={discardPending}
                disabled={savingState === 'saving'}
              >
                Discard
              </button>
              <button
                type="button"
                className="ps-btn ps-btn-primary"
                onClick={savePending}
                disabled={savingState === 'saving'}
              >
                {savingState === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        )}

        {/* ─── Toast ───────────────────────────────── */}
        {toast && (
          <div className={`ps-toast ps-toast-${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </main>
    </div>
  );
}
