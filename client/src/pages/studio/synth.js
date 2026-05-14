/* ─────────────────────────────────────────────────────────────
   Studio synth — polyphonic Web Audio instrument engine.
   Pure synthesis, no samples, no dependencies.
   ───────────────────────────────────────────────────────────── */

let _ctx = null;
let _streamDest = null;   // MediaStreamAudioDestinationNode — for recording
let _masterGain = null;   // voices connect here
let _output = null;       // final bus → destination + stream
let _dryGain = null;
let _reverb = null;       // ConvolverNode
let _reverbGain = null;   // wet amount
let _delay = null;        // DelayNode
let _delayFeedback = null;
let _delayGain = null;    // wet amount

/** Build a synthetic impulse response (decaying noise) — no IR file needed. */
const makeImpulseResponse = (ctx, seconds, decay) => {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
};

const getCtx = () => {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Final output bus → speakers + recording stream
    _output = _ctx.createGain();
    _output.gain.value = 1;
    _streamDest = _ctx.createMediaStreamDestination();
    _output.connect(_ctx.destination);
    _output.connect(_streamDest);

    // Voices connect to master
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 1;

    // Dry path
    _dryGain = _ctx.createGain();
    _dryGain.gain.value = 1;
    _masterGain.connect(_dryGain).connect(_output);

    // Reverb send (off by default)
    _reverb = _ctx.createConvolver();
    _reverb.buffer = makeImpulseResponse(_ctx, 2.8, 2.5);
    _reverbGain = _ctx.createGain();
    _reverbGain.gain.value = 0;
    _masterGain.connect(_reverb);
    _reverb.connect(_reverbGain).connect(_output);

    // Delay send (off by default) with feedback loop
    _delay = _ctx.createDelay(2.0);
    _delay.delayTime.value = 0.3;
    _delayFeedback = _ctx.createGain();
    _delayFeedback.gain.value = 0.35;
    _delayGain = _ctx.createGain();
    _delayGain.gain.value = 0;
    _masterGain.connect(_delay);
    _delay.connect(_delayFeedback).connect(_delay);
    _delay.connect(_delayGain).connect(_output);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/** The MediaStream every voice (with effects) is mixed into — feed to MediaRecorder. */
export const getRecordStream = () => {
  getCtx();
  return _streamDest.stream;
};

/* ── Effects control ─────────────────────────────────────────── */
/** amount 0–1 wet mix. */
export const applyReverb = (amount) => {
  getCtx();
  _reverbGain.gain.setTargetAtTime(amount, _ctx.currentTime, 0.05);
};
/** Regenerate the impulse response for a new room size. */
export const applyReverbSize = (seconds, decay) => {
  getCtx();
  _reverb.buffer = makeImpulseResponse(_ctx, seconds, decay);
};
/** amount 0–1 wet mix · timeSec delay time · feedback 0–0.9 */
export const applyDelay = (amount, timeSec, feedback) => {
  getCtx();
  _delayGain.gain.setTargetAtTime(amount, _ctx.currentTime, 0.05);
  if (timeSec != null)  _delay.delayTime.setTargetAtTime(timeSec, _ctx.currentTime, 0.05);
  if (feedback != null) _delayFeedback.gain.setTargetAtTime(feedback, _ctx.currentTime, 0.05);
};

/* ── Note math ───────────────────────────────────────────────── */
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const midiToName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const midiToNoteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];

/* ── Voice presets ───────────────────────────────────────────── */
// Each voice = a set of oscillators + an ADSR envelope (+ optional lowpass).
export const VOICES = {
  piano: {
    oscs: [
      { type: 'triangle', detune: 0 },
      { type: 'triangle', detune: -7, gain: 0.5 },
    ],
    attack: 0.004, decay: 0.55, sustain: 0.22, release: 0.55, filter: 4200,
  },
  epiano: {
    oscs: [
      { type: 'sine', detune: 0 },
      { type: 'sine', harmonic: 2, gain: 0.35 },
      { type: 'sine', harmonic: 3, gain: 0.12 },
    ],
    attack: 0.005, decay: 0.9, sustain: 0.18, release: 0.7,
  },
  organ: {
    oscs: [
      { type: 'sine' },
      { type: 'sine', harmonic: 2, gain: 0.55 },
      { type: 'sine', harmonic: 3, gain: 0.32 },
      { type: 'sine', harmonic: 4, gain: 0.18 },
    ],
    attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.18,
  },
  pad: {
    oscs: [
      { type: 'sawtooth', detune: 6 },
      { type: 'sawtooth', detune: -6 },
    ],
    attack: 0.45, decay: 0.3, sustain: 0.7, release: 1.3, filter: 2200,
  },
  pluck: {
    oscs: [
      { type: 'triangle' },
      { type: 'square', gain: 0.18 },
    ],
    attack: 0.002, decay: 0.28, sustain: 0.0, release: 0.22, filter: 5000,
  },
  bass: {
    oscs: [
      { type: 'sine' },
      { type: 'triangle', gain: 0.4 },
    ],
    attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.3, filter: 1200,
  },
  bells: {
    oscs: [
      { type: 'sine' },
      { type: 'sine', harmonic: 3.5, gain: 0.4 },
      { type: 'sine', harmonic: 5.2, gain: 0.2 },
    ],
    attack: 0.002, decay: 1.6, sustain: 0.0, release: 1.4,
  },
  choir: {
    oscs: [
      { type: 'sawtooth', detune: 6, gain: 0.5 },
      { type: 'sawtooth', detune: -6, gain: 0.5 },
      { type: 'sine', gain: 0.3 },
    ],
    attack: 0.28, decay: 0.2, sustain: 0.85, release: 0.7, filter: 1800,
  },
  brass: {
    oscs: [
      { type: 'sawtooth' },
      { type: 'sawtooth', detune: 8, gain: 0.5 },
    ],
    attack: 0.06, decay: 0.15, sustain: 0.75, release: 0.25, filter: 2600,
  },
  musicbox: {
    oscs: [
      { type: 'sine' },
      { type: 'sine', harmonic: 4, gain: 0.3 },
    ],
    attack: 0.001, decay: 0.95, sustain: 0.0, release: 0.6,
  },
  chip: {
    oscs: [
      { type: 'square' },
    ],
    attack: 0.001, decay: 0.1, sustain: 0.6, release: 0.08,
  },
};

