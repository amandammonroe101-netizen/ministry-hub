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
      { type: 'triangle', detune: -4 },
      { type: 'triangle', detune: 5, gain: 0.75 },
      { type: 'sine', harmonic: 2.006, gain: 0.16 },  // slightly-sharp octave partial → string inharmonicity
      { type: 'sine', harmonic: 4.02,  gain: 0.06 },  // faint high partial → hammer "bite"/shimmer
    ],
    attack: 0.003, decay: 0.4, sustain: 0.14, release: 0.4, filter: 3600,
    // Hammer-strike brightness: the filter snaps open at the strike, then
    // relaxes down to `filter` — the classic piano attack "thonk".
    brightAttack: 2.3, brightDecay: 0.3,
    // String energy keeps bleeding away even while the key is held (a
    // piano note is never a flat sustain) — scaled shorter for treble,
    // longer for bass, in playNote/playNoteExpressive.
    naturalDecay: 3.4,
    // Tiny highpassed noise burst at note-on — the hammer/key-mechanism click.
    hammerNoise: 0.05,
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
    attack:     def.attack,
    decay:      def.decay,
    sustain:    def.sustain,
    release:    def.release,
    filter:     def.filter || 0,
    detune:     def.detune ?? 0,
    brightness: def.brightness ?? 1,
    resonance:  def.resonance ?? 1,
    level:      def.level ?? 1,
  };
};

/** Apply the Detune and Brightness voice-editor params to a voice's oscillator
 *  list. Detune spreads (or narrows) every oscillator after the first —
 *  the fundamental stays put, the "unison" layers move. Brightness scales
 *  the gain of those same secondary layers — 0 isolates the fundamental,
 *  1 is the voice's original mix, up to 2 exaggerates the harmonic content. */
const shapeOscs = (oscDefs, def) => {
  const detune = def.detune ?? 0;
  const brightness = def.brightness ?? 1;
  if (!detune && brightness === 1) return oscDefs;
  return oscDefs.map((o, i) => (
    i === 0
      ? o
      : { ...o, detune: (o.detune || 0) + detune, gain: (o.gain ?? 1) * brightness }
  ));
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
    filter.Q.value = def.resonance ?? 1;
    if (def.brightAttack && def.brightDecay) {
      // Hammer-strike brightness sweep: the filter snaps open at the
      // strike, then relaxes down to the voice's resting cutoff.
      filter.frequency.setValueAtTime(def.filter * def.brightAttack, now);
      filter.frequency.exponentialRampToValueAtTime(def.filter, now + def.brightDecay);
    } else {
      filter.frequency.value = def.filter;
    }
    env.connect(filter);
    tail = filter;
  }
  tail.connect(_masterGain);

  // Lower notes ring longer than treble on a real piano — scale the
  // natural-decay tail and release length by pitch (only applies to
  // voices that opt in via `naturalDecay`).
  const pitchScale = def.naturalDecay ? Math.max(0.35, Math.min(1.6, 220 / freq)) : 1;

  // ADSR
  const peak = Math.max(0.0001, volume * (def.level ?? 1));
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peak, now + def.attack);
  const decayEndTime = now + def.attack + def.decay;
  env.gain.linearRampToValueAtTime(
    Math.max(0.0001, peak * def.sustain),
    decayEndTime
  );
  if (def.naturalDecay) {
    // A piano string keeps bleeding energy even while the key is held —
    // fade on toward silence instead of holding flat at the sustain level.
    env.gain.setTargetAtTime(0.0001, decayEndTime, (def.naturalDecay / 4) * pitchScale);
  }

  // Hammer/key-mechanism click — a tiny highpassed noise burst at note-on.
  if (def.hammerNoise) {
    const dur = 0.012;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.value = peak * def.hammerNoise;
    src.connect(hp).connect(ng).connect(_masterGain);
    src.start(now);
    src.stop(now + dur + 0.005);
  }

  // Octave doubling — add the same oscillators an octave up at reduced gain
  const shapedOscs = shapeOscs(def.oscs, def);
  const oscDefs = octaveDouble
    ? [
        ...shapedOscs,
        ...shapedOscs.map(o => ({ ...o, harmonic: (o.harmonic || 1) * 2, gain: (o.gain ?? 1) * 0.5 })),
      ]
    : shapedOscs;

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
      const releaseTime = def.release * pitchScale;
      env.gain.linearRampToValueAtTime(0.0001, t + releaseTime);
      const stopAt = t + releaseTime + 0.08;
      oscs.forEach(o => { try { o.stop(stopAt); } catch {} });
    },
  };
};

