import { useState, useEffect, useRef, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { playNote, getRecordStream } from '../studio/synth';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import { addStemFromRecording } from '../../utils/stemsLibrary';
import './Akai.css';

/* ─────────────────────────────────────────────────────────────
   AKAI Professional MPC-style controller.
   4 banks × 16 pads. Q-Link knobs for Level & Tune (functional).
   Keyboard: Z X C V / A S D F / Q W E R / 1 2 3 4 (bottom→top).
   ───────────────────────────────────────────────────────────── */

const BANKS = {
  A: {
    name: 'DRUMS',
    color: '#06b6d4',
    ringMs: 130,
    pads: [
      { label: 'KICK',   voice: 'bass',  midi: 36 },
      { label: 'SNARE',  voice: 'chip',  midi: 50 },
      { label: 'HAT C',  voice: 'chip',  midi: 80 },
      { label: 'HAT O',  voice: 'chip',  midi: 86 },
      { label: 'TOM L',  voice: 'bass',  midi: 43 },
      { label: 'TOM M',  voice: 'bass',  midi: 48 },
      { label: 'TOM H',  voice: 'pluck', midi: 55 },
      { label: 'CLAP',   voice: 'chip',  midi: 64 },
      { label: 'RIM',    voice: 'pluck', midi: 72 },
      { label: 'COWBEL', voice: 'pluck', midi: 68 },
      { label: 'CRASH',  voice: 'bells', midi: 78 },
      { label: 'RIDE',   voice: 'bells', midi: 84 },
      { label: 'PERC 1', voice: 'pluck', midi: 60 },
      { label: 'PERC 2', voice: 'pluck', midi: 65 },
      { label: 'STAB',   voice: 'bass',  midi: 52 },
      { label: 'ZAP',    voice: 'chip',  midi: 92 },
    ],
  },
  B: {
    name: 'KEYS',
    color: '#a855f7',
    ringMs: 900,
    pads: [
      { label: 'C3',  voice: 'piano', midi: 48 },
      { label: 'D3',  voice: 'piano', midi: 50 },
      { label: 'E3',  voice: 'piano', midi: 52 },
      { label: 'F3',  voice: 'piano', midi: 53 },
      { label: 'G3',  voice: 'piano', midi: 55 },
      { label: 'A3',  voice: 'piano', midi: 57 },
      { label: 'B3',  voice: 'piano', midi: 59 },
      { label: 'C4',  voice: 'piano', midi: 60 },
      { label: 'D4',  voice: 'piano', midi: 62 },
      { label: 'E4',  voice: 'piano', midi: 64 },
      { label: 'F4',  voice: 'piano', midi: 65 },
      { label: 'G4',  voice: 'piano', midi: 67 },
      { label: 'A4',  voice: 'piano', midi: 69 },
      { label: 'B4',  voice: 'piano', midi: 71 },
      { label: 'C5',  voice: 'piano', midi: 72 },
      { label: 'D5',  voice: 'piano', midi: 74 },
    ],
  },
  C: {
    name: 'BASS',
    color: '#22c55e',
    ringMs: 400,
    pads: [
      { label: 'C1',  voice: 'bass', midi: 24 },
      { label: 'D1',  voice: 'bass', midi: 26 },
      { label: 'E1',  voice: 'bass', midi: 28 },
      { label: 'F1',  voice: 'bass', midi: 29 },
      { label: 'G1',  voice: 'bass', midi: 31 },
      { label: 'A1',  voice: 'bass', midi: 33 },
      { label: 'B1',  voice: 'bass', midi: 35 },
      { label: 'C2',  voice: 'bass', midi: 36 },
      { label: 'D2',  voice: 'bass', midi: 38 },
      { label: 'E2',  voice: 'bass', midi: 40 },
      { label: 'F2',  voice: 'bass', midi: 41 },
      { label: 'G2',  voice: 'bass', midi: 43 },
      { label: 'A2',  voice: 'bass', midi: 45 },
      { label: 'B2',  voice: 'bass', midi: 47 },
      { label: 'C3',  voice: 'bass', midi: 48 },
      { label: 'D3',  voice: 'bass', midi: 50 },
    ],
  },
  D: {
    name: 'FX',
    color: '#f59e0b',
    ringMs: 250,
    pads: [
      { label: 'STAB 1', voice: 'chip',  midi: 52 },
      { label: 'STAB 2', voice: 'chip',  midi: 55 },
      { label: 'STAB 3', voice: 'chip',  midi: 57 },
      { label: 'STAB 4', voice: 'chip',  midi: 60 },
      { label: 'BELL 1', voice: 'bells', midi: 72 },
      { label: 'BELL 2', voice: 'bells', midi: 74 },
      { label: 'BELL 3', voice: 'bells', midi: 76 },
      { label: 'BELL 4', voice: 'bells', midi: 79 },
      { label: 'PLK 1',  voice: 'pluck', midi: 48 },
      { label: 'PLK 2',  voice: 'pluck', midi: 52 },
      { label: 'PLK 3',  voice: 'pluck', midi: 55 },
      { label: 'PLK 4',  voice: 'pluck', midi: 60 },
      { label: 'ZAP 1',  voice: 'chip',  midi: 84 },
      { label: 'ZAP 2',  voice: 'chip',  midi: 88 },
      { label: 'ZAP 3',  voice: 'chip',  midi: 92 },
      { label: 'ZAP 4',  voice: 'chip',  midi: 96 },
    ],
  },
};

/* MPC classic keyboard layout: bottom→top, left→right
   Row 0 (bottom display / pad 1-4):  Z X C V
   Row 1 (pad 5-8):                   A S D F
   Row 2 (pad 9-12):                  Q W E R
   Row 3 (top / pad 13-16):           1 2 3 4   */
const KEY_MAP = {
  'z': 0,  'x': 1,  'c': 2,  'v': 3,
  'a': 4,  's': 5,  'd': 6,  'f': 7,
  'q': 8,  'w': 9,  'e': 10, 'r': 11,
  '1': 12, '2': 13, '3': 14, '4': 15,
};

// Display order: top row first (pads 13-16, 9-12, 5-8, 1-4 in 1-indexed)
const GRID_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

/* ── Persisted settings keys & defaults ───────────────────── */
const RECORDINGS_LS_KEY = 'akai:saved-recordings';
const SETTINGS_LS_KEY   = 'akai:settings';
const STEMS_MAP_LS_KEY  = 'akai:to-stems';

/* Bank → Stems Library "type" mapping */
const BANK_TO_STEM_TYPE = { A: 'drums', B: 'keys', C: 'bass', D: 'other' };

const QUANTIZE_OPTIONS = ['Off', '1/4', '1/8', '1/16', '1/32'];
const PAD_MODE_OPTIONS = ['Drum', 'Keys', 'Bass', 'FX'];
const REPEAT_OPTIONS   = ['1/4', '1/8', '1/16', '1/32'];

const DEFAULT_SETTINGS = {
  masterVol:   0.85,
  swing:       0,           // 0–60 %
  quantize:    'Off',
  padMode:     'Drum',
  tempo:       120,
  repeatRate:  '1/16',
  midiThrough: false,
};

/* Bank → pad-mode mapping (informational, but reflects current bank) */
const BANK_TO_PADMODE = { A: 'Drum', B: 'Keys', C: 'Bass', D: 'FX' };

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch { return fallback; }
};

