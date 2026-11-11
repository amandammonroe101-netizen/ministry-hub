import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogComments.css';

/* ─────────────────────────────────────────────────────────────
   Blog Comments Moderation
   Naming: .bcm-*  (NOT .bc-* — that's Blog Calendar)
   Persistence: localStorage key 'blog:comments'
   Also reads: 'blog:posts'
   Accent: var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const LS_KEY    = 'blog:comments';
const POSTS_KEY = 'blog:posts';

/* ─── Status tabs ──────────────────────────────────────────────── */
const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'spam',     label: 'Spam' },
  { key: 'trash',    label: 'Trash' },
];

const STATUS_META = {
  pending:  { label: 'Pending',  color: '#fbbf24', bg: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.45)' },
  approved: { label: 'Approved', color: '#34d399', bg: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.45)' },
  spam:     { label: 'Spam',     color: '#ef4444', bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.45)' },
  trash:    { label: 'Trash',    color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.20)' },
};

/* ─── Date / time helpers ──────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeFromISO(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return relativeTime(d.getTime());
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadComments() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(c => ({
      ...c,
      flagged: !!c.flagged,
      isReply: !!c.isReply,
    }));
  } catch { return []; }
}

function saveComments(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(p => p && (p.id != null))
      .map(p => ({ id: String(p.id), title: p.title || 'Untitled post' }));
  } catch { return []; }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Status Pill ──────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`bcm-pill ${status === 'pending' ? 'bcm-pill-pulse' : ''}`}
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      {status === 'pending' && <span className="bcm-pill-dot" style={{ background: m.color }} />}
      {m.label}
    </span>
  );
}

/* ─── Click-to-copy helper ─────────────────────────────────────── */
function CopyText({ text, label }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  function doCopy(e) {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <button
      type="button"
      className="bcm-copy-btn"
      onClick={doCopy}
      title={`Copy ${label}`}
    >
      <span className="bcm-copy-text">{text}</span>
      <span className="bcm-copy-icon" aria-hidden="true">{copied ? '✓' : '⧉'}</span>
    </button>
  );
}

