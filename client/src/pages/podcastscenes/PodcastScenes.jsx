import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import { useUserStoreKey } from '../../lib/userStore';
import './PodcastScenes.css';

/* ─────────────────────────────────────────────────────────────
   Podcast Scenes — saved recording presets for the Studio page
   Naming: .psc-*
   Persistence: localStorage key "podcast:scenes"
   Accent: var(--accent-purple, #a78bfa)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'podcast:scenes';

const LAYOUT_TYPES = [
  { key: 'solo',          label: 'Solo',          icon: '🎙' },
  { key: 'two-camera',    label: 'Two-Camera',    icon: '👥' },
  { key: 'screen-share',  label: 'Screen Share',  icon: '🖥' },
  { key: 'pip',           label: 'Picture-in-Pic',icon: '🪟' },
  { key: 'sermon',        label: 'Sermon',        icon: '⛪' },
  { key: 'custom',        label: 'Custom',        icon: '🎬' },
];

const RESOLUTIONS = ['720p', '1080p', '1440p'];
const FRAMERATES  = [24, 30, 60];

function layoutIcon(type) {
  const t = LAYOUT_TYPES.find(l => l.key === type);
  return t ? t.icon : '🎬';
}

function layoutLabel(type) {
  const t = LAYOUT_TYPES.find(l => l.key === type);
  return t ? t.label : 'Custom';
}

function makeId() {
  return 'psc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadScenes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveScenes(scenes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  } catch {
    /* ignore quota errors */
  }
}

function defaultTemplates() {
  const now = Date.now();
  return [
    {
      id: makeId(),
      name: 'Solo Interview',
      layoutType: 'solo',
      cameraDeviceId: '',
      cameraDeviceLabel: '',
      micDeviceId: '',
      micDeviceLabel: '',
      resolution: '1080p',
      framerate: 30,
      audioGain: 0.8,
      notes: 'Single camera, headphones mic. Good for solo podcast episodes.',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Two-Camera Interview',
      layoutType: 'two-camera',
      cameraDeviceId: '',
      cameraDeviceLabel: '',
      micDeviceId: '',
      micDeviceLabel: '',
      resolution: '1080p',
      framerate: 30,
      audioGain: 0.8,
      notes: 'Two cameras (host + guest). Switch angles in post.',
      isDefault: false,
      createdAt: now + 1,
      updatedAt: now + 1,
    },
    {
      id: makeId(),
      name: 'Screen Share + Face Cam',
      layoutType: 'pip',
      cameraDeviceId: '',
      cameraDeviceLabel: '',
      micDeviceId: '',
      micDeviceLabel: '',
      resolution: '1080p',
      framerate: 30,
      audioGain: 0.8,
      notes: 'Desktop share with small face cam picture-in-picture overlay.',
      isDefault: false,
      createdAt: now + 2,
      updatedAt: now + 2,
    },
    {
      id: makeId(),
      name: 'Sermon Mode',
      layoutType: 'sermon',
      cameraDeviceId: '',
      cameraDeviceLabel: '',
      micDeviceId: '',
      micDeviceLabel: '',
      resolution: '1080p',
      framerate: 30,
      audioGain: 0.9,
      notes: 'Single locked camera, lapel mic. For Sunday teaching recordings.',
      isDefault: false,
      createdAt: now + 3,
      updatedAt: now + 3,
    },
    {
      id: makeId(),
      name: 'Mobile-Friendly Vertical',
      layoutType: 'custom',
      cameraDeviceId: '',
      cameraDeviceLabel: '',
      micDeviceId: '',
      micDeviceLabel: '',
      resolution: '1080p',
      framerate: 30,
      audioGain: 0.8,
      notes: 'Vertical 9:16 framing for Reels / Shorts / TikTok. Note: Studio v1 may not yet support vertical capture.',
      isDefault: false,
      createdAt: now + 4,
      updatedAt: now + 4,
    },
  ];
}