const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

/* ── Interactive rotary knob ───────────────────────────────── */
function Knob({ label, value, min, max, onChange, color = '#06b6d4', fmt }) {
  const pct       = (value - min) / (max - min);
  const angle     = -135 + pct * 270;
  const toXY      = (deg, r) => ({
    x: 20 + r * Math.cos((deg - 90) * Math.PI / 180),
    y: 20 + r * Math.sin((deg - 90) * Math.PI / 180),
  });
  const R         = 13;
  const trackS    = toXY(-135, R);
  const trackE    = toXY(135, R);
  const activeE   = toXY(angle, R);
  const indicator = toXY(angle, 10);
  const sweep     = pct * 270 > 180 ? 1 : 0;
  const display   = fmt ? fmt(value) : (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

  const dragRef = useRef(null);
  const onMouseDown = (e) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };
    const sensitivity = (max - min) / 140;
    const onMove = (me) => {
      const delta = -(me.clientY - dragRef.current.startY) * sensitivity;
      onChange(Math.max(min, Math.min(max, dragRef.current.startVal + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="ak-knob" onMouseDown={onMouseDown} title={`${label}: ${display} — drag up/down`}>
      <svg viewBox="0 0 40 40" className="ak-knob-svg">
        {/* Track arc */}
        <path
          d={`M ${trackS.x} ${trackS.y} A ${R} ${R} 0 1 1 ${trackE.x} ${trackE.y}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" strokeLinecap="round"
        />
        {/* Active arc */}
        {pct > 0.005 && (
          <path
            d={`M ${trackS.x} ${trackS.y} A ${R} ${R} 0 ${sweep} 1 ${activeE.x} ${activeE.y}`}
            fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"
          />
        )}
        {/* Body */}
        <circle cx="20" cy="20" r="9" fill="#131318" stroke="rgba(255,255,255,0.09)" strokeWidth="1.2" />
        {/* Centre dot */}
        <circle cx="20" cy="20" r="1.5" fill={color} opacity="0.6" />
        {/* Indicator line */}
        <line
          x1="20" y1="20" x2={indicator.x} y2={indicator.y}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />
      </svg>
      <span className="ak-knob-label">{label}</span>
      <span className="ak-knob-val">{display}</span>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export default function Akai() {
  const { user } = useAuth();
  const [bank, setBank]           = useState('A');
  const [hit, setHit]             = useState(() => new Set());
  const [lastPad, setLastPad]     = useState(null);
  const [volume, setVolume]       = useState(0.55);
  const [transpose, setTranspose] = useState(0);   // semitones, snapped on use
  const [filter, setFilter]       = useState(0.6); // display-only
  const [attack, setAttack]       = useState(0.2); // display-only

  /* ── Sidebar settings (Firestore-backed, merged with defaults) ── */
  const [rawSettings, setRawSettings] = useUserStoreKey('akai:settings', null);
  const settings = { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
  const setSettings = (next) => {
    if (typeof next === 'function') {
      setRawSettings((prev) => next({ ...DEFAULT_SETTINGS, ...(prev || {}) }));
    } else {
      setRawSettings(next);
    }
  };

  /* ── Saved recordings (Firestore-backed) ── */
  const [savedRecordings, setSavedRecordings] = useUserStoreKey('akai:saved-recordings', []);

  /* ── Recording feature state ── */
  const [metronomeOn,       setMetronomeOn]       = useState(false);
  const [countInOn,         setCountInOn]         = useState(true);
  // 'idle' | 'count-in' | 'recording' | 'review'
  const [recState,          setRecState]          = useState('idle');
  const [recElapsed,        setRecElapsed]        = useState(0);
  const [pendingRec,        setPendingRec]        = useState(null);
  const [pendingName,       setPendingName]       = useState('');
  const [playingId,         setPlayingId]         = useState(null);
  const [armedDeleteRecId,  setArmedDeleteRecId]  = useState(null);

  /* ── Stems Library tracking — Firestore-backed map of recId → stemId. */
  const [savedToStems, setSavedToStems] = useUserStoreKey('akai:to-stems', {});
  const [armedReSaveId, setArmedReSaveId] = useState(null);
  const [stemsStatus,   setStemsStatus]   = useState(null);  // { kind, text }
  const stemsTimerRef  = useRef(null);
  const reSaveTimerRef = useRef(null);

  /* ── Sidebar UI state ── */
  const [openSettings,   setOpenSettings]   = useState(true);
  const [openRecordings, setOpenRecordings] = useState(true);

  /* ── Tap-tempo memory ── */
  const tapTimesRef = useRef([]);

  /* ── Refs for stable callbacks ── */
  const volRef        = useRef(volume);
  const transRef      = useRef(transpose);
  const bankRef       = useRef(bank);
  const masterVolRef  = useRef(settings.masterVol);
  volRef.current        = volume;
  transRef.current      = transpose;
  bankRef.current       = bank;
  masterVolRef.current  = settings.masterVol;

  /* Persist settings whenever they change */
  /* (All three lists autosync via useUserStoreKey.) */

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
      type:         BANK_TO_STEM_TYPE[rec.bank] || 'other',
      duration:     rec.duration,
      bpm:          rec.bpm,
      source:       `AKAI - Bank ${rec.bank || '?'}`,
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

  /* Keep informational padMode in sync with the active bank */
  useEffect(() => {
    setSettings(s =>
      s.padMode === BANK_TO_PADMODE[bank] ? s : { ...s, padMode: BANK_TO_PADMODE[bank] }
    );
  }, [bank]);

  const updateSetting = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  const flash = (i) => {
    setHit(s => { const n = new Set(s); n.add(i); return n; });
    setTimeout(() => setHit(s => { const n = new Set(s); n.delete(i); return n; }), 145);
  };

  const strike = useCallback((padIdx) => {
    const bData = BANKS[bankRef.current];
    const pad   = bData.pads[padIdx];
    if (!pad) return;
    const midi = Math.max(0, Math.min(127, pad.midi + Math.round(transRef.current)));
    /* Master volume scales the per-pad LEVEL knob — wired into playNote. */
    const finalVol = volRef.current * masterVolRef.current;
    try {
      const h = playNote(midi, { voice: pad.voice, volume: finalVol });
      setTimeout(() => { try { h.release(); } catch {} }, bData.ringMs);
    } catch {}
    flash(padIdx);
    setLastPad({ label: pad.label, num: padIdx + 1 });
  }, []);

  /* ── Note repeat: while a pad is held down, retrigger at the chosen rate. */
  const repeatTimersRef = useRef(new Map()); // padIdx → interval id

  const repeatIntervalMs = useCallback(() => {
    const rate = settings.repeatRate;
    const bpm  = Math.max(20, Math.min(300, Number(settings.tempo) || 120));
    const quarterMs = 60000 / bpm;
    const div = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 }[rate] || 0.25;
    return quarterMs * div;
  }, [settings.repeatRate, settings.tempo]);

  const startRepeat = useCallback((padIdx) => {
    if (repeatTimersRef.current.has(padIdx)) return;
    const ms = repeatIntervalMs();
    const id = setInterval(() => strike(padIdx), ms);
    repeatTimersRef.current.set(padIdx, id);
  }, [repeatIntervalMs, strike]);

  const stopRepeat = useCallback((padIdx) => {
    const id = repeatTimersRef.current.get(padIdx);
    if (id) { clearInterval(id); repeatTimersRef.current.delete(padIdx); }
  }, []);

  const stopAllRepeats = useCallback(() => {
    for (const id of repeatTimersRef.current.values()) clearInterval(id);
    repeatTimersRef.current.clear();
  }, []);

  useEffect(() => () => stopAllRepeats(), [stopAllRepeats]);

  // Keyboard
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      // Alt+A/B/C/D → switch bank
      if (e.altKey) {
        if (k === 'a') { setBank('A'); return; }
        if (k === 'b') { setBank('B'); return; }
        if (k === 'c') { setBank('C'); return; }
        if (k === 'd') { setBank('D'); return; }
      }
      const i = KEY_MAP[k];
      if (i === undefined) return;
      e.preventDefault();
      strike(i);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [strike]);

  /* ── Tap tempo: median of last few intervals ── */
  const handleTap = () => {
    const now = performance.now();
    const arr = tapTimesRef.current;
    // Reset if last tap was > 2 s ago
    if (arr.length && now - arr[arr.length - 1] > 2000) arr.length = 0;
    arr.push(now);
    if (arr.length > 5) arr.shift();
    if (arr.length >= 2) {
      const intervals = [];
      for (let i = 1; i < arr.length; i++) intervals.push(arr[i] - arr[i - 1]);
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      const bpm = Math.round(Math.max(40, Math.min(240, 60000 / median)));
      updateSetting('tempo', bpm);
    }
  };

  /* ── Recording helpers ────────────────────────────────────────
     Captures the master bus via getRecordStream() into a webm
     blob → data URL → localStorage. Metronome is a Web Audio
     oscillator scheduled with setInterval(60000/tempo).        */
  const recRef        = useRef(null);   // { mr, chunks }
  const chunksRef     = useRef([]);
  const recStartRef   = useRef(0);      // performance.now() when recording really started
  const recTimerRef   = useRef(null);   // setInterval id for the MM:SS readout
  const metroRef      = useRef(null);   // setInterval id for the metronome ticks
  const countInRef    = useRef(null);   // setTimeout id for count-in lead-in
  const recBankRef    = useRef('A');    // bank captured at the moment recording starts
  const audioRef      = useRef(null);   // hidden <audio> element for playback

  const tempoRef = useRef(settings.tempo);
  tempoRef.current = settings.tempo;

  /** Short percussive tick via Web Audio — ~30–50% of a typical pad hit. */
  const playTick = useCallback((accent = false) => {
    try {
      // Square-ish click at high MIDI for an audible but subtle tick.
      const note = accent ? 96 : 90;
      const handle = playNote(note, { voice: 'chip', volume: 0.18 });
      setTimeout(() => { try { handle.release(); } catch {} }, 60);
    } catch {}
  }, []);

  const stopMetronome = useCallback(() => {
    if (metroRef.current) { clearInterval(metroRef.current); metroRef.current = null; }
  }, []);

  /** (Re)start the metronome interval at the current tempo. */
  const startMetronome = useCallback(() => {
    stopMetronome();
    const bpm = Math.max(40, Math.min(240, Number(tempoRef.current) || 120));
    const ms = 60000 / bpm;
    metroRef.current = setInterval(() => playTick(false), ms);
  }, [playTick, stopMetronome]);

  /* Keep the metronome in sync with live tempo changes whenever it's running. */
  useEffect(() => {
    if (metroRef.current) {
      // Retune: clear & restart at the new interval.
      startMetronome();
    }
  }, [settings.tempo, startMetronome]);

  /* If the user toggles the standalone Metronome switch while idle,
     start/stop the click immediately so they can audition the tempo. */
  useEffect(() => {
    if (recState === 'recording' || recState === 'count-in') return; // controlled by record flow
    if (metronomeOn) startMetronome();
    else stopMetronome();
  }, [metronomeOn, recState, startMetronome, stopMetronome]);

  const fmtElapsed = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const stopElapsedTimer = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };
  const startElapsedTimer = () => {
    stopElapsedTimer();
    recStartRef.current = performance.now();
    setRecElapsed(0);
    recTimerRef.current = setInterval(() => {
      setRecElapsed((performance.now() - recStartRef.current) / 1000);
    }, 200);
  };

  const beginActualRecording = () => {
    recBankRef.current = bankRef.current;
    let stream;
    try { stream = getRecordStream(); }
    catch { setRecState('idle'); return; }

    chunksRef.current = [];
    let mr;
    try { mr = new MediaRecorder(stream); }
    catch { setRecState('idle'); return; }

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    try { mr.start(); } catch { setRecState('idle'); return; }
    recRef.current = { mr };

    // If metronome toggle is on, keep clicking through the take.
    if (metronomeOn) startMetronome();
    else stopMetronome();

    startElapsedTimer();
    setRecState('recording');
  };

  const startRecording = () => {
    if (recState !== 'idle') return;

    if (countInOn) {
      setRecState('count-in');
      const bpm = Math.max(40, Math.min(240, Number(tempoRef.current) || 120));
      const tickMs = 60000 / bpm;
      // 4 ticks lead-in. Click on each beat; record starts at beat 5 (right after the 4th tick).
      let beat = 0;
      const fire = () => {
        beat += 1;
        playTick(beat === 1); // first tick lightly accented
        if (beat >= 4) {
          if (countInRef.current) { clearInterval(countInRef.current); countInRef.current = null; }
          beginActualRecording();
        }
      };
      // First tick immediately, then every tickMs.
      fire();
      countInRef.current = setInterval(fire, tickMs);
    } else {
      beginActualRecording();
    }
  };

  const stopRecording = () => {
    // Cancel any in-flight count-in.
    if (countInRef.current) { clearInterval(countInRef.current); countInRef.current = null; }
    stopElapsedTimer();
    // Stop metronome (unless toggle is on and we want to keep it auditioning).
    if (!metronomeOn) stopMetronome();

    const rec = recRef.current;
    recRef.current = null;
    if (!rec) {
      // Stopped during count-in — no take to save.
      setRecState('idle');
      setRecElapsed(0);
      return;
    }
    // Compute duration from the wall-clock start, not the throttled state.
    const duration = (performance.now() - recStartRef.current) / 1000;
    rec.mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingRec({
          dataUrl: reader.result,
          duration,
          bpm: tempoRef.current,
          bank: recBankRef.current,
        });
        setPendingName('');
        setRecState('review');
      };
      reader.readAsDataURL(blob);
    };
    try { rec.mr.stop(); } catch {
      setRecState('idle');
      setRecElapsed(0);
    }
  };

  const commitPendingRec = async () => {
    const name = (pendingName || '').trim() || `Take ${savedRecordings.length + 1}`;
    if (!pendingRec) return;
    if (!user?.uid) {
      console.warn('Cannot save take — not signed in.');
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const { url, path } = await uploadDataUrl(user.uid, 'akai-recordings', pendingRec.dataUrl, { filename: `${id}.webm` });
      const entry = {
        id,
        name,
        audioUrl:    url,
        storagePath: path,
        duration:    pendingRec.duration,
        bpm:         pendingRec.bpm,
        bank:        pendingRec.bank,
        createdAt:   new Date().toISOString(),
      };
      setSavedRecordings(list => [entry, ...list]);
    } catch (err) {
      console.error('Failed to upload AKAI take', err);
      return;
    }
    setPendingRec(null);
    setPendingName('');
    setRecElapsed(0);
    setRecState('idle');
  };

  const discardPendingRec = () => {
    setPendingRec(null);
    setPendingName('');
    setRecElapsed(0);
    setRecState('idle');
  };

  const togglePlayback = (rec) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingId === rec.id) {
      try { el.pause(); } catch {}
      setPlayingId(null);
      return;
    }
    try {
      /* Prefer new audioUrl (Firebase Storage) with legacy dataUrl fallback. */
      el.src = rec.audioUrl || rec.dataUrl;
      el.currentTime = 0;
      el.play().then(() => setPlayingId(rec.id)).catch(() => setPlayingId(null));
    } catch { setPlayingId(null); }
  };

  const deleteRecording = (id) => {
    if (armedDeleteRecId !== id) { setArmedDeleteRecId(id); return; }
    if (playingId === id && audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      setPlayingId(null);
    }
    /* Clean up the Storage blob — fire and forget. */
    const target = savedRecordings.find(r => r.id === id);
    if (target?.storagePath) deleteBlobAtPath(target.storagePath).catch(() => {});
    setSavedRecordings(list => list.filter(r => r.id !== id));
    // Forget the stems-library mapping for the deleted recording.
    setSavedToStems(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    setArmedDeleteRecId(null);
  };

  /* Cleanup on unmount: intervals + MediaRecorder. */
  useEffect(() => () => {
    if (countInRef.current) clearInterval(countInRef.current);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (metroRef.current) clearInterval(metroRef.current);
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    if (reSaveTimerRef.current) clearTimeout(reSaveTimerRef.current);
    if (recRef.current) { try { recRef.current.mr.stop(); } catch {} }
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
  }, []);

  const bData = BANKS[bank];

  // Transpose display: snap to nearest integer for readout
  const transposeDisplay = Math.round(transpose);
  const transposeLabel   = transposeDisplay === 0 ? '0 st'
    : transposeDisplay > 0 ? `+${transposeDisplay} st` : `${transposeDisplay} st`;

  return (
    <WorshipShell title="AKAI MPC" icon="🎛" subtitle="AKAI MPC-style pad sampler and sequencer.">
    <div className="ak-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ════════════════════════════════════════════════════
          Side panel — Settings + Saved Recordings
          ════════════════════════════════════════════════════ */}
      <aside className="ak-side">
        <div className="ak-side-title">MPC CONTROLS</div>

        {/* ── A. Settings ── */}
        <section className={`ak-side-card ${openSettings ? 'open' : ''}`}>
          <button
            className="ak-side-head"
            onClick={() => setOpenSettings(o => !o)}
            title="Toggle settings panel"
          >
            <span className="ak-side-head-lbl">Settings</span>
            <span className="ak-side-head-caret">{openSettings ? '▾' : '▸'}</span>
          </button>

          {openSettings && (
            <div className="ak-side-body">
              {/* Master volume */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">
                  Master Volume
                  <span className="ak-set-val">{Math.round(settings.masterVol * 100)}%</span>
                </label>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={settings.masterVol}
                  onChange={e => updateSetting('masterVol', parseFloat(e.target.value))}
                  className="ak-set-slider"
                />
              </div>

              {/* Swing */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">
                  Swing
                  <span className="ak-set-val">{settings.swing}%</span>
                </label>
                <input
                  type="range" min="0" max="60" step="1"
                  value={settings.swing}
                  onChange={e => updateSetting('swing', parseInt(e.target.value, 10))}
                  className="ak-set-slider"
                />
              </div>

              {/* Quantize */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">Quantize</label>
                <select
                  className="ak-set-select"
                  value={settings.quantize}
                  onChange={e => updateSetting('quantize', e.target.value)}
                >
                  {QUANTIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Pad mode */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">Pad Mode</label>
                <select
                  className="ak-set-select"
                  value={settings.padMode}
                  onChange={e => updateSetting('padMode', e.target.value)}
                  title="Informational — reflects the active bank"
                >
                  {PAD_MODE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Tap tempo + BPM */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">
                  Tempo
                  <span className="ak-set-val">{settings.tempo} BPM</span>
                </label>
                <div className="ak-tap-row">
                  <button className="ak-tap-btn" onClick={handleTap} title="Tap to set tempo">TAP</button>
                  <input
                    type="number" min="40" max="240"
                    value={settings.tempo}
                    onChange={e => updateSetting('tempo', Math.max(40, Math.min(240, parseInt(e.target.value, 10) || 120)))}
                    className="ak-set-num"
                  />
                </div>
              </div>

              {/* Note repeat */}
              <div className="ak-set-row">
                <label className="ak-set-lbl">Note Repeat</label>
                <select
                  className="ak-set-select"
                  value={settings.repeatRate}
                  onChange={e => updateSetting('repeatRate', e.target.value)}
                  title="Rate at which a held pad retriggers"
                >
                  {REPEAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* MIDI through */}
              <div className="ak-set-row ak-set-row-inline">
                <label className="ak-set-lbl ak-set-lbl-inline">MIDI Through</label>
                <button
                  className={`ak-toggle ${settings.midiThrough ? 'on' : ''}`}
                  onClick={() => updateSetting('midiThrough', !settings.midiThrough)}
                  title="Pass incoming MIDI through to the output (informational)"
                >
                  <span className="ak-toggle-dot" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── B. Saved Recordings ── */}
        <section className={`ak-side-card ${openRecordings ? 'open' : ''}`}>
          <button
            className="ak-side-head"
            onClick={() => setOpenRecordings(o => !o)}
            title="Toggle saved recordings"
          >
            <span className="ak-side-head-lbl">
              Saved Recordings
              {savedRecordings.length > 0 && (
                <span className="ak-side-head-count">{savedRecordings.length}</span>
              )}
            </span>
            <span className="ak-side-head-caret">{openRecordings ? '▾' : '▸'}</span>
          </button>

          {openRecordings && (
            <div className="ak-side-body">

              {/* ── Controls bar ── */}
              <div className="ak-side-rec-controls">
                <div className="ak-side-rec-toggles">
                  <label className="ak-side-rec-tog">
                    <span className="ak-side-rec-tog-lbl">Metronome</span>
                    <button
                      type="button"
                      className={`ak-toggle ${metronomeOn ? 'on' : ''}`}
                      onClick={() => setMetronomeOn(v => !v)}
                      title="Click track at the current Tempo"
                    >
                      <span className="ak-toggle-dot" />
                    </button>
                  </label>
                  <label className="ak-side-rec-tog">
                    <span className="ak-side-rec-tog-lbl">Count-in</span>
                    <button
                      type="button"
                      className={`ak-toggle ${countInOn ? 'on' : ''}`}
                      onClick={() => setCountInOn(v => !v)}
                      title="4 ticks before recording starts"
                    >
                      <span className="ak-toggle-dot" />
                    </button>
                  </label>
                </div>

                <button
                  className={`ak-side-rec-btn ${recState === 'recording' ? 'recording'
                    : recState === 'count-in' ? 'count-in' : ''}`}
                  onClick={() => {
                    if (recState === 'idle') startRecording();
                    else if (recState === 'count-in' || recState === 'recording') stopRecording();
                  }}
                  disabled={recState === 'review'}
                  title={
                    recState === 'recording' ? 'Stop recording'
                      : recState === 'count-in' ? 'Cancel count-in'
                      : recState === 'review'   ? 'Review pending take'
                      : 'Start recording'
                  }
                >
                  <span className="ak-side-rec-dot" />
                  <span className="ak-side-rec-lbl">
                    {recState === 'recording' ? `REC ${fmtElapsed(recElapsed)}`
                      : recState === 'count-in' ? 'COUNT-IN…'
                      : recState === 'review'   ? 'REVIEW…'
                      : 'RECORD'}
                  </span>
                </button>

                <div className="ak-side-rec-note">
                  BPM uses the Tempo setting above
                </div>
              </div>

              {/* ── Review form (after stop, before save) ── */}
              {recState === 'review' && pendingRec && (
                <div className="ak-side-rec-review">
                  <div className="ak-side-rec-review-title">
                    Save this take? <span className="ak-side-rec-review-meta">
                      {fmtElapsed(pendingRec.duration)} · {pendingRec.bpm} BPM · Bank {pendingRec.bank}
                    </span>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Take name…"
                    value={pendingName}
                    onChange={e => setPendingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitPendingRec();
                      else if (e.key === 'Escape') discardPendingRec();
                    }}
                    className="ak-side-rec-input"
                  />
                  <div className="ak-side-rec-review-actions">
                    <button className="ak-side-rec-save" onClick={commitPendingRec}>Save</button>
                    <button className="ak-side-rec-discard" onClick={discardPendingRec}>Discard</button>
                  </div>
                </div>
              )}

              {/* Stems-library feedback toast */}
              {stemsStatus && (
                <div className={`ak-stems-toast ${stemsStatus.kind}`} role="status">
                  {stemsStatus.text}
                </div>
              )}

              {/* ── List ── */}
              {savedRecordings.length === 0 ? (
                <div className="ak-side-rec-empty">
                  No recordings yet — hit Record to capture a beat or loop.
                </div>
              ) : (
                <ul className="ak-side-rec-list">
                  {savedRecordings.map(r => {
                    const bColor    = BANKS[r.bank]?.color || '#06b6d4';
                    const isPlaying = playingId === r.id;
                    const inLibrary = Boolean(savedToStems[r.id]);
                    const armedRe   = armedReSaveId === r.id;
                    return (
                      <li key={r.id} className="ak-side-rec-item">
                        <button
                          className={`ak-side-rec-play ${isPlaying ? 'playing' : ''}`}
                          onClick={() => togglePlayback(r)}
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? '❚❚' : '▶'}
                        </button>
                        <div className="ak-side-rec-info">
                          <span className="ak-side-rec-name" title={r.name}>{r.name}</span>
                          <div className="ak-side-rec-meta">
                            <span className="ak-side-rec-dur">{fmtElapsed(r.duration)}</span>
                            <span className="ak-side-rec-bpm">{r.bpm} BPM</span>
                            <span
                              className="ak-side-rec-bank"
                              style={{ '--bc': bColor }}
                              title={`Bank ${r.bank}`}
                            >
                              {r.bank}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`ak-side-rec-stems-btn ${inLibrary ? 'saved' : ''} ${armedRe ? 'armed' : ''}`}
                          onClick={() => handleSaveToStems(r)}
                          title={
                            armedRe     ? 'Click again to re-save (creates a duplicate)'
                              : inLibrary ? 'Already in Stems Library — click to save another copy'
                                          : 'Save to Stems Library'
                          }
                          aria-label="Save to Stems Library"
                        >
                          {inLibrary
                            ? (armedRe ? '↻?' : '✓ In Library')
                            : '💾 Stems'}
                        </button>
                        <button
                          className={`ak-side-rec-del ${armedDeleteRecId === r.id ? 'armed' : ''}`}
                          onClick={() => deleteRecording(r.id)}
                          onBlur={() => setArmedDeleteRecId(a => a === r.id ? null : a)}
                          title={armedDeleteRecId === r.id ? 'Click again to delete' : 'Delete recording'}
                        >
                          {armedDeleteRecId === r.id ? '?' : '×'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Hidden audio element for playback */}
              <audio
                ref={audioRef}
                onEnded={() => setPlayingId(null)}
                onPause={() => { /* keep playingId for explicit pause via button */ }}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </section>
      </aside>

      <main className="ak-main">

        {/* ── Top bar: branding + LCD ── */}
        <div className="ak-topbar">
          <div className="ak-brand">
            <span className="ak-brand-logo">AKAI</span>
            <span className="ak-brand-pro">professional</span>
            <span className="ak-brand-model">MPC STUDIO</span>
          </div>

          <div className="ak-lcd">
            <div className="ak-lcd-inner">
              <div className="ak-lcd-bank" style={{ color: bData.color }}>
                {bank} — {bData.name}
              </div>
              <div className="ak-lcd-pad">
                {lastPad
                  ? <><span className="ak-lcd-padnum">PAD {String(lastPad.num).padStart(2,'0')}</span><span className="ak-lcd-padname">{lastPad.label}</span></>
                  : <span className="ak-lcd-ready">READY</span>
                }
              </div>
              <div className="ak-lcd-tune">
                TUNE <span style={{ color: transposeDisplay !== 0 ? bData.color : undefined }}>{transposeLabel}</span>
                &nbsp;·&nbsp; VOL <span>{Math.round(volume * settings.masterVol * 100)}%</span>
                &nbsp;·&nbsp; {settings.tempo} BPM
              </div>
            </div>
          </div>
        </div>

        {/* ── Middle: pads + right controls ── */}
        <div className="ak-mid">

          {/* 4×4 pad grid */}
          <div className="ak-padzone">
            <div className="ak-padgrid">
              {GRID_ORDER.map((padIdx) => {
                const pad = bData.pads[padIdx];
                return (
                  <button
                    key={padIdx}
                    className={`ak-pad ${hit.has(padIdx) ? 'hit' : ''}`}
                    style={{ '--color': bData.color }}
                    onMouseDown={() => { strike(padIdx); startRepeat(padIdx); }}
                    onMouseUp={() => stopRepeat(padIdx)}
                    onMouseLeave={() => stopRepeat(padIdx)}
                  >
                    {/* Horizontal ridge overlay rendered via CSS ::after */}
                    <span className="ak-pad-label">{pad.label}</span>
                    <span className="ak-pad-num">{padIdx + 1}</span>
                  </button>
                );
              })}
            </div>

            {/* Pad numbering legend under grid */}
            <div className="ak-pad-legend">
              {['13–16', '9–12', '5–8', '1–4'].map((r, i) => (
                <span key={i} className="ak-pad-legend-row">{r}</span>
              ))}
            </div>
          </div>

          {/* Right panel: knobs + bank selector */}
          <div className="ak-panel">

            {/* Q-Link knobs */}
            <div className="ak-qlink-label">Q-LINK</div>
            <div className="ak-knobs">
              <Knob
                label="LEVEL"
                value={volume}
                min={0} max={1}
                onChange={setVolume}
                color={bData.color}
                fmt={v => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="TUNE"
                value={transpose}
                min={-12} max={12}
                onChange={setTranspose}
                color={bData.color}
                fmt={v => {
                  const n = Math.round(v);
                  return n === 0 ? '0' : n > 0 ? `+${n}` : `${n}`;
                }}
              />
              <Knob
                label="FILTER"
                value={filter}
                min={0} max={1}
                onChange={setFilter}
                color={bData.color}
                fmt={v => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="ATTACK"
                value={attack}
                min={0} max={1}
                onChange={setAttack}
                color={bData.color}
                fmt={v => `${Math.round(v * 100)}%`}
              />
            </div>

            {/* Divider */}
            <div className="ak-panel-div" />

            {/* Bank selector */}
            <div className="ak-bank-section">
              <span className="ak-bank-lbl">BANK SELECT</span>
              <div className="ak-bank-btns">
                {Object.keys(BANKS).map(b => (
                  <button
                    key={b}
                    className={`ak-bank-btn ${bank === b ? 'on' : ''}`}
                    style={{ '--bc': BANKS[b].color }}
                    onClick={() => setBank(b)}
                    title={`Bank ${b}: ${BANKS[b].name} (Alt+${b})`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <span className="ak-bank-name" style={{ color: bData.color }}>{bData.name}</span>
            </div>

            {/* Divider */}
            <div className="ak-panel-div" />

            {/* Transport */}
            <div className="ak-transport">
              <span className="ak-transport-lbl">TRANSPORT</span>
              <div className="ak-transport-btns">
                <button className="ak-tp-btn ak-tp-play" title="Play">▶</button>
                <button className="ak-tp-btn ak-tp-stop" title="Stop">■</button>
                <button className="ak-tp-btn ak-tp-rec"  title="Record">●</button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Bottom: keyboard hint ── */}
        <div className="ak-hint">
          <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd>
          <span className="ak-hint-sep">·</span>
          <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>
          <span className="ak-hint-sep">·</span>
          <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>
          <span className="ak-hint-sep">·</span>
          <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>
          <span className="ak-hint-sep ak-hint-long">—</span>
          <span className="ak-hint-text">bottom → top rows &nbsp;·&nbsp; <kbd>Alt</kbd>+<kbd>A/B/C/D</kbd> switches bank &nbsp;·&nbsp; drag knobs up/down</span>
        </div>

      </main>
    </div>
    </WorshipShell>
  );
}
