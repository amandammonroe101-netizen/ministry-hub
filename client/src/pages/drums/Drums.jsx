import { useState, useEffect, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { playNote, applyReverb, getRecordStream } from '../studio/synth';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import { addStemFromRecording } from '../../utils/stemsLibrary';
import './Drums.css';

/* ─────────────────────────────────────────────────────────────
   16-pad drum kit — keyboard + mouse/touch playable.
   Keys: 1 2 3 4 / Q W E R / A S D F / Z X C V
   ───────────────────────────────────────────────────────────── */
const DRUM_PADS = [
  { label: 'Kick',    voice: 'bass',  midi: 36, color: '#ef4444', key: '1' },
  { label: 'Snare',   voice: 'chip',  midi: 50, color: '#f97316', key: '2' },
  { label: 'Hat C',   voice: 'chip',  midi: 80, color: '#eab308', key: '3' },
  { label: 'Hat O',   voice: 'chip',  midi: 86, color: '#84cc16', key: '4' },
  { label: 'Tom Lo',  voice: 'bass',  midi: 43, color: '#22c55e', key: 'q' },
  { label: 'Tom Mid', voice: 'bass',  midi: 48, color: '#14b8a6', key: 'w' },
  { label: 'Tom Hi',  voice: 'pluck', midi: 55, color: '#06b6d4', key: 'e' },
  { label: 'Clap',    voice: 'chip',  midi: 64, color: '#3b82f6', key: 'r' },
  { label: 'Rim',     voice: 'pluck', midi: 72, color: '#6366f1', key: 'a' },
  { label: 'Cowbell', voice: 'pluck', midi: 68, color: '#8b5cf6', key: 's' },
  { label: 'Crash',   voice: 'bells', midi: 78, color: '#a855f7', key: 'd' },
  { label: 'Ride',    voice: 'bells', midi: 84, color: '#d946ef', key: 'f' },
  { label: 'Perc 1',  voice: 'pluck', midi: 60, color: '#ec4899', key: 'z' },
  { label: 'Perc 2',  voice: 'pluck', midi: 65, color: '#f43f5e', key: 'x' },
  { label: 'Stab',    voice: 'bass',  midi: 52, color: '#fb7185', key: 'c' },
  { label: 'Zap',     voice: 'chip',  midi: 92, color: '#fda4af', key: 'v' },
];

/* Pad kit presets — for now they remap the underlying voice flavour.
   Each entry: voice substitutions to apply to the default pads.
   The synth doesn't have real drum samples, so this swaps the synth
   voices used to render each pad — gives a felt difference per kit. */
const PAD_KITS = [
  { id: 'acoustic',   label: 'Acoustic',   subs: { bass: 'bass',  chip: 'pluck',    pluck: 'pluck',  bells: 'bells'    } },
  { id: 'electronic', label: 'Electronic', subs: { bass: 'bass',  chip: 'chip',     pluck: 'chip',   bells: 'chip'     } },
  { id: '808',        label: '808',        subs: { bass: 'bass',  chip: 'bass',     pluck: 'bass',   bells: 'pluck'    } },
  { id: 'classic',    label: 'Classic',    subs: { bass: 'bass',  chip: 'chip',     pluck: 'pluck',  bells: 'bells'    } },
];

const RECORDINGS_KEY = 'drums:saved-recordings';
const STEMS_MAP_KEY  = 'drums:to-stems';

const DEFAULT_SETTINGS = {
  volume:      0.5,
  kit:         'classic',
  reverb:      0,     // 0–100 (%)
  pitch:       0,     // -12 to +12 semitones
  sensitivity: 1.0,   // multiplier on volume
};

const loadSavedRecordings = () => {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistSavedRecordings = (recs) => {
  try {
    localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recs));
  } catch {}
};

const formatMMSS = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/* Generate a short metronome tick using Web Audio directly.
   - Downbeat (accent) is louder + slightly higher pitch.
   - Routed through the synth's record stream so the click is
     captured in the MediaRecorder output. */
