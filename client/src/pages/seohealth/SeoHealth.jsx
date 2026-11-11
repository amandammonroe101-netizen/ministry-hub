import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './SeoHealth.css';

/* ─────────────────────────────────────────────────────────────
   SEO Health — per-page SEO checklist tracker
   Naming: .se-*
   Persistence: localStorage key "web:seo"
   Read-only source: "web:page-audit" (for the import-from-page-audit feature)
   Accent: var(--accent-teal, #2dd4bf)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:seo';
const AUDIT_KEY   = 'web:page-audit';

/* ── Status options for each checklist item ───────────────────── */
const STATUSES = [
  { key: 'ok',   icon: '✓', color: '#34d399', label: 'OK'   },
  { key: 'warn', icon: '⚠', color: '#fbbf24', label: 'Warn' },
  { key: 'fail', icon: '✗', color: '#ef4444', label: 'Fail' },
  { key: 'na',   icon: '⊘', color: 'rgba(255,255,255,0.35)', label: 'N/A' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => { acc[s.key] = s; return acc; }, {});

/* ── Checklist schema (in render order) ──────────────────────── */
const SECTIONS = [
  {
    key: 'meta',
    title: '🏷 Meta',
    items: [
      { key: 'title',           label: 'Meta title',          hasValue: true, autoStatus: true, valueKind: 'text',   placeholder: 'Page <title> contents…', hint: '30–60 characters is ideal.' },
      { key: 'metaDescription', label: 'Meta description',    hasValue: true, autoStatus: true, valueKind: 'text',   placeholder: 'Search-result snippet…',  hint: '120–160 characters is ideal.' },
      { key: 'h1',              label: 'Single H1 on page' },
      { key: 'canonicalUrl',    label: 'Canonical URL set' },
    ],
  },
  {
    key: 'content',
    title: '🖼 Content',
    items: [
      { key: 'altText',         label: 'All images have alt text' },
      { key: 'internalLinks',   label: 'Internal links (≥ 3)', hasCount: true, autoStatus: true },
      { key: 'externalLinks',   label: 'External links use rel="noopener"' },
    ],
  },
  {
    key: 'technical',
    title: '🔧 Technical',
    items: [
      { key: 'schemaMarkup',    label: 'Schema markup (structured data)', hasType: true },
      { key: 'mobileFriendly',  label: 'Passes mobile-friendly test' },
      { key: 'pageSpeed',       label: 'PageSpeed score',     hasScore: true, autoStatus: true, hint: '≥ 90 = OK · 70–89 = Warn · < 70 = Fail.' },
      { key: 'httpsRedirect',   label: 'HTTP → HTTPS redirect works' },
    ],
  },
  {
    key: 'discoverability',
    title: '🌐 Discoverability',
    items: [
      { key: 'sitemap',         label: 'Included in sitemap.xml' },
      { key: 'robotsTxt',       label: 'Not blocked by robots.txt' },
      { key: 'socialOg',        label: 'Open Graph / social tags' },
    ],
  },
];

const SCHEMA_TYPES = [
  { key: 'none',          label: '— None / not set' },
  { key: 'Organization',  label: 'Organization' },
  { key: 'LocalBusiness', label: 'LocalBusiness' },
  { key: 'Event',         label: 'Event' },
  { key: 'Article',       label: 'Article' },
  { key: 'other',         label: 'Other' },
];

/* Total checklist item count (across all sections) */
const ITEM_COUNT = SECTIONS.reduce((n, s) => n + s.items.length, 0);

/* ── Sort & filter options ───────────────────────────────────── */
const SORT_OPTIONS = [
  { key: 'worst',   label: 'Worst score'   },
  { key: 'best',    label: 'Best score'    },
  { key: 'audited', label: 'Last audited'  },
  { key: 'newest',  label: 'Newest first'  },
  { key: 'name',    label: 'Name (A–Z)'    },
];

const FILTER_PILLS = [
  { key: 'all',      label: 'All'         },
  { key: 'healthy',  label: 'Healthy'     },
  { key: 'needs',    label: 'Needs Work'  },
  { key: 'critical', label: 'Critical'    },
];

/* ─── Utility helpers ────────────────────────────────────────── */
function makeId() {
  return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

function loadAudits() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ── Auto-status helpers ─────────────────────────────────────── */
function autoStatusForTitle(value) {
  const len = (value || '').trim().length;
  if (len === 0) return 'fail';
  if (len >= 30 && len <= 60) return 'ok';
  if ((len >= 25 && len <= 29) || (len >= 61 && len <= 70)) return 'warn';
  return 'fail';
}

function autoStatusForMetaDesc(value) {
  const len = (value || '').trim().length;
  if (len === 0) return 'fail';
  if (len >= 120 && len <= 160) return 'ok';
  if ((len >= 100 && len <= 119) || (len >= 161 && len <= 180)) return 'warn';
  return 'fail';
}

function autoStatusForLinkCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 'fail';
  if (n >= 3) return 'ok';
  return 'warn';
}

function autoStatusForSpeed(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'fail';
  if (n >= 90) return 'ok';
  if (n >= 70) return 'warn';
  return 'fail';
}

/* Returns the effective status for an item — auto if applicable, otherwise stored. */
function effectiveStatus(item, schemaItem) {
  if (!item) return 'na';
  if (item.status === 'na') return 'na';
  if (!schemaItem || !schemaItem.autoStatus) return item.status || 'na';
  if (schemaItem.key === 'title')           return autoStatusForTitle(item.value);
  if (schemaItem.key === 'metaDescription') return autoStatusForMetaDesc(item.value);
  if (schemaItem.key === 'internalLinks')   return autoStatusForLinkCount(item.count);
  if (schemaItem.key === 'pageSpeed')       return autoStatusForSpeed(item.score);
  return item.status || 'na';
}

/* Empty checklist item shape */
function emptyChecklist() {
  const out = {};
  for (const sec of SECTIONS) {
    for (const it of sec.items) {
      out[it.key] = { status: 'na', notes: '' };
      if (it.hasValue) out[it.key].value = '';
      if (it.hasCount) out[it.key].count = '';
      if (it.hasScore) out[it.key].score = '';
      if (it.hasType)  out[it.key].type  = 'none';
    }
  }
  return out;
}

function emptyEntry(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    name: '',
    url: '',
    linkedAuditId: null,
    lastAudit: '',
    checklist: emptyChecklist(),
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* Merge a stored entry's checklist with the current schema (in case schema
   gains new items between sessions). Preserves stored values. */
function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const baseChecklist = emptyChecklist();
  const storedChecklist = (entry.checklist && typeof entry.checklist === 'object') ? entry.checklist : {};
  const merged = {};
  for (const k of Object.keys(baseChecklist)) {
    merged[k] = { ...baseChecklist[k], ...(storedChecklist[k] || {}) };
  }
  return {
    ...entry,
    name: entry.name || '',
    url: entry.url || '',
    linkedAuditId: entry.linkedAuditId || null,
    lastAudit: entry.lastAudit || '',
    notes: entry.notes || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    checklist: merged,
  };
}

