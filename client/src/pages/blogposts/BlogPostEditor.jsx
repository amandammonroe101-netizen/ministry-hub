import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import { isDetached } from '../../lib/detached';
import './BlogPosts.css';

/* ─────────────────────────────────────────────────────────────
   Blog Post Editor — the full post-editing form, standalone.

   Opened from Posts Library (BlogPosts.jsx) as a pop-out Electron
   window (or, outside Electron, a same-window navigation) so
   editing never happens inline in the library's browsing view.
   Reads the post id from ?id=, edits it in place in the shared
   Firestore-synced "blog:posts" store, and closes/navigates back
   when done.

   Naming: .bp-* (shared with BlogPosts.css — same visual language)
   ───────────────────────────────────────────────────────────── */

const ROSTER_KEY = 'band:roster';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB warning threshold

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

function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(p => (typeof p === 'string' ? p : (p && (p.name || p.fullName)) || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sluggify(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function makeId() {
  return 'bp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export default function BlogPostEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');

  const [posts, setPosts] = useUserStoreKey('blog:posts', []);
  const [roster]          = useState(() => loadRoster());
  const [categoryList]    = useUserStoreKey('blog:categories', []);
  const categoryNames = useMemo(
    () => (categoryList || [])
      .map(c => (c && typeof c === 'object' ? c.name : c))
      .filter(name => typeof name === 'string' && name.trim().length > 0),
    [categoryList]
  );

  const [armedDelete, setArmedDelete]       = useState(false);
  const [tagDraft, setTagDraft]             = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [imageWarning, setImageWarning]     = useState('');

  /* Focus Mode — the distraction-free typewriter view (title +
     subtitle + body only). On by default whenever the editor opens;
     toggling it off reveals the full metadata form below. */
  const [focusMode, setFocusMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');

  const armTimerRef   = useRef(null);
  const statusMenuRef = useRef(null);
  const fileInputRef  = useRef(null);
  const saveTimerRef  = useRef(null);
  const rosterListId  = 'bpe-roster-options';

  const selected = useMemo(
    () => posts.find(p => p.id === id) || null,
    [posts, id]
  );

  const wordCount = useMemo(() => {
    const text = (selected?.body || '').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [selected?.body]);

  const readMinutes = Math.max(1, Math.ceil(wordCount / 200));

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

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

  /* Close/back: pop-out windows close themselves; same-window
     navigations go back to the Posts Library. */
  const handleClose = useCallback(() => {
    if (isDetached()) {
      window.close();
    } else {
      navigate('/blog-posts');
    }
  }, [navigate]);

  /* ─── Mutators ───────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!id) return;
    setPosts(prev => prev.map(p => (
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    )));
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('saved'), 500);
  }, [id, setPosts]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const handleTitleChange = useCallback((nextTitle) => {
    if (!selected) return;
    const patch = { title: nextTitle };
    if (!selected.slugManuallyEdited) {
      patch.slug = sluggify(nextTitle);
    }
    updateSelected(patch);
  }, [selected, updateSelected]);

  const handleSlugChange = useCallback((nextSlug) => {
    if (!selected) return;
    const cleaned = sluggify(nextSlug);
    if (cleaned === '') {
      updateSelected({ slug: '', slugManuallyEdited: false });
    } else {
      updateSelected({ slug: cleaned, slugManuallyEdited: true });
    }
  }, [selected, updateSelected]);

  const handleQuickStatus = useCallback((nextStatus) => {
    if (!selected) return;
    if (nextStatus === 'published') {
      const patch = { status: 'archived' };
      if (!selected.publishDate) patch.publishDate = todayIso();
      updateSelected(patch);
    } else {
      updateSelected({ status: nextStatus });
    }
    setShowStatusMenu(false);
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setPosts(prev => prev.filter(p => p.id !== selected.id));
    handleClose();
  }, [selected, armedDelete, setPosts, handleClose]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const now = Date.now();
    const baseTitle = (selected.title || 'Post') + ' (copy)';
    const clone = {
      ...selected,
      id: makeId(),
      title: baseTitle,
      slug: sluggify(baseTitle),
      slugManuallyEdited: false,
      status: 'draft',
      url: '',
      createdAt: now,
      updatedAt: now,
    };
    setPosts(prev => [clone, ...prev]);
  }, [selected, setPosts]);

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

  /* ─── Featured image handlers ────────────────────────────── */
  const handleImagePick = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageWarning(
        `Heads up — that file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Large images can slow down your site and bloat localStorage. Consider resizing under 2MB.`
      );
    } else {
      setImageWarning('');
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        updateSelected({ featuredImageDataUrl: dataUrl });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [updateSelected]);

  const handleImageRemove = useCallback(() => {
    if (!selected) return;
    updateSelected({ featuredImageDataUrl: '' });
    setImageWarning('');
  }, [selected, updateSelected]);

  const backBtn = (
    <button type="button" className="bp-btn bp-btn-ghost" onClick={handleClose}>
      ← Back to Posts Library
    </button>
  );

  if (!id || !selected) {
    return (
      <BlogShell
        title="Post not found"
        icon="📰"
        subtitle="This post may have been deleted, or the link is no longer valid."
        fullBleed
        headActions={backBtn}
      >
        <div className="bp-root bp-root-editor">
          <div className="bp-empty">
            <div className="bp-empty-icon" aria-hidden="true">📰</div>
            <div className="bp-empty-title-script">Post not found</div>
            <p className="bp-empty-sub">
              Head back to the Posts Library and pick a post to edit.
            </p>
          </div>
        </div>
      </BlogShell>
    );
  }

  const currentStatusInfo = STATUS_BY_KEY[selected.status] || STATUS_BY_KEY.draft;

  const saveIndicator = (
    <span className={`bp-save-indicator${saveStatus === 'saving' ? ' is-saving' : ''}`}>
      <span className="bp-save-leaf" aria-hidden="true">🌿</span>
      {saveStatus === 'saving' ? 'Saving' : 'Saved'}
      <span className="bp-save-dot" aria-hidden="true" />
    </span>
  );

  const focusToggleBtn = (
    <button
      type="button"
      className={`bp-focus-toggle${focusMode ? ' on' : ''}`}
      onClick={() => setFocusMode(v => !v)}
      title={focusMode ? 'Show all fields' : 'Distraction-free writing'}
    >
      <span aria-hidden="true">👁</span> Focus Mode
    </button>
  );

  return (
    <BlogShell
      title={selected.title || 'Untitled post'}
      icon="📰"
      subtitle="Editing this post — changes save automatically."
      fullBleed
      headActions={backBtn}
      hidePagehead={focusMode}
      hideTopbar={focusMode}
    >
      <div className={`bp-root bp-root-editor${focusMode ? ' bp-root-editor-focus' : ''}`}>
        {roster.length > 0 && (
          <datalist id={rosterListId}>
            {roster.map((name, i) => (
              <option key={i} value={name} />
            ))}
          </datalist>
        )}

        <div className="bp-focus-bar">
          {focusMode ? backBtn : <span />}
          <div className="bp-focus-bar-right">
            {saveIndicator}
            {focusToggleBtn}
          </div>
        </div>

        {focusMode ? (
          <div className="bp-focus-canvas">
            <input
              className="bp-title-inp bp-focus-title"
              placeholder="Untitled Post"
              value={selected.title}
              onChange={e => handleTitleChange(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <input
              className="bp-subtitle-inp"
              placeholder="Add a subtitle (optional)…"
              value={selected.subtitle || ''}
              onChange={e => updateSelected({ subtitle: e.target.value })}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <div className="bp-focus-divider" aria-hidden="true" />
            <textarea
              className="bp-body-textarea bp-focus-body"
              placeholder={
                '# Heading\n\nWrite your post here. Markdown is supported — use **bold**, *italics*, and [links](https://).'
              }
              value={selected.body}
              onChange={e => updateSelected({ body: e.target.value })}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        ) : (
        <div className="bp-detail">
          {/* Detail header */}
          <div className="bp-detail-head">
            <div className="bp-detail-head-info">
              <input
                className="bp-title-inp"
                placeholder="Post title…"
                value={selected.title}
                onChange={e => handleTitleChange(e.target.value)}
              />

              <input
                className="bp-subtitle-inp bp-subtitle-inp-full"
                placeholder="Add a subtitle (optional)…"
                value={selected.subtitle || ''}
                onChange={e => updateSelected({ subtitle: e.target.value })}
              />

              <div className="bp-slug-row">
                <span className="bp-slug-prefix">/blog/</span>
                <input
                  className="bp-slug-inp"
                  placeholder="post-slug"
                  value={selected.slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  title={
                    selected.slugManuallyEdited
                      ? 'Slug is manually set — clear it to resume auto-derive from title'
                      : 'Slug auto-derives from title — type here to override'
                  }
                />
                {selected.slugManuallyEdited && (
                  <span className="bp-slug-badge" title="Slug is manually edited">
                    manual
                  </span>
                )}
              </div>

              <div className="bp-detail-meta">
                <div className="bp-status-wrap" ref={statusMenuRef}>
                  <button
                    className={`bp-status-badge s-${selected.status}`}
                    onClick={() => setShowStatusMenu(v => !v)}
                    title="Click to change status"
                  >
                    <span
                      className="bp-status-dot"
                      style={{ background: currentStatusInfo.color }}
                    />
                    {currentStatusInfo.label}
                    <span className="bp-status-caret" aria-hidden="true">▾</span>
                  </button>
                  {showStatusMenu && (
                    <div className="bp-status-menu">
                      {STATUSES.map(s => (
                        <button
                          key={s.key}
                          className={`bp-status-menu-item${selected.status === s.key ? ' on' : ''}`}
                          onClick={() => handleQuickStatus(s.key)}
                        >
                          <span
                            className="bp-status-dot"
                            style={{ background: s.color }}
                          />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selected.publishDate && (
                  <span className="bp-meta-pill" title="Publish date">
                    📅 {formatDateLong(selected.publishDate)}
                  </span>
                )}
              </div>
            </div>

            <div className="bp-detail-actions">
              <button
                className="bp-btn bp-btn-ghost"
                onClick={handleDuplicate}
                title="Duplicate this post"
              >
                Duplicate
              </button>
              <button
                className={`bp-btn${armedDelete ? ' bp-btn-danger-armed' : ' bp-btn-danger'}`}
                onClick={handleDelete}
                title={armedDelete ? 'Click again to confirm deletion' : 'Delete post'}
              >
                {armedDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            </div>
          </div>

          {/* Featured image */}
          <div className="bp-image-strip">
            <div
              className={`bp-image-preview${selected.featuredImageDataUrl ? '' : ' bp-image-preview-empty'}`}
            >
              {selected.featuredImageDataUrl ? (
                <img
                  src={selected.featuredImageDataUrl}
                  alt="Featured"
                  className="bp-image-img"
                />
              ) : (
                <span className="bp-image-empty-label">No featured image</span>
              )}
            </div>
            <div className="bp-image-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
              <button
                className="bp-btn bp-btn-accent"
                onClick={handleImagePick}
              >
                {selected.featuredImageDataUrl ? 'Replace image' : 'Upload image'}
              </button>
              {selected.featuredImageDataUrl && (
                <button className="bp-btn bp-btn-ghost" onClick={handleImageRemove}>
                  Remove
                </button>
              )}
              <span className="bp-hint">
                Stored as base64 in localStorage. Keep under 2MB for best performance.
              </span>
              {imageWarning && (
                <span className="bp-image-warning">⚠ {imageWarning}</span>
              )}
            </div>
          </div>

          {/* Form body */}
          <div className="bp-form">
            {/* Content */}
            <details className="bp-section" open>
              <summary className="bp-section-summary">
                <span className="bp-section-title">📝 Content</span>
                <span className="bp-section-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="bp-section-body">
                <div className="bp-row bp-row-2">
                  <label className="bp-field">
                    <span className="bp-label">
                      Author <span className="bp-required" aria-hidden="true">*</span>
                    </span>
                    <input
                      className={`bp-inp${!selected.author ? ' bp-inp-required' : ''}`}
                      placeholder={
                        roster.length > 0
                          ? 'Type or pick from roster…'
                          : 'Who wrote this?'
                      }
                      value={selected.author}
                      onChange={e => updateSelected({ author: e.target.value })}
                      list={roster.length > 0 ? rosterListId : undefined}
                      required
                      aria-required="true"
                    />
                  </label>
                  <label className="bp-field">
                    <span className="bp-label">
                      Publish date <span className="bp-required" aria-hidden="true">*</span>
                    </span>
                    <input
                      className={`bp-inp${!selected.publishDate ? ' bp-inp-required' : ''}`}
                      type="date"
                      value={selected.publishDate}
                      onChange={e => updateSelected({ publishDate: e.target.value })}
                      required
                      aria-required="true"
                    />
                  </label>
                </div>

                <label className="bp-field">
                  <span className="bp-label">Category</span>
                  {categoryNames.length === 0 ? (
                    <div className="bp-hint">
                      No categories yet — create them in <strong>Categories &amp; Series</strong>.
                    </div>
                  ) : (
                    <select
                      className="bp-inp"
                      value={selected.category || ''}
                      onChange={e => updateSelected({ category: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {categoryNames.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </label>

                <div className="bp-field">
                  <span className="bp-label">Tags</span>
                  <div className="bp-chip-input">
                    <div className="bp-chip-list">
                      {(selected.tags || []).map((tag, i) => (
                        <span key={i} className="bp-tag-chip">
                          {tag}
                          <button
                            type="button"
                            className="bp-tag-chip-x"
                            onClick={() => handleRemoveTag(tag)}
                            title="Remove tag"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        className="bp-chip-inp"
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

                <label className="bp-field">
                  <span className="bp-label">Excerpt</span>
                  <textarea
                    className="bp-inp bp-textarea"
                    placeholder="One- to three-sentence summary that shows on listing pages and previews…"
                    rows={3}
                    value={selected.excerpt}
                    onChange={e => updateSelected({ excerpt: e.target.value })}
                  />
                </label>

                <label className="bp-field">
                  <span className="bp-label">Body (Markdown)</span>
                  <textarea
                    className="bp-inp bp-textarea bp-body-textarea"
                    placeholder={
                      '# Heading\n\nWrite your post here. Markdown is supported — use **bold**, *italics*, and [links](https://).'
                    }
                    rows={16}
                    value={selected.body}
                    onChange={e => updateSelected({ body: e.target.value })}
                  />
                </label>
              </div>
            </details>

            {/* Performance */}
            <details className="bp-section">
              <summary className="bp-section-summary">
                <span className="bp-section-title">📊 Performance</span>
                <span className="bp-section-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="bp-section-body">
                <label className="bp-field">
                  <span className="bp-label">Performance notes</span>
                  <textarea
                    className="bp-inp bp-textarea"
                    placeholder='e.g. "Top post Q1", "low engagement", "shared 40+ times on Facebook", "drove most newsletter signups"…'
                    rows={5}
                    value={selected.performanceNotes}
                    onChange={e => updateSelected({ performanceNotes: e.target.value })}
                  />
                  <span className="bp-hint">
                    Track what worked. Useful when planning your next series or campaign.
                  </span>
                </label>
              </div>
            </details>

            {/* Internal Notes */}
            <details className="bp-section">
              <summary className="bp-section-summary">
                <span className="bp-section-title">🗒 Internal Notes</span>
                <span className="bp-section-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="bp-section-body">
                <textarea
                  className="bp-inp bp-textarea"
                  placeholder="For your team only — editorial todos, who's reviewing, follow-ups…"
                  rows={5}
                  value={selected.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                />
              </div>
            </details>
          </div>
        </div>
        )}

        {focusMode && (
          <div className="bp-focus-bottombar">
            <span className="bp-focus-bottom-left">
              🗓 Draft saved · {readMinutes} min read (est.)
            </span>
            <span className="bp-focus-bottom-right">
              <span className="bp-word-count">{wordCount} words</span>
              <button
                type="button"
                className="bp-btn bp-publish-btn"
                onClick={() => handleQuickStatus('published')}
              >
                📤 Publish
              </button>
            </span>
          </div>
        )}
      </div>
    </BlogShell>
  );
}
