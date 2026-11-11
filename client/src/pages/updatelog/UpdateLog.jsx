import { useState, useEffect, useMemo, useRef } from 'react';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './UpdateLog.css';

/* ─────────────────────────────────────────────────────────────
   Update Log — chronological changelog of website changes
   Naming:      .ul-*
   Persistence: localStorage key 'web:update-log'
   Optional:    reads 'band:roster' for contributor autocomplete
   Accent:      var(--accent-blue, #60a5fa)
   ───────────────────────────────────────────────────────────── */

const LS_KEY     = 'web:update-log';
const ROSTER_KEY = 'band:roster';

/* ─── Section / category meta ──────────────────────────────────── */
const SECTIONS = [
  { value: 'homepage',   label: 'Homepage',   icon: '🏠' },
  { value: 'about',      label: 'About',      icon: 'ℹ' },
  { value: 'ministries', label: 'Ministries', icon: '⛪' },
  { value: 'events',     label: 'Events',     icon: '🎉' },
  { value: 'sermons',    label: 'Sermons',    icon: '📖' },
  { value: 'blog',       label: 'Blog',       icon: '📰' },
  { value: 'contact',    label: 'Contact',    icon: '📧' },
  { value: 'media',      label: 'Media',      icon: '📹' },
  { value: 'navigation', label: 'Navigation', icon: '🧭' },
  { value: 'other',      label: 'Other',      icon: '📄' },
];

const CATEGORIES = [
  { value: 'content',  label: 'Content',  color: '#60a5fa' },
  { value: 'design',   label: 'Design',   color: '#a78bfa' },
  { value: 'tech',     label: 'Tech',     color: '#2dd4bf' },
  { value: 'seo',      label: 'SEO',      color: '#34d399' },
  { value: 'bugfix',   label: 'Bug Fix',  color: '#ef4444' },
  { value: 'security', label: 'Security', color: '#fbbf24' },
  { value: 'other',    label: 'Other',    color: '#9ca3af' },
];

function sectionMeta(v)  { return SECTIONS.find(s => s.value === v)   || SECTIONS[SECTIONS.length - 1]; }
function categoryMeta(v) { return CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1]; }

/* ─── Date helpers ─────────────────────────────────────────────── */
function toISO(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayISO() {
  return toISO(new Date());
}
function ninetyDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return toISO(d);
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}
function monthKey(iso) {
  if (!iso) return '';
  return iso.slice(0, 7); // YYYY-MM
}
function formatMonth(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadEntries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveEntries(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}
function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map(r => typeof r === 'string' ? r : (r && r.name) ? r.name : null)
      .filter(Boolean);
  } catch { return []; }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── CSV helpers ──────────────────────────────────────────────── */
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  const header = ['Date', 'Title', 'Contributor', 'Section', 'Category', 'Page URL', 'Description', 'Tags', 'Notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.date,
      r.title,
      r.contributor || '',
      sectionMeta(r.section).label,
      categoryMeta(r.category).label,
      r.pageUrl || '',
      r.description || '',
      (Array.isArray(r.tags) ? r.tags : []).join('; '),
      r.notes || '',
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/* ─── URL helpers ──────────────────────────────────────────────── */
function isValidUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return !!u.hostname;
  } catch { return false; }
}
function normalizeUrl(s) {
  if (!s) return '';
  return s.startsWith('http') ? s : `https://${s}`;
}