function emptyScene() {
  const now = Date.now();
  return {
    id: makeId(),
    name: 'Untitled Scene',
    layoutType: 'custom',
    cameraDeviceId: '',
    cameraDeviceLabel: '',
    micDeviceId: '',
    micDeviceLabel: '',
    resolution: '1080p',
    framerate: 30,
    audioGain: 0.8,
    notes: '',
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── Sidebar row ─────────────────────────────────────── */
function SceneRow({ scene, active, onClick, onDelete }) {
  return (
    <button
      className={`psc-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="psc-card-top">
        <span className="psc-card-icon" aria-hidden="true">{layoutIcon(scene.layoutType)}</span>
        <span className="psc-card-name">{scene.name || 'Untitled'}</span>
        {scene.isDefault && <span className="psc-card-default">default</span>}
      </div>
      <div className="psc-card-meta">
        <span className="psc-card-chip">{scene.resolution} · {scene.framerate}fps</span>
        <span className="psc-card-layout">{layoutLabel(scene.layoutType)}</span>
      </div>
      <span
        className="psc-card-del"
        onClick={(e) => { e.stopPropagation(); onDelete(scene.id); }}
        title="Delete scene"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onDelete(scene.id);
          }
        }}
      >
        ✕
      </span>
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function PodcastScenes() {
  const navigate = useNavigate();

  /* Firestore-backed. When the user has nothing yet (first load), seed with
     the default templates and immediately persist so the seed itself becomes
     their saved set rather than re-seeding on every mount. */
  const [rawScenes, setRawScenes] = useUserStoreKey('podcast:scenes', null);
  const scenes = useMemo(() => {
    if (Array.isArray(rawScenes) && rawScenes.length > 0) return rawScenes;
    return defaultTemplates();
  }, [rawScenes]);
  const setScenes = useCallback((next) => {
    if (typeof next === 'function') {
      setRawScenes((prev) => next(Array.isArray(prev) && prev.length > 0 ? prev : defaultTemplates()));
    } else {
      setRawScenes(next);
    }
  }, [setRawScenes]);

  /* Seed Firestore on the very first visit (when the doc doesn't exist yet)
     so the templates persist instead of re-appearing on every reload. */
  useEffect(() => {
    if (rawScenes === null) {
      setRawScenes(defaultTemplates());
    }
    // Only seed once — afterwards rawScenes is an array (possibly empty if
    // the user deleted everything) and we leave it alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawScenes === null]);

  const [selectedId, setSelectedId] = useState(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);

  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [permGranted, setPermGranted] = useState(false);
  const [permRequested, setPermRequested] = useState(false);

  /* Disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    const t = setTimeout(() => setArmedDelete(false), 3000);
    return () => clearTimeout(t);
  }, [armedDelete]);

  /* Reset transient state when selection changes */
  useEffect(() => {
    setArmedDelete(false);
    setLayoutMenuOpen(false);
  }, [selectedId]);

  /* Enumerate devices on mount (silent if perm already granted) */
  const enumerateDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameras(devs.filter(d => d.kind === 'videoinput'));
      setMics(devs.filter(d => d.kind === 'audioinput'));
      setPermGranted(true);
    } catch {
      setPermGranted(false);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  const handleRequestPerm = useCallback(() => {
    setPermRequested(true);
    enumerateDevices();
  }, [enumerateDevices]);

  /* ─── Derived: sorted scene list ───────────────── */
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [scenes]);

  const selected = useMemo(
    () => scenes.find(s => s.id === selectedId) || null,
    [scenes, selectedId]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setScenes(prev => prev.map(s =>
      s.id === selectedId ? { ...s, ...patch, updatedAt: Date.now() } : s
    ));
  }, [selectedId]);

  const handleNewScene = useCallback(() => {
    const s = emptyScene();
    setScenes(prev => [s, ...prev]);
    setSelectedId(s.id);
  }, []);

  const handleRestoreDefaults = useCallback(() => {
    const templates = defaultTemplates();
    setScenes(prev => {
      // Keep custom scenes, but re-add any missing default templates
      const existingNames = new Set(prev.map(s => s.name));
      const toAdd = templates.filter(t => !existingNames.has(t.name));
      return [...prev, ...toAdd];
    });
  }, []);

  const handleDeleteFromSidebar = useCallback((id) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    setSelectedId(prev => (prev === id ? null : prev));
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setScenes(prev => prev.filter(s => s.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleSetDefault = useCallback(() => {
    if (!selected) return;
    setScenes(prev => prev.map(s => ({
      ...s,
      isDefault: s.id === selected.id ? true : false,
      updatedAt: s.id === selected.id ? Date.now() : s.updatedAt,
    })));
  }, [selected]);

  const handleSelectCamera = useCallback((deviceId) => {
    const dev = cameras.find(c => c.deviceId === deviceId);
    updateSelected({
      cameraDeviceId: deviceId,
      cameraDeviceLabel: dev ? (dev.label || 'Camera') : (selected?.cameraDeviceLabel || ''),
    });
  }, [cameras, updateSelected, selected]);

  const handleSelectMic = useCallback((deviceId) => {
    const dev = mics.find(m => m.deviceId === deviceId);
    updateSelected({
      micDeviceId: deviceId,
      micDeviceLabel: dev ? (dev.label || 'Microphone') : (selected?.micDeviceLabel || ''),
    });
  }, [mics, updateSelected, selected]);

  const handleUseScene = useCallback(() => {
    if (!selected) return;
    navigate(`/podcast-studio?scene=${encodeURIComponent(selected.id)}`);
  }, [selected, navigate]);

  /* Check if saved deviceIds are still present */
  const savedCameraPresent = selected && selected.cameraDeviceId
    ? cameras.some(c => c.deviceId === selected.cameraDeviceId)
    : true;
  const savedMicPresent = selected && selected.micDeviceId
    ? mics.some(m => m.deviceId === selected.micDeviceId)
    : true;

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <div className="psc-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>
      <NavRail />

      {/* ── Sidebar ── */}
      <aside className="psc-sidebar">
        <div className="psc-sidebar-head">
          <span className="psc-sidebar-title">Scenes</span>
          <button
            className="psc-new-btn"
            onClick={handleNewScene}
            title="Create a new scene"
          >
            + New Scene
          </button>
        </div>

        <div className="psc-sidebar-controls">
          <button
            className="psc-restore-link"
            onClick={handleRestoreDefaults}
            title="Re-seed built-in scene templates"
          >
            ↻ Restore Defaults
          </button>
        </div>

        <div className="psc-list">
          {sortedScenes.length === 0 && (
            <p className="psc-muted psc-list-empty">
              No scenes yet. Click "Restore Defaults" to seed templates.
            </p>
          )}
          {sortedScenes.map(s => (
            <SceneRow
              key={s.id}
              scene={s}
              active={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
              onDelete={handleDeleteFromSidebar}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="psc-main">
        {!selected && (
          <div className="psc-empty">
            <div className="psc-empty-icon" aria-hidden="true">🎬</div>
            <div className="psc-empty-title">No scene selected</div>
            <div className="psc-empty-sub">
              Pick a scene from the sidebar — or create a new one — to configure
              your camera, mic, resolution and framerate. Apply it to the Studio
              with one click.
            </div>
            {scenes.length === 0 && (
              <button className="psc-btn psc-btn-accent psc-empty-cta" onClick={handleNewScene}>
                + Create your first scene
              </button>
            )}
          </div>
        )}

        {selected && (
          <div className="psc-detail">
            {/* Detail header */}
            <div className="psc-detail-head">
              <div className="psc-detail-head-info">
                <input
                  className="psc-name-inp"
                  placeholder="Scene name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="psc-detail-meta">
                  <div className="psc-layout-wrap">
                    <button
                      className="psc-chip psc-chip-layout"
                      onClick={() => setLayoutMenuOpen(o => !o)}
                      title="Change layout type"
                    >
                      <span className="psc-chip-icon" aria-hidden="true">
                        {layoutIcon(selected.layoutType)}
                      </span>
                      {layoutLabel(selected.layoutType)}
                      <span className="psc-chip-caret">▾</span>
                    </button>
                    {layoutMenuOpen && (
                      <div className="psc-layout-menu" role="menu">
                        {LAYOUT_TYPES.map(lt => (
                          <button
                            key={lt.key}
                            className={`psc-layout-opt${selected.layoutType === lt.key ? ' on' : ''}`}
                            onClick={() => {
                              updateSelected({ layoutType: lt.key });
                              setLayoutMenuOpen(false);
                            }}
                          >
                            <span className="psc-chip-icon" aria-hidden="true">{lt.icon}</span>
                            {lt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selected.isDefault && (
                    <span className="psc-chip psc-chip-default">★ Default</span>
                  )}
                </div>
              </div>
              <div className="psc-detail-actions">
                {selected.isDefault ? (
                  <span className="psc-btn psc-btn-ghost psc-btn-locked" title="This is the default scene">
                    ★ Default
                  </span>
                ) : (
                  <button
                    className="psc-btn psc-btn-ghost"
                    onClick={handleSetDefault}
                    title="Mark this scene as the default"
                  >
                    ☆ Set as Default
                  </button>
                )}
                <button
                  className={`psc-btn${armedDelete ? ' psc-btn-danger-armed' : ' psc-btn-danger'}`}
                  onClick={handleDeleteSelected}
                  title={armedDelete ? 'Click again to confirm' : 'Delete scene'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Permission notice */}
            {!permGranted && (
              <div className="psc-perm-notice">
                <div className="psc-perm-text">
                  <strong>Grant camera/mic permission</strong> to see available devices.
                </div>
                <button className="psc-btn psc-btn-accent" onClick={handleRequestPerm}>
                  {permRequested ? 'Try Again' : 'Request Permission'}
                </button>
              </div>
            )}

            {/* Devices section */}
            <section className="psc-section">
              <h3 className="psc-section-title">📹 Devices</h3>
              <div className="psc-row psc-row-2">
                <label className="psc-field">
                  <span className="psc-label">Camera</span>
                  <select
                    className="psc-inp"
                    value={selected.cameraDeviceId || ''}
                    onChange={e => handleSelectCamera(e.target.value)}
                    disabled={cameras.length === 0}
                  >
                    <option value="">
                      {cameras.length === 0 ? 'No cameras available' : 'Select a camera…'}
                    </option>
                    {cameras.map(c => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `Camera ${c.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  {selected.cameraDeviceId && !savedCameraPresent && (
                    <span className="psc-stale-hint">
                      Last selected: <em>{selected.cameraDeviceLabel || 'Unknown camera'}</em> (no longer present)
                    </span>
                  )}
                </label>
                <label className="psc-field">
                  <span className="psc-label">Microphone</span>
                  <select
                    className="psc-inp"
                    value={selected.micDeviceId || ''}
                    onChange={e => handleSelectMic(e.target.value)}
                    disabled={mics.length === 0}
                  >
                    <option value="">
                      {mics.length === 0 ? 'No mics available' : 'Select a mic…'}
                    </option>
                    {mics.map(m => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label || `Mic ${m.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  {selected.micDeviceId && !savedMicPresent && (
                    <span className="psc-stale-hint">
                      Last selected: <em>{selected.micDeviceLabel || 'Unknown mic'}</em> (no longer present)
                    </span>
                  )}
                </label>
              </div>
            </section>

            {/* Quality section */}
            <section className="psc-section">
              <h3 className="psc-section-title">🎚 Quality</h3>

              <div className="psc-field">
                <span className="psc-label">Resolution</span>
                <div className="psc-btn-group">
                  {RESOLUTIONS.map(r => (
                    <button
                      key={r}
                      className={`psc-toggle${selected.resolution === r ? ' on' : ''}`}
                      onClick={() => updateSelected({ resolution: r })}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="psc-field">
                <span className="psc-label">Framerate</span>
                <div className="psc-btn-group">
                  {FRAMERATES.map(f => (
                    <button
                      key={f}
                      className={`psc-toggle${selected.framerate === f ? ' on' : ''}`}
                      onClick={() => updateSelected({ framerate: f })}
                    >
                      {f}fps
                    </button>
                  ))}
                </div>
              </div>

              <label className="psc-field">
                <span className="psc-label">
                  Audio Gain
                  <span className="psc-label-val">{Math.round((selected.audioGain ?? 0.8) * 100)}%</span>
                </span>
                <input
                  className="psc-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selected.audioGain ?? 0.8}
                  onChange={e => updateSelected({ audioGain: parseFloat(e.target.value) })}
                />
                <span className="psc-hint">
                  Informational — the Studio page may honor this when applying the scene.
                </span>
              </label>
            </section>

            {/* Notes section */}
            <section className="psc-section">
              <h3 className="psc-section-title">📝 Notes</h3>
              <label className="psc-field">
                <textarea
                  className="psc-inp psc-textarea"
                  placeholder="Anything to remember about this scene…"
                  rows={4}
                  value={selected.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                />
              </label>
            </section>

            {/* Apply CTA */}
            <div className="psc-apply-bar">
              <button
                className="psc-btn psc-btn-accent psc-btn-apply"
                onClick={handleUseScene}
                title="Open this scene in the Studio"
              >
                🎥 Use this scene
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
