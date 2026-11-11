import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey, getValue, setValue } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import './BlogIdeas.css';

/* ─────────────────────────────────────────────────────────────
   Blog Ideas — Kanban backlog of post ideas for the church blog
   Naming: .bi-*
   Persistence: localStorage key "blog:ideas"
   Reads     : localStorage key "band:roster" (assignedTo autocomplete)
   Writes    : localStorage key "blog:posts"  (when promoting)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY     = 'blog:ideas';
const ROSTER_KEY      = 'band:roster';
const POSTS_KEY       = 'blog:posts';
const CATEGORIES_KEY  = 'blog:categories';

/* Status lanes (order matters — used by ▶ next/back) */
const STATUSES = [
  { value: 'idea',     label: 'Idea',     icon: '💡', color: '#9ca3af' },
  { value: 'outlined', label: 'Outlined', icon: '📋', color: '#60a5fa' },
  { value: 'drafting', label: 'Drafting', icon: '✍',  color: '#fbbf24' },
  { value: 'ready',    label: 'Ready',    icon: '✅', color: '#34d399' },
];

const PRIORITIES = [
  { value: 'low',    label: 'Low',    color: '#9ca3af' },
  { value: 'medium', label: 'Medium', color: '#fbbf24' },
  { value: 'high',   label: 'High',   color: '#ef4444' },
];

/* Categories now come from the Categories & Series page
   (localStorage key "blog:categories"). */
function loadCategoryNames() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(c => (c && typeof c === 'object' ? c.name : c))
      .filter(name => typeof name === 'string' && name.trim().length > 0);
  } catch {
    return [];
  }
}

/* ─── Helpers ────────────────────────────────────────────────── */
function makeId(prefix = 'i') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(ideas) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  } catch {
    /* ignore quota errors */
  }
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeIdea({ title, description, category, priority, assignedTo }) {
  const now = Date.now();
  return {
    id: makeId('idea'),
    title: (title || '').trim() || 'Untitled idea',
    description: (description || '').trim(),
    assignedTo: (assignedTo || '').trim(),
    status: 'idea',
    priority: priority || 'medium',
    category: category || '',
    targetDate: '',
    addToCalendar: false,
    tags: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    promotedToPostId: null,
    promotedAt: null,
  };
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)         return 'just now';
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function statusMeta(value) {
  return STATUSES.find(s => s.value === value) || STATUSES[0];
}
function priorityMeta(value) {
  return PRIORITIES.find(p => p.value === value) || PRIORITIES[1];
}

/* ─── Toast ──────────────────────────────────────────────────── */
function Toast({ message, action, onAction, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onClose?.(), 5000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="bi-toast">
      <span>{message}</span>
      {action && (
        <button className="bi-toast-action" onClick={onAction}>{action}</button>
      )}
      <button className="bi-toast-close" onClick={onClose}>✕</button>
    </div>
  );
}

