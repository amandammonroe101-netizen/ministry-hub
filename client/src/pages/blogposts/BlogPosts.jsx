import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import { canDetach } from '../../lib/detached';
import './BlogPosts.css';

/* ─────────────────────────────────────────────────────────────
   Posts Library — church blog post CMS

   Full-width browsing view: stats + search/filter/sort across the
   top, then every post as a card in a wrapping grid. Selecting a
   post (or creating a new one) never edits inline here anymore —
   it opens the dedicated editor (see BlogPostEditor.jsx) in its
   own pop-out window when running in Electron, or navigates to it
   in the same window otherwise (browser/dev preview).

   Naming: .bp-*
   Persistence: Firestore-synced localStorage-style key "blog:posts"
   Accent: var(--blg-accent, #4b5d3a) — Blog Ministry cream/sage theme.
   ───────────────────────────────────────────────────────────── */

const STATUSES = [
  { key: 'draft',     label: 'Draft',     color: 'rgba(255, 255, 255, 0.35)' },
  { key: 'scheduled', label: 'Scheduled', color: '#60a5fa' },
  { key: 'published', label: 'Published', color: '#34d399' },
  { key: 'archived',  label: 'Archived',  color: 'rgba(255, 255, 255, 0.22)' },
];

const STATUS_BY_KEY = STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

/* "Published" is intentionally omitted — clicking the Published status
   auto-archives the post (see BlogPostEditor's handleQuickStatus), so it
   doesn't make sense to filter on a status that no post ever rests in. */
const FILTER_PILLS = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'archived',  label: 'Archived' },
];

const SORT_OPTIONS = [
  { key: 'updated',     label: 'Recently updated' },
  { key: 'publishDate', label: 'Publish date' },
  { key: 'title',       label: 'Title A–Z' },
];

