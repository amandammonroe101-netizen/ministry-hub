import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './StagePlot.css';

/* ─────────────────────────────────────────────────────────────
   Stage Plot — visual stage layout + patch list manager
   Naming: .sp-*
   localStorage key: gear:stage-plots
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'gear:stage-plots';

const ITEM_TYPES = [
  { type: 'vocal',  icon: '🎤', label: 'Vocal'  },
  { type: 'guitar', icon: '🎸', label: 'Guitar' },
  { type: 'bass',   icon: '🎸', label: 'Bass'   },
  { type: 'drums',  icon: '🥁', label: 'Drums'  },
  { type: 'keys',   icon: '🎹', label: 'Keys'   },
  { type: 'amp',    icon: '🔊', label: 'Amp'    },
  { type: 'wedge',  icon: '🔉', label: 'Wedge'  },
  { type: 'mic',    icon: '🎤', label: 'Mic'    },
  { type: 'di',     icon: '📡', label: 'DI'     },
  { type: 'other',  icon: '📦', label: 'Other'  },
];

const TYPE_ICON = ITEM_TYPES.reduce((m, t) => { m[t.type] = t.icon; return m; }, {});
const TYPE_LABEL = ITEM_TYPES.reduce((m, t) => { m[t.type] = t.label; return m; }, {});

const PATCH_TYPES = ['XLR', '1/4 TS', '1/4 TRS', 'USB', 'Ethernet', 'Other'];

const COLOR_SWATCHES = [
  '#22d3ee', // cyan (accent)
  '#a78bfa', // purple
  '#f472b6', // pink
  '#fbbf24', // amber
  '#2dd4bf', // teal
  '#60a5fa', // blue
  '#fb7185', // rose
  '#6ee7b7', // green
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/* ── Utilities ────────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadPlots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePlots(plots) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
  } catch {
    /* swallow */
  }
}

function defaultPatchSourceForType(type) {
  switch (type) {
    case 'vocal': return 'Vocal mic';
    case 'guitar': return 'Guitar DI';
    case 'bass': return 'Bass DI';
    case 'drums': return 'Drum mic';
    case 'keys': return 'Keys DI';
    case 'amp': return 'Amp mic';
    case 'wedge': return 'Wedge send';
    case 'mic': return 'Mic';
    case 'di': return 'DI';
    default: return 'Input';
  }
}

function defaultPatchTypeForType(type) {
  switch (type) {
    case 'vocal':
    case 'mic':
    case 'amp':
    case 'drums':
      return 'XLR';
    case 'guitar':
    case 'bass':
    case 'keys':
    case 'di':
      return '1/4 TS';
    default:
      return 'XLR';
  }
}

