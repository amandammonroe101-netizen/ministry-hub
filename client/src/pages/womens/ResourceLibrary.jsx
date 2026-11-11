import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { SUGGESTED_AUTHORS, WORK_TYPE_ORDER, ASPECT_LIST, getWorkTypeMeta } from './suggestedAuthors';
import { WORK_DETAILS, getCoverUrl } from './workDetails';
import { lookupBookWithAI, searchBooksByAuthor, searchAuthorsByTitle } from './aiBookLookup';
import './ResourceLibrary.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Resource Library

   Browse + save: a curated shelf of suggested authors/speakers
   who've written devotionals, books, and Bible study walkthroughs.
   Tapping an author drills into a dedicated page listing their
   full body of work; each work can be saved to "My Saved"
   (womens:saved-resources) for quick access later.

   Styled to match Life Stages (LifeStages.css) — same rose-gold
   embossed surfaces, cursive shimmer headings — see the token
   block at the top of ResourceLibrary.css.

   This is intentionally browse + save only — no add/edit/delete
   UI. The suggested catalog lives in code (suggestedAuthors.js).
   Any resources a leader had already added under the old flat
   "womens:resource-library" list are grouped by their author
   field and merged in read-only, so nothing already entered
   is lost in the switch to this author-first layout.
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

function slugify(name) {
  return (name || 'author').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'author';
}

function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Legacy "womens:resource-library" entries were flat resources with
 *  a free-text `author` field. Group them into author records so the
 *  old data still shows up here instead of disappearing. */
function groupLegacyIntoAuthors(legacyList) {
  const byAuthor = new Map();
  (Array.isArray(legacyList) ? legacyList : []).forEach((r) => {
    const name = (r.author || '').trim();
    if (!name) return; // no author to group under — skip rather than guess
    const key = name.toLowerCase();
    if (!byAuthor.has(key)) {
      byAuthor.set(key, {
        id: 'auth_legacy_' + key.replace(/[^a-z0-9]+/g, '-'),
        name,
        tagline: 'Added to your library',
        bio: '',
        tags: [],
        legacy: true,
        works: [],
      });
    }
    byAuthor.get(key).works.push({
      id: r.id || makeId('wrk'),
      title: r.title || '(untitled resource)',
      type: r.type || 'book',
      description: r.description || '',
      url: r.url || '',
    });
  });
  return Array.from(byAuthor.values());
}

