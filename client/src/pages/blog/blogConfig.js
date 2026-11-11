/* ─────────────────────────────────────────────────────────────
   Blog Ministry — page registry.
   Single source of truth for Blog sub-pages. Both:
     • NavRail (sidebar item)
     • App.jsx (route generation)
   read from this list.

   Mirrors websiteConfig.js: Blog gets the same single-flat-nav-item
   + config-driven-routing shell as Website/Women's/Men's, instead
   of the old expandable sidebar group. Every page below already had
   a real, fully-built component before this registry existed.
   ───────────────────────────────────────────────────────────── */

export const BLOG_ACCENT = '#8a2e2e';

/* Top-level Blog landing page (no sub-group). */
export const BLOG_OVERVIEW = {
  path:        '/blog',
  label:       'Overview',
  icon:        '🏠',
  accent:      BLOG_ACCENT,
  description: 'Dashboard for the Blog ministry — post pipeline, content ideas, quotes, comments, and newsletter status at a glance.',
  group:       'Overview',
};

export const BLOG_GROUPS = [
  {
    key:   'content',
    label: 'Content',
    icon:  '📰',
    color: '#6b4a2e',
    items: [
      {
        path:        '/blog-posts',
        label:       'Posts Library',
        icon:        '📰',
        accent:      '#3f6b8a',
        description: 'Every blog post — drafts, scheduled, and published — with status and author at a glance.',
      },
      {
        path:        '/blog-ideas',
        label:       'Content Ideas',
        icon:        '💡',
        accent:      '#b5651d',
        description: 'Running list of post ideas and pitches waiting to be written.',
      },
      {
        path:        '/blog-quotes',
        label:       'Quotes Library',
        icon:        '❝',
        accent:      '#8a2e2e',
        description: 'Reusable quotes and pull-lines for posts, social graphics, and newsletters.',
      },
      {
        path:        '/blog-series',
        label:       'Categories & Series',
        icon:        '🏷',
        accent:      '#6b4a8a',
        description: 'How posts are organized — categories, tags, and multi-part series.',
      },
    ],
  },
  {
    key:   'engagement',
    label: 'Engagement & Announcements',
    icon:  '📊',
    color: '#4a5a3a',
    items: [
      {
        path:        '/blog-comments',
        label:       'Comments Moderation',
        icon:        '💬',
        accent:      '#8a2e2e',
        description: 'Reader comments awaiting approval, reply, or removal.',
      },
      {
        path:        '/blog-newsletters',
        label:       'Newsletter Issues',
        icon:        '📧',
        accent:      '#3f6b8a',
        description: 'Newsletter issues built from blog content — status and send dates.',
      },
      {
        path:        '/blog-performance',
        label:       'Post Performance',
        icon:        '📈',
        accent:      '#b5651d',
        description: 'Views, reads, and engagement for published posts.',
      },
      {
        path:        '/blog-authors',
        label:       'Authors / Contributors',
        icon:        '✍',
        accent:      '#a83f6b',
        description: 'Everyone who writes for the blog, with their bio and post count.',
      },
    ],
  },
];

/* Flat array of every Blog page — used for routing + lookup. */
export const BLOG_PAGES = [
  BLOG_OVERVIEW,
  ...BLOG_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Blog paths — used by NavRail to decide if the Blog entry
   should read as active. */
export const BLOG_PATHS = BLOG_PAGES.map(p => p.path);

/* Look up a Blog page by exact path. Returns undefined for unknown
   paths so callers can render a fallback. */
export function getBlogPage(pathname) {
  return BLOG_PAGES.find(p => p.path === pathname);
}
