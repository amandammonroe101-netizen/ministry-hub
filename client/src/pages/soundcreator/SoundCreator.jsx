import { useState, useEffect, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import {
  startMicRecording, startBusRecording, decodeAudio, reverseBuffer,
  buildFreezeBuffer, buildStutterBuffer, buildScrambleBuffer,
  buildBeatRepeatBuffer, buildGrainScatterBuffer, buildReverseSwellBuffer,
  buildTrimBuffer,
  playBuffer, applyReverb, applyDelay, applyPingPong, applyScreech, setMasterVolume, applyLimiter,
  getMasterAnalyser,
} from './soundEngine';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import { addStemFromRecording } from '../../utils/stemsLibrary';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './SoundCreator.css';

/* ─────────────────────────────────────────────────────────────
   Sound Creator — record weird sounds from the mic, warp each
   one (pitch, reverse, distortion, filter, pan), then mix
   several together and record the combined result as a new
   sound. Everything lives in a Firestore-backed library
   (soundcreator:sounds) with audio uploaded to Storage.
   ───────────────────────────────────────────────────────────── */

const DEFAULT_FX = {
  pitch:      0,      // semitones, -12..12
  distortion: 0,      // 0-100 (warp)
  filterOn:   false,
  filterFreq: 4000,   // Hz
  filterType: 'lowpass', // lowpass | highpass | bandpass | notch
  volume:     0.9,    // 0-1.5
  pan:        0,       // -1..1
  reverse:    false,
  loop:       false,
  inMix:      false,

  // Pitch / time
  jitter:     0,      // 0-100 — random pitch drift
  vibrato:    0,      // 0-100

  // Modulation
  ringMod:    0,      // 0-100
  tremolo:    0,      // 0-100
  chorus:     0,      // 0-100
  flanger:    0,      // 0-100

  // Filter movement
  wobble:     0,      // 0-100 — auto-wah (needs filterOn)

  // Lo-fi / destruction
  bitcrush:   0,      // 0-100
  srReduce:   0,      // 0-100
  noise:      0,      // 0-100 — hiss overlay

  // Structural / glitch
  stutter:      0,      // 0-100 (0 = off)
  freeze:       false,
  scramble:     0,      // 0-100 (0 = off)
  beatRepeat:   0,      // 0-100 (0 = off) — quantized loop-roll
  grainScatter: 0,      // 0-100 (0 = off) — randomized grain shuffle
  reverseSwell: false,  // reversed swell intro into the hit

  // Motion / dynamics
  autoPan:  0,          // 0-100 — LFO pan sweep
  gateChop: 0,          // 0-100 — rhythmic on/off gate
  pump:     0,          // 0-100 — sidechain-style ducking pulse
  compress: 0,          // 0-100 — compressor/limiter

  // Pitch / harmony extras
  harmonize: 0,         // 0-100 — mixes in a +7 semitone duplicate voice
  formant:   0,         // 0-100 — formant/vocal-timbre shift
  pitchStep: 0,         // 0-100 — quantized random pitch stepper
  wow:       0,         // 0-100 — tape wow & flutter

  // Tone extras
  phaser:    0,         // 0-100
  comb:      0,         // 0-100 — metallic resonator
  talkbox:   0,         // 0-100 — envelope-follower auto-wah
  radioTune: 0,         // 0-100 — sweeping bandpass "tuning" sweep

  // EQ
  lowShelf:  0,         // -12..12 dB — bass tilt
  highShelf: 0,         // -12..12 dB — treble tilt
  midEQ:     0,         // -12..12 dB — sweepable mid presence/scoop

  // Space
  haas:        0,       // 0-100 — stereo widener
  reverbSend:  0,       // 0-100 — this sound's own send into the master reverb
  delaySend:   0,       // 0-100 — this sound's own send into the master echo
  stereoWidth: 0,       // 0-100 — mid/side widener

  // Lo-fi extras
  vinylCrackle: 0,      // 0-100 — sparse clicks & pops overlay
  clipFuzz:     0,      // 0-100 — hard-clip fuzz distortion
  tapeSat:      0,      // 0-100 — gentle analog-tape saturation warmth

  // Structure extras
  dopplerSweep: 0,      // 0-100 — pitch/pan swoosh, like something passing by

  // Voice extras
  growl:   0,           // 0-100 — sub-octave growl layer
  whisper: 0,           // 0-100 — breathy filtered-noise overlay
  deEss:   0,            // 0-100 — dynamic sibilance ("s"/"sh") tamer

  // Dynamics extras
  noiseGate:    0,       // 0-100 — mutes below a threshold, kills hiss/bleed between hits
  phaseInvert:  false,   // flips polarity 180° — fixes phase cancellation when layering takes

  // Envelope
  fadeIn:  0,            // 0-3000ms — ramps in instead of clicking on
  fadeOut: 0,            // 0-3000ms — ramps out instead of clicking off

  // Trim/crop — percent of the recording's own length, applied before
  // every other structural effect (freeze/stutter/scramble/etc).
  trimStart: 0,          // 0-100
  trimEnd:   100,        // 0-100

  // Pitch quantize — when set, the Pitch fader snaps to the nearest
  // note in this scale instead of any semitone.
  pitchScale: 'chromatic',
};

/* Scale snapping for the Pitch fader — 'chromatic' means no snapping
   (any semitone, as before). */
const SCALES = {
  chromatic:  { label: 'Chromatic',  steps: null },
  major:      { label: 'Major',      steps: [0, 2, 4, 5, 7, 9, 11] },
  minor:      { label: 'Minor',      steps: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: 'Pentatonic', steps: [0, 2, 4, 7, 9] },
};

const snapToScale = (semitone, scaleKey) => {
  const scale = SCALES[scaleKey];
  if (!scale || !scale.steps) return semitone;
  const rounded = Math.round(semitone);
  const octave = Math.floor(rounded / 12);
  const within = ((rounded % 12) + 12) % 12;
  let best = scale.steps[0];
  let bestDist = Infinity;
  scale.steps.forEach(s => {
    const dist = Math.abs(s - within);
    if (dist < bestDist) { bestDist = dist; best = s; }
  });
  return Math.max(-12, Math.min(12, octave * 12 + best));
};

/* Quick-apply combos — layered on top of a sound's current fx. */
const PRESETS = {
  telephone: {
    label: '📞 Telephone',
    fx: { filterOn: true, filterType: 'bandpass', filterFreq: 1800, distortion: 22, bitcrush: 12, srReduce: 18 },
  },
  underwater: {
    label: '🌊 Underwater',
    fx: { filterOn: true, filterType: 'lowpass', filterFreq: 450, pitch: -3, vibrato: 30, chorus: 20 },
  },
  chipmunk: {
    label: '🐿 Chipmunk',
    fx: { pitch: 9, tremolo: 0, srReduce: 0, vibrato: 8 },
  },
  robot: {
    label: '🤖 Robot',
    fx: { formant: 55, bitcrush: 20, gateChop: 35 },
  },
  ghost: {
    label: '👻 Ghost',
    fx: { reverseSwell: true, vibrato: 18 },
  },
  insectSwarm: {
    label: '🐝 Insect Swarm',
    fx: { harmonize: 60, tremolo: 45, pitch: 4 },
  },
  brokenRadio: {
    label: '📻 Broken Radio',
    fx: { radioTune: 60, srReduce: 25, noise: 30 },
  },
};

const pct = (v) => `${v}%`;

/* ── Module rack — every effect param as one colored tile, grouped
   by category. Drives both the colorful grid and the big detail
   panel above it (screenshot-style plugin rack: pick a module in
   the grid, its full control shows up top). ── */
const MODULES = [
  { id: 'volume',       label: 'Volume',       group: 'base',      color: '#38bdf8', kind: 'range', min: 0,    max: 1.3,  step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
  { id: 'pan',          label: 'Pan',          group: 'base',      color: '#38bdf8', kind: 'range', min: -1,   max: 1,    step: 0.05, fmt: v => v.toFixed(2) },
  { id: 'phaseInvert',  label: 'Phase',        group: 'base',      color: '#38bdf8', kind: 'toggle' },
  { id: 'fadeIn',       label: 'Fade In',      group: 'base',      color: '#38bdf8', kind: 'range', min: 0,    max: 3000, step: 50,  fmt: v => `${(v / 1000).toFixed(2)}s` },
  { id: 'fadeOut',      label: 'Fade Out',     group: 'base',      color: '#38bdf8', kind: 'range', min: 0,    max: 3000, step: 50,  fmt: v => `${(v / 1000).toFixed(2)}s` },

  { id: 'pitch',        label: 'Pitch',        group: 'pitch',     color: '#facc15', kind: 'range', min: -12,  max: 12,   step: 1,    fmt: v => (v > 0 ? `+${v}` : `${v}`) },
  { id: 'jitter',       label: 'Jitter',       group: 'pitch',     color: '#facc15', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'vibrato',      label: 'Vibrato',      group: 'pitch',     color: '#facc15', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'wow',          label: 'Wow',          group: 'pitch',     color: '#facc15', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'pitchStep',    label: 'Pitch Step',   group: 'pitch',     color: '#facc15', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'harmonize',    label: 'Harmonize',    group: 'voice',     color: '#a78bfa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'formant',      label: 'Formant',      group: 'voice',     color: '#a78bfa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'growl',        label: 'Growl',        group: 'voice',     color: '#a78bfa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'whisper',      label: 'Whisper',      group: 'voice',     color: '#a78bfa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'deEss',        label: 'De-Ess',       group: 'voice',     color: '#a78bfa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'ringMod',      label: 'Ring Mod',     group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'tremolo',      label: 'Tremolo',      group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'chorus',       label: 'Chorus',       group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'flanger',      label: 'Flanger',      group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'phaser',       label: 'Phaser',       group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'comb',         label: 'Comb',         group: 'mod',       color: '#60a5fa', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'filterOn',     label: 'Filter',       group: 'filter',    color: '#4ade80', kind: 'toggle' },
  { id: 'filterFreq',   label: 'Freq',         group: 'filter',    color: '#4ade80', kind: 'range', min: 200,  max: 12000, step: 10,  fmt: v => `${v}Hz` },
  { id: 'wobble',       label: 'Wobble',       group: 'filter',    color: '#4ade80', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'talkbox',      label: 'Talk-Box',     group: 'filter',    color: '#4ade80', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'radioTune',    label: 'Radio Tune',   group: 'filter',    color: '#4ade80', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'lowShelf',     label: 'Bass',         group: 'eq',        color: '#2dd4bf', kind: 'range', min: -12,  max: 12,   step: 1,    fmt: v => `${v > 0 ? '+' : ''}${v}dB` },
  { id: 'midEQ',        label: 'Mid',          group: 'eq',        color: '#2dd4bf', kind: 'range', min: -12,  max: 12,   step: 1,    fmt: v => `${v > 0 ? '+' : ''}${v}dB` },
  { id: 'highShelf',    label: 'Treble',       group: 'eq',        color: '#2dd4bf', kind: 'range', min: -12,  max: 12,   step: 1,    fmt: v => `${v > 0 ? '+' : ''}${v}dB` },

  { id: 'haas',         label: 'Haas Width',   group: 'space',     color: '#818cf8', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'stereoWidth',  label: 'Stereo Width', group: 'space',     color: '#818cf8', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'reverbSend',   label: 'Reverb Send',  group: 'space',     color: '#818cf8', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'delaySend',    label: 'Delay Send',   group: 'space',     color: '#818cf8', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'autoPan',      label: 'Auto-Pan',     group: 'motion',    color: '#fb923c', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'gateChop',     label: 'Gate Chop',    group: 'motion',    color: '#fb923c', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'pump',         label: 'Pump',         group: 'motion',    color: '#fb923c', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'compress',     label: 'Compress',     group: 'motion',    color: '#fb923c', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'noiseGate',    label: 'Noise Gate',   group: 'motion',    color: '#fb923c', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'distortion',   label: 'Warp',         group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'clipFuzz',     label: 'Fuzz',         group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'bitcrush',     label: 'Crush',        group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'srReduce',     label: 'Lo-Rate',      group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'noise',        label: 'Noise',        group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'vinylCrackle', label: 'Vinyl Crackle', group: 'lofi',     color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'tapeSat',      label: 'Tape Sat',     group: 'lofi',      color: '#f87171', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },

  { id: 'stutter',      label: 'Stutter',      group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'beatRepeat',   label: 'Beat Repeat',  group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'scramble',     label: 'Scramble',     group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'grainScatter', label: 'Grain Scatter', group: 'structure', color: '#f472b6', kind: 'range', min: 0,   max: 100,  step: 1,    fmt: pct },
  { id: 'dopplerSweep', label: 'Doppler',      group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,    fmt: pct },
  { id: 'freeze',       label: 'Freeze',       group: 'structure', color: '#f472b6', kind: 'toggle' },
  { id: 'reverse',      label: 'Reverse',      group: 'structure', color: '#f472b6', kind: 'toggle' },
  { id: 'reverseSwell', label: 'Rev. Swell',   group: 'structure', color: '#f472b6', kind: 'toggle' },
  { id: 'loop',         label: 'Loop',         group: 'structure', color: '#f472b6', kind: 'toggle' },
  { id: 'trimStart',    label: 'Trim Start',   group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,   fmt: pct },
  { id: 'trimEnd',      label: 'Trim End',     group: 'structure', color: '#f472b6', kind: 'range', min: 0,    max: 100,  step: 1,   fmt: pct },
];

/* Randomizable range-module ids — everything except structural
   on/off toggles that would clash with each other if fired at once. */
const RANDOMIZABLE_IDS = MODULES.filter(m => m.kind === 'range').map(m => m.id);

/* Section labels + display order for the effects board — matches
   the `group` key set on each MODULES entry above. */
const GROUP_LABELS = {
  base:      'Basics',
  pitch:     'Pitch & Time',
  voice:     'Voice',
  mod:       'Modulation',
  filter:    'Filter & Wah',
  eq:        'EQ',
  space:     'Space & Width',
  motion:    'Motion & Dynamics',
  lofi:      'Lo-Fi & Distortion',
  structure: 'Structure & Glitch',
};
/* Explicit render order (rather than MODULES insertion order) so the
   side-by-side card layout wraps into predictable rows: EQ up on
   row 1, Lo-Fi & Distortion pulled up to row 2, Modulation and
   Filter & Wah pushed down to row 3. */
const GROUP_ORDER = ['base', 'pitch', 'voice', 'eq', 'lofi', 'space', 'motion', 'structure', 'mod', 'filter'];

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload  = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const formatMMSS = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/* Vertical channel-strip fader — value on top, metallic slider in the
   middle (raising the value visually raises the fader), label below. */
function Fader({ label, value, display, min, max, step, onChange, disabled, onDragStart }) {
  return (
    <div className={`sc-fader${disabled ? ' disabled' : ''}`}>
      <div className="sc-fader-val">{display}</div>
      <div className="sc-fader-track">
        <input
          className="sc-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={onChange}
          onPointerDown={onDragStart}
        />
      </div>
      <div className="sc-fader-lbl">{label}</div>
    </div>
  );
}

/* ── Mixing/monitoring aids ─────────────────────────────────────
   Waveform: static peak-envelope render of a decoded AudioBuffer,
   drawn once per buffer at a fixed internal resolution and stretched
   to fill its container via CSS — no ResizeObserver needed.
   WaveformPreview: lazily fetches+decodes a sound's buffer (reusing
   the parent's cached getBuffer) then hands it to Waveform.
   PeakMeter: live rAF-driven peak bar fed by a Web Audio AnalyserNode
   tap — used for the master bus and for whichever sound is playing. */
function Waveform({ buffer, color = '#a78bfa' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const W = 300, H = 40;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / W));
    const mid = H / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < W; i++) {
      let min = 1, max = -1;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j++) {
        const v = data[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min > max) { min = 0; max = 0; }
      ctx.moveTo(i + 0.5, mid + min * mid);
      ctx.lineTo(i + 0.5, mid + max * mid);
    }
    ctx.stroke();
  }, [buffer, color]);

  return <canvas ref={canvasRef} className="sc-waveform" />;
}

