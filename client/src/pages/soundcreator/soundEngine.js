/* ─────────────────────────────────────────────────────────────
   Sound Creator engine — record raw audio (mic input), warp it
   with a big pile of weird effects, and mix several recordings
   together. Independent Web Audio graph from the Studio synth
   (studio/synth.js) — this one plays back buffers, not
   oscillator notes.
   ───────────────────────────────────────────────────────────── */

let _ctx = null;
let _bus = null;          // every playing sound connects here
let _dryGain = null;
let _reverb = null;       // ConvolverNode
let _reverbGain = null;   // wet amount
let _delay = null;        // DelayNode (slap-back echo)
let _delayFeedback = null;
let _delayGain = null;    // wet amount
let _ppDelayL = null;     // ping-pong delay pair
let _ppDelayR = null;
let _ppFeedback = null;
let _ppWet = null;
let _ppPanL = null;
let _ppPanR = null;
let _screechDelay = null; // runaway/self-oscillating feedback delay
let _screechFeedback = null;
let _screechWet = null;
let _limiter = null;      // master brickwall limiter (bypassed by default)
let _masterAnalyser = null; // tap for the master VU/peak meter
let _output = null;       // final bus → speakers + recording stream
let _streamDest = null;   // MediaStreamAudioDestinationNode
let _noiseBufCache = null;
let _noiseBufSeconds = 0;
let _crackleBufCache = null;
let _crackleBufSeconds = 0;

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

    _output = _ctx.createGain();
    _output.gain.value = 1;

    /* Master brickwall limiter — off by default (threshold 0dB/ratio 1 =
       transparent passthrough), engaged via applyLimiter(true) which pulls
       the threshold down and cranks the ratio to catch loud mix peaks. */
    _limiter = _ctx.createDynamicsCompressor();
    _limiter.threshold.value = 0;
    _limiter.knee.value = 0;
    _limiter.ratio.value = 1;
    _limiter.attack.value = 0.003;
    _limiter.release.value = 0.15;

    _streamDest = _ctx.createMediaStreamDestination();
    _output.connect(_limiter);
    _limiter.connect(_ctx.destination);
    _limiter.connect(_streamDest);

    /* Master VU/peak meter tap — parallel dead-end, doesn't affect
       the audible signal path. */
    _masterAnalyser = _ctx.createAnalyser();
    _masterAnalyser.fftSize = 256;
    _masterAnalyser.smoothingTimeConstant = 0.6;
    _limiter.connect(_masterAnalyser);

    _bus = _ctx.createGain();
    _bus.gain.value = 1;

    _dryGain = _ctx.createGain();
    _dryGain.gain.value = 1;
    _bus.connect(_dryGain).connect(_output);

    _reverb = _ctx.createConvolver();
    _reverb.buffer = makeImpulseResponse(_ctx, 3.2, 2.4);
    _reverbGain = _ctx.createGain();
    _reverbGain.gain.value = 0;
    _bus.connect(_reverb);
    _reverb.connect(_reverbGain).connect(_output);

    _delay = _ctx.createDelay(2.0);
    _delay.delayTime.value = 0.32;
    _delayFeedback = _ctx.createGain();
    _delayFeedback.gain.value = 0.4;
    _delayGain = _ctx.createGain();
    _delayGain.gain.value = 0;
    _bus.connect(_delay);
    _delay.connect(_delayFeedback).connect(_delay);
    _delay.connect(_delayGain).connect(_output);

    /* Ping-pong delay — bounces between L/R using two cross-feeding delays. */
    _ppDelayL = _ctx.createDelay(1.0);
    _ppDelayL.delayTime.value = 0.28;
    _ppDelayR = _ctx.createDelay(1.0);
    _ppDelayR.delayTime.value = 0.28;
    _ppFeedback = _ctx.createGain();
    _ppFeedback.gain.value = 0.35;
    _ppWet = _ctx.createGain();
    _ppWet.gain.value = 0;
    _ppPanL = _ctx.createStereoPanner();
    _ppPanL.pan.value = -1;
    _ppPanR = _ctx.createStereoPanner();
    _ppPanR.pan.value = 1;
    _bus.connect(_ppDelayL);
    _ppDelayL.connect(_ppPanL).connect(_ppWet).connect(_output);
    _ppDelayL.connect(_ppFeedback).connect(_ppDelayR);
    _ppDelayR.connect(_ppPanR).connect(_ppWet);
    _ppDelayR.connect(_ppFeedback).connect(_ppDelayL);

    /* Runaway "screech" delay — feedback can be pushed near self-oscillation. */
    _screechDelay = _ctx.createDelay(1.0);
    _screechDelay.delayTime.value = 0.12;
    _screechFeedback = _ctx.createGain();
    _screechFeedback.gain.value = 0;
    _screechWet = _ctx.createGain();
    _screechWet.gain.value = 0;
    _bus.connect(_screechDelay);
    _screechDelay.connect(_screechFeedback).connect(_screechDelay);
    _screechDelay.connect(_screechWet).connect(_output);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/** The MediaStream everything (dry + wet) is mixed into — feed to MediaRecorder to capture the mix. */
