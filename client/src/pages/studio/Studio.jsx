import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import NavRail from '../../components/layout/NavRail';
import { songService } from '../../services/songService';
import {
  playNote, getRecordStream, VOICE_LIST, VOICES, voiceParams,
  applyReverb, applyReverbSize, applyDelay,
  NOTE_NAMES, midiToName, midiToNoteName,
  SCALES, CHORD_TYPES, DIATONIC,
} from './synth';
import './Studio.css';

/* ─────────────────────────────────────────────────────────────
   Computer-keyboard → semitone map (offset from the base octave's C)
   White keys: A S D F G H J K L  ·  Black keys: W E T Y U O P
   ───────────────────────────────────────────────────────────── */
const KEY_MAP = {
  a: 0,  w: 1,  s: 2,  e: 3,  d: 4,  f: 5,  t: 6,  g: 7,
  y: 8,  h: 9,  u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};
const SEMI_TO_KEY = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k.toUpperCase()])
);

const BLACK_SEMITONES = [1, 3, 6, 8, 10];
const VISIBLE_OCTAVES = 3;
const KEYS = NOTE_NAMES; // for root pickers

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

/* Custom voices persist in localStorage — they're a device-local UI preference. */
const CUSTOM_VOICES_KEY = 'ejh_studio_custom_voices';
const loadCustomVoices = () => {
  try { return JSON.parse(localStorage.getItem(CUSTOM_VOICES_KEY) || '[]'); }
  catch { return []; }
};
const persistCustomVoices = (list) => {
  try { localStorage.setItem(CUSTOM_VOICES_KEY, JSON.stringify(list)); } catch {}
};

