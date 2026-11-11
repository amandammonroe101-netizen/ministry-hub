import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './TechStack.css';

/* ─────────────────────────────────────────────────────────────
   Tech Stack — church website tech-stack documentation
   Naming: .ts-*
   Persistence: localStorage key "web:tech-stack"
   Accent: var(--accent-purple, #a78bfa)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:tech-stack';

const CATEGORIES = [
  { key: 'hosting',      label: 'Hosting & Infrastructure', plural: 'Hosting & Infrastructure', icon: '🌐' },
  { key: 'cms',          label: 'CMS & Site',               plural: 'CMS & Site',               icon: '🎨' },
  { key: 'plugins',      label: 'Plugins & Extensions',     plural: 'Plugins & Extensions',     icon: '🔌' },
  { key: 'email',        label: 'Email & Marketing',        plural: 'Email & Marketing',        icon: '📧' },
  { key: 'analytics',    label: 'Analytics',                plural: 'Analytics',                icon: '📊' },
  { key: 'giving',       label: 'Giving & Payments',        plural: 'Giving & Payments',        icon: '💝' },
  { key: 'forms',        label: 'Forms & Booking',          plural: 'Forms & Booking',          icon: '📅' },
  { key: 'integrations', label: 'Integrations & APIs',      plural: 'Integrations & APIs',      icon: '🔗' },
  { key: 'media',        label: 'Media & Streaming',        plural: 'Media & Streaming',        icon: '🎥' },
  { key: 'security',     label: 'Security & Backups',       plural: 'Security & Backups',       icon: '🔒' },
  { key: 'devtools',     label: 'Dev Tools',                plural: 'Dev Tools',                icon: '🛠' },
  { key: 'other',        label: 'Other',                    plural: 'Other',                    icon: '📦' },
];

const CAT_BY_KEY = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c;
  return acc;
}, {});

const STATUSES = [
  { key: 'active',     label: 'Active',     color: '#34d399' },
  { key: 'deprecated', label: 'Deprecated', color: '#fbbf24' },
  { key: 'planned',    label: 'Planned',    color: '#60a5fa' },
  { key: 'retired',    label: 'Retired',    color: 'rgba(255,255,255,0.3)' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const IMPORTANCE = [
  { key: 'critical',     label: 'Critical',     color: '#ef4444' },
  { key: 'important',    label: 'Important',    color: '#fbbf24' },
  { key: 'nice-to-have', label: 'Nice-to-have', color: 'rgba(255,255,255,0.4)' },
];

const IMPORTANCE_BY_KEY = IMPORTANCE.reduce((acc, i) => {
  acc[i.key] = i;
  return acc;
}, {});

const FILTER_PILLS = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'planned',    label: 'Planned' },
  { key: 'retired',    label: 'Retired' },
];

const COST_PERIODS = [
  { key: 'monthly',  label: 'Monthly' },
  { key: 'yearly',   label: 'Yearly' },
  { key: 'one-time', label: 'One-time' },
  { key: 'free',     label: 'Free' },
];

function makeId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadStack() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStack(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

function emptyEntry(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    name: '',
    category: 'cms',
    vendor: '',
    version: '',
    status: 'active',
    cost: '',
    costPeriod: 'monthly',
    renewalDate: '',
    loginUrl: '',
    websiteUrl: '',
    contactEmail: '',
    docUrl: '',
    notes: '',
    importance: 'important',
    ownedBy: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* ─── Helpers ───────────────────────────────────────────────── */
function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthlyEquivalent(cost, period) {
  const n = parseFloat(cost);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (period === 'monthly') return n;
  if (period === 'yearly')  return n / 12;
  return 0; // one-time & free don't contribute to monthly recurring
}

