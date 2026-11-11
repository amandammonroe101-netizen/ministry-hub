import { useState, useEffect, useMemo, useRef } from 'react';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './SiteIssues.css';

/* ─────────────────────────────────────────────────────────────
   Broken Links & Issues — church website ticket tracker
   Naming: .si-*
   Persistence: localStorage key 'web:site-issues'
   Also reads (optional): 'band:roster'
   Accent: var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const LS_KEY     = 'web:site-issues';
const ROSTER_KEY = 'band:roster';

/* ─── Status tabs ──────────────────────────────────────────────── */
const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved' },
  { key: 'wont-fix',    label: "Won't Fix" },
  { key: 'duplicate',   label: 'Duplicate' },
];

const STATUS_META = {
  'open':        { label: 'Open',        color: '#fb7185', bg: 'rgba(251,113,133,0.16)', border: 'rgba(251,113,133,0.40)' },
  'in-progress': { label: 'In Progress', color: '#60a5fa', bg: 'rgba(96,165,250,0.16)',  border: 'rgba(96,165,250,0.40)' },
  'resolved':    { label: 'Resolved',    color: '#34d399', bg: 'rgba(52,211,153,0.16)',  border: 'rgba(52,211,153,0.40)' },
  'wont-fix':    { label: "Won't Fix",   color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
  'duplicate':   { label: 'Duplicate',   color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
};

/* ─── Severity ─────────────────────────────────────────────────── */
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const SEVERITY_META = {
  low:      { label: 'Low',      color: '#60a5fa', bg: 'rgba(96,165,250,0.16)',  border: 'rgba(96,165,250,0.45)'  },
  medium:   { label: 'Medium',   color: '#fbbf24', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(251,191,36,0.45)'  },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.16)',  border: 'rgba(249,115,22,0.50)'  },
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.55)'   },
};

/* ─── Categories ───────────────────────────────────────────────── */
const CATEGORIES = [
  { key: 'broken-link',    label: 'Broken Link',    icon: '🔗' },
  { key: 'missing-image',  label: 'Missing Image',  icon: '🖼' },
  { key: 'typo',           label: 'Typo',           icon: '✏' },
  { key: 'layout-bug',     label: 'Layout Bug',     icon: '📐' },
  { key: 'performance',    label: 'Performance',    icon: '⚡' },
  { key: 'accessibility',  label: 'Accessibility',  icon: '♿' },
  { key: 'mobile',         label: 'Mobile',         icon: '📱' },
  { key: 'security',       label: 'Security',       icon: '🔒' },
  { key: 'content',        label: 'Content',        icon: '📄' },
  { key: 'other',          label: 'Other',          icon: '🔧' },
];

const CATEGORY_BY_KEY = CATEGORIES.reduce((acc, c) => { acc[c.key] = c; return acc; }, {});

/* ─── Date / time helpers ──────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)     return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)     return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)      return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30)    return `${days} day${days === 1 ? '' : 's'} ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12)      return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/* ─── URL helpers ──────────────────────────────────────────────── */
function shortUrl(url, max = 38) {
  if (!url) return '';
  let s = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

function safeHref(url) {
  if (!url) return '#';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return url;
  return `https://${url}`;
}

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadIssues() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(i => ({ ...i, comments: Array.isArray(i.comments) ? i.comments : [] }));
  } catch { return []; }
}
function saveIssues(arr) {
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

/* ─── Severity Badge ───────────────────────────────────────────── */
function SeverityBadge({ severity, withDot = true }) {
  const m = SEVERITY_META[severity] || SEVERITY_META.medium;
  const isCritical = severity === 'critical';
  return (
    <span
      className={`si-sev-badge ${isCritical ? 'si-sev-critical' : ''}`}
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
      title={`${m.label} severity`}
    >
      {withDot && <span className="si-sev-dot" style={{ background: m.color }} />}
      {m.label}
    </span>
  );
}

/* ─── Status Pill ──────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span
      className="si-pill"
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}

/* ─── Roster Autocomplete Input ────────────────────────────────── */
function RosterInput({ value, onChange, placeholder, roster, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = (value || '').toLowerCase().trim();
  const matches = roster
    .filter(n => n && (!q || n.toLowerCase().includes(q)) && n.toLowerCase() !== q)
    .slice(0, 6);

  return (
    <div className="si-ac" ref={wrapRef}>
      <input
        className="si-inp"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="si-ac-list">
          {matches.map(name => (
            <button
              key={name}
              type="button"
              className="si-ac-item"
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── New Issue Form (modal) ───────────────────────────────────── */
function NewIssueModal({ roster, onSave, onCancel }) {
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [severity,     setSeverity]     = useState('medium');
  const [category,     setCategory]     = useState('broken-link');
  const [pageUrl,      setPageUrl]      = useState('');
  const [brokenUrl,    setBrokenUrl]    = useState('');
  const [reportedBy,   setReportedBy]   = useState('');
  const [discoveredOn, setDiscoveredOn] = useState(todayISO());
  const [error,        setError]        = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim())       { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    onSave({
      title:        title.trim(),
      description:  description.trim(),
      severity,
      category,
      pageUrl:      pageUrl.trim(),
      brokenUrl:    category === 'broken-link' ? brokenUrl.trim() : '',
      reportedBy:   reportedBy.trim(),
      discoveredOn,
    });
  }

  return (
    <div className="si-modal-overlay" onClick={onCancel}>
      <form className="si-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="si-modal-head">
          <span>New Site Issue</span>
          <button type="button" className="si-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="si-modal-body">
          {error && <div className="si-error">{error}</div>}

          <div className="si-field">
            <label className="si-lbl">Title</label>
            <input
              className="si-inp"
              type="text"
              placeholder="e.g. Broken link on About page footer"
              value={title}
              autoFocus
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="si-field">
            <label className="si-lbl">Description</label>
            <textarea
              className="si-inp si-textarea"
              rows={4}
              placeholder="What's wrong? Where did you see it? Any steps to reproduce?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="si-field">
            <label className="si-lbl">Severity</label>
            <div className="si-sev-row" role="radiogroup" aria-label="Severity">
              {SEVERITIES.map(s => {
                const m = SEVERITY_META[s];
                const on = severity === s;
                return (
                  <button
                    type="button"
                    key={s}
                    role="radio"
                    aria-checked={on}
                    className={`si-sev-opt ${on ? 'on' : ''}`}
                    style={on ? {
                      background: m.bg,
                      color: m.color,
                      borderColor: m.border,
                    } : undefined}
                    onClick={() => setSeverity(s)}
                  >
                    <span className="si-sev-dot" style={{ background: m.color }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="si-form-row">
            <div className="si-field">
              <label className="si-lbl">Category</label>
              <select
                className="si-inp"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            <div className="si-field">
              <label className="si-lbl">Discovered on</label>
              <input
                className="si-inp"
                type="date"
                value={discoveredOn}
                onChange={e => setDiscoveredOn(e.target.value)}
              />
            </div>
          </div>

          <div className="si-field">
            <label className="si-lbl">Page URL <span className="si-lbl-hint">(where you found the issue)</span></label>
            <input
              className="si-inp"
              type="text"
              placeholder="e.g. /about or https://church.org/events"
              value={pageUrl}
              onChange={e => setPageUrl(e.target.value)}
            />
          </div>

          {category === 'broken-link' && (
            <div className="si-field">
              <label className="si-lbl">Broken URL <span className="si-lbl-hint">(the link that's not working)</span></label>
              <input
                className="si-inp"
                type="text"
                placeholder="e.g. https://oldhost.com/missing"
                value={brokenUrl}
                onChange={e => setBrokenUrl(e.target.value)}
              />
            </div>
          )}

          <div className="si-field">
            <label className="si-lbl">Reported by</label>
            <RosterInput
              value={reportedBy}
              onChange={setReportedBy}
              placeholder="Your name"
              roster={roster}
            />
          </div>
        </div>

        <footer className="si-modal-ft">
          <button type="button" className="si-btn si-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="si-btn si-btn-accent">Create Issue</button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Inline Add-Comment Form ──────────────────────────────────── */
function AddCommentForm({ roster, onSubmit }) {
  const [author, setAuthor] = useState('');
  const [text,   setText]   = useState('');
  const [err,    setErr]    = useState('');

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) { setErr('Comment text is required.'); return; }
    onSubmit({
      author: author.trim() || 'Anonymous',
      text:   text.trim(),
    });
    setAuthor('');
    setText('');
    setErr('');
  }

  return (
    <form className="si-comment-form" onSubmit={submit}>
      <div className="si-comment-row">
        <RosterInput
          value={author}
          onChange={(v) => { setAuthor(v); if (err) setErr(''); }}
          placeholder="Your name (optional)"
          roster={roster}
        />
      </div>
      <textarea
        className="si-inp si-textarea si-comment-textarea"
        rows={2}
        placeholder="Add a comment, update, or follow-up note…"
        value={text}
        onChange={e => { setText(e.target.value); if (err) setErr(''); }}
      />
      {err && <div className="si-error si-error-sm">{err}</div>}
      <div className="si-comment-btns">
        <button type="submit" className="si-btn si-btn-accent si-btn-sm">Post Comment</button>
      </div>
    </form>
  );
}

/* ─── Resolve Form (inline prompt for resolutionNotes) ─────────── */
function ResolveForm({ initial, onSubmit, onCancel }) {
  const [notes, setNotes] = useState(initial || '');
  return (
    <form
      className="si-resolve-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(notes.trim()); }}
    >
      <label className="si-lbl">Resolution notes</label>
      <textarea
        className="si-inp si-textarea"
        rows={3}
        autoFocus
        placeholder="What was done to fix the issue?"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="si-resolve-btns">
        <button type="button" className="si-btn si-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="si-btn si-btn-accent">Mark Resolved</button>
      </div>
    </form>
  );
}

/* ─── Duplicate Form ───────────────────────────────────────────── */
function DuplicateForm({ allIssues, currentId, onSubmit, onCancel }) {
  const [ref, setRef] = useState('');
  const candidates = allIssues.filter(i => i.id !== currentId);
  return (
    <form
      className="si-resolve-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(ref); }}
    >
      <label className="si-lbl">Reference issue (optional)</label>
      <select
        className="si-inp"
        value={ref}
        onChange={e => setRef(e.target.value)}
        autoFocus
      >
        <option value="">— No reference —</option>
        {candidates.map(i => (
          <option key={i.id} value={i.id}>
            {i.title.slice(0, 60)}{i.title.length > 60 ? '…' : ''}
          </option>
        ))}
      </select>
      <div className="si-resolve-btns">
        <button type="button" className="si-btn si-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="si-btn si-btn-accent">Mark Duplicate</button>
      </div>
    </form>
  );
}

/* ─── Issue Card (collapsed + expanded detail) ─────────────────── */
function IssueCard({
  issue, expanded, onToggle,
  roster, allIssues,
  onUpdate, onDelete, armedDelete, setArmedDelete,
  onAddComment,
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [resolveOpen,  setResolveOpen]  = useState(false);
  const [dupOpen,      setDupOpen]      = useState(false);

  function patch(p) { onUpdate(issue.id, p); }

  const cat = CATEGORY_BY_KEY[issue.category] || CATEGORY_BY_KEY.other;
  const terminalStatus = issue.status === 'resolved' || issue.status === 'wont-fix' || issue.status === 'duplicate';

  const descShort = (issue.description || '').length > 220
    ? issue.description.slice(0, 220).trimEnd() + '…'
    : issue.description;

  const dupRef = issue.duplicateOf
    ? allIssues.find(i => i.id === issue.duplicateOf)
    : null;

  function handleMarkResolved() {
    if (!issue.resolutionNotes || issue.resolutionNotes.trim() === '') {
      setResolveOpen(true);
    } else {
      patch({ status: 'resolved', resolvedAt: Date.now() });
    }
  }

  function commitResolve(notes) {
    patch({
      status: 'resolved',
      resolvedAt: Date.now(),
      resolutionNotes: notes || issue.resolutionNotes || '',
    });
    setResolveOpen(false);
  }

  function commitDuplicate(refId) {
    patch({
      status: 'duplicate',
      duplicateOf: refId || '',
      resolvedAt: Date.now(),
    });
    setDupOpen(false);
  }

  function handleReopen() {
    patch({ status: 'open', resolvedAt: 0 });
  }

  return (
    <article className={`si-card ${expanded ? 'expanded' : ''} ${issue.severity === 'critical' ? 'critical' : ''}`}>
      {/* Severity stripe on the left */}
      <div
        className={`si-sev-stripe si-sev-stripe-${issue.severity}`}
        aria-hidden="true"
      />

      <div className="si-card-body">
        {/* Top row */}
        <div className="si-card-top">
          <div className="si-card-lhs">
            <SeverityBadge severity={issue.severity} />
            <StatusPill status={issue.status} />
          </div>
          <div className="si-card-rhs">
            <span className="si-cat-chip" title={`Category: ${cat.label}`}>
              <span aria-hidden="true">{cat.icon}</span> {cat.label}
            </span>
            {issue.pageUrl && (
              <a
                className="si-url-chip"
                href={safeHref(issue.pageUrl)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Affected page: ${issue.pageUrl}`}
                onClick={e => e.stopPropagation()}
              >
                🌐 {shortUrl(issue.pageUrl, 28)}
              </a>
            )}
          </div>
        </div>

        {/* Title */}
        <button
          type="button"
          className="si-card-title-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <h3 className="si-card-title">{issue.title || 'Untitled issue'}</h3>
        </button>

        {/* Meta line */}
        <div className="si-card-meta-line">
          {issue.reportedBy && (
            <>
              <span className="si-meta-label">Reported by</span>
              <span className="si-meta-value">{issue.reportedBy}</span>
            </>
          )}
          {issue.discoveredOn && (
            <>
              {issue.reportedBy && <span className="si-meta-sep">·</span>}
              <span className="si-meta-muted" title={formatDate(issue.discoveredOn)}>
                discovered {formatDate(issue.discoveredOn)}
              </span>
            </>
          )}
          {issue.assignedTo && (
            <>
              <span className="si-meta-sep">·</span>
              <span className="si-meta-label">Assigned</span>
              <span className="si-meta-value">{issue.assignedTo}</span>
            </>
          )}
        </div>

        {/* Broken URL row (for broken-link category) */}
        {issue.category === 'broken-link' && issue.brokenUrl && (
          <div className="si-broken-row">
            <span className="si-meta-label">Broken URL:</span>{' '}
            <a
              className="si-broken-link"
              href={safeHref(issue.brokenUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              {shortUrl(issue.brokenUrl, 60)}
            </a>
          </div>
        )}

        {/* Description (truncated unless expanded) */}
        {issue.description && !expanded && (
          <div className="si-card-desc">
            <p className={`si-card-desc-text ${descExpanded ? 'full' : 'clamp'}`}>
              {descExpanded ? issue.description : descShort}
            </p>
            {issue.description.length > 220 && (
              <button
                type="button"
                className="si-link-btn"
                onClick={() => setDescExpanded(v => !v)}
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Duplicate-of banner */}
        {issue.status === 'duplicate' && dupRef && (
          <div className="si-dup-banner">
            Duplicate of: <span className="si-meta-value">{dupRef.title}</span>
          </div>
        )}

        {/* Resolution notes preview (when collapsed and resolved) */}
        {!expanded && issue.status === 'resolved' && issue.resolutionNotes && (
          <div className="si-resolved-banner">
            <span className="si-meta-label">Resolved:</span>{' '}
            <span>{issue.resolutionNotes}</span>
          </div>
        )}

        {/* Footer (collapsed) */}
        {!expanded && (
          <div className="si-card-foot">
            <span className="si-meta-muted">Created {relativeTime(issue.createdAt)}</span>
            <span className="si-meta-sep">·</span>
            <span className="si-comment-count" title="Comments">
              💬 {issue.comments.length}
            </span>
            {issue.status === 'resolved' && issue.resolvedAt && (
              <>
                <span className="si-meta-sep">·</span>
                <span className="si-meta-muted">Resolved {relativeTime(issue.resolvedAt)}</span>
              </>
            )}
          </div>
        )}

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="si-detail">
            <div className="si-detail-section">
              <label className="si-lbl">Title</label>
              <input
                className="si-inp"
                type="text"
                value={issue.title}
                onChange={e => patch({ title: e.target.value })}
              />
            </div>

            <div className="si-detail-section">
              <label className="si-lbl">Description</label>
              <textarea
                className="si-inp si-textarea"
                rows={4}
                value={issue.description}
                onChange={e => patch({ description: e.target.value })}
              />
            </div>

            <div className="si-form-row">
              <div className="si-field">
                <label className="si-lbl">Severity</label>
                <select
                  className="si-inp"
                  value={issue.severity}
                  onChange={e => patch({ severity: e.target.value })}
                >
                  {SEVERITIES.map(s => (
                    <option key={s} value={s}>{SEVERITY_META[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="si-field">
                <label className="si-lbl">Category</label>
                <select
                  className="si-inp"
                  value={issue.category}
                  onChange={e => patch({ category: e.target.value })}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="si-form-row">
              <div className="si-field">
                <label className="si-lbl">Status</label>
                <select
                  className="si-inp"
                  value={issue.status}
                  onChange={e => {
                    const next = e.target.value;
                    if (next === 'resolved' && issue.status !== 'resolved') {
                      patch({ status: 'resolved', resolvedAt: Date.now() });
                    } else if (issue.status === 'resolved' && next !== 'resolved') {
                      patch({ status: next, resolvedAt: 0 });
                    } else {
                      patch({ status: next });
                    }
                  }}
                >
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="si-field">
                <label className="si-lbl">Assigned to</label>
                <RosterInput
                  value={issue.assignedTo || ''}
                  onChange={(v) => patch({ assignedTo: v })}
                  placeholder="Web team member"
                  roster={roster}
                />
              </div>
            </div>

            <div className="si-form-row">
              <div className="si-field">
                <label className="si-lbl">Page URL</label>
                <input
                  className="si-inp"
                  type="text"
                  placeholder="e.g. /about"
                  value={issue.pageUrl || ''}
                  onChange={e => patch({ pageUrl: e.target.value })}
                />
              </div>
              {issue.category === 'broken-link' && (
                <div className="si-field">
                  <label className="si-lbl">Broken URL</label>
                  <input
                    className="si-inp"
                    type="text"
                    placeholder="The link that doesn't work"
                    value={issue.brokenUrl || ''}
                    onChange={e => patch({ brokenUrl: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="si-detail-section">
              <label className="si-lbl">Resolution notes</label>
              <textarea
                className="si-inp si-textarea"
                rows={3}
                placeholder="What was done to fix it?"
                value={issue.resolutionNotes || ''}
                onChange={e => patch({ resolutionNotes: e.target.value })}
              />
            </div>

            {/* Comments thread */}
            <div className="si-detail-section">
              <label className="si-lbl">
                Comments ({issue.comments.length})
              </label>

              {issue.comments.length === 0 ? (
                <div className="si-comments-empty">No comments yet — add the first update below.</div>
              ) : (
                <div className="si-comments">
                  {[...issue.comments]
                    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
                    .map(c => (
                      <div key={c.id} className="si-comment">
                        <div className="si-comment-head">
                          <span className="si-comment-author">{c.author || 'Anonymous'}</span>
                          <span className="si-meta-sep">·</span>
                          <span className="si-meta-muted">{relativeTime(c.createdAt)}</span>
                        </div>
                        <div className="si-comment-text">{c.text}</div>
                      </div>
                    ))}
                </div>
              )}

              <AddCommentForm
                roster={roster}
                onSubmit={(c) => onAddComment(issue.id, c)}
              />
            </div>

            {/* Quick actions */}
            <div className="si-detail-section si-detail-actions">
              <label className="si-lbl">Quick actions</label>

              {resolveOpen ? (
                <ResolveForm
                  initial={issue.resolutionNotes}
                  onSubmit={commitResolve}
                  onCancel={() => setResolveOpen(false)}
                />
              ) : dupOpen ? (
                <DuplicateForm
                  allIssues={allIssues}
                  currentId={issue.id}
                  onSubmit={commitDuplicate}
                  onCancel={() => setDupOpen(false)}
                />
              ) : (
                <div className="si-quick-row">
                  {issue.status !== 'resolved' && (
                    <button
                      className="si-btn si-btn-success"
                      onClick={handleMarkResolved}
                    >
                      ✓ Mark Resolved
                    </button>
                  )}
                  {issue.status === 'resolved' && (
                    <button
                      className="si-btn si-btn-ghost"
                      onClick={handleReopen}
                    >
                      ↻ Reopen
                    </button>
                  )}
                  {issue.status !== 'in-progress' && issue.status !== 'resolved' && (
                    <button
                      className="si-btn si-btn-ghost"
                      onClick={() => patch({ status: 'in-progress' })}
                    >
                      ▶ Start Work
                    </button>
                  )}
                  {issue.status !== 'wont-fix' && issue.status !== 'resolved' && (
                    <button
                      className="si-btn si-btn-ghost"
                      onClick={() => patch({ status: 'wont-fix' })}
                    >
                      ⊘ Won't Fix
                    </button>
                  )}
                  {issue.status !== 'duplicate' && (
                    <button
                      className="si-btn si-btn-ghost"
                      onClick={() => setDupOpen(true)}
                    >
                      ≡ Mark Duplicate
                    </button>
                  )}

                  {/* Delete only for terminal statuses */}
                  {terminalStatus && (
                    <button
                      className={`si-btn ${armedDelete === issue.id ? 'si-btn-danger-armed' : 'si-btn-danger'}`}
                      onClick={() => onDelete(issue.id)}
                      onBlur={() => setArmedDelete(null)}
                      title={armedDelete === issue.id ? 'Click again to confirm' : 'Delete this issue'}
                    >
                      {armedDelete === issue.id ? 'Confirm Delete' : '🗑 Delete'}
                    </button>
                  )}
                </div>
              )}

              {!terminalStatus && (
                <div className="si-delete-hint">
                  Delete is only available for resolved / won't-fix / duplicate issues.
                </div>
              )}
            </div>

            {/* Collapse button */}
            <div className="si-collapse-row">
              <button
                type="button"
                className="si-btn si-btn-ghost si-btn-sm"
                onClick={onToggle}
              >
                ▲ Collapse
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─── Main component ───────────────────────────────────────────── */
export default function SiteIssues() {
  const [issues, setIssues] = useUserStoreKey('web:site-issues', []);
  const [roster]            = useUserStoreKey('band:roster',     []);

  const [tab,         setTab]         = useState('all');
  const [sevFilter,   setSevFilter]   = useState('all');
  const [catFilter,   setCatFilter]   = useState('all');
  const [search,      setSearch]      = useState('');

  const [showForm,    setShowForm]    = useState(false);
  const [expandedId,  setExpandedId]  = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);

  /* ── Status counts (for tab badges) ────────────────────────── */
  const statusCounts = useMemo(() => ({
    all:           issues.length,
    'open':        issues.filter(i => i.status === 'open').length,
    'in-progress': issues.filter(i => i.status === 'in-progress').length,
    'resolved':    issues.filter(i => i.status === 'resolved').length,
    'wont-fix':    issues.filter(i => i.status === 'wont-fix').length,
    'duplicate':   issues.filter(i => i.status === 'duplicate').length,
  }), [issues]);

  /* ── Stats card numbers ────────────────────────────────────── */
  const stats = useMemo(() => {
    const openCount     = issues.filter(i => i.status === 'open').length;
    const criticalOpen  = issues.filter(i =>
      (i.status === 'open' || i.status === 'in-progress') &&
      (i.severity === 'critical' || i.severity === 'high')
    ).length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const resolvedThisMonth = issues.filter(i =>
      i.status === 'resolved' && i.resolvedAt && i.resolvedAt >= monthStart
    ).length;

    const resolvedWithTimes = issues.filter(i =>
      i.status === 'resolved' && i.resolvedAt && i.createdAt
    );
    let avgDays = null;
    if (resolvedWithTimes.length > 0) {
      const totalMs = resolvedWithTimes.reduce(
        (sum, i) => sum + (i.resolvedAt - i.createdAt), 0,
      );
      avgDays = totalMs / resolvedWithTimes.length / (1000 * 60 * 60 * 24);
    }

    return { openCount, criticalOpen, resolvedThisMonth, avgDays };
  }, [issues]);

  /* ── Filter + sort visible list ────────────────────────────── */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = issues;

    if (tab !== 'all')       list = list.filter(i => i.status === tab);
    if (sevFilter !== 'all') list = list.filter(i => i.severity === sevFilter);
    if (catFilter !== 'all') list = list.filter(i => i.category === catFilter);

    if (q) {
      list = list.filter(i =>
        (i.title       || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.reportedBy  || '').toLowerCase().includes(q) ||
        (i.assignedTo  || '').toLowerCase().includes(q) ||
        (i.pageUrl     || '').toLowerCase().includes(q) ||
        (i.brokenUrl   || '').toLowerCase().includes(q)
      );
    }

    const sevOrder    = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusOrder = { open: 0, 'in-progress': 1, duplicate: 2, 'wont-fix': 3, resolved: 4 };
    return [...list].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      const sv = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
      if (sv !== 0) return sv;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [issues, tab, sevFilter, catFilter, search]);

  /* ── CRUD handlers ─────────────────────────────────────────── */
  function handleSave(data) {
    const now = Date.now();
    const newIssue = {
      id:              uid(),
      ...data,
      status:          'open',
      assignedTo:      '',
      resolvedAt:      0,
      resolutionNotes: '',
      duplicateOf:     '',
      comments:        [],
      createdAt:       now,
      updatedAt:       now,
    };
    setIssues(prev => [newIssue, ...prev]);
    setShowForm(false);
    setExpandedId(newIssue.id);
  }

  function handleUpdate(id, patch) {
    setIssues(prev => prev.map(i =>
      i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i,
    ));
  }

  function handleAddComment(id, comment) {
    const c = {
      id:        uid(),
      author:    comment.author,
      text:      comment.text,
      createdAt: Date.now(),
    };
    setIssues(prev => prev.map(i =>
      i.id === id
        ? { ...i, comments: [...i.comments, c], updatedAt: Date.now() }
        : i,
    ));
  }

  function handleDelete(id) {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setIssues(prev => prev.filter(i => i.id !== id));
    setArmedDelete(null);
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  /* ── Empty state copy ──────────────────────────────────────── */
  const allClean = issues.length > 0 && stats.openCount === 0 && stats.criticalOpen === 0;
  const truelyEmpty = issues.length === 0;

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <WebsiteShell
      title="Broken Links & Issues"
      icon="🔗"
      subtitle="Ticket tracker for broken links and site issues — status and severity, from report to resolution."
      fullBleed
    >
    <div className="si-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="si-main">
        {/* ── Top bar ── */}
        <div className="si-topbar">
          <div className="si-topbar-left">
            <h1 className="si-page-title">Broken Links &amp; Issues</h1>
            <p className="si-page-sub">
              Track broken links, missing images, typos, layout bugs, performance
              and accessibility issues across the church website.
            </p>
          </div>
          <div className="si-topbar-right">
            <button
              className="si-btn si-btn-accent si-btn-lg"
              onClick={() => setShowForm(true)}
            >
              + New Issue
            </button>
          </div>
        </div>

        {/* ── Stats card row ── */}
        <div className="si-stats">
          <div className="si-stat">
            <div className="si-stat-num">{stats.openCount}</div>
            <div className="si-stat-lbl">Open</div>
          </div>
          <div className={`si-stat ${stats.criticalOpen > 0 ? 'alert' : ''}`}>
            <div className="si-stat-num">{stats.criticalOpen}</div>
            <div className="si-stat-lbl">Critical / High Open</div>
          </div>
          <div className="si-stat">
            <div className="si-stat-num">{stats.resolvedThisMonth}</div>
            <div className="si-stat-lbl">Resolved this month</div>
          </div>
          <div className="si-stat">
            <div className="si-stat-num si-stat-num-sm">
              {stats.avgDays == null
                ? '—'
                : stats.avgDays < 1
                  ? `${Math.round(stats.avgDays * 24)}h`
                  : `${stats.avgDays.toFixed(1)}d`}
            </div>
            <div className="si-stat-lbl">Avg time to resolve</div>
          </div>
        </div>

        {/* ── Status tabs ── */}
        <div className="si-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`si-tab ${tab === t.key ? 'on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
              <span className="si-tab-count">{statusCounts[t.key]}</span>
            </button>
          ))}
        </div>

        {/* ── Sub-filter row ── */}
        <div className="si-filters">
          <div className="si-filter-group">
            <span className="si-filter-lbl">Severity:</span>
            <div className="si-sev-pills">
              <button
                className={`si-sev-pill ${sevFilter === 'all' ? 'on' : ''}`}
                onClick={() => setSevFilter('all')}
              >
                All
              </button>
              {SEVERITIES.map(s => {
                const m = SEVERITY_META[s];
                const on = sevFilter === s;
                return (
                  <button
                    key={s}
                    className={`si-sev-pill ${on ? 'on' : ''}`}
                    onClick={() => setSevFilter(s)}
                    style={on ? {
                      background: m.bg,
                      color: m.color,
                      borderColor: m.border,
                    } : undefined}
                  >
                    <span className="si-sev-dot" style={{ background: m.color }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="si-filter-group">
            <span className="si-filter-lbl">Category:</span>
            <select
              className="si-inp si-filter-select"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>

          <div className="si-filter-group si-filter-search">
            <input
              className="si-inp"
              type="text"
              placeholder="🔍 Search title, description, URL, reporter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── List ── */}
        <div className="si-list-wrap">
          {visible.length === 0 ? (
            <div className="si-empty">
              {truelyEmpty ? (
                <>
                  <div className="si-empty-icon" aria-hidden="true">🔗</div>
                  <div className="si-empty-title">Report your first site issue</div>
                  <div className="si-empty-sub">
                    Broken links, missing images, typos, layout bugs — anyone on the
                    web team can file an issue and assign it for follow-up here.
                  </div>
                  <button
                    className="si-btn si-btn-accent si-empty-cta"
                    onClick={() => setShowForm(true)}
                  >
                    + Create your first issue
                  </button>
                </>
              ) : allClean ? (
                <>
                  <div className="si-empty-icon" aria-hidden="true">✅</div>
                  <div className="si-empty-title">Website is in good shape</div>
                  <div className="si-empty-sub">
                    Everything is resolved. Nice work.
                  </div>
                </>
              ) : (
                <>
                  <div className="si-empty-icon" aria-hidden="true">🔎</div>
                  <div className="si-empty-title">No issues match these filters</div>
                  <div className="si-empty-sub">
                    Try clearing search, severity, or category filters.
                  </div>
                  <button
                    className="si-btn si-btn-ghost si-empty-cta"
                    onClick={() => {
                      setTab('all'); setSevFilter('all');
                      setCatFilter('all'); setSearch('');
                    }}
                  >
                    Clear all filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="si-list">
              {visible.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  expanded={expandedId === issue.id}
                  onToggle={() => toggleExpand(issue.id)}
                  roster={roster}
                  allIssues={issues}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  armedDelete={armedDelete}
                  setArmedDelete={setArmedDelete}
                  onAddComment={handleAddComment}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── New Issue Modal ── */}
      {showForm && (
        <NewIssueModal
          roster={roster}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
    </WebsiteShell>
  );
}
