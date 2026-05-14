import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import NavRail from '../../components/layout/NavRail';
import { studioProjectService } from '../../services/studioProjectService';
import { songService } from '../../services/songService';
import {
  MultitrackPlayer, decodeTrack, dropFromCache, computePeaks,
  clipDuration, projectDuration, playCountIn, startMicRecording,
  calibrateLatency, mixdown, encodeWav, blobToDataUrl, DEFAULT_FX, getCtx,
  gridMetrics, snapToGrid,
} from './engine';
import './Multitrack.css';

const TRACK_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#fb923c'];
const RULER_H = 28;
const TRACK_H = 92;

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const fmtPrecise = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${m}:${r.padStart(4, '0')}`;
};
/** Seconds → "bar.beat" given a tempo grid. */
const fmtBarsBeats = (s, grid) => {
  if (!grid || !grid.beatSec || !isFinite(s) || s < 0) return '1.1';
  const totalBeats = s / grid.beatSec;
  const bar  = Math.floor(totalBeats / grid.beatsPerBar) + 1;
  const beat = Math.floor(totalBeats % grid.beatsPerBar) + 1;
  return `${bar}.${beat}`;
};

const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8'];

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Multitrack() {
  const [projects, setProjects]   = useState([]);
  const [selected, setSelected]   = useState(null);   // full project with .tracks (db shape)
  const [buffers, setBuffers]     = useState({});      // trackId → { buffer, peaks }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [playing, setPlaying]     = useState(false);
  const [recording, setRecording] = useState(null);   // null | 'arming' | 'recording'
  const [playhead, setPlayhead]   = useState(0);
  const [pxPerSec, setPxPerSec]   = useState(80);
  const [countIn, setCountIn]     = useState(true);
  const [rulerMode, setRulerMode] = useState('bars'); // 'bars' | 'time'
  const [snap, setSnap]           = useState('beat'); // 'off' | 'bar' | 'beat'
  const [showMixer, setShowMixer] = useState(false);
  const [levels, setLevels]       = useState({});
  const [monitorInput, setMonitorInput]   = useState(false);
  const [recSettingsOpen, setRecSettingsOpen] = useState(false);
  const [calibStatus, setCalibStatus]      = useState(null); // null | 'running' | {ms} | {error}

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [mixdownState, setMixdownState]     = useState(null); // null | 'rendering' | { blob, dataUrl }
  const [songs, setSongs]                   = useState([]);

  const playerRef    = useRef(null);
  const rafRef       = useRef(null);
  const recorderRef  = useRef(null);
  const recStartRef  = useRef(0);
  const recLeadInRef = useRef(0);     // seconds recorded before playback began (count-in + pre-roll)
  const countInTimerRef = useRef(null);
  const inputRafRef  = useRef(null);  // input-meter RAF while arming (pre-playback)
  const fileInputRef = useRef(null);
  const scrollRef    = useRef(null);
  const dragRef        = useRef(null);
  const saveTimers     = useRef({});
  const masterSaveTimer = useRef(null);
  const latencySaveTimer = useRef(null);

  /* ── load ────────────────────────────────────────────────── */
  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    songService.getAll().then(r => setSongs(r.data.data)).catch(() => {});
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await studioProjectService.getAll();
      setProjects(res.data.data);
    } catch { setError('Could not load projects.'); }
    finally { setLoading(false); }
  };

  const loadProject = async (id) => {
    try {
      stopAll();
      const res = await studioProjectService.getOne(id);
      const proj = res.data.data;
      setSelected(proj);
      setPlayhead(0);
      // decode every track
      const next = {};
      for (const t of proj.tracks) {
        try {
          const buffer = await decodeTrack(t.id, t.audio_data);
          next[t.id] = { buffer, peaks: computePeaks(buffer, 2000) };
        } catch { /* skip undecodable */ }
      }
      setBuffers(next);
    } catch { setError('Could not open project.'); }
  };

  /* ── project mutations ───────────────────────────────────── */
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await studioProjectService.create({ name: newProjectName.trim() });
      setNewProjectName('');
      setShowNewProject(false);
      await fetchProjects();
      loadProject(res.data.data.id);
    } catch { setError('Failed to create project.'); }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete this project and all its tracks?')) return;
    try {
      await studioProjectService.delete(id);
      if (selected?.id === id) setSelected(null);
      await fetchProjects();
    } catch { setError('Failed to delete project.'); }
  };

  /* ── track persistence (debounced) ───────────────────────── */
  const patchTrackLocal = (trackId, patch) => {
    setSelected(s => s ? {
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, ...patch } : t),
    } : s);
  };
  const saveTrack = (trackId, patch) => {
    clearTimeout(saveTimers.current[trackId]);
    saveTimers.current[trackId] = setTimeout(() => {
      studioProjectService.updateTrack(selected.id, trackId, patch).catch(() => {});
    }, 400);
  };
  const updateTrack = (trackId, patch) => {
    patchTrackLocal(trackId, patch);
    saveTrack(trackId, patch);
    if (patch.volume !== undefined || patch.pan !== undefined) {
      playerRef.current?.updateTrackMix(trackId, patch);
    }
  };

  const updateTrackFx = (trackId, fxPatch) => {
    const track = selected.tracks.find(t => t.id === trackId);
    const nextFx = { ...DEFAULT_FX, ...(track?.effects || {}), ...fxPatch };
    patchTrackLocal(trackId, { effects: nextFx });
    saveTrack(trackId, { effects: nextFx });
    playerRef.current?.updateTrackFx(trackId, nextFx);
  };

  const updateMasterVolume = (v) => {
    setSelected(s => s ? { ...s, master_volume: v } : s);
    playerRef.current?.setMasterVolume(v);
    clearTimeout(masterSaveTimer.current);
    masterSaveTimer.current = setTimeout(() => {
      studioProjectService.update(selected.id, { master_volume: v }).catch(() => {});
    }, 400);
  };

  const removeTrack = async (trackId) => {
    if (!confirm('Delete this track?')) return;
    try {
      await studioProjectService.removeTrack(selected.id, trackId);
      dropFromCache(trackId);
      setSelected(s => ({ ...s, tracks: s.tracks.filter(t => t.id !== trackId) }));
      setBuffers(b => { const n = { ...b }; delete n[trackId]; return n; });
    } catch { setError('Failed to delete track.'); }
  };

  /* ── engine track builder ────────────────────────────────── */
  const engineTracks = useCallback(() => {
    if (!selected) return [];
    return selected.tracks.map(t => ({
      id: t.id,
      buffer: buffers[t.id]?.buffer || null,
      volume: t.volume,
      pan: t.pan,
      muted: !!t.is_muted,
      solo: !!t.is_solo,
      clipOffset: t.clip_offset,
      trimStart: t.trim_start,
      trimEnd: t.trim_end,
      effects: t.effects || {},
    }));
  }, [selected, buffers]);

  /* ── transport ───────────────────────────────────────────── */
  const startPlayback = (from) => {
    const player = new MultitrackPlayer(selected?.master_volume ?? 1);
    playerRef.current = player;
    player.play(engineTracks(), from, () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    });
    setPlaying(true);
    const tick = () => {
      setPlayhead(player.now());
      const lv = player.getLevels();
      if (recorderRef.current?.getLevel) lv.input = recorderRef.current.getLevel();
      setLevels(lv);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  /* input-only meter loop — runs while arming, before playback's RAF starts */
  const startInputMeter = () => {
    cancelAnimationFrame(inputRafRef.current);
    const loop = () => {
      const lvl = recorderRef.current?.getLevel?.() ?? 0;
      setLevels(prev => ({ ...prev, input: lvl }));
      inputRafRef.current = requestAnimationFrame(loop);
    };
    inputRafRef.current = requestAnimationFrame(loop);
  };
  const stopInputMeter = () => cancelAnimationFrame(inputRafRef.current);

  const stopPlayback = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setLevels({});
  };

  const stopAll = () => {
    stopPlayback();
    stopInputMeter();
    if (countInTimerRef.current) { clearTimeout(countInTimerRef.current); countInTimerRef.current = null; }
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch {}   // releases the mic stream
      recorderRef.current = null;
    }
    setRecording(null);
  };

  const handlePlayStop = () => {
    if (playing) stopPlayback();
    else if (selected && selected.tracks.length) startPlayback(playhead);
  };

  const handleRecord = async () => {
    if (recording) return stopRecording();
    if (!selected) return;
    setRecording('arming');
    // Open the mic up front so the input meter is live during the count-in.
    let rec;
    try {
      rec = await startMicRecording({ monitor: monitorInput });
    } catch {
      setError('Microphone unavailable or permission denied.');
      setRecording(null);
      return;
    }
    recorderRef.current = rec;
    startInputMeter();
    const begin = () => {
      countInTimerRef.current = null;
      recStartRef.current = playhead;
      // how much audio was captured before playback actually started
      recLeadInRef.current = getCtx().currentTime - rec.recStartCtxTime;
      stopInputMeter();          // playback's RAF takes over input metering
      startPlayback(playhead);   // overdub: existing tracks play while we record
      setRecording('recording');
    };
    if (countIn) {
      const dur = playCountIn(selected.tempo || 100, 4);
      countInTimerRef.current = setTimeout(begin, dur * 1000);
    } else {
      begin();
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (countInTimerRef.current) { clearTimeout(countInTimerRef.current); countInTimerRef.current = null; }
    stopInputMeter();
    const wasRecording = recording === 'recording';
    stopPlayback();
    setRecording('arming');   // "saving…"
    if (!rec) { setRecording(null); return; }
    try {
      const dataUrl = await rec.stop();
      if (!wasRecording || !dataUrl) { setRecording(null); return; }  // stopped during count-in
      // Trim off the count-in / pre-roll, plus latency compensation, from the take's head.
      const latencySec = (selected.record_latency_ms || 0) / 1000;
      const trimStart  = Math.max(0, recLeadInRef.current + latencySec);
      await studioProjectService.addTrack(selected.id, {
        name: `Track ${selected.tracks.length + 1}`,
        audio_data: dataUrl,
        clip_offset: recStartRef.current,
        trim_start: trimStart,
      });
      await loadProject(selected.id);
    } catch { setError('Failed to save recording.'); }
    setRecording(null);
  };

  /* ── recording settings: monitoring + latency calibration ───── */
  const toggleMonitor = () => {
    setMonitorInput(on => {
      const next = !on;
      recorderRef.current?.setMonitor?.(next);
      return next;
    });
  };

  const updateRecLatency = (ms) => {
    const v = Math.max(0, Math.min(500, Math.round(ms) || 0));
    setSelected(s => s ? { ...s, record_latency_ms: v } : s);
    clearTimeout(latencySaveTimer.current);
    latencySaveTimer.current = setTimeout(() => {
      studioProjectService.update(selected.id, { record_latency_ms: v }).catch(() => {});
    }, 400);
  };

  const runCalibration = async () => {
    if (!selected) return;
    setCalibStatus('running');
    try {
      const ms = await calibrateLatency();
      updateRecLatency(ms);
      setCalibStatus({ ms });
    } catch (err) {
      setCalibStatus({ error: err.message || 'Calibration failed.' });
    }
  };

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    try {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(file);
      });
      await studioProjectService.addTrack(selected.id, {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported',
        audio_data: dataUrl,
        clip_offset: playhead,
      });
      await loadProject(selected.id);
    } catch { setError('Could not import that file.'); }
  };

  // cleanup
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(inputRafRef.current);
    if (countInTimerRef.current) clearTimeout(countInTimerRef.current);
    playerRef.current?.stop();
    if (recorderRef.current) { try { recorderRef.current.stop(); } catch {} }
  }, []);

  /* ── mixdown ─────────────────────────────────────────────── */
  const handleMixdown = async () => {
    if (!selected || selected.tracks.length === 0) return;
    setMixdownState('rendering');
    try {
      const rendered = await mixdown(engineTracks(), selected?.master_volume ?? 1);
      if (!rendered) { setMixdownState(null); return; }
      const blob = encodeWav(rendered);
      const dataUrl = await blobToDataUrl(blob);
      setMixdownState({ blob, dataUrl });
    } catch { setError('Mixdown failed.'); setMixdownState(null); }
  };
  const downloadMix = () => {
    const url = URL.createObjectURL(mixdownState.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(selected.name || 'mix').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.wav`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const saveMixToSong = async (songId) => {
    try {
      await songService.addRecording(songId, {
        label: `${selected.name} (mixdown)`,
        audio_data: mixdownState.dataUrl,
        duration: projectDuration(engineTracks()),
      });
      setMixdownState(null);
      setError(null);
      alert('Mixdown saved to song.');
    } catch { setError('Failed to save to song.'); }
  };

  /* ── timeline geometry ───────────────────────────────────── */
  const totalDur = useMemo(() => {
    const d = projectDuration(engineTracks());
    return Math.max(d, 20);   // minimum 20s of canvas
  }, [engineTracks]);
  const timelineW = totalDur * pxPerSec;

  /* tempo grid */
  const grid = useMemo(
    () => gridMetrics(selected?.tempo, selected?.time_signature),
    [selected?.tempo, selected?.time_signature]
  );
  const snapSec = snap === 'bar' ? grid.barSec : snap === 'beat' ? grid.beatSec : 0;
  const applySnap = useCallback((t) => snapToGrid(t, snapSec), [snapSec]);

  /* vertical beat / bar gridlines drawn behind the lanes */
  const gridLines = useMemo(() => {
    if (!selected || !grid.beatSec) return [];
    const beatPx = grid.beatSec * pxPerSec;
    const lines = [];
    if (beatPx >= 7) {
      const n = Math.min(4000, Math.ceil(totalDur / grid.beatSec) + 1);
      for (let i = 0; i < n; i++)
        lines.push({ x: i * grid.beatSec, bar: i % grid.beatsPerBar === 0 });
    } else {
      const n = Math.min(2000, Math.ceil(totalDur / grid.barSec) + 1);
      for (let i = 0; i < n; i++) lines.push({ x: i * grid.barSec, bar: true });
    }
    return lines;
  }, [selected, grid, totalDur, pxPerSec]);

  /* ruler ticks — bar numbers or seconds depending on mode */
  const rulerTicks = useMemo(() => {
    if (rulerMode === 'bars') {
      if (!grid.barSec) return [];
      const barPx = grid.barSec * pxPerSec;
      const every = barPx >= 44 ? 1 : barPx >= 22 ? 2 : barPx >= 11 ? 4 : 8;
      const bars = Math.min(2000, Math.ceil(totalDur / grid.barSec) + 1);
      const ticks = [];
      for (let b = 0; b < bars; b++)
        if (b % every === 0) ticks.push({ t: b * grid.barSec, label: String(b + 1) });
      return ticks;
    }
    const step = pxPerSec >= 120 ? 1 : pxPerSec >= 50 ? 2 : 5;
    const ticks = [];
    for (let t = 0; t <= totalDur; t += step) ticks.push({ t, label: fmt(t) });
    return ticks;
  }, [rulerMode, grid, totalDur, pxPerSec]);

  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const t = applySnap(Math.max(0, x / pxPerSec));
    if (playing) { stopPlayback(); }
    setPlayhead(Math.max(0, t));
  };

  /* ── clip drag (offset) + trim handles ───────────────────── */
  const beginClipDrag = (e, track, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const base = {
      offset: track.clip_offset,
      trimStart: track.trim_start,
      trimEnd: track.trim_end,
    };
    dragRef.current = { trackId: track.id, mode, startX, base };
    window.addEventListener('mousemove', onClipDrag);
    window.addEventListener('mouseup', endClipDrag);
  };
  const onClipDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / pxPerSec;
    const track = selected.tracks.find(t => t.id === d.trackId);
    const buf = buffers[d.trackId]?.buffer;
    if (!track || !buf) return;
    if (d.mode === 'move') {
      patchTrackLocal(d.trackId, { clip_offset: Math.max(0, applySnap(d.base.offset + dx)) });
    } else if (d.mode === 'trim-start') {
      const max = buf.duration - d.base.trimEnd - 0.05;
      const ts = Math.min(Math.max(0, d.base.trimStart + dx), max);
      // keep the clip's left visual edge anchored to audio: also shift offset
      patchTrackLocal(d.trackId, {
        trim_start: ts,
        clip_offset: Math.max(0, d.base.offset + (ts - d.base.trimStart)),
      });
    } else if (d.mode === 'trim-end') {
      const max = buf.duration - d.base.trimStart - 0.05;
      const te = Math.min(Math.max(0, d.base.trimEnd - dx), max);
      patchTrackLocal(d.trackId, { trim_end: te });
    }
  };
  const endClipDrag = () => {
    const d = dragRef.current;
    window.removeEventListener('mousemove', onClipDrag);
    window.removeEventListener('mouseup', endClipDrag);
    dragRef.current = null;
    if (!d) return;
    const track = selected.tracks.find(t => t.id === d.trackId);
    if (track) {
      saveTrack(d.trackId, {
        clip_offset: track.clip_offset,
        trim_start: track.trim_start,
        trim_end: track.trim_end,
      });
    }
  };

  /* nudge by one grid step (snap on) or a fine 0.05s (snap off) */
  const nudge = (track, dir) => {
    const next = snapSec
      ? snapToGrid(track.clip_offset + dir * (snapSec + 1e-4), snapSec)
      : track.clip_offset + dir * 0.05;
    updateTrack(track.id, { clip_offset: Math.max(0, next) });
  };

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="mt-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag multitrack">Multitrack</span>
        </div>
        <div className="app-tb-actions">
          <span className="mt-tb-hint">Record layers · overdub · edit · mix down</span>
        </div>
      </div>

      <div className="mt-body">
        <NavRail />

        {/* ── Project sidebar ── */}
        <aside className="mt-sidebar">
          <div className="app-panel-header">
            <span className="app-panel-title">Projects</span>
          </div>
          {error && (
            <div className="mt-error">{error}<button onClick={() => setError(null)}>✕</button></div>
          )}
          <div className="mt-project-list">
            {loading ? (
              <div className="mt-muted">Loading…</div>
            ) : projects.length === 0 ? (
              <div className="mt-muted">No projects yet.</div>
            ) : projects.map(p => (
              <button
                key={p.id}
                className={`mt-project ${selected?.id === p.id ? 'sel' : ''}`}
                onClick={() => loadProject(p.id)}
              >
                <div className="mt-project-name">🎚 {p.name}</div>
                <div className="mt-project-meta">{p.trackCount} track{p.trackCount === 1 ? '' : 's'}</div>
              </button>
            ))}
            {showNewProject ? (
              <div className="mt-new-project">
                <input
                  className="mt-inp"
                  placeholder="Project name…"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  autoFocus
                />
                <div className="mt-new-project-btns">
                  <button className="app-btn ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
                  <button className="app-btn primary" onClick={createProject} disabled={!newProjectName.trim()}>Create</button>
                </div>
              </div>
            ) : (
              <button className="mt-project mt-project-add" onClick={() => setShowNewProject(true)}>
                <div className="mt-project-name">+ New project</div>
              </button>
            )}
          </div>
        </aside>

        {/* ── Main workspace ── */}
        <main className="mt-main">
          {!selected ? (
            <div className="app-empty mt-empty">
              <div className="app-empty-icon">🎚</div>
              <div className="app-empty-title">Multitrack recording studio</div>
              <div className="app-empty-sub">
                Record layer after layer — each new take plays the previous tracks back so you
                can build a full arrangement. Trim, nudge, mix, and export.
              </div>
              <div className="mt-start-steps">
                <div className="mt-start-title">First time? Try this:</div>
                <ol className="mt-start-list">
                  <li><b>Create a project</b> in the sidebar.</li>
                  <li><b>Hit Record</b> — sing or play your first layer (count-in optional).</li>
                  <li><b>Record again</b> — track 1 plays back while you add track 2.</li>
                  <li><b>Trim &amp; nudge</b> the clips to line up, then <b>Mix Down</b> to a WAV.</li>
                </ol>
              </div>
              <button className="app-btn primary" onClick={() => setShowNewProject(true)}>
                ✦ Create your first project
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="mt-toolbar">
                <input
                  className="mt-project-title"
                  value={selected.name}
                  onChange={e => {
                    setSelected(s => ({ ...s, name: e.target.value }));
                  }}
                  onBlur={e => studioProjectService.update(selected.id, { name: e.target.value }).then(fetchProjects)}
                />
                <label className="mt-tempo">
                  <input
                    type="number" min="40" max="240"
                    value={selected.tempo}
                    onChange={e => {
                      const tempo = parseInt(e.target.value, 10) || 100;
                      setSelected(s => ({ ...s, tempo }));
                    }}
                    onBlur={e => studioProjectService.update(selected.id, { tempo: parseInt(e.target.value, 10) || 100 })}
                  />
                  <span>BPM</span>
                </label>
                <label className="mt-tempo mt-timesig">
                  <select
                    value={selected.time_signature || '4/4'}
                    onChange={e => {
                      const ts = e.target.value;
                      setSelected(s => ({ ...s, time_signature: ts }));
                      studioProjectService.update(selected.id, { time_signature: ts }).catch(() => {});
                    }}
                  >
                    {TIME_SIGS.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                  </select>
                </label>
                <div className="mt-toolbar-spacer" />
                <button className="app-btn ghost" onClick={() => fileInputRef.current?.click()}>
                  ⬆ Add track from file
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleAddFile} />
                <button
                  className={`app-btn ${showMixer ? 'primary' : 'ghost'}`}
                  onClick={() => setShowMixer(v => !v)}
                  title="Toggle mixing console"
                >🎛 Mixer</button>
                <button
                  className="app-btn primary"
                  onClick={handleMixdown}
                  disabled={selected.tracks.length === 0 || mixdownState === 'rendering'}
                >
                  {mixdownState === 'rendering' ? 'Rendering…' : '⬇ Mix Down'}
                </button>
                <div className="mt-grid-ctrl">
                  <button
                    className="mt-grid-toggle"
                    onClick={() => setRulerMode(m => (m === 'bars' ? 'time' : 'bars'))}
                    title="Ruler: bars or time"
                  >{rulerMode === 'bars' ? '𝄞 Bars' : '⏱ Time'}</button>
                  <label className="mt-snap">
                    <span>Snap</span>
                    <select value={snap} onChange={e => setSnap(e.target.value)}>
                      <option value="off">Off</option>
                      <option value="beat">Beat</option>
                      <option value="bar">Bar</option>
                    </select>
                  </label>
                </div>
                <div className="mt-zoom">
                  <button className="mt-zoom-btn" onClick={() => setPxPerSec(p => Math.max(20, p - 20))}>−</button>
                  <span className="mt-zoom-lbl">zoom</span>
                  <button className="mt-zoom-btn" onClick={() => setPxPerSec(p => Math.min(240, p + 20))}>+</button>
                </div>
              </div>

              {/* Transport */}
              <div className="mt-transport">
                <button className="mt-tp-btn" onClick={() => { stopPlayback(); setPlayhead(0); }} title="Return to start">⏮</button>
                <button
                  className={`mt-tp-btn ${playing ? 'on' : ''}`}
                  onClick={handlePlayStop}
                  disabled={recording !== null}
                  title="Play / Stop"
                >{playing ? '⏹' : '▶'}</button>
                <button
                  className={`mt-tp-btn mt-tp-rec ${recording ? 'on' : ''}`}
                  onClick={handleRecord}
                  title="Record (overdub)"
                >
                  {recording === 'arming' ? '…' : recording === 'recording' ? '⏹' : '⏺'}
                </button>
                <button
                  className={`mt-tp-btn mt-tp-gear ${recSettingsOpen ? 'on' : ''}`}
                  onClick={() => setRecSettingsOpen(v => !v)}
                  title="Recording settings"
                >⚙</button>
                <div className="mt-tp-time">{fmtPrecise(playhead)}</div>
                <div className="mt-tp-bars" title="Bar . beat">{fmtBarsBeats(playhead, grid)}</div>
                <label className="mt-countin">
                  <input type="checkbox" checked={countIn} onChange={e => setCountIn(e.target.checked)} />
                  Count-in
                </label>
                {recording && (
                  <div className="mt-tp-input-meter">
                    <span className="mt-tp-input-lbl">🎤 INPUT</span>
                    <Meter level={levels.input || 0} horizontal />
                  </div>
                )}
                {recording === 'recording' && (
                  <span className="mt-rec-live"><span className="mt-rec-dot" /> Recording — overdubbing</span>
                )}
                {recording === 'arming' && (
                  <span className="mt-rec-arming">Get ready…</span>
                )}
                <div className="mt-tp-master-meter">
                  <span className="mt-tp-master-lbl">MASTER</span>
                  <Meter level={levels.master || 0} horizontal />
                </div>

                {recSettingsOpen && (
                  <div className="mt-rec-settings">
                    <div className="mt-rec-settings-title">Recording settings</div>

                    <label className="mt-rec-opt">
                      <input
                        type="checkbox"
                        checked={monitorInput}
                        onChange={toggleMonitor}
                      />
                      <span>
                        Input monitoring
                        <small>Hear yourself through the app — use headphones to avoid feedback.</small>
                      </span>
                    </label>

                    <div className="mt-rec-opt-block">
                      <div className="mt-rec-opt-row">
                        <span>Recording latency</span>
                        <span className="mt-rec-latency-input">
                          <input
                            type="number" min="0" max="500" step="1"
                            value={selected.record_latency_ms ?? 0}
                            onChange={e => updateRecLatency(parseInt(e.target.value, 10))}
                          />
                          <em>ms</em>
                        </span>
                      </div>
                      <small className="mt-rec-hint">
                        New takes are nudged earlier by this much so they line up with the
                        tracks you're hearing.
                      </small>
                      <button
                        className="app-btn ghost mt-calib-btn"
                        onClick={runCalibration}
                        disabled={calibStatus === 'running' || recording !== null}
                      >
                        {calibStatus === 'running' ? 'Calibrating… (listen for clicks)' : '🎯 Auto-calibrate'}
                      </button>
                      {calibStatus && calibStatus !== 'running' && calibStatus.ms !== undefined && (
                        <small className="mt-calib-ok">✓ Measured {calibStatus.ms} ms round-trip.</small>
                      )}
                      {calibStatus && calibStatus.error && (
                        <small className="mt-calib-err">{calibStatus.error}</small>
                      )}
                      <small className="mt-rec-hint">
                        Calibration plays clicks through your speakers and listens with the
                        mic — use built-in speakers + mic, not headphones, for this step.
                      </small>
                    </div>

                    <button className="mt-rec-settings-close" onClick={() => setRecSettingsOpen(false)}>
                      Done
                    </button>
                  </div>
                )}
              </div>

              {/* Workspace: fixed heads column + scrollable timeline */}
              <div className="mt-workspace">
                <div className="mt-track-heads">
                  <div className="mt-heads-spacer" style={{ height: RULER_H }} />
                  {selected.tracks.map((t, i) => (
                    <div className="mt-track-head" key={t.id} style={{ height: TRACK_H }}>
                      <input
                        className="mt-track-name"
                        value={t.name}
                        onChange={e => updateTrack(t.id, { name: e.target.value })}
                      />
                      <div className="mt-track-controls">
                        <button
                          className={`mt-ms ${t.is_muted ? 'on-m' : ''}`}
                          onClick={() => updateTrack(t.id, { is_muted: t.is_muted ? 0 : 1 })}
                          title="Mute"
                        >M</button>
                        <button
                          className={`mt-ms ${t.is_solo ? 'on-s' : ''}`}
                          onClick={() => updateTrack(t.id, { is_solo: t.is_solo ? 0 : 1 })}
                          title="Solo"
                        >S</button>
                        <input
                          className="mt-vol"
                          type="range" min="0" max="1.5" step="0.02"
                          value={t.volume}
                          onChange={e => updateTrack(t.id, { volume: parseFloat(e.target.value) })}
                          title="Volume"
                        />
                        <input
                          className="mt-pan"
                          type="range" min="-1" max="1" step="0.05"
                          value={t.pan}
                          onChange={e => updateTrack(t.id, { pan: parseFloat(e.target.value) })}
                          title="Pan"
                        />
                        <button className="mt-track-del" onClick={() => removeTrack(t.id)} title="Delete track">🗑</button>
                      </div>
                      <div className="mt-track-nudge">
                        <button onClick={() => nudge(t, -1)} title={snapSec ? 'Nudge back one ' + snap : 'Nudge left'}>‹</button>
                        <span title="Clip start (bar.beat)">{fmtBarsBeats(t.clip_offset, grid)}</span>
                        <button onClick={() => nudge(t, 1)} title={snapSec ? 'Nudge forward one ' + snap : 'Nudge right'}>›</button>
                      </div>
                      <Meter level={levels[t.id] || 0} />
                    </div>
                  ))}
                  {selected.tracks.length === 0 && (
                    <div className="mt-no-tracks">
                      No tracks yet — hit ⏺ Record or import a file.
                    </div>
                  )}
                </div>

                <div className="mt-timeline-scroll" ref={scrollRef}>
                  <div className="mt-timeline" style={{ width: timelineW }}>
                    {/* Ruler */}
                    <div className="mt-ruler" style={{ height: RULER_H }} onClick={seekFromEvent}>
                      {rulerTicks.map(tick => (
                        <div key={tick.t} className="mt-tick" style={{ left: tick.t * pxPerSec }}>
                          <span className="mt-tick-lbl">{tick.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tempo grid (behind the lanes) */}
                    {selected.tracks.length > 0 && (
                      <div
                        className="mt-grid"
                        style={{ top: RULER_H, height: selected.tracks.length * TRACK_H }}
                      >
                        {gridLines.map((g, i) => (
                          <div
                            key={i}
                            className={`mt-gridline ${g.bar ? 'bar' : 'beat'}`}
                            style={{ left: g.x * pxPerSec }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Lanes */}
                    {selected.tracks.map((t, i) => {
                      const buf = buffers[t.id]?.buffer;
                      const peaks = buffers[t.id]?.peaks;
                      const color = TRACK_COLORS[i % TRACK_COLORS.length];
                      const dur = buf ? clipDuration({ buffer: buf, trimStart: t.trim_start, trimEnd: t.trim_end }) : 0;
                      const fullDur = buf ? buf.duration : 0;
                      return (
                        <div className="mt-lane" key={t.id} style={{ height: TRACK_H }} onClick={seekFromEvent}>
                          {buf && (
                            <div
                              className="mt-clip"
                              style={{
                                left: t.clip_offset * pxPerSec,
                                width: Math.max(8, dur * pxPerSec),
                                borderColor: color,
                                background: `${color}1e`,
                              }}
                              onMouseDown={e => beginClipDrag(e, t, 'move')}
                            >
                              <ClipWaveform
                                peaks={peaks}
                                fullDur={fullDur}
                                trimStart={t.trim_start}
                                trimEnd={t.trim_end}
                                width={Math.max(8, dur * pxPerSec)}
                                height={TRACK_H - 8}
                                color={color}
                              />
                              <div
                                className="mt-trim mt-trim-l"
                                onMouseDown={e => beginClipDrag(e, t, 'trim-start')}
                                title="Trim start"
                              />
                              <div
                                className="mt-trim mt-trim-r"
                                onMouseDown={e => beginClipDrag(e, t, 'trim-end')}
                                title="Trim end"
                              />
                              <span className="mt-clip-name">{t.name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Playhead */}
                    <div
                      className="mt-playhead"
                      style={{
                        left: playhead * pxPerSec,
                        height: RULER_H + selected.tracks.length * TRACK_H,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mixing console drawer */}
              {showMixer && (
                <div className="mt-mixer">
                  <div className="mt-mixer-strips">
                    {selected.tracks.length === 0 ? (
                      <div className="mt-mixer-empty">Record or import a track to see its channel strip.</div>
                    ) : selected.tracks.map((t, i) => (
                      <ChannelStrip
                        key={t.id}
                        track={t}
                        color={TRACK_COLORS[i % TRACK_COLORS.length]}
                        level={levels[t.id] || 0}
                        onFx={(patch) => updateTrackFx(t.id, patch)}
                      />
                    ))}
                    <MasterStrip
                      volume={selected.master_volume ?? 1}
                      level={levels.master || 0}
                      onVolume={updateMasterVolume}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mixdown modal */}
      {mixdownState && mixdownState !== 'rendering' && (
        <>
          <div className="mt-modal-backdrop" onClick={() => setMixdownState(null)} />
          <div className="mt-modal">
            <div className="mt-modal-title">✓ Mixdown ready</div>
            <div className="mt-modal-sub">
              All tracks rendered to a single stereo WAV ({fmt(projectDuration(engineTracks()))}).
            </div>
            <audio controls src={mixdownState.dataUrl} className="mt-modal-audio" />
            <button className="app-btn primary mt-modal-btn" onClick={downloadMix}>
              ⬇ Download WAV
            </button>
            <div className="mt-modal-songs-lbl">…or save it onto a song:</div>
            {songs.length === 0 ? (
              <div className="mt-muted">No songs yet.</div>
            ) : (
              <div className="mt-modal-songs">
                {songs.map(s => (
                  <button key={s.id} className="mt-modal-song" onClick={() => saveMixToSong(s.id)}>
                    🎵 {s.title}
                  </button>
                ))}
              </div>
            )}
            <button className="mt-modal-close" onClick={() => setMixdownState(null)}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Waveform canvas — draws the trimmed slice of a clip's peaks
   ───────────────────────────────────────────────────────────── */
function ClipWaveform({ peaks, fullDur, trimStart, trimEnd, width, height, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !fullDur) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, width) * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // map the trimmed window into peak-index space
    const startFrac = (trimStart || 0) / fullDur;
    const endFrac   = (fullDur - (trimEnd || 0)) / fullDur;
    const startIdx  = Math.floor(startFrac * peaks.length);
    const endIdx    = Math.max(startIdx + 1, Math.floor(endFrac * peaks.length));
    const span      = endIdx - startIdx;
    const mid       = height / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    const cols = Math.max(1, Math.floor(width));
    for (let x = 0; x < cols; x++) {
      const idx = startIdx + Math.floor((x / cols) * span);
      const peak = peaks[idx] || 0;
      const h = Math.max(1, peak * (height - 4));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [peaks, fullDur, trimStart, trimEnd, width, height, color]);

  return <canvas ref={canvasRef} className="mt-waveform" style={{ width, height }} />;
}

/* ─────────────────────────────────────────────────────────────
   Channel strip — EQ + compressor + reverb send for one track
   ───────────────────────────────────────────────────────────── */
function FxSlider({ label, min, max, step, value, suffix, onChange }) {
  return (
    <label className="mt-fx-slider">
      <span className="mt-fx-slider-lbl">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <span className="mt-fx-slider-val">
        {typeof value === 'number' ? value.toFixed(suffix === 'dB' ? 1 : suffix === ':1' ? 1 : 0) : value}{suffix || ''}
      </span>
    </label>
  );
}

function ChannelStrip({ track, color, level = 0, onFx }) {
  const fx = { ...DEFAULT_FX, ...(track.effects || {}) };
  const isBypassed = fx.eqLow === 0 && fx.eqMid === 0 && fx.eqHigh === 0
    && fx.compThreshold === 0 && fx.reverbSend === 0;
  return (
    <div className="mt-strip" style={{ borderTopColor: color }}>
      <div className="mt-strip-name" style={{ color }}>{track.name}</div>
      <div className="mt-strip-meter"><Meter level={level} /></div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">EQ</div>
        <FxSlider label="Hi"  min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqHigh} onChange={v => onFx({ eqHigh: v })} />
        <FxSlider label="Mid" min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqMid}  onChange={v => onFx({ eqMid: v })} />
        <FxSlider label="Lo"  min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqLow}  onChange={v => onFx({ eqLow: v })} />
      </div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">Compressor</div>
        <FxSlider label="Thr" min={-60} max={0} step={1} suffix="dB"
          value={fx.compThreshold} onChange={v => onFx({ compThreshold: v })} />
        <FxSlider label="Rat" min={1} max={12} step={0.5} suffix=":1"
          value={fx.compRatio} onChange={v => onFx({ compRatio: v })} />
      </div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">Reverb Send</div>
        <FxSlider label="Send" min={0} max={1} step={0.02} suffix="%"
          value={fx.reverbSend * 100} onChange={v => onFx({ reverbSend: v / 100 })} />
      </div>

      <div className={`mt-strip-status ${isBypassed ? '' : 'active'}`}>
        {isBypassed ? 'flat' : '● processing'}
      </div>
    </div>
  );
}

function MasterStrip({ volume, level = 0, onVolume }) {
  return (
    <div className="mt-strip mt-strip-master">
      <div className="mt-strip-name">MASTER</div>
      <div className="mt-strip-meter"><Meter level={level} /></div>
      <div className="mt-strip-section mt-master-fader">
        <FxSlider label="Vol" min={0} max={1.5} step={0.02} suffix="%"
          value={volume * 100} onChange={v => onVolume(v / 100)} />
      </div>
      <div className="mt-master-limiter">🛡 Limiter on<br/><span>protects against clipping</span></div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Level meter — peak bar with green/amber/red zones + clip latch
   ───────────────────────────────────────────────────────────── */
function Meter({ level = 0, horizontal = false }) {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    if (level >= 0.99) setClipped(true);
  }, [level]);
  const pct  = Math.min(100, level * 100);
  const zone = level >= 0.9 ? 'red' : level >= 0.7 ? 'amber' : 'green';
  return (
    <div
      className={`mt-meter ${horizontal ? 'h' : 'v'}`}
      onClick={() => setClipped(false)}
      title={clipped ? 'Peaked — click to reset' : 'Level meter'}
    >
      <div
        className={`mt-meter-fill ${zone}`}
        style={horizontal ? { width: `${pct}%` } : { height: `${pct}%` }}
      />
      {clipped && <div className="mt-meter-clip" />}
    </div>
  );
}