const playTick = (accent = false) => {
  try {
    // We piggy-back on the synth's audio context by requesting the stream first,
    // which ensures the context (and stream destination) are alive.
    getRecordStream();
    // The synth keeps its context module-private, so build our own short tick
    // using a fresh AudioContext access via window — but to ensure the tick
    // is captured into the record stream we must use the SAME context as the
    // synth. The cleanest cross-cut is to use playNote with a chip voice.
  } catch {}
  // Use the synth's own playNote to render the click — guarantees the
  // tick goes through the same master bus (and thus the record stream).
  try {
    const midi = accent ? 96 : 91;          // high chip pitch
    const vol  = accent ? 0.55 : 0.35;
    const h = playNote(midi, { voice: 'chip', volume: vol });
    setTimeout(() => { try { h.release(); } catch {} }, 40);
  } catch {}
};

export default function Drums() {
  const { user } = useAuth();
  const [hit, setHit] = useState(() => new Set());

  // ── Drum settings (live) ──────────────────────────────────
  const [volume,      setVolume]      = useState(DEFAULT_SETTINGS.volume);
  const [kit,         setKit]         = useState(DEFAULT_SETTINGS.kit);
  const [reverb,      setReverb]      = useState(DEFAULT_SETTINGS.reverb);
  const [pitch,       setPitch]       = useState(DEFAULT_SETTINGS.pitch);
  const [sensitivity, setSensitivity] = useState(DEFAULT_SETTINGS.sensitivity);

  // Refs so the keydown handler always reads the latest values
  const settingsRef = useRef({ volume, kit, reverb, pitch, sensitivity });
  settingsRef.current = { volume, kit, reverb, pitch, sensitivity };

  // ── Collapsible panel state ───────────────────────────────
  const [settingsOpen,   setSettingsOpen]   = useState(true);
  const [recordingsOpen, setRecordingsOpen] = useState(true);

  // ── Saved recordings ──────────────────────────────────────
  const [bpm,             setBpm]             = useState(100);
  const [metronomeOn,     setMetronomeOn]     = useState(false);
  const [countInOn,       setCountInOn]       = useState(true);
  const [recState,        setRecState]        = useState('idle'); // 'idle' | 'count-in' | 'recording' | 'review'
  const [recElapsed,      setRecElapsed]      = useState(0);
  const [pendingRec,      setPendingRec]      = useState(null);   // { dataUrl, duration, bpm }
  const [pendingName,     setPendingName]     = useState('');
  /* Firestore-backed. NOTE: recordings are base64 audio in the doc — many
     long takes will hit the 1 MiB Firestore doc cap. Same Storage-migration
     pattern as Stems Library applies when that day comes. */
  const [savedRecordings, setSavedRecordings] = useUserStoreKey('drums:saved-recordings', []);
  const [playingId,       setPlayingId]       = useState(null);
  const [armedDeleteRecId, setArmedDeleteRecId] = useState(null);

  // ── Stems Library tracking — Firestore-backed map of recId → stemId.
  const [savedToStems, setSavedToStems] = useUserStoreKey('drums:to-stems', {});
  const [armedReSaveId, setArmedReSaveId] = useState(null);
  const [stemsStatus,   setStemsStatus]   = useState(null);  // { kind: 'success'|'error'|'warn', text }
  const stemsTimerRef = useRef(null);
  const reSaveTimerRef = useRef(null);

  // Refs for recorder + metronome
  const recRef       = useRef(null);   // MediaRecorder
  const chunksRef    = useRef([]);     // collected Blob parts
  const recStartRef  = useRef(0);      // timestamp when recording actually began
  const recTimerRef  = useRef(null);   // setInterval id for elapsed updater
  const metroRef     = useRef(null);   // setInterval id for metronome ticks
  const countInRef   = useRef(null);   // setTimeout id during count-in
  const audioRef     = useRef(null);   // <audio> element for playback
  const bpmRef       = useRef(bpm);
  const metroOnRef   = useRef(metronomeOn);
  useEffect(() => { bpmRef.current     = bpm;         }, [bpm]);
  useEffect(() => { metroOnRef.current = metronomeOn; }, [metronomeOn]);

  /* (Both lists autosync via useUserStoreKey.) */

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
    /* Pass through audioUrl + storagePath (new format) with a legacy
       fallback to audioDataUrl for any pre-migration recordings. */
    const result = await addStemFromRecording({
      name:         rec.name,
      audioUrl:     rec.audioUrl,
      storagePath:  rec.storagePath,
      audioDataUrl: rec.dataUrl,
      type:         'drums',
      duration:     rec.duration,
      bpm:          rec.bpm,
      source:       'Drums',
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

  // Push reverb to the synth bus whenever it changes
  useEffect(() => {
    try { applyReverb(reverb / 100); } catch {}
  }, [reverb]);

  // If BPM changes mid-recording while metronome is on, restart the interval at new rate
  useEffect(() => {
    if (recState !== 'recording') return;
    if (!metroOnRef.current) return;
    if (metroRef.current) {
      clearInterval(metroRef.current);
      metroRef.current = null;
    }
    startMetronomeInterval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm]);

  // When metronome is toggled while recording
  useEffect(() => {
    if (recState !== 'recording') return;
    if (metronomeOn) {
      if (!metroRef.current) startMetronomeInterval();
    } else {
      if (metroRef.current) { clearInterval(metroRef.current); metroRef.current = null; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronomeOn]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (metroRef.current)   clearInterval(metroRef.current);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (countInRef.current)  clearTimeout(countInRef.current);
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    if (reSaveTimerRef.current) clearTimeout(reSaveTimerRef.current);
    try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch {}
  }, []);

  const flash = (i) => {
    setHit(s => { const n = new Set(s); n.add(i); return n; });
    setTimeout(() => setHit(s => { const n = new Set(s); n.delete(i); return n; }), 130);
  };

  const strike = (i) => {
    const pad = DRUM_PADS[i];
    if (!pad) return;
    const s = settingsRef.current;
    const kitDef = PAD_KITS.find(k => k.id === s.kit) || PAD_KITS[0];
    const voice  = (kitDef.subs && kitDef.subs[pad.voice]) || pad.voice;
    const midi   = pad.midi + (s.pitch | 0);
    const vol    = Math.max(0, Math.min(1, s.volume * s.sensitivity));
    try {
      const h = playNote(midi, { voice, volume: vol });
      setTimeout(() => { try { h.release(); } catch {} }, 130);
    } catch {}
    flash(i);
  };

  useEffect(() => {
    const keyIndex = {};
    DRUM_PADS.forEach((p, i) => { keyIndex[p.key] = i; });
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const i = keyIndex[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      strike(i);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Metronome ─────────────────────────────────────────── */
  const startMetronomeInterval = () => {
    let beat = 0;
    const tick = () => {
      playTick(beat % 4 === 0);
      beat++;
    };
    tick(); // immediate tick on start
    const periodMs = 60000 / Math.max(40, Math.min(240, bpmRef.current));
    metroRef.current = setInterval(tick, periodMs);
  };

  /* ── Recording flow ────────────────────────────────────── */
  const beginActualRecording = () => {
    try {
      const stream = getRecordStream();
      // Pick a supported mime type (Safari may not support webm)
      let mimeType = '';
      if (window.MediaRecorder) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm'))        mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4'))         mimeType = 'audio/mp4';
      }
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const durationSec = (Date.now() - recStartRef.current) / 1000;
        const reader = new FileReader();
        reader.onload = () => {
          setPendingRec({
            dataUrl:  reader.result,
            duration: durationSec,
            bpm:      bpmRef.current,
          });
          setPendingName(`Beat ${savedRecordings.length + 1}`);
          setRecState('review');
        };
        reader.readAsDataURL(blob);
      };
      recRef.current = mr;
      mr.start();
      recStartRef.current = Date.now();
      setRecElapsed(0);
      recTimerRef.current = setInterval(() => {
        setRecElapsed((Date.now() - recStartRef.current) / 1000);
      }, 200);
      setRecState('recording');
      if (metroOnRef.current) startMetronomeInterval();
    } catch (err) {
      console.error('Recording start failed', err);
      setRecState('idle');
    }
  };

  const startRecording = () => {
    if (recState !== 'idle') return;
    if (countInOn) {
      setRecState('count-in');
      const periodMs = 60000 / Math.max(40, Math.min(240, bpmRef.current));
      // Play 4 count-in ticks; the 4th coincides with start of recording.
      // tick #1 immediately, then schedule #2, #3, and then start recording
      // at the 4th tick boundary.
      playTick(true);
      let n = 1;
      const next = () => {
        n++;
        if (n < 4) {
          playTick(false);
          countInRef.current = setTimeout(next, periodMs);
        } else {
          // 4th tick fires together with the recording start
          playTick(true);
          beginActualRecording();
        }
      };
      countInRef.current = setTimeout(next, periodMs);
    } else {
      beginActualRecording();
    }
  };

  const stopRecording = () => {
    if (countInRef.current) { clearTimeout(countInRef.current); countInRef.current = null; }
    if (metroRef.current)   { clearInterval(metroRef.current);  metroRef.current   = null; }
    if (recTimerRef.current){ clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (recState === 'count-in') {
      setRecState('idle');
      setRecElapsed(0);
      return;
    }
    try {
      if (recRef.current && recRef.current.state === 'recording') {
        recRef.current.stop();
      }
    } catch {}
    // recState will move to 'review' inside MediaRecorder.onstop
  };

  const saveRecording = async () => {
    if (!pendingRec) return;
    if (!user?.uid) {
      console.warn('Cannot save recording — not signed in.');
      return;
    }
    const name = pendingName.trim() || `Beat ${savedRecordings.length + 1}`;
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      /* Upload audio blob to Firebase Storage; Firestore doc just gets
         the URL + storage path (tiny). */
      const { url, path } = await uploadDataUrl(user.uid, 'drum-recordings', pendingRec.dataUrl, { filename: `${id}.webm` });
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
      console.error('Failed to upload drum recording', err);
      return;
    }
    setPendingRec(null);
    setPendingName('');
    setRecElapsed(0);
    setRecState('idle');
  };

  const discardRecording = () => {
    setPendingRec(null);
    setPendingName('');
    setRecElapsed(0);
    setRecState('idle');
  };

  const togglePlayRecording = (rec) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === rec.id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    /* Recordings now live in Firebase Storage. Use `audioUrl` (new field)
       and fall back to `dataUrl` for any legacy records pre-migration. */
    a.src = rec.audioUrl || rec.dataUrl;
    a.play().then(() => {
      setPlayingId(rec.id);
    }).catch(err => {
      console.error('Playback failed', err);
      setPlayingId(null);
    });
  };

  const deleteRecording = (id) => {
    if (armedDeleteRecId === id) {
      // If the deleted recording was playing, stop playback.
      if (playingId === id) {
        try { audioRef.current?.pause(); } catch {}
        setPlayingId(null);
      }
      /* Clean up the Storage blob too — fire-and-forget. */
      const target = savedRecordings.find(r => r.id === id);
      if (target?.storagePath) {
        deleteBlobAtPath(target.storagePath).catch(() => {});
      }
      setSavedRecordings(prev => prev.filter(r => r.id !== id));
      // Forget the stems-library mapping for the gone recording.
      setSavedToStems(prev => {
        if (!(id in prev)) return prev;
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
      setArmedDeleteRecId(null);
    } else {
      setArmedDeleteRecId(id);
      setTimeout(() => {
        setArmedDeleteRecId(curr => (curr === id ? null : curr));
      }, 3000);
    }
  };

  const onAudioEnded = () => setPlayingId(null);

  return (
    <WorshipShell title="Drums" icon="🥁" subtitle="Virtual drum kit — play, record, and practice.">
    <div className="dr-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* Hidden audio element for playing back saved recordings */}
      <audio ref={audioRef} onEnded={onAudioEnded} style={{ display: 'none' }} />

      {/* ── Settings & recordings sidebar ──────────────────── */}
      <aside className="dr-side">
        {/* A. Settings */}
        <section className={`dr-side-section ${settingsOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="dr-side-head"
            onClick={() => setSettingsOpen(o => !o)}
          >
            <span className="dr-side-head-title">Settings</span>
            <span className="dr-side-head-caret">{settingsOpen ? '▾' : '▸'}</span>
          </button>

          {settingsOpen && (
            <div className="dr-side-body">
              {/* Master Volume */}
              <div className="dr-field">
                <label className="dr-field-row">
                  <span className="dr-field-lbl">Master Volume</span>
                  <span className="dr-field-val">{Math.round(volume * 100)}%</span>
                </label>
                <input
                  className="dr-range"
                  type="range" min="0.05" max="1" step="0.01"
                  value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                />
              </div>

              {/* Pad Kit */}
              <div className="dr-field">
                <label className="dr-field-row">
                  <span className="dr-field-lbl">Pad Kit</span>
                </label>
                <select
                  className="dr-select"
                  value={kit}
                  onChange={e => setKit(e.target.value)}
                >
                  {PAD_KITS.map(k => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </div>

              {/* Reverb */}
              <div className="dr-field">
                <label className="dr-field-row">
                  <span className="dr-field-lbl">Reverb</span>
                  <span className="dr-field-val">{reverb}%</span>
                </label>
                <input
                  className="dr-range"
                  type="range" min="0" max="100" step="1"
                  value={reverb}
                  onChange={e => setReverb(parseInt(e.target.value, 10))}
                />
              </div>

              {/* Pitch */}
              <div className="dr-field">
                <label className="dr-field-row">
                  <span className="dr-field-lbl">Pitch</span>
                  <span className="dr-field-val">
                    {pitch > 0 ? `+${pitch}` : pitch} st
                  </span>
                </label>
                <input
                  className="dr-range"
                  type="range" min="-12" max="12" step="1"
                  value={pitch}
                  onChange={e => setPitch(parseInt(e.target.value, 10))}
                />
              </div>

              {/* Sensitivity */}
              <div className="dr-field">
                <label className="dr-field-row">
                  <span className="dr-field-lbl">Pad Sensitivity</span>
                  <span className="dr-field-val">{Math.round(sensitivity * 100)}%</span>
                </label>
                <input
                  className="dr-range"
                  type="range" min="0.3" max="1.5" step="0.01"
                  value={sensitivity}
                  onChange={e => setSensitivity(parseFloat(e.target.value))}
                />
              </div>
            </div>
          )}
        </section>

        {/* B. Saved Recordings */}
        <section className={`dr-side-section ${recordingsOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="dr-side-head"
            onClick={() => setRecordingsOpen(o => !o)}
          >
            <span className="dr-side-head-title">Saved Recordings</span>
            <span className="dr-side-head-caret">{recordingsOpen ? '▾' : '▸'}</span>
          </button>

          {recordingsOpen && (
            <div className="dr-side-body">
              {/* Controls bar */}
              <div className="dr-rec-controls">
                <div className="dr-rec-row">
                  <span className="dr-field-lbl">BPM</span>
                  <input
                    className="dr-input dr-rec-bpm"
                    type="number"
                    min="40"
                    max="240"
                    step="1"
                    value={bpm}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isFinite(v)) return;
                      setBpm(Math.max(40, Math.min(240, v)));
                    }}
                    disabled={recState === 'count-in'}
                  />
                </div>

                <div className="dr-rec-toggles">
                  <button
                    type="button"
                    className={`dr-rec-toggle ${metronomeOn ? 'on' : ''}`}
                    onClick={() => setMetronomeOn(v => !v)}
                    title="Metronome plays a click during recording"
                  >
                    <span className="dr-rec-toggle-dot"/>
                    Metronome
                  </button>
                  <button
                    type="button"
                    className={`dr-rec-toggle ${countInOn ? 'on' : ''}`}
                    onClick={() => setCountInOn(v => !v)}
                    disabled={recState !== 'idle'}
                    title="Play 4 ticks before recording starts"
                  >
                    <span className="dr-rec-toggle-dot"/>
                    Count-in
                  </button>
                </div>

                {recState === 'idle' && (
                  <button
                    type="button"
                    className="dr-rec-btn"
                    onClick={startRecording}
                  >
                    <span className="dr-rec-dot"/>
                    Record
                  </button>
                )}
                {recState === 'count-in' && (
                  <button
                    type="button"
                    className="dr-rec-btn counting"
                    onClick={stopRecording}
                  >
                    <span className="dr-rec-dot"/>
                    Count-in…
                  </button>
                )}
                {recState === 'recording' && (
                  <button
                    type="button"
                    className="dr-rec-btn recording"
                    onClick={stopRecording}
                  >
                    <span className="dr-rec-dot pulsing"/>
                    Stop · {formatMMSS(recElapsed)}
                  </button>
                )}
              </div>

              {/* Save-this-take dialog */}
              {recState === 'review' && pendingRec && (
                <div className="dr-save-row">
                  <div className="dr-field-lbl">Save this take?</div>
                  <input
                    className="dr-input"
                    placeholder="Recording name…"
                    value={pendingName}
                    onChange={e => setPendingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  saveRecording();
                      if (e.key === 'Escape') discardRecording();
                    }}
                    autoFocus
                  />
                  <div className="dr-field-val">
                    {formatMMSS(pendingRec.duration)} · {pendingRec.bpm} BPM
                  </div>
                  <div className="dr-save-btns">
                    <button className="dr-btn ghost"   onClick={discardRecording}>Discard</button>
                    <button className="dr-btn primary" onClick={saveRecording}>Save</button>
                  </div>
                </div>
              )}

              {/* Stems-library feedback toast */}
              {stemsStatus && (
                <div className={`dr-stems-toast ${stemsStatus.kind}`} role="status">
                  {stemsStatus.text}
                </div>
              )}

              {/* Saved recordings list */}
              <div className="dr-tone-list">
                {savedRecordings.length === 0 ? (
                  <div className="dr-tone-empty">
                    No recordings yet — hit Record to capture a beat.
                  </div>
                ) : (
                  savedRecordings.map(rec => {
                    const isArmed     = armedDeleteRecId === rec.id;
                    const isPlaying   = playingId === rec.id;
                    const inLibrary   = Boolean(savedToStems[rec.id]);
                    const armedReSave = armedReSaveId === rec.id;
                    return (
                      <div key={rec.id} className="dr-tone dr-rec-item">
                        <button
                          type="button"
                          className="dr-rec-play"
                          onClick={() => togglePlayRecording(rec)}
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? '❚❚' : '▶'}
                        </button>
                        <div className="dr-tone-load dr-rec-info">
                          <span className="dr-tone-name">{rec.name}</span>
                          <span className="dr-tone-meta">
                            {formatMMSS(rec.duration)}
                            <span className="dr-rec-bpm-badge">{rec.bpm} BPM</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`dr-rec-stems-btn ${inLibrary ? 'saved' : ''} ${armedReSave ? 'armed' : ''}`}
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
                          className={`dr-tone-del ${isArmed ? 'armed' : ''}`}
                          onClick={() => deleteRecording(rec.id)}
                          title={isArmed ? 'Click again to confirm' : 'Delete recording'}
                        >
                          {isArmed ? '?' : '✕'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>
      </aside>

      <main className="dr-main">
        <header className="dr-header">
          <div className="dr-title">
            <span className="dr-title-icon">🥁</span>
            <div>
              <h1 className="dr-title-text">Drum Pads</h1>
              <p className="dr-title-sub">Keyboard or click to play</p>
            </div>
          </div>
        </header>

        <div className="dr-grid">
          {DRUM_PADS.map((pad, i) => (
            <button
              key={pad.label}
              className={`dr-pad ${hit.has(i) ? 'hit' : ''}`}
              style={{ '--pad': pad.color }}
              onMouseDown={() => strike(i)}
            >
              <span className="dr-pad-key">{pad.key.toUpperCase()}</span>
              <span className="dr-pad-label">{pad.label}</span>
            </button>
          ))}
        </div>

        <div className="dr-hint">
          <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>
          {' '}·{' '}
          <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>
          {' '}·{' '}
          <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>
          {' '}·{' '}
          <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd>
        </div>
      </main>
    </div>
    </WorshipShell>
  );
}
