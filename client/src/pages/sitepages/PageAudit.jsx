import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './PageAudit.css';

/* ─────────────────────────────────────────────────────────────
   PageAudit — church website page inventory & review tracker
   Naming: .pa-*
   Persistence: localStorage key "web:page-audit"
   Accent: var(--accent-amber, #fbbf24)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:page-audit';

const SECTIONS = [
  { key: 'main',       label: 'Main',       plural: 'Main',           icon: '🏠' },
  { key: 'ministries', label: 'Ministries', plural: 'Ministries',     icon: '⛪' },
  { key: 'events',     label: 'Events',     plural: 'Events',         icon: '🎉' },
  { key: 'media',      label: 'Media',      plural: 'Media',          icon: '📹' },
  { key: 'about',      label: 'About',      plural: 'About',          icon: 'ℹ' },
  { key: 'connect',    label: 'Connect',    plural: 'Connect',        icon: '🤝' },
  { key: 'other',      label: 'Other',      plural: 'Other',          icon: '📄' },
];

const SECTION_BY_KEY = SECTIONS.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const STATUSES = [
  { key: 'active',   label: 'Active',   color: '#34d399' },
  { key: 'outdated', label: 'Outdated', color: '#fbbf24' },
  { key: 'draft',    label: 'Draft',    color: '#60a5fa' },
  { key: 'archived', label: 'Archived', color: 'rgba(255,255,255,0.3)' },
  { key: 'broken',   label: 'Broken',   color: '#ef4444' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const FILTER_PILLS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'outdated', label: 'Outdated' },
  { key: 'draft',    label: 'Draft' },
  { key: 'archived', label: 'Archived' },
  { key: 'broken',   label: 'Broken' },
];

const FREQUENCIES = [
  { key: 'monthly',   label: 'Monthly',     days: 30 },
  { key: 'quarterly', label: 'Quarterly',   days: 90 },
  { key: 'biannual',  label: 'Bi-annually', days: 182 },
  { key: 'yearly',    label: 'Yearly',      days: 365 },
  { key: 'never',     label: 'Never',       days: null },
];

const FREQ_BY_KEY = FREQUENCIES.reduce((acc, f) => {
  acc[f.key] = f;
  return acc;
}, {});

const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: 'rgba(255,255,255,0.35)' },
  { key: 'medium', label: 'Medium', color: '#fbbf24' },
  { key: 'high',   label: 'High',   color: '#ef4444' },
];

const PRIORITY_BY_KEY = PRIORITIES.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {});

function makeId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadPages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePages(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

function emptyPage(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    name: '',
    url: '',
    section: 'main',
    owner: '',
    reviewFrequency: 'quarterly',
    lastReviewed: '',
    status: 'active',
    priority: 'medium',
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* Days between two YYYY-MM-DD dates (ignoring time-of-day). */
function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(toIso + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/* Returns null if not applicable, otherwise integer (positive = overdue) */
function overdueDays(page) {
  if (!page) return null;
  const freq = FREQ_BY_KEY[page.reviewFrequency];
  if (!freq || freq.days == null) return null;
  if (!page.lastReviewed) {
    // Never reviewed → overdue by full interval
    return freq.days;
  }
  const elapsed = daysBetween(page.lastReviewed, todayIso());
  if (elapsed == null) return null;
  return elapsed - freq.days;
}

function daysSinceReview(page) {
  if (!page || !page.lastReviewed) return null;
  const d = daysBetween(page.lastReviewed, todayIso());
  return d != null ? Math.max(0, d) : null;
}

/* ─── Sidebar row ────────────────────────────────────────────── */
function PageRow({ page, active, onClick }) {
  const sec = SECTION_BY_KEY[page.section] || SECTION_BY_KEY.other;
  const statusInfo = STATUS_BY_KEY[page.status] || STATUS_BY_KEY.active;
  const od = overdueDays(page);
  const isOverdue = od != null && od > 0;
  return (
    <button
      className={`pa-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="pa-card-top">
        <span className="pa-card-icon" aria-hidden="true">{sec.icon}</span>
        <span className="pa-card-name">{page.name || 'Untitled page'}</span>
        {page.priority === 'high' && (
          <span
            className="pa-priority-dot p-high"
            aria-label="High priority"
            title="High priority"
          />
        )}
        <span
          className={`pa-status-dot s-${page.status}`}
          style={{ background: statusInfo.color }}
          aria-label={statusInfo.label}
          title={statusInfo.label}
        />
      </div>
      {page.url && (
        <div className="pa-card-sub">{page.url}</div>
      )}
      <div className="pa-card-meta">
        {page.owner && (
          <span className="pa-card-chip" title={`Owner: ${page.owner}`}>
            👤 {page.owner}
          </span>
        )}
        {isOverdue && (
          <span className="pa-card-chip pa-card-chip-overdue">
            Overdue {od}d
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function PageAudit() {
  const [pages, setPages]           = useUserStoreKey('web:page-audit', []);
  const [searchParams, setSearchParams] = useSearchParams();
  /* If we arrived via deep-link (e.g. ?id=p_xxx from Calendar), open that
     page on mount. The id is consumed from the URL so subsequent renders
     don't keep forcing the selection. */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    return fromUrl || null;
  });
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [overdueFirst, setOverdueFirst]   = useState(false);
  const [armedDelete, setArmedDelete]     = useState(false);
  const [tagDraft, setTagDraft]           = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  /* "+ New Page" inline form */
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [newUrl, setNewUrl]           = useState('');
  const [newSection, setNewSection]   = useState('main');

  const armTimerRef   = useRef(null);
  const newNameRef    = useRef(null);
  const statusMenuRef = useRef(null);

  /* (No persist effect — useUserStoreKey writes through on setPages.) */

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

  /* Reset transient state when selection changes */
  useEffect(() => {
    setArmedDelete(false);
    setTagDraft('');
    setShowStatusMenu(false);
  }, [selectedId]);

  /* Focus new-page name input when form opens */
  useEffect(() => {
    if (showNewForm && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [showNewForm]);

  /* Close status menu on outside click */
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
    const counts = { all: pages.length, active: 0, outdated: 0, draft: 0, archived: 0, broken: 0 };
    for (const p of pages) {
      if (counts[p.status] !== undefined) counts[p.status]++;
    }
    return counts;
  }, [pages]);

  /* ─── Stats ────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    let overdue = 0;
    let outdated = 0;
    for (const p of pages) {
      const od = overdueDays(p);
      if (od != null && od > 0) overdue++;
      if (p.status === 'outdated') outdated++;
    }
    return { total: pages.length, overdue, outdated };
  }, [pages]);

  /* ─── Filtered + sorted ────────────────────────────────────── */
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = pages.filter(p => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (sectionFilter !== 'all' && p.section !== sectionFilter) return false;
      if (!q) return true;
      const hay = [
        p.name, p.url, p.owner,
        ...(Array.isArray(p.tags) ? p.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (overdueFirst) {
      list = list.slice().sort((a, b) => {
        const oa = overdueDays(a) ?? -Infinity;
        const ob = overdueDays(b) ?? -Infinity;
        if (ob !== oa) return ob - oa; // bigger overdue first
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      });
    } else {
      list = list.slice().sort(
        (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
    }
    return list;
  }, [pages, query, filter, sectionFilter, overdueFirst]);

  /* Group filtered pages by section for sidebar (skip when sorting overdue-first) */
  const groupedPages = useMemo(() => {
    if (overdueFirst) return null;
    const groups = new Map();
    for (const p of filteredPages) {
      const key = SECTION_BY_KEY[p.section] ? p.section : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const ordered = [];
    for (const s of SECTIONS) {
      if (groups.has(s.key)) {
        ordered.push({ section: s, items: groups.get(s.key) });
      }
    }
    return ordered;
  }, [filteredPages, overdueFirst]);

  const selected = useMemo(
    () => pages.find(p => p.id === selectedId) || null,
    [pages, selectedId]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setPages(prev => prev.map(p => (
      p.id === selectedId ? { ...p, ...patch, updatedAt: Date.now() } : p
    )));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewName('');
    setNewUrl('');
    setNewSection('main');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
    setNewUrl('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const page = emptyPage({
      name,
      url: newUrl.trim(),
      section: newSection,
    });
    setPages(prev => [page, ...prev]);
    setSelectedId(page.id);
    setShowNewForm(false);
    setNewName('');
    setNewUrl('');
  }, [newName, newUrl, newSection]);

  const handleEmptyStateNew = useCallback(() => {
    const page = emptyPage({ name: '' });
    setPages(prev => [page, ...prev]);
    setSelectedId(page.id);
  }, []);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    updateSelected({ status: nextStatus });
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleCyclePriority = useCallback(() => {
    if (!selected) return;
    const order = ['low', 'medium', 'high'];
    const idx = order.indexOf(selected.priority);
    const next = order[(idx + 1) % order.length];
    updateSelected({ priority: next });
  }, [selected, updateSelected]);

  const handleMarkReviewed = useCallback(() => {
    if (!selected) return;
    updateSelected({ lastReviewed: todayIso() });
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setPages(prev => prev.filter(p => p.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const now = Date.now();
    const clone = {
      ...selected,
      id: makeId(),
      name: (selected.name || 'Page') + ' (copy)',
      createdAt: now,
      updatedAt: now,
    };
    setPages(prev => [clone, ...prev]);
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

  /* ─── Render helpers ───────────────────────────────────────── */
  const currentStatusInfo = selected
    ? (STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.active)
    : null;
  const currentSectionInfo = selected
    ? (SECTION_BY_KEY[selected.section] || SECTION_BY_KEY.other)
    : null;
  const currentPriorityInfo = selected
    ? (PRIORITY_BY_KEY[selected.priority] || PRIORITY_BY_KEY.medium)
    : null;

  const selectedOverdue = selected ? overdueDays(selected) : null;
  const selectedDaysSince = selected ? daysSinceReview(selected) : null;
  const isSelectedOverdue = selectedOverdue != null && selectedOverdue > 0;

  return (
    <WebsiteShell
      title="Page Audit"
      icon="📋"
      subtitle="Inventory of every page on the church website — section, owner, review cadence, and status (Active / Outdated / Draft / Archived / Broken)."
      fullBleed
    >
    <div className="pa-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="pa-sidebar">
        <div className="pa-sidebar-head">
          <span className="pa-sidebar-title">Pages</span>
          <button
            className="pa-new-btn"
            onClick={handleStartNew}
            title="Add a new page"
          >
            + New Page
          </button>
        </div>

        {/* Stats card row (always visible) */}
        <div className="pa-stats">
          <div className="pa-stat">
            <span className="pa-stat-num">{stats.total}</span>
            <span className="pa-stat-label">Total</span>
          </div>
          <div className={`pa-stat${stats.overdue > 0 ? ' pa-stat-alert' : ''}`}>
            <span className="pa-stat-num">{stats.overdue}</span>
            <span className="pa-stat-label">Overdue</span>
          </div>
          <div className="pa-stat">
            <span className="pa-stat-num">{stats.outdated}</span>
            <span className="pa-stat-label">Outdated</span>
          </div>
        </div>

        {showNewForm && (
          <div className="pa-new-form">
            <input
              ref={newNameRef}
              className="pa-inp"
              placeholder="Page name (required)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <input
              className="pa-inp"
              placeholder="URL (e.g. /about)"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <select
              className="pa-inp"
              value={newSection}
              onChange={e => setNewSection(e.target.value)}
            >
              {SECTIONS.map(s => (
                <option key={s.key} value={s.key}>{s.icon}  {s.label}</option>
              ))}
            </select>
            <div className="pa-new-form-actions">
              <button
                className="pa-btn pa-btn-ghost"
                onClick={handleCancelNew}
              >
                Cancel
              </button>
              <button
                className="pa-btn pa-btn-accent"
                onClick={handleSaveNew}
                disabled={!newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="pa-sidebar-controls">
          <input
            className="pa-inp"
            placeholder="Search name, URL, owner, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="pa-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`pa-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="pa-pill-label">{p.label}</span>
                <span className="pa-pill-count">{statusCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <select
            className="pa-inp pa-section-filter"
            value={sectionFilter}
            onChange={e => setSectionFilter(e.target.value)}
          >
            <option value="all">All sections</option>
            {SECTIONS.map(s => (
              <option key={s.key} value={s.key}>{s.icon}  {s.plural}</option>
            ))}
          </select>
          <label className="pa-toggle">
            <input
              type="checkbox"
              checked={overdueFirst}
              onChange={e => setOverdueFirst(e.target.checked)}
            />
            <span className="pa-toggle-track">
              <span className="pa-toggle-thumb" />
            </span>
            <span className="pa-toggle-label">Show overdue first</span>
          </label>
        </div>

        <div className="pa-list">
          {filteredPages.length === 0 && (
            <p className="pa-muted pa-list-empty">
              {pages.length === 0
                ? 'No pages logged yet.'
                : 'No matches.'}
            </p>
          )}

          {overdueFirst ? (
            filteredPages.map(p => (
              <PageRow
                key={p.id}
                page={p}
                active={selectedId === p.id}
                onClick={() => setSelectedId(p.id)}
              />
            ))
          ) : (
            (groupedPages || []).map(group => (
              <div key={group.section.key} className="pa-group">
                <div className="pa-group-head">
                  <span className="pa-group-icon" aria-hidden="true">{group.section.icon}</span>
                  <span className="pa-group-title">{group.section.plural}</span>
                  <span className="pa-group-count">{group.items.length}</span>
                </div>
                {group.items.map(p => (
                  <PageRow
                    key={p.id}
                    page={p}
                    active={selectedId === p.id}
                    onClick={() => setSelectedId(p.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="pa-main">
        {!selected && pages.length === 0 && (
          <div className="pa-empty">
            <div className="pa-empty-icon" aria-hidden="true">📋</div>
            <div className="pa-empty-title">No pages logged yet</div>
            <div className="pa-empty-sub">
              Build a content inventory of every page on your church website —
              with owners, review schedules, status, and notes — so nothing slips
              through the cracks.
            </div>
            <button className="pa-btn pa-btn-accent pa-empty-cta" onClick={handleEmptyStateNew}>
              + Add your first page
            </button>
          </div>
        )}

        {!selected && pages.length > 0 && (
          <div className="pa-empty">
            <div className="pa-empty-icon" aria-hidden="true">📋</div>
            <div className="pa-empty-title">No page selected</div>
            <div className="pa-empty-sub">
              Pick a page from the sidebar, or add a new one to your audit.
            </div>
          </div>
        )}

        {selected && (
          <div className="pa-detail">
            {/* Detail header */}
            <div className="pa-detail-head">
              <div className="pa-detail-head-info">
                <input
                  className="pa-name-inp"
                  placeholder="Page name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <input
                  className="pa-url-inp"
                  placeholder="URL — e.g. /about"
                  value={selected.url}
                  onChange={e => updateSelected({ url: e.target.value })}
                />
                <div className="pa-detail-meta">
                  {/* Section chip */}
                  <label className="pa-section-chip-wrap" title="Change section">
                    <span className="pa-section-chip">
                      <span aria-hidden="true">{currentSectionInfo.icon}</span>
                      {currentSectionInfo.label}
                      <span className="pa-chip-caret" aria-hidden="true">▾</span>
                    </span>
                    <select
                      className="pa-section-chip-select"
                      value={selected.section}
                      onChange={e => updateSelected({ section: e.target.value })}
                      aria-label="Section"
                    >
                      {SECTIONS.map(s => (
                        <option key={s.key} value={s.key}>{s.icon}  {s.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Quick-status badge */}
                  <div className="pa-status-wrap" ref={statusMenuRef}>
                    <button
                      className={`pa-status-badge s-${selected.status}`}
                      onClick={() => setShowStatusMenu(v => !v)}
                      title="Click to change status"
                    >
                      <span
                        className={`pa-status-dot s-${selected.status}`}
                        style={{ background: currentStatusInfo.color }}
                      />
                      {currentStatusInfo.label}
                      <span className="pa-chip-caret" aria-hidden="true">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="pa-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            className={`pa-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                            onClick={() => handleQuickStatus(s.key)}
                          >
                            <span
                              className="pa-status-dot"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Priority chip (cycle on click) */}
                  <button
                    className={`pa-priority-chip p-${selected.priority}`}
                    onClick={handleCyclePriority}
                    title="Click to cycle priority"
                  >
                    <span
                      className="pa-priority-dot"
                      style={{ background: currentPriorityInfo.color }}
                    />
                    {currentPriorityInfo.label} priority
                  </button>

                  {/* Overdue pill */}
                  {isSelectedOverdue && (
                    <span className="pa-overdue-pill">
                      Overdue by {selectedOverdue} {selectedOverdue === 1 ? 'day' : 'days'}
                    </span>
                  )}
                </div>
              </div>
              <div className="pa-detail-actions">
                <button
                  className="pa-btn pa-btn-ghost"
                  onClick={handleDuplicate}
                  title="Duplicate this page"
                >
                  Duplicate
                </button>
                <button
                  className={`pa-btn${armedDelete ? ' pa-btn-danger-armed' : ' pa-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete page'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="pa-form">
              {/* Ownership */}
              <div className="pa-section">
                <div className="pa-section-title">Ownership</div>
                <div className="pa-row pa-row-2">
                  <label className="pa-field">
                    <span className="pa-label">Owner</span>
                    <input
                      className="pa-inp"
                      placeholder="Who's responsible for this page?"
                      value={selected.owner}
                      onChange={e => updateSelected({ owner: e.target.value })}
                    />
                  </label>
                  <label className="pa-field">
                    <span className="pa-label">Review frequency</span>
                    <select
                      className="pa-inp"
                      value={selected.reviewFrequency}
                      onChange={e => updateSelected({ reviewFrequency: e.target.value })}
                    >
                      {FREQUENCIES.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Review status */}
              <div className="pa-section">
                <div className="pa-section-title">Review Status</div>
                <div className="pa-row pa-row-2">
                  <label className="pa-field">
                    <span className="pa-label">Last reviewed</span>
                    <input
                      className="pa-inp"
                      type="date"
                      value={selected.lastReviewed}
                      onChange={e => updateSelected({ lastReviewed: e.target.value })}
                    />
                  </label>
                  <div className="pa-field">
                    <span className="pa-label">Action</span>
                    <button
                      className="pa-btn pa-btn-accent pa-mark-btn"
                      onClick={handleMarkReviewed}
                      title="Set last-reviewed to today"
                    >
                      ✓ Mark Reviewed Today
                    </button>
                  </div>
                </div>
                <div className="pa-review-summary">
                  {selected.lastReviewed ? (
                    <>
                      <span className="pa-review-stat">
                        <strong>{selectedDaysSince ?? 0}</strong>{' '}
                        {selectedDaysSince === 1 ? 'day' : 'days'} since last review
                      </span>
                      {isSelectedOverdue && (
                        <span className="pa-overdue-warning">
                          ⚠ Overdue by {selectedOverdue} {selectedOverdue === 1 ? 'day' : 'days'}
                          {' '}— scheduled every {FREQ_BY_KEY[selected.reviewFrequency]?.label.toLowerCase()}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="pa-muted pa-review-stat">
                      Never reviewed yet.
                      {selected.reviewFrequency !== 'never' && (
                        <> Click "Mark Reviewed Today" to start the clock.</>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="pa-section">
                <div className="pa-section-title">Tags</div>
                <div className="pa-chip-input">
                  <div className="pa-chip-list">
                    {(selected.tags || []).map((tag, i) => (
                      <span key={i} className="pa-tag-chip">
                        {tag}
                        <button
                          type="button"
                          className="pa-tag-chip-x"
                          onClick={() => handleRemoveTag(tag)}
                          title="Remove tag"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="pa-chip-inp"
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
                <span className="pa-hint">
                  Tag with anything searchable — "seo", "needs-photos", "outreach", "spanish".
                </span>
              </div>

              {/* Notes */}
              <div className="pa-section">
                <div className="pa-section-title">Notes</div>
                <textarea
                  className="pa-inp pa-textarea"
                  placeholder="Outstanding edits, content gaps, who to coordinate with…"
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
    </WebsiteShell>
  );
}