export const VOICE_LIST = [
  { id: 'piano',    label: 'Grand Piano',    emoji: '🎹' },
  { id: 'epiano',   label: 'Electric Piano', emoji: '🎶' },
  { id: 'organ',    label: 'Organ',          emoji: '🎛' },
  { id: 'pad',      label: 'Strings / Pad',  emoji: '🌌' },
  { id: 'pluck',    label: 'Pluck',          emoji: '✦' },
  { id: 'bass',     label: 'Bass',           emoji: '🎸' },
  { id: 'bells',    label: 'Bells',          emoji: '🔔' },
  { id: 'choir',    label: 'Choir Aahs',     emoji: '👐' },
  { id: 'brass',    label: 'Brass',          emoji: '🎺' },
  { id: 'musicbox', label: 'Music Box',      emoji: '🎁' },
  { id: 'chip',     label: '8-Bit',          emoji: '👾' },
];

/** Resolve a voice argument that may be an id string or a full definition object. */
const resolveVoice = (voice) => {
  if (voice && typeof voice === 'object') return voice;
  return VOICES[voice] || VOICES.piano;
};

/** The default editable params of a voice — used by the Voice Editor. */
export const voiceParams = (voice) => {
  const def = resolveVoice(voice);
  return {
    attack:  def.attack,
    decay:   def.decay,
    sustain: def.sustain,
    release: def.release,
    filter:  def.filter || 0,
  };
};

/* ── Play a note ─────────────────────────────────────────────── */
/**
 * Start a note. Returns a handle with `.release()`.
 * @param {number} midi
 * @param {{ voice?: string|object, volume?: number, octaveDouble?: boolean }} opts
 */
export const playNote = (midi, { voice = 'piano', volume = 0.3, octaveDouble = false } = {}) => {
  const ctx = getCtx();
  const def = resolveVoice(voice);
  const now = ctx.currentTime;
  const freq = midiToFreq(midi);

  // envelope gain → (optional filter) → master
  const env = ctx.createGain();
  let tail = env;
  if (def.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = def.filter;
    env.connect(filter);
    tail = filter;
  }
  tail.connect(_masterGain);

  // ADSR
  const peak = Math.max(0.0001, volume);
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peak, now + def.attack);
  env.gain.linearRampToValueAtTime(
    Math.max(0.0001, peak * def.sustain),
    now + def.attack + def.decay
  );

  // Octave doubling — add the same oscillators an octave up at reduced gain
  const oscDefs = octaveDouble
    ? [
        ...def.oscs,
        ...def.oscs.map(o => ({ ...o, harmonic: (o.harmonic || 1) * 2, gain: (o.gain ?? 1) * 0.5 })),
      ]
    : def.oscs;

  const oscs = oscDefs.map(o => {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = freq * (o.harmonic || 1);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    osc.connect(g).connect(env);
    osc.start(now);
    return osc;
  });

  return {
    release() {
      const t = ctx.currentTime;
      try {
        env.gain.cancelAndHoldAtTime(t);
      } catch {
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
      }
      env.gain.linearRampToValueAtTime(0.0001, t + def.release);
      const stopAt = t + def.release + 0.08;
      oscs.forEach(o => { try { o.stop(stopAt); } catch {} });
    },
  };
};

/* ── Music theory ────────────────────────────────────────────── */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export const CHORD_TYPES = {
  maj:  { label: 'Major',      suffix: '',     intervals: [0, 4, 7] },
  min:  { label: 'Minor',      suffix: 'm',    intervals: [0, 3, 7] },
  dim:  { label: 'Diminished', suffix: 'dim',  intervals: [0, 3, 6] },
  aug:  { label: 'Augmented',  suffix: 'aug',  intervals: [0, 4, 8] },
  sus2: { label: 'Sus2',       suffix: 'sus2', intervals: [0, 2, 7] },
  sus4: { label: 'Sus4',       suffix: 'sus4', intervals: [0, 5, 7] },
  dom7: { label: '7th',        suffix: '7',    intervals: [0, 4, 7, 10] },
  maj7: { label: 'Major 7',    suffix: 'maj7', intervals: [0, 4, 7, 11] },
  min7: { label: 'Minor 7',    suffix: 'm7',   intervals: [0, 3, 7, 10] },
};

// Diatonic chord qualities + roman numerals per scale degree
export const DIATONIC = {
  major: {
    quals:  ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
    romans: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  },
  minor: {
    quals:  ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
    romans: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
  },
};