/* ─── Post Autocomplete ────────────────────────────────────────── */
function PostAutocomplete({ value, onChange, postId, onPick, posts }) {
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
  const matches = posts
    .filter(p => !q || (p.title || '').toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="bcm-ac" ref={wrapRef}>
      <input
        className="bcm-inp"
        type="text"
        placeholder="Type post title to search…"
        value={value}
        onChange={e => { onChange(e.target.value, null); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="bcm-ac-list">
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className={`bcm-ac-item ${p.id === postId ? 'on' : ''}`}
              onClick={() => { onPick(p); setOpen(false); }}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Add Comment Modal ────────────────────────────────────────── */
function AddCommentModal({ posts, onSave, onCancel }) {
  const [authorName,  setAuthorName]  = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorUrl,   setAuthorUrl]   = useState('');
  const [content,     setContent]     = useState('');
  const [postQuery,   setPostQuery]   = useState('');
  const [postId,      setPostId]      = useState('');
  const [postTitle,   setPostTitle]   = useState('');
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [error,        setError]        = useState('');

  function submit(e) {
    e.preventDefault();
    if (!authorName.trim()) { setError('Author name is required.'); return; }
    if (!content.trim())    { setError('Comment content is required.'); return; }
    onSave({
      authorName:  authorName.trim(),
      authorEmail: authorEmail.trim(),
      authorUrl:   authorUrl.trim(),
      content:     content.trim(),
      postId,
      postTitle,
      receivedDate,
    });
  }

  return (
    <div className="bcm-modal-overlay" onClick={onCancel}>
      <form className="bcm-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <header className="bcm-modal-head">
          <span>Log a New Comment</span>
          <button type="button" className="bcm-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="bcm-modal-body">
          {error && <div className="bcm-error">{error}</div>}

          <div className="bcm-form-row">
            <div className="bcm-field">
              <label className="bcm-lbl">Author name</label>
              <input
                className="bcm-inp"
                type="text"
                value={authorName}
                autoFocus
                onChange={e => setAuthorName(e.target.value)}
                placeholder="e.g. Jane Doe"
              />
            </div>
            <div className="bcm-field">
              <label className="bcm-lbl">Author email <span className="bcm-lbl-hint">(optional)</span></label>
              <input
                className="bcm-inp"
                type="email"
                value={authorEmail}
                onChange={e => setAuthorEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="bcm-field">
            <label className="bcm-lbl">Author website <span className="bcm-lbl-hint">(optional)</span></label>
            <input
              className="bcm-inp"
              type="text"
              value={authorUrl}
              onChange={e => setAuthorUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="bcm-field">
            <label className="bcm-lbl">On post <span className="bcm-lbl-hint">(optional)</span></label>
            <PostAutocomplete
              value={postQuery}
              postId={postId}
              posts={posts}
              onChange={(v) => {
                setPostQuery(v);
                if (!v) { setPostId(''); setPostTitle(''); }
              }}
              onPick={(p) => {
                setPostId(p.id);
                setPostTitle(p.title);
                setPostQuery(p.title);
              }}
            />
            {postId && (
              <div className="bcm-meta-muted bcm-meta-sm">
                Linked to: <strong>{postTitle}</strong>
              </div>
            )}
          </div>

          <div className="bcm-field">
            <label className="bcm-lbl">Comment content</label>
            <textarea
              className="bcm-inp bcm-textarea"
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="What did the visitor say?"
            />
          </div>

          <div className="bcm-field">
            <label className="bcm-lbl">Received date</label>
            <input
              className="bcm-inp"
              type="date"
              value={receivedDate}
              onChange={e => setReceivedDate(e.target.value)}
            />
          </div>
        </div>

        <footer className="bcm-modal-ft">
          <button type="button" className="bcm-btn bcm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="bcm-btn bcm-btn-accent">Save Comment</button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Comment Card ─────────────────────────────────────────────── */
function CommentCard({
  item, expanded, onToggle,
  selected, onSelect,
  onUpdate, onDelete, armedDelete, setArmedDelete,
  onNavigatePost,
}) {
  const [showMore, setShowMore] = useState(false);

  function patch(p) { onUpdate(item.id, p); }

  const content = item.content || '';
  const isLong = content.length > 320;

  function composeReply() {
    if (!item.authorEmail) return;
    const subject = encodeURIComponent(`Re: Your comment on ${item.postTitle || 'our blog'}`);
    const body = encodeURIComponent(
      `Hi ${item.authorName || 'there'},\n\nThanks for your comment.\n\n— You wrote —\n${item.content || ''}\n`
    );
    window.location.href = `mailto:${item.authorEmail}?subject=${subject}&body=${body}`;
  }

  function setStatus(next) {
    const p = { status: next };
    if (next === 'approved') p.approvedAt = Date.now();
    if (item.status === 'approved' && next !== 'approved') p.approvedAt = 0;
    patch(p);
  }

  return (
    <article
      className={[
        'bcm-card',
        expanded ? 'expanded' : '',
        item.status === 'pending' ? 'is-pending' : '',
        selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="bcm-card-checkcol">
        <label className="bcm-check" title="Select">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => onSelect(item.id, e.target.checked)}
          />
          <span className="bcm-check-box" aria-hidden="true" />
        </label>
      </div>

      <div className="bcm-card-body">
        {/* Top row */}
        <div className="bcm-card-top">
          <div className="bcm-card-lhs">
            <StatusPill status={item.status} />
            {item.isReply && (
              <span className="bcm-reply-chip" title="Reply to another comment">
                ↩ Reply
              </span>
            )}
            {item.flagged && (
              <span className="bcm-flag-chip" title="Flagged for review">🚩 Flagged</span>
            )}
          </div>
          <div className="bcm-card-rhs">
            <button
              type="button"
              className={`bcm-flag-btn ${item.flagged ? 'on' : ''}`}
              onClick={() => patch({ flagged: !item.flagged })}
              title={item.flagged ? 'Unflag' : 'Flag for review'}
              aria-label="Toggle flag"
            >
              🚩
            </button>
          </div>
        </div>

        {/* Author + email */}
        <div className="bcm-card-author">
          <span className="bcm-author-name">{item.authorName || 'Anonymous'}</span>
          {item.authorEmail && (
            <CopyText text={item.authorEmail} label="email" />
          )}
          {item.authorUrl && (
            <a
              href={item.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bcm-author-url"
              onClick={e => e.stopPropagation()}
              title="Visit author website"
            >
              🌐 {item.authorUrl.replace(/^https?:\/\//, '').slice(0, 32)}
            </a>
          )}
        </div>

        {/* On post chip */}
        {item.postTitle && (
          <div className="bcm-post-row">
            <button
              type="button"
              className="bcm-post-chip"
              onClick={() => onNavigatePost(item.postId)}
              title="Open this post"
            >
              📝 On post: {item.postTitle}
            </button>
          </div>
        )}

        {/* Content */}
        <button
          type="button"
          className="bcm-content-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <p className={`bcm-content-text ${expanded || showMore ? 'full' : 'clamp'}`}>
            {content}
          </p>
        </button>
        {isLong && !expanded && (
          <button
            type="button"
            className="bcm-link-btn"
            onClick={() => setShowMore(v => !v)}
          >
            {showMore ? 'Show less' : 'Show more'}
          </button>
        )}

        {/* Footer */}
        <div className="bcm-card-foot">
          <span className="bcm-meta-muted" title={formatDate(item.receivedDate)}>
            {relativeFromISO(item.receivedDate) || '—'}
          </span>
          {item.status === 'approved' && item.approvedAt && (
            <>
              <span className="bcm-meta-sep">·</span>
              <span className="bcm-meta-muted">
                Approved {relativeTime(item.approvedAt)}
              </span>
            </>
          )}
          {item.ipAddress && (
            <>
              <span className="bcm-meta-sep">·</span>
              <span className="bcm-meta-muted bcm-meta-mono">IP {item.ipAddress}</span>
            </>
          )}
        </div>

        {/* Quick actions (collapsed) */}
        {!expanded && (
          <div className="bcm-quick-row">
            {item.status !== 'approved' && (
              <button
                className="bcm-btn bcm-btn-success bcm-btn-sm"
                onClick={() => setStatus('approved')}
              >
                ✓ Approve
              </button>
            )}
            {item.status !== 'spam' && (
              <button
                className="bcm-btn bcm-btn-danger bcm-btn-sm"
                onClick={() => setStatus('spam')}
              >
                🚫 Spam
              </button>
            )}
            {item.status !== 'trash' && (
              <button
                className="bcm-btn bcm-btn-ghost bcm-btn-sm"
                onClick={() => setStatus('trash')}
              >
                🗑 Trash
              </button>
            )}
            <button
              className="bcm-btn bcm-btn-ghost bcm-btn-sm"
              onClick={onToggle}
            >
              {expanded ? '▲ Collapse' : '▼ View'}
            </button>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="bcm-detail">
            <div className="bcm-detail-section">
              <label className="bcm-lbl">Full comment</label>
              <textarea
                className="bcm-inp bcm-textarea"
                rows={5}
                value={item.content || ''}
                onChange={e => patch({ content: e.target.value })}
              />
            </div>

            <div className="bcm-detail-section">
              <label className="bcm-lbl">Moderator's reply notes</label>
              <textarea
                className="bcm-inp bcm-textarea"
                rows={3}
                placeholder="Internal notes about how you handled this comment…"
                value={item.replyNotes || ''}
                onChange={e => patch({ replyNotes: e.target.value })}
              />
            </div>

            <div className="bcm-form-row">
              <div className="bcm-field">
                <label className="bcm-lbl">Author name</label>
                <input
                  className="bcm-inp"
                  type="text"
                  value={item.authorName || ''}
                  onChange={e => patch({ authorName: e.target.value })}
                />
              </div>
              <div className="bcm-field">
                <label className="bcm-lbl">Author email</label>
                <input
                  className="bcm-inp"
                  type="email"
                  value={item.authorEmail || ''}
                  onChange={e => patch({ authorEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="bcm-form-row">
              <div className="bcm-field">
                <label className="bcm-lbl">Author website</label>
                <input
                  className="bcm-inp"
                  type="text"
                  value={item.authorUrl || ''}
                  onChange={e => patch({ authorUrl: e.target.value })}
                />
              </div>
              <div className="bcm-field">
                <label className="bcm-lbl">Received date</label>
                <input
                  className="bcm-inp"
                  type="date"
                  value={item.receivedDate || ''}
                  onChange={e => patch({ receivedDate: e.target.value })}
                />
              </div>
            </div>

            <div className="bcm-detail-actions">
              <label className="bcm-lbl">Quick actions</label>
              <div className="bcm-quick-row">
                {item.status !== 'approved' && (
                  <button className="bcm-btn bcm-btn-success" onClick={() => setStatus('approved')}>
                    ✓ Approve
                  </button>
                )}
                {item.status !== 'pending' && item.status !== 'approved' && (
                  <button className="bcm-btn bcm-btn-ghost" onClick={() => setStatus('pending')}>
                    ↻ Re-queue
                  </button>
                )}
                {item.status !== 'spam' && (
                  <button className="bcm-btn bcm-btn-danger" onClick={() => setStatus('spam')}>
                    🚫 Mark Spam
                  </button>
                )}
                {item.status !== 'trash' && (
                  <button className="bcm-btn bcm-btn-ghost" onClick={() => setStatus('trash')}>
                    🗑 Trash
                  </button>
                )}
                {item.authorEmail && (
                  <button className="bcm-btn bcm-btn-accent" onClick={composeReply}>
                    ✉ Reply via Email
                  </button>
                )}

                {item.status === 'trash' && (
                  <button
                    className={`bcm-btn ${armedDelete === item.id ? 'bcm-btn-danger-armed' : 'bcm-btn-danger'}`}
                    onClick={() => onDelete(item.id)}
                    onBlur={() => setArmedDelete(null)}
                    title={armedDelete === item.id ? 'Click again to confirm' : 'Delete permanently'}
                  >
                    {armedDelete === item.id ? 'Confirm Delete' : '🗑 Delete forever'}
                  </button>
                )}
              </div>
              {item.status !== 'trash' && (
                <div className="bcm-delete-hint">
                  Permanent delete is only available for trashed comments.
                </div>
              )}
            </div>

            <div className="bcm-collapse-row">
              <button
                type="button"
                className="bcm-btn bcm-btn-ghost bcm-btn-sm"
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
export default function BlogComments() {
  const navigate = useNavigate();

  const [items, setItems] = useUserStoreKey('blog:comments', []);
  const [posts]           = useUserStoreKey('blog:posts',    []);

  const [tab,         setTab]         = useState('all');
  const [showForm,    setShowForm]    = useState(false);
  const [expandedId,  setExpandedId]  = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  /* ── Tab counts ────────────────────────────────────────────── */
  const counts = useMemo(() => ({
    all:      items.length,
    pending:  items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    spam:     items.filter(i => i.status === 'spam').length,
    trash:    items.filter(i => i.status === 'trash').length,
  }), [items]);

  /* ── Stats ─────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const pendingCount = counts.pending;

    const weekAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = items.filter(i => {
      if (!i.receivedDate) return false;
      const d = new Date(i.receivedDate + 'T00:00:00').getTime();
      return !Number.isNaN(d) && d >= weekAgoTs;
    }).length;

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const approvedThisMonth = items.filter(i => {
      if (i.status !== 'approved' || !i.approvedAt) return false;
      const d = new Date(i.approvedAt);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;

    const approvedWithTimes = items.filter(i =>
      i.status === 'approved' && i.approvedAt && i.receivedAt
    );
    let avgHours = null;
    if (approvedWithTimes.length > 0) {
      const total = approvedWithTimes.reduce(
        (sum, i) => sum + Math.max(0, (i.approvedAt - i.receivedAt)), 0,
      );
      avgHours = total / approvedWithTimes.length / (1000 * 60 * 60);
    }

    return { pendingCount, thisWeek, approvedThisMonth, avgHours };
  }, [items, counts]);

  /* ── Filtered & sorted list ────────────────────────────────── */
  const visible = useMemo(() => {
    let list = items;
    if (tab !== 'all') list = list.filter(i => i.status === tab);

    const statusOrder = { pending: 0, approved: 1, spam: 2, trash: 3 };
    return [...list].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      const ad = a.receivedDate || '';
      const bd = b.receivedDate || '';
      if (ad !== bd) return ad < bd ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [items, tab]);

  /* ── CRUD ──────────────────────────────────────────────────── */
  function handleSave(data) {
    const now = Date.now();
    const newItem = {
      id:           uid(),
      authorName:   data.authorName,
      authorEmail:  data.authorEmail,
      authorUrl:    data.authorUrl,
      content:      data.content,
      postId:       data.postId || '',
      postTitle:    data.postTitle || '',
      status:       'pending',
      receivedDate: data.receivedDate,
      receivedAt:   now,
      approvedAt:   0,
      replyNotes:   '',
      isReply:      false,
      parentId:     '',
      ipAddress:    '',
      flagged:      false,
      createdAt:    now,
      updatedAt:    now,
    };
    setItems(prev => [newItem, ...prev]);
    setShowForm(false);
    setExpandedId(newItem.id);
  }

  function handleUpdate(id, patch) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i,
    ));
  }

  function handleDelete(id) {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setArmedDelete(null);
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  /* ── Selection helpers ─────────────────────────────────────── */
  function onSelect(id, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = visible.map(i => i.id);
    const allOn = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOn) visibleIds.forEach(id => next.delete(id));
      else       visibleIds.forEach(id => next.add(id));
      return next;
    });
  }

  function bulkApproveAllPending() {
    const now = Date.now();
    setItems(prev => prev.map(i =>
      i.status === 'pending'
        ? { ...i, status: 'approved', approvedAt: now, updatedAt: now }
        : i,
    ));
  }

  function bulkSpamSelected() {
    if (selectedIds.size === 0) return;
    setItems(prev => prev.map(i =>
      selectedIds.has(i.id)
        ? { ...i, status: 'spam', updatedAt: Date.now() }
        : i,
    ));
    setSelectedIds(new Set());
  }

  function bulkTrashSelected() {
    if (selectedIds.size === 0) return;
    setItems(prev => prev.map(i =>
      selectedIds.has(i.id)
        ? { ...i, status: 'trash', updatedAt: Date.now() }
        : i,
    ));
    setSelectedIds(new Set());
  }

  function navigateToPost(postId) {
    if (!postId) return;
    navigate(`/blog-posts?id=${encodeURIComponent(postId)}`);
  }

  const truelyEmpty = items.length === 0;
  const visibleAllChecked = visible.length > 0 && visible.every(i => selectedIds.has(i.id));
  const selectionCount = selectedIds.size;

  return (
    <BlogShell title="Comments Moderation" icon="💬" subtitle="Reader comments awaiting approval, reply, or removal." fullBleed>
    <div className="bcm-root">
      <main className="bcm-main">
        {/* Top bar */}
        <div className="bcm-topbar">
          <div className="bcm-topbar-left">
            <h1 className="bcm-page-title">Comments Moderation</h1>
            <p className="bcm-page-sub">
              Approve, spam, or trash incoming comments on your church blog.
            </p>
          </div>
          <div className="bcm-topbar-right">
            <button
              className="bcm-btn bcm-btn-ghost"
              onClick={bulkApproveAllPending}
              disabled={counts.pending === 0}
              title="Approve every pending comment in one click"
            >
              ✓ Approve All Pending
            </button>
            <button
              className="bcm-btn bcm-btn-ghost"
              onClick={bulkSpamSelected}
              disabled={selectionCount === 0}
              title="Mark the selected comments as spam"
            >
              🚫 Spam Selected
              {selectionCount > 0 && <span className="bcm-sel-badge">{selectionCount}</span>}
            </button>
            <button
              className="bcm-btn bcm-btn-accent bcm-btn-lg"
              onClick={() => setShowForm(true)}
            >
              + Add Comment
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="bcm-stats">
          <div className={`bcm-stat ${stats.pendingCount > 0 ? 'alert' : ''}`}>
            <div className="bcm-stat-num">{stats.pendingCount}</div>
            <div className="bcm-stat-lbl">Pending</div>
          </div>
          <div className="bcm-stat">
            <div className="bcm-stat-num">{stats.thisWeek}</div>
            <div className="bcm-stat-lbl">This week</div>
          </div>
          <div className="bcm-stat">
            <div className="bcm-stat-num">{stats.approvedThisMonth}</div>
            <div className="bcm-stat-lbl">Approved this month</div>
          </div>
          <div className="bcm-stat">
            <div className="bcm-stat-num bcm-stat-num-sm">
              {stats.avgHours == null
                ? '—'
                : stats.avgHours < 1
                  ? `${Math.round(stats.avgHours * 60)}m`
                  : `${stats.avgHours.toFixed(1)}h`}
            </div>
            <div className="bcm-stat-lbl">Avg approval time</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bcm-tabs">
          {TABS.map(t => {
            const count = counts[t.key];
            const pulse = t.key === 'pending' && count > 0;
            return (
              <button
                key={t.key}
                className={`bcm-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="bcm-tab-label-wrap">
                  {t.label}
                  {pulse && <span className="bcm-tab-redot" aria-hidden="true" />}
                </span>
                <span className="bcm-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Bulk action row */}
        {visible.length > 0 && (
          <div className="bcm-bulkbar">
            <label className="bcm-check bcm-check-inline">
              <input
                type="checkbox"
                checked={visibleAllChecked}
                onChange={toggleSelectAllVisible}
              />
              <span className="bcm-check-box" aria-hidden="true" />
              <span className="bcm-bulk-label">
                {visibleAllChecked ? 'Deselect all visible' : 'Select all visible'}
              </span>
            </label>
            {selectionCount > 0 && (
              <div className="bcm-bulk-actions">
                <span className="bcm-bulk-count">{selectionCount} selected</span>
                <button className="bcm-btn bcm-btn-danger bcm-btn-sm" onClick={bulkSpamSelected}>
                  🚫 Spam
                </button>
                <button className="bcm-btn bcm-btn-ghost bcm-btn-sm" onClick={bulkTrashSelected}>
                  🗑 Trash
                </button>
                <button
                  className="bcm-btn bcm-btn-ghost bcm-btn-sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* List */}
        <div className="bcm-list-wrap">
          {visible.length === 0 ? (
            <div className="bcm-empty">
              {truelyEmpty ? (
                <>
                  <div className="bcm-empty-icon" aria-hidden="true">💬</div>
                  <div className="bcm-empty-title">No comments yet</div>
                  <div className="bcm-empty-sub">
                    When readers comment on your blog posts, they'll show up here for
                    you to approve, spam, or trash. You can also log comments received
                    by phone or in person.
                  </div>
                  <button
                    className="bcm-btn bcm-btn-accent bcm-empty-cta"
                    onClick={() => setShowForm(true)}
                  >
                    + Log your first comment
                  </button>
                </>
              ) : (
                <>
                  <div className="bcm-empty-icon" aria-hidden="true">🔎</div>
                  <div className="bcm-empty-title">Nothing here</div>
                  <div className="bcm-empty-sub">
                    No comments match the <strong>{tab}</strong> tab.
                  </div>
                  <button
                    className="bcm-btn bcm-btn-ghost bcm-empty-cta"
                    onClick={() => setTab('all')}
                  >
                    Show all
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="bcm-list">
              {visible.map(item => (
                <CommentCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item.id)}
                  selected={selectedIds.has(item.id)}
                  onSelect={onSelect}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  armedDelete={armedDelete}
                  setArmedDelete={setArmedDelete}
                  onNavigatePost={navigateToPost}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <AddCommentModal
          posts={posts}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
    </BlogShell>
  );
}