export const getRecordStream = () => {
  getCtx();
  return _streamDest.stream;
};

/* ── Master bus controls ─────────────────────────────────────── */
export const applyLimiter = (on) => {
  getCtx();
  _limiter.threshold.setTargetAtTime(on ? -3 : 0, _ctx.currentTime, 0.02);
  _limiter.ratio.setTargetAtTime(on ? 20 : 1, _ctx.currentTime, 0.02);
};

/** Master bus AnalyserNode, for a live VU/peak meter on the mixer console. */
export const getMasterAnalyser = () => {
  getCtx();
  return _masterAnalyser;
};
export const applyReverb = (amount) => {
  getCtx();
  _reverbGain.gain.setTargetAtTime(amount, _ctx.currentTime, 0.05);
};
export const applyDelay = (amount, timeSec, feedback) => {
  getCtx();
  _delayGain.gain.setTargetAtTime(amount, _ctx.currentTime, 0.05);
  if (timeSec != null)  _delay.delayTime.setTargetAtTime(timeSec, _ctx.currentTime, 0.05);
  if (feedback != null) _delayFeedback.gain.setTargetAtTime(feedback, _ctx.currentTime, 0.05);
};
export const applyPingPong = (amount, timeSec) => {
  getCtx();
  _ppWet.gain.setTargetAtTime(amount, _ctx.currentTime, 0.05);
  if (timeSec != null) {
    _ppDelayL.delayTime.setTargetAtTime(timeSec, _ctx.currentTime, 0.05);
    _ppDelayR.delayTime.setTargetAtTime(timeSec, _ctx.currentTime, 0.05);
  }
};
export const setMasterVolume = (amount) => {
  getCtx();
  _output.gain.setTargetAtTime(Math.max(0, Math.min(1.5, amount)), _ctx.currentTime, 0.05);
};
/** Runaway feedback delay — amount: 0-100, feedback climbs toward self-oscillation past ~80. */
export const applyScreech = (amount) => {
  getCtx();
  const wet = (amount / 100) * 0.9;
  const feedback = Math.min(0.97, (amount / 100) * 1.05);
  _screechWet.gain.setTargetAtTime(wet, _ctx.currentTime, 0.05);
  _screechFeedback.gain.setTargetAtTime(feedback, _ctx.currentTime, 0.05);
};

/* ── Microphone recording — captures a single "weird sound" ─── */
export const startMicRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let mimeType = '';
  if (window.MediaRecorder) {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
    else if (MediaRecorder.isTypeSupported('audio/webm'))        mimeType = 'audio/webm';
    else if (MediaRecorder.isTypeSupported('audio/mp4'))         mimeType = 'audio/mp4';
  }
  const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const startedAt = Date.now();
  mr.start();
  return {
    stop: () => new Promise((resolve, reject) => {
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const duration = (Date.now() - startedAt) / 1000;
        resolve({ blob, duration });
      };
      mr.onerror = (err) => { stream.getTracks().forEach(t => t.stop()); reject(err); };
      try { mr.stop(); } catch (err) { reject(err); }
    }),
    cancel: () => {
      try { mr.onstop = null; mr.stop(); } catch { /* already stopped */ }
      stream.getTracks().forEach(t => t.stop());
    },
  };
};

/* ── Recording the mix bus (for "Record Mix") ────────────────── */
export const startBusRecording = () => {
  const stream = getRecordStream();
  let mimeType = '';
  if (window.MediaRecorder) {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
    else if (MediaRecorder.isTypeSupported('audio/webm'))        mimeType = 'audio/webm';
    else if (MediaRecorder.isTypeSupported('audio/mp4'))         mimeType = 'audio/mp4';
  }
  const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const startedAt = Date.now();
  mr.start();
  return {
    stop: () => new Promise((resolve, reject) => {
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const duration = (Date.now() - startedAt) / 1000;
        resolve({ blob, duration });
      };
      mr.onerror = reject;
      try { mr.stop(); } catch (err) { reject(err); }
    }),
  };
};

/* ── Decode a Blob or ArrayBuffer into a playable AudioBuffer ── */
export const decodeAudio = async (blobOrArrayBuffer) => {
  const ctx = getCtx();
  const arrayBuffer = blobOrArrayBuffer instanceof Blob
    ? await blobOrArrayBuffer.arrayBuffer()
    : blobOrArrayBuffer;
  return ctx.decodeAudioData(arrayBuffer.slice(0));
};

/** Reversed copy of a buffer — cache the result on the caller side. */
export const reverseBuffer = (buffer) => {
  const ctx = getCtx();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
  }
  return out;
};

