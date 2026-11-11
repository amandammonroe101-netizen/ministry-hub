import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogSeries.css';

/* ─────────────────────────────────────────────────────────────
   Blog Series — Categories & themed Series taxonomy manager
   Naming: .bs-*
   Persistence: localStorage keys
     - blog:categories
     - blog:series
   Reads (read-only): blog:posts
   ───────────────────────────────────────────────────────────── */

const KEY_CATEGORIES = 'blog:categories';
const KEY_SERIES     = 'blog:series';
const KEY_POSTS      = 'blog:posts';

const COLOR_PALETTE = [
  '#a78bfa', // purple (accent)
  '#60a5fa', // blue
  '#34d399', // green
  '#fbbf24', // amber
  '#fb7185', // rose
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#94a3b8', // slate
];

const STATUS_LABELS = {
  active:    'Active',
  completed: 'Completed',
  archived:  'Archived',
};

function makeId(prefix) {
  return `${prefix}_` + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return d;
  }
}

/* ─── Hex validation ──────────────────────────────────────── */
function isValidHex(h) {
  return /^#[0-9a-fA-F]{6}$/.test(h);
}

/* ═════════════════════════════════════════════════════════════
   New Category Form (inline)
   ═════════════════════════════════════════════════════════════ */
function NewCategoryForm({ onSave, onCancel }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [customHex, setCustomHex] = useState('');
  const [description, setDesc] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    let finalColor = color;
    if (customHex.trim()) {
      const h = customHex.trim().startsWith('#') ? customHex.trim() : '#' + customHex.trim();
      if (!isValidHex(h)) { setError('Invalid hex color (use #rrggbb).'); return; }
      finalColor = h.toLowerCase();
    }
    onSave({ name: trimmed, color: finalColor, description: description.trim() });
  }

  return (
    <form className="bs-new-form" onSubmit={handleSubmit}>
      {error && <p className="bs-error">{error}</p>}
      <input
        className="bs-inp"
        placeholder="Category name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <input
        className="bs-inp"
        placeholder="Short description (optional)"
        value={description}
        onChange={e => setDesc(e.target.value)}
      />
      <div className="bs-color-row">
        <span className="bs-color-label">Color</span>
        <div className="bs-color-swatches">
          {COLOR_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              className={`bs-swatch${color === c && !customHex.trim() ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setCustomHex(''); }}
              title={c}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
        <input
          className="bs-inp bs-inp-hex"
          placeholder="#rrggbb"
          value={customHex}
          onChange={e => setCustomHex(e.target.value)}
          maxLength={7}
          aria-label="Custom hex color"
        />
      </div>
      <div className="bs-new-form-btns">
        <button type="submit" className="bs-btn bs-btn-accent">Create</button>
        <button type="button" className="bs-btn bs-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ═════════════════════════════════════════════════════════════
   Category Card
   ═════════════════════════════════════════════════════════════ */
function CategoryCard({ cat, postCount, linkedPosts = [], onOpenPost, onUpdate, onDelete, armedDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [desc, setDesc] = useState(cat.description || '');
  const [color, setColor] = useState(cat.color || COLOR_PALETTE[0]);
  const [customHex, setCustomHex] = useState('');
  const [editError, setEditError] = useState('');

  function saveEdits() {
    const trimmed = name.trim();
    if (!trimmed) { setEditError('Name is required.'); return; }
    let finalColor = color;
    if (customHex.trim()) {
      const h = customHex.trim().startsWith('#') ? customHex.trim() : '#' + customHex.trim();
      if (!isValidHex(h)) { setEditError('Invalid hex.'); return; }
      finalColor = h.toLowerCase();
    }
    onUpdate({ name: trimmed, description: desc.trim(), color: finalColor });
    setEditing(false);
    setEditError('');
    setCustomHex('');
  }

  function cancelEdits() {
    setName(cat.name);
    setDesc(cat.description || '');
    setColor(cat.color || COLOR_PALETTE[0]);
    setCustomHex('');
    setEditError('');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bs-cat-card editing" style={{ borderColor: cat.color + '66' }}>
        {editError && <p className="bs-error">{editError}</p>}
        <input
          className="bs-inp"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Category name"
          autoFocus
        />
        <input
          className="bs-inp"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Description"
        />
        <div className="bs-color-row">
          <div className="bs-color-swatches">
            {COLOR_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                className={`bs-swatch${color === c && !customHex.trim() ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => { setColor(c); setCustomHex(''); }}
                aria-label={`Select ${c}`}
              />
            ))}
          </div>
          <input
            className="bs-inp bs-inp-hex"
            placeholder="#rrggbb"
            value={customHex}
            onChange={e => setCustomHex(e.target.value)}
            maxLength={7}
          />
        </div>
        <div className="bs-cat-edit-btns">
          <button className="bs-btn bs-btn-accent" onClick={saveEdits}>Save</button>
          <button className="bs-btn bs-btn-ghost" onClick={cancelEdits}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-cat-card" style={{ borderColor: (cat.color || '#a78bfa') + '40' }}>
      <div className="bs-cat-top">
        <span className="bs-cat-swatch" style={{ background: cat.color || '#a78bfa' }} aria-hidden="true" />
        <span className="bs-cat-name">{cat.name || 'Untitled'}</span>
        <span
          className="bs-cat-count"
          style={{
            background: (cat.color || '#a78bfa') + '1f',
            borderColor: (cat.color || '#a78bfa') + '55',
            color: cat.color || '#a78bfa',
          }}
        >
          {postCount} post{postCount !== 1 ? 's' : ''}
        </span>
      </div>
      {cat.description && <div className="bs-cat-desc">{cat.description}</div>}

      {/* Posts linked to this category (matched by p.category === cat.name).
          Empty state shown when no posts are linked. */}
      <div className="bs-cat-posts">
        {linkedPosts.length === 0 ? (
          <div className="bs-cat-posts-empty">
            No posts in this category yet.
          </div>
        ) : (
          <ul className="bs-cat-posts-list">
            {linkedPosts.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className="bs-cat-post-link"
                  onClick={() => onOpenPost?.(p.id)}
                  title="Open in Posts Library"
                >
                  <span className="bs-cat-post-title">
                    {p.title || '(Untitled post)'}
                  </span>
                  {p.status && (
                    <span className={`bs-cat-post-status s-${p.status}`}>
                      {p.status}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bs-cat-actions">
        <button className="bs-btn bs-btn-ghost bs-btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <button
          className={`bs-btn bs-btn-sm${armedDelete ? ' bs-btn-danger-armed' : ' bs-btn-danger'}`}
          onClick={onDelete}
        >
          {armedDelete ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Post Picker Modal (for Series)
   ═════════════════════════════════════════════════════════════ */
function PostPicker({ allPosts, excludeIds, onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPosts.filter(p => {
      if (exclude.has(p.id)) return false;
      if (!q) return true;
      return (p.title || '').toLowerCase().includes(q);
    });
  }, [allPosts, exclude, query]);

  return (
    <div className="bs-picker-overlay" onClick={onClose}>
      <div className="bs-picker" onClick={e => e.stopPropagation()}>
        <div className="bs-picker-head">
          <span>Add Posts to Series</span>
          <button className="bs-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="bs-picker-search-wrap">
          <input
            className="bs-picker-search"
            placeholder="Search posts by title…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="bs-picker-list">
          {filtered.length === 0 && (
            <div className="bs-picker-empty bs-muted">
              {allPosts.length === 0
                ? 'No blog posts yet. Create posts on the Blog Posts page first.'
                : query
                  ? 'No posts match your search.'
                  : 'All posts are already in this series.'}
            </div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              className="bs-picker-post"
              onClick={() => onAdd(p.id)}
              title="Add to series"
            >
              <div className="bs-picker-post-info">
                <span className="bs-picker-post-title">{p.title || 'Untitled'}</span>
                {p.author && <span className="bs-picker-post-author">{p.author}</span>}
              </div>
              {p.status && <span className="bs-picker-post-status">{p.status}</span>}
            </button>
          ))}
        </div>
        <div className="bs-picker-foot">
          <button className="bs-btn bs-btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Series Sidebar Row
   ═════════════════════════════════════════════════════════════ */
function SeriesRow({ series, active, postCount, onClick }) {
  const status = series.status || 'active';
  const range = (series.startDate || series.endDate)
    ? `${formatDate(series.startDate) || '…'} – ${formatDate(series.endDate) || '…'}`
    : '';
  return (
    <button className={`bs-series-row${active ? ' on' : ''}`} onClick={onClick}>
      <div className="bs-series-row-top">
        <span className="bs-series-row-name">{series.name || 'Untitled'}</span>
        <span className={`bs-status-pill bs-status-${status}`}>{STATUS_LABELS[status] || status}</span>
      </div>
      <div className="bs-series-row-meta">
        <span className="bs-series-row-count">{postCount} post{postCount !== 1 ? 's' : ''}</span>
        {range && <span className="bs-series-row-range">{range}</span>}
      </div>
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════
   Series Post (draggable)
   ═════════════════════════════════════════════════════════════ */
function SeriesPostRow({
  post, index, dragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onRemove, onOpen,
}) {
  return (
    <div
      className={`bs-series-post${dragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <span className="bs-series-post-handle" title="Drag to reorder">⠿</span>
      <span className="bs-series-post-num">{index + 1}</span>
      <button className="bs-series-post-info" onClick={onOpen} title="Open in Blog Posts">
        <span className="bs-series-post-title">{post.title || 'Untitled'}</span>
        {post.author && <span className="bs-series-post-author">{post.author}</span>}
      </button>
      {post.status && <span className="bs-series-post-status">{post.status}</span>}
      <button
        className="bs-series-post-remove"
        onClick={onRemove}
        title="Remove from series"
      >
        ✕
      </button>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Main Component
   ═════════════════════════════════════════════════════════════ */
export default function BlogSeries() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── Tab state ────────────────────────────────────────────── */
  const [tab, setTab] = useState('categories'); // 'categories' | 'series'

  /* ── Posts / Categories / Series — all Firestore-backed and
        synced in real-time via onSnapshot in the hook. ─────────── */
  const [posts]                     = useUserStoreKey(KEY_POSTS,      []);
  const [categories, setCategories] = useUserStoreKey(KEY_CATEGORIES, []);
  const [seriesList, setSeriesList] = useUserStoreKey(KEY_SERIES,     []);

  /* ── Categories UI state ──────────────────────────────────── */
  const [showNewCat, setShowNewCat] = useState(false);
  const [armedDeleteCatId, setArmedDeleteCatId] = useState(null);
  const armCatTimerRef = useRef(null);

  useEffect(() => {
    if (!armedDeleteCatId) return;
    if (armCatTimerRef.current) clearTimeout(armCatTimerRef.current);
    armCatTimerRef.current = setTimeout(() => setArmedDeleteCatId(null), 3000);
    return () => { if (armCatTimerRef.current) clearTimeout(armCatTimerRef.current); };
  }, [armedDeleteCatId]);

  /* ── Series UI state ──────────────────────────────────────── */
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [showNewSeries, setShowNewSeries] = useState(false);
  const [seriesStatusFilter, setSeriesStatusFilter] = useState('all');
  const [armedDeleteSeries, setArmedDeleteSeries] = useState(false);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const armSeriesTimerRef = useRef(null);

  // new-series form fields
  const [newSeriesName, setNewSeriesName] = useState('');

  /* Deep-link: ?series=<seriesId> selects the series and switches to the
     Series tab (e.g. from Calendar's "Open" button on a series start/end
     event). The param is cleared after consumption. */
  useEffect(() => {
    const id = searchParams.get('series');
    if (!id) return;
    const exists = seriesList.some(s => s.id === id);
    if (!exists) return;
    setTab('series');
    setSelectedSeriesId(id);
    setSeriesStatusFilter('all');
    const next = new URLSearchParams(searchParams);
    next.delete('series');
    setSearchParams(next, { replace: true });
  }, [searchParams, seriesList, setSearchParams]);

  useEffect(() => {
    if (!armedDeleteSeries) return;
    if (armSeriesTimerRef.current) clearTimeout(armSeriesTimerRef.current);
    armSeriesTimerRef.current = setTimeout(() => setArmedDeleteSeries(false), 3000);
    return () => { if (armSeriesTimerRef.current) clearTimeout(armSeriesTimerRef.current); };
  }, [armedDeleteSeries]);

  useEffect(() => {
    setArmedDeleteSeries(false);
    setShowPostPicker(false);
  }, [selectedSeriesId]);

  /* ── Drag state for series posts ──────────────────────────── */
  const dragIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  /* ── Derived ──────────────────────────────────────────────── */
  const postsById = useMemo(() => {
    const m = new Map();
    for (const p of posts) m.set(p.id, p);
    return m;
  }, [posts]);

  /* Posts ↔ categories are linked by category NAME — Posts Library stores
     the human-readable category name on each post (p.category), not an id.
     We also keep the legacy id-based lookup as a fallback for any old data. */
  const postsByCategoryName = useMemo(() => {
    const map = new Map();
    for (const p of posts) {
      const name = (p?.category || '').trim();
      if (!name) continue;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(p);
    }
    return map;
  }, [posts]);

  const postCountByCategoryId = useMemo(() => {
    // Legacy id-based count: only used to surface posts written by old code
    // paths that may have stored categoryIds[] / categoryId on the post.
    const counts = new Map();
    for (const p of posts) {
      const ids = Array.isArray(p.categoryIds)
        ? p.categoryIds
        : (p.categoryId ? [p.categoryId] : []);
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [posts]);

  const selectedSeries = useMemo(
    () => seriesList.find(s => s.id === selectedSeriesId) || null,
    [seriesList, selectedSeriesId]
  );

  const seriesResolvedPosts = useMemo(() => {
    if (!selectedSeries) return [];
    return (selectedSeries.postIds || [])
      .map(id => postsById.get(id))
      .filter(Boolean);
  }, [selectedSeries, postsById]);

  const filteredSeries = useMemo(() => {
    if (seriesStatusFilter === 'all') return seriesList;
    return seriesList.filter(s => (s.status || 'active') === seriesStatusFilter);
  }, [seriesList, seriesStatusFilter]);

  /* ── Category mutators ────────────────────────────────────── */
  const handleCreateCategory = useCallback((data) => {
    const now = Date.now();
    const c = {
      id: makeId('c'),
      name: data.name,
      color: data.color,
      description: data.description,
      createdAt: now,
      updatedAt: now,
    };
    setCategories(prev => [...prev, c]);
    setShowNewCat(false);
  }, []);

  const handleUpdateCategory = useCallback((id, patch) => {
    setCategories(prev => prev.map(c => (
      c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c
    )));
  }, []);

  const handleDeleteCategory = useCallback((id) => {
    if (armedDeleteCatId !== id) {
      setArmedDeleteCatId(id);
      return;
    }
    setCategories(prev => prev.filter(c => c.id !== id));
    setArmedDeleteCatId(null);
  }, [armedDeleteCatId]);

  /* ── Series mutators ──────────────────────────────────────── */
  const handleCreateSeries = useCallback((e) => {
    e?.preventDefault?.();
    const name = newSeriesName.trim();
    if (!name) return;
    const now = Date.now();
    const s = {
      id: makeId('s'),
      name,
      description: '',
      status: 'active',
      postIds: [],
      startDate: '',
      endDate: '',
      addStartToCalendar: false,
      addEndToCalendar:   false,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    setSeriesList(prev => [...prev, s]);
    setNewSeriesName('');
    setShowNewSeries(false);
    setSelectedSeriesId(s.id);
  }, [newSeriesName]);

  const updateSelectedSeries = useCallback((patch) => {
    if (!selectedSeriesId) return;
    setSeriesList(prev => prev.map(s => (
      s.id === selectedSeriesId ? { ...s, ...patch, updatedAt: Date.now() } : s
    )));
  }, [selectedSeriesId]);

  const handleDeleteSeries = useCallback(() => {
    if (!selectedSeries) return;
    if (!armedDeleteSeries) { setArmedDeleteSeries(true); return; }
    setSeriesList(prev => prev.filter(s => s.id !== selectedSeries.id));
    setSelectedSeriesId(null);
    setArmedDeleteSeries(false);
  }, [selectedSeries, armedDeleteSeries]);

  const handleAddPostToSeries = useCallback((postId) => {
    if (!selectedSeriesId) return;
    setSeriesList(prev => prev.map(s => {
      if (s.id !== selectedSeriesId) return s;
      const ids = s.postIds || [];
      if (ids.includes(postId)) return s;
      return { ...s, postIds: [...ids, postId], updatedAt: Date.now() };
    }));
  }, [selectedSeriesId]);

  const handleRemovePostFromSeries = useCallback((postId) => {
    if (!selectedSeriesId) return;
    setSeriesList(prev => prev.map(s => {
      if (s.id !== selectedSeriesId) return s;
      return { ...s, postIds: (s.postIds || []).filter(id => id !== postId), updatedAt: Date.now() };
    }));
  }, [selectedSeriesId]);

  /* ── Drag handlers ────────────────────────────────────────── */
  const handleDragStart = useCallback((e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    setDragOver(null);
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    if (fromIndex == null || fromIndex === dropIndex || !selectedSeries) return;

    const currentIds = selectedSeries.postIds || [];
    const reordered = [...currentIds];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    updateSelectedSeries({ postIds: reordered });
  }, [selectedSeries, updateSelectedSeries]);

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    setDragOver(null);
  }, []);

  /* ── Sub-counts for sidebar filter pills ──────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { all: seriesList.length, active: 0, completed: 0, archived: 0 };
    for (const s of seriesList) {
      const st = s.status || 'active';
      if (counts[st] != null) counts[st]++;
    }
    return counts;
  }, [seriesList]);

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <BlogShell title="Categories & Series" icon="🏷" subtitle="How posts are organized — categories, tags, and multi-part series." fullBleed>
    <div className="bs-root">
      <main className="bs-main">
        {/* ── Page header + tabs ── */}
        <section className="bs-header">
          <div className="bs-header-titles">
            <h1 className="bs-title">Categories & Series</h1>
            <p className="bs-subtitle">
              Organize blog posts with categories and group related posts into themed series.
            </p>
          </div>

          <div className="bs-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'categories'}
              className={`bs-tab${tab === 'categories' ? ' on' : ''}`}
              onClick={() => setTab('categories')}
            >
              <span>Categories</span>
              <span className="bs-tab-count">{categories.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'series'}
              className={`bs-tab${tab === 'series' ? ' on' : ''}`}
              onClick={() => setTab('series')}
            >
              <span>Series</span>
              <span className="bs-tab-count">{seriesList.length}</span>
            </button>
            <div
              className="bs-tab-indicator"
              style={{ transform: `translateX(${tab === 'categories' ? '0' : '100%'})` }}
              aria-hidden="true"
            />
          </div>
        </section>

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <section className="bs-section bs-cats-section">
            <div className="bs-section-bar">
              <div className="bs-section-meta">
                <span className="bs-section-label">Blog Categories</span>
                <span className="bs-muted">
                  {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              {!showNewCat && (
                <button
                  className="bs-btn bs-btn-accent"
                  onClick={() => setShowNewCat(true)}
                >
                  + New Category
                </button>
              )}
            </div>

            {showNewCat && (
              <NewCategoryForm
                onSave={handleCreateCategory}
                onCancel={() => setShowNewCat(false)}
              />
            )}

            {categories.length === 0 && !showNewCat && (
              <div className="bs-empty">
                <div className="bs-empty-icon" aria-hidden="true">🏷</div>
                <div className="bs-empty-title">No categories yet</div>
                <div className="bs-empty-sub">
                  Create your first category to start organizing blog posts by topic.
                </div>
                <button
                  className="bs-btn bs-btn-accent bs-empty-cta"
                  onClick={() => setShowNewCat(true)}
                >
                  + New Category
                </button>
              </div>
            )}

            {categories.length > 0 && (
              <div className="bs-cat-grid">
                {categories.map(cat => {
                  const linked = postsByCategoryName.get(cat.name) || [];
                  const legacyCount = postCountByCategoryId.get(cat.id) || 0;
                  return (
                    <CategoryCard
                      key={cat.id}
                      cat={cat}
                      linkedPosts={linked}
                      postCount={linked.length || legacyCount}
                      onOpenPost={(postId) => navigate('/blog-posts?id=' + postId)}
                      onUpdate={(patch) => handleUpdateCategory(cat.id, patch)}
                      onDelete={() => handleDeleteCategory(cat.id)}
                      armedDelete={armedDeleteCatId === cat.id}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Series tab ── */}
        {tab === 'series' && (
          <section className="bs-section bs-series-section">
            <div className="bs-series-pane">
              {/* Sidebar */}
              <aside className="bs-series-sidebar">
                <div className="bs-series-sidebar-head">
                  <span className="bs-section-label">Series</span>
                  {!showNewSeries && (
                    <button
                      className="bs-btn bs-btn-accent bs-btn-sm"
                      onClick={() => setShowNewSeries(true)}
                    >
                      + New
                    </button>
                  )}
                </div>

                {showNewSeries && (
                  <form className="bs-new-form bs-new-form-compact" onSubmit={handleCreateSeries}>
                    <input
                      className="bs-inp"
                      placeholder="Series name"
                      value={newSeriesName}
                      onChange={e => setNewSeriesName(e.target.value)}
                      autoFocus
                    />
                    <div className="bs-new-form-btns">
                      <button type="submit" className="bs-btn bs-btn-accent">Create</button>
                      <button
                        type="button"
                        className="bs-btn bs-btn-ghost"
                        onClick={() => { setShowNewSeries(false); setNewSeriesName(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <div className="bs-filter-pills">
                  {['all', 'active', 'completed', 'archived'].map(f => (
                    <button
                      key={f}
                      className={`bs-filter-pill${seriesStatusFilter === f ? ' on' : ''}${f !== 'all' ? ` bs-filter-${f}` : ''}`}
                      onClick={() => setSeriesStatusFilter(f)}
                    >
                      {f === 'all' ? 'All' : STATUS_LABELS[f]}
                      <span className="bs-filter-pill-count">{statusCounts[f]}</span>
                    </button>
                  ))}
                </div>

                <div className="bs-series-list">
                  {filteredSeries.length === 0 && (
                    <p className="bs-muted bs-series-list-empty">
                      {seriesList.length === 0
                        ? 'No series yet.'
                        : 'No series match this filter.'}
                    </p>
                  )}
                  {filteredSeries.map(s => {
                    const count = (s.postIds || [])
                      .reduce((acc, id) => acc + (postsById.has(id) ? 1 : 0), 0);
                    return (
                      <SeriesRow
                        key={s.id}
                        series={s}
                        postCount={count}
                        active={selectedSeriesId === s.id}
                        onClick={() => setSelectedSeriesId(s.id)}
                      />
                    );
                  })}
                </div>
              </aside>

              {/* Series detail */}
              <div className="bs-series-detail">
                {!selectedSeries && (
                  <div className="bs-empty">
                    <div className="bs-empty-icon" aria-hidden="true">📚</div>
                    <div className="bs-empty-title">No series selected</div>
                    <div className="bs-empty-sub">
                      Pick a series from the sidebar to view and manage its posts, or create a new one.
                    </div>
                  </div>
                )}

                {selectedSeries && (
                  <div className="bs-series-detail-body">
                    {/* Header */}
                    <div className="bs-series-detail-head">
                      <div className="bs-series-detail-head-left">
                        <input
                          className="bs-name-inp"
                          placeholder="Series name"
                          value={selectedSeries.name || ''}
                          onChange={e => updateSelectedSeries({ name: e.target.value })}
                        />
                        <input
                          className="bs-desc-inp"
                          placeholder="Add a description…"
                          value={selectedSeries.description || ''}
                          onChange={e => updateSelectedSeries({ description: e.target.value })}
                        />
                        <div className="bs-series-detail-meta">
                          <span className="bs-chip bs-chip-count">
                            {seriesResolvedPosts.length} post{seriesResolvedPosts.length !== 1 ? 's' : ''}
                          </span>
                          <div className="bs-status-flip">
                            {['active', 'completed', 'archived'].map(st => (
                              <button
                                key={st}
                                className={`bs-status-pill bs-status-${st}${(selectedSeries.status || 'active') === st ? ' on' : ''}`}
                                onClick={() => updateSelectedSeries({ status: st })}
                                title={`Set status to ${STATUS_LABELS[st]}`}
                              >
                                {STATUS_LABELS[st]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="bs-series-detail-actions">
                        <button
                          className={`bs-btn${armedDeleteSeries ? ' bs-btn-danger-armed' : ' bs-btn-danger'}`}
                          onClick={handleDeleteSeries}
                          onBlur={() => setArmedDeleteSeries(false)}
                        >
                          {armedDeleteSeries ? 'Confirm Delete' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {/* Dates + Notes */}
                    <div className="bs-series-fields">
                      <div className="bs-field-row">
                        <div className="bs-field">
                          <span className="bs-field-label">Start date</span>
                          <input
                            type="date"
                            className="bs-inp"
                            value={selectedSeries.startDate || ''}
                            onChange={e => updateSelectedSeries({ startDate: e.target.value })}
                          />
                          {/* Disabled until a Start date is picked — empty
                              dates can't be placed on the calendar. */}
                          <label className="bs-cal-toggle">
                            <input
                              type="checkbox"
                              checked={!!selectedSeries.addStartToCalendar}
                              disabled={!selectedSeries.startDate}
                              onChange={e => updateSelectedSeries({ addStartToCalendar: e.target.checked })}
                            />
                            <span className="bs-cal-toggle-text">
                              📅 Add to Calendar
                              {!selectedSeries.startDate && (
                                <span className="bs-cal-toggle-hint"> · pick a date first</span>
                              )}
                            </span>
                          </label>
                        </div>
                        <div className="bs-field">
                          <span className="bs-field-label">End date</span>
                          <input
                            type="date"
                            className="bs-inp"
                            value={selectedSeries.endDate || ''}
                            onChange={e => updateSelectedSeries({ endDate: e.target.value })}
                          />
                          <label className="bs-cal-toggle">
                            <input
                              type="checkbox"
                              checked={!!selectedSeries.addEndToCalendar}
                              disabled={!selectedSeries.endDate}
                              onChange={e => updateSelectedSeries({ addEndToCalendar: e.target.checked })}
                            />
                            <span className="bs-cal-toggle-text">
                              📅 Add to Calendar
                              {!selectedSeries.endDate && (
                                <span className="bs-cal-toggle-hint"> · pick a date first</span>
                              )}
                            </span>
                          </label>
                        </div>
                      </div>
                      <label className="bs-field bs-field-full">
                        <span className="bs-field-label">Notes</span>
                        <textarea
                          className="bs-textarea"
                          placeholder="Internal notes about this series…"
                          rows={3}
                          value={selectedSeries.notes || ''}
                          onChange={e => updateSelectedSeries({ notes: e.target.value })}
                        />
                      </label>
                    </div>

                    {/* Post manager */}
                    <div className="bs-series-posts">
                      <div className="bs-series-posts-head">
                        <span className="bs-section-label">Posts in this series</span>
                        <button
                          className="bs-btn bs-btn-accent bs-btn-sm"
                          onClick={() => setShowPostPicker(true)}
                          disabled={posts.length === 0}
                          title={posts.length === 0 ? 'No blog posts available' : 'Add posts'}
                        >
                          + Add Post
                        </button>
                      </div>

                      {seriesResolvedPosts.length === 0 && (
                        <div className="bs-series-posts-empty">
                          <div className="bs-empty-icon-sm" aria-hidden="true">📝</div>
                          <div className="bs-muted">
                            {posts.length === 0
                              ? 'No blog posts exist yet. Create some on the Blog Posts page first.'
                              : 'No posts in this series yet. Click "+ Add Post" to start.'}
                          </div>
                        </div>
                      )}

                      {seriesResolvedPosts.length > 0 && (
                        <div className="bs-series-posts-list">
                          {seriesResolvedPosts.map((post, idx) => (
                            <SeriesPostRow
                              key={post.id}
                              post={post}
                              index={idx}
                              dragOver={dragOver === idx}
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDrop={handleDrop}
                              onDragEnd={handleDragEnd}
                              onRemove={() => handleRemovePostFromSeries(post.id)}
                              onOpen={() => navigate('/blog-posts?id=' + post.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Post picker modal */}
      {showPostPicker && selectedSeries && (
        <PostPicker
          allPosts={posts}
          excludeIds={selectedSeries.postIds || []}
          onAdd={handleAddPostToSeries}
          onClose={() => setShowPostPicker(false)}
        />
      )}
    </div>
    </BlogShell>
  );
}
