import { useState, useEffect, useMemo, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './TechIssues.css';

/* ─────────────────────────────────────────────────────────────
   Tech Issues — equipment + tech ticket tracker
   Naming: .ti-*
   Persistence: localStorage key 'gear:tech-issues'
   Also reads (optional): 'gear:inventory', 'band:roster'
   Accent: var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const LS_KEY        = 'gear:tech-issues';
const INVENTORY_KEY = 'gear:inventory';
const ROSTER_KEY    = 'band:roster';

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
  'open':        { label: 'Open',         color: '#fb7185', bg: 'rgba(251,113,133,0.16)',  border: 'rgba(251,113,133,0.40)' },
  'in-progress': { label: 'In Progress',  color: '#60a5fa', bg: 'rgba(96,165,250,0.16)',   border: 'rgba(96,165,250,0.40)' },
  'resolved':    { label: 'Resolved',     color: '#34d399', bg: 'rgba(52,211,153,0.16)',   border: 'rgba(52,211,153,0.40)' },
  'wont-fix':    { label: "Won't Fix",    color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
  'duplicate':   { label: 'Duplicate',    color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
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
  { key: 'audio',      label: 'Audio',       icon: '🎤' },
  { key: 'video',      label: 'Video',       icon: '🎥' },
  { key: 'lighting',   label: 'Lighting',    icon: '💡' },
  { key: 'instrument', label: 'Instrument',  icon: '🎸' },
  { key: 'computer',   label: 'Computer',    icon: '💻' },
  { key: 'network',    label: 'Network',     icon: '📡' },
  { key: 'other',      label: 'Other',       icon: '🔧' },
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

function formatOccurredOn(iso) {
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

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadIssues() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Defensive: ensure comments array exists
    return arr.map(i => ({ ...i, comments: Array.isArray(i.comments) ? i.comments : [] }));
  } catch { return []; }
}
function saveIssues(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}
function loadInventory() {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Items may be { id, name } objects or strings — normalize to { id, name }
    return arr
      .map(it => {
        if (!it) return null;
        if (typeof it === 'string') return { id: it, name: it };
        if (typeof it === 'object' && it.name) {
          return { id: it.id || it.name, name: it.name };
        }
        return null;
      })
      .filter(Boolean);
  } catch { return []; }
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
      className={`ti-sev-badge ${isCritical ? 'ti-sev-critical' : ''}`}
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
      title={`${m.label} severity`}
    >
      {withDot && <span className="ti-sev-dot" style={{ background: m.color }} />}
      {m.label}
    </span>
  );
}

/* ─── Status Pill ──────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span
      className="ti-pill"
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
    <div className="ti-ac" ref={wrapRef}>
      <input
        className="ti-inp"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="ti-ac-list">
          {matches.map(name => (
            <button
              key={name}
              type="button"
              className="ti-ac-item"
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
function NewIssueModal({ inventory, roster, onSave, onCancel }) {
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [severity,     setSeverity]     = useState('medium');
  const [category,     setCategory]     = useState('audio');
  const [itemId,       setItemId]       = useState('');
  const [reportedBy,   setReportedBy]   = useState('');
  const [occurredOn,   setOccurredOn]   = useState(todayISO());
  const [error,        setError]        = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim())       { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    const item = inventory.find(it => it.id === itemId);
    onSave({
      title:       title.trim(),
      description: description.trim(),
      severity,
      category,
      itemId:      item ? item.id : '',
      itemName:    item ? item.name : '',
      reportedBy:  reportedBy.trim(),
      occurredOn,
    });
  }

  return (
    <div className="ti-modal-overlay" onClick={onCancel}>
      <form className="ti-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="ti-modal-head">
          <span>New Tech Issue</span>
          <button type="button" className="ti-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="ti-modal-body">
          {error && <div className="ti-error">{error}</div>}

          <div className="ti-field">
            <label className="ti-lbl">Title</label>
            <input
              className="ti-inp"
              type="text"
              placeholder="e.g. The wedge is buzzing"
              value={title}
              autoFocus
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="ti-field">
            <label className="ti-lbl">Description</label>
            <textarea
              className="ti-inp ti-textarea"
              rows={4}
              placeholder="What happened? When? Any troubleshooting tried?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="ti-field">
            <label className="ti-lbl">Severity</label>
            <div className="ti-sev-row" role="radiogroup" aria-label="Severity">
              {SEVERITIES.map(s => {
                const m = SEVERITY_META[s];
                const on = severity === s;
                return (
                  <button
                    type="button"
                    key={s}
                    role="radio"
                    aria-checked={on}
                    className={`ti-sev-opt ${on ? 'on' : ''}`}
                    style={on ? {
                      background: m.bg,
                      color: m.color,
                      borderColor: m.border,
                    } : undefined}
                    onClick={() => setSeverity(s)}
                  >
                    <span className="ti-sev-dot" style={{ background: m.color }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ti-form-row">
            <div className="ti-field">
              <label className="ti-lbl">Category</label>
              <select
                className="ti-inp"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            <div className="ti-field">
              <label className="ti-lbl">Occurred on</label>
              <input
                className="ti-inp"
                type="date"
                value={occurredOn}
                onChange={e => setOccurredOn(e.target.value)}
              />
            </div>
          </div>

          <div className="ti-form-row">
            <div className="ti-field">
              <label className="ti-lbl">
                Gear item {inventory.length === 0 && <span className="ti-lbl-hint">(none in inventory)</span>}
              </label>
              <select
                className="ti-inp"
                value={itemId}
                onChange={e => setItemId(e.target.value)}
                disabled={inventory.length === 0}
              >
                <option value="">— No specific item —</option>
                {inventory.map(it => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </div>

            <div className="ti-field">
              <label className="ti-lbl">Reported by</label>
              <RosterInput
                value={reportedBy}
                onChange={setReportedBy}
                placeholder="Your name"
                roster={roster}
              />
            </div>
          </div>
        </div>

        <footer className="ti-modal-ft">
          <button type="button" className="ti-btn ti-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ti-btn ti-btn-accent">Create Issue</button>
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
    <form className="ti-comment-form" onSubmit={submit}>
      <div className="ti-comment-row">
        <RosterInput
          value={author}
          onChange={(v) => { setAuthor(v); if (err) setErr(''); }}
          placeholder="Your name (optional)"
          roster={roster}
        />
      </div>
      <textarea
        className="ti-inp ti-textarea ti-comment-textarea"
        rows={2}
        placeholder="Add a comment, update, or follow-up note…"
        value={text}
        onChange={e => { setText(e.target.value); if (err) setErr(''); }}
      />
      {err && <div className="ti-error ti-error-sm">{err}</div>}
      <div className="ti-comment-btns">
        <button type="submit" className="ti-btn ti-btn-accent ti-btn-sm">Post Comment</button>
      </div>
    </form>
  );
}

/* ─── Resolve Form (inline prompt for resolutionNotes) ─────────── */
function ResolveForm({ initial, onSubmit, onCancel }) {
  const [notes, setNotes] = useState(initial || '');
  return (
    <form
      className="ti-resolve-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(notes.trim()); }}
    >
      <label className="ti-lbl">Resolution notes</label>
      <textarea
        className="ti-inp ti-textarea"
        rows={3}
        autoFocus
        placeholder="What was done to fix the issue?"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="ti-resolve-btns">
        <button type="button" className="ti-btn ti-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ti-btn ti-btn-accent">Mark Resolved</button>
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
      className="ti-resolve-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(ref); }}
    >
      <label className="ti-lbl">Reference issue (optional)</label>
      <select
        className="ti-inp"
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
      <div className="ti-resolve-btns">
        <button type="button" className="ti-btn ti-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ti-btn ti-btn-accent">Mark Duplicate</button>
      </div>
    </form>
  );
}

/* ─── Issue Card (collapsed + expanded detail) ─────────────────── */
function IssueCard({
  issue, expanded, onToggle,
  inventory, roster, allIssues,
  onUpdate, onDelete, armedDelete, setArmedDelete,
  onAddComment,
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [resolveOpen,  setResolveOpen]  = useState(false);
  const [dupOpen,      setDupOpen]      = useState(false);

  // Local editable copies (committed on blur / change)
  function patch(p) { onUpdate(issue.id, p); }

  const cat = CATEGORY_BY_KEY[issue.category] || CATEGORY_BY_KEY.other;
  const terminalStatus = issue.status === 'resolved' || issue.status === 'wont-fix' || issue.status === 'duplicate';

  const descShort = (issue.description || '').length > 220
    ? issue.description.slice(0, 220).trimEnd() + '…'
    : issue.description;

  // Find referenced issue if marked duplicate
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
    <article className={`ti-card ${expanded ? 'expanded' : ''} ${issue.severity === 'critical' ? 'critical' : ''}`}>
      {/* Severity stripe on the left */}
      <div
        className={`ti-sev-stripe ti-sev-stripe-${issue.severity}`}
        aria-hidden="true"
      />

      <div className="ti-card-body">
        {/* Top row */}
        <div className="ti-card-top">
          <div className="ti-card-lhs">
            <SeverityBadge severity={issue.severity} />
            <StatusPill status={issue.status} />
          </div>
          <div className="ti-card-rhs">
            <span className="ti-cat-chip" title={`Category: ${cat.label}`}>
              <span aria-hidden="true">{cat.icon}</span> {cat.label}
            </span>
            {issue.itemName && (
              <span className="ti-item-chip" title="Linked gear item">
                🎛 {issue.itemName}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <button
          type="button"
          className="ti-card-title-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <h3 className="ti-card-title">{issue.title || 'Untitled issue'}</h3>
        </button>

        {/* Meta line */}
        <div className="ti-card-meta-line">
          {issue.reportedBy && (
            <>
              <span className="ti-meta-label">Reported by</span>
              <span className="ti-meta-value">{issue.reportedBy}</span>
            </>
          )}
          {issue.occurredOn && (
            <>
              {issue.reportedBy && <span className="ti-meta-sep">·</span>}
              <span className="ti-meta-value">{formatOccurredOn(issue.occurredOn)}</span>
            </>
          )}
          {issue.assignedTo && (
            <>
              <span className="ti-meta-sep">·</span>
              <span className="ti-meta-label">Assigned</span>
              <span className="ti-meta-value">{issue.assignedTo}</span>
            </>
          )}
        </div>

        {/* Description (truncated unless expanded) */}
        {issue.description && !expanded && (
          <div className="ti-card-desc">
            <p className={`ti-card-desc-text ${descExpanded ? 'full' : 'clamp'}`}>
              {descExpanded ? issue.description : descShort}
            </p>
            {issue.description.length > 220 && (
              <button
                type="button"
                className="ti-link-btn"
                onClick={() => setDescExpanded(v => !v)}
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Duplicate-of banner */}
        {issue.status === 'duplicate' && dupRef && (
          <div className="ti-dup-banner">
            Duplicate of: <span className="ti-meta-value">{dupRef.title}</span>
          </div>
        )}

        {/* Resolution notes preview (when collapsed and resolved) */}
        {!expanded && issue.status === 'resolved' && issue.resolutionNotes && (
          <div className="ti-resolved-banner">
            <span className="ti-meta-label">Resolved:</span>{' '}
            <span>{issue.resolutionNotes}</span>
          </div>
        )}

        {/* Footer (collapsed) */}
        {!expanded && (
          <div className="ti-card-foot">
            <span className="ti-meta-muted">Created {relativeTime(issue.createdAt)}</span>
            <span className="ti-meta-sep">·</span>
            <span className="ti-comment-count" title="Comments">
              💬 {issue.comments.length}
            </span>
            {issue.status === 'resolved' && issue.resolvedAt && (
              <>
                <span className="ti-meta-sep">·</span>
                <span className="ti-meta-muted">Resolved {relativeTime(issue.resolvedAt)}</span>
              </>
            )}
          </div>
        )}

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="ti-detail">
            {/* Editable fields */}
            <div className="ti-detail-section">
              <label className="ti-lbl">Title</label>
              <input
                className="ti-inp"
                type="text"
                value={issue.title}
                onChange={e => patch({ title: e.target.value })}
              />
            </div>

            <div className="ti-detail-section">
              <label className="ti-lbl">Description</label>
              <textarea
                className="ti-inp ti-textarea"
                rows={4}
                value={issue.description}
                onChange={e => patch({ description: e.target.value })}
              />
            </div>

            <div className="ti-form-row">
              <div className="ti-field">
                <label className="ti-lbl">Severity</label>
                <select
                  className="ti-inp"
                  value={issue.severity}
                  onChange={e => patch({ severity: e.target.value })}
                >
                  {SEVERITIES.map(s => (
                    <option key={s} value={s}>{SEVERITY_META[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="ti-field">
                <label className="ti-lbl">Category</label>
                <select
                  className="ti-inp"
                  value={issue.category}
                  onChange={e => patch({ category: e.target.value })}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ti-form-row">
              <div className="ti-field">
                <label className="ti-lbl">Status</label>
                <select
                  className="ti-inp"
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
              <div className="ti-field">
                <label className="ti-lbl">Assigned to</label>
                <RosterInput
                  value={issue.assignedTo || ''}
                  onChange={(v) => patch({ assignedTo: v })}
                  placeholder="Tech lead or volunteer"
                  roster={roster}
                />
              </div>
            </div>

            <div className="ti-detail-section">
              <label className="ti-lbl">Resolution notes</label>
              <textarea
                className="ti-inp ti-textarea"
                rows={3}
                placeholder="What was done to fix it?"
                value={issue.resolutionNotes || ''}
                onChange={e => patch({ resolutionNotes: e.target.value })}
              />
            </div>

            {/* Comments thread */}
            <div className="ti-detail-section">
              <label className="ti-lbl">
                Comments ({issue.comments.length})
              </label>

              {issue.comments.length === 0 ? (
                <div className="ti-comments-empty">No comments yet — add the first update below.</div>
              ) : (
                <div className="ti-comments">
                  {[...issue.comments]
                    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
                    .map(c => (
                      <div key={c.id} className="ti-comment">
                        <div className="ti-comment-head">
                          <span className="ti-comment-author">{c.author || 'Anonymous'}</span>
                          <span className="ti-meta-sep">·</span>
                          <span className="ti-meta-muted">{relativeTime(c.createdAt)}</span>
                        </div>
                        <div className="ti-comment-text">{c.text}</div>
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
            <div className="ti-detail-section ti-detail-actions">
              <label className="ti-lbl">Quick actions</label>

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
                <div className="ti-quick-row">
                  {issue.status !== 'resolved' && (
                    <button
                      className="ti-btn ti-btn-success"
                      onClick={handleMarkResolved}
                    >
                      ✓ Mark Resolved
                    </button>
                  )}
                  {issue.status === 'resolved' && (
                    <button
                      className="ti-btn ti-btn-ghost"
                      onClick={handleReopen}
                    >
                      ↻ Reopen
                    </button>
                  )}
                  {issue.status !== 'in-progress' && issue.status !== 'resolved' && (
                    <button
                      className="ti-btn ti-btn-ghost"
                      onClick={() => patch({ status: 'in-progress' })}
                    >
                      ▶ Start Work
                    </button>
                  )}
                  {issue.status !== 'wont-fix' && issue.status !== 'resolved' && (
                    <button
                      className="ti-btn ti-btn-ghost"
                      onClick={() => patch({ status: 'wont-fix' })}
                    >
                      ⊘ Won't Fix
                    </button>
                  )}
                  {issue.status !== 'duplicate' && (
                    <button
                      className="ti-btn ti-btn-ghost"
                      onClick={() => setDupOpen(true)}
                    >
                      ≡ Mark Duplicate
                    </button>
                  )}

                  {/* Delete only for terminal statuses */}
                  {terminalStatus && (
                    <button
                      className={`ti-btn ${armedDelete === issue.id ? 'ti-btn-danger-armed' : 'ti-btn-danger'}`}
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
                <div className="ti-delete-hint">
                  Delete is only available for resolved / won't-fix / duplicate issues.
                </div>
              )}
            </div>

            {/* Collapse button */}
            <div className="ti-collapse-row">
              <button
                type="button"
                className="ti-btn ti-btn-ghost ti-btn-sm"
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
export default function TechIssues() {
  /* Live-synced via Firestore. */
  const [issues,    setIssues]    = useUserStoreKey('gear:tech-issues', []);
  const [inventory]               = useUserStoreKey('gear:inventory',   []);
  const [roster]                  = useUserStoreKey('band:roster',      []);

  const [tab,         setTab]         = useState('all');
  const [sevFilter,   setSevFilter]   = useState('all');
  const [catFilter,   setCatFilter]   = useState('all');
  const [search,      setSearch]      = useState('');

  const [showForm,    setShowForm]    = useState(false);
  const [expandedId,  setExpandedId]  = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);

  /* (All three lists autosync via useUserStoreKey.) */

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
        (i.itemName    || '').toLowerCase().includes(q)
      );
    }

    // Sort: critical → high → medium → low; within same sev, open before resolved, then newest first
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
    <WorshipShell title="Tech Issues" icon="⚠" subtitle="Tracked tech issues and fixes for stage and sound gear.">
    <div className="ti-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="ti-main">
        {/* ── Top bar ── */}
        <div className="ti-topbar">
          <div className="ti-topbar-left">
            <h1 className="ti-page-title">Tech Issues</h1>
            <p className="ti-page-sub">
              Equipment hiccups, AV problems, follow-ups. Anyone can file an issue;
              tech lead prioritizes and resolves.
            </p>
          </div>
          <div className="ti-topbar-right">
            <button
              className="ti-btn ti-btn-accent ti-btn-lg"
              onClick={() => setShowForm(true)}
            >
              + New Issue
            </button>
          </div>
        </div>

        {/* ── Stats card row ── */}
        <div className="ti-stats">
          <div className="ti-stat">
            <div className="ti-stat-num">{stats.openCount}</div>
            <div className="ti-stat-lbl">Open</div>
          </div>
          <div className={`ti-stat ${stats.criticalOpen > 0 ? 'alert' : ''}`}>
            <div className="ti-stat-num">{stats.criticalOpen}</div>
            <div className="ti-stat-lbl">Critical / High Open</div>
          </div>
          <div className="ti-stat">
            <div className="ti-stat-num">{stats.resolvedThisMonth}</div>
            <div className="ti-stat-lbl">Resolved this month</div>
          </div>
          <div className="ti-stat">
            <div className="ti-stat-num ti-stat-num-sm">
              {stats.avgDays == null
                ? '—'
                : stats.avgDays < 1
                  ? `${Math.round(stats.avgDays * 24)}h`
                  : `${stats.avgDays.toFixed(1)}d`}
            </div>
            <div className="ti-stat-lbl">Avg time to resolve</div>
          </div>
        </div>

        {/* ── Status tabs ── */}
        <div className="ti-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`ti-tab ${tab === t.key ? 'on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
              <span className="ti-tab-count">{statusCounts[t.key]}</span>
            </button>
          ))}
        </div>

        {/* ── Sub-filter row ── */}
        <div className="ti-filters">
          <div className="ti-filter-group">
            <span className="ti-filter-lbl">Severity:</span>
            <div className="ti-sev-pills">
              <button
                className={`ti-sev-pill ${sevFilter === 'all' ? 'on' : ''}`}
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
                    className={`ti-sev-pill ${on ? 'on' : ''}`}
                    onClick={() => setSevFilter(s)}
                    style={on ? {
                      background: m.bg,
                      color: m.color,
                      borderColor: m.border,
                    } : undefined}
                  >
                    <span className="ti-sev-dot" style={{ background: m.color }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ti-filter-group">
            <span className="ti-filter-lbl">Category:</span>
            <select
              className="ti-inp ti-filter-select"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>

          <div className="ti-filter-group ti-filter-search">
            <input
              className="ti-inp"
              type="text"
              placeholder="🔍 Search title, description, reporter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── List ── */}
        <div className="ti-list-wrap">
          {visible.length === 0 ? (
            <div className="ti-empty">
              {truelyEmpty ? (
                <>
                  <div className="ti-empty-icon" aria-hidden="true">⚠</div>
                  <div className="ti-empty-title">Report your first issue</div>
                  <div className="ti-empty-sub">
                    Anyone on the team can file gear problems, AV hiccups, or
                    follow-ups — and the tech lead can prioritize and resolve them here.
                  </div>
                  <button
                    className="ti-btn ti-btn-accent ti-empty-cta"
                    onClick={() => setShowForm(true)}
                  >
                    + Create your first issue
                  </button>
                </>
              ) : allClean ? (
                <>
                  <div className="ti-empty-icon" aria-hidden="true">✅</div>
                  <div className="ti-empty-title">No issues to track</div>
                  <div className="ti-empty-sub">
                    Everything is resolved. Nice work.
                  </div>
                </>
              ) : (
                <>
                  <div className="ti-empty-icon" aria-hidden="true">🔎</div>
                  <div className="ti-empty-title">No issues match these filters</div>
                  <div className="ti-empty-sub">
                    Try clearing search, severity, or category filters.
                  </div>
                  <button
                    className="ti-btn ti-btn-ghost ti-empty-cta"
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
            <div className="ti-list">
              {visible.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  expanded={expandedId === issue.id}
                  onToggle={() => toggleExpand(issue.id)}
                  inventory={inventory}
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
          inventory={inventory}
          roster={roster}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
    </WorshipShell>
  );
}