/** Trim: cut the buffer down to [startPct, endPct] of its own length (0-100 each). */
export const buildTrimBuffer = (buffer, startPct = 0, endPct = 100) => {
  const ctx = getCtx();
  const s = Math.max(0, Math.min(100, startPct));
  const e = Math.max(s, Math.min(100, endPct));
  const startIdx = Math.floor((s / 100) * buffer.length);
  const endIdx = Math.max(startIdx + 1, Math.floor((e / 100) * buffer.length));
  const len = Math.min(endIdx, buffer.length) - startIdx;
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(startIdx, startIdx + len));
  }
  return out;
};

/** Freeze: grab a tiny slice from the start — pair with `loop: true` for a sustained drone. */
export const buildFreezeBuffer = (buffer, sliceMs = 60) => {
  const ctx = getCtx();
  const len = Math.max(1, Math.min(Math.floor(ctx.sampleRate * sliceMs / 1000), buffer.length));
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(0, len));
  }
  return out;
};

/** Stutter: repeat a short slice from the start back-to-back. amount: 1-100 */
export const buildStutterBuffer = (buffer, amount) => {
  const ctx = getCtx();
  const sliceMs = Math.max(30, 150 - amount * 1.1);
  const repeats = 3 + Math.floor(amount / 12);
  const sliceLen = Math.max(1, Math.min(Math.floor(ctx.sampleRate * sliceMs / 1000), buffer.length));
  const totalLen = sliceLen * repeats;
  const out = ctx.createBuffer(buffer.numberOfChannels, totalLen, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch).subarray(0, sliceLen);
    const dst = out.getChannelData(ch);
    for (let r = 0; r < repeats; r++) dst.set(src, r * sliceLen);
  }
  return out;
};

/** Granular scramble: chop into grains, shuffle their order. amount: 1-100 (higher = smaller grains). */
export const buildScrambleBuffer = (buffer, amount) => {
  const ctx = getCtx();
  const grainMs = Math.max(20, 200 - amount * 1.8);
  const grainLen = Math.max(1, Math.floor(ctx.sampleRate * grainMs / 1000));
  const numGrains = Math.max(1, Math.ceil(buffer.length / grainLen));
  const order = Array.from({ length: numGrains }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let pos = 0;
    order.forEach(gi => {
      const start = gi * grainLen;
      const end = Math.min(start + grainLen, buffer.length);
      dst.set(src.subarray(start, end), pos);
      pos += (end - start);
    });
  }
  return out;
};

/** Beat Repeat: like Stutter, but the slice length is quantized to a musical
 *  subdivision (at an assumed 120bpm) and repeats escalate — a "loop roll". */
export const buildBeatRepeatBuffer = (buffer, amount) => {
  const ctx = getCtx();
  const beatSec = 0.5; // 120bpm quarter note
  const divisions = [1, 2, 4, 8, 16];
  const div = divisions[Math.min(divisions.length - 1, Math.floor((amount / 100) * divisions.length))];
  const sliceLen = Math.max(1, Math.min(Math.floor(ctx.sampleRate * (beatSec / div)), buffer.length));
  const repeats = 4 + Math.floor(amount / 15);
  const totalLen = sliceLen * repeats;
  const out = ctx.createBuffer(buffer.numberOfChannels, totalLen, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch).subarray(0, sliceLen);
    const dst = out.getChannelData(ch);
    for (let r = 0; r < repeats; r++) {
      const decay = 1 - (r / repeats) * 0.15; // slight fade across repeats
      for (let i = 0; i < sliceLen; i++) dst[r * sliceLen + i] = src[i] * decay;
    }
  }
  return out;
};

/** Grain Scatter: like Scramble, but grains have randomized length and some
 *  are dropped or reversed — denser and more textural than a plain shuffle. */
export const buildGrainScatterBuffer = (buffer, amount) => {
  const ctx = getCtx();
  const baseGrainMs = Math.max(15, 160 - amount * 1.4);
  const grains = [];
  let pos = 0;
  while (pos < buffer.length) {
    const jitterMs = baseGrainMs * (0.4 + Math.random() * 1.2);
    const len = Math.max(1, Math.min(Math.floor(ctx.sampleRate * jitterMs / 1000), buffer.length - pos));
    grains.push({ start: pos, len, reversed: Math.random() < (amount / 100) * 0.5 });
    pos += len;
  }
  for (let i = grains.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [grains[i], grains[j]] = [grains[j], grains[i]];
  }
  const keep = grains.filter(() => Math.random() > (amount / 100) * 0.2); // occasional dropouts
  const totalLen = keep.reduce((sum, g) => sum + g.len, 0) || 1;
  const out = ctx.createBuffer(buffer.numberOfChannels, totalLen, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let p = 0;
    keep.forEach(g => {
      const slice = src.subarray(g.start, g.start + g.len);
      if (g.reversed) {
        for (let i = 0; i < slice.length; i++) dst[p + i] = slice[slice.length - 1 - i];
      } else {
        dst.set(slice, p);
      }
      p += g.len;
    });
  }
  return out;
};

/** Reverse Reverb Swell: a reversed copy with a rising fade-in envelope so it
 *  builds into the hit — approximates a swelling reversed-reverb intro. */
