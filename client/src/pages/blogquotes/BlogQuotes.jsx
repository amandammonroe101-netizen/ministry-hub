import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogQuotes.css';

/* ─────────────────────────────────────────────────────────────
   Blog Quotes Library — pull-quote bank for social media
   Naming: .bq-*
   Persistence: localStorage key "blog:quotes"
   Reads:       localStorage key "blog:posts" (autocomplete)
   Accent: var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'blog:quotes';
const POSTS_KEY   = 'blog:posts';

const SOURCE_TYPES = [
  { key: 'blog-post',  label: 'Blog Post',  icon: '📰' },
  { key: 'sermon',     label: 'Sermon',     icon: '🎤' },
  { key: 'book',       label: 'Book',       icon: '📖' },
  { key: 'devotional', label: 'Devotional', icon: '🙏' },
  { key: 'song',       label: 'Song',       icon: '🎵' },
  { key: 'scripture',  label: 'Scripture',  icon: '✝' },
  { key: 'other',      label: 'Other',      icon: '💭' },
];

const PLATFORMS = [
  { key: 'instagram',  label: 'Instagram',  icon: '📷' },
  { key: 'facebook',   label: 'Facebook',   icon: '👥' },
  { key: 'twitter',    label: 'Twitter',    icon: '🐦' },
  { key: 'newsletter', label: 'Newsletter', icon: '📧' },
  { key: 'sermon',     label: 'Sermon',     icon: '🎤' },
  { key: 'website',    label: 'Website',    icon: '🌐' },
  { key: 'other',      label: 'Other',      icon: '📍' },
];

const SORTS = [
  { key: 'newest',    label: 'Newest' },
  { key: 'most-used', label: 'Most used' },
  { key: 'alpha',     label: 'Alphabetical' },
  { key: 'recent-used', label: 'Recently used' },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/* ─── Helpers ─────────────────────────────────────────────── */
function makeId(prefix = 'q') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sourceMeta(key) {
  return SOURCE_TYPES.find(s => s.key === key) || SOURCE_TYPES[SOURCE_TYPES.length - 1];
}
function platformMeta(key) {
  return PLATFORMS.find(p => p.key === key) || PLATFORMS[PLATFORMS.length - 1];
}

function loadQuotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveQuotes(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

function emptyQuote(overrides = {}) {
  const now = Date.now();
  return {
    id: makeId('q'),
    text: '',
    attribution: '',
    sourceType: 'blog-post',
    sourceTitle: '',
    sourceUrl: '',
    sourcePostId: null,
    date: todayISO(),
    tags: [],
    imageDataUrl: '',
    usedOn: [],
    pinned: false,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function lastUsedTime(q) {
  const arr = Array.isArray(q.usedOn) ? q.usedOn : [];
  if (arr.length === 0) return 0;
  let max = 0;
  for (const u of arr) {
    if (!u || !u.date) continue;
    const t = new Date(u.date).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

/* ─── Toast ───────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="bq-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

/* ─── New Quote Modal ─────────────────────────────────────── */
function NewQuoteModal({ onSave, onClose }) {
  const [text, setText]               = useState('');
  const [attribution, setAttribution] = useState('');
  const [sourceType, setSourceType]   = useState('blog-post');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl]     = useState('');
  const [date, setDate]               = useState(todayISO());
  const [tagDraft, setTagDraft]       = useState('');
  const [tags, setTags]               = useState([]);
  const [error, setError]             = useState('');

  function addTag() {
    const v = tagDraft.trim();
    if (!v) return;
    if (tags.some(t => t.toLowerCase() === v.toLowerCase())) {
      setTagDraft('');
      return;
    }
    setTags([...tags, v]);
    setTagDraft('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Quote text is required.');
      return;
    }
    onSave({
      text: trimmed,
      attribution: attribution.trim(),
      sourceType,
      sourceTitle: sourceTitle.trim(),
      sourceUrl: sourceUrl.trim(),
      date,
      tags,
    });
  }

  return (
    <div className="bq-modal-overlay" onClick={onClose}>
      <form className="bq-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="bq-modal-head">
          <span className="bq-modal-title">New Quote</span>
          <button type="button" className="bq-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="bq-error">{error}</div>}

        <label className="bq-modal-label">Quote text *</label>
        <textarea
          className="bq-inp bq-textarea"
          placeholder='"Aslan is on the move…"'
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          autoFocus
        />

        <label className="bq-modal-label">Attribution</label>
        <input
          className="bq-inp"
          placeholder="C.S. Lewis"
          value={attribution}
          onChange={e => setAttribution(e.target.value)}
        />

        <div className="bq-modal-row">
          <div className="bq-modal-col">
            <label className="bq-modal-label">Source type</label>
            <select
              className="bq-inp"
              value={sourceType}
              onChange={e => setSourceType(e.target.value)}
            >
              {SOURCE_TYPES.map(s => (
                <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
              ))}
            </select>
          </div>
          <div className="bq-modal-col">
            <label className="bq-modal-label">Date</label>
            <input
              type="date"
              className="bq-inp"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <label className="bq-modal-label">Source title</label>
        <input
          className="bq-inp"
          placeholder="Mere Christianity"
          value={sourceTitle}
          onChange={e => setSourceTitle(e.target.value)}
        />

        <label className="bq-modal-label">Source URL (optional)</label>
        <input
          className="bq-inp"
          placeholder="https://…"
          value={sourceUrl}
          onChange={e => setSourceUrl(e.target.value)}
        />

        <label className="bq-modal-label">Tags</label>
        <div className="bq-chip-input">
          <div className="bq-chip-list">
            {tags.map((t, i) => (
              <span key={i} className="bq-tag-chip">
                {t}
                <button
                  type="button"
                  className="bq-tag-chip-x"
                  onClick={() => setTags(tags.filter(x => x !== t))}
                >✕</button>
              </span>
            ))}
            <input
              className="bq-chip-inp"
              placeholder={tags.length ? 'Add another…' : 'Type a tag and press Enter…'}
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                  e.preventDefault();
                  setTags(tags.slice(0, -1));
                }
              }}
              onBlur={addTag}
            />
          </div>
        </div>

        <div className="bq-modal-foot">
          <button type="button" className="bq-btn bq-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="bq-btn bq-btn-accent">Save Quote</button>
        </div>
      </form>
    </div>
  );
}