const REVERB_SIZES = { room: [1.2, 2], hall: [2.8, 2.5], cathedral: [5, 3] };
const DELAY_DIVS   = { '1/16': 0.25, '1/8': 0.5, '1/8d': 0.75, '1/4': 1, '1/2': 2 };

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Studio() {
  const [voice, setVoice]         = useState('piano');
  const [octave, setOctave]       = useState(4);
  const [sustain, setSustain]     = useState(false);
  const [volume, setVolume]       = useState(0.3);
  const [octaveDouble, setOctaveDouble] = useState(false);
  const [activeNotes, setActive]  = useState(new Set());

  // effects
  const [reverbOn, setReverbOn]           = useState(false);
  const [reverbSize, setReverbSize]       = useState('hall');
  const [reverbAmount, setReverbAmount]   = useState(0.3);
  const [delayOn, setDelayOn]             = useState(false);
  const [delayAmount, setDelayAmount]     = useState(0.28);
  const [delayDivision, setDelayDivision] = useState('1/8');
  const [delayFeedback, setDelayFeedback] = useState(0.35);
  const [bpm, setBpm]                     = useState(100);

  // voice editor
  const [customVoices, setCustomVoices]   = useState(() => loadCustomVoices());
  const [voiceEdits, setVoiceEdits]       = useState(null);

  // scale highlight
  const [scaleOn, setScaleOn]     = useState(false);
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleType, setScaleType] = useState('major');

  // chord helper
  const [chordRoot, setChordRoot] = useState('C');
  const [chordType, setChordType] = useState('maj');

  // recording
  const [isRecording, setIsRecording]   = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [pending, setPending]           = useState(null);   // { dataUrl, duration }
  const [songs, setSongs]               = useState([]);
  const [saveLabel, setSaveLabel]       = useState('');
  const [toast, setToast]               = useState(null);

  // refs
  const handlesRef   = useRef(new Map());   // midi → handle (currently held)
  const sustainedRef = useRef(new Map());   // midi → handle (ringing after key-up while sustain on)
  const recRef       = useRef(null);
  const chunksRef    = useRef([]);
  const recStartRef  = useRef(0);
  const recTimerRef  = useRef(null);
  const voiceDefRef     = useRef(null);
  const volumeRef       = useRef(volume);
  const sustainRef      = useRef(sustain);
  const octaveRef       = useRef(octave);
  const octaveDoubleRef = useRef(octaveDouble);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { octaveRef.current = octave; }, [octave]);
  useEffect(() => { octaveDoubleRef.current = octaveDouble; }, [octaveDouble]);
  useEffect(() => {
    sustainRef.current = sustain;
    if (!sustain) {
      // release every note that was being held by the pedal
      sustainedRef.current.forEach(h => h.release());
      sustainedRef.current.clear();
    }
  }, [sustain]);

  useEffect(() => {
    songService.getAll().then(r => setSongs(r.data.data)).catch(() => {});
  }, []);

  /* ── resolved voice definition (built-in or custom + live edits) ── */
  const resolvedDef = useMemo(() => {
    const custom = customVoices.find(v => v.id === voice);
    const base = custom ? custom.def : (VOICES[voice] || VOICES.piano);
    return voiceEdits ? { ...base, ...voiceEdits } : base;
  }, [voice, customVoices, voiceEdits]);
  useEffect(() => { voiceDefRef.current = resolvedDef; }, [resolvedDef]);

  /* ── effects wiring ──────────────────────────────────────── */
  useEffect(() => { applyReverb(reverbOn ? reverbAmount : 0); }, [reverbOn, reverbAmount]);
  useEffect(() => {
    const [sec, decay] = REVERB_SIZES[reverbSize];
    applyReverbSize(sec, decay);
  }, [reverbSize]);
  useEffect(() => {
    const timeSec = (60 / bpm) * DELAY_DIVS[delayDivision];
    applyDelay(delayOn ? delayAmount : 0, timeSec, delayFeedback);
  }, [delayOn, delayAmount, delayDivision, delayFeedback, bpm]);

  /* ── note on/off ─────────────────────────────────────────── */
  const noteOn = useCallback((midi) => {
    if (handlesRef.current.has(midi)) return;
    // if it was ringing from the pedal, retrigger cleanly
    const sustained = sustainedRef.current.get(midi);
    if (sustained) { sustained.release(); sustainedRef.current.delete(midi); }
    const handle = playNote(midi, {
      voice: voiceDefRef.current,
      volume: volumeRef.current,
      octaveDouble: octaveDoubleRef.current,
    });
    handlesRef.current.set(midi, handle);
    setActive(prev => { const n = new Set(prev); n.add(midi); return n; });
  }, []);

  const noteOff = useCallback((midi) => {
    const handle = handlesRef.current.get(midi);
    if (!handle) return;
    handlesRef.current.delete(midi);
    if (sustainRef.current) {
      sustainedRef.current.set(midi, handle);
    } else {
      handle.release();
    }
    setActive(prev => { const n = new Set(prev); n.delete(midi); return n; });
  }, []);

  /* ── computer keyboard ───────────────────────────────────── */
  useEffect(() => {
    const down = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const semi = KEY_MAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      e.preventDefault();
      noteOn((octaveRef.current + 1) * 12 + semi);
    };
    const up = (e) => {
      const semi = KEY_MAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      noteOff((octaveRef.current + 1) * 12 + semi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [noteOn, noteOff]);

  // release everything on unmount
  useEffect(() => () => {
    handlesRef.current.forEach(h => h.release());
    sustainedRef.current.forEach(h => h.release());
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  /* ── derived: visible keyboard + scale set ───────────────── */
  const keyboard = useMemo(() => {
    const whites = [];
    const blacks = [];
    for (let o = 0; o < VISIBLE_OCTAVES; o++) {
      for (let s = 0; s < 12; s++) {
        const midi = (octave + o + 1) * 12 + s;
        if (BLACK_SEMITONES.includes(s)) {
          blacks.push({ midi, afterWhiteIndex: whites.length - 1 });
        } else {
          whites.push({ midi });
        }
      }
    }
    return { whites, blacks };
  }, [octave]);

  const scaleSet = useMemo(() => {
    if (!scaleOn) return null;
    const rootIdx = NOTE_NAMES.indexOf(scaleRoot);
    const set = new Set(SCALES[scaleType].map(iv => (rootIdx + iv) % 12));
    return set;
  }, [scaleOn, scaleRoot, scaleType]);

  const computerKeyFor = (midi) => {
    const semi = midi - (octave + 1) * 12;
    return SEMI_TO_KEY[semi];
  };

  /* ── chord playing ───────────────────────────────────────── */
  const chordMidis = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(chordRoot);
    const base = (octave + 1) * 12 + rootIdx;
    return CHORD_TYPES[chordType].intervals.map(iv => base + iv);
  }, [chordRoot, chordType, octave]);

  const chordHeldRef = useRef([]);
  const playChord = (midis) => {
    chordHeldRef.current.forEach(h => h.release());
    chordHeldRef.current = midis.map((m) => playNote(m, {
      voice: voiceDefRef.current,
      volume: volumeRef.current,
      octaveDouble: octaveDoubleRef.current,
    }));
    setActive(prev => { const n = new Set(prev); midis.forEach(m => n.add(m)); return n; });
  };
  const releaseChord = (midis) => {
    chordHeldRef.current.forEach(h => {
      if (sustainRef.current) sustainedRef.current.set('chord-' + Math.random(), h);
      else h.release();
    });
    chordHeldRef.current = [];
    setActive(prev => { const n = new Set(prev); (midis || []).forEach(m => n.delete(m)); return n; });
  };

  /* ── voice editor ────────────────────────────────────────── */
  const editParam = (key, val) => {
    setVoiceEdits({
      attack:  resolvedDef.attack,
      decay:   resolvedDef.decay,
      sustain: resolvedDef.sustain,
      release: resolvedDef.release,
      filter:  resolvedDef.filter || 0,
      [key]: val,
    });
  };
  const pickVoice = (id) => { setVoice(id); setVoiceEdits(null); };
  const saveCustomVoice = () => {
    const name = prompt('Name this custom voice:');
    if (!name || !name.trim()) return;
    const id = 'custom-' + Date.now();
    const next = [...customVoices, { id, label: name.trim(), def: { ...resolvedDef } }];
    setCustomVoices(next);
    persistCustomVoices(next);
    setVoice(id);
    setVoiceEdits(null);
    setToast(`Saved voice "${name.trim()}".`);
  };
  const deleteCustomVoice = (id) => {
    const next = customVoices.filter(v => v.id !== id);
    setCustomVoices(next);
    persistCustomVoices(next);
    if (voice === id) { setVoice('piano'); setVoiceEdits(null); }
  };

  // Diatonic chords for the scale key (drives the chord pads)
  const diatonicChords = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(scaleRoot);
    const scale = SCALES[scaleType];
    const dia = DIATONIC[scaleType];
    return scale.map((deg, i) => {
      const noteIdx = (rootIdx + deg) % 12;
      const qual = dia.quals[i];
      const base = (octave + 1) * 12 + noteIdx;
      const midis = CHORD_TYPES[qual].intervals.map(iv => base + iv);
      return {
        roman: dia.romans[i],
        name: NOTE_NAMES[noteIdx] + CHORD_TYPES[qual].suffix,
        midis,
      };
    });
  }, [scaleRoot, scaleType, octave]);

  /* ── recording ───────────────────────────────────────────── */
  const startRecording = () => {
    try {
      const stream = getRecordStream();
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setPending({
            dataUrl: reader.result,
            duration: (Date.now() - recStartRef.current) / 1000,
          });
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      recStartRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      recTimerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
    } catch {
      setToast('Could not start recording.');
    }
  };

  const stopRecording = () => {
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    recRef.current?.stop();
  };

  const saveToSong = async (songId) => {
    if (!pending) return;
    try {
      await songService.addRecording(songId, {
        label: saveLabel || 'Studio take',
        audio_data: pending.dataUrl,
        duration: pending.duration,
      });
      const song = songs.find(s => s.id === songId);
      setToast(`Saved to "${song?.title || 'song'}".`);
      setPending(null);
      setSaveLabel('');
    } catch {
      setToast('Failed to save recording.');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="st-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag studio">Studio</span>
        </div>
        <div className="app-tb-actions">
          {isRecording ? (
            <span className="st-rec-indicator">
              <span className="st-rec-dot" /> Recording {fmtTime(elapsed)}
            </span>
          ) : (
            <span className="st-tb-hint">Play with your mouse or computer keys</span>
          )}
        </div>
      </div>

      <div className="st-body">
        <NavRail />

        <main className="st-main">
          {toast && <div className="st-toast">{toast}</div>}

          {/* ── Controls ── */}
          <section className="st-controls">
            <div className="st-control-group">
              <span className="st-control-lbl">Voice</span>
              <div className="st-voice-pills">
                {VOICE_LIST.map(v => (
                  <button
                    key={v.id}
                    className={`st-voice-pill ${voice === v.id ? 'on' : ''}`}
                    onClick={() => pickVoice(v.id)}
                  >
                    <span>{v.emoji}</span> {v.label}
                  </button>
                ))}
                {customVoices.map(v => (
                  <span key={v.id} className={`st-voice-pill st-voice-custom ${voice === v.id ? 'on' : ''}`}>
                    <button className="st-voice-custom-main" onClick={() => pickVoice(v.id)}>
                      <span>⚙</span> {v.label}
                    </button>
                    <button
                      className="st-voice-custom-del"
                      onClick={() => deleteCustomVoice(v.id)}
                      title="Delete custom voice"
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Octave</span>
              <div className="st-octave">
                <button className="st-oct-btn" onClick={() => setOctave(o => Math.max(1, o - 1))} title="Octave down">−</button>
                <span className="st-oct-val">C{octave}</span>
                <button className="st-oct-btn" onClick={() => setOctave(o => Math.min(7, o + 1))} title="Octave up">+</button>
              </div>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Sustain</span>
              <button
                className={`st-toggle ${sustain ? 'on' : ''}`}
                onClick={() => setSustain(s => !s)}
                title="Hold notes after key-up (sustain pedal)"
              >
                {sustain ? '🦶 On' : '🦶 Off'}
              </button>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Octave ×2</span>
              <button
                className={`st-toggle ${octaveDouble ? 'on' : ''}`}
                onClick={() => setOctaveDouble(v => !v)}
                title="Double every note an octave up for a fuller sound"
              >
                {octaveDouble ? 'On' : 'Off'}
              </button>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Volume</span>
              <input
                type="range"
                className="st-volume"
                min="0" max="0.6" step="0.02"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
              />
            </div>

            <div className="st-control-group st-control-scale">
              <span className="st-control-lbl">Scale highlight</span>
              <div className="st-scale-row">
                <button
                  className={`st-toggle ${scaleOn ? 'on' : ''}`}
                  onClick={() => setScaleOn(v => !v)}
                >
                  {scaleOn ? 'On' : 'Off'}
                </button>
                <select className="st-sel" value={scaleRoot} onChange={e => setScaleRoot(e.target.value)}>
                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="st-sel" value={scaleType} onChange={e => setScaleType(e.target.value)}>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Keyboard ── */}
          <section className="st-keyboard-section">
            <div className="st-keyboard" role="group" aria-label="Piano keyboard">
              {keyboard.whites.map((k, i) => {
                const inScale = !scaleSet || scaleSet.has(k.midi % 12);
                const ck = computerKeyFor(k.midi);
                return (
                  <button
                    key={k.midi}
                    className={`st-key st-key-white
                      ${activeNotes.has(k.midi) ? 'active' : ''}
                      ${scaleSet && !inScale ? 'dim' : ''}
                      ${scaleSet && inScale ? 'in-scale' : ''}`}
                    style={{ width: `${100 / keyboard.whites.length}%` }}
                    onMouseDown={() => noteOn(k.midi)}
                    onMouseUp={() => noteOff(k.midi)}
                    onMouseLeave={() => activeNotes.has(k.midi) && noteOff(k.midi)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <span className="st-key-name">{midiToNoteName(k.midi)}</span>
                    {ck && <span className="st-key-comp">{ck}</span>}
                  </button>
                );
              })}
              {keyboard.blacks.map((k) => {
                const inScale = !scaleSet || scaleSet.has(k.midi % 12);
                const ck = computerKeyFor(k.midi);
                const wW = 100 / keyboard.whites.length;
                const left = (k.afterWhiteIndex + 1) * wW;
                return (
                  <button
                    key={k.midi}
                    className={`st-key st-key-black
                      ${activeNotes.has(k.midi) ? 'active' : ''}
                      ${scaleSet && !inScale ? 'dim' : ''}
                      ${scaleSet && inScale ? 'in-scale' : ''}`}
                    style={{ left: `${left}%`, width: `${wW * 0.62}%`, marginLeft: `${-wW * 0.31}%` }}
                    onMouseDown={() => noteOn(k.midi)}
                    onMouseUp={() => noteOff(k.midi)}
                    onMouseLeave={() => activeNotes.has(k.midi) && noteOff(k.midi)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {ck && <span className="st-key-comp-black">{ck}</span>}
                  </button>
                );
              })}
            </div>
            <div className="st-keyboard-legend">
              Computer keys: <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>… = white ·
              <kbd>W</kbd><kbd>E</kbd><kbd>T</kbd><kbd>Y</kbd>… = black ·
              octave −/+ shifts the playable range
            </div>
          </section>

          {/* ── Effects + Voice Editor ── */}
          <section className="st-panels st-panels-fx">
            {/* Effects */}
            <div className="st-panel">
              <div className="st-panel-title">🌊 Effects</div>

              <div className="st-fx-block">
                <div className="st-fx-head">
                  <button
                    className={`st-toggle ${reverbOn ? 'on' : ''}`}
                    onClick={() => setReverbOn(v => !v)}
                  >{reverbOn ? 'Reverb On' : 'Reverb Off'}</button>
                  <select className="st-sel" value={reverbSize} onChange={e => setReverbSize(e.target.value)}>
                    <option value="room">Room</option>
                    <option value="hall">Hall</option>
                    <option value="cathedral">Cathedral</option>
                  </select>
                </div>
                <label className="st-fx-slider">
                  <span>Amount</span>
                  <input type="range" min="0" max="1" step="0.02"
                    value={reverbAmount} onChange={e => setReverbAmount(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(reverbAmount * 100)}%</span>
                </label>
              </div>

              <div className="st-fx-block">
                <div className="st-fx-head">
                  <button
                    className={`st-toggle ${delayOn ? 'on' : ''}`}
                    onClick={() => setDelayOn(v => !v)}
                  >{delayOn ? 'Delay On' : 'Delay Off'}</button>
                  <select className="st-sel" value={delayDivision} onChange={e => setDelayDivision(e.target.value)}>
                    <option value="1/16">1/16 note</option>
                    <option value="1/8">1/8 note</option>
                    <option value="1/8d">Dotted 1/8</option>
                    <option value="1/4">1/4 note</option>
                    <option value="1/2">1/2 note</option>
                  </select>
                  <label className="st-fx-bpm">
                    <input type="number" min="40" max="240" value={bpm}
                      onChange={e => setBpm(parseInt(e.target.value, 10) || 100)} />
                    <span>BPM</span>
                  </label>
                </div>
                <label className="st-fx-slider">
                  <span>Amount</span>
                  <input type="range" min="0" max="1" step="0.02"
                    value={delayAmount} onChange={e => setDelayAmount(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(delayAmount * 100)}%</span>
                </label>
                <label className="st-fx-slider">
                  <span>Feedback</span>
                  <input type="range" min="0" max="0.85" step="0.02"
                    value={delayFeedback} onChange={e => setDelayFeedback(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(delayFeedback * 100)}%</span>
                </label>
              </div>
            </div>

            {/* Voice Editor */}
            <div className="st-panel">
              <div className="st-panel-title">⚙ Voice Editor</div>
              <div className="st-fx-hint">
                Shape the current voice — changes apply live as you play.
              </div>
              {[
                { key: 'attack',  label: 'Attack',  min: 0,    max: 1,    step: 0.005 },
                { key: 'decay',   label: 'Decay',   min: 0,    max: 2,    step: 0.01 },
                { key: 'sustain', label: 'Sustain', min: 0,    max: 1,    step: 0.02 },
                { key: 'release', label: 'Release', min: 0.05, max: 2.5,  step: 0.01 },
                { key: 'filter',  label: 'Filter',  min: 0,    max: 8000, step: 100 },
              ].map(p => (
                <label key={p.key} className="st-fx-slider">
                  <span>{p.label}</span>
                  <input
                    type="range"
                    min={p.min} max={p.max} step={p.step}
                    value={resolvedDef[p.key] || 0}
                    onChange={e => editParam(p.key, parseFloat(e.target.value))}
                  />
                  <span className="st-fx-val">
                    {p.key === 'filter'
                      ? (resolvedDef.filter ? `${Math.round(resolvedDef.filter)}Hz` : 'off')
                      : (resolvedDef[p.key] ?? 0).toFixed(2)}
                  </span>
                </label>
              ))}
              <div className="st-ve-actions">
                {voiceEdits && (
                  <button className="st-ve-reset" onClick={() => setVoiceEdits(null)}>↺ Reset</button>
                )}
                <button className="st-ve-save" onClick={saveCustomVoice}>💾 Save as custom voice</button>
              </div>
            </div>
          </section>

          {/* ── Lower panels ── */}
          <section className="st-panels">
            {/* Chord helper */}
            <div className="st-panel st-chord-panel">
              <div className="st-panel-title">🎶 Chord Helper</div>

              <div className="st-chord-builder">
                <select className="st-sel" value={chordRoot} onChange={e => setChordRoot(e.target.value)}>
                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="st-sel" value={chordType} onChange={e => setChordType(e.target.value)}>
                  {Object.entries(CHORD_TYPES).map(([id, c]) => (
                    <option key={id} value={id}>{c.label}</option>
                  ))}
                </select>
                <button
                  className="st-chord-play"
                  onMouseDown={() => playChord(chordMidis)}
                  onMouseUp={() => releaseChord(chordMidis)}
                  onMouseLeave={() => releaseChord(chordMidis)}
                >
                  ▶ Play {chordRoot}{CHORD_TYPES[chordType].suffix}
                </button>
              </div>
              <div className="st-chord-notes">
                Notes: {chordMidis.map(m => midiToNoteName(m)).join(' · ')}
              </div>

              <div className="st-chord-pads-lbl">
                Diatonic chords in {scaleRoot} {scaleType}
                <span className="st-chord-pads-hint">— press &amp; hold to play</span>
              </div>
              <div className="st-chord-pads">
                {diatonicChords.map((c, i) => (
                  <button
                    key={i}
                    className="st-chord-pad"
                    onMouseDown={() => playChord(c.midis)}
                    onMouseUp={() => releaseChord(c.midis)}
                    onMouseLeave={() => releaseChord(c.midis)}
                  >
                    <span className="st-pad-roman">{c.roman}</span>
                    <span className="st-pad-name">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Record panel */}
            <div className="st-panel st-record-panel">
              <div className="st-panel-title">🎙 Record</div>

              {!pending ? (
                <>
                  <div className="st-record-controls">
                    {isRecording ? (
                      <button className="st-rec-btn stop" onClick={stopRecording}>
                        ⏹ Stop ({fmtTime(elapsed)})
                      </button>
                    ) : (
                      <button className="st-rec-btn" onClick={startRecording}>
                        🎙 Start recording
                      </button>
                    )}
                  </div>
                  <div className="st-record-hint">
                    Captures everything you play. When you stop, save the take
                    straight onto one of your songs.
                  </div>
                </>
              ) : (
                <div className="st-save-box">
                  <div className="st-save-title">
                    ✓ Take captured · {fmtTime(pending.duration)}
                  </div>
                  <input
                    className="st-sel st-save-label"
                    placeholder="Label (e.g. Verse idea, chord sketch)"
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                  />
                  <div className="st-save-songs-lbl">Save to which song?</div>
                  {songs.length === 0 ? (
                    <div className="st-save-empty">
                      No songs yet — create one in the Songs tab first.
                    </div>
                  ) : (
                    <div className="st-save-songs">
                      {songs.map(s => (
                        <button
                          key={s.id}
                          className="st-save-song"
                          onClick={() => saveToSong(s.id)}
                        >
                          🎵 {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="st-discard" onClick={() => { setPending(null); setSaveLabel(''); }}>
                    Discard take
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