/* ── Score: (oks + 0.5*warns) / nonNaItems * 100 ──────────────── */
function computeScore(entry) {
  if (!entry || !entry.checklist) return 0;
  let oks = 0, warns = 0, nonNa = 0;
  for (const sec of SECTIONS) {
    for (const schemaItem of sec.items) {
      const item = entry.checklist[schemaItem.key];
      const s = effectiveStatus(item, schemaItem);
      if (s === 'na') continue;
      nonNa++;
      if (s === 'ok')   oks++;
      if (s === 'warn') warns++;
    }
  }
  if (nonNa === 0) return 0;
  return Math.round(((oks + 0.5 * warns) / nonNa) * 100);
}

function scoreBucket(score) {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'needs';
  return 'critical';
}

function scoreColor(score) {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#fbbf24';
  return '#ef4444';
}

/* ── Date formatting helpers ─────────────────────────────────── */
function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeFromIso(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = today.getTime() - d.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/* ─── Score-ring visual ──────────────────────────────────────── */
function ScoreRing({ score, size = 'sm' }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = scoreColor(pct);
  const dim = size === 'lg' ? 96 : size === 'md' ? 56 : 38;
  const stroke = size === 'lg' ? 8 : size === 'md' ? 6 : 4;
  const radius = (dim - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);
  return (
    <div
      className={`se-ring se-ring-${size}`}
      style={{ width: dim, height: dim, color }}
      aria-label={`Score ${pct}%`}
    >
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="se-ring-num">{pct}</div>
    </div>
  );
}

/* ─── Sidebar row ────────────────────────────────────────────── */
function SeoRow({ entry, active, onClick }) {
  const score = computeScore(entry);
  return (
    <button
      className={`se-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="se-card-top">
        <ScoreRing score={score} size="sm" />
        <div className="se-card-textcol">
          <div className="se-card-name">{entry.name || 'Untitled page'}</div>
          {entry.url && (
            <div className="se-card-sub">{entry.url}</div>
          )}
        </div>
        {entry.linkedAuditId && (
          <span className="se-link-badge" title="Linked to a Page Audit entry">🔗</span>
        )}
      </div>
      <div className="se-card-meta">
        <span className="se-card-time">{relativeFromIso(entry.lastAudit)}</span>
      </div>
    </button>
  );
}

/* ─── Status toggle (4-way) ──────────────────────────────────── */
function StatusToggle({ value, onChange, disabled }) {
  return (
    <div className={`se-status-toggle${disabled ? ' is-disabled' : ''}`} role="group">
      {STATUSES.map(s => (
        <button
          key={s.key}
          type="button"
          className={`se-status-btn s-${s.key}${value === s.key ? ' on' : ''}`}
          onClick={() => !disabled && onChange(s.key)}
          title={s.label}
          disabled={disabled}
          aria-pressed={value === s.key}
        >
          <span className="se-status-icon" aria-hidden="true">{s.icon}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Checklist row ──────────────────────────────────────────── */
function ChecklistRow({ schemaItem, item, onUpdate }) {
  const isAuto = !!schemaItem.autoStatus;
  const effStatus = effectiveStatus(item, schemaItem);
  const isNa = item.status === 'na';
  /* When N/A, override the display to 'na' so user sees the gray dot */
  const displayStatus = isNa ? 'na' : effStatus;

  return (
    <div className="se-check-row">
      <div className="se-check-head">
        <span className="se-check-label">
          {schemaItem.label}
          {isAuto && <span className="se-auto-hint" title="Status auto-derived"> (auto)</span>}
        </span>
        <StatusToggle
          value={displayStatus}
          onChange={(s) => onUpdate({ status: s })}
        />
      </div>

      {/* Auto-derived value inputs */}
      {schemaItem.hasValue && (
        <div className="se-check-control">
          <input
            className="se-inp"
            placeholder={schemaItem.placeholder || ''}
            value={item.value || ''}
            onChange={e => onUpdate({ value: e.target.value })}
          />
          <span className={`se-counter s-${effStatus}`}>
            {(item.value || '').length} chars
          </span>
        </div>
      )}

      {schemaItem.hasCount && (
        <div className="se-check-control">
          <input
            className="se-inp se-inp-num"
            type="number"
            min="0"
            placeholder="0"
            value={item.count ?? ''}
            onChange={e => onUpdate({ count: e.target.value })}
          />
          <span className={`se-counter s-${effStatus}`}>
            internal link{item.count === '1' ? '' : 's'}
          </span>
        </div>
      )}

      {schemaItem.hasScore && (
        <div className="se-check-control">
          <input
            className="se-inp se-inp-num"
            type="number"
            min="0"
            max="100"
            placeholder="0–100"
            value={item.score ?? ''}
            onChange={e => onUpdate({ score: e.target.value })}
          />
          <span className={`se-counter s-${effStatus}`}>/ 100</span>
        </div>
      )}

      {schemaItem.hasType && (
        <div className="se-check-control">
          <select
            className="se-inp"
            value={item.type || 'none'}
            onChange={e => onUpdate({ type: e.target.value })}
          >
            {SCHEMA_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {schemaItem.hint && (
        <span className="se-hint">{schemaItem.hint}</span>
      )}

      <textarea
        className="se-inp se-notes"
        rows={1}
        placeholder="Notes…"
        value={item.notes || ''}
        onChange={e => onUpdate({ notes: e.target.value })}
      />
    </div>
  );
}

/* ─── Import-from-Page-Audit modal ───────────────────────────── */
function ImportModal({ audits, existingByUrl, existingByAuditId, onImport, onClose }) {
  const available = useMemo(() => {
    return audits.filter(a => {
      if (existingByAuditId.has(a.id)) return false;
      if (a.url && existingByUrl.has(a.url.toLowerCase())) return false;
      return true;
    });
  }, [audits, existingByUrl, existingByAuditId]);

  return (
    <div className="se-modal-backdrop" onClick={onClose}>
      <div className="se-modal" onClick={e => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">Import from Page Audit</div>
          <button className="se-modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="se-modal-sub">
          Pick pages already tracked in Page Audit to start an SEO audit for.
        </div>
        <div className="se-modal-body">
          {audits.length === 0 && (
            <div className="se-modal-empty">
              No pages in Page Audit yet. Add some there first.
            </div>
          )}
          {audits.length > 0 && available.length === 0 && (
            <div className="se-modal-empty">
              All Page Audit pages are already imported. 🎉
            </div>
          )}
          {available.map(a => (
            <button
              key={a.id}
              className="se-modal-row"
              onClick={() => onImport(a)}
            >
              <div className="se-modal-row-name">{a.name || 'Untitled page'}</div>
              {a.url && <div className="se-modal-row-url">{a.url}</div>}
              <span className="se-modal-row-cta">Import →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function SeoHealth() {
  const navigate = useNavigate();
  /* SEO entries stored as Firestore array. Raw values are normalized on
     read because older docs may be missing fields the UI expects. */
  const [rawItems, setRawItems] = useUserStoreKey('web:seo', []);
  const items = useMemo(
    () => (rawItems || []).map(normalizeEntry).filter(Boolean),
    [rawItems]
  );
  const setItems = useCallback((next) => {
    if (typeof next === 'function') {
      setRawItems((prev) => next((prev || []).map(normalizeEntry).filter(Boolean)));
    } else {
      setRawItems(next);
    }
  }, [setRawItems]);
  const [audits]                = useUserStoreKey('web:page-audit', []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]       = useState('');
  const [filter, setFilter]     = useState('all');
  const [sort, setSort]         = useState('worst');
  const [showNewForm, setShowNewForm]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newUrl, setNewUrl]     = useState('');
  const [showImport, setShowImport]     = useState(false);
  const [armedDelete, setArmedDelete]   = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const armTimerRef  = useRef(null);
  const newNameRef   = useRef(null);

  /* (No persist/listener — useUserStoreKey handles autosave and live sync.) */

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => { if (armTimerRef.current) clearTimeout(armTimerRef.current); };
  }, [armedDelete]);

  /* Reset transient state when selection changes */
  useEffect(() => {
    setArmedDelete(false);
    setTagDraft('');
  }, [selectedId]);

  /* Focus new-entry name input when form opens */
  useEffect(() => {
    if (showNewForm && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [showNewForm]);

  /* ─── Derived: lookups for import modal ─────────────────────── */
  const existingByUrl = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it.url) set.add(it.url.toLowerCase());
    }
    return set;
  }, [items]);

  const existingByAuditId = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it.linkedAuditId) set.add(it.linkedAuditId);
    }
    return set;
  }, [items]);

  /* ─── Derived: scores per entry (computed once) ─────────────── */
  const itemsWithScores = useMemo(() => {
    return items.map(it => ({ entry: it, score: computeScore(it) }));
  }, [items]);

  /* ─── Derived: status counts for pills ──────────────────────── */
  const bucketCounts = useMemo(() => {
    const c = { all: items.length, healthy: 0, needs: 0, critical: 0 };
    for (const { score } of itemsWithScores) {
      c[scoreBucket(score)]++;
    }
    return c;
  }, [items, itemsWithScores]);

  /* ─── Derived: stats row ────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = items.length;
    let auditedCount = 0;
    let sum = 0;
    let critical = 0;
    let mostRecent = '';
    for (const { entry, score } of itemsWithScores) {
      if (entry.lastAudit) {
        auditedCount++;
        if (!mostRecent || entry.lastAudit > mostRecent) mostRecent = entry.lastAudit;
      }
      sum += score;
      if (scoreBucket(score) === 'critical') critical++;
    }
    const avg = total === 0 ? 0 : Math.round(sum / total);
    return { total, auditedCount, avg, critical, mostRecent };
  }, [items, itemsWithScores]);

  /* ─── Derived: filtered + sorted list ───────────────────────── */
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = itemsWithScores.filter(({ entry, score }) => {
      if (filter !== 'all' && scoreBucket(score) !== filter) return false;
      if (!q) return true;
      const hay = [
        entry.name, entry.url,
        ...(Array.isArray(entry.tags) ? entry.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    const cmp = {
      worst:   (a, b) => a.score - b.score,
      best:    (a, b) => b.score - a.score,
      audited: (a, b) => (b.entry.lastAudit || '').localeCompare(a.entry.lastAudit || ''),
      newest:  (a, b) => (b.entry.createdAt || 0) - (a.entry.createdAt || 0),
      name:    (a, b) => (a.entry.name || '').localeCompare(b.entry.name || '', undefined, { sensitivity: 'base' }),
    }[sort];
    out = out.slice().sort(cmp);
    return out;
  }, [itemsWithScores, query, filter, sort]);

  const selected = useMemo(
    () => items.find(it => it.id === selectedId) || null,
    [items, selectedId]
  );
  const selectedScore = selected ? computeScore(selected) : 0;

  /* ─── Mutators ──────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setItems(prev => prev.map(it =>
      it.id === selectedId ? { ...it, ...patch, updatedAt: Date.now() } : it
    ));
  }, [selectedId]);

  const updateChecklistItem = useCallback((itemKey, patch) => {
    if (!selectedId) return;
    setItems(prev => prev.map(it => {
      if (it.id !== selectedId) return it;
      return {
        ...it,
        updatedAt: Date.now(),
        checklist: {
          ...it.checklist,
          [itemKey]: { ...(it.checklist[itemKey] || {}), ...patch },
        },
      };
    }));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewName('');
    setNewUrl('');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
    setNewUrl('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const entry = emptyEntry({ name, url: newUrl.trim() });
    setItems(prev => [entry, ...prev]);
    setSelectedId(entry.id);
    setShowNewForm(false);
    setNewName('');
    setNewUrl('');
  }, [newName, newUrl]);

  const handleEmptyStateNew = useCallback(() => {
    const entry = emptyEntry({ name: '' });
    setItems(prev => [entry, ...prev]);
    setSelectedId(entry.id);
  }, []);

  const handleMarkAudited = useCallback(() => {
    if (!selectedId) return;
    updateSelected({ lastAudit: todayIso() });
  }, [selectedId, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setItems(prev => prev.filter(it => it.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleImport = useCallback((audit) => {
    const entry = emptyEntry({
      name: audit.name || '',
      url: audit.url || '',
      linkedAuditId: audit.id,
    });
    setItems(prev => [entry, ...prev]);
    setSelectedId(entry.id);
    setShowImport(false);
  }, []);

  const handleOpenLinkedAudit = useCallback(() => {
    if (!selected || !selected.linkedAuditId) return;
    navigate(`/site-pages?id=${encodeURIComponent(selected.linkedAuditId)}`);
  }, [selected, navigate]);

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
    updateSelected({ tags: (selected.tags || []).filter(x => x !== tag) });
  }, [selected, updateSelected]);

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <WebsiteShell
      title="SEO Health"
      icon="🔍"
      subtitle="Per-page SEO checklist — meta title/description, H1, canonical URL — pulled from the Page Audit."
      fullBleed
    >
    <div className="se-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="se-sidebar">
        <div className="se-sidebar-head">
          <span className="se-sidebar-title">SEO Pages</span>
          <button
            className="se-new-btn"
            onClick={handleStartNew}
            title="Start a new SEO audit"
          >
            + New Audit
          </button>
        </div>

        {showNewForm && (
          <div className="se-new-form">
            <input
              ref={newNameRef}
              className="se-inp"
              placeholder="Page name (e.g. Home)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <input
              className="se-inp"
              placeholder="URL (optional)…"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <div className="se-new-form-actions">
              <button className="se-btn se-btn-ghost" onClick={handleCancelNew}>
                Cancel
              </button>
              <button
                className="se-btn se-btn-accent"
                onClick={handleSaveNew}
                disabled={!newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="se-sidebar-controls">
          <input
            className="se-inp"
            placeholder="Search name, url, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select
            className="se-inp"
            value={sort}
            onChange={e => setSort(e.target.value)}
            aria-label="Sort"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>Sort: {o.label}</option>
            ))}
          </select>
          <div className="se-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`se-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="se-pill-label">{p.label}</span>
                <span className="se-pill-count">{bucketCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <button
            className="se-btn se-btn-ghost se-import-btn"
            onClick={() => setShowImport(true)}
            title="Pull pages from Page Audit"
          >
            📥 Import from Page Audit
          </button>
        </div>

        <div className="se-list">
          {filteredItems.length === 0 && (
            <p className="se-muted se-list-empty">
              {items.length === 0 ? 'No SEO audits yet.' : 'No matches.'}
            </p>
          )}
          {filteredItems.map(({ entry }) => (
            <SeoRow
              key={entry.id}
              entry={entry}
              active={selectedId === entry.id}
              onClick={() => setSelectedId(entry.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="se-main">
        {/* Stats row — always visible */}
        <div className="se-stats">
          <div className="se-stat">
            <div className="se-stat-num">{stats.total}</div>
            <div className="se-stat-lbl">Pages tracked</div>
          </div>
          <div className="se-stat">
            <div className="se-stat-num" style={{ color: scoreColor(stats.avg) }}>
              {stats.avg}%
            </div>
            <div className="se-stat-lbl">Avg score</div>
          </div>
          <div className={`se-stat${stats.critical > 0 ? ' se-stat-critical' : ''}`}>
            <div className="se-stat-num">{stats.critical}</div>
            <div className="se-stat-lbl">Critical pages</div>
          </div>
          <div className="se-stat">
            <div className="se-stat-num se-stat-date">
              {stats.mostRecent ? formatDateShort(stats.mostRecent) : '—'}
            </div>
            <div className="se-stat-lbl">Last audit</div>
          </div>
        </div>

        {!selected && items.length === 0 && (
          <div className="se-empty">
            <div className="se-empty-icon" aria-hidden="true">🔍</div>
            <div className="se-empty-title">No audits yet</div>
            <div className="se-empty-sub">
              Track SEO health page-by-page — meta tags, alt text, schema
              markup, page speed, sitemaps and more. Score each page so the
              team knows where to focus.
            </div>
            <button className="se-btn se-btn-accent se-empty-cta" onClick={handleEmptyStateNew}>
              + Add your first audit
            </button>
          </div>
        )}

        {!selected && items.length > 0 && (
          <div className="se-empty">
            <div className="se-empty-icon" aria-hidden="true">🔍</div>
            <div className="se-empty-title">No audit selected</div>
            <div className="se-empty-sub">
              Pick a page from the sidebar to view and update its SEO
              checklist — or start a new audit.
            </div>
          </div>
        )}

        {selected && (
          <div className="se-detail">
            {/* Detail header */}
            <div className="se-detail-head">
              <div className="se-detail-head-info">
                <input
                  className="se-name-inp"
                  placeholder="Page name (e.g. Home)…"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <input
                  className="se-inp se-url-inp"
                  placeholder="https://yourchurch.org/page"
                  value={selected.url}
                  onChange={e => updateSelected({ url: e.target.value })}
                />

                <div className="se-detail-meta">
                  <span className="se-meta-chip">
                    Last audit: <strong>{relativeFromIso(selected.lastAudit)}</strong>
                    {selected.lastAudit && (
                      <span className="se-meta-chip-sub"> · {formatDateShort(selected.lastAudit)}</span>
                    )}
                  </span>
                  <button
                    className="se-btn se-btn-accent se-mark-btn"
                    onClick={handleMarkAudited}
                  >
                    Mark Audited Today
                  </button>
                  {selected.linkedAuditId && (
                    <button
                      className="se-link-chip"
                      onClick={handleOpenLinkedAudit}
                      title="Open the linked Page Audit entry"
                    >
                      🔗 Linked to Page Audit
                    </button>
                  )}
                </div>
              </div>

              <div className="se-detail-score">
                <ScoreRing score={selectedScore} size="lg" />
                <div className="se-detail-score-lbl">SEO Score</div>
              </div>
            </div>

            {/* Detail actions row */}
            <div className="se-detail-actions">
              <button
                className={`se-btn${armedDelete ? ' se-btn-danger-armed' : ' se-btn-danger'}`}
                onClick={handleDelete}
                title={armedDelete ? 'Click again to confirm deletion' : 'Delete audit'}
              >
                {armedDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            </div>

            {/* Sections */}
            <div className="se-form">
              {SECTIONS.map(sec => (
                <details key={sec.key} className="se-section" open>
                  <summary className="se-section-summary">
                    <span className="se-section-title">{sec.title}</span>
                    <span className="se-section-caret" aria-hidden="true">▾</span>
                  </summary>
                  <div className="se-section-body">
                    {sec.items.map(schemaItem => {
                      const item = selected.checklist[schemaItem.key] || { status: 'na', notes: '' };
                      return (
                        <ChecklistRow
                          key={schemaItem.key}
                          schemaItem={schemaItem}
                          item={item}
                          onUpdate={(patch) => updateChecklistItem(schemaItem.key, patch)}
                        />
                      );
                    })}
                  </div>
                </details>
              ))}

              {/* Notes & tags */}
              <details className="se-section" open>
                <summary className="se-section-summary">
                  <span className="se-section-title">📝 Notes & Tags</span>
                  <span className="se-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="se-section-body">
                  <label className="se-field">
                    <span className="se-label">General notes</span>
                    <textarea
                      className="se-inp se-textarea"
                      placeholder="History, what's been tried, known issues…"
                      rows={5}
                      value={selected.notes}
                      onChange={e => updateSelected({ notes: e.target.value })}
                    />
                  </label>
                  <label className="se-field">
                    <span className="se-label">Tags</span>
                    <div className="se-chip-input">
                      <div className="se-chip-list">
                        {(selected.tags || []).map((tag, i) => (
                          <span key={i} className="se-tag-chip">
                            {tag}
                            <button
                              type="button"
                              className="se-tag-chip-x"
                              onClick={() => handleRemoveTag(tag)}
                              title="Remove tag"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          className="se-chip-inp"
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
                  </label>
                </div>
              </details>
            </div>
          </div>
        )}
      </main>

      {showImport && (
        <ImportModal
          audits={audits}
          existingByUrl={existingByUrl}
          existingByAuditId={existingByAuditId}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
    </WebsiteShell>
  );
}