/* ─── Add usage inline form ───────────────────────────────── */
function AddUsageForm({ onAdd }) {
  const [platform, setPlatform] = useState('instagram');
  const [date, setDate]         = useState(todayISO());
  const [notes, setNotes]       = useState('');
  const [url, setUrl]           = useState('');

  function handleAdd() {
    onAdd({
      id: makeId('u'),
      platform,
      date,
      notes: notes.trim(),
      url: url.trim(),
    });
    setNotes('');
    setUrl('');
    setDate(todayISO());
  }

  return (
    <div className="bq-add-usage">
      <select
        className="bq-inp bq-inp-sm"
        value={platform}
        onChange={e => setPlatform(e.target.value)}
        aria-label="Platform"
      >
        {PLATFORMS.map(p => (
          <option key={p.key} value={p.key}>{p.icon} {p.label}</option>
        ))}
      </select>
      <input
        type="date"
        className="bq-inp bq-inp-sm"
        value={date}
        onChange={e => setDate(e.target.value)}
        aria-label="Date used"
      />
      <input
        className="bq-inp bq-inp-sm"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <input
        className="bq-inp bq-inp-sm"
        placeholder="URL (optional)"
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      <button type="button" className="bq-btn bq-btn-accent bq-btn-sm" onClick={handleAdd}>
        + Add usage
      </button>
    </div>
  );
}