/* ── Stage Canvas ─────────────────────────────────────────── */
function StageCanvas({ plot, onUpdateItem, onSelectItem, selectedItemId }) {
  const canvasRef = useRef(null);
  const dragState = useRef(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  // Track canvas size for absolute positioning
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handlePointerDown = useCallback((e, item) => {
    e.stopPropagation();
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Capture offset between item center and pointer (in pixels)
    const itemPxX = (item.x / 1000) * rect.width;
    const itemPxY = (item.y / 1000) * rect.height;
    dragState.current = {
      id: item.id,
      offsetX: e.clientX - rect.left - itemPxX,
      offsetY: e.clientY - rect.top - itemPxY,
      moved: false,
      rect,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    const rect = ds.rect;
    const px = e.clientX - rect.left - ds.offsetX;
    const py = e.clientY - rect.top - ds.offsetY;
    // Clamp to canvas
    const cx = Math.max(0, Math.min(rect.width, px));
    const cy = Math.max(0, Math.min(rect.height, py));
    const nx = Math.round((cx / rect.width) * 1000);
    const ny = Math.round((cy / rect.height) * 1000);
    ds.moved = true;
    onUpdateItem(ds.id, { x: nx, y: ny });
  }, [onUpdateItem]);

  const handlePointerUp = useCallback((e, item) => {
    const ds = dragState.current;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragState.current = null;
    if (ds && !ds.moved) {
      // Treat as click → open popover
      onSelectItem(item.id);
    }
  }, [onSelectItem]);

  const items = Array.isArray(plot.items) ? plot.items : [];

  return (
    <div className="sp-canvas-wrap">
      <div
        ref={canvasRef}
        className="sp-canvas"
        onClick={() => onSelectItem(null)}
      >
        {plot.imageDataUrl && (
          <img
            className="sp-canvas-bg"
            src={plot.imageDataUrl}
            alt=""
            draggable={false}
          />
        )}
        <div className="sp-canvas-grid" aria-hidden="true" />
        <div className="sp-stage-outline" aria-hidden="true">
          <span className="sp-stage-label">FRONT OF STAGE / AUDIENCE</span>
        </div>

        {items.map(item => {
          const left = (item.x / 1000) * size.w;
          const top  = (item.y / 1000) * size.h;
          const color = item.color || 'var(--tab-studio, #22d3ee)';
          return (
            <div
              key={item.id}
              className={`sp-item${selectedItemId === item.id ? ' on' : ''}`}
              style={{ left: `${left}px`, top: `${top}px`, '--sp-item-color': color }}
              onPointerDown={(e) => handlePointerDown(e, item)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, item)}
              onClick={(e) => e.stopPropagation()}
              title={item.label || TYPE_LABEL[item.type]}
            >
              <div className="sp-item-bubble">
                <span className="sp-item-icon">{TYPE_ICON[item.type] || '📦'}</span>
              </div>
              {item.label && <div className="sp-item-label">{item.label}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Item Popover ─────────────────────────────────────────── */
function ItemPopover({ item, onChange, onDelete, onClose }) {
  return (
    <div className="sp-popover-overlay" onClick={onClose}>
      <div className="sp-popover" onClick={(e) => e.stopPropagation()}>
        <div className="sp-popover-head">
          <span>{TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}</span>
          <button className="sp-popover-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sp-popover-body">
          <label className="sp-field">
            <span className="sp-field-label">Label</span>
            <input
              className="sp-inp"
              value={item.label || ''}
              placeholder={`e.g. "Sarah", "Lead vox"`}
              onChange={(e) => onChange({ label: e.target.value })}
              autoFocus
            />
          </label>
          <label className="sp-field">
            <span className="sp-field-label">Notes</span>
            <textarea
              className="sp-inp sp-textarea"
              value={item.notes || ''}
              placeholder="Optional notes…"
              rows={2}
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </label>
          <div className="sp-field">
            <span className="sp-field-label">Color</span>
            <div className="sp-swatches">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c}
                  className={`sp-swatch${item.color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => onChange({ color: c })}
                  title={c}
                />
              ))}
              <button
                className={`sp-swatch sp-swatch-clear${!item.color ? ' on' : ''}`}
                onClick={() => onChange({ color: undefined })}
                title="Default color"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
        <div className="sp-popover-foot">
          <button
            className="sp-btn sp-btn-danger"
            onClick={onDelete}
            title="Delete this item"
          >
            🗑 Remove
          </button>
          <button className="sp-btn sp-btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Item Palette ────────────────────────────────────── */
function AddItemPalette({ onAdd, onClose }) {
  return (
    <div className="sp-palette-overlay" onClick={onClose}>
      <div className="sp-palette" onClick={(e) => e.stopPropagation()}>
        <div className="sp-palette-head">
          <span>Add Item</span>
          <button className="sp-popover-close" onClick={onClose}>✕</button>
        </div>
        <div className="sp-palette-grid">
          {ITEM_TYPES.map(t => (
            <button
              key={t.type}
              className="sp-palette-chip"
              onClick={() => onAdd(t.type)}
            >
              <span className="sp-palette-chip-icon">{t.icon}</span>
              <span className="sp-palette-chip-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Patch List ────────────────────────────────────────── */
function PatchList({ plot, onPatchesChange, onGenerate }) {
  const patches = useMemo(() => {
    const arr = Array.isArray(plot.patches) ? [...plot.patches] : [];
    // Sort by channel ascending (numeric extract)
    arr.sort((a, b) => {
      const na = parseInt(String(a.channel).replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(String(b.channel).replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
    return arr;
  }, [plot.patches]);

  function updatePatch(id, patch) {
    const next = (plot.patches || []).map(p => p.id === id ? { ...p, ...patch } : p);
    onPatchesChange(next);
  }

  function deletePatch(id) {
    const next = (plot.patches || []).filter(p => p.id !== id);
    onPatchesChange(next);
  }

  function addPatch() {
    const used = new Set((plot.patches || [])
      .map(p => parseInt(String(p.channel).replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n)));
    let n = 1;
    while (used.has(n)) n++;
    const next = [
      ...(plot.patches || []),
      { id: uid(), channel: `Ch ${n}`, source: '', type: 'XLR', notes: '' },
    ];
    onPatchesChange(next);
  }

  return (
    <div className="sp-patches">
      <div className="sp-patches-bar">
        <button className="sp-btn sp-btn-accent" onClick={addPatch}>+ Add Patch</button>
        <button className="sp-btn sp-btn-ghost" onClick={onGenerate}>
          Generate from stage items
        </button>
      </div>
      {patches.length === 0 ? (
        <div className="sp-patches-empty">
          <div className="sp-patches-empty-icon">🔌</div>
          <div className="sp-patches-empty-title">No patches yet</div>
          <div className="sp-patches-empty-sub">
            Add channels manually, or auto-generate from your stage layout.
          </div>
        </div>
      ) : (
        <div className="sp-patches-table">
          <div className="sp-patches-row sp-patches-head-row">
            <div className="sp-patches-cell sp-cell-ch">Channel</div>
            <div className="sp-patches-cell sp-cell-src">Source</div>
            <div className="sp-patches-cell sp-cell-type">Type</div>
            <div className="sp-patches-cell sp-cell-notes">Notes</div>
            <div className="sp-patches-cell sp-cell-act" />
          </div>
          {patches.map(p => (
            <div key={p.id} className="sp-patches-row">
              <div className="sp-patches-cell sp-cell-ch">
                <input
                  className="sp-inp sp-cell-inp"
                  value={p.channel || ''}
                  onChange={(e) => updatePatch(p.id, { channel: e.target.value })}
                  placeholder="Ch 1"
                />
              </div>
              <div className="sp-patches-cell sp-cell-src">
                <input
                  className="sp-inp sp-cell-inp"
                  value={p.source || ''}
                  onChange={(e) => updatePatch(p.id, { source: e.target.value })}
                  placeholder="Lead vox"
                />
              </div>
              <div className="sp-patches-cell sp-cell-type">
                <select
                  className="sp-inp sp-cell-inp"
                  value={p.type || 'XLR'}
                  onChange={(e) => updatePatch(p.id, { type: e.target.value })}
                >
                  {PATCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="sp-patches-cell sp-cell-notes">
                <input
                  className="sp-inp sp-cell-inp"
                  value={p.notes || ''}
                  onChange={(e) => updatePatch(p.id, { notes: e.target.value })}
                  placeholder="Optional…"
                />
              </div>
              <div className="sp-patches-cell sp-cell-act">
                <button
                  className="sp-row-del"
                  title="Delete patch row"
                  onClick={() => deletePatch(p.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function StagePlot() {
  const [plots, setPlots] = useUserStoreKey('gear:stage-plots', []);
  const [selectedId, setSelectedId] = useState(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [tab, setTab] = useState('layout'); // 'layout' | 'patches'
  const [showPalette, setShowPalette] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [imageWarning, setImageWarning] = useState('');
  const fileInputRef = useRef(null);

  /* (useUserStoreKey autosaves and live-syncs across devices.) */

  // Auto-select first plot if none selected
  useEffect(() => {
    if (selectedId == null && plots.length > 0) {
      setSelectedId(plots[0].id);
    }
  }, [plots, selectedId]);

  // Reset armed-delete when switching plots
  useEffect(() => {
    setArmedDelete(false);
    setEditingItemId(null);
    setTab('layout');
    setImageWarning('');
  }, [selectedId]);

  const sorted = useMemo(() => {
    return [...plots].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [plots]);

  const selected = plots.find(p => p.id === selectedId) || null;
  const editingItem = selected && Array.isArray(selected.items)
    ? selected.items.find(it => it.id === editingItemId)
    : null;

  /* ── CRUD ───────────────────────────────────────────── */
  function patchPlot(id, patch) {
    setPlots(prev => prev.map(p => p.id === id
      ? { ...p, ...patch, updatedAt: Date.now() }
      : p
    ));
  }

  function createPlot() {
    const now = Date.now();
    const newPlot = {
      id: uid(),
      name: `Stage Plot ${plots.length + 1}`,
      description: '',
      imageDataUrl: null,
      items: [],
      patches: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    setPlots(prev => [newPlot, ...prev]);
    setSelectedId(newPlot.id);
  }

  function deletePlot() {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setPlots(prev => prev.filter(p => p.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }

  /* ── Stage items ────────────────────────────────────── */
  function addItem(type) {
    if (!selected) return;
    const newItem = {
      id: uid(),
      type,
      label: '',
      x: 500, // center
      y: 500,
      color: undefined,
      notes: '',
    };
    patchPlot(selected.id, {
      items: [...(selected.items || []), newItem],
    });
    setShowPalette(false);
    setEditingItemId(newItem.id);
  }

  function updateItem(itemId, patch) {
    if (!selected) return;
    const items = (selected.items || []).map(it =>
      it.id === itemId ? { ...it, ...patch } : it
    );
    patchPlot(selected.id, { items });
  }

  function deleteItem(itemId) {
    if (!selected) return;
    const items = (selected.items || []).filter(it => it.id !== itemId);
    patchPlot(selected.id, { items });
    setEditingItemId(null);
  }

  /* ── Patches ────────────────────────────────────────── */
  function setPatches(patches) {
    if (!selected) return;
    patchPlot(selected.id, { patches });
  }

  function generatePatches() {
    if (!selected) return;
    const items = selected.items || [];
    if (items.length === 0) return;
    const existing = selected.patches || [];
    const usedNums = new Set(existing
      .map(p => parseInt(String(p.channel).replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n)));
    let n = 1;
    function nextCh() {
      while (usedNums.has(n)) n++;
      usedNums.add(n);
      return `Ch ${n++}`;
    }
    const added = items.map(it => ({
      id: uid(),
      channel: nextCh(),
      source: it.label
        ? `${it.label} (${defaultPatchSourceForType(it.type)})`
        : defaultPatchSourceForType(it.type),
      type: defaultPatchTypeForType(it.type),
      notes: it.notes || '',
    }));
    patchPlot(selected.id, { patches: [...existing, ...added] });
    setTab('patches');
  }

  /* ── Background image upload ───────────────────────── */
  function handleImagePick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset
    if (!file || !selected) return;
    setImageWarning('');
    if (file.size > MAX_IMAGE_BYTES) {
      setImageWarning(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — large images can slow down storage. Try compressing it first.`
      );
    }
    const reader = new FileReader();
    reader.onload = () => {
      patchPlot(selected.id, { imageDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function clearBackground() {
    if (!selected) return;
    patchPlot(selected.id, { imageDataUrl: null });
    setImageWarning('');
  }

  /* ─── Render ─────────────────────────────────────── */
  return (
    <WorshipShell title="Stage Plot" icon="🗺" subtitle="Stage plot diagrams for setup — instrument and monitor placement.">
    <div className="sp-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Left Sidebar ── */}
      <aside className="sp-sidebar">
        <div className="sp-sidebar-head">
          <span className="sp-sidebar-title">Stage Plots</span>
          <button
            className="sp-new-btn"
            onClick={createPlot}
            title="New stage plot"
          >
            + New Plot
          </button>
        </div>

        <div className="sp-list">
          {sorted.length === 0 && (
            <p className="sp-muted" style={{ padding: '12px 14px', fontStyle: 'italic' }}>
              No stage plots yet.
            </p>
          )}
          {sorted.map(p => {
            const itemCount = Array.isArray(p.items) ? p.items.length : 0;
            const patchCount = Array.isArray(p.patches) ? p.patches.length : 0;
            return (
              <button
                key={p.id}
                className={`sp-card${selectedId === p.id ? ' on' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                {p.imageDataUrl && (
                  <div className="sp-card-thumb">
                    <img src={p.imageDataUrl} alt="" />
                  </div>
                )}
                <div className="sp-card-body">
                  <div className="sp-card-name">{p.name || 'Untitled plot'}</div>
                  {p.description && (
                    <div className="sp-card-desc">{p.description}</div>
                  )}
                  <div className="sp-card-chips">
                    <span className="sp-chip sp-chip-items">
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <span className="sp-chip sp-chip-patches">
                      {patchCount} patch{patchCount !== 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="sp-main">
        {!selected && plots.length === 0 && (
          <div className="sp-empty">
            <div className="sp-empty-icon">🗺</div>
            <div className="sp-empty-title">No stage plots saved</div>
            <div className="sp-empty-sub">
              Document your stage layout, patch list, and signal flow notes for any service.
            </div>
            <button
              className="sp-btn sp-btn-accent sp-empty-cta"
              onClick={createPlot}
            >
              + Create your first plot
            </button>
          </div>
        )}

        {!selected && plots.length > 0 && (
          <div className="sp-empty">
            <div className="sp-empty-icon">🗺</div>
            <div className="sp-empty-title">No plot selected</div>
            <div className="sp-empty-sub">
              Choose a plot from the sidebar, or create a new one.
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* Detail Header */}
            <div className="sp-detail-head">
              <div className="sp-detail-head-text">
                <input
                  className="sp-name-inp"
                  value={selected.name || ''}
                  placeholder="Plot name"
                  onChange={(e) => patchPlot(selected.id, { name: e.target.value })}
                />
                <input
                  className="sp-desc-inp"
                  value={selected.description || ''}
                  placeholder="Short description (e.g. Standard Sunday morning setup)"
                  onChange={(e) => patchPlot(selected.id, { description: e.target.value })}
                />
              </div>
              <div className="sp-detail-actions">
                <button
                  className={`sp-btn${armedDelete ? ' sp-btn-danger-armed' : ' sp-btn-danger'}`}
                  onClick={deletePlot}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm' : 'Delete plot'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="sp-tabs">
              <button
                className={`sp-tab${tab === 'layout' ? ' on' : ''}`}
                onClick={() => setTab('layout')}
              >
                🗺 Stage Layout
              </button>
              <button
                className={`sp-tab${tab === 'patches' ? ' on' : ''}`}
                onClick={() => setTab('patches')}
              >
                🔌 Patch List
              </button>
            </div>

            {/* Tab content */}
            <div className="sp-tab-body">
              {tab === 'layout' && (
                <>
                  <div className="sp-toolbar">
                    <button
                      className="sp-btn sp-btn-accent"
                      onClick={() => setShowPalette(true)}
                    >
                      + Add Item
                    </button>
                    <button
                      className="sp-btn sp-btn-ghost"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      🖼 Set Background
                    </button>
                    {selected.imageDataUrl && (
                      <button
                        className="sp-btn sp-btn-ghost"
                        onClick={clearBackground}
                      >
                        Clear Background
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleImagePick}
                    />
                    <span className="sp-toolbar-hint">
                      Drag items to reposition · click to edit
                    </span>
                  </div>

                  {imageWarning && (
                    <div className="sp-warn">{imageWarning}</div>
                  )}

                  <StageCanvas
                    plot={selected}
                    onUpdateItem={updateItem}
                    onSelectItem={setEditingItemId}
                    selectedItemId={editingItemId}
                  />

                  {(selected.items || []).length === 0 && (
                    <div className="sp-canvas-empty-hint">
                      Empty stage. Click <strong>+ Add Item</strong> to place vocals, instruments, mics, or DIs.
                    </div>
                  )}
                </>
              )}

              {tab === 'patches' && (
                <PatchList
                  plot={selected}
                  onPatchesChange={setPatches}
                  onGenerate={generatePatches}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      {showPalette && selected && (
        <AddItemPalette
          onAdd={addItem}
          onClose={() => setShowPalette(false)}
        />
      )}

      {editingItem && (
        <ItemPopover
          item={editingItem}
          onChange={(patch) => updateItem(editingItem.id, patch)}
          onDelete={() => deleteItem(editingItem.id)}
          onClose={() => setEditingItemId(null)}
        />
      )}
    </div>
    </WorshipShell>
  );
}