function WaveformPreview({ sound, getBuffer, color }) {
  const [buffer, setBuffer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    if (!sound) return undefined;
    getBuffer(sound).then(buf => { if (!cancelled) setBuffer(buf); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sound, getBuffer]);

  if (!buffer) return <div className="sc-waveform sc-waveform-loading" />;
  return <Waveform buffer={buffer} color={color} />;
}

function PeakMeter({ analyser, active, vertical = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const dctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    if (!active || !analyser) {
      dctx.clearRect(0, 0, W, H);
      return undefined;
    }

    const data = new Uint8Array(analyser.fftSize);
    let raf = null;
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      const level = Math.min(1, peak * 1.4);
      dctx.clearRect(0, 0, W, H);
      const color = level > 0.85 ? '#f87171' : level > 0.6 ? '#fbbf24' : '#4ade80';
      dctx.fillStyle = color;
      if (vertical) {
        const barH = Math.round(level * H);
        dctx.fillRect(0, H - barH, W, barH);
      } else {
        const barW = Math.round(level * W);
        dctx.fillRect(0, 0, barW, H);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [analyser, active, vertical]);

  return (
    <canvas
      ref={canvasRef}
      width={vertical ? 8 : 46}
      height={vertical ? 40 : 8}
      className={`sc-peak-meter ${vertical ? 'vertical' : 'horizontal'}`}
    />
  );
}

export default function SoundCreator() {
  const { user } = useAuth();

  const [sounds, setSounds] = useUserStoreKey('soundcreator:sounds', []);
  const [playingIds, setPlayingIds] = useState(() => new Set());
  const [mixPlaying, setMixPlaying] = useState(false);

  const [recState, setRecState]   = useState('idle'); // idle | recording-sound | recording-mix | review
  const [recElapsed, setRecElapsed] = useState(0);
  const [recError, setRecError]   = useState(null);
  const [pendingRec, setPendingRec]   = useState(null); // { dataUrl, duration }
  const [pendingKind, setPendingKind] = useState(null); // 'sound' | 'mix'
  const [pendingName, setPendingName] = useState('');

  const [roomAmt, setRoomAmt] = useState(15);
  const [echoAmt, setEchoAmt] = useState(0);
  const [pingPongAmt, setPingPongAmt] = useState(0);
  const [screechAmt, setScreechAmt] = useState(0);
  const [masterVol, setMasterVol] = useState(0.9);
  const [limiterOn, setLimiterOn] = useState(false);

  const [armedDeleteId, setArmedDeleteId] = useState(null);
  const [savedToStems, setSavedToStems] = useUserStoreKey('soundcreator:to-stems', {});
  const [stemsStatus, setStemsStatus] = useState(null);

  const [selectedId, setSelectedId]   = useState(null); // sound currently open in the top FX board
  const [expandedIds, setExpandedIds] = useState(() => new Set()); // rows expanded to show In Mix / Stems
  const [titleDrafts, setTitleDrafts] = useState({}); // id → in-progress renamed text


  const recorderCtrlRef = useRef(null);
  const recTimerRef     = useRef(null);
  const pendingBufferRef = useRef(null);
  const bufferCacheRef   = useRef(new Map()); // id (or id:rev) → AudioBuffer
  const playingHandlesRef = useRef(new Map()); // id → { stop }
  const autoStopTimersRef = useRef(new Map()); // id → timeout id
  const stemsTimerRef = useRef(null);

  useEffect(() => { applyReverb(roomAmt / 100); }, [roomAmt]);
  useEffect(() => { applyDelay(echoAmt / 100, 0.32, 0.4); }, [echoAmt]);
  useEffect(() => { applyPingPong(pingPongAmt / 100, 0.28); }, [pingPongAmt]);
  useEffect(() => { applyScreech(screechAmt); }, [screechAmt]);
  useEffect(() => { setMasterVolume(masterVol); }, [masterVol]);
  useEffect(() => { applyLimiter(limiterOn); }, [limiterOn]);
  useEffect(() => { setFxBypass(false); }, [selectedId]);

  useEffect(() => () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    playingHandlesRef.current.forEach(h => { try { h.stop(); } catch { /* noop */ } });
    autoStopTimersRef.current.forEach(t => clearTimeout(t));
  }, []);

  const showStemsStatus = (kind, text, ms = 2500) => {
    setStemsStatus({ kind, text });
    if (stemsTimerRef.current) clearTimeout(stemsTimerRef.current);
    stemsTimerRef.current = setTimeout(() => setStemsStatus(null), ms);
  };

  /* ── Buffer loading / caching ─────────────────────────────── */
  const getBuffer = async (sound) => {
    if (bufferCacheRef.current.has(sound.id)) return bufferCacheRef.current.get(sound.id);
    const res = await fetch(sound.audioUrl);
    const arr = await res.arrayBuffer();
    const buf = await decodeAudio(arr);
    bufferCacheRef.current.set(sound.id, buf);
    return buf;
  };

  const getReversed = (sound, buf) => {
    const key = `${sound.id}:rev`;
    if (bufferCacheRef.current.has(key)) return bufferCacheRef.current.get(key);
    const rev = reverseBuffer(buf);
    bufferCacheRef.current.set(key, rev);
    return rev;
  };

  /* Structural transforms recompute each play since their intensity can
     change live — cheap for short clips. Priority: freeze > beatRepeat >
     stutter > grainScatter > scramble > reverseSwell. */
  const applyStructural = (sound, buf) => {
    const trimmed = (sound.fx.trimStart > 0 || sound.fx.trimEnd < 100)
      ? buildTrimBuffer(buf, sound.fx.trimStart, sound.fx.trimEnd)
      : buf;
    if (sound.fx.freeze) return buildFreezeBuffer(trimmed, 60);
    if (sound.fx.beatRepeat > 0) return buildBeatRepeatBuffer(trimmed, sound.fx.beatRepeat);
    if (sound.fx.stutter > 0) return buildStutterBuffer(trimmed, sound.fx.stutter);
    if (sound.fx.grainScatter > 0) return buildGrainScatterBuffer(trimmed, sound.fx.grainScatter);
    if (sound.fx.scramble > 0) return buildScrambleBuffer(trimmed, sound.fx.scramble);
    if (sound.fx.reverseSwell) return buildReverseSwellBuffer(trimmed);
    return trimmed;
  };

  const fxToPlayOpts = (sound, rate) => ({
    pitch:      rate,
    distortion: sound.fx.distortion,
    filterOn:   sound.fx.filterOn,
    filterFreq: sound.fx.filterOn ? sound.fx.filterFreq : 0,
    filterType: sound.fx.filterType,
    volume:     sound.fx.volume,
    pan:        sound.fx.pan,
    loop:       sound.fx.loop || sound.fx.freeze,
    jitter:     sound.fx.jitter,
    vibrato:    sound.fx.vibrato,
    ringMod:    sound.fx.ringMod,
    tremolo:    sound.fx.tremolo,
    chorus:     sound.fx.chorus,
    flanger:    sound.fx.flanger,
    wobble:     sound.fx.wobble,
    bitcrush:   sound.fx.bitcrush,
    srReduce:   sound.fx.srReduce,
    noise:      sound.fx.noise,
    autoPan:    sound.fx.autoPan,
    gateChop:   sound.fx.gateChop,
    pump:       sound.fx.pump,
    compress:   sound.fx.compress,
    harmonize:  sound.fx.harmonize,
    formant:    sound.fx.formant,
    pitchStep:  sound.fx.pitchStep,
    wow:        sound.fx.wow,
    phaser:     sound.fx.phaser,
    comb:       sound.fx.comb,
    talkbox:    sound.fx.talkbox,
    radioTune:  sound.fx.radioTune,
    haas:       sound.fx.haas,
    lowShelf:     sound.fx.lowShelf,
    highShelf:    sound.fx.highShelf,
    midEQ:        sound.fx.midEQ,
    reverbSend:   sound.fx.reverbSend,
    delaySend:    sound.fx.delaySend,
    stereoWidth:  sound.fx.stereoWidth,
    vinylCrackle: sound.fx.vinylCrackle,
    clipFuzz:     sound.fx.clipFuzz,
    tapeSat:      sound.fx.tapeSat,
    dopplerSweep: sound.fx.dopplerSweep,
    growl:        sound.fx.growl,
    whisper:      sound.fx.whisper,
    deEss:        sound.fx.deEss,
    noiseGate:    sound.fx.noiseGate,
    phaseInvert:  sound.fx.phaseInvert,
    fadeIn:       sound.fx.fadeIn,
    fadeOut:      sound.fx.fadeOut,
  });

  /* ── Single-sound playback ────────────────────────────────── */
  const stopSound = (id) => {
    const h = playingHandlesRef.current.get(id);
    if (h) { try { h.stop(); } catch { /* noop */ } playingHandlesRef.current.delete(id); }
    const t = autoStopTimersRef.current.get(id);
    if (t) { clearTimeout(t); autoStopTimersRef.current.delete(id); }
    setPlayingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const playSound = async (sound, bypass = false) => {
    try {
      const buf = await getBuffer(sound);
      let useBuf, opts, rate;
      if (bypass) {
        // A/B "dry" preview — raw recorded buffer, only volume/pan kept.
        useBuf = buf;
        rate = 1;
        opts = { pitch: 1, volume: sound.fx.volume, pan: sound.fx.pan, loop: false };
      } else {
        const preReverse = sound.fx.reverse ? getReversed(sound, buf) : buf;
        useBuf = applyStructural(sound, preReverse);
        rate = Math.pow(2, sound.fx.pitch / 12);
        opts = fxToPlayOpts(sound, rate);
      }
      const handle = playBuffer(useBuf, opts);
      playingHandlesRef.current.set(sound.id, handle);
      setPlayingIds(prev => new Set(prev).add(sound.id));
      if (bypass || (!sound.fx.loop && !sound.fx.freeze)) {
        const estMs = (useBuf.duration / rate) * 1000 + 60;
        const t = setTimeout(() => stopSound(sound.id), estMs);
        autoStopTimersRef.current.set(sound.id, t);
      }
    } catch (err) {
      console.error('Playback failed', err);
    }
  };

  const togglePlay = (sound) => {
    if (playingIds.has(sound.id)) stopSound(sound.id);
    else playSound(sound);
  };

  /* ── FX-view preview (Play/Stop + A/B bypass for whichever
     recording is currently open on the effects board) ─────────── */
  const [fxBypass, setFxBypass] = useState(false);

  const toggleSelectedPreview = (sound) => {
    if (!sound) return;
    if (playingIds.has(sound.id)) stopSound(sound.id);
    else playSound(sound, fxBypass);
  };

  const toggleBypass = (sound) => {
    setFxBypass(prev => {
      const next = !prev;
      if (sound && playingIds.has(sound.id)) {
        stopSound(sound.id);
        playSound(sound, next);
      }
      return next;
    });
  };

  /* ── Mix playback ──────────────────────────────────────────── */
  const inMixSounds = sounds.filter(s => s.fx.inMix);

  const playAllMix = async () => {
    if (!inMixSounds.length) return;
    const bufs = await Promise.all(inMixSounds.map(async s => {
      const buf = await getBuffer(s);
      const preReverse = s.fx.reverse ? getReversed(s, buf) : buf;
      return applyStructural(s, preReverse);
    }));
    inMixSounds.forEach((s, i) => {
      const rate = Math.pow(2, s.fx.pitch / 12);
      const handle = playBuffer(bufs[i], fxToPlayOpts(s, rate));
      playingHandlesRef.current.set(s.id, handle);
    });
    setPlayingIds(new Set(inMixSounds.map(s => s.id)));
    setMixPlaying(true);
    const anyLoop = inMixSounds.some(s => s.fx.loop || s.fx.freeze);
    if (!anyLoop) {
      const maxMs = Math.max(...inMixSounds.map((s, i) => (bufs[i].duration / Math.pow(2, s.fx.pitch / 12)) * 1000)) + 60;
      const t = setTimeout(() => stopAllMix(), maxMs);
      autoStopTimersRef.current.set('__mix__', t);
    }
  };

  const stopAllMix = () => {
    playingHandlesRef.current.forEach(h => { try { h.stop(); } catch { /* noop */ } });
    playingHandlesRef.current.clear();
    const t = autoStopTimersRef.current.get('__mix__');
    if (t) { clearTimeout(t); autoStopTimersRef.current.delete('__mix__'); }
    setPlayingIds(new Set());
    setMixPlaying(false);
  };

  const toggleMixPlayback = () => {
    if (mixPlaying) stopAllMix();
    else playAllMix();
  };

  /* ── Recording flows ──────────────────────────────────────── */
  const startElapsedTimer = () => {
    const startedAt = Date.now();
    setRecElapsed(0);
    recTimerRef.current = setInterval(() => setRecElapsed((Date.now() - startedAt) / 1000), 200);
  };
  const stopElapsedTimer = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };

  const startRecordSound = async () => {
    setRecError(null);
    try {
      recorderCtrlRef.current = await startMicRecording();
      setRecState('recording-sound');
      startElapsedTimer();
    } catch (err) {
      console.error('Mic recording failed to start', err);
      setRecError('Couldn\u2019t access the microphone — check permissions and try again.');
    }
  };

  const stopRecordSound = async () => {
    stopElapsedTimer();
    if (!recorderCtrlRef.current) { setRecState('idle'); return; }
    try {
      const { blob, duration } = await recorderCtrlRef.current.stop();
      recorderCtrlRef.current = null;
      const [dataUrl, buffer] = await Promise.all([blobToDataUrl(blob), decodeAudio(blob)]);
      pendingBufferRef.current = buffer;
      setPendingRec({ dataUrl, duration });
      setPendingKind('sound');
      setPendingName(`Weird Sound ${sounds.filter(s => !s.isMix).length + 1}`);
      setRecState('review');
    } catch (err) {
      console.error('Recording failed', err);
      setRecError('Recording failed — try again.');
      setRecState('idle');
    }
  };

  const startRecordMix = async () => {
    if (!inMixSounds.length) return;
    setRecError(null);
    recorderCtrlRef.current = startBusRecording();
    setRecState('recording-mix');
    startElapsedTimer();
    await playAllMix();
  };

  const stopRecordMix = async () => {
    stopElapsedTimer();
    stopAllMix();
    if (!recorderCtrlRef.current) { setRecState('idle'); return; }
    try {
      const { blob, duration } = await recorderCtrlRef.current.stop();
      recorderCtrlRef.current = null;
      const [dataUrl, buffer] = await Promise.all([blobToDataUrl(blob), decodeAudio(blob)]);
      pendingBufferRef.current = buffer;
      setPendingRec({ dataUrl, duration });
      setPendingKind('mix');
      setPendingName(`Mix ${sounds.filter(s => s.isMix).length + 1}`);
      setRecState('review');
    } catch (err) {
      console.error('Mix recording failed', err);
      setRecError('Mix recording failed — try again.');
      setRecState('idle');
    }
  };

  const saveRecording = async () => {
    if (!pendingRec || !user?.uid) return;
    const isMix = pendingKind === 'mix';
    const name = pendingName.trim() || (isMix ? 'Mix' : 'Weird Sound');
    const id = `snd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const { url, path } = await uploadDataUrl(user.uid, 'soundcreator-sounds', pendingRec.dataUrl, { filename: `${id}.webm` });
      const entry = {
        id,
        name,
        audioUrl:    url,
        storagePath: path,
        duration:    pendingRec.duration,
        createdAt:   new Date().toISOString(),
        isMix,
        fx: { ...DEFAULT_FX },
      };
      if (pendingBufferRef.current) bufferCacheRef.current.set(id, pendingBufferRef.current);
      setSounds(prev => [entry, ...prev]);
      setSelectedId(id);
    } catch (err) {
      console.error('Failed to upload sound', err);
      setRecError('Couldn\u2019t save the recording — try again.');
      return;
    }
    discardRecording();
  };

  const discardRecording = () => {
    setPendingRec(null);
    setPendingName('');
    setPendingKind(null);
    pendingBufferRef.current = null;
    setRecElapsed(0);
    setRecState('idle');
  };

  /* ── Effects editing / delete ─────────────────────────────── */
  const updateFx = (id, key, val) => {
    setSounds(prev => prev.map(s => (s.id === id ? { ...s, fx: { ...s.fx, [key]: val } } : s)));
  };

  const applyPreset = (id, key) => {
    const preset = PRESETS[key];
    if (!preset) return;
    setSounds(prev => prev.map(s => (s.id === id ? { ...s, fx: { ...s.fx, ...preset.fx } } : s)));
  };

  /* Panic button — rolls fresh random values for a handful of range
     modules (never all of them, or every sound would sound identical
     chaos) for quick happy-accident discovery. */
  const randomizeFx = (id) => {
    const picks = [...RANDOMIZABLE_IDS].sort(() => Math.random() - 0.5).slice(0, 6 + Math.floor(Math.random() * 6));
    const patch = {};
    picks.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId);
      if (!mod) return;
      const steps = Math.round((mod.max - mod.min) / mod.step);
      const val = mod.min + Math.round(Math.random() * steps) * mod.step;
      patch[modId] = mod.step < 1 ? Math.round(val * 100) / 100 : val;
    });
    if (Math.random() < 0.5) patch.filterOn = true;
    setSounds(prev => prev.map(s => (s.id === id ? { ...s, fx: { ...s.fx, ...patch } } : s)));
  };

  /* ── Undo (per-sound fx history) ──────────────────────────────
     A snapshot of a sound's fx is pushed right before each edit
     (fader drag-start, toggle click, preset/randomize/paste) so
     Undo reverts to how it sounded before that action. */
  const [undoStacks, setUndoStacks] = useState({}); // id → fx[] (snapshots, oldest first)

  const pushUndo = (sound) => {
    if (!sound) return;
    setUndoStacks(prev => {
      const stack = prev[sound.id] || [];
      return { ...prev, [sound.id]: [...stack, sound.fx].slice(-25) };
    });
  };

  const undoFx = (sound) => {
    if (!sound) return;
    const stack = undoStacks[sound.id];
    if (!stack || !stack.length) return;
    const restored = stack[stack.length - 1];
    setUndoStacks(prev => ({ ...prev, [sound.id]: stack.slice(0, -1) }));
    setSounds(prev => prev.map(s => (s.id === sound.id ? { ...s, fx: restored } : s)));
  };

  /* ── Copy/paste a whole fx chain from one recording to another ── */
  const copiedFxRef = useRef(null);
  const [hasCopiedFx, setHasCopiedFx] = useState(false);

  const copyFx = (sound) => {
    if (!sound) return;
    const { inMix, ...rest } = sound.fx; // don't drag mix-routing along with the "sound"
    copiedFxRef.current = rest;
    setHasCopiedFx(true);
    showStemsStatus('success', `Copied FX from "${sound.name}"`);
  };

  const pasteFx = (sound) => {
    if (!sound || !copiedFxRef.current) return;
    pushUndo(sound);
    setSounds(prev => prev.map(s => (s.id === sound.id ? { ...s, fx: { ...s.fx, ...copiedFxRef.current } } : s)));
    showStemsStatus('success', `Pasted FX onto "${sound.name}"`);
  };

  const deleteSound = (id) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      setTimeout(() => setArmedDeleteId(curr => (curr === id ? null : curr)), 3000);
      return;
    }
    stopSound(id);
    const target = sounds.find(s => s.id === id);
    if (target?.storagePath) deleteBlobAtPath(target.storagePath).catch(() => { /* best effort */ });
    bufferCacheRef.current.delete(id);
    bufferCacheRef.current.delete(`${id}:rev`);
    setSounds(prev => prev.filter(s => s.id !== id));
    setSavedToStems(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    setArmedDeleteId(null);
    setSelectedId(curr => (curr === id ? null : curr));
  };

  /* ── Row collapse / title editing ─────────────────────────── */
  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getTitleValue = (sound) => (titleDrafts[sound.id] !== undefined ? titleDrafts[sound.id] : sound.name);
  const handleTitleChange = (id, val) => setTitleDrafts(prev => ({ ...prev, [id]: val }));
  const commitTitle = (id) => {
    setTitleDrafts(prev => {
      if (!(id in prev)) return prev;
      const val = prev[id].trim();
      if (val) setSounds(sPrev => sPrev.map(s => (s.id === id ? { ...s, name: val } : s)));
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };
  const cancelTitleEdit = (id) => {
    setTitleDrafts(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const handleSaveToStems = async (sound) => {
    if (savedToStems[sound.id]) return;
    const result = await addStemFromRecording({
      name:        sound.name,
      audioUrl:    sound.audioUrl,
      storagePath: sound.storagePath,
      type:        sound.isMix ? 'sound-creator-mix' : 'sound-creator',
      duration:    sound.duration,
      source:      'Sound Creator',
    });
    if (!result.ok) {
      showStemsStatus('error', result.error || 'Could not save to Stems Library.');
      return;
    }
    setSavedToStems(prev => ({ ...prev, [sound.id]: result.stem.id }));
    if (result.warning) showStemsStatus('warn', `Saved — ${result.warning}`, 4000);
    else showStemsStatus('success', 'Saved to Stems Library');
  };

  const recording = recState === 'recording-sound' || recState === 'recording-mix';
  const selectedSound = sounds.find(s => s.id === selectedId) || null;
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <WorshipShell
      title="Sound Creator"
      icon="🌀"
      subtitle="Record weird sounds and mix them into something new."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
    <div className="sc-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {selectedSound ? (
        /* ── Full-page effects board for the selected sound — every
           effect as its own fader in one continuous scroll strip,
           with a Back button to return to the workspace. ─────── */
        <div className="sc-fxview">
          <div className="sc-fxview-head">
            <button type="button" className="sc-fxview-back" onClick={() => setSelectedId(null)}>
              ← Back
            </button>
            <span className="sc-fxview-title">{selectedSound.name}</span>

            <div className="sc-fxview-preview">
              <button
                type="button"
                className={`sc-fxview-play ${playingIds.has(selectedSound.id) ? 'playing' : ''}`}
                onClick={() => toggleSelectedPreview(selectedSound)}
                title={playingIds.has(selectedSound.id) ? 'Stop' : 'Play'}
              >
                {playingIds.has(selectedSound.id) ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className={`sc-fxview-ab ${fxBypass ? 'is-dry' : ''}`}
                onClick={() => toggleBypass(selectedSound)}
                title={fxBypass ? 'Previewing dry (no effects) — click to hear wet' : 'Previewing wet (with effects) — click to hear dry'}
              >
                {fxBypass ? 'A' : 'B'}
              </button>
              <WaveformPreview
                sound={selectedSound}
                getBuffer={getBuffer}
                color={fxBypass ? '#94a3b8' : '#e8871e'}
              />
              <PeakMeter
                analyser={playingHandlesRef.current.get(selectedSound.id)?.analyser}
                active={playingIds.has(selectedSound.id)}
              />
            </div>

            <select
              className="sc-input sc-select sc-fx-preset-select"
              value=""
              onChange={e => {
                if (e.target.value) { pushUndo(selectedSound); applyPreset(selectedSound.id, e.target.value); }
                e.target.value = '';
              }}
            >
              <option value="">Presets…</option>
              {Object.entries(PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="sc-fxview-randomize"
              onClick={() => { pushUndo(selectedSound); randomizeFx(selectedSound.id); }}
              title="Randomize a handful of effects"
            >
              🎲 Randomize
            </button>
            <button
              type="button"
              className="sc-fxview-tool"
              onClick={() => undoFx(selectedSound)}
              disabled={!(undoStacks[selectedSound.id]?.length)}
              title="Undo the last effects change"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="sc-fxview-tool"
              onClick={() => copyFx(selectedSound)}
              title="Copy this recording's whole fx chain"
            >
              📋 Copy FX
            </button>
            <button
              type="button"
              className="sc-fxview-tool"
              onClick={() => pasteFx(selectedSound)}
              disabled={!hasCopiedFx}
              title="Paste the copied fx chain onto this recording"
            >
              📥 Paste FX
            </button>
          </div>

          <div className="sc-fx-sections">
            {GROUP_ORDER.map(group => (
              <div key={group} className="sc-fx-section">
                <div className="sc-fx-section-title">{GROUP_LABELS[group] || group}</div>
                <div className="sc-fx-strip">
                  {MODULES.filter(mod => mod.group === group).map(mod => {
                    const raw = selectedSound.fx[mod.id];
                    const val = raw !== undefined ? raw : (mod.kind === 'toggle' ? false : (DEFAULT_FX[mod.id] ?? (mod.min ?? 0)));
                    if (mod.kind === 'toggle') {
                      return (
                        <div key={mod.id} className="sc-fader">
                          <div className="sc-fader-val">{val ? 'ON' : 'OFF'}</div>
                          <div className="sc-fader-track sc-fader-track-toggle">
                            <button
                              type="button"
                              className={`sc-fx-toggle-btn ${val ? 'on' : ''}`}
                              onClick={() => { pushUndo(selectedSound); updateFx(selectedSound.id, mod.id, !val); }}
                            />
                          </div>
                          <div className="sc-fader-lbl">{mod.label}</div>
                        </div>
                      );
                    }
                    return (
                      <Fader
                        key={mod.id}
                        label={mod.label}
                        display={mod.fmt(val)}
                        min={mod.min} max={mod.max} step={mod.step}
                        value={val}
                        disabled={mod.id === 'filterFreq' && !selectedSound.fx.filterOn}
                        onDragStart={() => pushUndo(selectedSound)}
                        onChange={e => {
                          const parsed = mod.step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                          const finalVal = mod.id === 'pitch' ? snapToScale(parsed, selectedSound.fx.pitchScale) : parsed;
                          updateFx(selectedSound.id, mod.id, finalVal);
                        }}
                      />
                    );
                  })}
                  {group === 'pitch' && (
                    <div className="sc-fader sc-fader-select-wrap">
                      <div className="sc-fader-val">&nbsp;</div>
                      <div className="sc-fader-track">
                        <select
                          className="sc-input sc-select sc-fx-filtertype-select"
                          value={selectedSound.fx.pitchScale}
                          onChange={e => {
                            pushUndo(selectedSound);
                            const newScale = e.target.value;
                            const resnapped = snapToScale(selectedSound.fx.pitch, newScale);
                            setSounds(prev => prev.map(s => (s.id === selectedSound.id
                              ? { ...s, fx: { ...s.fx, pitchScale: newScale, pitch: resnapped } }
                              : s)));
                          }}
                        >
                          {Object.entries(SCALES).map(([key, s]) => (
                            <option key={key} value={key}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="sc-fader-lbl">Pitch Scale</div>
                    </div>
                  )}
                  {group === 'filter' && selectedSound.fx.filterOn && (
                    <div className="sc-fader sc-fader-select-wrap">
                      <div className="sc-fader-val">&nbsp;</div>
                      <div className="sc-fader-track">
                        <select
                          className="sc-input sc-select sc-fx-filtertype-select"
                          value={selectedSound.fx.filterType}
                          onChange={e => { pushUndo(selectedSound); updateFx(selectedSound.id, 'filterType', e.target.value); }}
                        >
                          <option value="lowpass">LP</option>
                          <option value="highpass">HP</option>
                          <option value="bandpass">BP</option>
                          <option value="notch">Notch</option>
                        </select>
                      </div>
                      <div className="sc-fader-lbl">Filter Type</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Workspace: Record + Mixer console on the left, sound
           library on the right. ─────────────────────────────── */
        <div className="sc-workspace">
          <div className="sc-console">
            <section className="sc-console-section">
              <div className="sc-board-col-title">Record</div>
              {recError && <div className="sc-error">{recError}</div>}

              {recState === 'idle' && (
                <button type="button" className="sc-rec-btn" onClick={startRecordSound}>
                  <span className="sc-rec-dot"/>
                  Record a Weird Sound
                </button>
              )}
              {recState === 'recording-sound' && (
                <button type="button" className="sc-rec-btn recording" onClick={stopRecordSound}>
                  <span className="sc-rec-dot pulsing"/>
                  Stop · {formatMMSS(recElapsed)}
                </button>
              )}
              {recState === 'recording-mix' && (
                <button type="button" className="sc-rec-btn recording" onClick={stopRecordMix}>
                  <span className="sc-rec-dot pulsing"/>
                  Recording Mix · {formatMMSS(recElapsed)}
                </button>
              )}

              {recState === 'review' && pendingRec && (
                <div className="sc-save-row">
                  <div className="sc-field-lbl">
                    Save this {pendingKind === 'mix' ? 'mix' : 'sound'}?
                  </div>
                  <input
                    className="sc-input"
                    placeholder="Name…"
                    value={pendingName}
                    onChange={e => setPendingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  saveRecording();
                      if (e.key === 'Escape') discardRecording();
                    }}
                    autoFocus
                  />
                  <div className="sc-field-val">{formatMMSS(pendingRec.duration)}</div>
                  <div className="sc-save-btns">
                    <button className="sc-btn ghost"   onClick={discardRecording}>Discard</button>
                    <button className="sc-btn primary" onClick={saveRecording}>Save</button>
                  </div>
                </div>
              )}

              <div className="sc-board-col-title mt">Mixer</div>
              <div className="sc-field-val sc-mix-count">
                {inMixSounds.length === 0
                  ? 'No sounds added to the mix yet'
                  : `${inMixSounds.length} sound${inMixSounds.length === 1 ? '' : 's'} in the mix`}
              </div>
              <div className="sc-mix-btns">
                <button
                  type="button"
                  className={`sc-btn ${mixPlaying ? 'primary' : ''}`}
                  onClick={toggleMixPlayback}
                  disabled={!inMixSounds.length || recState === 'recording-sound'}
                >
                  {mixPlaying ? '■ Stop Mix' : '▶ Play Mix'}
                </button>
                {recState !== 'recording-mix' ? (
                  <button
                    type="button"
                    className="sc-btn"
                    onClick={startRecordMix}
                    disabled={!inMixSounds.length || recording}
                  >
                    ⏺ Record Mix
                  </button>
                ) : (
                  <button type="button" className="sc-btn primary" onClick={stopRecordMix}>
                    ■ Stop & Save
                  </button>
                )}
              </div>
            </section>

            <section className="sc-console-section">
              <div className="sc-board-col-title">Master Bus</div>
              <div className="sc-fader-group">
                <Fader
                  label="Room" display={`${roomAmt}%`}
                  min={0} max={100} step={1} value={roomAmt}
                  onChange={e => setRoomAmt(parseInt(e.target.value, 10))}
                />
                <Fader
                  label="Echo" display={`${echoAmt}%`}
                  min={0} max={100} step={1} value={echoAmt}
                  onChange={e => setEchoAmt(parseInt(e.target.value, 10))}
                />
                <Fader
                  label="Ping-Pong" display={`${pingPongAmt}%`}
                  min={0} max={100} step={1} value={pingPongAmt}
                  onChange={e => setPingPongAmt(parseInt(e.target.value, 10))}
                />
                <Fader
                  label="Screech" display={`${screechAmt}%`}
                  min={0} max={100} step={1} value={screechAmt}
                  onChange={e => setScreechAmt(parseInt(e.target.value, 10))}
                />
                <Fader
                  label="Volume" display={`${Math.round(masterVol * 100)}%`}
                  min={0} max={1.3} step={0.01} value={masterVol}
                  onChange={e => setMasterVol(parseFloat(e.target.value))}
                />
                <div className="sc-fader">
                  <div className="sc-fader-val">{limiterOn ? 'ON' : 'OFF'}</div>
                  <div className="sc-fader-track sc-fader-track-toggle">
                    <button
                      type="button"
                      className={`sc-fx-toggle-btn ${limiterOn ? 'on' : ''}`}
                      onClick={() => setLimiterOn(v => !v)}
                      title="Brickwall limiter — prevents master bus clipping"
                    />
                  </div>
                  <div className="sc-fader-lbl">Limiter</div>
                </div>
                <div className="sc-fader sc-fader-meter">
                  <PeakMeter analyser={getMasterAnalyser()} active vertical />
                  <div className="sc-fader-lbl">Level</div>
                </div>
              </div>

              {stemsStatus && (
                <div className={`sc-stems-toast ${stemsStatus.kind}`} role="status">
                  {stemsStatus.text}
                </div>
              )}
            </section>
          </div>

          {/* ── Sound library ─────────────────────────────────── */}
          <main className="sc-library">
            <header className="sc-header">
              <div className="sc-title">
                <span className="sc-title-icon">🌀</span>
                <div>
                  <h1 className="sc-title-text">Sound Library</h1>
                  <p className="sc-title-sub">{sounds.length} recorded sound{sounds.length === 1 ? '' : 's'}</p>
                </div>
              </div>
            </header>

            {sounds.length === 0 ? (
              <div className="sc-empty">No weird sounds yet — hit record to capture one.</div>
            ) : (
              <div className="sc-list">
                {sounds.map(sound => {
                  const isPlaying  = playingIds.has(sound.id);
                  const isArmed    = armedDeleteId === sound.id;
                  const inLibrary  = Boolean(savedToStems[sound.id]);
                  const isExpanded = expandedIds.has(sound.id);
                  const isSelected = selectedId === sound.id;
                  return (
                    <div key={sound.id} className={`sc-row ${isSelected ? 'selected' : ''} ${sound.fx.inMix ? 'in-mix' : ''}`}>
                      <div className="sc-row-head">
                        <button
                          type="button"
                          className="sc-row-chevron"
                          onClick={() => toggleExpand(sound.id)}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                        <span className="sc-row-icon">{sound.isMix ? '🌀' : '🎙'}</span>
                        <input
                          className="sc-row-title-input"
                          value={getTitleValue(sound)}
                          onChange={e => handleTitleChange(sound.id, e.target.value)}
                          onBlur={() => commitTitle(sound.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  e.currentTarget.blur();
                            if (e.key === 'Escape') { cancelTitleEdit(sound.id); e.currentTarget.blur(); }
                          }}
                        />
                        <span className="sc-row-meta">{formatMMSS(sound.duration)}</span>
                        <button
                          type="button"
                          className={`sc-play-btn sm ${isPlaying ? 'playing' : ''}`}
                          onClick={() => togglePlay(sound)}
                          title={isPlaying ? 'Stop' : 'Play'}
                        >
                          {isPlaying ? '❚❚' : '▶'}
                        </button>
                        <button
                          type="button"
                          className={`sc-row-edit ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedId(sound.id)}
                          title="Edit effects"
                        >
                          🎛
                        </button>
                        <button
                          type="button"
                          className={`sc-card-del ${isArmed ? 'armed' : ''}`}
                          onClick={() => deleteSound(sound.id)}
                          title={isArmed ? 'Click again to confirm' : 'Delete sound'}
                        >
                          {isArmed ? '?' : '✕'}
                        </button>
                      </div>

                      <div className="sc-row-wave">
                        <WaveformPreview sound={sound} getBuffer={getBuffer} color="#a78bfa" />
                        <PeakMeter
                          analyser={playingHandlesRef.current.get(sound.id)?.analyser}
                          active={isPlaying}
                        />
                      </div>

                      {isExpanded && (
                        <div className="sc-row-extra">
                          <label className="sc-mix-toggle">
                            <input
                              type="checkbox"
                              checked={sound.fx.inMix}
                              onChange={e => updateFx(sound.id, 'inMix', e.target.checked)}
                            />
                            In Mix
                          </label>
                          <button
                            type="button"
                            className={`sc-stems-btn ${inLibrary ? 'saved' : ''}`}
                            onClick={() => handleSaveToStems(sound)}
                            title={inLibrary ? 'Already in Stems Library' : 'Save to Stems Library'}
                          >
                            {inLibrary ? '✓ In Stems' : '💾 Save to Stems'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
    <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </WorshipShell>
  );
}