export const buildReverseSwellBuffer = (buffer) => {
  const ctx = getCtx();
  const reversed = reverseBuffer(buffer);
  const padSec = Math.min(1.2, Math.max(0.3, buffer.duration * 0.5));
  const padLen = Math.floor(ctx.sampleRate * padSec);
  const totalLen = padLen + reversed.length;
  const out = ctx.createBuffer(buffer.numberOfChannels, totalLen, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = reversed.getChannelData(ch);
    const dst = out.getChannelData(ch);
    // Swell pad: quiet noise-free rise built from a stretched, faded copy of the tail.
    for (let i = 0; i < padLen; i++) {
      const t = i / padLen;
      const srcIdx = Math.floor((i / padLen) * Math.min(src.length, padLen));
      dst[i] = (src[srcIdx] || 0) * t * 0.5;
    }
    for (let i = 0; i < src.length; i++) {
      const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.15));
      dst[padLen + i] = src[i] * fadeIn;
    }
  }
  return out;
};

/** Classic waveshaper distortion curve. amount: 0–100 */
const makeDistortionCurve = (amount) => {
  const k = amount * 1.2;
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
};

/** Quantizing waveshaper curve for bitcrush grit. amount: 0-100 */
const makeBitcrushCurve = (amount) => {
  const steps = Math.max(4, Math.round(256 - (amount / 100) * 250));
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
};

/** Hard-clip fuzz curve — harsher, squarer knee than the Warp distortion. amount: 0-100 */
const makeClipCurve = (amount) => {
  const drive = 1 + (amount / 100) * 24;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.max(-1, Math.min(1, x * drive));
  }
  return curve;
};

/** Gentle tanh saturation — soft analog-tape warmth, much subtler than Warp/Fuzz. amount: 0-100 */
const makeTapeCurve = (amount) => {
  const drive = 1 + (amount / 100) * 4;
  const norm = Math.tanh(drive);
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
};

const getNoiseBuffer = (ctx, seconds) => {
  const secs = Math.max(0.3, Math.min(seconds, 12));
  if (_noiseBufCache && _noiseBufSeconds >= secs) return _noiseBufCache;
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  _noiseBufCache = buf;
  _noiseBufSeconds = secs;
  return buf;
};

/** Sparse vinyl-style clicks & pops — mostly silence with occasional random spikes. */
const getCrackleBuffer = (ctx, seconds) => {
  const secs = Math.max(0.3, Math.min(seconds, 12));
  if (_crackleBufCache && _crackleBufSeconds >= secs) return _crackleBufCache;
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = Math.random() < 0.0025 ? (Math.random() * 2 - 1) : 0;
    }
  }
  _crackleBufCache = buf;
  _crackleBufSeconds = secs;
  return buf;
};

/** Sample-and-hold sample-rate reducer. amount: 0-100 */
const createSRReducer = (ctx, amount) => {
  const node = ctx.createScriptProcessor(1024, 2, 2);
  const factor = Math.max(1, Math.round(1 + (amount / 100) * 30));
  let holdL = 0, holdR = 0, counter = 0;
  node.onaudioprocess = (e) => {
    const inL = e.inputBuffer.getChannelData(0);
    const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    for (let i = 0; i < inL.length; i++) {
      if (counter % factor === 0) { holdL = inL[i]; holdR = inR[i]; }
      outL[i] = holdL; outR[i] = holdR;
      counter++;
    }
  };
  return node;
};

/** Connects an LFO (through a scaling gain) into an AudioParam. Returns the oscillator. */
const routeLFO = (ctx, param, rate, depth, type = 'sine') => {
  const lfo = ctx.createOscillator();
  lfo.type = type;
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain).connect(param);
  lfo.start();
  return lfo;
};

/**
 * Play a decoded AudioBuffer through the "weird sound" chain. Buffer should
 * already be pre-processed for reverse / freeze / stutter / scramble / beat
 * repeat / grain scatter / reverse swell by the caller — this function
 * handles the real-time signal chain: distortion → bitcrush → sample-rate
 * reduce → filter (+ wobble) → ring mod → tremolo → vibrato → chorus →
 * flanger → phaser → comb → talk-box → formant → gate chop → pump →
 * compressor → gain → auto-pan/pan → Haas width → bus, plus optional noise
 * overlay, harmonizer voice, random pitch jitter/stepper, and tape wow/flutter.
 */
