import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogAuthors.css';

/* ─────────────────────────────────────────────────────────────
   BlogAuthors — church blog contributor roster
   Naming: .ba-*
   Persistence: localStorage key "blog:authors"
   Reads:       localStorage key "blog:posts"
   Accent: var(--accent-pink, #f472b6)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'blog:authors';
const POSTS_KEY   = 'blog:posts';
const PHOTO_WARN_BYTES = 500 * 1024; // 500KB

const ROLES = [
  'Writer',
  'Editor',
  'Pastor',
  'Guest Contributor',
  'Other',
];

const SOCIAL_PLATFORMS = [
  'Website',
  'Twitter / X',
  'Instagram',
  'Facebook',
  'YouTube',
  'LinkedIn',
  'Threads',
  'Substack',
  'Other',
];

const FILTER_PILLS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

const SECTIONS = ['about', 'contact', 'social', 'stats', 'notes'];

function makeId() {
  return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadAuthors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAuthors(authors) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authors));
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyAuthor(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    name: '',
    status: 'active',
    bio: '',
    email: '',
    phone: '',
    photoDataUrl: '',
    role: 'Writer',
    socialLinks: [],
    tags: [],
    notes: '',
    joinedDate: todayISO(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function initials(name) {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/* ─── Sidebar author row ─────────────────────────────────────── */