/* ─── Quote Card (collapsed) ──────────────────────────────── */
function QuoteCard({
  quote, expanded, onToggleExpand, onEdit,
}) {
  const meta = sourceMeta(quote.sourceType);
  const tags = Array.isArray(quote.tags) ? quote.tags : [];
  const usedOn = Array.isArray(quote.usedOn) ? quote.usedOn : [];

  return (
    <article
      className={`bq-card${quote.pinned ? ' is-pinned' : ''}${expanded ? ' is-expanded' : ''}`}
      onClick={onToggleExpand}
    >
      <div className="bq-card-top">
        <span className="bq-card-source-icon" title={meta.label}>{meta.icon}</span>
        {quote.pinned && <span className="bq-card-pin" title="Pinned">📌</span>}
      </div>

      {quote.imageDataUrl && (
        <div
          className="bq-card-thumb"
          style={{ backgroundImage: `url(${quote.imageDataUrl})` }}
          aria-hidden="true"
        />
      )}

      <blockquote className="bq-card-quote">
        <span className="bq-mark bq-mark-l" aria-hidden="true">❝</span>
        <span className="bq-card-text">{quote.text || 'Untitled quote'}</span>
        <span className="bq-mark bq-mark-r" aria-hidden="true">❞</span>
      </blockquote>

      {quote.attribution && (
        <div className="bq-card-attr">— {quote.attribution}</div>
      )}

      {(quote.sourceTitle || quote.sourceUrl) && (
        <div className="bq-card-source">
          {quote.sourceUrl ? (
            <a
              className="bq-source-chip bq-source-chip-link"
              href={quote.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              {meta.icon} {quote.sourceTitle || quote.sourceUrl}
            </a>
          ) : (
            <span className="bq-source-chip">
              {meta.icon} {quote.sourceTitle}
            </span>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="bq-card-tags">
          {tags.slice(0, 3).map((t, i) => (
            <span key={i} className="bq-tag-mini">{t}</span>
          ))}
          {tags.length > 3 && (
            <span className="bq-tag-mini bq-tag-mini-more">+{tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="bq-card-foot">
        {usedOn.length === 0 ? (
          <span className="bq-card-unused">Not yet used</span>
        ) : (
          <div className="bq-used-row" title={`Used ${usedOn.length} time${usedOn.length !== 1 ? 's' : ''}`}>
            {usedOn.slice(0, 6).map(u => (
              <span key={u.id} className="bq-used-icon" title={`${platformMeta(u.platform).label} — ${formatDate(u.date)}`}>
                {platformMeta(u.platform).icon}
              </span>
            ))}
            {usedOn.length > 6 && (
              <span className="bq-used-more">+{usedOn.length - 6}</span>
            )}
          </div>
        )}
        <div className="bq-card-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="bq-card-action"
            onClick={onEdit}
            title="Edit"
          >
            ✎
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─── Inline expanded editor (rendered as a card) ─────────── */
function QuoteEditor({
  quote, posts, onChange, onAddUsage, onRemoveUsage,
  onCopy, onUploadImage, onRemoveImage, onTogglePin,
  onDelete, armedDelete, onCollapse,
}) {
  const [tagDraft, setTagDraft] = useState('');
  const [postQuery, setPostQuery] = useState(() => {
    if (!quote.sourcePostId) return '';
    const found = posts.find(p => String(p.id) === String(quote.sourcePostId));
    return found ? (found.title || '') : '';
  });
  const [showPostList, setShowPostList] = useState(false);
  const fileRef = useRef(null);

  const tags = Array.isArray(quote.tags) ? quote.tags : [];
  const usedOn = Array.isArray(quote.usedOn) ? quote.usedOn : [];
  const meta = sourceMeta(quote.sourceType);

  const postMatches = useMemo(() => {
    const q = postQuery.trim().toLowerCase();
    if (!posts || posts.length === 0) return [];
    if (!q) return posts.slice(0, 8);
    return posts
      .filter(p =>
        ((p.title || '').toLowerCase().includes(q)) ||
        ((p.author || '').toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [posts, postQuery]);

  const pickedPost = useMemo(
    () => quote.sourcePostId
      ? posts.find(p => String(p.id) === String(quote.sourcePostId)) || null
      : null,
    [posts, quote.sourcePostId]
  );

  function addTag() {
    const v = tagDraft.trim();
    if (!v) return;
    if (tags.some(t => t.toLowerCase() === v.toLowerCase())) {
      setTagDraft('');
      return;
    }
    onChange({ tags: [...tags, v] });
    setTagDraft('');
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`Image is larger than 2MB (${(file.size / 1024 / 1024).toFixed(1)}MB). Consider a smaller file — large images bloat localStorage.`);
    }
    const reader = new FileReader();
    reader.onload = () => onUploadImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <article className={`bq-card bq-card-editor${quote.pinned ? ' is-pinned' : ''} is-expanded`}>
      <div className="bq-edit-head">
        <span className="bq-card-source-icon" title={meta.label}>{meta.icon}</span>
        <button
          type="button"
          className={`bq-pin-btn${quote.pinned ? ' on' : ''}`}
          onClick={onTogglePin}
          title={quote.pinned ? 'Unpin' : 'Pin to top'}
        >
          📌
        </button>
        <span className="bq-edit-id">{quote.text ? 'Editing quote' : 'New quote'}</span>
        <button
          type="button"
          className="bq-edit-collapse"
          onClick={onCollapse}
          title="Collapse"
          aria-label="Collapse editor"
        >
          ✕
        </button>
      </div>

      <div className="bq-field">
        <label className="bq-label">Quote text</label>
        <textarea
          className="bq-inp bq-textarea bq-quote-edit"
          placeholder="The quote itself…"
          value={quote.text || ''}
          rows={4}
          onChange={e => onChange({ text: e.target.value })}
        />
      </div>

      <div className="bq-field">
        <label className="bq-label">Attribution</label>
        <input
          className="bq-inp"
          placeholder="C.S. Lewis"
          value={quote.attribution || ''}
          onChange={e => onChange({ attribution: e.target.value })}
        />
      </div>

      <div className="bq-edit-grid">
        <div className="bq-field">
          <label className="bq-label">Source type</label>
          <select
            className="bq-inp"
            value={quote.sourceType || 'blog-post'}
            onChange={e => onChange({ sourceType: e.target.value })}
          >
            {SOURCE_TYPES.map(s => (
              <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
            ))}
          </select>
        </div>
        <div className="bq-field">
          <label className="bq-label">Date</label>
          <input
            type="date"
            className="bq-inp"
            value={quote.date || ''}
            onChange={e => onChange({ date: e.target.value })}
          />
        </div>
      </div>

      <div className="bq-field">
        <label className="bq-label">Source title</label>
        <input
          className="bq-inp"
          placeholder="Mere Christianity"
          value={quote.sourceTitle || ''}
          onChange={e => onChange({ sourceTitle: e.target.value })}
        />
      </div>

      <div className="bq-field">
        <label className="bq-label">Source URL</label>
        <input
          className="bq-inp"
          placeholder="https://…"
          value={quote.sourceUrl || ''}
          onChange={e => onChange({ sourceUrl: e.target.value })}
        />
      </div>

      <div className="bq-field">
        <label className="bq-label">Link to blog post (optional)</label>
        <div className="bq-post-autocomplete">
          {pickedPost ? (
            <div className="bq-post-picked">
              <span className="bq-post-picked-title">📰 {pickedPost.title || 'Untitled post'}</span>
              <button
                type="button"
                className="bq-post-clear"
                onClick={() => {
                  onChange({ sourcePostId: null });
                  setPostQuery('');
                }}
                title="Clear post link"
              >✕</button>
            </div>
          ) : (
            <>
              <input
                className="bq-inp"
                placeholder={posts.length === 0 ? 'No blog posts found in storage…' : 'Search blog posts…'}
                value={postQuery}
                onChange={e => { setPostQuery(e.target.value); setShowPostList(true); }}
                onFocus={() => setShowPostList(true)}
                onBlur={() => setTimeout(() => setShowPostList(false), 180)}
                disabled={posts.length === 0}
              />
              {showPostList && postMatches.length > 0 && (
                <div className="bq-post-dropdown">
                  {postMatches.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="bq-post-option"
                      onMouseDown={e => {
                        e.preventDefault();
                        onChange({ sourcePostId: p.id, sourceTitle: quote.sourceTitle || p.title || '' });
                        setPostQuery(p.title || '');
                        setShowPostList(false);
                      }}
                    >
                      <span className="bq-post-option-title">{p.title || 'Untitled'}</span>
                      {p.author && <span className="bq-post-option-author">{p.author}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bq-field">
        <label className="bq-label">Tags</label>
        <div className="bq-chip-input">
          <div className="bq-chip-list">
            {tags.map((t, i) => (
              <span key={i} className="bq-tag-chip">
                {t}
                <button
                  type="button"
                  className="bq-tag-chip-x"
                  onClick={() => onChange({ tags: tags.filter(x => x !== t) })}
                >✕</button>
              </span>
            ))}
            <input
              className="bq-chip-inp"
              placeholder={tags.length ? 'Add another…' : 'Type a tag and press Enter…'}
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                  e.preventDefault();
                  onChange({ tags: tags.slice(0, -1) });
                }
              }}
              onBlur={addTag}
            />
          </div>
        </div>
      </div>

      <div className="bq-field">
        <label className="bq-label">Image (optional)</label>
        <div className="bq-image-row">
          {quote.imageDataUrl ? (
            <>
              <div
                className="bq-image-thumb"
                style={{ backgroundImage: `url(${quote.imageDataUrl})` }}
              />
              <div className="bq-image-actions">
                <button
                  type="button"
                  className="bq-btn bq-btn-ghost bq-btn-sm"
                  onClick={() => fileRef.current?.click()}
                >Replace</button>
                <button
                  type="button"
                  className="bq-btn bq-btn-danger bq-btn-sm"
                  onClick={onRemoveImage}
                >Remove</button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="bq-btn bq-btn-ghost"
              onClick={() => fileRef.current?.click()}
            >
              + Upload image
            </button>
          )}
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>
      </div>

      <div className="bq-field">
        <label className="bq-label">
          Used on{' '}
          <span className="bq-used-count">
            ({usedOn.length} time{usedOn.length !== 1 ? 's' : ''})
          </span>
        </label>
        <div className="bq-usage-list">
          {usedOn.length === 0 && (
            <div className="bq-muted bq-usage-empty">Not yet used anywhere.</div>
          )}
          {usedOn.map(u => {
            const pm = platformMeta(u.platform);
            return (
              <div key={u.id} className="bq-usage-row">
                <span className="bq-usage-icon" title={pm.label}>{pm.icon}</span>
                <span className="bq-usage-platform">{pm.label}</span>
                <span className="bq-usage-date">{formatDate(u.date)}</span>
                {u.notes && <span className="bq-usage-notes">{u.notes}</span>}
                {u.url && (
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bq-usage-link"
                    title={u.url}
                  >
                    🔗
                  </a>
                )}
                <button
                  type="button"
                  className="bq-usage-remove"
                  onClick={() => onRemoveUsage(u.id)}
                  title="Remove this usage"
                >✕</button>
              </div>
            );
          })}
        </div>
        <AddUsageForm onAdd={onAddUsage} />
      </div>

      <div className="bq-field">
        <label className="bq-label">Internal notes</label>
        <textarea
          className="bq-inp bq-textarea"
          placeholder="Notes for the team…"
          rows={3}
          value={quote.notes || ''}
          onChange={e => onChange({ notes: e.target.value })}
        />
      </div>

      <div className="bq-edit-foot">
        <button
          type="button"
          className="bq-btn bq-btn-ghost"
          onClick={onCopy}
          title="Copy formatted quote to clipboard"
        >
          📋 Copy as image-text
        </button>
        <button
          type="button"
          className={`bq-btn${armedDelete ? ' bq-btn-danger-armed' : ' bq-btn-danger'}`}
          onClick={onDelete}
          title={armedDelete ? 'Click again to confirm' : 'Delete quote'}
        >
          {armedDelete ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>
    </article>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export default function BlogQuotes() {
  /* Quotes live in Firestore at /users/{uid}/kv/blog:quotes.
     Posts read for autocomplete — same user, kept fresh via onSnapshot. */
  const [quotes, setQuotes]   = useUserStoreKey('blog:quotes', []);
  const [posts]               = useUserStoreKey('blog:posts',  []);
  const [filter, setFilter]   = useState('all');         // all | used | unused
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sort, setSort]       = useState('newest');
  const [query, setQuery]     = useState('');
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [toast, setToast]     = useState('');

  const armTimerRef   = useRef(null);
  const toastTimerRef = useRef(null);

  /* ── Auto-disarm delete after 3s ─────────────────────────── */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* ── Auto-clear toast ─────────────────────────────────────── */
  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2200);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toast]);

  /* ── Reset armed-delete when expansion changes ───────────── */
  useEffect(() => {
    setArmedDelete(false);
  }, [expandedId]);

  /* ── Derived: counts ─────────────────────────────────────── */
  const usedCount = useMemo(
    () => quotes.filter(q => Array.isArray(q.usedOn) && q.usedOn.length > 0).length,
    [quotes]
  );
  const unusedCount = quotes.length - usedCount;
  const usedPct = quotes.length === 0 ? 0 : Math.round((usedCount / quotes.length) * 100);
  const unusedPct = quotes.length === 0 ? 0 : Math.round((unusedCount / quotes.length) * 100);

  const platformCounts = useMemo(() => {
    const counts = {};
    for (const q of quotes) {
      const arr = Array.isArray(q.usedOn) ? q.usedOn : [];
      for (const u of arr) {
        if (!u || !u.platform) continue;
        counts[u.platform] = (counts[u.platform] || 0) + 1;
      }
    }
    let topKey = null, topCount = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > topCount) { topCount = v; topKey = k; }
    }
    return { counts, topKey, topCount };
  }, [quotes]);

  /* ── Derived: filtered + sorted ──────────────────────────── */
  const visibleQuotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = quotes.filter(item => {
      const used = Array.isArray(item.usedOn) && item.usedOn.length > 0;
      if (filter === 'used' && !used) return false;
      if (filter === 'unused' && used) return false;
      if (sourceFilter !== 'all' && item.sourceType !== sourceFilter) return false;
      if (!q) return true;
      const tagsStr = (Array.isArray(item.tags) ? item.tags : []).join(' ').toLowerCase();
      return (
        (item.text || '').toLowerCase().includes(q) ||
        (item.attribution || '').toLowerCase().includes(q) ||
        (item.sourceTitle || '').toLowerCase().includes(q) ||
        tagsStr.includes(q)
      );
    });

    list.sort((a, b) => {
      // Pinned float to top regardless of sort
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      switch (sort) {
        case 'most-used': {
          const ua = (a.usedOn || []).length;
          const ub = (b.usedOn || []).length;
          if (ub !== ua) return ub - ua;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }
        case 'alpha': {
          return (a.text || '').localeCompare(b.text || '');
        }
        case 'recent-used': {
          return lastUsedTime(b) - lastUsedTime(a);
        }
        case 'newest':
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });

    return list;
  }, [quotes, filter, sourceFilter, sort, query]);

  /* ── Mutators ────────────────────────────────────────────── */
  const updateQuote = useCallback((id, patch) => {
    setQuotes(prev => prev.map(q =>
      q.id === id ? { ...q, ...patch, updatedAt: Date.now() } : q
    ));
  }, []);

  const handleCreate = useCallback((data) => {
    const q = emptyQuote(data);
    setQuotes(prev => [q, ...prev]);
    setShowNew(false);
    setExpandedId(q.id);
  }, []);

  const handleDelete = useCallback((id) => {
    if (!armedDelete) { setArmedDelete(true); return; }
    setQuotes(prev => prev.filter(q => q.id !== id));
    setExpandedId(null);
    setArmedDelete(false);
  }, [armedDelete]);

  const handleAddUsage = useCallback((id, usage) => {
    setQuotes(prev => prev.map(q =>
      q.id === id
        ? { ...q, usedOn: [...(q.usedOn || []), usage], updatedAt: Date.now() }
        : q
    ));
    setToast('Usage added');
  }, []);

  const handleRemoveUsage = useCallback((id, usageId) => {
    setQuotes(prev => prev.map(q =>
      q.id === id
        ? { ...q, usedOn: (q.usedOn || []).filter(u => u.id !== usageId), updatedAt: Date.now() }
        : q
    ));
  }, []);

  const handleTogglePin = useCallback((id) => {
    setQuotes(prev => prev.map(q =>
      q.id === id
        ? { ...q, pinned: !q.pinned, updatedAt: Date.now() }
        : q
    ));
  }, []);

  const handleCopy = useCallback(async (q) => {
    const attr = q.attribution ? ` — ${q.attribution}` : '';
    const src  = q.sourceTitle ? `\n\n(source: ${q.sourceTitle})` : '';
    const text = `"❝${q.text || ''}❞"${attr}${src}`;
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied to clipboard');
    } catch {
      // Fallback for older browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setToast('Copied to clipboard');
      } catch {
        setToast('Copy failed — your browser blocked clipboard access');
      }
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilter('all');
    setSourceFilter('all');
    setQuery('');
    setSort('newest');
  }, []);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <BlogShell title="Quotes Library" icon="❝" subtitle="Reusable quotes and pull-lines for posts, social graphics, and newsletters." fullBleed>
    <div className="bq-root">
      <main className="bq-main">
        {/* ── Top bar ── */}
        <header className="bq-topbar">
          <div className="bq-topbar-titles">
            <h1 className="bq-title">Quotes Library</h1>
            <p className="bq-subtitle">
              A bank of pull-quote snippets ready for social media — track who said it,
              where you found it, and where you've shared it.
            </p>
          </div>

          <div className="bq-topbar-controls">
            <select
              className="bq-inp bq-select"
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              aria-label="Filter by source type"
              title="Filter by source type"
            >
              <option value="all">All sources</option>
              {SOURCE_TYPES.map(s => (
                <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
              ))}
            </select>

            <select
              className="bq-inp bq-select"
              value={sort}
              onChange={e => setSort(e.target.value)}
              aria-label="Sort"
              title="Sort"
            >
              {SORTS.map(s => (
                <option key={s.key} value={s.key}>Sort: {s.label}</option>
              ))}
            </select>

            <input
              className="bq-inp bq-search"
              placeholder="Search text, attribution, source, tags…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />

            <button
              type="button"
              className="bq-btn bq-btn-accent"
              onClick={() => setShowNew(true)}
            >
              + New Quote
            </button>
          </div>
        </header>

        {/* ── Stats row (sibling of topbar, not nested in controls) ── */}
        <div className="bq-stats">
          <div className="bq-stat">
            <span className="bq-stat-value">{quotes.length}</span>
            <span className="bq-stat-label">Total quotes</span>
          </div>
          <div className="bq-stat">
            <span className="bq-stat-value">{usedCount}</span>
            <span className="bq-stat-label">
              Used {quotes.length > 0 && <span className="bq-stat-pct">({usedPct}%)</span>}
            </span>
          </div>
          <div className={`bq-stat${quotes.length > 0 && unusedCount > quotes.length / 2 ? ' bq-stat-warn' : ''}`}>
            <span className="bq-stat-value">{unusedCount}</span>
            <span className="bq-stat-label">
              Unused {quotes.length > 0 && <span className="bq-stat-pct">({unusedPct}%)</span>}
            </span>
          </div>
          <div className="bq-stat">
            <span className="bq-stat-value">
              {platformCounts.topKey
                ? <>{platformMeta(platformCounts.topKey).icon} {platformCounts.topCount}</>
                : '—'
              }
            </span>
            <span className="bq-stat-label">
              Top platform{platformCounts.topKey ? ` (${platformMeta(platformCounts.topKey).label})` : ''}
            </span>
          </div>
        </div>

        {/* ── Grid ── */}
        {quotes.length === 0 && (
          <div className="bq-empty">
            <div className="bq-empty-icon" aria-hidden="true">❝</div>
            <div className="bq-empty-title">No quotes yet</div>
            <div className="bq-empty-sub">
              Capture pull-quotes from blog posts, sermons, books, and devotionals so
              they're ready when it's time to post.
            </div>
            <button
              type="button"
              className="bq-btn bq-btn-accent bq-empty-cta"
              onClick={() => setShowNew(true)}
            >
              + Add your first quote
            </button>
          </div>
        )}

        {quotes.length > 0 && visibleQuotes.length === 0 && (
          <div className="bq-empty">
            <div className="bq-empty-icon" aria-hidden="true">🔍</div>
            <div className="bq-empty-title">No quotes match these filters</div>
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-empty-cta"
              onClick={handleResetFilters}
            >
              Reset filters
            </button>
          </div>
        )}

        {visibleQuotes.length > 0 && (
          <div className="bq-grid">
            {visibleQuotes.map(q => {
              const isExpanded = expandedId === q.id;
              if (isExpanded) {
                return (
                  <QuoteEditor
                    key={q.id}
                    quote={q}
                    posts={posts}
                    onChange={(patch) => updateQuote(q.id, patch)}
                    onAddUsage={(u) => handleAddUsage(q.id, u)}
                    onRemoveUsage={(uid) => handleRemoveUsage(q.id, uid)}
                    onCopy={() => handleCopy(q)}
                    onUploadImage={(dataUrl) => updateQuote(q.id, { imageDataUrl: dataUrl })}
                    onRemoveImage={() => updateQuote(q.id, { imageDataUrl: '' })}
                    onTogglePin={() => handleTogglePin(q.id)}
                    onDelete={() => handleDelete(q.id)}
                    armedDelete={armedDelete}
                    onCollapse={() => setExpandedId(null)}
                  />
                );
              }
              return (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  expanded={false}
                  onToggleExpand={() => setExpandedId(q.id)}
                  onEdit={() => setExpandedId(q.id)}
                />
              );
            })}
          </div>
        )}
      </main>

      {showNew && (
        <NewQuoteModal
          onSave={handleCreate}
          onClose={() => setShowNew(false)}
        />
      )}

      <Toast message={toast} />
    </div>
    </BlogShell>
  );
}
