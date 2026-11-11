import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './FormsTracker.css';

/* ─────────────────────────────────────────────────────────────
   Forms Tracker — church website forms catalog
   Naming: .ft-*
   Persistence: localStorage key "web:forms"
   Accent: var(--accent-green, #6ee7b7)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:forms';

const FORM_TYPES = [
  { key: 'contact',    label: 'Contact',          icon: '✉' },
  { key: 'prayer',     label: 'Prayer Request',   icon: '🙏' },
  { key: 'newsletter', label: 'Newsletter',       icon: '📧' },
  { key: 'event-rsvp', label: 'Event RSVP',       icon: '📅' },
  { key: 'volunteer',  label: 'Volunteer',        icon: '🤝' },
  { key: 'feedback',   label: 'Feedback',         icon: '💬' },
  { key: 'donation',   label: 'Donation',         icon: '💝' },
  { key: 'other',      label: 'Other',            icon: '📥' },
];

const TYPE_BY_KEY = FORM_TYPES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});

const STATUSES = [
  { key: 'active',     label: 'Active',     color: '#34d399' },
  { key: 'paused',     label: 'Paused',     color: '#fbbf24' },
  { key: 'broken',     label: 'Broken',     color: '#ef4444' },
  { key: 'deprecated', label: 'Deprecated', color: 'rgba(255,255,255,0.32)' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const FILTER_PILLS = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'paused',     label: 'Paused' },
  { key: 'broken',     label: 'Broken' },
  { key: 'deprecated', label: 'Deprecated' },
];

const FIELD_TYPES = [
  { key: 'text',     label: 'Text' },
  { key: 'email',    label: 'Email' },
  { key: 'tel',      label: 'Phone' },
  { key: 'textarea', label: 'Textarea' },
  { key: 'select',   label: 'Select' },
  { key: 'checkbox', label: 'Checkbox' },
  { key: 'date',     label: 'Date' },
];

const SECTION_BLOCKS = [
  { key: 'description', icon: '📝', label: 'Description' },
  { key: 'recipients',  icon: '👥', label: 'Recipients' },
  { key: 'fields',      icon: '📋', label: 'Fields' },
  { key: 'settings',    icon: '⚙',  label: 'Settings' },
  { key: 'review',      icon: '🔁', label: 'Review Schedule' },
  { key: 'activity',    icon: '📊', label: 'Activity' },
  { key: 'tagsnotes',   icon: '🏷', label: 'Tags & Notes' },
];

const DEFAULT_EXPANDED = SECTION_BLOCKS.reduce(
  (acc, s) => ({ ...acc, [s.key]: true }), {}
);

function makeId(prefix = 'f') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadForms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveForms(forms) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
  } catch {
    /* ignore quota errors */
  }
}