/* ── Expressive (MPE-style) note — for Roli Seaboard mode ───── */
// Like playNote but returns setPitchBend(semitones) and setSlide(0–1)
// so the caller can continuously modulate the note while it's held.
export const playNoteExpressive = (midi, { voice = 'piano', volume = 0.3 } = {}) => {
  const ctx = getCtx();
  const def = resolveVoice(voice);
  const now = ctx.currentTime;
  const freq = midiToFreq(midi);

  const env = ctx.createGain();
  // Slide filter — modulate cutoff from Y axis (top = bright, bottom = warm)
  const slideFilter = ctx.createBiquadFilter();
  slideFilter.type = 'lowpass';
  slideFilter.frequency.value = 10000;
  slideFilter.Q.value = 0.7;

  let chain = env;
  if (def.filter) {
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.Q.value = def.resonance ?? 1;
    if (def.brightAttack && def.brightDecay) {
      voiceFilter.frequency.setValueAtTime(def.filter * def.brightAttack, now);
      voiceFilter.frequency.exponentialRampToValueAtTime(def.filter, now + def.brightDecay);
    } else {
      voiceFilter.frequency.value = def.filter;
    }
    env.connect(voiceFilter);
    chain = voiceFilter;
  }
  chain.connect(slideFilter);
  slideFilter.connect(_masterGain);

  const pitchScale = def.naturalDecay ? Math.max(0.35, Math.min(1.6, 220 / freq)) : 1;

  const peak = Math.max(0.0001, volume * (def.level ?? 1));
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peak, now + def.attack);
  const decayEndTime = now + def.attack + def.decay;
  env.gain.linearRampToValueAtTime(
    Math.max(0.0001, peak * def.sustain),
    decayEndTime
  );
  if (def.naturalDecay) {
    env.gain.setTargetAtTime(0.0001, decayEndTime, (def.naturalDecay / 4) * pitchScale);
  }

  if (def.hammerNoise) {
    const dur = 0.012;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.value = peak * def.hammerNoise;
    src.connect(hp).connect(ng).connect(_masterGain);
    src.start(now);
    src.stop(now + dur + 0.005);
  }

  // Keep { osc, baseDetune } so we can apply pitch bend relative to voice detuning
  const oscPairs = shapeOscs(def.oscs, def).map(o => {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = freq * (o.harmonic || 1);
    const baseDetune = o.detune || 0;
    osc.detune.value = baseDetune;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    osc.connect(g).connect(env);
    osc.start(now);
    return { osc, baseDetune };
  });

  return {
    release() {
      const t = ctx.currentTime;
      try { env.gain.cancelAndHoldAtTime(t); } catch {
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
      }
      const releaseTime = def.release * pitchScale;
      env.gain.linearRampToValueAtTime(0.0001, t + releaseTime);
      const stopAt = t + releaseTime + 0.08;
      oscPairs.forEach(({ osc }) => { try { osc.stop(stopAt); } catch {} });
    },
    /** Bend pitch by ±semitones (e.g. ±2). Applied on top of voice detuning. */
    setPitchBend(semitones) {
      const cents = semitones * 100;
      oscPairs.forEach(({ osc, baseDetune }) => {
        osc.detune.value = baseDetune + cents;
      });
    },
    /** Slide: 0 = top of key (warm/dark), 1 = bottom (bright). */
    setSlide(y) {
      // y is inverted: dragging toward bottom = more brightness on Seaboard
      const minHz = 600;
      const maxHz = 12000;
      slideFilter.frequency.value = minHz + (maxHz - minHz) * y;
    },
  };
};

