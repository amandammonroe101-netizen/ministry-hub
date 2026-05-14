/* ─────────────────────────────────────────────────────────────
   Shared audio helpers — metronome, pitch drone, tap tempo
   Uses the Web Audio API, no external dependencies.
   ───────────────────────────────────────────────────────────── */

let _ctx = null;
const getCtx = () => {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/* ── Pitch math ──────────────────────────────────────────────── */
// MIDI: A4 = 69, freq = 440 Hz. Each semitone = +1.
const NOTE_TO_SEMITONE = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Convert a chord/note string like "G", "F#", "Bbm" to a MIDI number near middle. */
export const noteToMidi = (note, octave = 4) => {
  if (!note) return null;
  const m = note.match(/^([A-G][#b]?)/);
  if (!m) return null;
  const root = m[1];
  const semis = NOTE_TO_SEMITONE[root];
  if (semis === undefined) return null;
  return 12 * (octave + 1) + semis;
};

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ── Metronome ───────────────────────────────────────────────── */
/**
 * Start a metronome at `bpm` beats per minute.
 * Returns a stop() function.
 */
export const startMetronome = (bpm, { volume = 0.25, accentFirst = true, beatsPerBar = 4 } = {}) => {
  const ctx = getCtx();
  const interval = 60 / bpm;
  let beat = 0;
  let nextTime = ctx.currentTime + 0.05;
  let stopped = false;
  let timerId = null;

  const scheduleClick = (time, accent) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    osc.type = 'square';
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  };

  const tick = () => {
    if (stopped) return;
    while (nextTime < ctx.currentTime + 0.2) {
      scheduleClick(nextTime, accentFirst && beat % beatsPerBar === 0);
      nextTime += interval;
      beat++;
    }
    timerId = setTimeout(tick, 25);
  };
  tick();

  return () => {
    stopped = true;
    if (timerId) clearTimeout(timerId);
  };
};

/* ── Pitch reference drone ───────────────────────────────────── */
/**
 * Play a sustained chord (root + 5th) for the given key.
 * Returns a stop() function.
 */
export const startPitchDrone = (key, { volume = 0.12, octave = 4 } = {}) => {
  if (!key) return () => {};
  const ctx = getCtx();
  // Strip 'm' for minor — drone root is the same note
  const cleanKey = key.replace(/m$/, '');
  const rootMidi = noteToMidi(cleanKey, octave);
  if (rootMidi === null) return () => {};

  // Build a sustained root + 5th (perfect fifth = +7 semitones)
  const oscs = [];
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.4);

  [rootMidi, rootMidi + 7].forEach(m => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midiToFreq(m);
    o.connect(gain);
    o.start();
    oscs.push(o);
  });

  return () => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    oscs.forEach(o => {
      try { o.stop(now + 0.35); } catch {}
    });
  };
};

/* ── Tap tempo ───────────────────────────────────────────────── */
/**
 * Stateful tap-tempo collector.
 * Call .tap() on each beat; reads the average interval over the last 4-8 taps.
 */
export const makeTapTempo = ({ maxTaps = 8, resetMs = 2000 } = {}) => {
  let taps = [];
  return {
    tap() {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > resetMs) taps = [];
      taps.push(now);
      if (taps.length > maxTaps) taps = taps.slice(-maxTaps);
      if (taps.length < 2) return null;
      const intervals = [];
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      return Math.round(60000 / avg);
    },
    reset() { taps = []; },
    count() { return taps.length; },
  };
};