function emptyForm(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId('f'),
    name: '',
    type: 'contact',
    pageUrl: '',
    description: '',
    recipients: [],
    fields: [],
    status: 'active',
    lastReviewed: '',
    reviewDueDate: '',
    submissionNotes: '',
    totalSubmissions: 0,
    needsConfirmationEmail: false,
    sendsAutoresponder: false,
    tags: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function emptyField(overrides = {}) {
  return {
    id: makeId('fld'),
    label: '',
    type: 'text',
    required: false,
    ...overrides,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const ms = now - then;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/* Days until a YYYY-MM-DD due date.
   Returns null if empty/invalid; otherwise positive = future, 0 = today, negative = overdue. */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/* Returns an object describing the due-date state for badge rendering.
   tone is 'muted' | 'red' | 'amber' | 'green'.
   text is the human-readable label.
   short is a compact form for the sidebar pill. */
function reviewDueInfo(dateStr) {
  if (!dateStr) {
    return { tone: 'muted', text: 'No due date set', short: '', isSet: false };
  }
  const n = daysUntil(dateStr);
  if (n === null) {
    return { tone: 'muted', text: 'No due date set', short: '', isSet: false };
  }
  if (n < 0) {
    const od = Math.abs(n);
    return {
      tone: 'red',
      text: `⚠ Overdue by ${od} day${od === 1 ? '' : 's'}`,
      short: `Overdue ${od}d`,
      isSet: true,
    };
  }
  if (n === 0) {
    return { tone: 'red', text: 'Due today', short: 'Due today', isSet: true };
  }
  if (n <= 7) {
    return {
      tone: 'red',
      text: `Due in ${n} day${n === 1 ? '' : 's'}`,
      short: `Due ${n}d`,
      isSet: true,
    };
  }
  if (n <= 30) {
    return {
      tone: 'amber',
      text: `Due in ${n} days`,
      short: `Due ${n}d`,
      isSet: true,
    };
  }
  return {
    tone: 'green',
    text: `Due in ${n} days`,
    short: `Due ${n}d`,
    isSet: true,
  };
}

function addDaysIso(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function looksLikeUrl(s) {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}

function typeIcon(typeKey) {
  return (TYPE_BY_KEY[typeKey] || TYPE_BY_KEY.other).icon;
}

function typeLabel(typeKey) {
  return (TYPE_BY_KEY[typeKey] || TYPE_BY_KEY.other).label;
}

/* ─── Sidebar form row ───────────────────────────────────────── */
function FormRow({ form, active, onClick }) {
  const statusInfo = STATUS_BY_KEY[form.status] || STATUS_BY_KEY.active;
  const total = Number(form.totalSubmissions) || 0;
  const dueInfo = reviewDueInfo(form.reviewDueDate);
  return (
    <button
      className={`ft-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="ft-card-top">
        <span className="ft-card-icon" aria-hidden="true">{typeIcon(form.type)}</span>
        <span className="ft-card-name">{form.name || 'Untitled form'}</span>
        <span
          className={`ft-status-dot s-${form.status}`}
          style={{ background: statusInfo.color }}
          aria-label={statusInfo.label}
          title={statusInfo.label}
        />
      </div>
      {form.pageUrl && (
        <div className="ft-card-sub" title={form.pageUrl}>
          {form.pageUrl}
        </div>
      )}
      {(total > 0 || dueInfo.isSet) && (
        <div className="ft-card-meta">
          {total > 0 && (
            <span className="ft-card-chip">📊 {total} submissions</span>
          )}
          {dueInfo.isSet && (
            <span
              className={`ft-due-pill ft-due-${dueInfo.tone}`}
              title={dueInfo.text}
            >
              {dueInfo.short}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Collapsible Section ───────────────────────────────────── */
function SectionBlock({ block, expanded, onToggle, children }) {
  return (
    <div className={`ft-sec${expanded ? ' open' : ' closed'}`}>
      <button
        type="button"
        className="ft-sec-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="ft-sec-icon" aria-hidden="true">{block.icon}</span>
        <span className="ft-sec-label">{block.label}</span>
        <span className="ft-sec-caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className="ft-sec-body">{children}</div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function FormsTracker() {
  const [forms, setForms]           = useUserStoreKey('web:forms', []);
  const [searchParams, setSearchParams] = useSearchParams();
  /* If we arrived via deep-link (e.g. ?id=f_xxx from Calendar), open that
     form on mount. The id is consumed from the URL so subsequent renders
     don't keep forcing the selection. */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    return fromUrl || null;
  });
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [armedDelete, setArmedDelete] = useState(false);
  const [tagDraft, setTagDraft]     = useState('');
  const [recipientDraft, setRecipientDraft] = useState('');
  const [expandedSecs, setExpandedSecs] = useState(DEFAULT_EXPANDED);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  /* "+ New Form" inline form */
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [newType, setNewType]         = useState('contact');
  const [newPageUrl, setNewPageUrl]   = useState('');

  const armTimerRef = useRef(null);
  const newNameRef  = useRef(null);
  const statusMenuRef = useRef(null);

  /* (No persist effect — useUserStoreKey writes through on setForms.) */

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
    setRecipientDraft('');
    setShowStatusMenu(false);
  }, [selectedId]);

  /* Focus new-form name input when form opens */
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

  /* ─── Derived: status counts ──────────────────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { all: forms.length, active: 0, paused: 0, broken: 0, deprecated: 0 };
    for (const f of forms) {
      if (counts[f.status] !== undefined) counts[f.status]++;
    }
    return counts;
  }, [forms]);

  /* ─── Derived: filtered list ──────────────────────────────── */
  const filteredForms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return forms.filter(f => {
      if (filter !== 'all' && f.status !== filter) return false;
      if (typeFilter !== 'all' && f.type !== typeFilter) return false;
      if (!q) return true;
      const recipientStr = (Array.isArray(f.recipients) ? f.recipients : []).join(' ');
      const tagsStr = (Array.isArray(f.tags) ? f.tags : []).join(' ');
      const hay = [
        f.name, f.pageUrl, recipientStr, tagsStr,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [forms, query, filter, typeFilter]);

  const selected = useMemo(
    () => forms.find(f => f.id === selectedId) || null,
    [forms, selectedId]
  );

  /* ─── Mutators ────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setForms(prev => prev.map(f =>
      f.id === selectedId
        ? { ...f, ...patch, updatedAt: Date.now() }
        : f
    ));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewName('');
    setNewType('contact');
    setNewPageUrl('');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
    setNewPageUrl('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const form = emptyForm({
      name,
      type: newType,
      pageUrl: newPageUrl.trim(),
    });
    setForms(prev => [form, ...prev]);
    setSelectedId(form.id);
    setShowNewForm(false);
    setNewName('');
    setNewPageUrl('');
  }, [newName, newType, newPageUrl]);

  const handleEmptyStateNew = useCallback(() => {
    setShowNewForm(true);
  }, []);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    updateSelected({ status: nextStatus });
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setForms(prev => prev.filter(f => f.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleMarkReviewed = useCallback(() => {
    if (!selected) return;
    updateSelected({ lastReviewed: todayISO() });
  }, [selected, updateSelected]);

  /* ─── Recipients chip-input ───────────────────────────────── */
  const handleAddRecipient = useCallback(() => {
    const v = recipientDraft.trim();
    if (!v || !selected) return;
    const existing = Array.isArray(selected.recipients) ? selected.recipients : [];
    if (existing.some(x => x.toLowerCase() === v.toLowerCase())) {
      setRecipientDraft('');
      return;
    }
    updateSelected({ recipients: [...existing, v] });
    setRecipientDraft('');
  }, [recipientDraft, selected, updateSelected]);

  const handleRemoveRecipient = useCallback((r) => {
    if (!selected) return;
    updateSelected({
      recipients: (selected.recipients || []).filter(x => x !== r),
    });
  }, [selected, updateSelected]);

  /* ─── Tags chip-input ─────────────────────────────────────── */
  const handleAddTag = useCallback(() => {
    const v = tagDraft.trim();
    if (!v || !selected) return;
    const existing = Array.isArray(selected.tags) ? selected.tags : [];
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

  /* ─── Fields management ──────────────────────────────────── */
  const handleAddField = useCallback(() => {
    if (!selected) return;
    const existing = Array.isArray(selected.fields) ? selected.fields : [];
    updateSelected({ fields: [...existing, emptyField()] });
  }, [selected, updateSelected]);

  const handleUpdateField = useCallback((fieldId, patch) => {
    if (!selected) return;
    const existing = Array.isArray(selected.fields) ? selected.fields : [];
    updateSelected({
      fields: existing.map(f => f.id === fieldId ? { ...f, ...patch } : f),
    });
  }, [selected, updateSelected]);

  const handleRemoveField = useCallback((fieldId) => {
    if (!selected) return;
    const existing = Array.isArray(selected.fields) ? selected.fields : [];
    updateSelected({ fields: existing.filter(f => f.id !== fieldId) });
  }, [selected, updateSelected]);

  const handleMoveField = useCallback((fieldId, dir) => {
    if (!selected) return;
    const existing = Array.isArray(selected.fields) ? selected.fields : [];
    const idx = existing.findIndex(f => f.id === fieldId);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= existing.length) return;
    const next = existing.slice();
    const [moved] = next.splice(idx, 1);
    next.splice(newIdx, 0, moved);
    updateSelected({ fields: next });
  }, [selected, updateSelected]);

  const handleToggleSection = useCallback((key) => {
    setExpandedSecs(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ─── Render ─────────────────────────────────────────────── */
  const currentStatusInfo = selected
    ? (STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.active)
    : null;
  const currentTypeInfo = selected
    ? (TYPE_BY_KEY[selected.type] || TYPE_BY_KEY.other)
    : null;

  const reviewDays = selected ? daysSince(selected.lastReviewed) : null;
  const reviewLabel = !selected
    ? ''
    : selected.lastReviewed
      ? (reviewDays === 0 ? 'Reviewed today'
        : reviewDays === 1 ? 'Reviewed 1 day ago'
        : `Reviewed ${reviewDays} days ago`)
      : 'Never reviewed';
  const selectedDueInfo = reviewDueInfo(selected?.reviewDueDate);

  return (
    <WebsiteShell
      title="Forms Tracker"
      icon="📥"
      subtitle="Every form embedded on the site — Contact, Prayer, Newsletter, RSVP, Volunteer, and more — with status and review due dates."
      fullBleed
    >
    <div className="ft-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="ft-sidebar">
        <div className="ft-sidebar-head">
          <span className="ft-sidebar-title">Forms</span>
          {!showNewForm && (
            <button
              className="ft-new-btn"
              onClick={handleStartNew}
              title="Catalog a new form"
            >
              + New Form
            </button>
          )}
        </div>

        {showNewForm && (
          <div className="ft-new-form">
            <input
              ref={newNameRef}
              className="ft-inp"
              placeholder="Form name (required)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <select
              className="ft-inp"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              {FORM_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.icon}  {t.label}</option>
              ))}
            </select>
            <input
              className="ft-inp"
              placeholder="Page URL (e.g. /contact)"
              value={newPageUrl}
              onChange={e => setNewPageUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <div className="ft-new-form-actions">
              <button className="ft-btn ft-btn-ghost" onClick={handleCancelNew}>
                Cancel
              </button>
              <button
                className="ft-btn ft-btn-accent"
                onClick={handleSaveNew}
                disabled={!newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="ft-sidebar-controls">
          <input
            className="ft-inp"
            placeholder="Search name, URL, recipients, tags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="ft-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`ft-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="ft-pill-label">{p.label}</span>
                <span className="ft-pill-count">{statusCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <select
            className="ft-inp ft-type-filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {FORM_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.icon}  {t.label}</option>
            ))}
          </select>
        </div>

        <div className="ft-list">
          {filteredForms.length === 0 && (
            <p className="ft-muted ft-list-empty">
              {forms.length === 0
                ? 'No forms catalogued yet.'
                : 'No matches.'}
            </p>
          )}

          {filteredForms.map(f => (
            <FormRow
              key={f.id}
              form={f}
              active={selectedId === f.id}
              onClick={() => setSelectedId(f.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="ft-main">
        {!selected && forms.length === 0 && (
          <div className="ft-empty">
            <div className="ft-empty-icon" aria-hidden="true">📥</div>
            <div className="ft-empty-title">No forms catalogued yet</div>
            <div className="ft-empty-sub">
              Track every form on the church website — contact, prayer requests, newsletter
              signups, event RSVPs, volunteer interest — with where they live, who gets
              submissions, and how often they're used.
            </div>
            <button
              className="ft-btn ft-btn-accent ft-empty-cta"
              onClick={handleEmptyStateNew}
            >
              + Add your first form
            </button>
          </div>
        )}

        {!selected && forms.length > 0 && (
          <div className="ft-empty">
            <div className="ft-empty-icon" aria-hidden="true">📥</div>
            <div className="ft-empty-title">No form selected</div>
            <div className="ft-empty-sub">
              Pick a form from the sidebar, or add a new one to your catalog.
            </div>
          </div>
        )}

        {selected && (
          <div className="ft-detail">
            {/* Detail header */}
            <div className="ft-detail-head">
              <div className="ft-detail-head-info">
                <input
                  className="ft-name-inp"
                  placeholder="Form name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="ft-detail-meta">
                  {/* Type chip (clickable to change) */}
                  <label className="ft-type-chip-wrap" title="Change form type">
                    <span className="ft-type-chip">
                      <span aria-hidden="true">{currentTypeInfo.icon}</span>
                      {currentTypeInfo.label}
                      <span className="ft-type-chip-caret" aria-hidden="true">▾</span>
                    </span>
                    <select
                      className="ft-type-chip-select"
                      value={selected.type}
                      onChange={e => updateSelected({ type: e.target.value })}
                      aria-label="Form type"
                    >
                      {FORM_TYPES.map(t => (
                        <option key={t.key} value={t.key}>{t.icon}  {t.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Page URL input + open link */}
                  <div className="ft-url-chip">
                    <span className="ft-url-icon" aria-hidden="true">🔗</span>
                    <input
                      className="ft-url-inp"
                      placeholder="Page URL (e.g. /contact)"
                      value={selected.pageUrl}
                      onChange={e => updateSelected({ pageUrl: e.target.value })}
                    />
                    {looksLikeUrl(selected.pageUrl) && (
                      <a
                        href={selected.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ft-url-open"
                        title="Open page in new tab"
                      >
                        ↗
                      </a>
                    )}
                  </div>

                  {/* Quick-status pill */}
                  <div className="ft-status-wrap" ref={statusMenuRef}>
                    <button
                      className={`ft-status-badge s-${selected.status}`}
                      onClick={() => setShowStatusMenu(v => !v)}
                      title="Click to change status"
                    >
                      <span
                        className={`ft-status-dot s-${selected.status}`}
                        style={{ background: currentStatusInfo.color }}
                      />
                      {currentStatusInfo.label}
                      <span className="ft-status-caret" aria-hidden="true">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="ft-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            className={`ft-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                            onClick={() => handleQuickStatus(s.key)}
                          >
                            <span
                              className="ft-status-dot"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="ft-review-row">
                  <button
                    className="ft-btn ft-btn-accent ft-btn-sm"
                    onClick={handleMarkReviewed}
                    title="Stamp today as the last reviewed date"
                  >
                    ✓ Mark Reviewed Today
                  </button>
                  <span className="ft-review-label">{reviewLabel}</span>
                  {selected.lastReviewed && (
                    <span className="ft-review-date">({selected.lastReviewed})</span>
                  )}
                </div>
              </div>
              <div className="ft-detail-actions">
                <button
                  className={`ft-btn${armedDelete ? ' ft-btn-danger-armed' : ' ft-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete form'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Detail body */}
            <div className="ft-form">
              {/* Description */}
              <SectionBlock
                block={SECTION_BLOCKS[0]}
                expanded={!!expandedSecs.description}
                onToggle={() => handleToggleSection('description')}
              >
                <textarea
                  className="ft-inp ft-textarea"
                  placeholder="What does this form do? Who uses it and when?"
                  rows={4}
                  value={selected.description}
                  onChange={e => updateSelected({ description: e.target.value })}
                />
              </SectionBlock>

              {/* Recipients */}
              <SectionBlock
                block={SECTION_BLOCKS[1]}
                expanded={!!expandedSecs.recipients}
                onToggle={() => handleToggleSection('recipients')}
              >
                <div className="ft-chip-input">
                  <div className="ft-chip-list">
                    {(selected.recipients || []).map((r, i) => (
                      <span key={i} className="ft-recipient-chip">
                        {r}
                        <button
                          type="button"
                          className="ft-tag-chip-x"
                          onClick={() => handleRemoveRecipient(r)}
                          title="Remove recipient"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="ft-chip-inp"
                      placeholder={
                        (selected.recipients || []).length === 0
                          ? 'Add an email or name and press Enter…'
                          : 'Add another recipient…'
                      }
                      value={recipientDraft}
                      onChange={e => setRecipientDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecipient();
                        } else if (
                          e.key === 'Backspace' &&
                          recipientDraft === '' &&
                          (selected.recipients || []).length > 0
                        ) {
                          e.preventDefault();
                          const last = selected.recipients[selected.recipients.length - 1];
                          handleRemoveRecipient(last);
                        }
                      }}
                      onBlur={handleAddRecipient}
                    />
                  </div>
                </div>
                <span className="ft-hint">
                  Press Enter to add. Use emails (office@church.org) or names (Pastor Mike).
                </span>
              </SectionBlock>

              {/* Fields */}
              <SectionBlock
                block={SECTION_BLOCKS[2]}
                expanded={!!expandedSecs.fields}
                onToggle={() => handleToggleSection('fields')}
              >
                <div className="ft-fields">
                  {(selected.fields || []).length === 0 && (
                    <p className="ft-muted ft-fields-empty">
                      No fields yet. Add the inputs the form collects.
                    </p>
                  )}
                  {(selected.fields || []).map((field, idx) => (
                    <div key={field.id} className="ft-field-row">
                      <div className="ft-field-order">
                        <button
                          type="button"
                          className="ft-field-move"
                          onClick={() => handleMoveField(field.id, -1)}
                          disabled={idx === 0}
                          title="Move up"
                          aria-label="Move field up"
                        >▲</button>
                        <button
                          type="button"
                          className="ft-field-move"
                          onClick={() => handleMoveField(field.id, +1)}
                          disabled={idx === (selected.fields || []).length - 1}
                          title="Move down"
                          aria-label="Move field down"
                        >▼</button>
                      </div>
                      <input
                        className="ft-inp ft-field-label"
                        placeholder="Field label (e.g. Full name)"
                        value={field.label}
                        onChange={e => handleUpdateField(field.id, { label: e.target.value })}
                      />
                      <select
                        className="ft-inp ft-field-type"
                        value={field.type}
                        onChange={e => handleUpdateField(field.id, { type: e.target.value })}
                      >
                        {FIELD_TYPES.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                      <label className="ft-field-required">
                        <input
                          type="checkbox"
                          checked={!!field.required}
                          onChange={e => handleUpdateField(field.id, { required: e.target.checked })}
                        />
                        <span>Required</span>
                      </label>
                      <button
                        type="button"
                        className="ft-field-remove"
                        onClick={() => handleRemoveField(field.id)}
                        title="Remove field"
                        aria-label="Remove field"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ft-btn ft-btn-ghost ft-add-field-btn"
                    onClick={handleAddField}
                  >
                    + Add field
                  </button>
                </div>
              </SectionBlock>

              {/* Settings */}
              <SectionBlock
                block={SECTION_BLOCKS[3]}
                expanded={!!expandedSecs.settings}
                onToggle={() => handleToggleSection('settings')}
              >
                <label className="ft-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!selected.needsConfirmationEmail}
                    onChange={e => updateSelected({ needsConfirmationEmail: e.target.checked })}
                  />
                  <span className="ft-toggle-label">
                    <span className="ft-toggle-title">Confirmation email to submitter</span>
                    <span className="ft-toggle-sub">Send a "we got it" email back to the person who submitted.</span>
                  </span>
                </label>
                <label className="ft-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!selected.sendsAutoresponder}
                    onChange={e => updateSelected({ sendsAutoresponder: e.target.checked })}
                  />
                  <span className="ft-toggle-label">
                    <span className="ft-toggle-title">Auto-responder enabled</span>
                    <span className="ft-toggle-sub">Send an automated reply with next steps or resources.</span>
                  </span>
                </label>
              </SectionBlock>

              {/* Review Schedule */}
              <SectionBlock
                block={SECTION_BLOCKS[4]}
                expanded={!!expandedSecs.review}
                onToggle={() => handleToggleSection('review')}
              >
                <div className="ft-row ft-row-2">
                  <label className="ft-field">
                    <span className="ft-label">Review due date</span>
                    <input
                      className="ft-inp"
                      type="date"
                      value={selected.reviewDueDate || ''}
                      onChange={e => updateSelected({ reviewDueDate: e.target.value })}
                    />
                    <span className={`ft-due-label ft-due-${selectedDueInfo.tone}`}>
                      {selectedDueInfo.text}
                    </span>
                  </label>
                </div>
                <div className="ft-due-quick">
                  <span className="ft-label">Quick set</span>
                  <div className="ft-due-quick-row">
                    <button
                      type="button"
                      className="ft-btn ft-btn-ghost ft-btn-sm"
                      onClick={() => updateSelected({ reviewDueDate: addDaysIso(30) })}
                    >
                      30 days
                    </button>
                    <button
                      type="button"
                      className="ft-btn ft-btn-ghost ft-btn-sm"
                      onClick={() => updateSelected({ reviewDueDate: addDaysIso(90) })}
                    >
                      90 days
                    </button>
                    <button
                      type="button"
                      className="ft-btn ft-btn-ghost ft-btn-sm"
                      onClick={() => updateSelected({ reviewDueDate: addDaysIso(180) })}
                    >
                      180 days
                    </button>
                    <button
                      type="button"
                      className="ft-btn ft-btn-ghost ft-btn-sm"
                      onClick={() => updateSelected({ reviewDueDate: addDaysIso(365) })}
                    >
                      365 days
                    </button>
                    {selected.reviewDueDate && (
                      <button
                        type="button"
                        className="ft-btn ft-btn-ghost ft-btn-sm"
                        onClick={() => updateSelected({ reviewDueDate: '' })}
                      >
                        Clear due date
                      </button>
                    )}
                  </div>
                </div>
                <span className="ft-hint">
                  When the due date passes, the form will show on Calendar's past dates.
                </span>
              </SectionBlock>

              {/* Activity */}
              <SectionBlock
                block={SECTION_BLOCKS[5]}
                expanded={!!expandedSecs.activity}
                onToggle={() => handleToggleSection('activity')}
              >
                <div className="ft-row ft-row-2">
                  <label className="ft-field">
                    <span className="ft-label">Total submissions (estimate)</span>
                    <input
                      className="ft-inp"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={selected.totalSubmissions ?? 0}
                      onChange={e => {
                        const v = e.target.value;
                        const n = v === '' ? 0 : Math.max(0, Math.floor(Number(v) || 0));
                        updateSelected({ totalSubmissions: n });
                      }}
                    />
                  </label>
                </div>
                <label className="ft-field">
                  <span className="ft-label">Submission notes</span>
                  <textarea
                    className="ft-inp ft-textarea"
                    placeholder='e.g. "About 5/week", "Spike during Christmas season", "Mostly during sermon series promo"'
                    rows={3}
                    value={selected.submissionNotes}
                    onChange={e => updateSelected({ submissionNotes: e.target.value })}
                  />
                </label>
              </SectionBlock>

              {/* Tags & Notes */}
              <SectionBlock
                block={SECTION_BLOCKS[6]}
                expanded={!!expandedSecs.tagsnotes}
                onToggle={() => handleToggleSection('tagsnotes')}
              >
                <div className="ft-field">
                  <span className="ft-label">Tags</span>
                  <div className="ft-chip-input">
                    <div className="ft-chip-list">
                      {(selected.tags || []).map((tag, i) => (
                        <span key={i} className="ft-tag-chip">
                          {tag}
                          <button
                            type="button"
                            className="ft-tag-chip-x"
                            onClick={() => handleRemoveTag(tag)}
                            title="Remove tag"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        className="ft-chip-inp"
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
                </div>
                <label className="ft-field">
                  <span className="ft-label">Notes</span>
                  <textarea
                    className="ft-inp ft-textarea"
                    placeholder="Anything else worth remembering — known issues, integrations, history…"
                    rows={5}
                    value={selected.notes}
                    onChange={e => updateSelected({ notes: e.target.value })}
                  />
                </label>
              </SectionBlock>
            </div>
          </div>
        )}
      </main>
    </div>
    </WebsiteShell>
  );
}
