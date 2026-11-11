import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogNewsletters.css';

/* ─────────────────────────────────────────────────────────────
   Newsletter Issues — church email newsletter drafts + send log
   Naming: .bn-*
   Persistence: localStorage key "blog:newsletters"
   Reads: "blog:posts" for featured-posts picker (with storage listener)
   Accent: var(--accent-blue, #60a5fa)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'blog:newsletters';
const POSTS_KEY   = 'blog:posts';

const STATUSES = [
  { key: 'draft',     label: 'Draft',     color: 'rgba(255, 255, 255, 0.35)' },
  { key: 'scheduled', label: 'Scheduled', color: '#60a5fa' },
  { key: 'sent',      label: 'Sent',      color: '#34d399' },
  { key: 'archived',  label: 'Archived',  color: 'rgba(255, 255, 255, 0.22)' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const FILTER_PILLS = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sent',      label: 'Sent' },
  { key: 'archived',  label: 'Archived' },
];

const SORT_OPTIONS = [
  { key: 'recent',   label: 'Recently updated' },
  { key: 'sendDate', label: 'Send date' },
  { key: 'subject',  label: 'Subject A–Z' },
];

const PREHEADER_TARGET = 100;

/* ─── Utility ──────────────────────────────────────────────── */
function makeId() {
  return 'bn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIssues(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptyIssue(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    subject: '',
    preheader: '',
    body: '',
    status: 'draft',
    sendDate: '',
    recipientCount: '',
    openCount: '',
    clickCount: '',
    unsubscribeCount: '',
    featuredPostIds: [],
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...overrides,
  };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pct(num, denom) {
  if (!denom) return null;
  return (num / denom) * 100;
}

function formatPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toFixed(1) + '%';
}