/* ─── Promote Confirm ─────────────────────────────────────────── */
function PromoteConfirm({ idea, onCancel, onConfirm }) {
  const [archive, setArchive] = useState(true);
  return (
    <div className="bi-overlay" onClick={onCancel}>
      <div className="bi-modal" onClick={e => e.stopPropagation()}>
        <div className="bi-modal-head">
          <span className="bi-modal-title">Promote to Post</span>
          <button className="bi-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="bi-modal-body">
          <p className="bi-modal-text">
            Create a new draft in the Posts Library from <strong>{idea.title}</strong>?
          </p>
          <p className="bi-modal-text bi-muted">
            The post will inherit the title, description (as excerpt), category,
            tags, and assigned author.
          </p>
          <label className="bi-modal-check">
            <input
              type="checkbox"
              checked={archive}
              onChange={e => setArchive(e.target.checked)}
            />
            <span>Archive idea after promoting (remove from board)</span>
          </label>
        </div>
        <div className="bi-modal-foot">
          <button className="bi-btn bi-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="bi-btn bi-btn-accent"
            onClick={() => onConfirm({ archive })}
          >
            Promote
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── New Idea inline form ────────────────────────────────────── */
function NewIdeaForm({ rosterNames, categoryNames, onAdd, onCancel }) {
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [category, setCategory]   = useState('');
  const [priority, setPriority]   = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      assignedTo: assignedTo.trim(),
    });
    setTitle(''); setDesc(''); setAssignedTo(''); setCategory('');
  }

  return (
    <form className="bi-new-form" onSubmit={submit}>
      <div className="bi-new-row">
        <input
          className="bi-inp bi-new-title"
          placeholder="Idea title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />
        <select
          className="bi-inp bi-new-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
          title={categoryNames.length === 0 ? 'Add categories in Categories & Series' : 'Pick a category'}
        >
          <option value="">
            {categoryNames.length === 0 ? 'No categories' : '— Category —'}
          </option>
          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="bi-inp bi-new-select"
          value={priority}
          onChange={e => setPriority(e.target.value)}
        >
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input
          className="bi-inp bi-new-assign"
          list="bi-roster-list"
          placeholder="Assign to…"
          value={assignedTo}
          onChange={e => setAssignedTo(e.target.value)}
        />
      </div>
      <div className="bi-new-row">
        <input
          className="bi-inp bi-new-desc"
          placeholder="Short synopsis (why this matters)…"
          value={description}
          onChange={e => setDesc(e.target.value)}
        />
        <button type="submit" className="bi-btn bi-btn-accent" disabled={!title.trim()}>
          + Add idea
        </button>
        <button type="button" className="bi-btn bi-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <datalist id="bi-roster-list">
        {rosterNames.map(n => <option key={n} value={n} />)}
      </datalist>
    </form>
  );
}

