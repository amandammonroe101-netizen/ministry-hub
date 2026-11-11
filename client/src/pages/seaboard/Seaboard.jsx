import { useState, useEffect, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { playNoteExpressive, playNote, VOICE_LIST, getRecordStream } from '../studio/synth';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import { addStemFromRecording } from '../../utils/stemsLibrary';
import './Seaboard.css';

/* ─────────────────────────────────────────────────────────────
   Roli Seaboard — MPE pad grid with settings sidebar.
   Layout: <NavRail /> <aside .sb-side /> <main .sb-main />
   4 rows × 12 columns = 2-octave chromatic range displayed at once.
   Drag within a pad: left/right = pitch bend, up/down = filter slide.
   Glide: keep mouse held and move across pads.
   Keys: A S D F G H J + W E T Y U = bottom octave row.
   ───────────────────────────────────────────────────────────── */

const SB_RECORDINGS_KEY = 'seaboard:saved-recordings';
const SB_STEMS_MAP_KEY  = 'seaboard:to-stems';

const SB_COLORS = [
  '#ef4444', // C   — red
  '#f97316', // C♯  — orange
  '#f59e0b', // D   — amber
  '#eab308', // D♯  — yellow
  '#84cc16', // E   — lime
  '#22c55e', // F   — green
  '#14b8a6', // F♯  — teal
  '#06b6d4', // G   — cyan
  '#3b82f6', // G♯  — blue
  '#8b5cf6', // A   — violet
  '#a855f7', // A♯  — purple
  '#ec4899', // B   — pink
];

const SB_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

// Computer keyboard → semitone offset (chromatic, maps to bottom-most octave row)
const SB_KEYMAP = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11 };

const BEND_RANGE_OPTIONS = [2, 7, 12];

const DEFAULT_SETTINGS = {
  voice: 'piano',
  octave: 4,
  volume: 0.3,
  glide: 0,                  // ms — stored-only (engine does not yet support)
  pressureSensitivity: 1,    // 0–2 multiplier on Y (slide) axis
  slideSensitivity: 1,       // 0–2 multiplier on X (pitch-bend) axis
  bendRange: 2,              // ± semitones
  aftertouch: true,          // stored-only
};

const midiLabel = (m) => SB_NAMES[((m % 12) + 12) % 12];
const midiOct   = (m) => Math.floor(m / 12) - 1;

