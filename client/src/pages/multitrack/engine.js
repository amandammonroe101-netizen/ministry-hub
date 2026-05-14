/* ─────────────────────────────────────────────────────────────
   Multitrack engine — Web Audio playback, recording, mixdown.
   No dependencies.
   ───────────────────────────────────────────────────────────── */

let _ctx = null;
export const getCtx = () => {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/* ── Decode audio (data URL → AudioBuffer), cached by track id ── */
const _bufferCache = new Map();
export const decodeTrack = async (id, dataUrl) => {
  if (_bufferCache.has(id)) return _bufferCache.get(id);
  const ctx = getCtx();
  const res = await fetch(dataUrl);
  const arr = await res.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arr);
  _bufferCache.set(id, buffer);
  return buffer;
};
export const dropFromCache = (id) => _bufferCache.delete(id);

/* ── Peak data for waveform drawing ──────────────────────────── */
export const computePeaks = (buffer, bucketCount) => {
  const data = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(data.length / bucketCount));
  const peaks = new Float32Array(bucketCount);
  for (let b = 0; b < bucketCount; b++) {
    let max = 0;
    const start = b * bucketSize;
    const end = Math.min(data.length, start + bucketSize);
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
};

/** Effective sounding duration of a clip given its trims. */
export const clipDuration = (track) => {
  const full = track.buffer ? track.buffer.duration : 0;
  return Math.max(0, full - (track.trimStart || 0) - (track.trimEnd || 0));
};

/** Total project length (seconds). */
export const projectDuration = (tracks) => {
  let max = 0;
  for (const t of tracks) {
    if (!t.buffer) continue;
    max = Math.max(max, (t.clipOffset || 0) + clipDuration(t));
  }
  return max;
};

/* ── Tempo grid ──────────────────────────────────────────────── */
/** Beat / bar lengths (seconds) from tempo + time signature. */
export const gridMetrics = (tempo, timeSig = '4/4') => {
  const bpm = Math.max(20, tempo || 100);
  const parts = String(timeSig || '4/4').split('/');
  const beatsPerBar = Math.max(1, parseInt(parts[0], 10) || 4);
  const beatUnit    = Math.max(1, parseInt(parts[1], 10) || 4);
  // A "beat" is the note value in the denominator, measured against a quarter note.
  const beatSec = (60 / bpm) * (4 / beatUnit);
  return { beatSec, barSec: beatSec * beatsPerBar, beatsPerBar };
};

/** Snap a time (seconds) to the nearest multiple of `division`. */
export const snapToGrid = (sec, division) =>
  (!division || division <= 0) ? sec : Math.round(sec / division) * division;

/* ── Channel-strip helpers ───────────────────────────────────── */
export const DEFAULT_FX = {
  eqLow: 0, eqMid: 0, eqHigh: 0,     // dB  (-12 … +12)
  compThreshold: 0, compRatio: 1,    // dB / ratio  (0 / 1 = bypass)
  reverbSend: 0,                     // 0 … 1
};

/** Synthetic reverb impulse response (decaying noise). */
const makeImpulse = (ctx, seconds = 2.4, decay = 2.4) => {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
};

/** Build a master bus: input gain → limiter → destination. Returns nodes. */
const makeMasterBus = (ctx, dest, masterVolume = 1) => {
  const masterGain = ctx.createGain();
  masterGain.gain.value = masterVolume;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  masterGain.connect(limiter).connect(dest);
  // metering tap on the final output
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  limiter.connect(analyser);
  // shared reverb return → master
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverb.connect(reverbReturn).connect(masterGain);
  return { masterGain, limiter, reverb, analyser };
};

/** Peak level (0..~1.3) from an AnalyserNode's time-domain data. */
const _meterBuf = new Float32Array(256);
const readLevel = (analyser) => {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(_meterBuf);
  let peak = 0;
  for (let i = 0; i < _meterBuf.length; i++) {
    const v = Math.abs(_meterBuf[i]);
    if (v > peak) peak = v;
  }
  return peak;
};

/** Build one track's channel strip: source → vol → EQ×3 → comp → pan → master + reverb send. */
const buildChannelStrip = (ctx, src, tr, masterGain, reverbNode) => {
  const fx = tr.effects || {};
  const vol = ctx.createGain();
  vol.gain.value = tr.volume ?? 1;

  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf'; eqLow.frequency.value = 250; eqLow.gain.value = fx.eqLow || 0;
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking'; eqMid.frequency.value = 1200; eqMid.Q.value = 0.8; eqMid.gain.value = fx.eqMid || 0;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000; eqHigh.gain.value = fx.eqHigh || 0;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = fx.compThreshold ?? 0;
  comp.ratio.value = Math.max(1, fx.compRatio ?? 1);
  comp.knee.value = 6;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;

  const panner = ctx.createStereoPanner();
  panner.pan.value = tr.pan ?? 0;

  src.connect(vol).connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp).connect(panner);
  panner.connect(masterGain);                       // dry path

  const send = ctx.createGain();
  send.gain.value = fx.reverbSend || 0;
  panner.connect(send).connect(reverbNode);         // reverb send

  // metering tap (post-fader, post-FX)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  panner.connect(analyser);

  return { vol, eqLow, eqMid, eqHigh, comp, panner, send, analyser };
};