export default function ResourceLibrary() {
  const [legacyResources] = useUserStoreKey('womens:resource-library', []);
  const [saved, setSaved] = useUserStoreKey('womens:saved-resources', []);
  const [customAuthors, setCustomAuthors] = useUserStoreKey('womens:custom-authors', []);
  const [extraWorks, setExtraWorks] = useUserStoreKey('womens:extra-works', []);
  const [customDetails, setCustomDetails] = useUserStoreKey('womens:custom-work-details', {});

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openAuthorId, setOpenAuthorId] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [aspectFilter, setAspectFilter] = useState(null);
  const [addBookAuthor, setAddBookAuthor] = useState(null); // null closed, {} = blank, or an author to pin to

  const authors = useMemo(() => {
    const legacyAuthors = groupLegacyIntoAuthors(legacyResources);
    const extrasByAuthor = Array.isArray(extraWorks) ? extraWorks : [];
    const builtinWithExtras = SUGGESTED_AUTHORS.map((a) => {
      const extras = extrasByAuthor.filter((e) => e.authorId === a.id).map((e) => e.work);
      return extras.length ? { ...a, works: [...a.works, ...extras] } : a;
    });
    const customList = (Array.isArray(customAuthors) ? customAuthors : []).map((a) => ({ ...a, custom: true }));
    return [...builtinWithExtras, ...customList, ...legacyAuthors];
  }, [legacyResources, extraWorks, customAuthors]);

  /** Adds a new book, generated via lookupBookWithAI, to the library.
   *  If `targetAuthorId` matches an existing author (built-in or custom)
   *  the book is appended to their works; otherwise a brand-new custom
   *  author card is created using the AI-generated bio. */
  const addGeneratedBook = ({ targetAuthorId, authorName, authorTagline, authorBio, work, detail }) => {
    const key = targetAuthorId + '::' + work.id;
    if (detail && Object.keys(detail).length > 0) {
      setCustomDetails((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [key]: detail }));
    }
    const existingBuiltin = SUGGESTED_AUTHORS.some((a) => a.id === targetAuthorId);
    if (existingBuiltin) {
      setExtraWorks((prev) => [...(Array.isArray(prev) ? prev : []), { authorId: targetAuthorId, work }]);
      return;
    }
    setCustomAuthors((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex((a) => a.id === targetAuthorId);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], works: [...next[idx].works, work] };
        return next;
      }
      return [...list, {
        id: targetAuthorId,
        name: authorName,
        tagline: authorTagline || '',
        bio: authorBio || '',
        tags: [],
        works: [work],
      }];
    });
  };

  const savedSet = useMemo(
    () => new Set((Array.isArray(saved) ? saved : []).map((s) => s.key)),
    [saved]
  );

  const toggleSave = (author, work) => {
    const key = author.id + '::' + work.id;
    setSaved((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (list.some((s) => s.key === key)) return list.filter((s) => s.key !== key);
      return [...list, {
        key,
        authorId: author.id,
        authorName: author.name,
        workId: work.id,
        workTitle: work.title,
        workType: work.type,
        workDescription: work.description || '',
        workUrl: work.url || '',
        savedAt: Date.now(),
      }];
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = authors;
    if (typeFilter !== 'all') out = out.filter((a) => a.works.some((w) => (w.type || 'book') === typeFilter));
    if (aspectFilter) out = out.filter((a) => a.works.some((w) => Array.isArray(w.aspects) && w.aspects.includes(aspectFilter)));
    if (q) {
      out = out.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.tagline || '').toLowerCase().includes(q) ||
        (Array.isArray(a.tags) ? a.tags : []).some((t) => t.toLowerCase().includes(q)) ||
        a.works.some((w) => (w.title || '').toLowerCase().includes(q)));
    }
    return [...out].sort((a, b) => a.name.localeCompare(b.name));
  }, [authors, query, typeFilter, aspectFilter]);

  const openAuthor = useMemo(() => authors.find((a) => a.id === openAuthorId) || null, [authors, openAuthorId]);

  const stats = useMemo(() => {
    const totalWorks = authors.reduce((n, a) => n + a.works.length, 0);
    return {
      authors: authors.length,
      works: totalWorks,
      saved: Array.isArray(saved) ? saved.length : 0,
    };
  }, [authors, saved]);

  if (openAuthor) {
    return (
      <WomensShell
        title="Resource Library"
        icon="📚"
        subtitle="Author page"
        avatarInitials={initials}
        avatarTitle={avatarSourceName}
        onProfileClick={() => setShowProfile(true)}
      >
        <div className="rl-root">
          <AuthorView
            key={openAuthor.id}
            author={openAuthor}
            savedSet={savedSet}
            onToggleSave={(work) => toggleSave(openAuthor, work)}
            onBack={() => setOpenAuthorId(null)}
            aspectFilter={aspectFilter}
            onClearAspect={() => setAspectFilter(null)}
            customDetails={customDetails}
            onAddBook={() => setAddBookAuthor(openAuthor)}
          />
        </div>
        <ProfileModal
          open={showProfile}
          onClose={() => setShowProfile(false)}
          pageTabLabel="🌷 Customize Menu"
          pageSettings={<WomensMenuSettings />}
        />

        {addBookAuthor && (
          <AddBookModal
            pinnedAuthor={addBookAuthor.id ? addBookAuthor : null}
            authors={authors}
            onClose={() => setAddBookAuthor(null)}
            onSave={addGeneratedBook}
          />
        )}
      </WomensShell>
    );
  }

  return (
    <WomensShell
      title="Resource Library"
      icon="📚"
      subtitle="Suggested authors and speakers who've written devotionals, books, and Bible study walkthroughs — open an author to browse their full list of work and save what you want to come back to."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="rl-root">
        <div className="rl-panel">
          <div className="rl-stat-row">
            <div className="rl-stat">
              <span className="rl-stat-n">{stats.authors}</span>
              <span className="rl-stat-lbl">Authors & Speakers</span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-n">{stats.works}</span>
              <span className="rl-stat-lbl">Works</span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-n">{stats.saved}</span>
              <span className="rl-stat-lbl">Saved</span>
            </div>
          </div>

          <div className="rl-controls">
            <div className="rl-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by author, topic, or work title…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && <button type="button" className="rl-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>

          <div className="rl-filter-row">
            <button
              type="button"
              className={`rl-filter-chip ${typeFilter === 'all' ? 'on' : ''}`}
              onClick={() => setTypeFilter('all')}
            >All types</button>
            {WORK_TYPE_ORDER.map((id) => {
              const meta = getWorkTypeMeta(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`rl-filter-chip ${typeFilter === id ? 'on' : ''}`}
                  onClick={() => setTypeFilter(id)}
                >{meta.icon} {meta.label}</button>
              );
            })}
          </div>

          <div className="rl-aspect-label">Filter by theme</div>
          <div className="rl-filter-row rl-aspect-row">
            <button
              type="button"
              className={`rl-filter-chip ${!aspectFilter ? 'on' : ''}`}
              onClick={() => setAspectFilter(null)}
            >All themes</button>
            {ASPECT_LIST.map((aspect) => (
              <button
                key={aspect}
                type="button"
                className={`rl-filter-chip ${aspectFilter === aspect ? 'on' : ''}`}
                onClick={() => setAspectFilter((prev) => (prev === aspect ? null : aspect))}
              >{aspect}</button>
            ))}
          </div>
        </div>

        <div className="rl-panel">
          <h3 className="rl-panel-subtitle">Suggested authors & speakers</h3>
          {visible.length === 0 ? (
            <div className="rl-empty-note">
              {query ? `No authors match "${query}".` : 'No authors match this filter.'}
            </div>
          ) : (
            <div className="rl-author-grid">
              {visible.map((a) => (
                <AuthorCard key={a.id} author={a} onClick={() => setOpenAuthorId(a.id)} aspectFilter={aspectFilter} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
      {addBookAuthor && (
        <AddBookModal
          pinnedAuthor={addBookAuthor.id ? addBookAuthor : null}
          authors={authors}
          onClose={() => setAddBookAuthor(null)}
          onSave={addGeneratedBook}
        />
      )}
    </WomensShell>
  );
}

/* ── Author directory card ──────────────────────────────────── */
function AuthorCard({ author, onClick, aspectFilter }) {
  const tags = Array.isArray(author.tags) ? author.tags : [];
  const workCount = author.works.length;
  const matchCount = aspectFilter
    ? author.works.filter((w) => Array.isArray(w.aspects) && w.aspects.includes(aspectFilter)).length
    : null;
  return (
    <button type="button" className="rl-author-card" onClick={onClick}>
      {author.focusWomen && <span className="rl-women-badge">Specifically Women</span>}
      <div className="rl-author-card-top">
        <span className="rl-author-avatar">{initialsFor(author.name)}</span>
        <div className="rl-author-heading">
          <h3 className="rl-author-card-name">{author.name}</h3>
          {author.tagline && <p className="rl-author-card-tagline">{author.tagline}</p>}
        </div>
      </div>
      {matchCount !== null ? (
        <span className="rl-author-card-count is-aspect-match">{matchCount} book{matchCount === 1 ? '' : 's'} on "{aspectFilter}"</span>
      ) : (
        <span className="rl-author-card-count">{workCount} work{workCount === 1 ? '' : 's'}</span>
      )}
      {tags.length > 0 && (
        <div className="rl-tag-row">
          {tags.slice(0, 4).map((t) => <span key={t} className="rl-tag-chip">{t}</span>)}
        </div>
      )}
    </button>
  );
}

/* ── Author page — full list of works, save toggle per work ──── */
const WORKS_PAGE_SIZE = 10;

function AuthorView({ author, savedSet, onToggleSave, onBack, aspectFilter, onClearAspect, customDetails, onAddBook }) {
  const tags = Array.isArray(author.tags) ? author.tags : [];
  const [visibleCount, setVisibleCount] = useState(WORKS_PAGE_SIZE);
  const [detailWork, setDetailWork] = useState(null);
  const filteredWorks = aspectFilter
    ? author.works.filter((w) => Array.isArray(w.aspects) && w.aspects.includes(aspectFilter))
    : author.works;
  const visibleWorks = filteredWorks.slice(0, visibleCount);
  const hasMore = filteredWorks.length > visibleCount;
  return (
    <div className="rl-author-view">
      <button type="button" className="rl-back-btn" onClick={onBack}>← All authors</button>

      <div className="rl-panel">
        {author.focusWomen && <span className="rl-women-badge">Specifically Women</span>}
        <div className="rl-author-header">
          <span className="rl-author-avatar big">{initialsFor(author.name)}</span>
          <div className="rl-author-heading">
            <h2 className="rl-author-name">{author.name}</h2>
            {author.tagline && <p className="rl-author-tagline">{author.tagline}</p>}
            {tags.length > 0 && (
              <div className="rl-tag-row">
                {tags.map((t) => <span key={t} className="rl-tag-chip">{t}</span>)}
              </div>
            )}
          </div>
        </div>
        {author.bio && (
          <div className="rl-author-bio">
            {author.bio.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
          </div>
        )}
      </div>

      <div className="rl-panel">
        <div className="rl-panel-subtitle-row">
          <h3 className="rl-panel-subtitle">Works</h3>
          <div className="rl-panel-subtitle-actions">
            {aspectFilter && (
              <div className="rl-aspect-active">
                <span>Showing only "{aspectFilter}"</span>
                <button type="button" className="rl-aspect-clear" onClick={onClearAspect}>Show all works</button>
              </div>
            )}
            {onAddBook && !author.legacy && (
              <button type="button" className="rl-aspect-clear" onClick={onAddBook}>✨ Add a book by {author.name}</button>
            )}
          </div>
        </div>
        {filteredWorks.length === 0 ? (
          <div className="rl-empty-note">No works match "{aspectFilter}" for this author.</div>
        ) : (
        <div className="rl-work-list">
          {visibleWorks.map((w) => {
            const meta = getWorkTypeMeta(w.type);
            const isSaved = savedSet.has(author.id + '::' + w.id);
            return (
              <div
                className="rl-work-card is-clickable"
                key={w.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailWork(w)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailWork(w); } }}
              >
                <div className="rl-work-top">
                  <span className="rl-work-type">{meta.icon} {meta.label}</span>
                  <button
                    type="button"
                    className={`rl-save-btn ${isSaved ? 'is-saved' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleSave(w); }}
                  >
                    {isSaved ? '★ Saved' : '☆ Save'}
                  </button>
                </div>
                <div className="rl-work-title">{w.title}</div>
                {w.description && <div className="rl-work-desc">{w.description}</div>}
                {w.url && (
                  <a className="rl-work-link" href={w.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open link ↗</a>
                )}
              </div>
            );
          })}
        </div>
        )}
        {hasMore && (
          <button
            type="button"
            className="rl-more-btn"
            onClick={() => setVisibleCount((n) => Math.min(filteredWorks.length, n + WORKS_PAGE_SIZE))}
          >
            ✨ Suggest 10 more
          </button>
        )}
      </div>

      {detailWork && (
        <WorkDetailModal
          author={author}
          work={detailWork}
          isSaved={savedSet.has(author.id + '::' + detailWork.id)}
          onToggleSave={() => onToggleSave(detailWork)}
          onClose={() => setDetailWork(null)}
          customDetails={customDetails}
        />
      )}
    </div>
  );
}

/* ── Work detail popup — cover, pages, chapters, about, date ──── */
function WorkDetailModal({ author, work, isSaved, onToggleSave, onClose, customDetails }) {
  const key = author.id + '::' + work.id;
  const detail = (customDetails && customDetails[key]) || WORK_DETAILS[key] || null;
  const coverUrl = getCoverUrl(detail);
  const meta = getWorkTypeMeta(work.type);
  const hasChapters = Array.isArray(detail?.chapters) && detail.chapters.length > 0;

  return createPortal(
    <div className="rl-root rl-modal-portal">
    <div className="rl-modal-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rl-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="rl-modal-body">
          <div className="rl-modal-cover-col">
            {coverUrl ? (
              <img
                className="rl-modal-cover"
                src={coverUrl}
                alt={`Cover of ${work.title}`}
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
              />
            ) : null}
            <div className="rl-modal-cover-fallback" style={{ display: coverUrl ? 'none' : 'flex' }}>
              {meta.icon}
            </div>
            <button
              type="button"
              className={`rl-save-btn ${isSaved ? 'is-saved' : ''}`}
              onClick={onToggleSave}
            >
              {isSaved ? '★ Saved' : '☆ Save'}
            </button>
          </div>

          <div className="rl-modal-info-col">
            <span className="rl-work-type">{meta.icon} {meta.label}</span>
            <h2 className="rl-modal-title">{work.title}</h2>
            <p className="rl-modal-author">by {author.name}</p>

            <div className="rl-modal-facts">
              {detail?.publishedDate && (
                <div className="rl-modal-fact"><span className="rl-modal-fact-label">Published</span>{detail.publishedDate}</div>
              )}
              {detail?.pages && (
                <div className="rl-modal-fact"><span className="rl-modal-fact-label">Pages</span>{detail.pages}</div>
              )}
              {hasChapters && (
                <div className="rl-modal-fact"><span className="rl-modal-fact-label">Chapters</span>{detail.chapters.length}</div>
              )}
            </div>

            {(detail?.about || work.description) && (
              <div className="rl-modal-about">
                <h3 className="rl-modal-section-title">About this book</h3>
                <p>{detail?.about || work.description}</p>
              </div>
            )}

            {hasChapters && (
              <div className="rl-modal-chapters">
                <h3 className="rl-modal-section-title">Chapters</h3>
                <ol className="rl-modal-chapter-list">
                  {detail.chapters.map((c, i) => <li key={i}>{c}</li>)}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}

function AddBookModal({ pinnedAuthor, authors, onClose, onSave }) {
  const selectableAuthors = useMemo(() => authors.filter((a) => !a.legacy), [authors]);
  const [title, setTitle] = useState('');
  const [authorMode, setAuthorMode] = useState(pinnedAuthor?.id ? 'existing' : 'new');
  const [existingAuthorId, setExistingAuthorId] = useState(pinnedAuthor?.id || (selectableAuthors[0]?.id ?? ''));
  const [newAuthorName, setNewAuthorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [bookChoices, setBookChoices] = useState(null);
  const [authorChoices, setAuthorChoices] = useState(null);

  const targetAuthor = authorMode === 'existing'
    ? selectableAuthors.find((a) => a.id === existingAuthorId) || null
    : null;
  const needsAuthorBio = authorMode === 'new';
  const authorNameForLookup = authorMode === 'existing'
    ? (targetAuthor?.name || '')
    : newAuthorName.trim();

  async function runAiLookup(bookTitle, authorName) {
    setError('');
    setLoading(true);
    setPreview(null);
    try {
      const result = await lookupBookWithAI({
        title: bookTitle,
        authorName,
        needsAuthorBio,
      });
      if (!result || !result.about) {
        setError('AI couldn’t confidently identify this book. Try adding the author’s name, or double-check the title.');
        return;
      }
      setPreview(result);
    } catch {
      setError('Something went wrong looking this up. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      if (!authorNameForLookup) {
        setError('Please enter a book title, or an author name to browse their books.');
        return;
      }
      setError('');
      setLoading(true);
      setBookChoices(null);
      setAuthorChoices(null);
      const results = await searchBooksByAuthor(authorNameForLookup);
      setLoading(false);
      if (!results.length) {
        setError(`No books found for "${authorNameForLookup}" on Open Library. Try entering the exact title instead.`);
        return;
      }
      setBookChoices(results);
      return;
    }

    if (authorMode === 'new' && !authorNameForLookup) {
      setError('');
      setLoading(true);
      setBookChoices(null);
      setAuthorChoices(null);
      const results = await searchAuthorsByTitle(trimmedTitle);
      setLoading(false);
      if (!results.length) {
        setError(`No authors found for "${trimmedTitle}" on Open Library. Try entering the author's name directly.`);
        return;
      }
      setAuthorChoices(results);
      return;
    }
    await runAiLookup(trimmedTitle, authorNameForLookup);
  }

  function handlePickChoice(book) {
    setTitle(book.title);
    runAiLookup(book.title, authorNameForLookup);
  }

  function handlePickAuthorChoice(candidate) {
    const matched = selectableAuthors.find(
      (a) => a.name.trim().toLowerCase() === candidate.authorName.trim().toLowerCase()
    );
    if (matched) {
      setAuthorMode('existing');
      setExistingAuthorId(matched.id);
    } else {
      setAuthorMode('new');
      setNewAuthorName(candidate.authorName);
    }
    runAiLookup(title.trim(), candidate.authorName);
  }

  function thumbUrl(book) {
    if (book.coverId) return `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`;
    if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
    return null;
  }

  function handleConfirm() {
    if (!preview) return;
    const authorName = authorMode === 'existing'
      ? (targetAuthor?.name || '')
      : (preview.resolvedAuthorName || newAuthorName.trim());
    const targetAuthorId = authorMode === 'existing'
      ? existingAuthorId
      : 'auth_custom_' + slugify(authorName);
    const work = {
      id: makeId('wrk'),
      title: title.trim(),
      type: preview.workType,
      aspects: Array.isArray(preview.aspects) ? preview.aspects : [],
      description: preview.about,
    };
    onSave({
      targetAuthorId,
      authorName,
      authorTagline: preview.authorTagline,
      authorBio: preview.authorBio,
      work,
      detail: preview.bibliography && Object.keys(preview.bibliography).length > 0 ? preview.bibliography : null,
    });
    onClose();
  }

  const previewMeta = preview ? getWorkTypeMeta(preview.workType) : null;
  const previewCoverUrl = preview ? getCoverUrl(preview.bibliography) : null;
  const previewDetail = preview?.bibliography || {};

  return createPortal(
    <div className="rl-root rl-modal-portal">
    <div className="rl-modal-overlay" onClick={onClose}>
      <div className="rl-modal rl-add-book-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rl-modal-close" onClick={onClose} aria-label="Close">✕</button>

        {!preview && !bookChoices && !authorChoices ? (
          <form className="rl-add-book-form" onSubmit={handleLookup}>
            <h2 className="rl-modal-title">✨ Add a book with AI</h2>
            <p className="rl-add-book-hint">
              Know the title but not the author? Leave the author blank and we'll find who
              wrote it. Know the author but not the title? Leave the title blank and browse
              their books. AI describes what a book is about; the cover, ISBN, page count,
              and publish date always come from Open Library — nothing is invented.
            </p>

            <label className="rl-add-book-field">
              <span>Book title (optional — leave blank to browse by author)</span>
              <input
                type="text"
                className="rl-add-book-inline-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fervent"
                autoFocus
              />
            </label>

            {!pinnedAuthor?.id && (
              <label className="rl-add-book-field">
                <span>Author</span>
                <select
                  className="rl-add-book-select"
                  value={authorMode === 'existing' ? existingAuthorId : '__new__'}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setAuthorMode('new');
                    } else {
                      setAuthorMode('existing');
                      setExistingAuthorId(e.target.value);
                    }
                  }}
                >
                  <option value="__new__">+ New author</option>
                  {selectableAuthors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}

            {authorMode === 'new' && (
              <label className="rl-add-book-field">
                <span>Author name</span>
                <input
                  type="text"
                  className="rl-add-book-inline-input"
                  value={newAuthorName}
                  onChange={(e) => setNewAuthorName(e.target.value)}
                  placeholder="e.g. Priscilla Shirer"
                />
              </label>
            )}

            {error && <p className="rl-add-book-error">{error}</p>}

            <div className="rl-add-book-actions">
              <button type="button" className="wms-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="wms-btn primary" disabled={loading}>
                {(() => {
                  const willBrowseByAuthor = !title.trim() && authorNameForLookup;
                  const willFindAuthor = title.trim() && authorMode === 'new' && !authorNameForLookup;
                  if (loading) return willBrowseByAuthor ? 'Searching…' : willFindAuthor ? 'Finding the author…' : 'Looking it up…';
                  return willBrowseByAuthor ? 'Browse their books' : willFindAuthor ? 'Find the author' : 'Look up with AI';
                })()}
              </button>
            </div>
          </form>
        ) : !preview && bookChoices ? (
          <div className="rl-add-book-form">
            <h2 className="rl-modal-title">Pick the book you meant</h2>
            <p className="rl-add-book-hint">
              {bookChoices.length} book{bookChoices.length === 1 ? '' : 's'} found for "{authorNameForLookup}" on Open Library.
              Choose one to generate its description and facts.
            </p>

            {error && <p className="rl-add-book-error">{error}</p>}

            <div className="rl-add-book-choice-list">
              {bookChoices.map((book) => {
                const cover = thumbUrl(book);
                return (
                  <button
                    type="button"
                    key={book.title + book.publishedDate}
                    className="rl-add-book-choice"
                    onClick={() => handlePickChoice(book)}
                    disabled={loading}
                  >
                    {cover ? (
                      <img className="rl-add-book-choice-cover" src={cover} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    ) : (
                      <span className="rl-add-book-choice-cover rl-add-book-choice-cover-blank">📖</span>
                    )}
                    <span className="rl-add-book-choice-info">
                      <span className="rl-add-book-choice-title">{book.title}</span>
                      {book.publishedDate && <span className="rl-add-book-choice-year">{book.publishedDate}</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rl-add-book-actions">
              <button type="button" className="wms-btn" onClick={() => setBookChoices(null)}>Back</button>
            </div>
          </div>
        ) : !preview && authorChoices ? (
          <div className="rl-add-book-form">
            <h2 className="rl-modal-title">Pick the author you meant</h2>
            <p className="rl-add-book-hint">
              {authorChoices.length} author{authorChoices.length === 1 ? '' : 's'} found with a book titled "{title.trim()}" on Open Library.
              Choose one to generate its description and facts.
            </p>

            {error && <p className="rl-add-book-error">{error}</p>}

            <div className="rl-add-book-choice-list">
              {authorChoices.map((candidate) => {
                const cover = thumbUrl(candidate);
                return (
                  <button
                    type="button"
                    key={candidate.authorName}
                    className="rl-add-book-choice"
                    onClick={() => handlePickAuthorChoice(candidate)}
                    disabled={loading}
                  >
                    {cover ? (
                      <img className="rl-add-book-choice-cover" src={cover} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    ) : (
                      <span className="rl-add-book-choice-cover rl-add-book-choice-cover-blank">📖</span>
                    )}
                    <span className="rl-add-book-choice-info">
                      <span className="rl-add-book-choice-title">{candidate.authorName}</span>
                      {candidate.publishedDate && <span className="rl-add-book-choice-year">{candidate.publishedDate} edition</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rl-add-book-actions">
              <button type="button" className="wms-btn" onClick={() => setAuthorChoices(null)}>Back</button>
            </div>
          </div>
        ) : (
          <div className="rl-modal-body">
            <div className="rl-modal-cover-col">
              {previewCoverUrl ? (
                <img
                  className="rl-modal-cover"
                  src={previewCoverUrl}
                  alt={`Cover of ${title}`}
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div className="rl-modal-cover-fallback" style={{ display: previewCoverUrl ? 'none' : 'flex' }}>
                {previewMeta?.icon}
              </div>
            </div>

            <div className="rl-modal-info-col">
              <span className="rl-work-type">{previewMeta?.icon} {previewMeta?.label}</span>
              <h2 className="rl-modal-title">{title.trim()}</h2>
              <p className="rl-modal-author">
                by {authorMode === 'existing' ? (targetAuthor?.name || '') : (preview.resolvedAuthorName || newAuthorName.trim())}
              </p>

              <div className="rl-modal-facts">
                {previewDetail.publishedDate && (
                  <div className="rl-modal-fact"><span className="rl-modal-fact-label">Published</span>{previewDetail.publishedDate}</div>
                )}
                {previewDetail.pages && (
                  <div className="rl-modal-fact"><span className="rl-modal-fact-label">Pages</span>{previewDetail.pages}</div>
                )}
              </div>

              <div className="rl-modal-about">
                <h3 className="rl-modal-section-title">About this book</h3>
                <p>{preview.about}</p>
              </div>

              {needsAuthorBio && preview.authorBio && (
                <div className="rl-modal-about">
                  <h3 className="rl-modal-section-title">About the author</h3>
                  {preview.authorTagline && <p className="rl-add-book-hint">{preview.authorTagline}</p>}
                  <p>{preview.authorBio}</p>
                </div>
              )}

              {!previewDetail.coverId && !previewDetail.isbn && (
                <p className="rl-add-book-hint">
                  Open Library didn't have a confident cover/ISBN match for this title — you can still save it, just without those facts.
                </p>
              )}

              <div className="rl-add-book-actions">
                <button type="button" className="wms-btn" onClick={() => setPreview(null)}>Back</button>
                <button type="button" className="wms-btn primary" onClick={handleConfirm}>Save book</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>,
    document.body
  );
}