function formatMoney(n) {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (n < 10) return '$' + n.toFixed(2);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/* ─── Sidebar row ───────────────────────────────────────────── */
function TechRow({ entry, active, onClick }) {
  const cat = CAT_BY_KEY[entry.category] || CAT_BY_KEY.other;
  const statusInfo = STATUS_BY_KEY[entry.status] || STATUS_BY_KEY.active;
  const impInfo = IMPORTANCE_BY_KEY[entry.importance] || IMPORTANCE_BY_KEY.important;
  const days = daysUntil(entry.renewalDate);
  const renewalSoon = days !== null && days >= 0 && days <= 30;

  return (
    <button
      className={`ts-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="ts-card-top">
        <span className="ts-card-icon" aria-hidden="true">{cat.icon}</span>
        <span className="ts-card-name">{entry.name || 'Untitled entry'}</span>
        {renewalSoon && (
          <span
            className={`ts-bell${days <= 7 ? ' urgent' : ''}`}
            title={`Renews in ${days} day${days === 1 ? '' : 's'}`}
          >
            🔔
          </span>
        )}
        <span
          className={`ts-status-dot s-${entry.status}`}
          style={{ background: statusInfo.color }}
          aria-label={statusInfo.label}
          title={statusInfo.label}
        />
        <span
          className={`ts-imp-dot i-${entry.importance}`}
          style={{ background: impInfo.color }}
          aria-label={impInfo.label}
          title={impInfo.label}
        />
      </div>
      {(entry.vendor || entry.version) && (
        <div className="ts-card-sub">
          {entry.vendor && <span>{entry.vendor}</span>}
          {entry.version && (
            <span className="ts-card-version">v{entry.version}</span>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function TechStack() {
  const [items, setItems]           = useUserStoreKey('web:tech-stack', []);
  const [searchParams, setSearchParams] = useSearchParams();
  /* If we arrived via deep-link (e.g. ?id=t_xxx from Calendar), open that
     entry on mount. The id is consumed from the URL so subsequent renders
     don't keep forcing the selection. */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    return fromUrl || null;
  });
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [catFilter, setCatFilter]   = useState('all');
  const [impFilter, setImpFilter]   = useState('all');
  const [armedDelete, setArmedDelete] = useState(false);
  const [tagDraft, setTagDraft]     = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  /* "+ New Entry" inline form */
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [newCategory, setNewCategory] = useState('cms');

  const armTimerRef   = useRef(null);
  const newNameRef    = useRef(null);
  const statusMenuRef = useRef(null);

  /* (No persist effect — useUserStoreKey writes through on setItems.) */

  /* Strip ?id= from URL on mount (after using it to set selectedId) */
  useEffect(() => {
    const fromUrl = searchParams.get('id');
    if (fromUrl) {
      setSelectedId(fromUrl);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /* Focus new-entry name input when form opens */
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
    const counts = { all: items.length, active: 0, deprecated: 0, planned: 0, retired: 0 };
    for (const it of items) {
      if (counts[it.status] !== undefined) counts[it.status]++;
    }
    return counts;
  }, [items]);

  /* ─── Derived: stats card values ───────────────────────────── */
  const stats = useMemo(() => {
    let monthlyTotal = 0;
    let criticalCount = 0;
    let renewals30 = 0;
    for (const it of items) {
      if (it.importance === 'critical' && it.status !== 'retired') criticalCount++;
      if (it.status === 'active' || it.status === 'deprecated') {
        monthlyTotal += monthlyEquivalent(it.cost, it.costPeriod);
      }
      const d = daysUntil(it.renewalDate);
      if (d !== null && d >= 0 && d <= 30 && it.status !== 'retired') renewals30++;
    }
    return { monthlyTotal, criticalCount, renewals30, total: items.length };
  }, [items]);

  /* ─── Derived: filtered list ───────────────────────────────── */
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (filter !== 'all' && it.status !== filter) return false;
      if (catFilter !== 'all' && it.category !== catFilter) return false;
      if (impFilter !== 'all' && it.importance !== impFilter) return false;
      if (!q) return true;
      const hay = [
        it.name, it.vendor, it.version, it.ownedBy,
        ...(Array.isArray(it.tags) ? it.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filter, catFilter, impFilter]);

  /* ─── Group filtered by category, alphabetical within ──────── */
  const groupedItems = useMemo(() => {
    const groups = new Map();
    for (const it of filteredItems) {
      const key = CAT_BY_KEY[it.category] ? it.category : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
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
    setItems(prev => prev.map(it =>
      it.id === selectedId ? { ...it, ...patch, updatedAt: Date.now() } : it
    ));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewName('');
    setNewCategory('cms');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const entry = emptyEntry({ name, category: newCategory });
    setItems(prev => [entry, ...prev]);
    setSelectedId(entry.id);
    setShowNewForm(false);
    setNewName('');
  }, [newName, newCategory]);

  const handleEmptyStateNew = useCallback(() => {
    const entry = emptyEntry({ name: '' });
    setItems(prev => [entry, ...prev]);
    setSelectedId(entry.id);
  }, []);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    updateSelected({ status: nextStatus });
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleCycleImportance = useCallback(() => {
    if (!selected) return;
    const idx = IMPORTANCE.findIndex(i => i.key === selected.importance);
    const next = IMPORTANCE[(idx + 1) % IMPORTANCE.length];
    updateSelected({ importance: next.key });
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
    const now = Date.now();
    const clone = {
      ...selected,
      id: makeId(),
      name: (selected.name || 'Entry') + ' (copy)',
      createdAt: now,
      updatedAt: now,
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

  /* ─── Render ───────────────────────────────────────────────── */
  const currentStatusInfo = selected
    ? (STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.active)
    : null;
  const currentCatInfo = selected
    ? (CAT_BY_KEY[selected.category] || CAT_BY_KEY.other)
    : null;
  const currentImpInfo = selected
    ? (IMPORTANCE_BY_KEY[selected.importance] || IMPORTANCE_BY_KEY.important)
    : null;

  const renewalDays = selected ? daysUntil(selected.renewalDate) : null;

  return (
    <WebsiteShell
      title="Tech Stack"
      icon="🧱"
      subtitle="What the site is built on — hosting, CMS, plugins, email, analytics, giving, forms, integrations, media, security, and dev tools."
      fullBleed
    >
    <div className="ts-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="ts-sidebar">
        <div className="ts-sidebar-head">
          <span className="ts-sidebar-title">Tech Stack</span>
          <button
            className="ts-new-btn"
            onClick={handleStartNew}
            title="Document a new piece of tech"
          >
            + New Entry
          </button>
        </div>

        {showNewForm && (
          <div className="ts-new-form">
            <input
              ref={newNameRef}
              className="ts-inp"
              placeholder="Entry name (e.g. WordPress)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <select
              className="ts-inp"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
              ))}
            </select>
            <div className="ts-new-form-actions">
              <button className="ts-btn ts-btn-ghost" onClick={handleCancelNew}>
                Cancel
              </button>
              <button
                className="ts-btn ts-btn-accent"
                onClick={handleSaveNew}
                disabled={!newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="ts-sidebar-controls">
          <input
            className="ts-inp"
            placeholder="Search name, vendor, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="ts-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`ts-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="ts-pill-label">{p.label}</span>
                <span className="ts-pill-count">{statusCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <select
            className="ts-inp"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.icon}  {c.plural}</option>
            ))}
          </select>
          <select
            className="ts-inp"
            value={impFilter}
            onChange={e => setImpFilter(e.target.value)}
          >
            <option value="all">All importance</option>
            <option value="critical">Critical only</option>
            <option value="important">Important</option>
            <option value="nice-to-have">Nice-to-have</option>
          </select>
        </div>

        <div className="ts-list">
          {filteredItems.length === 0 && (
            <p className="ts-muted ts-list-empty">
              {items.length === 0 ? 'No tech logged yet.' : 'No matches.'}
            </p>
          )}

          {groupedItems.map(group => (
            <div key={group.category.key} className="ts-group">
              <div className="ts-group-head">
                <span className="ts-group-icon" aria-hidden="true">{group.category.icon}</span>
                <span className="ts-group-title">{group.category.plural}</span>
                <span className="ts-group-count">{group.items.length}</span>
              </div>
              {group.items.map(it => (
                <TechRow
                  key={it.id}
                  entry={it}
                  active={selectedId === it.id}
                  onClick={() => setSelectedId(it.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="ts-main">
        {/* Stats row — always visible */}
        <div className="ts-stats">
          <div className="ts-stat">
            <div className="ts-stat-num">{stats.total}</div>
            <div className="ts-stat-lbl">Total entries</div>
          </div>
          <div className={`ts-stat${stats.criticalCount > 0 ? ' ts-stat-critical' : ''}`}>
            <div className="ts-stat-num">{stats.criticalCount}</div>
            <div className="ts-stat-lbl">Critical</div>
          </div>
          <div className="ts-stat">
            <div className="ts-stat-num">{formatMoney(stats.monthlyTotal)}</div>
            <div className="ts-stat-lbl">Monthly cost</div>
          </div>
          <div className={`ts-stat${stats.renewals30 > 0 ? ' ts-stat-warn' : ''}`}>
            <div className="ts-stat-num">{stats.renewals30}</div>
            <div className="ts-stat-lbl">Renewals (30d)</div>
          </div>
        </div>

        {!selected && items.length === 0 && (
          <div className="ts-empty">
            <div className="ts-empty-icon" aria-hidden="true">🧱</div>
            <div className="ts-empty-title">No tech logged yet</div>
            <div className="ts-empty-sub">
              Document every piece of tech keeping the website alive — CMS,
              hosting, plugins, integrations and services — so anyone can
              pick up the keys if the webmaster disappears tomorrow.
            </div>
            <button className="ts-btn ts-btn-accent ts-empty-cta" onClick={handleEmptyStateNew}>
              + Add your first entry
            </button>
          </div>
        )}

        {!selected && items.length > 0 && (
          <div className="ts-empty">
            <div className="ts-empty-icon" aria-hidden="true">🧱</div>
            <div className="ts-empty-title">No entry selected</div>
            <div className="ts-empty-sub">
              Pick an entry from the sidebar to see versions, vendor info and
              renewal dates — or add a new piece of tech.
            </div>
          </div>
        )}

        {selected && (
          <div className="ts-detail">
            {/* Detail header */}
            <div className="ts-detail-head">
              <div className="ts-detail-head-info">
                <input
                  className="ts-name-inp"
                  placeholder="Entry name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="ts-detail-meta">
                  <label className="ts-cat-chip-wrap" title="Change category">
                    <span className="ts-cat-chip">
                      <span aria-hidden="true">{currentCatInfo.icon}</span>
                      {currentCatInfo.label}
                      <span className="ts-cat-chip-caret" aria-hidden="true">▾</span>
                    </span>
                    <select
                      className="ts-cat-chip-select"
                      value={selected.category}
                      onChange={e => updateSelected({ category: e.target.value })}
                      aria-label="Category"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="ts-status-wrap" ref={statusMenuRef}>
                    <button
                      className={`ts-status-badge s-${selected.status}`}
                      onClick={() => setShowStatusMenu(v => !v)}
                      title="Click to change status"
                    >
                      <span
                        className={`ts-status-dot s-${selected.status}`}
                        style={{ background: currentStatusInfo.color }}
                      />
                      {currentStatusInfo.label}
                      <span className="ts-status-caret" aria-hidden="true">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="ts-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            className={`ts-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                            onClick={() => handleQuickStatus(s.key)}
                          >
                            <span
                              className="ts-status-dot"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    className={`ts-imp-chip i-${selected.importance}`}
                    onClick={handleCycleImportance}
                    title="Click to cycle importance"
                  >
                    <span
                      className="ts-imp-dot"
                      style={{ background: currentImpInfo.color }}
                    />
                    {currentImpInfo.label}
                  </button>
                </div>

                <div className="ts-detail-head-row">
                  <label className="ts-field ts-field-inline">
                    <span className="ts-label">Vendor</span>
                    <input
                      className="ts-inp"
                      placeholder="Company name…"
                      value={selected.vendor}
                      onChange={e => updateSelected({ vendor: e.target.value })}
                    />
                  </label>
                  <label className="ts-field ts-field-inline ts-field-version">
                    <span className="ts-label">Version</span>
                    <input
                      className="ts-inp"
                      placeholder="e.g. 6.4.1"
                      value={selected.version}
                      onChange={e => updateSelected({ version: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="ts-detail-actions">
                <button
                  className="ts-btn ts-btn-ghost"
                  onClick={handleDuplicate}
                  title="Make a copy of this entry"
                >
                  Duplicate
                </button>
                <button
                  className={`ts-btn${armedDelete ? ' ts-btn-danger-armed' : ' ts-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete entry'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="ts-form">
              {/* Vendor info */}
              <details className="ts-section" open>
                <summary className="ts-section-summary">
                  <span className="ts-section-title">🏢 Vendor info</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <label className="ts-field">
                    <span className="ts-label">Vendor name</span>
                    <input
                      className="ts-inp"
                      placeholder="Who makes / runs this?"
                      value={selected.vendor}
                      onChange={e => updateSelected({ vendor: e.target.value })}
                    />
                  </label>
                  <div className="ts-row ts-row-2">
                    <label className="ts-field">
                      <span className="ts-label">Website URL</span>
                      <input
                        className="ts-inp"
                        type="url"
                        placeholder="https://example.com"
                        value={selected.websiteUrl}
                        onChange={e => updateSelected({ websiteUrl: e.target.value })}
                      />
                    </label>
                    <label className="ts-field">
                      <span className="ts-label">Support email</span>
                      <input
                        className="ts-inp"
                        type="email"
                        placeholder="support@vendor.com"
                        value={selected.contactEmail}
                        onChange={e => updateSelected({ contactEmail: e.target.value })}
                      />
                    </label>
                  </div>
                  {(selected.websiteUrl || selected.contactEmail) && (
                    <div className="ts-link-row">
                      {selected.websiteUrl && (
                        <a
                          className="ts-link"
                          href={selected.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ↗ Open vendor site
                        </a>
                      )}
                      {selected.contactEmail && (
                        <a
                          className="ts-link"
                          href={`mailto:${selected.contactEmail}`}
                        >
                          ✉ Email support
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </details>

              {/* Cost & Renewal */}
              <details className="ts-section" open>
                <summary className="ts-section-summary">
                  <span className="ts-section-title">💵 Cost & Renewal</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <div className="ts-row ts-row-3">
                    <label className="ts-field">
                      <span className="ts-label">Cost (USD)</span>
                      <div className="ts-currency">
                        <span className="ts-currency-sym">$</span>
                        <input
                          className="ts-inp ts-currency-inp"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={selected.cost}
                          onChange={e => updateSelected({ cost: e.target.value })}
                        />
                      </div>
                    </label>
                    <label className="ts-field">
                      <span className="ts-label">Billing period</span>
                      <select
                        className="ts-inp"
                        value={selected.costPeriod}
                        onChange={e => updateSelected({ costPeriod: e.target.value })}
                      >
                        {COST_PERIODS.map(p => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ts-field">
                      <span className="ts-label">Renewal date</span>
                      <input
                        className="ts-inp"
                        type="date"
                        value={selected.renewalDate}
                        onChange={e => updateSelected({ renewalDate: e.target.value })}
                      />
                    </label>
                  </div>

                  {selected.renewalDate && renewalDays !== null && (
                    <div
                      className={`ts-renewal-pill${
                        renewalDays < 0
                          ? ' overdue'
                          : renewalDays <= 7
                            ? ' urgent'
                            : renewalDays <= 30
                              ? ' soon'
                              : ''
                      }`}
                    >
                      {renewalDays < 0 && (
                        <>⚠ Overdue by {Math.abs(renewalDays)} day{Math.abs(renewalDays) === 1 ? '' : 's'}</>
                      )}
                      {renewalDays === 0 && <>🔔 Renews today</>}
                      {renewalDays > 0 && (
                        <>
                          🔔 Renews in {renewalDays} day{renewalDays === 1 ? '' : 's'}
                          {' · '}{formatDateLong(selected.renewalDate)}
                        </>
                      )}
                    </div>
                  )}

                  {selected.cost && selected.costPeriod === 'yearly' && (
                    <span className="ts-hint">
                      ≈ {formatMoney(monthlyEquivalent(selected.cost, 'yearly'))}/mo equivalent
                    </span>
                  )}
                </div>
              </details>

              {/* Access */}
              <details className="ts-section" open>
                <summary className="ts-section-summary">
                  <span className="ts-section-title">🔑 Access</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <label className="ts-field">
                    <span className="ts-label">Admin / login URL</span>
                    <input
                      className="ts-inp"
                      type="url"
                      placeholder="https://admin.example.com"
                      value={selected.loginUrl}
                      onChange={e => updateSelected({ loginUrl: e.target.value })}
                    />
                  </label>
                  {selected.loginUrl && (
                    <a
                      className="ts-link"
                      href={selected.loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↗ Open admin
                    </a>
                  )}
                  <label className="ts-field">
                    <span className="ts-label">Owned by (team member)</span>
                    <input
                      className="ts-inp"
                      placeholder="Who manages this on our team?"
                      value={selected.ownedBy}
                      onChange={e => updateSelected({ ownedBy: e.target.value })}
                    />
                  </label>
                  <span className="ts-hint">
                    URLs only — never store passwords or API keys here. Use a
                    proper password manager for credentials.
                  </span>
                </div>
              </details>

              {/* Reference */}
              <details className="ts-section">
                <summary className="ts-section-summary">
                  <span className="ts-section-title">📚 Reference</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <label className="ts-field">
                    <span className="ts-label">Documentation URL</span>
                    <input
                      className="ts-inp"
                      type="url"
                      placeholder="https://docs.example.com"
                      value={selected.docUrl}
                      onChange={e => updateSelected({ docUrl: e.target.value })}
                    />
                  </label>
                  {selected.docUrl && (
                    <a
                      className="ts-link"
                      href={selected.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↗ Open docs
                    </a>
                  )}
                </div>
              </details>

              {/* Notes */}
              <details className="ts-section" open>
                <summary className="ts-section-summary">
                  <span className="ts-section-title">📝 Notes</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <textarea
                    className="ts-inp ts-textarea"
                    placeholder="What we use this for, history, gotchas, who set it up…"
                    rows={6}
                    value={selected.notes}
                    onChange={e => updateSelected({ notes: e.target.value })}
                  />
                </div>
              </details>

              {/* Tags */}
              <details className="ts-section">
                <summary className="ts-section-summary">
                  <span className="ts-section-title">🏷 Tags</span>
                  <span className="ts-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="ts-section-body">
                  <div className="ts-chip-input">
                    <div className="ts-chip-list">
                      {(selected.tags || []).map((tag, i) => (
                        <span key={i} className="ts-tag-chip">
                          {tag}
                          <button
                            type="button"
                            className="ts-tag-chip-x"
                            onClick={() => handleRemoveTag(tag)}
                            title="Remove tag"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        className="ts-chip-inp"
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
                  <span className="ts-hint">
                    Tag with anything searchable — "free-tier", "essential",
                    "annual", "needs-replacement".
                  </span>
                </div>
              </details>
            </div>
          </div>
        )}
      </main>
    </div>
    </WebsiteShell>
  );
}