/* ─── Utility ──────────────────────────────────────────────── */
function makeId() {
  return 'bp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptyPost(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    title: '',
    subtitle: '',
    slug: '',
    status: 'draft',
    author: '',
    publishDate: '',
    excerpt: '',
    body: '',
    category: 'Sermons & Teaching',
    tags: [],
    featuredImageDataUrl: '',
    url: '',
    seoTitle: '',
    seoDescription: '',
    performanceNotes: '',
    notes: '',
    slugManuallyEdited: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* ─── Post card ────────────────────────────────────────────── */
function PostRow({ post, onClick, onDelete }) {
  const statusInfo = STATUS_BY_KEY[post.status] || STATUS_BY_KEY.draft;

  const handleDelete = (e) => {
    e.stopPropagation();
    const label = post.title || 'this post';
    if (window.confirm(`Delete "${label}"? This can't be undone.`)) {
      onDelete(post.id);
    }
  };

  return (
    <div
      className="bp-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <button
        type="button"
        className="bp-card-delete"
        onClick={handleDelete}
        title="Delete post"
        aria-label="Delete post"
      >
        ✕
      </button>
      <div className="bp-card-top">
        {post.featuredImageDataUrl ? (
          <img
            className="bp-card-thumb"
            src={post.featuredImageDataUrl}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <span className="bp-card-thumb bp-card-thumb-empty" aria-hidden="true">
            📰
          </span>
        )}
        <span className="bp-card-name">{post.title || 'Untitled post'}</span>
        <span
          className={`bp-card-status s-${post.status}`}
          title={statusInfo.label}
        >
          <span
            className="bp-status-dot"
            style={{ background: statusInfo.color }}
          />
          {statusInfo.label}
        </span>
      </div>
      <div className="bp-card-meta">
        {post.category && (
          <span className="bp-card-chip" title={`Category: ${post.category}`}>
            {post.category}
          </span>
        )}
        {post.author && (
          <span className="bp-card-meta-item" title={`Author: ${post.author}`}>
            👤 {post.author}
          </span>
        )}
        {post.publishDate && (post.status === 'scheduled' || post.status === 'published') && (
          <span className="bp-card-meta-item" title="Publish date">
            📅 {formatDateLong(post.publishDate)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function BlogPosts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  /* Posts live in Firestore at /users/{uid}/kv/blog:posts.
     The hook handles load/save + real-time sync across this user's devices. */
  const [posts, setPosts]         = useUserStoreKey('blog:posts', []);
  const [query, setQuery]         = useState('');
  const [filter, setFilter]       = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sortBy, setSortBy]       = useState('updated');

  /* Category list sourced from the Categories & Series page (same Firestore
     doc — when they edit it there, the change streams to us via onSnapshot). */
  const [categoryList] = useUserStoreKey('blog:categories', []);
  const categoryNames = useMemo(
    () => (categoryList || [])
      .map(c => (c && typeof c === 'object' ? c.name : c))
      .filter(name => typeof name === 'string' && name.trim().length > 0),
    [categoryList]
  );

  /* ─── Open a post in the dedicated editor ───────────────────
     Pop-out window in Electron; same-window navigate everywhere
     else (browser tab, dev preview). */
  const openEditor = useCallback((id) => {
    const path = `/blog-post-editor?id=${encodeURIComponent(id)}`;
    if (canDetach()) {
      window.electronAPI?.openDetached?.(path);
    } else {
      navigate(path);
    }
  }, [navigate]);

  const handleCreateNew = useCallback(() => {
    const post = emptyPost();
    setPosts(prev => [post, ...prev]);
    openEditor(post.id);
  }, [setPosts, openEditor]);

  const handleDeletePost = useCallback((id) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  }, [setPosts]);

  /* Deep-link: ?id=<postId> opens that post in the editor (e.g. when
     arriving from Calendar's "Open" button, Blog Authors, Blog Series,
     Blog Comments, Blog Performance, or Blog Newsletters). We clear the
     param after consuming it so the URL stays tidy. */
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    const exists = posts.some(p => p.id === id);
    if (!exists) return;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
    openEditor(id);
  }, [searchParams, posts, setSearchParams, openEditor]);

  /* ─── Status counts ──────────────────────────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { all: posts.length, draft: 0, scheduled: 0, published: 0, archived: 0 };
    for (const p of posts) {
      if (counts[p.status] !== undefined) counts[p.status]++;
    }
    return counts;
  }, [posts]);

  /* ─── Stats card values ──────────────────────────────────── */
  const stats = useMemo(() => ({
    total:     posts.length,
    drafts:    statusCounts.draft,
    published: statusCounts.published,
    scheduled: statusCounts.scheduled,
  }), [posts.length, statusCounts]);

  /* ─── Filtered + sorted ──────────────────────────────────── */
  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter(p => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (catFilter !== 'all' && p.category !== catFilter) return false;
      if (!q) return true;
      const hay = [
        p.title, p.body, p.author,
        ...(Array.isArray(p.tags) ? p.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    list = list.slice().sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'publishDate') {
        const ad = a.publishDate || '';
        const bd = b.publishDate || '';
        if (ad && bd) return bd.localeCompare(ad);     // newest first
        if (ad) return -1;
        if (bd) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      // 'updated' default
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return list;
  }, [posts, query, filter, catFilter, sortBy]);

  return (
    <BlogShell
      title="Posts Library"
      icon="📰"
      subtitle="Every blog post — drafts, scheduled, and published — with status and author at a glance."
      fullBleed
      headActions={
        <button type="button" className="bp-head-new-btn" onClick={handleCreateNew}>
          + Create New Post
        </button>
      }
    >
      <div className="bp-root bp-root-flat">
        <div className="bp-toolbar">
          <div className="bp-stats">
            <div className="bp-stat">
              <span className="bp-stat-num">{stats.total}</span>
              <span className="bp-stat-lbl">Total</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-num">{stats.drafts}</span>
              <span className="bp-stat-lbl">Drafts</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-num">{stats.published}</span>
              <span className="bp-stat-lbl">Published</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-num">{stats.scheduled}</span>
              <span className="bp-stat-lbl">Scheduled</span>
            </div>
          </div>

          <div className="bp-controls">
            <input
              className="bp-inp"
              placeholder="Search title, body, author, tag…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="bp-pills">
              {FILTER_PILLS.map(p => (
                <button
                  key={p.key}
                  className={`bp-pill${filter === p.key ? ' on' : ''}`}
                  onClick={() => setFilter(p.key)}
                  title={p.label}
                >
                  <span className="bp-pill-label">{p.label}</span>
                  <span className="bp-pill-count">{statusCounts[p.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <select
              className="bp-inp"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categoryNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="bp-inp"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              title="Sort posts"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>Sort: {o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bp-browse">
          {posts.length === 0 && (
            <div className="bp-empty">
              <img
                className="bp-empty-illustration"
                src="/blog-posts-empty.webp"
                alt=""
                aria-hidden="true"
              />
              <div className="bp-empty-title-script">No posts yet…</div>
              <p className="bp-empty-sub">
                You haven't created any blog posts yet. When you're ready,
                click the button above to write your first one!
              </p>
              <div className="bp-empty-divider">
                <span aria-hidden="true">🌿</span>
                Real stories. Lasting impact. ♡
              </div>
            </div>
          )}

          {posts.length > 0 && filteredPosts.length === 0 && (
            <p className="bp-muted bp-list-empty">No matches.</p>
          )}

          {filteredPosts.length > 0 && (
            <div className="bp-grid">
              {filteredPosts.map(p => (
                <PostRow
                  key={p.id}
                  post={p}
                  onClick={() => openEditor(p.id)}
                  onDelete={handleDeletePost}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </BlogShell>
  );
}