export const playBuffer = (buffer, {
  pitch = 1, distortion = 0, filterOn = false, filterFreq = 0, filterType = 'lowpass',
  volume = 0.8, pan = 0, loop = false,
  jitter = 0, vibrato = 0, ringMod = 0, tremolo = 0, chorus = 0, flanger = 0,
  wobble = 0, bitcrush = 0, srReduce = 0, noise = 0,
  autoPan = 0, gateChop = 0, pump = 0, compress = 0, harmonize = 0,
  formant = 0, pitchStep = 0, wow = 0, phaser = 0, comb = 0, talkbox = 0,
  haas = 0, radioTune = 0,
  lowShelf = 0, highShelf = 0, midEQ = 0,
  reverbSend = 0, delaySend = 0, stereoWidth = 0,
  vinylCrackle = 0, clipFuzz = 0, dopplerSweep = 0, growl = 0, whisper = 0,
  noiseGate = 0, deEss = 0, phaseInvert = false, tapeSat = 0,
  fadeIn = 0, fadeOut = 0, // ms — ramp the final gain in/out instead of clicking on/off
} = {}) => {
  const ctx = getCtx();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = pitch;
  src.loop = loop;

  const extraOscillators = [];
  let srNode = null;
  let jitterInterval = null;
  let noiseSrc = null;
  let gateNode = null;

  let node = src;

  if (phaseInvert) {
    const inv = ctx.createGain();
    inv.gain.value = -1;
    node.connect(inv);
    node = inv;
  }

  if (noiseGate > 0) {
    gateNode = ctx.createScriptProcessor(1024, 2, 2);
    const threshold = (noiseGate / 100) * 0.3;
    gateNode.onaudioprocess = (e) => {
      for (let ch = 0; ch < e.outputBuffer.numberOfChannels; ch++) {
        const input = e.inputBuffer.getChannelData(ch);
        const output = e.outputBuffer.getChannelData(ch);
        for (let i = 0; i < input.length; i++) {
          output[i] = Math.abs(input[i]) < threshold ? 0 : input[i];
        }
      }
    };
    node.connect(gateNode);
    node = gateNode;
  }

  if (distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(distortion);
    shaper.oversample = '4x';
    node.connect(shaper);
    node = shaper;
  }

  if (clipFuzz > 0) {
    const clipper = ctx.createWaveShaper();
    clipper.curve = makeClipCurve(clipFuzz);
    clipper.oversample = '4x';
    node.connect(clipper);
    node = clipper;
  }

  if (tapeSat > 0) {
    const tape = ctx.createWaveShaper();
    tape.curve = makeTapeCurve(tapeSat);
    tape.oversample = '4x';
    node.connect(tape);
    node = tape;
  }

  if (bitcrush > 0) {
    const crusher = ctx.createWaveShaper();
    crusher.curve = makeBitcrushCurve(bitcrush);
    node.connect(crusher);
    node = crusher;
  }

  if (srReduce > 0) {
    srNode = createSRReducer(ctx, srReduce);
    node.connect(srNode);
    node = srNode;
  }

  if (filterOn && filterFreq > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    node.connect(filter);
    node = filter;
    if (wobble > 0) {
      const rate = 1 + (wobble / 100) * 7;
      const depth = filterFreq * 0.6 * (wobble / 100);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      extraOscillators.push(lfo);
    }
  }

  if (ringMod > 0) {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 30 + (ringMod / 100) * 800;
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0; // intrinsic value 0 → output = input * carrier(t)
    carrier.connect(ringGain.gain);
    node.connect(ringGain);
    carrier.start();
    extraOscillators.push(carrier);
    node = ringGain;
  }

  if (tremolo > 0) {
    const depth = (tremolo / 100) * 0.8;
    const rate = 3 + (tremolo / 100) * 7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth / 2;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 1 - depth / 2;
    lfo.connect(lfoGain).connect(tremGain.gain);
    node.connect(tremGain);
    lfo.start();
    extraOscillators.push(lfo);
    node = tremGain;
  }

  if (vibrato > 0) {
    const depth = 0.001 + (vibrato / 100) * 0.004;
    const rate = 4 + (vibrato / 100) * 4;
    const vDelay = ctx.createDelay(0.02);
    vDelay.delayTime.value = depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(vDelay.delayTime);
    node.connect(vDelay);
    lfo.start();
    extraOscillators.push(lfo);
    node = vDelay;
  }

  if (chorus > 0) {
    const depth = 0.003 + (chorus / 100) * 0.007;
    const rate = 0.5 + (chorus / 100) * 1.5;
    const cDelay = ctx.createDelay(0.05);
    cDelay.delayTime.value = 0.015;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(cDelay.delayTime);
    lfo.start();
    extraOscillators.push(lfo);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    const dry = ctx.createGain(); dry.gain.value = 1;
    const merge = ctx.createGain();
    node.connect(cDelay).connect(wet).connect(merge);
    node.connect(dry).connect(merge);
    node = merge;
  }

  if (flanger > 0) {
    const depth = 0.001 + (flanger / 100) * 0.004;
    const rate = 0.2 + (flanger / 100) * 0.6;
    const fb = 0.3 + (flanger / 100) * 0.4;
    const fDelay = ctx.createDelay(0.02);
    fDelay.delayTime.value = 0.003;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(fDelay.delayTime);
    lfo.start();
    extraOscillators.push(lfo);
    const feedback = ctx.createGain(); feedback.gain.value = fb;
    fDelay.connect(feedback).connect(fDelay);
    const merge = ctx.createGain();
    node.connect(fDelay).connect(merge);
    node.connect(merge);
    node = merge;
  }

  if (phaser > 0) {
    const rate = 0.15 + (phaser / 100) * 1.2;
    const stageFreqs = [300, 600, 1100, 1800];
    const stages = stageFreqs.map(f => {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = f;
      return ap;
    });
    const lfo = routeLFO(ctx, stages[0].frequency, rate, stageFreqs[0] * 0.7 * (phaser / 100));
    extraOscillators.push(lfo);
    // Share the same modulation depth/rate across stages by re-routing from the first LFO's oscillator.
    for (let i = 1; i < stages.length; i++) {
      const g = ctx.createGain();
      g.gain.value = stageFreqs[i] * 0.7 * (phaser / 100);
      lfo.connect(g).connect(stages[i].frequency);
    }
    let chain = node;
    stages.forEach(ap => { chain.connect(ap); chain = ap; });
    const wet = ctx.createGain(); wet.gain.value = 0.6 * (phaser / 100) + 0.2;
    const dry = ctx.createGain(); dry.gain.value = 1;
    const merge = ctx.createGain();
    chain.connect(wet).connect(merge);
    node.connect(dry).connect(merge);
    node = merge;
  }

  if (comb > 0) {
    const delayMs = 1 + (comb / 100) * 14;
    const cDelay = ctx.createDelay(0.05);
    cDelay.delayTime.value = delayMs / 1000;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.25 + (comb / 100) * 0.5;
    cDelay.connect(feedback).connect(cDelay);
    const merge = ctx.createGain();
    node.connect(cDelay).connect(merge);
    node.connect(merge);
    node = merge;
  }

  if (formant > 0) {
    const baseFreqs = [700, 1220, 2600];
    const shift = 1 + (formant / 100) * 1.6;
    const merge = ctx.createGain();
    baseFreqs.forEach(f => {
      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = f * shift;
      peak.Q.value = 6;
      peak.gain.value = 10;
      node.connect(peak).connect(merge);
    });
    node = merge;
  }

  if (radioTune > 0) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 3 + (radioTune / 100) * 4;
    const rate = 0.15 + (radioTune / 100) * 0.5;
    const lfo = routeLFO(ctx, band.frequency, rate, 900 * (radioTune / 100), 'triangle');
    extraOscillators.push(lfo);
    node.connect(band);
    node = band;
  }

  let talkboxAnalyser = null;
  if (talkbox > 0) {
    const talkFilter = ctx.createBiquadFilter();
    talkFilter.type = 'bandpass';
    talkFilter.frequency.value = 600;
    talkFilter.Q.value = 4 + (talkbox / 100) * 8;
    talkboxAnalyser = ctx.createScriptProcessor(1024, 1, 1);
    const sensitivity = 3000 + (talkbox / 100) * 6000;
    talkboxAnalyser.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      talkFilter.frequency.setTargetAtTime(300 + rms * sensitivity, ctx.currentTime, 0.03);
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(talkboxAnalyser).connect(mute).connect(_output);
    node.connect(talkFilter);
    node = talkFilter;
  }

  if (lowShelf !== 0) {
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = 200;
    shelf.gain.value = lowShelf;
    node.connect(shelf);
    node = shelf;
  }

  if (highShelf !== 0) {
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3500;
    shelf.gain.value = highShelf;
    node.connect(shelf);
    node = shelf;
  }

  if (midEQ !== 0) {
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    mid.gain.value = midEQ;
    node.connect(mid);
    node = mid;
  }

  if (deEss > 0) {
    // Difference-band de-esser: run the sibilance band (4-8kHz) through a
    // fast, low-threshold compressor, then subtract the compressed copy
    // from the dry signal — the subtraction is near-zero when the band is
    // quiet (compressor is unity below threshold) and grows whenever the
    // band gets loud, ducking sibilance dynamically instead of statically.
    const sib = ctx.createBiquadFilter();
    sib.type = 'bandpass';
    sib.frequency.value = 6500;
    sib.Q.value = 1.1;
    const sibComp = ctx.createDynamicsCompressor();
    sibComp.threshold.value = -40;
    sibComp.ratio.value = 20;
    sibComp.knee.value = 0;
    sibComp.attack.value = 0.001;
    sibComp.release.value = 0.05;
    const reduceGain = ctx.createGain();
    reduceGain.gain.value = (deEss / 100) * 1.6;
    const invert = ctx.createGain();
    invert.gain.value = -1;
    const merge = ctx.createGain();
    node.connect(merge);
    node.connect(sib).connect(sibComp).connect(reduceGain).connect(invert).connect(merge);
    node = merge;
  }

  const gain = ctx.createGain();
  const targetVol = Math.max(0, Math.min(1.5, volume));
  const now = ctx.currentTime;
  const durSec = (buffer.duration || 0) / (pitch || 1);
  if (fadeIn > 0 && durSec > 0) {
    const t = Math.min(fadeIn / 1000, durSec);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(targetVol, now + t);
  } else {
    gain.gain.setValueAtTime(targetVol, now);
  }
  if (fadeOut > 0 && !loop && durSec > 0) {
    const t = Math.min(fadeOut / 1000, durSec);
    gain.gain.setValueAtTime(targetVol, Math.max(now, now + durSec - t));
    gain.gain.linearRampToValueAtTime(0, now + durSec);
  }
  node.connect(gain);

  if (noise > 0) {
    const noiseBuf = getNoiseBuffer(ctx, (buffer.duration || 1) + 0.2);
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = loop;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = (noise / 100) * 0.35;
    noiseSrc.connect(noiseGain).connect(gain);
    noiseSrc.start();
  }

  let crackleSrc = null;
  if (vinylCrackle > 0) {
    const crackleBuf = getCrackleBuffer(ctx, (buffer.duration || 1) + 0.2);
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = crackleBuf;
    crackleSrc.loop = loop;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = (vinylCrackle / 100) * 1.4;
    crackleSrc.connect(crackleGain).connect(gain);
    crackleSrc.start();
  }

  let harmonizeSrc = null;
  if (harmonize > 0) {
    harmonizeSrc = ctx.createBufferSource();
    harmonizeSrc.buffer = buffer;
    harmonizeSrc.playbackRate.value = pitch * Math.pow(2, 7 / 12); // +7 semitones
    harmonizeSrc.loop = loop;
    const hGain = ctx.createGain();
    hGain.gain.value = (harmonize / 100) * 0.55;
    harmonizeSrc.connect(hGain).connect(gain);
    harmonizeSrc.start();
  }

  let growlSrc = null;
  if (growl > 0) {
    growlSrc = ctx.createBufferSource();
    growlSrc.buffer = buffer;
    growlSrc.playbackRate.value = pitch * 0.5; // -1 octave
    growlSrc.loop = loop;
    const growlShaper = ctx.createWaveShaper();
    growlShaper.curve = makeDistortionCurve(30 + growl * 0.4);
    growlShaper.oversample = '4x';
    const gGain = ctx.createGain();
    gGain.gain.value = (growl / 100) * 0.6;
    growlSrc.connect(growlShaper).connect(gGain).connect(gain);
    growlSrc.start();
  }

  let whisperSrc = null;
  if (whisper > 0) {
    const noiseBuf = getNoiseBuffer(ctx, (buffer.duration || 1) + 0.2);
    whisperSrc = ctx.createBufferSource();
    whisperSrc.buffer = noiseBuf;
    whisperSrc.loop = loop;
    const whisperFilter = ctx.createBiquadFilter();
    whisperFilter.type = 'bandpass';
    whisperFilter.frequency.value = 3500;
    whisperFilter.Q.value = 0.6;
    const wGain = ctx.createGain();
    wGain.gain.value = (whisper / 100) * 0.3;
    whisperSrc.connect(whisperFilter).connect(wGain).connect(gain);
    whisperSrc.start();
  }

  if (gateChop > 0) {
    const rate = 2 + (gateChop / 100) * 14;
    gain.gain.value = 0;
    const base = ctx.createConstantSource();
    base.offset.value = 0.5 * Math.max(0, Math.min(1.5, volume));
    base.connect(gain.gain);
    base.start();
    extraOscillators.push(base);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5 * Math.max(0, Math.min(1.5, volume));
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    extraOscillators.push(lfo);
  }

  let pumpInterval = null;
  if (pump > 0 && gateChop === 0) {
    const period = 0.6 - (pump / 100) * 0.4; // faster pump at higher amounts
    const low = Math.max(0, Math.min(1.5, volume)) * (1 - (pump / 100) * 0.85);
    const high = Math.max(0, Math.min(1.5, volume));
    pumpInterval = setInterval(() => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(low, t);
      gain.gain.linearRampToValueAtTime(high, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, low), t + period);
    }, Math.max(80, period * 1000));
  }

  let compressor = null;
  let colorNode = gain;
  if (compress > 0) {
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6 - (compress / 100) * 34;
    compressor.ratio.value = 2 + (compress / 100) * 18;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    gain.connect(compressor);
    colorNode = compressor;
  }

  let panner = null;
  if (ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    colorNode.connect(panner);
    colorNode = panner;
    if (autoPan > 0) {
      const rate = 0.4 + (autoPan / 100) * 3.5;
      const lfo = routeLFO(ctx, panner.pan, rate, Math.min(1, (autoPan / 100) * 1.1) * (1 - Math.abs(pan)));
      extraOscillators.push(lfo);
    }
    if (dopplerSweep > 0) {
      const dur = Math.max(0.2, (buffer.duration || 1) / Math.abs(pitch || 1));
      const now = ctx.currentTime;
      const spread = dopplerSweep / 100;
      panner.pan.cancelScheduledValues(now);
      panner.pan.setValueAtTime(-spread, now);
      panner.pan.linearRampToValueAtTime(spread, now + dur);
      const depth = spread * 0.35;
      src.playbackRate.cancelScheduledValues(now);
      src.playbackRate.setValueAtTime(pitch * (1 + depth), now);
      src.playbackRate.linearRampToValueAtTime(pitch * (1 - depth), now + dur);
    }
  }

  if (haas > 0) {
    const haasDelay = ctx.createDelay(0.05);
    haasDelay.delayTime.value = 0.005 + (haas / 100) * 0.025;
    const panL = ctx.createStereoPanner(); panL.pan.value = -1;
    const panR = ctx.createStereoPanner(); panR.pan.value = 1;
    const merge = ctx.createGain();
    colorNode.connect(panL).connect(merge);
    colorNode.connect(haasDelay).connect(panR).connect(merge);
    colorNode = merge;
  }

  if (stereoWidth > 0) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const midGain = ctx.createGain(); midGain.gain.value = 0.5;
    const sideScale = 1 + (stereoWidth / 100) * 3;
    const sideLGain = ctx.createGain(); sideLGain.gain.value = 0.5 * sideScale;
    const sideRGain = ctx.createGain(); sideRGain.gain.value = -0.5 * sideScale;
    const side = ctx.createGain();
    const invSide = ctx.createGain(); invSide.gain.value = -1;
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    colorNode.connect(splitter);
    splitter.connect(midGain, 0);
    splitter.connect(midGain, 1);
    splitter.connect(sideLGain, 0);
    splitter.connect(sideRGain, 1);
    sideLGain.connect(side);
    sideRGain.connect(side);
    midGain.connect(outL);
    midGain.connect(outR);
    side.connect(outL);
    side.connect(invSide).connect(outR);
    outL.connect(merger, 0, 0);
    outR.connect(merger, 0, 1);
    colorNode = merger;
  }

  if (reverbSend > 0) {
    const send = ctx.createGain();
    send.gain.value = (reverbSend / 100) * 0.8;
    colorNode.connect(send).connect(_reverb);
  }
  if (delaySend > 0) {
    const send = ctx.createGain();
    send.gain.value = (delaySend / 100) * 0.8;
    colorNode.connect(send).connect(_delay);
  }

  colorNode.connect(_bus);

  /* Per-instance analyser — parallel tap for this playback's own
     peak meter (used on library rows + the fx view header). */
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;
  colorNode.connect(analyser);

  if (jitter > 0) {
    const amtRange = (jitter / 100) * 0.15;
    jitterInterval = setInterval(() => {
      const variance = 1 + (Math.random() * 2 - 1) * amtRange;
      src.playbackRate.setTargetAtTime(pitch * variance, ctx.currentTime, 0.05);
    }, 120);
  }

  let pitchStepInterval = null;
  if (pitchStep > 0) {
    const steps = [-5, -3, 0, 2, 4, 7];
    const rateMs = Math.max(60, 260 - (pitchStep / 100) * 200);
    pitchStepInterval = setInterval(() => {
      const semis = steps[Math.floor(Math.random() * steps.length)];
      src.playbackRate.setTargetAtTime(pitch * Math.pow(2, semis / 12), ctx.currentTime, 0.01);
    }, rateMs);
  }

  if (wow > 0) {
    const wowLfo = routeLFO(ctx, src.playbackRate, 0.8 + (wow / 100) * 0.6, (wow / 100) * 0.015 * pitch);
    const flutterLfo = routeLFO(ctx, src.playbackRate, 7 + (wow / 100) * 3, (wow / 100) * 0.006 * pitch);
    extraOscillators.push(wowLfo, flutterLfo);
  }

  src.start();

  return {
    analyser,
    stop() {
      try { src.stop(); } catch { /* already stopped */ }
      if (noiseSrc) { try { noiseSrc.stop(); } catch { /* already stopped */ } }
      if (harmonizeSrc) { try { harmonizeSrc.stop(); } catch { /* already stopped */ } }
      if (crackleSrc) { try { crackleSrc.stop(); } catch { /* already stopped */ } }
      if (growlSrc) { try { growlSrc.stop(); } catch { /* already stopped */ } }
      if (whisperSrc) { try { whisperSrc.stop(); } catch { /* already stopped */ } }
      if (jitterInterval) clearInterval(jitterInterval);
      if (pitchStepInterval) clearInterval(pitchStepInterval);
      if (pumpInterval) clearInterval(pumpInterval);
      extraOscillators.forEach(osc => { try { osc.stop(); } catch { /* already stopped */ } });
      if (srNode) { try { srNode.disconnect(); srNode.onaudioprocess = null; } catch { /* noop */ } }
      if (talkboxAnalyser) { try { talkboxAnalyser.disconnect(); talkboxAnalyser.onaudioprocess = null; } catch { /* noop */ } }
      if (gateNode) { try { gateNode.disconnect(); gateNode.onaudioprocess = null; } catch { /* noop */ } }
      try { analyser.disconnect(); } catch { /* noop */ }
    },
  };
};