/* ─── Contributor autocomplete ─────────────────────────────────── */
function ContributorAutocomplete({ value, onChange, suggestions, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = (value || '').toLowerCase().trim();
  const matches = q
    ? suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8)
    : suggestions.slice(0, 8);

  return (
    <div className="ul-ac" ref={wrap}>
      <input
        className="ul-inp"
        type="text"
        placeholder="Who made the change?"
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="ul-ac-list">
          {matches.map(s => (
            <button
              key={s}
              type="button"
              className="ul-ac-item"
              onClick={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Tag chip-input ───────────────────────────────────────────── */
function TagInput({ tags, onChange }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const t = draft.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  }
  function remove(t) {
    onChange(tags.filter(x => x !== t));
  }

  return (
    <div className="ul-tag-input">
      <div className="ul-tag-chips">
        {tags.map(t => (
          <span key={t} className="ul-tag-chip">
            {t}
            <button type="button" className="ul-tag-remove" onClick={() => remove(t)} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          className="ul-tag-input-field"
          type="text"
          placeholder={tags.length === 0 ? 'Add tags (press Enter)…' : 'Add tag…'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
              e.preventDefault();
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}

/* ─── Entry modal ──────────────────────────────────────────────── */
function EntryModal({ initial, contributorSuggestions, onSave, onCancel }) {
  const [date,        setDate]        = useState(initial?.date        || todayISO());
  const [title,       setTitle]       = useState(initial?.title       || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [contributor, setContributor] = useState(initial?.contributor || '');
  const [section,     setSection]     = useState(initial?.section     || 'homepage');
  const [category,    setCategory]    = useState(initial?.category    || 'content');
  const [pageUrl,     setPageUrl]     = useState(initial?.pageUrl     || '');
  const [tags,        setTags]        = useState(Array.isArray(initial?.tags) ? initial.tags : []);
  const [notes,       setNotes]       = useState(initial?.notes       || '');
  const [error,       setError]       = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim())       { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!date)               { setError('Date is required.'); return; }
    onSave({
      date,
      title:       title.trim(),
      description: description.trim(),
      contributor: contributor.trim(),
      section,
      category,
      pageUrl:     pageUrl.trim(),
      tags,
      notes:       notes.trim(),
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div className="ul-modal-overlay" onClick={onCancel}>
      <form className="ul-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="ul-modal-head">
          <span>{isEdit ? 'Edit Entry' : 'New Update Log Entry'}</span>
          <button type="button" className="ul-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="ul-modal-body">
          {error && <div className="ul-error">{error}</div>}

          <div className="ul-form-row">
            <div className="ul-field">
              <label className="ul-lbl">Date</label>
              <input
                className="ul-inp"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="ul-field">
              <label className="ul-lbl">Contributor</label>
              <ContributorAutocomplete
                value={contributor}
                suggestions={contributorSuggestions}
                onChange={setContributor}
              />
            </div>
          </div>

          <div className="ul-field">
            <label className="ul-lbl">Title</label>
            <input
              className="ul-inp"
              type="text"
              placeholder="e.g. Updated 'About Us' page"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ul-field">
            <label className="ul-lbl">Description</label>
            <textarea
              className="ul-inp ul-textarea"
              rows={4}
              placeholder="What was changed?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="ul-form-row">
            <div className="ul-field">
              <label className="ul-lbl">Section</label>
              <select
                className="ul-inp"
                value={section}
                onChange={e => setSection(e.target.value)}
              >
                {SECTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
            <div className="ul-field">
              <label className="ul-lbl">Category</label>
              <select
                className="ul-inp"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ul-field">
            <label className="ul-lbl">Page URL (optional)</label>
            <input
              className="ul-inp"
              type="text"
              placeholder="e.g. https://church.org/about"
              value={pageUrl}
              onChange={e => setPageUrl(e.target.value)}
            />
          </div>

          <div className="ul-field">
            <label className="ul-lbl">Tags</label>
            <TagInput tags={tags} onChange={setTags} />
            <div className="ul-hint">Press Enter or comma to add a tag.</div>
          </div>

          <div className="ul-field">
            <label className="ul-lbl">Notes (optional)</label>
            <textarea
              className="ul-inp ul-textarea"
              rows={3}
              placeholder="Why was this change made?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <footer className="ul-modal-ft">
          <button type="button" className="ul-btn ul-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ul-btn ul-btn-accent">
            {isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Description (truncate + show more) ───────────────────────── */
function Description({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const isLong = text.length > 240 || (text.match(/\n/g) || []).length >= 3;
  return (
    <div className={`ul-desc ${open ? 'ul-desc-open' : ''}`}>
      <div className="ul-desc-text">{text}</div>
      {isLong && (
        <button
          type="button"
          className="ul-show-more"
          onClick={() => setOpen(o => !o)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */
export default function UpdateLog() {
  const [entries,    setEntries]   = useUserStoreKey('web:update-log', []);
  const [roster]                   = useUserStoreKey('band:roster',    []);

  /* Filters */
  const initialRange = useMemo(() => ({
    from: ninetyDaysAgoISO(),
    to:   todayISO(),
  }), []);
  const [fromDate, setFromDate]           = useState(initialRange.from);
  const [toDate,   setToDate]             = useState(initialRange.to);
  const [sectionFilter, setSectionFilter] = useState(''); // '' = all
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = all
  const [contributorFilter, setContributorFilter] = useState(''); // '' = all
  const [search, setSearch]               = useState('');

  /* Modal / arming state */
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [armedDel, setArmedDel] = useState(null);

  /* (No persist/listener — useUserStoreKey autosaves and roster is live-synced.) */

  /* ── Contributor list (auto-populated) ──────────────────── */
  const contributorList = useMemo(() => {
    const set = new Set();
    for (const e of entries)  if (e.contributor) set.add(e.contributor.trim());
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const contributorSuggestions = useMemo(() => {
    const set = new Set([...contributorList, ...roster]);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [contributorList, roster]);

  /* ── Filtered + sorted entries ──────────────────────────── */
  const filtered = useMemo(() => {
    const f = fromDate || '0000-00-00';
    const t = toDate   || '9999-12-31';
    const q = search.trim().toLowerCase();
    return entries
      .filter(e => {
        if (!e.date) return false;
        if (e.date < f) return false;
        if (e.date > t) return false;
        if (sectionFilter     && e.section     !== sectionFilter)     return false;
        if (categoryFilter    && e.category    !== categoryFilter)    return false;
        if (contributorFilter && (e.contributor || '') !== contributorFilter) return false;
        if (q) {
          const hay = [
            e.title,
            e.description,
            e.notes,
            ...(Array.isArray(e.tags) ? e.tags : []),
          ].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [entries, fromDate, toDate, sectionFilter, categoryFilter, contributorFilter, search]);

  /* ── Stats ──────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = filtered.length;
    const now = new Date();
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let thisMonth = 0;
    const contributorCounts = new Map();
    for (const e of filtered) {
      if (monthKey(e.date) === ym) thisMonth++;
      const c = (e.contributor || '').trim();
      if (c) contributorCounts.set(c, (contributorCounts.get(c) || 0) + 1);
    }
    let topName  = '—';
    let topCount = 0;
    for (const [name, count] of contributorCounts) {
      if (count > topCount) { topCount = count; topName = name; }
    }
    return {
      total,
      thisMonth,
      uniqueContributors: contributorCounts.size,
      topContributor:     topName,
      topContributorCount: topCount,
    };
  }, [filtered]);

  /* ── Group filtered entries by month ────────────────────── */
  const grouped = useMemo(() => {
    const out = [];
    let currentKey = null;
    let bucket = null;
    for (const e of filtered) {
      const k = monthKey(e.date);
      if (k !== currentKey) {
        currentKey = k;
        bucket = { key: k, label: formatMonth(k), entries: [] };
        out.push(bucket);
      }
      bucket.entries.push(e);
    }
    return out;
  }, [filtered]);

  /* ── Handlers ───────────────────────────────────────────── */
  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(entry) {
    setEditing(entry);
    setShowForm(true);
  }
  function handleSave(data) {
    if (editing && editing.id) {
      setEntries(prev => prev.map(m =>
        m.id === editing.id ? { ...m, ...data } : m
      ));
    } else {
      setEntries(prev => [
        { id: uid(), createdAt: Date.now(), ...data },
        ...prev,
      ]);
    }
    setShowForm(false);
    setEditing(null);
  }
  function handleDelete(id) {
    if (armedDel !== id) { setArmedDel(id); return; }
    setEntries(prev => prev.filter(m => m.id !== id));
    setArmedDel(null);
  }
  function handleExport() {
    const from = fromDate || 'all';
    const to   = toDate   || 'all';
    const filename = `update-log-${from}-to-${to}.csv`;
    const csv = buildCsv(filtered);
    downloadCsv(filename, csv);
  }
  function clearFilters() {
    setFromDate(ninetyDaysAgoISO());
    setToDate(todayISO());
    setSectionFilter('');
    setCategoryFilter('');
    setContributorFilter('');
    setSearch('');
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <WebsiteShell
      title="Update Log"
      icon="📝"
      subtitle="Chronological changelog of every change made to the site — section, category, and who made it."
      fullBleed
    >
    <div className="ul-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="ul-main">
        {/* ── Top bar ── */}
        <div className="ul-topbar">
          <div className="ul-topbar-left">
            <h1 className="ul-page-title">Update Log</h1>
            <p className="ul-page-sub">
              Chronological record of every website change — who did what, when,
              and why. A paper trail for the team and a roadmap for new contributors.
            </p>
          </div>
          <div className="ul-topbar-right">
            <button
              className="ul-btn ul-btn-ghost ul-btn-lg"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              <span aria-hidden="true">📥</span> Export CSV
            </button>
            <button className="ul-btn ul-btn-accent ul-btn-lg" onClick={openNew}>
              + New Entry
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="ul-filterbar">
          <div className="ul-filter-row">
            <div className="ul-filter-field">
              <label className="ul-lbl">From</label>
              <input
                className="ul-inp"
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div className="ul-filter-field">
              <label className="ul-lbl">To</label>
              <input
                className="ul-inp"
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
            <div className="ul-filter-field">
              <label className="ul-lbl">Section</label>
              <select
                className="ul-inp"
                value={sectionFilter}
                onChange={e => setSectionFilter(e.target.value)}
              >
                <option value="">All sections</option>
                {SECTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
            <div className="ul-filter-field">
              <label className="ul-lbl">Category</label>
              <select
                className="ul-inp"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="ul-filter-field">
              <label className="ul-lbl">Contributor</label>
              <select
                className="ul-inp"
                value={contributorFilter}
                onChange={e => setContributorFilter(e.target.value)}
              >
                <option value="">All contributors</option>
                {contributorList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="ul-filter-field ul-filter-field-wide">
              <label className="ul-lbl">Search</label>
              <input
                className="ul-inp"
                type="text"
                placeholder="Search title, description, tags, notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {(sectionFilter || categoryFilter || contributorFilter || search) && (
              <button
                type="button"
                className="ul-btn ul-btn-ghost ul-btn-sm ul-clear-btn"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="ul-stats">
          <div className="ul-stat">
            <div className="ul-stat-num">{stats.total}</div>
            <div className="ul-stat-lbl">Total entries</div>
          </div>
          <div className="ul-stat">
            <div className="ul-stat-num">{stats.thisMonth}</div>
            <div className="ul-stat-lbl">This month</div>
          </div>
          <div className="ul-stat">
            <div className="ul-stat-num">{stats.uniqueContributors}</div>
            <div className="ul-stat-lbl">Unique contributors</div>
          </div>
          <div className="ul-stat">
            <div className="ul-stat-num ul-stat-num-sm" title={stats.topContributor}>
              {stats.topContributor}
              {stats.topContributorCount > 0 && (
                <span className="ul-stat-suffix"> · {stats.topContributorCount}</span>
              )}
            </div>
            <div className="ul-stat-lbl">Most active</div>
          </div>
        </div>

        {/* ── Entry list ── */}
        <div className="ul-list-wrap">
          {filtered.length === 0 ? (
            <div className="ul-empty">
              <div className="ul-empty-icon" aria-hidden="true">📝</div>
              <div className="ul-empty-title">No update log entries in this range</div>
              <div className="ul-empty-sub">
                {entries.length === 0
                  ? 'Start a paper trail by logging your first website change. New contributors will thank you.'
                  : 'Try widening the date range or clearing filters.'}
              </div>
              <div className="ul-empty-actions">
                <button className="ul-btn ul-btn-accent" onClick={openNew}>+ New Entry</button>
                {entries.length > 0 && (
                  <button className="ul-btn ul-btn-ghost" onClick={clearFilters}>
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="ul-list">
              {grouped.map(group => (
                <div key={group.key} className="ul-month-group">
                  <div className="ul-month-head">
                    <span className="ul-month-lbl">{group.label}</span>
                    <span className="ul-month-count">{group.entries.length}</span>
                    <span className="ul-month-line" aria-hidden="true" />
                  </div>
                  <div className="ul-month-entries">
                    {group.entries.map(e => {
                      const sm = sectionMeta(e.section);
                      const cm = categoryMeta(e.category);
                      const urlValid = isValidUrl(e.pageUrl);
                      return (
                        <div key={e.id} className="ul-card">
                          <div className="ul-card-date">
                            <div className="ul-date-pill">{formatDate(e.date)}</div>
                          </div>
                          <div className="ul-card-body">
                            <div className="ul-card-head">
                              <h3 className="ul-card-title">{e.title}</h3>
                              <div className="ul-card-actions">
                                <button
                                  className="ul-btn ul-btn-ghost ul-btn-sm"
                                  onClick={() => openEdit(e)}
                                >
                                  Edit
                                </button>
                                <button
                                  className={`ul-btn ul-btn-sm ${armedDel === e.id ? 'ul-btn-danger-armed' : 'ul-btn-danger'}`}
                                  onClick={() => handleDelete(e.id)}
                                  onBlur={() => setArmedDel(null)}
                                  title={armedDel === e.id ? 'Click again to confirm' : 'Delete entry'}
                                >
                                  {armedDel === e.id ? 'Confirm' : 'Delete'}
                                </button>
                              </div>
                            </div>

                            <div className="ul-card-chips">
                              <span className="ul-chip ul-chip-section">
                                <span aria-hidden="true">{sm.icon}</span> {sm.label}
                              </span>
                              <span
                                className="ul-chip ul-chip-cat"
                                style={{
                                  background: `${cm.color}22`,
                                  borderColor: `${cm.color}66`,
                                  color: cm.color,
                                }}
                              >
                                {cm.label}
                              </span>
                              {e.contributor && (
                                <span className="ul-by">
                                  by <span className="ul-by-name">{e.contributor}</span>
                                </span>
                              )}
                            </div>

                            <Description text={e.description} />

                            {(urlValid || (Array.isArray(e.tags) && e.tags.length > 0)) && (
                              <div className="ul-card-foot">
                                {urlValid && (
                                  <a
                                    className="ul-url-chip"
                                    href={normalizeUrl(e.pageUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={e.pageUrl}
                                  >
                                    <span aria-hidden="true">🔗</span> {e.pageUrl}
                                  </a>
                                )}
                                {Array.isArray(e.tags) && e.tags.map(t => (
                                  <span key={t} className="ul-tag-pill">#{t}</span>
                                ))}
                              </div>
                            )}

                            {e.notes && (
                              <div className="ul-notes">
                                <span className="ul-notes-lbl">Note:</span> {e.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Modal ── */}
      {showForm && (
        <EntryModal
          initial={editing}
          contributorSuggestions={contributorSuggestions}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
    </WebsiteShell>
  );
}