/* ─── Idea Card ──────────────────────────────────────────────── */
function IdeaCard({
  idea,
  expanded,
  rosterNames,
  categoryNames,
  onToggleExpand,
  onUpdate,
  onDelete,
  onPromote,
  onAdvanceStatus,
  onDragStart,
  onDragEnd,
}) {
  const pmeta = priorityMeta(idea.priority);
  const smeta = statusMeta(idea.status);
  const statusIdx = STATUSES.findIndex(s => s.value === idea.status);
  const canBack = statusIdx > 0;
  const canFwd  = statusIdx < STATUSES.length - 1;

  const [showMore, setShowMore] = useState(false);
  const [armDelete, setArmDelete] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [tagInput, setTagInput] = useState('');

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (idea.tags?.includes(t)) { setTagInput(''); return; }
    onUpdate({ tags: [...(idea.tags || []), t] });
    setTagInput('');
  }
  function removeTag(t) {
    onUpdate({ tags: (idea.tags || []).filter(x => x !== t) });
  }

  return (
    <div
      className={`bi-card${expanded ? ' open' : ''}${idea.promotedToPostId ? ' promoted' : ''}`}
      draggable={!expanded}
      onDragStart={e => onDragStart(e, idea.id)}
      onDragEnd={onDragEnd}
      onClick={onToggleExpand}
    >
      <span
        className="bi-card-priority"
        style={{ background: pmeta.color }}
        title={`Priority: ${pmeta.label}`}
      />

      {/* ── Collapsed view ── */}
      {!expanded && (
        <>
          <div className="bi-card-head">
            <div className="bi-card-title">{idea.title}</div>
            {idea.promotedToPostId && (
              <span className="bi-promoted-badge" title="Promoted to Posts Library">✓ Promoted</span>
            )}
          </div>

          {idea.description && (
            <div className={`bi-card-desc${showMore ? ' full' : ''}`}>
              {idea.description}
              {idea.description.length > 90 && (
                <button
                  className="bi-link"
                  onClick={e => { e.stopPropagation(); setShowMore(v => !v); }}
                >
                  {showMore ? ' less' : ' more'}
                </button>
              )}
            </div>
          )}

          <div className="bi-card-chips">
            {idea.assignedTo && (
              <span className="bi-chip bi-chip-assignee">👤 {idea.assignedTo}</span>
            )}
            {idea.category && (
              <span className="bi-chip bi-chip-category">{idea.category}</span>
            )}
            {(idea.tags || []).slice(0, 4).map(t => (
              <span key={t} className="bi-chip bi-chip-tag">#{t}</span>
            ))}
            {idea.targetDate && (
              <span className="bi-chip bi-chip-date">📅 {formatDate(idea.targetDate)}</span>
            )}
          </div>

          <div className="bi-card-foot" onClick={e => e.stopPropagation()}>
            <span className="bi-card-time">{relativeTime(idea.createdAt)}</span>
            <div className="bi-card-actions">
              {canBack && (
                <button
                  className="bi-icon-btn"
                  title={`Back to ${statusMeta(STATUSES[statusIdx - 1].value).label}`}
                  onClick={() => onAdvanceStatus(-1)}
                >◀</button>
              )}
              {canFwd && (
                <button
                  className="bi-icon-btn"
                  title={`Advance to ${statusMeta(STATUSES[statusIdx + 1].value).label}`}
                  onClick={() => onAdvanceStatus(1)}
                >▶</button>
              )}
              {!idea.promotedToPostId && (
                <button
                  className="bi-icon-btn bi-promote-btn"
                  title="Promote to Posts Library"
                  onClick={onPromote}
                >📤</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Expanded view ── */}
      {expanded && (
        <div className="bi-card-expanded" onClick={e => e.stopPropagation()}>
          {editTitle ? (
            <input
              className="bi-inp bi-exp-title"
              autoFocus
              value={idea.title}
              onChange={e => onUpdate({ title: e.target.value })}
              onBlur={() => setEditTitle(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditTitle(false); }}
            />
          ) : (
            <div className="bi-exp-title-row">
              <h3 className="bi-exp-title-text">{idea.title}</h3>
              {idea.promotedToPostId && (
                <span className="bi-promoted-badge">✓ Promoted</span>
              )}
              <button
                className="bi-icon-btn"
                title="Collapse"
                onClick={onToggleExpand}
              >▾</button>
            </div>
          )}

          <div className="bi-exp-grid">
            <label className="bi-field">
              <span className="bi-label">Category</span>
              <select
                className="bi-inp"
                value={idea.category || ''}
                onChange={e => onUpdate({ category: e.target.value })}
                title={categoryNames.length === 0 ? 'Add categories in Categories & Series' : ''}
              >
                <option value="">
                  {categoryNames.length === 0 ? 'No categories — add in Categories & Series' : '— None —'}
                </option>
                {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="bi-field">
              <span className="bi-label">Priority</span>
              <select
                className="bi-inp"
                value={idea.priority || 'medium'}
                onChange={e => onUpdate({ priority: e.target.value })}
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="bi-field">
              <span className="bi-label">Assigned to</span>
              <input
                className="bi-inp"
                list="bi-roster-list"
                value={idea.assignedTo || ''}
                onChange={e => onUpdate({ assignedTo: e.target.value })}
                placeholder="Author name…"
              />
            </label>
            <label className="bi-field">
              <span className="bi-label">Target date</span>
              <input
                className="bi-inp"
                type="date"
                value={idea.targetDate || ''}
                onChange={e => onUpdate({ targetDate: e.target.value })}
              />
            </label>
          </div>

          {/* "Add to Calendar" toggle — when on, this idea's target date
              shows up on the Calendar page. Greyed out when no date set. */}
          <label className="bi-add-cal" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!idea.addToCalendar}
              disabled={!idea.targetDate}
              onChange={e => onUpdate({ addToCalendar: e.target.checked })}
            />
            <span className="bi-add-cal-text">
              📅 Add to Calendar
              {!idea.targetDate && (
                <span className="bi-add-cal-hint"> · set a Target date first</span>
              )}
            </span>
          </label>

          <label className="bi-field">
            <span className="bi-label">Description / synopsis</span>
            <textarea
              className="bi-inp bi-textarea"
              value={idea.description || ''}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="Why does this matter? Audience, hook, key points…"
            />
          </label>

          <label className="bi-field">
            <span className="bi-label">Notes (outline, references, scripture, links…)</span>
            <textarea
              className="bi-inp bi-textarea bi-textarea-tall"
              value={idea.notes || ''}
              onChange={e => onUpdate({ notes: e.target.value })}
              placeholder="Outline, references, link dump…"
            />
          </label>

          <div className="bi-field">
            <span className="bi-label">Tags</span>
            <div className="bi-tag-row">
              {(idea.tags || []).map(t => (
                <span key={t} className="bi-chip bi-chip-tag bi-chip-rem">
                  #{t}
                  <button
                    className="bi-chip-x"
                    onClick={() => removeTag(t)}
                    title="Remove tag"
                  >✕</button>
                </span>
              ))}
              <input
                className="bi-inp bi-tag-input"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                }}
                placeholder="Add tag + Enter"
              />
            </div>
          </div>

          <div className="bi-exp-actions">
            {!idea.promotedToPostId && (
              <button
                className="bi-btn bi-btn-accent"
                onClick={onPromote}
              >📤 Promote to Post</button>
            )}
            <button
              className="bi-btn bi-btn-ghost"
              onClick={() => setEditTitle(v => !v)}
            >{editTitle ? 'Done editing title' : 'Edit Title'}</button>
            <button
              className={`bi-btn ${armDelete ? 'bi-btn-danger-armed' : 'bi-btn-danger'}`}
              onClick={() => {
                if (!armDelete) { setArmDelete(true); return; }
                onDelete();
              }}
              onBlur={() => setArmDelete(false)}
            >
              {armDelete ? 'Confirm delete' : 'Delete'}
            </button>
          </div>

          <div className="bi-exp-meta">
            <span>Created {relativeTime(idea.createdAt)}</span>
            {idea.updatedAt && idea.updatedAt !== idea.createdAt && (
              <span> · Updated {relativeTime(idea.updatedAt)}</span>
            )}
            {idea.promotedAt && (
              <span> · Promoted {relativeTime(idea.promotedAt)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function BlogIdeas() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  /* Ideas now live in Firestore at /users/{uid}/kv/blog:ideas.
     setIdeas writes through automatically — no more saveAll useEffect. */
  const [ideas, setIdeas]         = useUserStoreKey('blog:ideas', []);
  const [rosterNames, setRoster]  = useState([]);
  /* Categories come from the Categories & Series page (same Firestore doc),
     so edits there stream in via onSnapshot. */
  const [categoryList] = useUserStoreKey('blog:categories', []);
  const categoryNames = useMemo(
    () => (categoryList || [])
      .map(c => (c && typeof c === 'object' ? c.name : c))
      .filter(name => typeof name === 'string' && name.trim().length > 0),
    [categoryList]
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showNew, setShowNew]     = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [promoteTarget, setPromoteTarget] = useState(null);
  const [toast, setToast]         = useState(null);

  const dragId = useRef(null);

  /* Load roster for autocomplete (still localStorage — roster page hasn't
     been migrated yet). */
  useEffect(() => {
    const list = loadRoster();
    setRoster(list.map(m => m?.name).filter(Boolean));
  }, []);

  /* Deep-link: ?id=<ideaId> expands the matching idea card (e.g. when
     arriving from Calendar's "Open" button). Filters are reset to "All"
     so the card is guaranteed to be visible. The param is cleared after
     consumption to keep the URL tidy. */
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    const exists = ideas.some(i => i.id === id);
    if (!exists) return;
    setExpandedId(id);
    setStatusFilter('all');
    setPriorityFilter('all');
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [searchParams, ideas, setSearchParams]);

  /* ── CRUD ─────────────────────────────────────────────────── */
  const addIdea = useCallback((data) => {
    const idea = makeIdea(data);
    setIdeas(prev => [idea, ...prev]);
    setShowNew(false);
  }, []);

  const updateIdea = useCallback((id, patch) => {
    setIdeas(prev => prev.map(i =>
      i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i
    ));
  }, []);

  const deleteIdea = useCallback((id) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const advanceStatus = useCallback((id, delta) => {
    setIdeas(prev => prev.map(i => {
      if (i.id !== id) return i;
      const idx = STATUSES.findIndex(s => s.value === i.status);
      const next = Math.max(0, Math.min(STATUSES.length - 1, idx + delta));
      return { ...i, status: STATUSES[next].value, updatedAt: Date.now() };
    }));
  }, []);

  /* ── Drag-and-drop between columns ─────────────────────────── */
  const handleDragStart = useCallback((e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* */ }
  }, []);

  const handleDragEnd = useCallback(() => {
    dragId.current = null;
    setDragOverStatus(null);
  }, []);

  const handleColumnDragOver = useCallback((e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleColumnDragLeave = useCallback((e) => {
    /* Only clear if leaving the column entirely */
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverStatus(null);
  }, []);

  const handleColumnDrop = useCallback((e, status) => {
    e.preventDefault();
    const id = dragId.current || (() => {
      try { return e.dataTransfer.getData('text/plain'); } catch { return null; }
    })();
    setDragOverStatus(null);
    dragId.current = null;
    if (!id) return;
    setIdeas(prev => prev.map(i =>
      i.id === id && i.status !== status
        ? { ...i, status, updatedAt: Date.now() }
        : i
    ));
  }, []);

  /* ── Promote to Posts Library ──────────────────────────────── */
  /* Writes into the same user's blog:posts doc in Firestore. Async because
     it reads the current post list, prepends the new one, and writes back. */
  const doPromote = useCallback(async (idea, { archive }) => {
    if (!user?.uid) {
      setToast({ message: 'You must be signed in to promote.' });
      return;
    }
    let postId = null;
    try {
      const existing = (await getValue(user.uid, 'blog:posts')) || [];
      const arr = Array.isArray(existing) ? existing : [];
      postId = 'post_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const newPost = {
        id: postId,
        title: idea.title,
        slug: idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        excerpt: idea.description || '',
        body: idea.notes || '',
        category: idea.category || '',
        tags: Array.isArray(idea.tags) ? [...idea.tags] : [],
        author: idea.assignedTo || '',
        status: 'draft',
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        sourceIdeaId: idea.id,
      };
      await setValue(user.uid, 'blog:posts', [newPost, ...arr]);
    } catch {
      setToast({ message: 'Failed to write to Posts Library.' });
      return;
    }

    const promotedAt = Date.now();
    if (archive) {
      setIdeas(prev => prev.filter(i => i.id !== idea.id));
      if (expandedId === idea.id) setExpandedId(null);
    } else {
      setIdeas(prev => prev.map(i =>
        i.id === idea.id
          ? { ...i, promotedToPostId: postId, promotedAt, updatedAt: promotedAt }
          : i
      ));
    }

    setPromoteTarget(null);
    setToast({
      message: 'Promoted to draft post.',
      action: 'Open in Posts Library',
      onAction: () => { window.location.assign('/blog-posts'); },
    });
  }, [expandedId, user, setIdeas]);

  /* ── Filtering ─────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ideas.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
      if (q) {
        const hay = [
          i.title, i.description, i.assignedTo,
          ...(Array.isArray(i.tags) ? i.tags : []),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ideas, statusFilter, priorityFilter, search]);

  const counts = useMemo(() => {
    const base = { all: ideas.length, idea: 0, outlined: 0, drafting: 0, ready: 0 };
    ideas.forEach(i => { if (base[i.status] != null) base[i.status]++; });
    return base;
  }, [ideas]);

  const stats = useMemo(() => {
    const total      = ideas.length;
    const ready      = ideas.filter(i => i.status === 'ready').length;
    const onCalendar = ideas.filter(i => i.addToCalendar && i.targetDate).length;
    const noOwner    = ideas.filter(i => !i.assignedTo).length;
    return { total, ready, onCalendar, noOwner };
  }, [ideas]);

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <BlogShell title="Content Ideas" icon="💡" subtitle="Running list of post ideas and pitches waiting to be written." fullBleed>
    <div className="bi-root">
      <main className="bi-main">
        {/* ── Header ── */}
        <header className="bi-header">
          <div className="bi-header-top">
            <div className="bi-title-block">
              <h1 className="bi-title">Content Ideas</h1>
              <p className="bi-subtitle">Backlog for upcoming blog posts</p>
            </div>
            <button
              className="bi-btn bi-btn-accent bi-new-cta"
              onClick={() => setShowNew(v => !v)}
            >
              {showNew ? '× Close' : '+ New Idea'}
            </button>
          </div>

          {showNew && (
            <NewIdeaForm
              rosterNames={rosterNames}
              categoryNames={categoryNames}
              onAdd={addIdea}
              onCancel={() => setShowNew(false)}
            />
          )}

          {/* ── Filters ── */}
          <div className="bi-filters">
            <div className="bi-pills">
              {[
                { v: 'all',      l: 'All' },
                { v: 'idea',     l: '💡 Idea' },
                { v: 'outlined', l: '📋 Outlined' },
                { v: 'drafting', l: '✍ Drafting' },
                { v: 'ready',    l: '✅ Ready' },
              ].map(p => (
                <button
                  key={p.v}
                  className={`bi-pill${statusFilter === p.v ? ' on' : ''}`}
                  onClick={() => setStatusFilter(p.v)}
                >
                  {p.l}
                  <span className="bi-pill-count">{counts[p.v] ?? 0}</span>
                </button>
              ))}
            </div>

            <select
              className="bi-inp bi-priority-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              title="Filter by priority"
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label} priority</option>
              ))}
            </select>

            <input
              className="bi-inp bi-search"
              placeholder="Search ideas, tags, authors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* ── Stats ── */}
          <div className="bi-stats">
            <div className="bi-stat">
              <span className="bi-stat-num">{stats.total}</span>
              <span className="bi-stat-lbl">Total ideas</span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-num bi-stat-green">{stats.ready}</span>
              <span className="bi-stat-lbl">Ready to publish</span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-num bi-stat-amber">{stats.onCalendar}</span>
              <span className="bi-stat-lbl">On calendar</span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-num bi-stat-red">{stats.noOwner}</span>
              <span className="bi-stat-lbl">Without assignee</span>
            </div>
          </div>
        </header>

        {/* ── Kanban Board ── */}
        <div className="bi-board">
          {STATUSES.map(s => {
            const colIdeas = filtered.filter(i => i.status === s.value);
            const isOver = dragOverStatus === s.value;
            return (
              <section
                key={s.value}
                className={`bi-col${isOver ? ' drag-over' : ''}`}
                onDragOver={e => handleColumnDragOver(e, s.value)}
                onDragLeave={handleColumnDragLeave}
                onDrop={e => handleColumnDrop(e, s.value)}
              >
                <header
                  className="bi-col-head"
                  style={{ borderTopColor: s.color }}
                >
                  <span className="bi-col-icon">{s.icon}</span>
                  <span className="bi-col-label" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span className="bi-col-count">{colIdeas.length}</span>
                </header>

                <div className="bi-col-body">
                  {colIdeas.length === 0 && (
                    <div className="bi-col-empty">
                      {ideas.length === 0
                        ? 'Drop ideas here'
                        : 'Nothing here yet'}
                    </div>
                  )}
                  {colIdeas.map(idea => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      expanded={expandedId === idea.id}
                      rosterNames={rosterNames}
                      categoryNames={categoryNames}
                      onToggleExpand={() =>
                        setExpandedId(prev => prev === idea.id ? null : idea.id)
                      }
                      onUpdate={patch => updateIdea(idea.id, patch)}
                      onDelete={() => deleteIdea(idea.id)}
                      onPromote={() => setPromoteTarget(idea)}
                      onAdvanceStatus={delta => advanceStatus(idea.id, delta)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {ideas.length === 0 && (
          <div className="bi-empty">
            <div className="bi-empty-icon">💡</div>
            <div className="bi-empty-title">No ideas yet</div>
            <div className="bi-empty-sub">
              Capture every spark — a sermon series, a Q&A thread, a Bible study
              that lit a fire. Drag cards across the lanes as they mature.
            </div>
            <button
              className="bi-btn bi-btn-accent"
              onClick={() => setShowNew(true)}
            >+ Create your first idea</button>
          </div>
        )}

        {/* shared roster datalist for outside-card inputs */}
        <datalist id="bi-roster-list">
          {rosterNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </main>

      {promoteTarget && (
        <PromoteConfirm
          idea={promoteTarget}
          onCancel={() => setPromoteTarget(null)}
          onConfirm={opts => doPromote(promoteTarget, opts)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          action={toast.action}
          onAction={toast.onAction}
          onClose={() => setToast(null)}
        />
      )}
    </div>
    </BlogShell>
  );
}
