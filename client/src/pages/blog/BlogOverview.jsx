import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BlogShell from './BlogShell';
import { getBlogPage, BLOG_OVERVIEW, BLOG_GROUPS, BLOG_ACCENT } from './blogConfig';
import './BlogOverview.css';

/* ─────────────────────────────────────────────────────────────
   Blog — Home dashboard + generic "Coming Soon" fallback.

   The Home dashboard (rendered when path === BLOG_OVERVIEW.path)
   pulls real data straight out of the same localStorage keys each
   Blog sub-page already reads/writes (blog:posts, blog:ideas,
   blog:quotes, blog:newsletters, blog:comments) — read-only here,
   with a graceful placeholder any time a section has nothing saved
   yet. Also doubles as a safety fallback: it renders if a path is
   ever added to blogConfig.js before its real component is wired to
   a route.
   ───────────────────────────────────────────────────────────── */

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatShortDate(value) {
  if (!value) return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function estimateReadMinutes(body) {
  const words = (body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function truncate(text, max) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

const QUICK_ACCESS = [
  { path: '/blog-posts',       icon: '➕', label: 'Add New Post' },
  { path: '/blog-ideas',       icon: '💡', label: 'Content Ideas' },
  { path: '/blog-quotes',      icon: '❝',  label: 'Quotes Library' },
  { path: '/blog-series',      icon: '🏷', label: 'Categories & Series' },
  { path: '/blog-newsletters', icon: '📧', label: 'Newsletter Issues' },
];

export default function BlogOverview() {
  const { pathname } = useLocation();
  const navigate      = useNavigate();
  const page          = getBlogPage(pathname) || BLOG_OVERVIEW;

  const isOverview = page.path === BLOG_OVERVIEW.path;
  const accent     = page.accent || BLOG_ACCENT;

  const posts        = useMemo(() => (isOverview ? readJson('blog:posts') : []), [isOverview]);
  const ideas         = useMemo(() => (isOverview ? readJson('blog:ideas') : []), [isOverview]);
  const quotes        = useMemo(() => (isOverview ? readJson('blog:quotes') : []), [isOverview]);
  const newsletters    = useMemo(() => (isOverview ? readJson('blog:newsletters') : []), [isOverview]);
  const comments      = useMemo(() => (isOverview ? readJson('blog:comments') : []), [isOverview]);

  const latestPosts = useMemo(() => (
    [...posts]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 4)
  ), [posts]);

  const recentIdeas = useMemo(() => (
    [...ideas]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 3)
  ), [ideas]);

  const pipelineIssues = useMemo(() => (
    [...newsletters]
      .filter(n => n.status !== 'sent')
      .slice(0, 3)
  ), [newsletters]);

  const pendingComments = useMemo(() => (
    comments.filter(c => c.status === 'pending').slice(0, 3)
  ), [comments]);

  const spotlightQuote = useMemo(() => {
    if (!quotes.length) return null;
    return quotes[Math.floor(Math.random() * quotes.length)] || quotes[0];
  }, [quotes]);

  return (
    <BlogShell title={page.label} icon={page.icon} subtitle={page.description}>
      <div className="blc-root" style={{ '--blc-accent': accent }}>
        {isOverview && <span className="blh-corner-sprig blh-corner-sprig-tr" aria-hidden="true">🌸🌿</span>}
        {isOverview && <span className="blh-corner-sprig blh-corner-sprig-bl" aria-hidden="true">🌿🌸</span>}

        {!isOverview && (
          <section className="blc-card">
            <div className="blc-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="blc-card-title">This page is on the way</h2>
            <p className="blc-card-copy">
              The Blog Ministry tab is fully wired into the sidebar so each
              sub-page can be built independently. Pick another section from
              the menu, or jump back to the Home dashboard.
            </p>
            <div className="blc-card-actions">
              <button
                type="button"
                className="blc-btn blc-btn-primary"
                onClick={() => navigate(BLOG_OVERVIEW.path)}
              >
                🏠 Back to Home
              </button>
              <button type="button" className="blc-btn blc-btn-ghost" onClick={() => navigate(-1)}>
                ← Back
              </button>
            </div>
          </section>
        )}

        {isOverview && (
          <div className="blh-grid">
            <div className="blh-main">

              <section className="blh-hero">
                <div className="blh-hero-photo">
                  <button type="button" className="blh-hero-hotspot" onClick={() => navigate('/blog-posts')}>
                    Explore Posts →
                  </button>
                </div>
              </section>

              <section className="blh-section">
                <div className="blh-section-head">
                  <h3><span aria-hidden="true">🌿</span> Latest Posts</h3>
                  <button type="button" className="blh-viewall" onClick={() => navigate('/blog-posts')}>View All →</button>
                </div>
                {latestPosts.length === 0 ? (
                  <p className="blh-empty">No posts saved yet — your first one will show up here.</p>
                ) : (
                  <div className="blh-posts-grid">
                    {latestPosts.map(post => {
                      const tag = post.category || (Array.isArray(post.tags) ? post.tags[0] : null);
                      return (
                        <button
                          key={post.id}
                          type="button"
                          className="blh-post-card"
                          onClick={() => navigate(`/blog-posts?id=${post.id}`)}
                        >
                          {post.featuredImageDataUrl ? (
                            <img className="blh-post-thumb" src={post.featuredImageDataUrl} alt="" aria-hidden="true" />
                          ) : (
                            <span className="blh-post-thumb blh-post-thumb-empty" aria-hidden="true">📰</span>
                          )}
                          <div className="blh-post-body">
                            <span className="blh-post-title">{post.title || 'Untitled post'}</span>
                            <span className="blh-post-meta">
                              {formatShortDate(post.publishDate || post.updatedAt) || post.status}
                              {' · '}{estimateReadMinutes(post.body)} min read
                            </span>
                            {tag && <span className="blh-post-tag">{tag}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="blh-cols">
                <section className="blh-list-card">
                  <div className="blh-section-head">
                    <h3><span aria-hidden="true">💡</span> Content Ideas</h3>
                    <button type="button" className="blh-viewall" onClick={() => navigate('/blog-ideas')}>View All →</button>
                  </div>
                  {recentIdeas.length === 0 ? (
                    <p className="blh-empty">No ideas saved yet.</p>
                  ) : (
                    <ul className="blh-list">
                      {recentIdeas.map(idea => (
                        <li key={idea.id}>
                          <button type="button" onClick={() => navigate(`/blog-ideas?id=${idea.id}`)}>
                            <span className="blh-list-title">{idea.title}</span>
                            <span className="blh-list-chev" aria-hidden="true">›</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="blh-list-card">
                  <div className="blh-section-head">
                    <h3><span aria-hidden="true">📧</span> Newsletter Pipeline</h3>
                    <button type="button" className="blh-viewall" onClick={() => navigate('/blog-newsletters')}>View All →</button>
                  </div>
                  {pipelineIssues.length === 0 ? (
                    <p className="blh-empty">Nothing in the pipeline right now.</p>
                  ) : (
                    <ul className="blh-list">
                      {pipelineIssues.map(issue => (
                        <li key={issue.id}>
                          <button type="button" onClick={() => navigate('/blog-newsletters')}>
                            <span className="blh-list-title">{issue.subject || 'Untitled issue'}</span>
                            <span className="blh-list-chev" aria-hidden="true">›</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>

            <div className="blh-rail">
              <section className="blh-rail-card">
                <h3 className="blh-rail-title"><span aria-hidden="true">🌿</span> Quick Access</h3>
                <ul className="blh-quick-list">
                  {QUICK_ACCESS.map(qa => (
                    <li key={qa.path}>
                      <button type="button" onClick={() => navigate(qa.path)}>
                        <span className="blh-quick-icon">{qa.icon}</span>
                        <span className="blh-quick-label">{qa.label}</span>
                        <span className="blh-list-chev" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="blh-rail-card blh-quote-card">
                <h3 className="blh-rail-title"><span aria-hidden="true">🌿</span> Pull Quote Spotlight</h3>
                {spotlightQuote ? (
                  <>
                    <p className="blh-quote-text">"{truncate(spotlightQuote.text, 140)}"</p>
                    <p className="blh-quote-attr">— {spotlightQuote.attribution || 'Unattributed'}</p>
                  </>
                ) : (
                  <>
                    <p className="blh-quote-text">"He makes all things new."</p>
                    <p className="blh-quote-attr">— Revelation 21:5</p>
                  </>
                )}
              </section>

              <section className="blh-rail-card">
                <div className="blh-section-head">
                  <h3 className="blh-rail-title"><span aria-hidden="true">💬</span> Needs Your Attention</h3>
                  <button type="button" className="blh-viewall" onClick={() => navigate('/blog-comments')}>View All →</button>
                </div>
                {pendingComments.length === 0 ? (
                  <p className="blh-empty">No comments waiting on you right now.</p>
                ) : (
                  <ul className="blh-timeline">
                    {pendingComments.map(c => (
                      <li key={c.id}>
                        <span className="blh-timeline-date">{formatShortDate(c.receivedAt || c.createdAt)}</span>
                        <span className="blh-timeline-text">{c.authorName || 'Someone'}: {truncate(c.content, 70)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="blh-hero-btn blh-rail-btn" onClick={() => navigate('/blog-comments')}>
                  Moderate Comments
                </button>
              </section>

              <div className="blh-rail-note" aria-hidden="true">
                <p>Same God.<br />New stories.<br />Always faithful.</p>
                <span className="blh-rail-note-heart">♥</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </BlogShell>
  );
}
