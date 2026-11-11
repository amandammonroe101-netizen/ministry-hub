import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import { useUserStoreKey } from '../../lib/userStore';
import { deleteBlobAtPath } from '../../lib/userStorage';
import { formatBytes } from '../../utils/formatBytes';
import './PodcastRecordings.css';

/* ─────────────────────────────────────────────────────────────
   Podcast Recordings — library of video takes
   Namespace: .pr-*
   Accent: var(--accent-amber, #fbbf24)
   Metadata: Firestore /users/{uid}/kv/podcast:recordings
   Video blobs: Firebase Storage /users/{uid}/recordings/<id>.<ext>
   Each recording carries videoUrl (for <video src>) + storagePath (for delete).
   ───────────────────────────────────────────────────────────── */

const LS_KEY    = 'podcast:recordings';
const POSTS_KEY = 'blog:posts';

/* ─── Helpers ────────────────────────────────────────────────── */
function loadRecordings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveRecordings(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err && (err.name === 'QuotaExceededError' ||
              err.code === 22 ||
              err.code === 1014 ||
              /quota/i.test(err.message || ''));
    return { ok: false, isQuota };
  }
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1)    return 'Just now';
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function normalizeTag(t) {
  return (t || '').trim().replace(/\s+/g, ' ');
}
function mergeTags(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(t => t.toLowerCase()));
  for (const raw of incoming) {
    const t = normalizeTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function extFromMime(mimeType = '') {
  if (/mp4/i.test(mimeType))   return 'mp4';
  if (/webm/i.test(mimeType))  return 'webm';
  if (/quicktime|mov/i.test(mimeType)) return 'mov';
  if (/x-matroska|mkv/i.test(mimeType)) return 'mkv';
  return 'webm';
}

function isThisWeek(iso) {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return false;
  return (Date.now() - d) <= 7 * 24 * 60 * 60 * 1000;
}
function isThisMonth(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

/* ─── Toast ──────────────────────────────────────────────────── */
function Toast({ message, onClose, kind = 'info' }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className={`pr-toast pr-toast-${kind}`} role="status">
      <span>{message}</span>
      <button className="pr-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Collapsible section ────────────────────────────────────── */
function Section({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pr-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="pr-section-head"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="pr-section-caret" aria-hidden="true">▸</span>
        {icon && <span className="pr-section-icon" aria-hidden="true">{icon}</span>}
        <span className="pr-section-title">{title}</span>
      </button>
      {open && <div className="pr-section-body">{children}</div>}
    </div>
  );
}

/* ─── Tag chip input ─────────────────────────────────────────── */
function TagInput({ tags, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(tags) ? tags : [];

  function commit(raw) {
    if (!raw) return;
    const parts = raw.split(',').map(normalizeTag).filter(Boolean);
    if (parts.length === 0) return;
    const next = mergeTags(list, parts);
    if (next.length !== list.length) onChange(next);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
    else if (e.key === 'Backspace' && draft === '' && list.length > 0) {
      e.preventDefault();
      onChange(list.slice(0, -1));
    } else if (e.key === ',') { e.preventDefault(); commit(draft); }
  }

  function handleChange(e) {
    const v = e.target.value;
    if (v.includes(',')) { commit(v); return; }
    setDraft(v);
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
  }

  function removeAt(i) {
    const next = list.slice();
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="pr-tag-input">
      {list.map((tag, i) => (
        <span className="pr-tag-chip" key={`${tag}-${i}`}>
          <span className="pr-tag-chip-lbl">{tag}</span>
          <button
            type="button"
            className="pr-tag-chip-x"
            onClick={() => removeAt(i)}
            aria-label={`Remove tag ${tag}`}
            tabIndex={-1}
          >✕</button>
        </span>
      ))}
      <input
        className="pr-tag-input-inp"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={list.length === 0 ? 'Add tags (Enter or comma to add)…' : 'Add tag…'}
      />
    </div>
  );
}

/* ─── Episode link picker (inline autocomplete) ──────────────── */
function EpisodePicker({ posts, currentId, currentTitle, onPick, onClear }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts.slice(0, 8);
    return posts
      .filter(p => (p.title || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [posts, query]);

  return (
    <div className="pr-episode-picker">
      <div className="pr-episode-row">
        <input
          className="pr-inp"
          placeholder={currentId ? (currentTitle || 'Linked episode') : 'Search posts to link…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {currentId && (
          <button
            type="button"
            className="pr-btn pr-btn-ghost pr-btn-sm"
            onClick={onClear}
            title="Unlink episode"
          >Unlink</button>
        )}
      </div>
      {open && matches.length > 0 && (
        <div className="pr-episode-list">
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className={`pr-episode-opt${currentId === p.id ? ' on' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(p); setQuery(''); setOpen(false); }}
            >
              <span className="pr-episode-opt-title">{p.title || 'Untitled post'}</span>
              {p.publishedAt && (
                <span className="pr-episode-opt-meta">
                  {new Date(p.publishedAt).toLocaleDateString()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && posts.length === 0 && (
        <div className="pr-episode-empty pr-muted">
          No posts found in <code>blog:posts</code>. Create posts first to link episodes.
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function PodcastRecordings() {
  const navigate = useNavigate();

  /* Firestore-backed metadata. Videos are in Firebase Storage and the
     metadata carries `videoUrl` (for playback) + `storagePath` (for delete). */
  const [recordings, setRecordings] = useUserStoreKey('podcast:recordings', []);
  const [posts]                     = useUserStoreKey('blog:posts',         []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all'); // all | week | month | linked
  const [sort, setSort]             = useState('recent'); // recent | title | size | duration
  const [armedDelete, setArmedDelete] = useState(false);
  const [toast, setToast]           = useState('');
  const [toastKind, setToastKind]   = useState('info');

  /* No more IDB object URL lifecycle: the Firebase download URL is stable,
     so we just bind it directly to <video src>. */

  /* ── Reset armed-delete when selection changes ─────────────── */
  useEffect(() => {
    setArmedDelete(false);
  }, [selectedId]);

  /* ── Derived ───────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = recordings.filter(r => {
      if (filter === 'week'   && !isThisWeek(r.createdAt))  return false;
      if (filter === 'month'  && !isThisMonth(r.createdAt)) return false;
      if (filter === 'linked' && !r.episodeLink)            return false;
      if (!q) return true;
      const tagStr = Array.isArray(r.tags) ? r.tags.join(' ').toLowerCase() : '';
      return (
        (r.title || '').toLowerCase().includes(q) ||
        tagStr.includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      );
    });

    const sorter = {
      recent:   (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      title:    (a, b) => (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase()),
      size:     (a, b) => (b.size || 0) - (a.size || 0),
      duration: (a, b) => (b.duration || 0) - (a.duration || 0),
    }[sort] || ((a, b) => 0);

    return arr.slice().sort(sorter);
  }, [recordings, query, filter, sort]);

  const selected = useMemo(
    () => recordings.find(r => r.id === selectedId) || null,
    [recordings, selectedId]
  );

  const linkedPost = useMemo(() => {
    if (!selected?.episodeLink) return null;
    return posts.find(p => p.id === selected.episodeLink) || null;
  }, [selected, posts]);

  /* ── CRUD ──────────────────────────────────────────────────── */
  const updateRecording = useCallback((id, patch) => {
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    const freed = selected.size || 0;
    const id = selected.id;
    const path = selected.storagePath;
    /* Optimistic: drop the metadata row first, then delete the Storage
       blob in the background. If the Storage delete fails we surface a
       quiet toast but don't try to re-add the row. */
    setRecordings(prev => prev.filter(r => r.id !== id));
    setSelectedId(null);
    setArmedDelete(false);
    if (path) {
      deleteBlobAtPath(path).catch((err) => {
        setToastKind('error');
        setToast(`Recording removed, but the video file couldn't be deleted from Storage: ${err?.message || 'unknown error'}`);
      });
    }
    setToastKind('info');
    setToast(`Deleted recording — freed ${formatBytes(freed)}`);
  }, [selected, armedDelete, setRecordings]);

  const handleDownload = useCallback(() => {
    if (!selected || !selected.videoUrl) return;
    const ext = extFromMime(selected.mimeType);
    const fname = `${(selected.title || 'recording').replace(/[^\w\-. ]+/g, '_')}.${ext}`;
    /* Firebase Storage download URLs are directly downloadable. Open in
       a new tab so the browser saves the file rather than navigating. */
    const a = document.createElement('a');
    a.href = selected.videoUrl;
    a.download = fname;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [selected]);

  const pickEpisode = useCallback((post) => {
    if (!selected) return;
    updateRecording(selected.id, {
      episodeLink: post?.id || null,
      episodeTitle: post?.title || '',
    });
  }, [selected, updateRecording]);

  const clearEpisode = useCallback(() => {
    if (!selected) return;
    updateRecording(selected.id, { episodeLink: null, episodeTitle: '' });
  }, [selected, updateRecording]);

  /* Storage warning levels removed — recordings now live in Firebase
     Storage (5 GiB free tier). The bandwidth/quota story is different
     enough that the old IDB-usage chip doesn't translate. */

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div className="pr-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>
      <NavRail />

      <main className="pr-main">
        <div className="pr-layout">
          {/* ─── Sidebar ───────────────────────────────────── */}
          <aside className="pr-side">
            <div className="pr-side-head">
              <span className="pr-side-title">Recordings</span>
              <span className="pr-side-count pr-muted">
                {recordings.length}
              </span>
            </div>

            {/* Cloud chip — replaces the old IDB usage gauge */}
            <div className="pr-storage-chip pr-storage-ok">
              <div className="pr-storage-row">
                <span className="pr-storage-label">☁ Cloud Storage</span>
              </div>
            </div>

            {/* Search */}
            <div className="pr-search-wrap">
              <input
                className="pr-inp"
                placeholder="Search title, tags, notes…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            {/* Filter pills */}
            <div className="pr-pills">
              <button
                className={`pr-pill${filter === 'all' ? ' on' : ''}`}
                onClick={() => setFilter('all')}
              >All</button>
              <button
                className={`pr-pill${filter === 'week' ? ' on' : ''}`}
                onClick={() => setFilter('week')}
              >This week</button>
              <button
                className={`pr-pill${filter === 'month' ? ' on' : ''}`}
                onClick={() => setFilter('month')}
              >This month</button>
              <button
                className={`pr-pill${filter === 'linked' ? ' on' : ''}`}
                onClick={() => setFilter('linked')}
                title="Only recordings linked to an episode"
              >🔗 Linked</button>
            </div>

            {/* Sort */}
            <div className="pr-sort-wrap">
              <label className="pr-sort-lbl pr-muted">Sort</label>
              <select
                className="pr-inp pr-sort-sel"
                value={sort}
                onChange={e => setSort(e.target.value)}
              >
                <option value="recent">Recent</option>
                <option value="title">Title A–Z</option>
                <option value="size">Size (desc)</option>
                <option value="duration">Duration (desc)</option>
              </select>
            </div>

            {/* List */}
            <div className="pr-list">
              {filtered.length === 0 ? (
                <div className="pr-list-empty pr-muted">
                  {recordings.length === 0
                    ? 'No recordings yet. Record one in the Podcast Studio.'
                    : 'No recordings match these filters.'}
                </div>
              ) : (
                filtered.map(r => {
                  const tags = Array.isArray(r.tags) ? r.tags : [];
                  const visTags = tags.slice(0, 2);
                  const extra = tags.length - visTags.length;
                  return (
                    <div
                      key={r.id}
                      className={`pr-row${selectedId === r.id ? ' on' : ''}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className="pr-row-thumb" aria-hidden="true">
                        <span className="pr-row-thumb-icon">▶</span>
                      </div>
                      <div className="pr-row-info">
                        <div className="pr-row-name">{r.title || 'Untitled recording'}</div>
                        <div className="pr-row-sub">
                          <span className="pr-row-dur">{formatTime(r.duration)}</span>
                          <span className="pr-row-dot">·</span>
                          <span className="pr-row-size">{formatBytes(r.size)}</span>
                          <span className="pr-row-dot">·</span>
                          <span className="pr-row-date">{formatRelative(r.createdAt)}</span>
                        </div>
                        {(visTags.length > 0 || extra > 0 || r.episodeLink) && (
                          <div className="pr-row-tags">
                            {visTags.map((t, i) => (
                              <span className="pr-row-tag" key={`${t}-${i}`}>{t}</span>
                            ))}
                            {extra > 0 && (
                              <span className="pr-row-tag pr-row-tag-more">+{extra} more</span>
                            )}
                            {r.episodeLink && (
                              <span className="pr-row-linked" title="Linked to episode">
                                🔗 Linked
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* ─── Detail ────────────────────────────────────── */}
          <section className="pr-detail">
            {!selected ? (
              <div className="pr-empty">
                <div className="pr-empty-icon">🎞</div>
                <div className="pr-empty-title">No recording selected</div>
                <div className="pr-empty-sub">
                  {recordings.length === 0
                    ? 'Record a video in the Podcast Studio — your takes will appear here for review, tagging, and download.'
                    : 'Choose a recording from the sidebar to play, edit, or download.'}
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="pr-detail-head">
                  <div className="pr-detail-head-l">
                    <input
                      className="pr-name-input"
                      value={selected.title || ''}
                      onChange={e => updateRecording(selected.id, { title: e.target.value })}
                      placeholder="Recording title"
                    />
                    <div className="pr-chips">
                      <span className="pr-chip pr-chip-date">
                        {selected.createdAt
                          ? new Date(selected.createdAt).toLocaleString()
                          : '—'}
                      </span>
                      <span className="pr-chip pr-chip-dur">
                        ⏱ {formatTime(selected.duration)}
                      </span>
                      <span className="pr-chip pr-chip-size">
                        {formatBytes(selected.size)}
                      </span>
                      {selected.videoWidth && selected.videoHeight && (
                        <span className="pr-chip pr-chip-res">
                          {selected.videoWidth}×{selected.videoHeight}
                        </span>
                      )}
                      {selected.framerate && (
                        <span className="pr-chip pr-chip-fps">
                          {selected.framerate} fps
                        </span>
                      )}
                      {selected.episodeLink && (
                        <span className="pr-chip pr-chip-linked" title="Linked to episode">
                          🔗 Linked
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pr-detail-head-r">
                    <button
                      className="pr-btn pr-btn-accent"
                      onClick={handleDownload}
                      disabled={!selected.videoUrl}
                      title="Download as MP4/WebM"
                    >⬇ Download</button>
                    <button
                      className={`pr-btn${armedDelete ? ' pr-btn-danger-armed' : ' pr-btn-danger'}`}
                      onClick={handleDelete}
                      onBlur={() => setArmedDelete(false)}
                      title={armedDelete ? 'Click again to confirm' : 'Delete recording'}
                    >
                      {armedDelete ? 'Confirm Delete' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Video player — bind directly to the Firebase Storage URL.
                    No object URL lifecycle to manage anymore. */}
                <div className="pr-player">
                  {selected.videoUrl ? (
                    <video
                      key={selected.id}
                      className="pr-video"
                      src={selected.videoUrl}
                      crossOrigin="anonymous"
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div className="pr-player-loading pr-muted">No video available.</div>
                  )}
                </div>

                {/* Sections */}
                <div className="pr-form">
                  <Section title="Metadata" icon="📝" defaultOpen>
                    <div className="pr-field">
                      <label className="pr-field-lbl">Title</label>
                      <input
                        className="pr-inp"
                        value={selected.title || ''}
                        onChange={e => updateRecording(selected.id, { title: e.target.value })}
                        placeholder="Recording title"
                      />
                    </div>
                    <div className="pr-field">
                      <label className="pr-field-lbl">Tags</label>
                      <TagInput
                        tags={Array.isArray(selected.tags) ? selected.tags : []}
                        onChange={tags => updateRecording(selected.id, { tags })}
                      />
                      <div className="pr-field-hint pr-muted">
                        Press Enter or comma to add. Backspace on empty input removes the last tag.
                      </div>
                    </div>
                    <div className="pr-field">
                      <label className="pr-field-lbl">Notes</label>
                      <textarea
                        className="pr-inp pr-textarea"
                        rows={3}
                        placeholder="Take notes, retake markers, segment outline…"
                        value={selected.notes || ''}
                        onChange={e => updateRecording(selected.id, { notes: e.target.value })}
                      />
                    </div>
                  </Section>

                  <Section title="Episode Link" icon="🔗" defaultOpen>
                    {posts.length === 0 ? (
                      <div className="pr-muted">
                        No posts found in <code>blog:posts</code>. Create posts in the Posts Library to link episodes here.
                      </div>
                    ) : (
                      <EpisodePicker
                        posts={posts}
                        currentId={selected.episodeLink || null}
                        currentTitle={
                          linkedPost?.title ||
                          selected.episodeTitle ||
                          ''
                        }
                        onPick={pickEpisode}
                        onClear={clearEpisode}
                      />
                    )}
                    {selected.episodeLink && (
                      <div className="pr-linked-card">
                        <div className="pr-linked-info">
                          <div className="pr-linked-title">
                            {linkedPost?.title || selected.episodeTitle || 'Linked episode'}
                            {!linkedPost && (
                              <em className="pr-muted"> (post removed)</em>
                            )}
                          </div>
                          {linkedPost?.publishedAt && (
                            <div className="pr-linked-meta pr-muted">
                              Published {new Date(linkedPost.publishedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <button
                          className="pr-btn pr-btn-ghost pr-btn-sm"
                          onClick={() => navigate('/posts')}
                          title="Open in Posts Library"
                        >Open in Posts →</button>
                      </div>
                    )}
                  </Section>

                  <Section title="Technical" icon="📊" defaultOpen={false}>
                    <div className="pr-tech-grid">
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">MIME</span>
                        <span className="pr-tech-val">{selected.mimeType || '—'}</span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Dimensions</span>
                        <span className="pr-tech-val">
                          {selected.videoWidth && selected.videoHeight
                            ? `${selected.videoWidth} × ${selected.videoHeight}`
                            : '—'}
                        </span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Framerate</span>
                        <span className="pr-tech-val">
                          {selected.framerate ? `${selected.framerate} fps` : '—'}
                        </span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Duration</span>
                        <span className="pr-tech-val">{formatTime(selected.duration)}</span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Size</span>
                        <span className="pr-tech-val">
                          {formatBytes(selected.size)}
                          {selected.size ? ` (${selected.size.toLocaleString()} bytes)` : ''}
                        </span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Camera</span>
                        <span className="pr-tech-val">{selected.cameraLabel || '—'}</span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">Mic</span>
                        <span className="pr-tech-val">{selected.micLabel || '—'}</span>
                      </div>
                      <div className="pr-tech-row">
                        <span className="pr-tech-key">ID</span>
                        <span className="pr-tech-val pr-tech-id">{selected.id}</span>
                      </div>
                    </div>
                  </Section>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <Toast
        message={toast}
        kind={toastKind}
        onClose={() => setToast('')}
      />
    </div>
  );
}
