import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Inventory.css';

/* ─────────────────────────────────────────────────────────────
   Inventory — worship/ministry physical-gear tracker
   Naming: .iv-*
   Persistence: localStorage key "gear:inventory"
   Accent: var(--accent-amber, #fbbf24)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'gear:inventory';
const PHOTO_WARN_BYTES = 500 * 1024; // 500KB

const CATEGORIES = [
  { key: 'microphone', label: 'Microphone', plural: 'Microphones', icon: '🎤' },
  { key: 'instrument', label: 'Instrument', plural: 'Instruments', icon: '🎸' },
  { key: 'amplifier',  label: 'Amplifier',  plural: 'Amplifiers',  icon: '🔊' },
  { key: 'monitor',    label: 'Monitor',    plural: 'Monitors',    icon: '🔉' },
  { key: 'mixer',      label: 'Mixer',      plural: 'Mixers',      icon: '🎛' },
  { key: 'cable',      label: 'Cable',      plural: 'Cables',      icon: '🔌' },
  { key: 'stand',      label: 'Stand',      plural: 'Stands',      icon: '📍' },
  { key: 'in-ear',     label: 'In-Ear',     plural: 'In-Ears',     icon: '🎧' },
  { key: 'di-box',     label: 'DI Box',     plural: 'DI Boxes',    icon: '📡' },
  { key: 'pedal',      label: 'Pedal',      plural: 'Pedals',      icon: '🪀' },
  { key: 'lighting',   label: 'Lighting',   plural: 'Lighting',    icon: '💡' },
  { key: 'video',      label: 'Video',      plural: 'Video',       icon: '📹' },
  { key: 'other',      label: 'Other',      plural: 'Other',       icon: '📦' },
];

const CAT_BY_KEY = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c;
  return acc;
}, {});

const STATUSES = [
  { key: 'working',      label: 'Working',      color: '#34d399' },
  { key: 'needs-repair', label: 'Needs Repair', color: '#ef4444' },
  { key: 'loaned-out',   label: 'Loaned Out',   color: '#fbbf24' },
  { key: 'retired',      label: 'Retired',      color: 'rgba(255,255,255,0.3)' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const FILTER_PILLS = [
  { key: 'all',          label: 'All' },
  { key: 'working',      label: 'Working' },
  { key: 'needs-repair', label: 'Needs Repair' },
  { key: 'loaned-out',   label: 'Loaned Out' },
  { key: 'retired',      label: 'Retired' },
];

function makeId() {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadInventory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInventory(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

function emptyItem(overrides = {}) {
  return {
    id: makeId(),
    name: '',
    category: 'microphone',
    brand: '',
    model: '',
    serial: '',
    status: 'working',
    location: '',
    assignedTo: '',
    purchaseDate: '',
    purchasePrice: '',
    warrantyExpires: '',
    notes: '',
    photoDataUrl: '',
    tags: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

/* ─── Sidebar item row ───────────────────────────────────────── */
function InventoryRow({ item, active, onClick }) {
  const cat = CAT_BY_KEY[item.category] || CAT_BY_KEY.other;
  const statusInfo = STATUS_BY_KEY[item.status] || STATUS_BY_KEY.working;
  return (
    <button
      className={`iv-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="iv-card-top">
        <span className="iv-card-icon" aria-hidden="true">{cat.icon}</span>
        <span className="iv-card-name">{item.name || 'Untitled item'}</span>
        <span
          className={`iv-status-dot s-${item.status}`}
          style={{ background: statusInfo.color }}
          aria-label={statusInfo.label}
          title={statusInfo.label}
        />
      </div>
      {(item.brand || item.model) && (
        <div className="iv-card-sub">
          {[item.brand, item.model].filter(Boolean).join(' · ')}
        </div>
      )}
      {item.location && (
        <div className="iv-card-meta">
          <span className="iv-card-chip">📍 {item.location}</span>
        </div>
      )}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function Inventory() {
  const [items, setItems]           = useUserStoreKey('gear:inventory', []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [catFilter, setCatFilter]   = useState('all');
  const [armedDelete, setArmedDelete] = useState(false);
  const [tagDraft, setTagDraft]     = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  /* "+ New Item" inline form */
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [newCategory, setNewCategory] = useState('microphone');

  const armTimerRef  = useRef(null);
  const photoInputRef = useRef(null);
  const newNameRef   = useRef(null);
  const statusMenuRef = useRef(null);

  /* (useUserStoreKey autosaves and live-syncs across devices.) */

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* Reset transient state on selection change */
  useEffect(() => {
    setArmedDelete(false);
    setTagDraft('');
    setShowStatusMenu(false);
  }, [selectedId]);

  /* Focus new-item name input when form opens */
  useEffect(() => {
    if (showNewForm && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [showNewForm]);

  /* Close status menu when clicking outside */
  useEffect(() => {
    if (!showStatusMenu) return;
    const onDocClick = (e) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStatusMenu]);

  /* ─── Derived: status counts ───────────────────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { all: items.length, working: 0, 'needs-repair': 0, 'loaned-out': 0, retired: 0 };
    for (const it of items) {
      if (counts[it.status] !== undefined) counts[it.status]++;
    }
    return counts;
  }, [items]);

  /* ─── Derived: filtered list ───────────────────────────────── */
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (filter !== 'all' && it.status !== filter) return false;
      if (catFilter !== 'all' && it.category !== catFilter) return false;
      if (!q) return true;
      const hay = [
        it.name, it.brand, it.model, it.serial,
        it.location, it.assignedTo,
        ...(Array.isArray(it.tags) ? it.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filter, catFilter]);

  /* ─── Group filtered by category, alphabetical within ──────── */
  const groupedItems = useMemo(() => {
    const groups = new Map();
    for (const it of filteredItems) {
      const key = CAT_BY_KEY[it.category] ? it.category : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    // Preserve canonical category order
    const ordered = [];
    for (const c of CATEGORIES) {
      if (groups.has(c.key)) {
        const list = groups.get(c.key).slice().sort(
          (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        ordered.push({ category: c, items: list });
      }
    }
    return ordered;
  }, [filteredItems]);

  const selected = useMemo(
    () => items.find(it => it.id === selectedId) || null,
    [items, selectedId]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setItems(prev => prev.map(it => (it.id === selectedId ? { ...it, ...patch } : it)));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewName('');
    setNewCategory('microphone');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const item = emptyItem({ name, category: newCategory });
    setItems(prev => [item, ...prev]);
    setSelectedId(item.id);
    setShowNewForm(false);
    setNewName('');
  }, [newName, newCategory]);

  const handleEmptyStateNew = useCallback(() => {
    const item = emptyItem({ name: '' });
    setItems(prev => [item, ...prev]);
    setSelectedId(item.id);
  }, []);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    let nextNotes = selected.notes || '';
    if (nextStatus === 'needs-repair' && selected.status !== 'needs-repair') {
      const reason = window.prompt('Brief note about the repair (optional):', '');
      if (reason && reason.trim()) {
        const stamp = new Date().toISOString().slice(0, 10);
        const line = `[${stamp}] Needs repair: ${reason.trim()}`;
        nextNotes = nextNotes ? `${line}\n${nextNotes}` : line;
      }
    }
    updateSelected({ status: nextStatus, notes: nextNotes });
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setItems(prev => prev.filter(it => it.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const clone = {
      ...selected,
      id: makeId(),
      name: (selected.name || 'Item') + ' (copy)',
      serial: '', // serials are unique — clear on duplicate
      createdAt: Date.now(),
    };
    setItems(prev => [clone, ...prev]);
    setSelectedId(clone.id);
  }, [selected]);

  const handleAddTag = useCallback(() => {
    const v = tagDraft.trim();
    if (!v || !selected) return;
    const existing = selected.tags || [];
    if (existing.some(x => x.toLowerCase() === v.toLowerCase())) {
      setTagDraft('');
      return;
    }
    updateSelected({ tags: [...existing, v] });
    setTagDraft('');
  }, [tagDraft, selected, updateSelected]);

  const handleRemoveTag = useCallback((tag) => {
    if (!selected) return;
    updateSelected({
      tags: (selected.tags || []).filter(x => x !== tag),
    });
  }, [selected, updateSelected]);

  /* ─── Photo upload ─────────────────────────────────────────── */
  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !selected) return;
    if (file.size > PHOTO_WARN_BYTES) {
      const ok = window.confirm(
        `That photo is ${(file.size / 1024).toFixed(0)} KB. Large images bloat localStorage. Use it anyway?`
      );
      if (!ok) {
        if (photoInputRef.current) photoInputRef.current.value = '';
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSelected({ photoDataUrl: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, [selected, updateSelected]);

  const handleRemovePhoto = useCallback(() => {
    updateSelected({ photoDataUrl: '' });
  }, [updateSelected]);

  /* ─── Render ───────────────────────────────────────────────── */
  const currentStatusInfo = selected
    ? (STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.working)
    : null;
  const currentCatInfo = selected
    ? (CAT_BY_KEY[selected.category] || CAT_BY_KEY.other)
    : null;

  return (
    <WorshipShell title="Inventory" icon="📦" subtitle="Inventory of instruments, cables, and gear owned by the ministry.">
    <div className="iv-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="iv-sidebar">
        <div className="iv-sidebar-head">
          <span className="iv-sidebar-title">Inventory</span>
          <button
            className="iv-new-btn"
            onClick={handleStartNew}
            title="Add a new gear item"
          >
            + New Item
          </button>
        </div>

        {showNewForm && (
          <div className="iv-new-form">
            <input
              ref={newNameRef}
              className="iv-inp"
              placeholder="Item name (required)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <select
              className="iv-inp"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
              ))}
            </select>
            <div className="iv-new-form-actions">
              <button
                className="iv-btn iv-btn-ghost"
                onClick={handleCancelNew}
              >
                Cancel
              </button>
              <button
                className="iv-btn iv-btn-accent"
                onClick={handleSaveNew}
                disabled={!newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="iv-sidebar-controls">
          <input
            className="iv-inp"
            placeholder="Search name, brand, serial, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="iv-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`iv-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="iv-pill-label">{p.label}</span>
                <span className="iv-pill-count">{statusCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <select
            className="iv-inp iv-cat-filter"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.icon}  {c.plural}</option>
            ))}
          </select>
        </div>

        <div className="iv-list">
          {filteredItems.length === 0 && (
            <p className="iv-muted iv-list-empty">
              {items.length === 0
                ? 'No gear logged yet.'
                : 'No matches.'}
            </p>
          )}

          {groupedItems.map(group => (
            <div key={group.category.key} className="iv-group">
              <div className="iv-group-head">
                <span className="iv-group-icon" aria-hidden="true">{group.category.icon}</span>
                <span className="iv-group-title">{group.category.plural}</span>
                <span className="iv-group-count">{group.items.length}</span>
              </div>
              {group.items.map(it => (
                <InventoryRow
                  key={it.id}
                  item={it}
                  active={selectedId === it.id}
                  onClick={() => setSelectedId(it.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="iv-main">
        {!selected && items.length === 0 && (
          <div className="iv-empty">
            <div className="iv-empty-icon" aria-hidden="true">📦</div>
            <div className="iv-empty-title">No gear logged yet</div>
            <div className="iv-empty-sub">
              Track every microphone, guitar, amp, cable and stand the team owns —
              with status, location, serial numbers and purchase history.
            </div>
            <button className="iv-btn iv-btn-accent iv-empty-cta" onClick={handleEmptyStateNew}>
              + Add your first item
            </button>
          </div>
        )}

        {!selected && items.length > 0 && (
          <div className="iv-empty">
            <div className="iv-empty-icon" aria-hidden="true">📦</div>
            <div className="iv-empty-title">No item selected</div>
            <div className="iv-empty-sub">
              Pick an item from the sidebar, or add a new one to your inventory.
            </div>
          </div>
        )}

        {selected && (
          <div className="iv-detail">
            {/* Detail header */}
            <div className="iv-detail-head">
              <div className="iv-detail-head-info">
                <input
                  className="iv-name-inp"
                  placeholder="Item name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="iv-detail-meta">
                  {/* Category chip (clickable label opens select via accessible <details> alternative) */}
                  <label className="iv-cat-chip-wrap" title="Change category">
                    <span className="iv-cat-chip">
                      <span aria-hidden="true">{currentCatInfo.icon}</span>
                      {currentCatInfo.label}
                      <span className="iv-cat-chip-caret" aria-hidden="true">▾</span>
                    </span>
                    <select
                      className="iv-cat-chip-select"
                      value={selected.category}
                      onChange={e => updateSelected({ category: e.target.value })}
                      aria-label="Category"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Quick-status badge */}
                  <div className="iv-status-wrap" ref={statusMenuRef}>
                    <button
                      className={`iv-status-badge s-${selected.status}`}
                      onClick={() => setShowStatusMenu(v => !v)}
                      title="Click to change status"
                    >
                      <span
                        className={`iv-status-dot s-${selected.status}`}
                        style={{ background: currentStatusInfo.color }}
                      />
                      {currentStatusInfo.label}
                      <span className="iv-status-caret" aria-hidden="true">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="iv-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            className={`iv-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                            onClick={() => handleQuickStatus(s.key)}
                          >
                            <span
                              className="iv-status-dot"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="iv-detail-actions">
                <button
                  className="iv-btn iv-btn-ghost"
                  onClick={handleDuplicate}
                  title="Make a copy of this item"
                >
                  Duplicate
                </button>
                <button
                  className={`iv-btn${armedDelete ? ' iv-btn-danger-armed' : ' iv-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete item'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="iv-form">
              {/* Photo */}
              <div className="iv-section">
                <div className="iv-section-title">Photo</div>
                <div className="iv-photo-row">
                  <div className={`iv-photo${selected.photoDataUrl ? ' has' : ''}`}>
                    {selected.photoDataUrl ? (
                      <img src={selected.photoDataUrl} alt={selected.name || 'Gear'} />
                    ) : (
                      <span className="iv-photo-placeholder" aria-hidden="true">📷</span>
                    )}
                  </div>
                  <div className="iv-photo-actions">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="iv-photo-input"
                    />
                    <button
                      className="iv-btn iv-btn-ghost"
                      onClick={() => photoInputRef.current && photoInputRef.current.click()}
                    >
                      {selected.photoDataUrl ? 'Replace' : 'Upload Photo'}
                    </button>
                    {selected.photoDataUrl && (
                      <button
                        className="iv-btn iv-btn-danger"
                        onClick={handleRemovePhoto}
                      >
                        Remove
                      </button>
                    )}
                    <span className="iv-hint">
                      Stored locally as base64. Keep images under ~500 KB.
                    </span>
                  </div>
                </div>
              </div>

              {/* Identification */}
              <div className="iv-section">
                <div className="iv-section-title">Identification</div>
                <div className="iv-row iv-row-2">
                  <label className="iv-field">
                    <span className="iv-label">Name</span>
                    <input
                      className="iv-inp"
                      placeholder="e.g. Sennheiser e835 #2"
                      value={selected.name}
                      onChange={e => updateSelected({ name: e.target.value })}
                    />
                  </label>
                  <label className="iv-field">
                    <span className="iv-label">Category</span>
                    <select
                      className="iv-inp"
                      value={selected.category}
                      onChange={e => updateSelected({ category: e.target.value })}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="iv-row iv-row-2">
                  <label className="iv-field">
                    <span className="iv-label">Brand</span>
                    <input
                      className="iv-inp"
                      placeholder="Shure, Fender, Yamaha…"
                      value={selected.brand}
                      onChange={e => updateSelected({ brand: e.target.value })}
                    />
                  </label>
                  <label className="iv-field">
                    <span className="iv-label">Model</span>
                    <input
                      className="iv-inp"
                      placeholder="SM58, Telecaster…"
                      value={selected.model}
                      onChange={e => updateSelected({ model: e.target.value })}
                    />
                  </label>
                </div>
                <label className="iv-field">
                  <span className="iv-label">Serial #</span>
                  <input
                    className="iv-inp"
                    placeholder="Manufacturer serial number"
                    value={selected.serial}
                    onChange={e => updateSelected({ serial: e.target.value })}
                  />
                </label>
              </div>

              {/* Status & location */}
              <div className="iv-section">
                <div className="iv-section-title">Status &amp; Location</div>
                <div className="iv-row iv-row-2">
                  <label className="iv-field">
                    <span className="iv-label">Status</span>
                    <select
                      className="iv-inp"
                      value={selected.status}
                      onChange={e => updateSelected({ status: e.target.value })}
                    >
                      {STATUSES.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="iv-field">
                    <span className="iv-label">Location</span>
                    <input
                      className="iv-inp"
                      placeholder="Main stage, storage closet B, drum cage…"
                      value={selected.location}
                      onChange={e => updateSelected({ location: e.target.value })}
                    />
                  </label>
                </div>
                <label className="iv-field">
                  <span className="iv-label">Assigned to</span>
                  <input
                    className="iv-inp"
                    placeholder="Who's currently using this? (optional)"
                    value={selected.assignedTo}
                    onChange={e => updateSelected({ assignedTo: e.target.value })}
                  />
                </label>
              </div>

              {/* Purchase */}
              <div className="iv-section">
                <div className="iv-section-title">Purchase</div>
                <div className="iv-row iv-row-3">
                  <label className="iv-field">
                    <span className="iv-label">Purchase date</span>
                    <input
                      className="iv-inp"
                      type="date"
                      value={selected.purchaseDate}
                      onChange={e => updateSelected({ purchaseDate: e.target.value })}
                    />
                  </label>
                  <label className="iv-field">
                    <span className="iv-label">Price (USD)</span>
                    <div className="iv-currency">
                      <span className="iv-currency-sym">$</span>
                      <input
                        className="iv-inp iv-currency-inp"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={selected.purchasePrice}
                        onChange={e => updateSelected({ purchasePrice: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="iv-field">
                    <span className="iv-label">Warranty expires</span>
                    <input
                      className="iv-inp"
                      type="date"
                      value={selected.warrantyExpires}
                      onChange={e => updateSelected({ warrantyExpires: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              {/* Tags */}
              <div className="iv-section">
                <div className="iv-section-title">Tags</div>
                <div className="iv-chip-input">
                  <div className="iv-chip-list">
                    {(selected.tags || []).map((tag, i) => (
                      <span key={i} className="iv-tag-chip">
                        {tag}
                        <button
                          type="button"
                          className="iv-tag-chip-x"
                          onClick={() => handleRemoveTag(tag)}
                          title="Remove tag"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="iv-chip-inp"
                      placeholder={
                        (selected.tags || []).length === 0
                          ? 'Type a tag and press Enter…'
                          : 'Add another tag…'
                      }
                      value={tagDraft}
                      onChange={e => setTagDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        } else if (
                          e.key === 'Backspace' &&
                          tagDraft === '' &&
                          (selected.tags || []).length > 0
                        ) {
                          e.preventDefault();
                          const last = selected.tags[selected.tags.length - 1];
                          handleRemoveTag(last);
                        }
                      }}
                      onBlur={handleAddTag}
                    />
                  </div>
                </div>
                <span className="iv-hint">
                  Tag with anything searchable — "wireless", "vintage", "backup", "fragile".
                </span>
              </div>

              {/* Notes */}
              <div className="iv-section">
                <div className="iv-section-title">Notes</div>
                <textarea
                  className="iv-inp iv-textarea"
                  placeholder="Maintenance history, quirks, accessories, where it was bought…"
                  rows={5}
                  value={selected.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