/* ── Multitrack player ───────────────────────────────────────── */
export class MultitrackPlayer {
  constructor(masterVolume = 1) {
    this.ctx = getCtx();
    this.sources = [];
    this.strips = {};       // trackId → channel-strip node refs (for live tweaks)
    this.startedAt = 0;     // ctx time that corresponds to project time 0
    this.playing = false;
    const bus = makeMasterBus(this.ctx, this.ctx.destination, masterVolume);
    this.masterGain = bus.masterGain;
    this.reverb = bus.reverb;
    this.masterAnalyser = bus.analyser;
  }

  /** tracks: [{ id, buffer, volume, pan, muted, solo, clipOffset, trimStart, trimEnd, effects }] */
  play(tracks, fromTime = 0, onEnded) {
    this.stop();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.08;
    this.startedAt = t0 - fromTime;
    this.playing = true;
    this.strips = {};

    const anySolo = tracks.some(t => t.solo);
    let endsAt = 0;

    tracks.forEach(tr => {
      if (!tr.buffer || tr.muted) return;
      if (anySolo && !tr.solo) return;

      const src = ctx.createBufferSource();
      src.buffer = tr.buffer;
      this.strips[tr.id] = buildChannelStrip(ctx, src, tr, this.masterGain, this.reverb);

      const dur = clipDuration(tr);
      const clipStart = tr.clipOffset || 0;
      const clipEndProj = clipStart + dur;
      if (clipEndProj <= fromTime) return;            // clip already finished

      if (clipStart >= fromTime) {
        const at = t0 + (clipStart - fromTime);
        src.start(at, tr.trimStart || 0, dur);
        endsAt = Math.max(endsAt, at + dur);
      } else {
        // playhead is mid-clip — start partway in
        const into = fromTime - clipStart;
        src.start(t0, (tr.trimStart || 0) + into, dur - into);
        endsAt = Math.max(endsAt, t0 + (dur - into));
      }
      this.sources.push(src);
    });

    if (onEnded && endsAt > 0) {
      this._endTimer = setTimeout(() => {
        if (this.playing) { this.playing = false; onEnded(); }
      }, (endsAt - ctx.currentTime) * 1000 + 60);
    }
  }

  stop() {
    if (this._endTimer) { clearTimeout(this._endTimer); this._endTimer = null; }
    this.sources.forEach(s => { try { s.stop(); } catch {} });
    this.sources = [];
    this.strips = {};
    this.playing = false;
  }

  /** Current project time, given playback is running. */
  now() {
    return this.ctx.currentTime - this.startedAt;
  }

  /* ── live tweaks (apply mid-playback) ─────────────────────── */
  setMasterVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }
  updateTrackMix(trackId, { volume, pan }) {
    const s = this.strips[trackId];
    if (!s) return;
    if (volume !== undefined) s.vol.gain.value = volume;
    if (pan !== undefined) s.panner.pan.value = pan;
  }
  updateTrackFx(trackId, fx = {}) {
    const s = this.strips[trackId];
    if (!s) return;
    s.eqLow.gain.value  = fx.eqLow || 0;
    s.eqMid.gain.value  = fx.eqMid || 0;
    s.eqHigh.gain.value = fx.eqHigh || 0;
    s.comp.threshold.value = fx.compThreshold ?? 0;
    s.comp.ratio.value     = Math.max(1, fx.compRatio ?? 1);
    s.send.gain.value   = fx.reverbSend || 0;
  }

  /** Read current peak levels: { master, [trackId]: level }. */
  getLevels() {
    const out = { master: readLevel(this.masterAnalyser) };
    for (const id in this.strips) {
      out[id] = readLevel(this.strips[id].analyser);
    }
    return out;
  }
}

/* ── Count-in metronome ──────────────────────────────────────── */
export const playCountIn = (bpm, beats = 4) => {
  const ctx = getCtx();
  const interval = 60 / bpm;
  const start = ctx.currentTime + 0.06;
  for (let i = 0; i < beats; i++) {
    const t = start + i * interval;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i === 0 ? 1600 : 1100;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }
  return beats * interval;   // seconds until the count-in ends
};

/* ── Microphone recorder ─────────────────────────────────────── */
/** Raw, un-processed mic constraints — we don't want the browser
 *  gain-riding or gating a musical performance. */