/* ─── Sidebar row ──────────────────────────────────────────── */
function IssueRow({ issue, active, onClick }) {
  const statusInfo = STATUS_BY_KEY[issue.status] || STATUS_BY_KEY.draft;
  const recipients = toNum(issue.recipientCount);
  return (
    <button
      className={`bn-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="bn-card-top">
        <span
          className={`bn-card-status s-${issue.status}`}
          title={statusInfo.label}
        >
          <span
            className="bn-status-dot"
            style={{ background: statusInfo.color }}
          />
          {statusInfo.label}
        </span>
        <span className="bn-card-name">{issue.subject || 'Untitled issue'}</span>
      </div>
      <div className="bn-card-meta">
        {issue.sendDate && (
          <span className="bn-card-meta-item" title="Send date">
            📅 {formatDateLong(issue.sendDate)}
          </span>
        )}
        {recipients > 0 && (
          <span className="bn-card-chip" title={`Recipients: ${recipients}`}>
            👥 {recipients.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function BlogNewsletters() {
  const navigate = useNavigate();

  const [issues, setIssues]             = useUserStoreKey('blog:newsletters', []);
  const [posts]                         = useUserStoreKey('blog:posts',       []);
  const [selectedId, setSelectedId]     = useState(null);
  const [query, setQuery]               = useState('');
  const [filter, setFilter]             = useState('all');
  const [sortBy, setSortBy]             = useState('recent');
  const [armedDelete, setArmedDelete]   = useState(false);
  const [tagDraft, setTagDraft]         = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postPickerQuery, setPostPickerQuery] = useState('');

  /* "+ New Issue" inline form */
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject]   = useState('');
  const [newStatus, setNewStatus]     = useState('draft');

  const armTimerRef    = useRef(null);
  const newSubjectRef  = useRef(null);
  const statusMenuRef  = useRef(null);
  const postPickerRef  = useRef(null);

  /* No persist/listener useEffects needed — useUserStoreKey handles both
     the autosave on `setIssues(...)` and the live-sync of `posts` via
     onSnapshot, so cross-tab AND cross-page edits stream in automatically. */

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
    setShowPostPicker(false);
    setPostPickerQuery('');
  }, [selectedId]);

  /* Focus new-issue subject input when form opens */
  useEffect(() => {
    if (showNewForm && newSubjectRef.current) {
      newSubjectRef.current.focus();
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

  /* Close post picker on outside click */
  useEffect(() => {
    if (!showPostPicker) return;
    const onDocClick = (e) => {
      if (postPickerRef.current && !postPickerRef.current.contains(e.target)) {
        setShowPostPicker(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showPostPicker]);

  /* ─── Status counts ──────────────────────────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { all: issues.length, draft: 0, scheduled: 0, sent: 0, archived: 0 };
    for (const it of issues) {
      if (counts[it.status] !== undefined) counts[it.status]++;
    }
    return counts;
  }, [issues]);

  /* ─── Stats card values ──────────────────────────────────── */
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let sentThisYear = 0;
    let openRateSum = 0;
    let openRateCount = 0;

    for (const it of issues) {
      if (it.status === 'sent') {
        if (it.sendDate) {
          const y = parseInt(it.sendDate.slice(0, 4), 10);
          if (y === currentYear) sentThisYear++;
        }
        const recipients = toNum(it.recipientCount);
        const opens = toNum(it.openCount);
        if (opens > 0 && recipients > 0) {
          openRateSum += (opens / recipients) * 100;
          openRateCount++;
        }
      }
    }

    const avgOpenRate = openRateCount > 0 ? openRateSum / openRateCount : null;
    return {
      total: issues.length,
      sentThisYear,
      avgOpenRate,
      drafts: statusCounts.draft,
    };
  }, [issues, statusCounts.draft]);

  /* ─── Posts index for chip rendering ─────────────────────── */
  const postsById = useMemo(() => {
    const m = {};
    for (const p of posts) {
      if (p && p.id) m[p.id] = p;
    }
    return m;
  }, [posts]);

  /* ─── Filtered + sorted ──────────────────────────────────── */
  const filteredIssues = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = issues.filter(it => {
      if (filter !== 'all' && it.status !== filter) return false;
      if (!q) return true;
      const hay = [
        it.subject, it.body, it.preheader,
        ...(Array.isArray(it.tags) ? it.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    list = list.slice().sort((a, b) => {
      if (sortBy === 'subject') {
        return (a.subject || '').localeCompare(b.subject || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'sendDate') {
        const ad = a.sendDate || '';
        const bd = b.sendDate || '';
        if (ad && bd) return bd.localeCompare(ad);
        if (ad) return -1;
        if (bd) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      // 'recent' default
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return list;
  }, [issues, query, filter, sortBy]);

  const selected = useMemo(
    () => issues.find(it => it.id === selectedId) || null,
    [issues, selectedId]
  );

  /* ─── Mutators ───────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setIssues(prev => prev.map(it => (
      it.id === selectedId ? { ...it, ...patch, updatedAt: Date.now() } : it
    )));
  }, [selectedId]);

  const handleStartNew = useCallback(() => {
    setShowNewForm(true);
    setNewSubject('');
    setNewStatus('draft');
  }, []);

  const handleCancelNew = useCallback(() => {
    setShowNewForm(false);
    setNewSubject('');
  }, []);

  const handleSaveNew = useCallback(() => {
    const subject = newSubject.trim();
    if (!subject) return;
    const issue = emptyIssue({ subject, status: newStatus });
    setIssues(prev => [issue, ...prev]);
    setSelectedId(issue.id);
    setShowNewForm(false);
    setNewSubject('');
  }, [newSubject, newStatus]);

  const handleEmptyStateNew = useCallback(() => {
    const issue = emptyIssue();
    setIssues(prev => [issue, ...prev]);
    setSelectedId(issue.id);
  }, []);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    const patch = { status: nextStatus };
    if (nextStatus === 'sent' && !selected.sentAt) {
      patch.sentAt = Date.now();
      if (!selected.sendDate) patch.sendDate = todayIso();
    }
    updateSelected(patch);
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setIssues(prev => prev.filter(it => it.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const now = Date.now();
    const baseSubject = (selected.subject || 'Newsletter') + ' (copy)';
    const clone = {
      ...selected,
      id: makeId(),
      subject: baseSubject,
      status: 'draft',
      sendDate: '',
      sentAt: null,
      recipientCount: '',
      openCount: '',
      clickCount: '',
      unsubscribeCount: '',
      createdAt: now,
      updatedAt: now,
    };
    setIssues(prev => [clone, ...prev]);
    setSelectedId(clone.id);
  }, [selected]);

  const handleMarkSent = useCallback(() => {
    if (!selected) return;
    const patch = { status: 'sent' };
    if (!selected.sentAt) patch.sentAt = Date.now();
    if (!selected.sendDate) patch.sendDate = todayIso();
    updateSelected(patch);
  }, [selected, updateSelected]);

  const handleSchedule = useCallback(() => {
    if (!selected) return;
    const suggested = selected.sendDate || todayIso();
    // eslint-disable-next-line no-alert
    const input = window.prompt('Schedule send for date (YYYY-MM-DD):', suggested);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      // eslint-disable-next-line no-alert
      window.alert('Please use YYYY-MM-DD format.');
      return;
    }
    updateSelected({ status: 'scheduled', sendDate: trimmed });
  }, [selected, updateSelected]);

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

  const handleAddFeaturedPost = useCallback((postId) => {
    if (!selected || !postId) return;
    const current = selected.featuredPostIds || [];
    if (current.includes(postId)) return;
    updateSelected({ featuredPostIds: [...current, postId] });
    setShowPostPicker(false);
    setPostPickerQuery('');
  }, [selected, updateSelected]);

  const handleRemoveFeaturedPost = useCallback((postId) => {
    if (!selected) return;
    updateSelected({
      featuredPostIds: (selected.featuredPostIds || []).filter(id => id !== postId),
    });
  }, [selected, updateSelected]);

  /* ─── Performance metrics ────────────────────────────────── */
  const metrics = useMemo(() => {
    if (!selected) return null;
    const r = toNum(selected.recipientCount);
    const o = toNum(selected.openCount);
    const c = toNum(selected.clickCount);
    return {
      openRate:        pct(o, r),
      clickRate:       pct(c, o),
      ctrVsRecipients: pct(c, r),
    };
  }, [selected]);

  /* ─── Post picker filtered list ──────────────────────────── */
  const pickerPosts = useMemo(() => {
    const q = postPickerQuery.trim().toLowerCase();
    const selectedIds = new Set(selected?.featuredPostIds || []);
    return posts
      .filter(p => !selectedIds.has(p.id))
      .filter(p => {
        if (!q) return true;
        const hay = (p.title || '').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [posts, postPickerQuery, selected]);

  /* ─── Render helpers ─────────────────────────────────────── */
  const currentStatusInfo = selected
    ? (STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.draft)
    : null;

  const preheaderLen = (selected?.preheader || '').length;
  const preheaderClass =
    preheaderLen === 0                ? 'bn-counter'
    : preheaderLen <= PREHEADER_TARGET ? 'bn-counter bn-counter-good'
    : preheaderLen <= 130              ? 'bn-counter bn-counter-warn'
    :                                     'bn-counter bn-counter-bad';

  return (
    <BlogShell title="Newsletter Issues" icon="📧" subtitle="Newsletter issues built from blog content — status and send dates." fullBleed>
    <div className="bn-root">
      {/* ── Sidebar ── */}
      <aside className="bn-sidebar">
        <div className="bn-sidebar-head">
          <span className="bn-sidebar-title">Newsletters</span>
          <button
            className="bn-new-btn"
            onClick={handleStartNew}
            title="Draft a new newsletter issue"
          >
            + New Issue
          </button>
        </div>

        {/* Stats card row */}
        <div className="bn-stats">
          <div className="bn-stat">
            <span className="bn-stat-num">{stats.total}</span>
            <span className="bn-stat-lbl">Total</span>
          </div>
          <div className="bn-stat">
            <span className="bn-stat-num">{stats.sentThisYear}</span>
            <span className="bn-stat-lbl">Sent this yr</span>
          </div>
          <div className="bn-stat">
            <span className="bn-stat-num">
              {stats.avgOpenRate === null ? '—' : stats.avgOpenRate.toFixed(1) + '%'}
            </span>
            <span className="bn-stat-lbl">Avg open</span>
          </div>
          <div className="bn-stat">
            <span className="bn-stat-num">{stats.drafts}</span>
            <span className="bn-stat-lbl">Drafts</span>
          </div>
        </div>

        {showNewForm && (
          <div className="bn-new-form">
            <input
              ref={newSubjectRef}
              className="bn-inp"
              placeholder="Subject line (required)…"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); handleSaveNew(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancelNew(); }
              }}
            />
            <select
              className="bn-inp"
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <div className="bn-new-form-actions">
              <button className="bn-btn bn-btn-ghost" onClick={handleCancelNew}>
                Cancel
              </button>
              <button
                className="bn-btn bn-btn-accent"
                onClick={handleSaveNew}
                disabled={!newSubject.trim()}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="bn-sidebar-controls">
          <input
            className="bn-inp"
            placeholder="Search subject, body, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="bn-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`bn-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="bn-pill-label">{p.label}</span>
                <span className="bn-pill-count">{statusCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <select
            className="bn-inp"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            title="Sort issues"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>Sort: {o.label}</option>
            ))}
          </select>
        </div>

        <div className="bn-list">
          {filteredIssues.length === 0 && (
            <p className="bn-muted bn-list-empty">
              {issues.length === 0 ? 'No issues drafted yet.' : 'No matches.'}
            </p>
          )}
          {filteredIssues.map(it => (
            <IssueRow
              key={it.id}
              issue={it}
              active={selectedId === it.id}
              onClick={() => setSelectedId(it.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="bn-main">
        {!selected && issues.length === 0 && (
          <div className="bn-empty">
            <div className="bn-empty-icon" aria-hidden="true">📧</div>
            <div className="bn-empty-title">No issues drafted yet</div>
            <div className="bn-empty-sub">
              Build your newsletter send log — draft subject lines, schedule sends,
              track open rates, and remember which posts you featured in each issue.
            </div>
            <button className="bn-btn bn-btn-accent bn-empty-cta" onClick={handleEmptyStateNew}>
              + Draft your first issue
            </button>
          </div>
        )}

        {!selected && issues.length > 0 && (
          <div className="bn-empty">
            <div className="bn-empty-icon" aria-hidden="true">📧</div>
            <div className="bn-empty-title">No issue selected</div>
            <div className="bn-empty-sub">
              Pick a newsletter from the sidebar to edit, or draft a new one.
            </div>
          </div>
        )}

        {selected && (
          <div className="bn-detail">
            {/* Detail header */}
            <div className="bn-detail-head">
              <div className="bn-detail-head-info">
                <input
                  className="bn-title-inp"
                  placeholder="Email subject line…"
                  value={selected.subject}
                  onChange={e => updateSelected({ subject: e.target.value })}
                />

                <div className="bn-detail-meta">
                  <div className="bn-status-wrap" ref={statusMenuRef}>
                    <button
                      className={`bn-status-badge s-${selected.status}`}
                      onClick={() => setShowStatusMenu(v => !v)}
                      title="Click to change status"
                    >
                      <span
                        className="bn-status-dot"
                        style={{ background: currentStatusInfo.color }}
                      />
                      {currentStatusInfo.label}
                      <span className="bn-status-caret" aria-hidden="true">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="bn-status-menu">
                        {STATUSES.map(s => (
                          <button
                            key={s.key}
                            className={`bn-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                            onClick={() => handleQuickStatus(s.key)}
                          >
                            <span
                              className="bn-status-dot"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="bn-date-pill" title="Send date">
                    <span className="bn-date-pill-label">📅 Send date</span>
                    <input
                      className="bn-date-pill-inp"
                      type="date"
                      value={selected.sendDate || ''}
                      onChange={e => updateSelected({ sendDate: e.target.value })}
                    />
                  </label>

                  {selected.status === 'sent' && selected.sentAt && (
                    <span className="bn-meta-pill" title="Marked sent">
                      ✓ Sent {new Date(selected.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              <div className="bn-detail-actions">
                <button
                  className="bn-btn bn-btn-ghost"
                  onClick={handleDuplicate}
                  title="Duplicate as a new draft"
                >
                  Duplicate
                </button>
                <button
                  className={`bn-btn${armedDelete ? ' bn-btn-danger-armed' : ' bn-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete issue'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="bn-form">
              {/* Content */}
              <details className="bn-section" open>
                <summary className="bn-section-summary">
                  <span className="bn-section-title">✍ Content</span>
                  <span className="bn-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="bn-section-body">
                  <label className="bn-field">
                    <div className="bn-label-row">
                      <span className="bn-label">Preheader (preview text)</span>
                      <span className={preheaderClass}>
                        {preheaderLen} / {PREHEADER_TARGET} chars
                        {preheaderLen > PREHEADER_TARGET ? ' — long' : ''}
                      </span>
                    </div>
                    <input
                      className="bn-inp"
                      placeholder="Short teaser shown after the subject in most email clients…"
                      value={selected.preheader}
                      onChange={e => updateSelected({ preheader: e.target.value })}
                    />
                    <span className="bn-hint">
                      Keep under {PREHEADER_TARGET} characters so it fits the inbox preview.
                    </span>
                  </label>

                  <label className="bn-field">
                    <span className="bn-label">Body (Markdown)</span>
                    <textarea
                      className="bn-inp bn-textarea bn-body-textarea"
                      placeholder={
                        '# This week at our church\n\nWrite your newsletter copy here. Markdown is supported.\n\n- Highlight an upcoming event\n- Tease a featured blog post\n- Share a quick prayer request'
                      }
                      rows={18}
                      value={selected.body}
                      onChange={e => updateSelected({ body: e.target.value })}
                    />
                  </label>
                </div>
              </details>

              {/* Featured Posts */}
              <details className="bn-section" open>
                <summary className="bn-section-summary">
                  <span className="bn-section-title">📰 Featured Posts</span>
                  <span className="bn-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="bn-section-body">
                  <div className="bn-field">
                    <div className="bn-featured-list">
                      {(selected.featuredPostIds || []).length === 0 && (
                        <span className="bn-hint">
                          No featured posts yet. Add posts from your library to reference in this issue.
                        </span>
                      )}
                      {(selected.featuredPostIds || []).map(id => {
                        const post = postsById[id];
                        const title = post ? (post.title || 'Untitled post') : '(post not found)';
                        const missing = !post;
                        return (
                          <span
                            key={id}
                            className={`bn-featured-chip${missing ? ' bn-featured-chip-missing' : ''}`}
                          >
                            <button
                              type="button"
                              className="bn-featured-chip-title"
                              onClick={() => navigate('/blog-posts?id=' + encodeURIComponent(id))}
                              title={missing ? 'Post no longer exists in library' : 'Open in Posts Library'}
                              disabled={missing}
                            >
                              📰 {title}
                            </button>
                            <button
                              type="button"
                              className="bn-featured-chip-x"
                              onClick={() => handleRemoveFeaturedPost(id)}
                              title="Remove from this issue"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    <div className="bn-picker-wrap" ref={postPickerRef}>
                      <button
                        type="button"
                        className="bn-btn bn-btn-ghost"
                        onClick={() => setShowPostPicker(v => !v)}
                      >
                        + Add Featured Post
                      </button>
                      {showPostPicker && (
                        <div className="bn-picker-menu">
                          <input
                            className="bn-inp"
                            placeholder="Search posts…"
                            value={postPickerQuery}
                            onChange={e => setPostPickerQuery(e.target.value)}
                            autoFocus
                          />
                          <div className="bn-picker-list">
                            {posts.length === 0 && (
                              <p className="bn-muted bn-picker-empty">
                                No posts in library. Create one in Posts first.
                              </p>
                            )}
                            {posts.length > 0 && pickerPosts.length === 0 && (
                              <p className="bn-muted bn-picker-empty">
                                {postPickerQuery
                                  ? 'No matches.'
                                  : 'All posts already added.'}
                              </p>
                            )}
                            {pickerPosts.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                className="bn-picker-item"
                                onClick={() => handleAddFeaturedPost(p.id)}
                              >
                                <span className="bn-picker-item-title">
                                  {p.title || 'Untitled post'}
                                </span>
                                {p.status && (
                                  <span className="bn-picker-item-status">
                                    {p.status}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </details>

              {/* Performance — only when sent */}
              {selected.status === 'sent' && (
                <details className="bn-section" open>
                  <summary className="bn-section-summary">
                    <span className="bn-section-title">📊 Performance</span>
                    <span className="bn-section-caret" aria-hidden="true">▾</span>
                  </summary>
                  <div className="bn-section-body">
                    <div className="bn-row bn-row-4">
                      <label className="bn-field">
                        <span className="bn-label">Recipients</span>
                        <input
                          className="bn-inp"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={selected.recipientCount}
                          onChange={e => updateSelected({ recipientCount: e.target.value })}
                        />
                      </label>
                      <label className="bn-field">
                        <span className="bn-label">Opens</span>
                        <input
                          className="bn-inp"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={selected.openCount}
                          onChange={e => updateSelected({ openCount: e.target.value })}
                        />
                      </label>
                      <label className="bn-field">
                        <span className="bn-label">Clicks</span>
                        <input
                          className="bn-inp"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={selected.clickCount}
                          onChange={e => updateSelected({ clickCount: e.target.value })}
                        />
                      </label>
                      <label className="bn-field">
                        <span className="bn-label">Unsubscribes</span>
                        <input
                          className="bn-inp"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={selected.unsubscribeCount}
                          onChange={e => updateSelected({ unsubscribeCount: e.target.value })}
                        />
                      </label>
                    </div>

                    <div className="bn-metrics">
                      <div className="bn-metric">
                        <span className="bn-metric-lbl">Open rate</span>
                        <span className="bn-metric-val">{formatPct(metrics?.openRate)}</span>
                        <span className="bn-metric-sub">opens / recipients</span>
                      </div>
                      <div className="bn-metric">
                        <span className="bn-metric-lbl">Click rate</span>
                        <span className="bn-metric-val">{formatPct(metrics?.clickRate)}</span>
                        <span className="bn-metric-sub">clicks / opens</span>
                      </div>
                      <div className="bn-metric">
                        <span className="bn-metric-lbl">CTR (recipients)</span>
                        <span className="bn-metric-val">{formatPct(metrics?.ctrVsRecipients)}</span>
                        <span className="bn-metric-sub">clicks / recipients</span>
                      </div>
                    </div>
                  </div>
                </details>
              )}

              {/* Tags */}
              <details className="bn-section" open>
                <summary className="bn-section-summary">
                  <span className="bn-section-title">🏷 Tags</span>
                  <span className="bn-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="bn-section-body">
                  <div className="bn-field">
                    <div className="bn-chip-input">
                      <div className="bn-chip-list">
                        {(selected.tags || []).map((tag, i) => (
                          <span key={i} className="bn-tag-chip">
                            {tag}
                            <button
                              type="button"
                              className="bn-tag-chip-x"
                              onClick={() => handleRemoveTag(tag)}
                              title="Remove tag"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          className="bn-chip-inp"
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
                </div>
              </details>

              {/* Notes */}
              <details className="bn-section">
                <summary className="bn-section-summary">
                  <span className="bn-section-title">🗒 Post-send debrief</span>
                  <span className="bn-section-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="bn-section-body">
                  <label className="bn-field">
                    <textarea
                      className="bn-inp bn-textarea"
                      placeholder='e.g. "Best open rate this quarter — short subject line worked", "Mid-week send underperformed Tuesday morning"…'
                      rows={5}
                      value={selected.notes}
                      onChange={e => updateSelected({ notes: e.target.value })}
                    />
                    <span className="bn-hint">
                      Track what worked. Compare across issues to find your patterns.
                    </span>
                  </label>
                </div>
              </details>

              {/* Quick actions */}
              <div className="bn-actions-row">
                <button
                  className="bn-btn bn-btn-accent"
                  onClick={handleMarkSent}
                  title="Mark as sent — stamps sentAt and uses today as send date if not set"
                  disabled={selected.status === 'sent'}
                >
                  ✓ Mark Sent
                </button>
                <button
                  className="bn-btn bn-btn-ghost"
                  onClick={handleSchedule}
                  title="Set status to scheduled and pick a send date"
                >
                  📅 Schedule for…
                </button>
                <button
                  className="bn-btn bn-btn-ghost"
                  onClick={handleDuplicate}
                  title="Make a copy as a new draft"
                >
                  ⎘ Duplicate as new draft
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </BlogShell>
  );
}