/* ── Karplus-Strong acoustic guitar synthesis ────────────────
   Two bugs caused screeching in v1:
     (a) delay.delayTime = 1/freq — non-integer sample count
         creates fractional-delay artifacts inside the loop.
     (b) damp.Q = 0.5 — the filter resonated inside the loop,
         amplifying that frequency every cycle → screech.
   Fixes: integer-sample delay; near-zero Q on the damping
   filter; lower cutoff (freq×5 not ×8); gentler EQ/pick.
   ─────────────────────────────────────────────────────────── */
export const playAcousticGuitar = (midi, { volume = 0.35 } = {}) => {
  const ctx  = getCtx();
  const freq = midiToFreq(midi);
  const now  = ctx.currentTime;
  const sr   = ctx.sampleRate;

  // Integer sample count — MUST match delay.delayTime exactly.
  // Any fractional mismatch resonates and screeches in the loop.
  const N = Math.max(2, Math.round(sr / freq));

  // ── Excitation: one period of Hann-windowed noise ─────────────
  const excBuf  = ctx.createBuffer(1, N, sr);
  const excData = excBuf.getChannelData(0);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, N - 1)));
    excData[i] = (Math.random() * 2 - 1) * w;
  }
  const excSrc = ctx.createBufferSource();
  excSrc.buffer = excBuf;

  // ── KS delay line — exactly N samples ─────────────────────────
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = N / sr;   // integer → no fractional-delay artifacts

  // Damping: simple lowpass, Q near-zero so the filter itself
  // can't resonate inside the feedback loop.
  // Cutoff = 5× the fundamental → warm acoustic brightness.
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = Math.min(sr * 0.48, freq * 5);
  damp.Q.value = 0.01;   // ← critical: no filter resonance

  // Feedback gain — controls decay length.
  // Target 2.5 s for low E, 1 s for high notes; conservative cap at 0.998.
  const tDecay = Math.max(0.5, 2.5 - (freq - 82) / 300);
  const fbVal  = Math.min(0.998, Math.exp(-Math.log(1000) / (tDecay * freq)));
  const fb     = ctx.createGain();
  fb.gain.value = fbVal;

  // ── Body warmth — single gentle peak at ~180 Hz ───────────────
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 180;
  body.Q.value = 0.8;
  body.gain.value = 3;            // gentle — not enough to feed back

  const out = ctx.createGain();
  out.gain.value = Math.max(0.0001, volume);

  // ── Pick transient — very short, highpass only ────────────────
  // Lowered volume (0.06) and shorter duration (3 ms) vs v1.
  const pickN   = Math.max(1, Math.floor(sr * 0.003));
  const pickBuf = ctx.createBuffer(1, pickN, sr);
  const pickDat = pickBuf.getChannelData(0);
  for (let i = 0; i < pickN; i++)
    pickDat[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / pickN, 2);
  const pickSrc  = ctx.createBufferSource();
  pickSrc.buffer = pickBuf;
  const pickHP   = ctx.createBiquadFilter();
  pickHP.type    = 'highpass';
  pickHP.frequency.value = 2500;
  const pickGain = ctx.createGain();
  pickGain.gain.value = volume * 0.06;

  // ── Routing ───────────────────────────────────────────────────
  excSrc.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);          // ← KS feedback

  damp.connect(body);         // tap after damping → warm output
  body.connect(out);
  out.connect(_masterGain);

  pickSrc.connect(pickHP);
  pickHP.connect(pickGain);
  pickGain.connect(_masterGain);

  // ── Start ─────────────────────────────────────────────────────
  excSrc.start(now);
  excSrc.stop(now + N / sr + 0.001);   // one period then stop
  pickSrc.start(now);
  pickSrc.stop(now + 0.005);

  return {
    release() {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
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