const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/**
 * Opens the mic, starts a MediaRecorder, and exposes:
 *   - recStartCtxTime : AudioContext time captured the instant recording began
 *   - getLevel()      : current input peak (0..~1) for live metering
 *   - setMonitor(on)  : route the mic to the speakers (input monitoring)
 *   - stop()          : stop + resolve to a base64 data URL of the take
 */
export const startMicRecording = async ({ monitor = false } = {}) => {
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const ctx = getCtx();
  const srcNode = ctx.createMediaStreamSource(stream);

  // live input metering tap
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  srcNode.connect(analyser);

  // optional input monitoring (mic → speakers)
  const monitorGain = ctx.createGain();
  monitorGain.gain.value = monitor ? 1 : 0;
  srcNode.connect(monitorGain).connect(ctx.destination);

  const mr = new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mr.start();
  const recStartCtxTime = ctx.currentTime;

  return {
    recStartCtxTime,
    getLevel: () => readLevel(analyser),
    setMonitor(on) { monitorGain.gain.value = on ? 1 : 0; },
    stop() {
      return new Promise((resolve) => {
        mr.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          stream.getTracks().forEach(t => t.stop());
          try { srcNode.disconnect(); monitorGain.disconnect(); } catch {}
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        };
        try { mr.stop(); } catch { resolve(null); }
      });
    },
  };
};

/**
 * Round-trip latency calibration. Plays a series of clicks through the
 * speakers while recording the mic, then measures how late each click
 * lands in the recording. Returns the median offset in milliseconds.
 *
 * Requires the mic to actually hear the speakers — use the built-in
 * speakers + mic (not headphones) and a reasonable volume.
 */
export const calibrateLatency = async ({ clicks = 6, gap = 0.45 } = {}) => {
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const ctx = getCtx();
  const mr = new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mr.start();
  const recStart = ctx.currentTime;

  // schedule a row of short, bright clicks
  const firstClick = recStart + 0.4;
  const clickTimes = [];
  for (let i = 0; i < clicks; i++) {
    const t = firstClick + i * gap;
    clickTimes.push(t);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 2000;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // wait until well past the last click
  const waitMs = (clickTimes[clickTimes.length - 1] - ctx.currentTime + 0.5) * 1000;
  await new Promise(r => setTimeout(r, Math.max(0, waitMs)));

  // stop + decode the recording
  const dataUrl = await new Promise((resolve) => {
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    };
    try { mr.stop(); } catch { resolve(null); }
  });
  if (!dataUrl) throw new Error('Calibration recording failed.');
  const res = await fetch(dataUrl);
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  const data = buf.getChannelData(0);
  const rate = buf.sampleRate;

  // for each click, find the loudest sample in a window after its expected time
  const offsets = [];
  for (let i = 0; i < clickTimes.length; i++) {
    const expected = clickTimes[i] - recStart;          // seconds into the recording
    const from = Math.max(0, Math.floor((expected - 0.03) * rate));
    const to   = Math.min(data.length, Math.floor((expected + 0.30) * rate));
    let peakIdx = -1, peakVal = 0;
    for (let s = from; s < to; s++) {
      const v = Math.abs(data[s]);
      if (v > peakVal) { peakVal = v; peakIdx = s; }
    }
    if (peakIdx >= 0 && peakVal > 0.04) offsets.push(peakIdx / rate - expected);
  }
  if (offsets.length < 2) {
    throw new Error('No clicks detected. Use your built-in speakers + mic and turn the volume up.');
  }
  offsets.sort((a, b) => a - b);
  const median = offsets[Math.floor(offsets.length / 2)];
  return Math.round(Math.min(0.5, Math.max(0, median)) * 1000);
};

/* ── Mixdown → AudioBuffer (OfflineAudioContext) ─────────────── */
/** Renders with the full channel-strip chain + master limiter so the
 *  export matches what you hear live. */
export const mixdown = async (tracks, masterVolume = 1) => {
  const dur = projectDuration(tracks);
  if (dur <= 0) return null;
  const rate = 44100;
  const offline = new OfflineAudioContext(2, Math.ceil(dur * rate) + rate, rate);
  const anySolo = tracks.some(t => t.solo);

  const bus = makeMasterBus(offline, offline.destination, masterVolume);

  tracks.forEach(tr => {
    if (!tr.buffer || tr.muted) return;
    if (anySolo && !tr.solo) return;
    const src = offline.createBufferSource();
    src.buffer = tr.buffer;
    buildChannelStrip(offline, src, tr, bus.masterGain, bus.reverb);
    src.start(tr.clipOffset || 0, tr.trimStart || 0, clipDuration(tr));
  });

  return offline.startRendering();
};

/* ── Encode an AudioBuffer → 16-bit PCM WAV Blob ─────────────── */
export const encodeWav = (buffer) => {
  const numCh = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = samples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // interleave channels
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
};

/** Blob → base64 data URL (for saving to a Song recording). */
export const blobToDataUrl = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