/* ── localStorage helpers (recordings) ─────────────────────── */
const loadSavedRecordings = () => {
  try {
    const raw = localStorage.getItem(SB_RECORDINGS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

/* Stub left for backward call sites — persistence now flows through
   useUserStoreKey, so explicit calls here are no-ops. */
const persistSavedRecordings = () => {};

const fmtMSS = (secs) => {
  const s = Math.max(0, Math.floor(secs || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onloadend = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function Seaboard() {
  const { user } = useAuth();
  /* ── Settings (single source of truth) ──────────────────── */
  const [voice, setVoice]       = useState(DEFAULT_SETTINGS.voice);
  const [octave, setOctave]     = useState(DEFAULT_SETTINGS.octave);
  const [volume, setVolume]     = useState(DEFAULT_SETTINGS.volume);
  const [glide, setGlide]       = useState(DEFAULT_SETTINGS.glide);
  const [pressureSensitivity, setPressureSensitivity] = useState(DEFAULT_SETTINGS.pressureSensitivity);
  const [slideSensitivity, setSlideSensitivity]       = useState(DEFAULT_SETTINGS.slideSensitivity);
  const [bendRange, setBendRange]   = useState(DEFAULT_SETTINGS.bendRange);
  const [aftertouch, setAftertouch] = useState(DEFAULT_SETTINGS.aftertouch);

  /* ── Sidebar UI state ──────────────────────────────────── */
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [recordingsOpen, setRecordingsOpen] = useState(true);

  /* ── Saved Recordings state ────────────────────────────── */
  const [bpm, setBpm]                       = useState(100);
  const [metronomeOn, setMetronomeOn]       = useState(false);
  const [countInOn, setCountInOn]           = useState(true);
  const [recState, setRecState]             = useState('idle'); // 'idle' | 'count-in' | 'recording' | 'review'
  const [recElapsed, setRecElapsed]         = useState(0);
  const [pendingRec, setPendingRec]         = useState(null);
  const [pendingName, setPendingName]       = useState('');
  /* Firestore-backed. See Drums.jsx for the note on Storage migration. */
  const [savedRecordings, setSavedRecordings] = useUserStoreKey('seaboard:saved-recordings', []);
  const [playingId, setPlayingId]           = useState(null);
  const [armedDeleteRecId, setArmedDeleteRecId] = useState(null);

  /* ── Stems Library tracking — Firestore-backed map of recId → stemId. */
  const [savedToStems, setSavedToStems] = useUserStoreKey('seaboard:to-stems', {});
  const [armedReSaveId, setArmedReSaveId] = useState(null);
  const [stemsStatus,   setStemsStatus]   = useState(null);  // { kind, text }
  const stemsTimerRef = useRef(null);
  const reSaveTimerRef = useRef(null);

  /* (useUserStoreKey autosaves savedToStems.) */

  const showStemsStatus = (kind, text, ms = 2500) => {
    setStemsStatus({ kind, text });
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    stemsTimerRef.current = setTimeout(() => setStemsStatus(null), ms);
  };

  const handleSaveToStems = async (rec) => {
    const already = savedToStems[rec.id];
    if (already && armedReSaveId !== rec.id) {
      setArmedReSaveId(rec.id);
      if (reSaveTimerRef.current) clearTimeout(reSaveTimerRef.current);
      reSaveTimerRef.current = setTimeout(() => {
        setArmedReSaveId(curr => (curr === rec.id ? null : curr));
      }, 3000);
      return;
    }
    const result = await addStemFromRecording({
      name:         rec.name,
      audioUrl:     rec.audioUrl,
      storagePath:  rec.storagePath,
      audioDataUrl: rec.dataUrl,
      type:         'keys',
      duration:     rec.duration,
      bpm:          rec.bpm,
      source:       'Seaboard',
    });
    if (!result.ok) {
      showStemsStatus('error', result.error || 'Could not save to Stems Library.');
      return;
    }
    setSavedToStems(prev => ({ ...prev, [rec.id]: result.stem.id }));
    setArmedReSaveId(null);
    if (result.warning) {
      showStemsStatus('warn', `Saved — ${result.warning}`, 4000);
    } else {
      showStemsStatus('success', 'Saved to Stems Library');
    }
  };

  const recRef        = useRef(null);  // MediaRecorder
  const chunksRef     = useRef([]);
  const recStartRef   = useRef(0);
  const recTimerRef   = useRef(null);  // setInterval for elapsed UI
  const metroRef      = useRef(null);  // setInterval for metronome ticks
  const audioRef      = useRef(null);  // hidden <audio> for playback
  const countInTimeoutRef = useRef(null);
  const armDelTimerRef = useRef(null);

  // Live refs so the metronome interval and recording timers
  // always observe the latest values without re-creating intervals.
  const bpmRef         = useRef(bpm);         bpmRef.current         = bpm;
  const metronomeOnRef = useRef(metronomeOn); metronomeOnRef.current = metronomeOn;

  /* ── Play state ────────────────────────────────────────── */
  const [active, setActive]     = useState(() => new Set());
  const [bendInfo, setBendInfo] = useState(null);

  const heldRef       = useRef(new Map());
  const voiceRef      = useRef(voice);      voiceRef.current      = voice;
  const volRef        = useRef(volume);     volRef.current        = volume;
  const octRef        = useRef(octave);     octRef.current        = octave;
  const bendRangeRef  = useRef(bendRange);  bendRangeRef.current  = bendRange;
  const slideSensRef  = useRef(slideSensitivity); slideSensRef.current = slideSensitivity;
  const pressSensRef  = useRef(pressureSensitivity); pressSensRef.current = pressureSensitivity;
  const aftertouchRef = useRef(aftertouch); aftertouchRef.current = aftertouch;

  const syncActive = () =>
    setActive(new Set([...heldRef.current.values()].map(v => v.midi)));

  const computeExpr = (padEl, clientX, clientY) => {
    const r = padEl.getBoundingClientRect();
    const xNorm = (clientX - r.left) / r.width - 0.5;            // −0.5 … +0.5
    const yNorm = 1 - (clientY - r.top) / r.height;              // 0 (bottom) … 1 (top)
    const bend  = xNorm * bendRangeRef.current * 2 * slideSensRef.current;
    const slideRaw = Math.max(0, Math.min(1, yNorm));
    const slide = aftertouchRef.current
      ? Math.max(0, Math.min(1, slideRaw * pressSensRef.current))
      : 0;
    return { bend, slide };
  };

  const pressNote = (id, midi, padEl, clientX, clientY) => {
    if (heldRef.current.has(id)) return;
    let handle;
    try { handle = playNoteExpressive(midi, { voice: voiceRef.current, volume: volRef.current }); }
    catch { return; }
    if (padEl) {
      const { bend, slide } = computeExpr(padEl, clientX, clientY);
      try { handle.setPitchBend(bend); } catch {}
      try { handle.setSlide(slide); }   catch {}
      setBendInfo({ midi, bend, slide });
    }
    heldRef.current.set(id, { handle, midi, padEl });
    syncActive();
  };

  const updateExpr = (id, clientX, clientY) => {
    const n = heldRef.current.get(id);
    if (!n || !n.padEl) return;
    const { bend, slide } = computeExpr(n.padEl, clientX, clientY);
    try { n.handle.setPitchBend(bend); } catch {}
    try { n.handle.setSlide(slide); }   catch {}
    setBendInfo({ midi: n.midi, bend, slide });
  };

  const releaseNote = (id) => {
    const n = heldRef.current.get(id);
    if (!n) return;
    try { n.handle.release(); } catch {}
    heldRef.current.delete(id);
    syncActive();
    if (!heldRef.current.size) setBendInfo(null);
  };

  const releaseAll = () => { [...heldRef.current.keys()].forEach(id => releaseNote(id)); };

  // Global mouse tracking for continuous expression
  useEffect(() => {
    const onMove = (e) => {
      for (const id of heldRef.current.keys())
        if (id.startsWith('m')) updateExpr(id, e.clientX, e.clientY);
    };
    const onUp = () => {
      [...heldRef.current.keys()].filter(id => id.startsWith('m')).forEach(releaseNote);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      releaseAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Computer keyboard — lowest visible row, chromatic
  useEffect(() => {
    const base = () => (octRef.current + 1) * 12;
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const semi = SB_KEYMAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      e.preventDefault();
      const midi = base() + semi;
      const id   = 'k' + e.key.toLowerCase();
      if (heldRef.current.has(id)) return;
      let handle;
      try { handle = playNoteExpressive(midi, { voice: voiceRef.current, volume: volRef.current }); }
      catch { return; }
      heldRef.current.set(id, { handle, midi, padEl: null });
      syncActive();
      setBendInfo({ midi, bend: 0, slide: 0.5 });
    };
    const up = (e) => {
      const semi = SB_KEYMAP[e.key.toLowerCase()];
      if (semi !== undefined) releaseNote('k' + e.key.toLowerCase());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Metronome ─────────────────────────────────────────── */
  // Tick via the synth bus (NOT a separate AudioContext) so the click is
  // captured in recordings via getRecordStream(). Uses the 'chip' voice at
  // a high MIDI note; downbeat (every 4th tick) gets a slight pitch accent.
  const playTick = (accent = false) => {
    try {
      const handle = playNote(accent ? 96 : 91, { voice: 'chip', volume: 0.22 });
      // Short staccato — release after ~60ms
      setTimeout(() => { try { handle.release(); } catch {} }, 60);
    } catch { /* metronome is non-critical */ }
  };

  const stopMetronome = () => {
    if (metroRef.current) { clearInterval(metroRef.current); metroRef.current = null; }
  };

  const startMetronome = () => {
    stopMetronome();
    let tick = 0;
    // first beat fires immediately
    playTick(true);
    tick++;
    const intervalMs = 60000 / bpmRef.current;
    metroRef.current = setInterval(() => {
      playTick(tick % 4 === 0);
      tick++;
    }, intervalMs);
  };

  // Retune the metronome live when BPM changes mid-record.
  useEffect(() => {
    if (!metroRef.current) return;
    stopMetronome();
    let tick = 0;
    const intervalMs = 60000 / bpmRef.current;
    metroRef.current = setInterval(() => {
      playTick(tick % 4 === 0);
      tick++;
    }, intervalMs);
  }, [bpm]);

  // Start/stop the metronome live if the user toggles it mid-recording.
  useEffect(() => {
    if (recState !== 'recording') return;
    if (metronomeOn && !metroRef.current) startMetronome();
    if (!metronomeOn && metroRef.current) stopMetronome();
  }, [metronomeOn, recState]);

  /* ── Recording flow ────────────────────────────────────── */
  const beginRecorder = () => {
    let stream;
    try { stream = getRecordStream(); }
    catch { setRecState('idle'); return; }

    chunksRef.current = [];
    let mr;
    try { mr = new MediaRecorder(stream); }
    catch { setRecState('idle'); return; }

    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      const duration = (performance.now() - recStartRef.current) / 1000;
      if (!blob.size) { setRecState('idle'); return; }
      try {
        const dataUrl = await blobToDataUrl(blob);
        setPendingRec({ dataUrl, duration, bpm: bpmRef.current });
        setPendingName(`Take ${savedRecordings.length + 1}`);
        setRecState('review');
      } catch { setRecState('idle'); }
    };

    try { mr.start(); } catch { setRecState('idle'); return; }
    recRef.current = mr;
    recStartRef.current = performance.now();
    setRecElapsed(0);
    setRecState('recording');

    if (metronomeOnRef.current) startMetronome();

    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = setInterval(() => {
      setRecElapsed((performance.now() - recStartRef.current) / 1000);
    }, 200);
  };

  const startRecording = () => {
    if (recState !== 'idle') return;
    // Stop any current playback before recording.
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
    setPlayingId(null);

    if (countInOn) {
      setRecState('count-in');
      // 4-tick lead-in using the metronome ticker, accent on tick 1.
      let tick = 0;
      playTick(true);
      tick++;
      const intervalMs = 60000 / bpmRef.current;
      const id = setInterval(() => {
        if (tick >= 4) {
          clearInterval(id);
          countInTimeoutRef.current = null;
          beginRecorder();
          return;
        }
        playTick(tick % 4 === 0);
        tick++;
      }, intervalMs);
      countInTimeoutRef.current = id;
    } else {
      beginRecorder();
    }
  };

  const stopRecording = () => {
    if (countInTimeoutRef.current) {
      clearInterval(countInTimeoutRef.current);
      countInTimeoutRef.current = null;
      setRecState('idle');
      return;
    }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    stopMetronome();
    const mr = recRef.current;
    recRef.current = null;
    if (mr && mr.state !== 'inactive') {
      try { mr.stop(); } catch { setRecState('idle'); }
    } else {
      setRecState('idle');
    }
  };

  const toggleRecord = () => {
    if (recState === 'idle' || recState === 'review') {
      // If reviewing, ignore (user must save/discard first).
      if (recState === 'review') return;
      startRecording();
    } else {
      stopRecording();
    }
  };

  const saveTake = async () => {
    if (!pendingRec) return;
    if (!user?.uid) {
      console.warn('Cannot save take — not signed in.');
      return;
    }
    const name = (pendingName || '').trim() || `Take ${savedRecordings.length + 1}`;
    const id = makeId();
    try {
      const { url, path } = await uploadDataUrl(user.uid, 'seaboard-recordings', pendingRec.dataUrl, { filename: `${id}.webm` });
      const entry = {
        id,
        name,
        audioUrl:    url,
        storagePath: path,
        duration:    pendingRec.duration,
        bpm:         pendingRec.bpm,
        createdAt:   new Date().toISOString(),
      };
      setSavedRecordings(prev => [entry, ...prev]);
    } catch (err) {
      console.error('Failed to upload Seaboard take', err);
      return;
    }
    setPendingRec(null);
    setPendingName('');
    setRecState('idle');
  };

  const discardTake = () => {
    setPendingRec(null);
    setPendingName('');
    setRecState('idle');
  };

  /* ── Playback ──────────────────────────────────────────── */
  const togglePlay = (rec) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingId === rec.id) {
      try { el.pause(); } catch {}
      setPlayingId(null);
      return;
    }
    try { el.pause(); } catch {}
    /* Prefer new audioUrl (Firebase Storage) with legacy dataUrl fallback. */
    el.src = rec.audioUrl || rec.dataUrl;
    el.currentTime = 0;
    el.play().then(() => setPlayingId(rec.id)).catch(() => setPlayingId(null));
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => setPlayingId(null);
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, []);

  /* ── Armed delete (recordings) ─────────────────────────── */
  const armOrDeleteRec = (id) => {
    if (armedDeleteRecId === id) {
      const target = savedRecordings.find(r => r.id === id);
      if (target?.storagePath) deleteBlobAtPath(target.storagePath).catch(() => {});
      const next = savedRecordings.filter(r => r.id !== id);
      setSavedRecordings(next);
      setArmedDeleteRecId(null);
      // Forget any stems-library mapping for the deleted recording.
      setSavedToStems(prev => {
        if (!(id in prev)) return prev;
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
      if (armDelTimerRef.current) { clearTimeout(armDelTimerRef.current); armDelTimerRef.current = null; }
      // If the deleted recording was playing, stop it.
      if (playingId === id && audioRef.current) {
        try { audioRef.current.pause(); } catch {}
        setPlayingId(null);
      }
      return;
    }
    setArmedDeleteRecId(id);
    if (armDelTimerRef.current) clearTimeout(armDelTimerRef.current);
    armDelTimerRef.current = setTimeout(() => setArmedDeleteRecId(null), 3000);
  };

  /* ── Cleanup on unmount ────────────────────────────────── */
  useEffect(() => () => {
    if (armDelTimerRef.current) clearTimeout(armDelTimerRef.current);
    if (countInTimeoutRef.current) clearInterval(countInTimeoutRef.current);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (metroRef.current) clearInterval(metroRef.current);
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    if (reSaveTimerRef.current) clearTimeout(reSaveTimerRef.current);
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
  }, []);

  // Build 4 rows × 12 columns — rows from top (octave+3) to bottom (octave)
  const baseBottom = (octave + 1) * 12;
  const pads = [];
  for (let row = 3; row >= 0; row--) {
    for (let semi = 0; semi < 12; semi++) {
      pads.push({ midi: baseBottom + row * 12 + semi, semi, row });
    }
  }

  return (
    <WorshipShell title="Seaboard" icon="🌊" subtitle="Seaboard-style expressive instrument surface.">
    <div className="sb-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Settings sidebar ──────────────────────────────── */}
      <aside className="sb-side">
        {/* Section A: Settings */}
        <section className={`sb-side-section ${settingsOpen ? 'open' : ''}`}>
          <button
            className="sb-side-head"
            onClick={() => setSettingsOpen(o => !o)}
            type="button"
          >
            <span className="sb-side-head-title">Settings</span>
            <span className="sb-side-head-chev">{settingsOpen ? '▾' : '▸'}</span>
          </button>

          {settingsOpen && (
            <div className="sb-side-body">
              {/* Voice */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">Voice</label>
                <div className="sb-voices">
                  {VOICE_LIST.map(v => (
                    <button
                      key={v.id}
                      className={`sb-voice ${voice === v.id ? 'on' : ''}`}
                      onClick={() => setVoice(v.id)}
                      type="button"
                    >
                      <span className="sb-voice-emoji">{v.emoji}</span>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Octave */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">Octave</label>
                <div className="sb-octave">
                  <button type="button" onClick={() => setOctave(o => Math.max(0, o - 1))}>−</button>
                  <span>{octave}</span>
                  <button type="button" onClick={() => setOctave(o => Math.min(6, o + 1))}>+</button>
                </div>
              </div>

              {/* Volume */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">
                  Volume <span className="sb-side-val">{Math.round(volume * 100)}%</span>
                </label>
                <input
                  type="range" min="0.05" max="0.6" step="0.01"
                  value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                />
              </div>

              {/* Glide time */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">
                  Glide time <span className="sb-side-val">{glide} ms</span>
                </label>
                <input
                  type="range" min="0" max="500" step="5"
                  value={glide}
                  onChange={e => setGlide(parseInt(e.target.value, 10))}
                />
              </div>

              {/* Pressure sensitivity */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">
                  Pressure sens. <span className="sb-side-val">{pressureSensitivity.toFixed(2)}×</span>
                </label>
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={pressureSensitivity}
                  onChange={e => setPressureSensitivity(parseFloat(e.target.value))}
                />
              </div>

              {/* Slide sensitivity */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">
                  Slide sens. <span className="sb-side-val">{slideSensitivity.toFixed(2)}×</span>
                </label>
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={slideSensitivity}
                  onChange={e => setSlideSensitivity(parseFloat(e.target.value))}
                />
              </div>

              {/* Bend range */}
              <div className="sb-side-field">
                <label className="sb-side-lbl">Bend range</label>
                <select
                  className="sb-side-select"
                  value={bendRange}
                  onChange={e => setBendRange(parseInt(e.target.value, 10))}
                >
                  {BEND_RANGE_OPTIONS.map(n => (
                    <option key={n} value={n}>±{n} st</option>
                  ))}
                </select>
              </div>

              {/* Aftertouch toggle */}
              <div className="sb-side-field sb-side-field-row">
                <label className="sb-side-lbl sb-side-lbl-inline">Aftertouch</label>
                <button
                  type="button"
                  className={`sb-side-toggle ${aftertouch ? 'on' : ''}`}
                  onClick={() => setAftertouch(a => !a)}
                  aria-pressed={aftertouch}
                >
                  <span className="sb-side-toggle-dot" />
                  <span className="sb-side-toggle-txt">{aftertouch ? 'On' : 'Off'}</span>
                </button>
              </div>

              {/* MPE channel mode info */}
              <div className="sb-side-field sb-side-field-row">
                <label className="sb-side-lbl sb-side-lbl-inline">MPE mode</label>
                <span className="sb-side-info">Lower zone · 15 ch</span>
              </div>
            </div>
          )}
        </section>

        {/* Section B: Saved Recordings */}
        <section className={`sb-side-section ${recordingsOpen ? 'open' : ''}`}>
          <button
            className="sb-side-head"
            onClick={() => setRecordingsOpen(o => !o)}
            type="button"
          >
            <span className="sb-side-head-title">Saved Recordings</span>
            <span className="sb-side-head-count">{savedRecordings.length}</span>
            <span className="sb-side-head-chev">{recordingsOpen ? '▾' : '▸'}</span>
          </button>

          {recordingsOpen && (
            <div className="sb-side-body">
              {/* Controls bar */}
              <div className="sb-rec-controls">
                <div className="sb-rec-row">
                  <label className="sb-side-lbl sb-side-lbl-inline">BPM</label>
                  <input
                    type="number"
                    className="sb-rec-bpm"
                    min="40"
                    max="240"
                    value={bpm}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isFinite(n)) return;
                      setBpm(Math.max(40, Math.min(240, n)));
                    }}
                  />
                </div>

                <div className="sb-rec-row">
                  <label className="sb-side-lbl sb-side-lbl-inline">Metronome</label>
                  <button
                    type="button"
                    className={`sb-side-toggle ${metronomeOn ? 'on' : ''}`}
                    onClick={() => setMetronomeOn(v => !v)}
                    aria-pressed={metronomeOn}
                  >
                    <span className="sb-side-toggle-dot" />
                    <span className="sb-side-toggle-txt">{metronomeOn ? 'On' : 'Off'}</span>
                  </button>
                </div>

                <div className="sb-rec-row">
                  <label className="sb-side-lbl sb-side-lbl-inline">Count-in</label>
                  <button
                    type="button"
                    className={`sb-side-toggle ${countInOn ? 'on' : ''}`}
                    onClick={() => setCountInOn(v => !v)}
                    aria-pressed={countInOn}
                  >
                    <span className="sb-side-toggle-dot" />
                    <span className="sb-side-toggle-txt">{countInOn ? 'On' : 'Off'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`sb-rec-btn ${
                    recState === 'recording' ? 'recording' :
                    recState === 'count-in' ? 'count-in' :
                    recState === 'review'   ? 'disabled'  : ''
                  }`}
                  onClick={toggleRecord}
                  disabled={recState === 'review'}
                >
                  <span className="sb-rec-dot" />
                  <span className="sb-rec-label">
                    {recState === 'recording' && `Stop · ${fmtMSS(recElapsed)}`}
                    {recState === 'count-in'  && 'Count-in…'}
                    {recState === 'idle'      && 'Record'}
                    {recState === 'review'    && 'Save take ↓'}
                  </span>
                </button>
              </div>

              {/* Review form */}
              {recState === 'review' && pendingRec && (
                <div className="sb-rec-review">
                  <div className="sb-rec-review-head">Save this take?</div>
                  <div className="sb-rec-review-meta">
                    {fmtMSS(pendingRec.duration)} · {pendingRec.bpm} BPM
                  </div>
                  <input
                    className="sb-rec-name-input"
                    autoFocus
                    value={pendingName}
                    onChange={e => setPendingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  { e.preventDefault(); saveTake(); }
                      if (e.key === 'Escape') { e.preventDefault(); discardTake(); }
                    }}
                    placeholder="Recording name…"
                  />
                  <div className="sb-rec-review-btns">
                    <button type="button" className="sb-rec-mini-btn primary" onClick={saveTake}>Save</button>
                    <button type="button" className="sb-rec-mini-btn" onClick={discardTake}>Discard</button>
                  </div>
                </div>
              )}

              {/* Stems-library feedback toast */}
              {stemsStatus && (
                <div className={`sb-stems-toast ${stemsStatus.kind}`} role="status">
                  {stemsStatus.text}
                </div>
              )}

              {/* Recordings list */}
              {savedRecordings.length === 0 ? (
                <div className="sb-rec-empty">
                  No recordings yet — hit Record to capture a melodic loop.
                </div>
              ) : (
                <ul className="sb-rec-list">
                  {savedRecordings.map(rec => {
                    const armed       = armedDeleteRecId === rec.id;
                    const playing     = playingId === rec.id;
                    const inLibrary   = Boolean(savedToStems[rec.id]);
                    const armedReSave = armedReSaveId === rec.id;
                    return (
                      <li key={rec.id} className="sb-rec-item">
                        <button
                          type="button"
                          className={`sb-rec-play ${playing ? 'playing' : ''}`}
                          onClick={() => togglePlay(rec)}
                          title={playing ? 'Pause' : 'Play'}
                        >
                          {playing ? '❚❚' : '▶'}
                        </button>
                        <div className="sb-rec-info">
                          <span className="sb-rec-name">{rec.name}</span>
                          <span className="sb-rec-meta">
                            <span className="sb-rec-dur">{fmtMSS(rec.duration)}</span>
                            <span className="sb-rec-bpm-badge">{rec.bpm} BPM</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`sb-rec-stems-btn ${inLibrary ? 'saved' : ''} ${armedReSave ? 'armed' : ''}`}
                          onClick={() => handleSaveToStems(rec)}
                          title={
                            armedReSave   ? 'Click again to re-save (creates a duplicate)'
                              : inLibrary ? 'Already in Stems Library — click to save another copy'
                                          : 'Save to Stems Library'
                          }
                          aria-label="Save to Stems Library"
                        >
                          {inLibrary
                            ? (armedReSave ? '↻?' : '✓ In Library')
                            : '💾 Stems'}
                        </button>
                        <button
                          type="button"
                          className={`sb-rec-del ${armed ? 'armed' : ''}`}
                          onClick={() => armOrDeleteRec(rec.id)}
                          title={armed ? 'Click again to confirm delete' : 'Delete recording'}
                        >
                          {armed ? '?' : '×'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <audio ref={audioRef} style={{ display: 'none' }} />
            </div>
          )}
        </section>
      </aside>

      {/* ── Main playing surface ──────────────────────────── */}
      <main className="sb-main">
        <header className="sb-header">
          <div className="sb-title">
            <span className="sb-title-icon">🌊</span>
            <div>
              <h1 className="sb-title-text">Seaboard</h1>
              <p className="sb-title-sub">MPE expressive pad grid — bend, slide &amp; glide</p>
            </div>
          </div>

          {/* Live expression readout */}
          {bendInfo ? (
            <div className="sb-readout">
              <span className="sb-readout-note" style={{ color: SB_COLORS[bendInfo.midi % 12] }}>
                {midiLabel(bendInfo.midi)}{midiOct(bendInfo.midi)}
              </span>
              <span className="sb-readout-axis">
                <span className="sb-readout-lbl">Bend</span>
                <span className={`sb-readout-val ${Math.abs(bendInfo.bend) > 0.05 ? 'active' : ''}`}>
                  {bendInfo.bend > 0 ? '+' : ''}{bendInfo.bend.toFixed(2)} st
                </span>
              </span>
              <span className="sb-readout-axis">
                <span className="sb-readout-lbl">Slide</span>
                <span className={`sb-readout-val ${bendInfo.slide > 0.1 ? 'active' : ''}`}>
                  {Math.round(bendInfo.slide * 100)}%
                </span>
              </span>
            </div>
          ) : (
            <div className="sb-readout sb-readout-idle">Play a pad to see expression</div>
          )}
        </header>

        {/* 4 rows × 12 columns pad grid */}
        <div className="sb-grid">
          {pads.map(({ midi, semi }) => (
            <div
              key={midi}
              className={`sb-pad ${active.has(midi) ? 'on' : ''}`}
              style={{ '--pad': SB_COLORS[semi] }}
              onMouseDown={(e) => {
                e.preventDefault();
                pressNote('m' + midi, midi, e.currentTarget, e.clientX, e.clientY);
              }}
              onMouseEnter={(e) => {
                if (e.buttons !== 1) return;
                [...heldRef.current.keys()].filter(id => id.startsWith('m')).forEach(releaseNote);
                pressNote('m' + midi, midi, e.currentTarget, e.clientX, e.clientY);
              }}
            >
              <span className="sb-pad-name">{midiLabel(midi)}</span>
              <span className="sb-pad-oct">{midiOct(midi)}</span>
            </div>
          ))}
        </div>

        <div className="sb-hint">
          <b>Hold &amp; drag</b> within a pad — left/right bends pitch (±{bendRange} st) · up/down slides the filter ·
          {' '}<b>Glide</b> across pads while held ·
          {' '}Keys <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd><kbd>J</kbd>
          {' '}+ <kbd>W</kbd><kbd>E</kbd><kbd>T</kbd><kbd>Y</kbd><kbd>U</kbd> = bottom row
        </div>
      </main>
    </div>
    </WorshipShell>
  );
}