function AuthorRow({ author, active, postCount, onClick }) {
  return (
    <button
      className={`ba-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="ba-card-photo">
        {author.photoDataUrl ? (
          <img src={author.photoDataUrl} alt={author.name || 'Author'} />
        ) : (
          <span className="ba-card-initials">{initials(author.name)}</span>
        )}
      </div>
      <div className="ba-card-info">
        <div className="ba-card-top">
          <span className="ba-card-name">{author.name || 'Unnamed Author'}</span>
          <span
            className={`ba-status-dot ${author.status === 'active' ? 'on' : 'off'}`}
            aria-label={author.status === 'active' ? 'Active' : 'Inactive'}
            title={author.status === 'active' ? 'Active' : 'Inactive'}
          />
        </div>
        <div className="ba-card-chips">
          {author.role && (
            <span className="ba-card-chip ba-card-chip-role">{author.role}</span>
          )}
          <span className="ba-card-chip ba-card-chip-count">
            {postCount} {postCount === 1 ? 'post' : 'posts'}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function BlogAuthors() {
  /* Firestore-backed; posts read live-synced via onSnapshot. */
  const [authors, setAuthors]       = useUserStoreKey('blog:authors', []);
  const [posts]                     = useUserStoreKey('blog:posts',   []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [armedDelete, setArmedDelete] = useState(false);
  const [tagDraft, setTagDraft]     = useState('');
  const [collapsed, setCollapsed]   = useState(() => {
    // all sections expanded by default
    return SECTIONS.reduce((acc, k) => { acc[k] = false; return acc; }, {});
  });
  const [copiedField, setCopiedField] = useState(''); // 'email' | 'phone' | ''

  const armTimerRef   = useRef(null);
  const photoInputRef = useRef(null);
  const copyTimerRef  = useRef(null);

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* Clear "copied" toast */
  useEffect(() => {
    if (!copiedField) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedField(''), 1400);
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [copiedField]);

  /* Reset transient state on selection change */
  useEffect(() => {
    setArmedDelete(false);
    setTagDraft('');
    setCopiedField('');
  }, [selectedId]);

  /* ─── Derived: stats per author from blog:posts ─────────────── */
  const postStatsByName = useMemo(() => {
    /* Map<lowerName, { count, lastPostDate, recent: [{id,title,publishDate}] }> */
    const map = new Map();
    for (const p of posts) {
      const authorName = (p && p.author) ? String(p.author).trim() : '';
      if (!authorName) continue;
      const key = authorName.toLowerCase();
      if (!map.has(key)) map.set(key, { count: 0, lastPostDate: '', recent: [] });
      const bucket = map.get(key);
      bucket.count += 1;
      bucket.recent.push({
        id: p.id || '',
        title: p.title || '(untitled post)',
        publishDate: p.publishDate || p.publishedAt || p.date || '',
      });
      const pd = p.publishDate || p.publishedAt || p.date || '';
      if (pd && (!bucket.lastPostDate || pd > bucket.lastPostDate)) {
        bucket.lastPostDate = pd;
      }
    }
    // Sort each bucket's recent posts desc by publishDate
    for (const bucket of map.values()) {
      bucket.recent.sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));
    }
    return map;
  }, [posts]);

  const statsFor = useCallback((author) => {
    if (!author || !author.name) return { count: 0, lastPostDate: '', recent: [] };
    const key = author.name.trim().toLowerCase();
    return postStatsByName.get(key) || { count: 0, lastPostDate: '', recent: [] };
  }, [postStatsByName]);

  /* ─── Derived: status counts + total posts across roster ────── */
  const summary = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let totalPosts = 0;
    for (const a of authors) {
      if (a.status === 'active') active++;
      else inactive++;
      totalPosts += statsFor(a).count;
    }
    return { total: authors.length, active, inactive, totalPosts };
  }, [authors, statsFor]);

  /* ─── Derived: filtered + sorted authors ────────────────────── */
  const filteredAuthors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return authors
      .filter(a => {
        if (filter === 'active'   && a.status !== 'active')   return false;
        if (filter === 'inactive' && a.status !== 'inactive') return false;
        if (!q) return true;
        const hay = [
          a.name, a.role,
          ...(Array.isArray(a.tags) ? a.tags : []),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [authors, query, filter]);

  const selected = useMemo(
    () => authors.find(a => a.id === selectedId) || null,
    [authors, selectedId]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setAuthors(prev => prev.map(a => (
      a.id === selectedId ? { ...a, ...patch, updatedAt: Date.now() } : a
    )));
  }, [selectedId]);

  const handleNew = useCallback(() => {
    const a = emptyAuthor();
    setAuthors(prev => [a, ...prev]);
    setSelectedId(a.id);
  }, []);

  const handleToggleStatus = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: selected.status === 'active' ? 'inactive' : 'active' });
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setAuthors(prev => prev.filter(a => a.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const now = Date.now();
    const clone = {
      ...selected,
      id: makeId(),
      name: (selected.name || 'Author') + ' (copy)',
      socialLinks: Array.isArray(selected.socialLinks)
        ? selected.socialLinks.map(s => ({ ...s }))
        : [],
      tags: Array.isArray(selected.tags) ? [...selected.tags] : [],
      createdAt: now,
      updatedAt: now,
    };
    setAuthors(prev => [clone, ...prev]);
    setSelectedId(clone.id);
  }, [selected]);

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

  const handleAddSocial = useCallback(() => {
    if (!selected) return;
    const next = [...(selected.socialLinks || []), { platform: 'Website', url: '' }];
    updateSelected({ socialLinks: next });
  }, [selected, updateSelected]);

  const handleUpdateSocial = useCallback((idx, patch) => {
    if (!selected) return;
    const next = (selected.socialLinks || []).map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateSelected({ socialLinks: next });
  }, [selected, updateSelected]);

  const handleRemoveSocial = useCallback((idx) => {
    if (!selected) return;
    const next = (selected.socialLinks || []).filter((_, i) => i !== idx);
    updateSelected({ socialLinks: next });
  }, [selected, updateSelected]);

  /* ─── Photo upload ─────────────────────────────────────────── */
  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !selected) return;
    if (file.size > PHOTO_WARN_BYTES) {
      const ok = window.confirm(
        `That photo is ${(file.size / 1024).toFixed(0)} KB. Large images bloat localStorage. Use it anyway?`
      );
      if (!ok) {
        if (photoInputRef.current) photoInputRef.current.value = '';
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSelected({ photoDataUrl: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, [selected, updateSelected]);

  const handleRemovePhoto = useCallback(() => {
    updateSelected({ photoDataUrl: '' });
  }, [updateSelected]);

  /* ─── Copy helpers ─────────────────────────────────────────── */
  const copyText = useCallback(async (text, label) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedField(label);
    } catch {
      /* swallow */
    }
  }, []);

  /* ─── Section toggle ───────────────────────────────────────── */
  const toggleSection = useCallback((key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ─── Navigate to a post ───────────────────────────────────── */
  const goToPost = useCallback((postId) => {
    if (!postId) return;
    // Use a simple href change so this works regardless of router type
    try {
      window.location.href = `/blog-posts?id=${encodeURIComponent(postId)}`;
    } catch {
      /* no-op */
    }
  }, []);

  /* ─── Render ───────────────────────────────────────────────── */
  const filterCounts = {
    all: summary.total,
    active: summary.active,
    inactive: summary.inactive,
  };

  const selectedStats = selected ? statsFor(selected) : null;
  const recentPosts = selectedStats ? selectedStats.recent.slice(0, 5) : [];

  return (
    <BlogShell title="Authors / Contributors" icon="✍" subtitle="Everyone who writes for the blog, with their bio and post count." fullBleed>
    <div className="ba-root">
      {/* ── Sidebar ── */}
      <aside className="ba-sidebar">
        <div className="ba-sidebar-head">
          <span className="ba-sidebar-title">Authors</span>
          <button
            className="ba-new-btn"
            onClick={handleNew}
            title="Add a new author"
          >
            + New Author
          </button>
        </div>

        {/* Stats card row */}
        <div className="ba-stats-row">
          <div className="ba-stat-card">
            <span className="ba-stat-num">{summary.total}</span>
            <span className="ba-stat-lbl">Total</span>
          </div>
          <div className="ba-stat-card">
            <span className="ba-stat-num ba-stat-num-active">{summary.active}</span>
            <span className="ba-stat-lbl">Active</span>
          </div>
          <div className="ba-stat-card">
            <span className="ba-stat-num ba-stat-num-posts">{summary.totalPosts}</span>
            <span className="ba-stat-lbl">Posts</span>
          </div>
        </div>

        <div className="ba-sidebar-controls">
          <input
            className="ba-inp"
            placeholder="Search name, role, tag…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="ba-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`ba-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
                title={p.label}
              >
                <span className="ba-pill-label">{p.label}</span>
                <span className="ba-pill-count">{filterCounts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ba-list">
          {filteredAuthors.length === 0 && (
            <p className="ba-muted ba-list-empty">
              {authors.length === 0
                ? 'No authors yet. Click "+ New Author" to add your first contributor.'
                : 'No matches.'}
            </p>
          )}
          {filteredAuthors.map(a => (
            <AuthorRow
              key={a.id}
              author={a}
              active={selectedId === a.id}
              postCount={statsFor(a).count}
              onClick={() => setSelectedId(a.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="ba-main">
        {!selected && (
          <div className="ba-empty">
            <div className="ba-empty-icon" aria-hidden="true">✍</div>
            <div className="ba-empty-title">No author selected</div>
            <div className="ba-empty-sub">
              {authors.length === 0
                ? 'Add your first contributor to start building the blog roster.'
                : 'Pick an author from the sidebar, or add a new contributor.'}
            </div>
            <button className="ba-btn ba-btn-accent ba-empty-cta" onClick={handleNew}>
              + Add an author
            </button>
          </div>
        )}

        {selected && (
          <div className="ba-detail">
            {/* Detail header */}
            <div className="ba-detail-head">
              <div className={`ba-photo${selected.photoDataUrl ? ' has' : ''}`}>
                {selected.photoDataUrl ? (
                  <img src={selected.photoDataUrl} alt={selected.name || 'Author'} />
                ) : (
                  <span className="ba-photo-initials">{initials(selected.name)}</span>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="ba-photo-input"
                />
                <div className="ba-photo-overlay">
                  <button
                    type="button"
                    className="ba-photo-btn"
                    onClick={() => photoInputRef.current && photoInputRef.current.click()}
                    title={selected.photoDataUrl ? 'Replace photo' : 'Upload photo'}
                  >
                    {selected.photoDataUrl ? 'Replace' : 'Upload'}
                  </button>
                  {selected.photoDataUrl && (
                    <button
                      type="button"
                      className="ba-photo-btn ba-photo-btn-del"
                      onClick={handleRemovePhoto}
                      title="Remove photo"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="ba-detail-head-info">
                <input
                  className="ba-name-inp"
                  placeholder="Author name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="ba-detail-meta">
                  <button
                    type="button"
                    className={`ba-status-pill ${selected.status === 'active' ? 'on' : 'off'}`}
                    onClick={handleToggleStatus}
                    title="Click to toggle active/inactive"
                  >
                    <span
                      className={`ba-status-dot ${selected.status === 'active' ? 'on' : 'off'}`}
                    />
                    {selected.status === 'active' ? 'Active' : 'Inactive'}
                  </button>
                  {selected.role && (
                    <span className="ba-chip ba-chip-role">{selected.role}</span>
                  )}
                  <span className="ba-chip ba-chip-count">
                    {selectedStats.count} {selectedStats.count === 1 ? 'post' : 'posts'}
                  </span>
                </div>
              </div>

              <div className="ba-detail-actions">
                <button
                  className="ba-btn ba-btn-ghost"
                  onClick={handleDuplicate}
                  title="Make a copy of this author"
                >
                  Duplicate
                </button>
                <button
                  className={`ba-btn${armedDelete ? ' ba-btn-danger-armed' : ' ba-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete author'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="ba-form">
              {/* About */}
              <Section
                title="About"
                sectionKey="about"
                collapsed={collapsed.about}
                onToggle={toggleSection}
              >
                <label className="ba-field">
                  <span className="ba-label">Bio</span>
                  <textarea
                    className="ba-inp ba-textarea"
                    placeholder="A short bio readers will see next to posts…"
                    rows={4}
                    value={selected.bio}
                    onChange={e => updateSelected({ bio: e.target.value })}
                  />
                </label>
                <div className="ba-row ba-row-2">
                  <label className="ba-field">
                    <span className="ba-label">Role</span>
                    <select
                      className="ba-inp"
                      value={selected.role || 'Writer'}
                      onChange={e => updateSelected({ role: e.target.value })}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="ba-field">
                    <span className="ba-label">Joined date</span>
                    <input
                      className="ba-inp"
                      type="date"
                      value={selected.joinedDate || ''}
                      onChange={e => updateSelected({ joinedDate: e.target.value })}
                    />
                  </label>
                </div>
                <div className="ba-field">
                  <span className="ba-label">Tags</span>
                  <div className="ba-chip-input">
                    <div className="ba-chip-list">
                      {(selected.tags || []).map((tag, i) => (
                        <span key={i} className="ba-tag-chip">
                          {tag}
                          <button
                            type="button"
                            className="ba-tag-chip-x"
                            onClick={() => handleRemoveTag(tag)}
                            title="Remove tag"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        className="ba-chip-inp"
                        placeholder={
                          (selected.tags || []).length === 0
                            ? 'Type a tag and press Enter…'
                            : 'Add another…'
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
              </Section>

              {/* Contact */}
              <Section
                title="Contact"
                sectionKey="contact"
                collapsed={collapsed.contact}
                onToggle={toggleSection}
              >
                <div className="ba-row ba-row-2">
                  <div className="ba-field">
                    <span className="ba-label">Email</span>
                    <div className="ba-contact-row">
                      <input
                        className="ba-inp"
                        type="email"
                        placeholder="name@example.com"
                        value={selected.email}
                        onChange={e => updateSelected({ email: e.target.value })}
                      />
                      <div className="ba-contact-actions">
                        <button
                          type="button"
                          className="ba-icon-btn"
                          onClick={() => copyText(selected.email, 'email')}
                          disabled={!selected.email}
                          title="Copy email"
                        >
                          {copiedField === 'email' ? '✓' : '⧉'}
                        </button>
                        <a
                          className={`ba-icon-btn${!selected.email ? ' disabled' : ''}`}
                          href={selected.email ? `mailto:${selected.email}` : undefined}
                          title="Send email"
                          aria-disabled={!selected.email}
                          onClick={e => { if (!selected.email) e.preventDefault(); }}
                        >
                          ✉
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="ba-field">
                    <span className="ba-label">Phone</span>
                    <div className="ba-contact-row">
                      <input
                        className="ba-inp"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={selected.phone}
                        onChange={e => updateSelected({ phone: e.target.value })}
                      />
                      <div className="ba-contact-actions">
                        <button
                          type="button"
                          className="ba-icon-btn"
                          onClick={() => copyText(selected.phone, 'phone')}
                          disabled={!selected.phone}
                          title="Copy phone"
                        >
                          {copiedField === 'phone' ? '✓' : '⧉'}
                        </button>
                        <a
                          className={`ba-icon-btn${!selected.phone ? ' disabled' : ''}`}
                          href={selected.phone ? `tel:${selected.phone.replace(/[^+\d]/g, '')}` : undefined}
                          title="Call"
                          aria-disabled={!selected.phone}
                          onClick={e => { if (!selected.phone) e.preventDefault(); }}
                        >
                          ☏
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Social Links */}
              <Section
                title="Social Links"
                sectionKey="social"
                collapsed={collapsed.social}
                onToggle={toggleSection}
                action={
                  <button
                    type="button"
                    className="ba-btn ba-btn-ghost ba-btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleAddSocial(); }}
                  >
                    + Add Link
                  </button>
                }
              >
                {(selected.socialLinks || []).length === 0 && (
                  <p className="ba-muted ba-empty-row">
                    No social links yet. Add a link to a personal site, Twitter, Instagram…
                  </p>
                )}
                {(selected.socialLinks || []).map((s, i) => (
                  <div key={i} className="ba-social-row">
                    <select
                      className="ba-inp ba-social-platform"
                      value={s.platform || 'Website'}
                      onChange={e => handleUpdateSocial(i, { platform: e.target.value })}
                    >
                      {SOCIAL_PLATFORMS.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      className="ba-inp ba-social-url"
                      type="url"
                      placeholder="https://…"
                      value={s.url || ''}
                      onChange={e => handleUpdateSocial(i, { url: e.target.value })}
                    />
                    {s.url && (
                      <a
                        className="ba-icon-btn"
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open link in new tab"
                      >
                        ↗
                      </a>
                    )}
                    <button
                      type="button"
                      className="ba-icon-btn ba-icon-btn-del"
                      onClick={() => handleRemoveSocial(i)}
                      title="Remove link"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </Section>

              {/* Stats */}
              <Section
                title="Stats"
                sectionKey="stats"
                collapsed={collapsed.stats}
                onToggle={toggleSection}
              >
                <div className="ba-stats-grid">
                  <div className="ba-stat-tile">
                    <span className="ba-stat-tile-num">{selectedStats.count}</span>
                    <span className="ba-stat-tile-lbl">Post count</span>
                  </div>
                  <div className="ba-stat-tile">
                    <span className="ba-stat-tile-num ba-stat-tile-date">
                      {selectedStats.lastPostDate ? formatDate(selectedStats.lastPostDate) : '—'}
                    </span>
                    <span className="ba-stat-tile-lbl">Last post</span>
                  </div>
                </div>
                <div className="ba-field">
                  <span className="ba-label">Recent posts</span>
                  {recentPosts.length === 0 && (
                    <p className="ba-muted ba-empty-row">
                      No posts found for this author yet. Posts authored under
                      “{selected.name || 'this name'}” will appear here.
                    </p>
                  )}
                  {recentPosts.length > 0 && (
                    <ul className="ba-recent-list">
                      {recentPosts.map((rp, i) => (
                        <li key={(rp.id || '') + '_' + i} className="ba-recent-item">
                          <button
                            type="button"
                            className="ba-recent-btn"
                            onClick={() => goToPost(rp.id)}
                            disabled={!rp.id}
                            title={rp.id ? 'Open in Blog Posts' : 'No post id available'}
                          >
                            <span className="ba-recent-title">{rp.title}</span>
                            {rp.publishDate && (
                              <span className="ba-recent-date">{formatDate(rp.publishDate)}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="ba-hint">
                  Stats are computed live from <code>blog:posts</code> — counted where{' '}
                  <code>post.author</code> matches this author's name.
                </span>
              </Section>

              {/* Notes */}
              <Section
                title="Notes"
                sectionKey="notes"
                collapsed={collapsed.notes}
                onToggle={toggleSection}
              >
                <textarea
                  className="ba-inp ba-textarea"
                  placeholder="Private notes — editor's reminders, availability, payment notes…"
                  rows={5}
                  value={selected.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                />
              </Section>
            </div>
          </div>
        )}
      </main>
    </div>
    </BlogShell>
  );
}

/* ─── Collapsible section ────────────────────────────────────── */
function Section({ title, sectionKey, collapsed, onToggle, action, children }) {
  return (
    <div className={`ba-section${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="ba-section-head"
        onClick={() => onToggle(sectionKey)}
        aria-expanded={!collapsed}
      >
        <span className="ba-section-caret" aria-hidden="true">▾</span>
        <span className="ba-section-title">{title}</span>
        {action && <span className="ba-section-action">{action}</span>}
      </button>
      {!collapsed && (
        <div className="ba-section-body">
          {children}
        </div>
      )}
    </div>
  );
}
