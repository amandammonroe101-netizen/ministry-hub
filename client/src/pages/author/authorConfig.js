/* ─────────────────────────────────────────────────────────────
   Author Ministry — page registry.
   Single source of truth for Author sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: built around three things the user asked for:
     1. A place to capture IDEAS + NOTES for future books
     2. A workshop space to WRITE the books
     3. A workshop space to WRITE devotionals
   Plus the supporting layers an author actually needs —
   research, publishing pipeline, editor collaboration,
   reader feedback, and writing-discipline stats.

   Top accent uses a custom deep emerald (#059669) for an
   "ink on paper" / quiet-study feel — distinct from Tech's
   lighter mint and every other ministry top color.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. AuthorBookWriter).
     2. In App.jsx, swap `<AuthorComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const AUTHOR_ACCENT = '#059669';

/* Top-level Author landing page (no sub-group). */
export const AUTHOR_OVERVIEW = {
  path:        '/author',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#059669',
  description: 'Dashboard for the Author ministry — current book in progress, next devotional due, recent idea captures, daily word-count streak, and quick links to the Book and Devotional workshops.',
  group:       'Overview',
};

export const AUTHOR_GROUPS = [
  {
    key:   'ideas',
    label: 'Ideas & Inspiration',
    icon:  '💡',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/author/ideas/books',
        label:       'Book Ideas',
        icon:        '💡',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Backlog of book concepts you might write someday — working title, premise, audience, why-this-matters, scripture / thematic anchor, and "ready to start?" status.',
      },
      {
        path:        '/author/ideas/journal',
        label:       'Idea Journal',
        icon:        '📓',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Quick-capture journal for raw thoughts — a phrase, an image, a paragraph that came in the shower. Tag and search so it surfaces when you start the right project.',
      },
      {
        path:        '/author/ideas/vault',
        label:       'Quote & Reference Vault',
        icon:        '❝',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'A growing vault of quotes, anecdotes, statistics, scripture passages, and references you might pull from in future writing — tagged by theme and source.',
      },
      {
        path:        '/author/ideas/reading-list',
        label:       'Reading List',
        icon:        '📚',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'What you are reading (and want to read) for inspiration — title, author, status, takeaways, and a link from any takeaway into the Quote & Reference Vault.',
      },
    ],
  },
  {
    key:   'book-workshop',
    label: 'Book Workshop',
    icon:  '📖',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/author/books/new',
        label:       'New Book',
        icon:        '📝',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Start a new book project — title, audience, premise, target length, blank-or-template start. Spins up the chapter structure and manuscript workspace.',
      },
      {
        path:        '/author/books/manuscripts',
        label:       'Manuscripts',
        icon:        '✏',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'In-progress books — last edited, current word count vs. target, status (outlining / drafting / revising / done), and a quick-jump back into the writer.',
      },
      {
        path:        '/author/books/chapters',
        label:       'Chapters & Outlines',
        icon:        '🗂',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Per-book chapter list and outline — drag-to-reorder chapters, per-chapter big idea, scripture, status, and word count. The bones of the book.',
      },
      {
        path:        '/author/books/drafts',
        label:       'Drafts & Revisions',
        icon:        '🧪',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Version history for each chapter or whole-book draft — compare drafts, restore an earlier version, and track what changed between editor passes.',
      },
      {
        path:        '/author/books/library',
        label:       'Published Library',
        icon:        '📚',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Books you have completed and published — title, publication date, publisher, ISBN, cover image, blurb, and links to where readers can buy.',
      },
    ],
  },
  {
    key:   'devotional-workshop',
    label: 'Devotional Workshop',
    icon:  '🌅',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/author/devotionals/new',
        label:       'New Devotional',
        icon:        '✍',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Write a single devotional — title, scripture, big idea, reflection, prayer, application. Save standalone or attach to a series.',
      },
      {
        path:        '/author/devotionals/series',
        label:       'Devotional Series',
        icon:        '📅',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Multi-day devotional series — overview, scripture arc, target audience, daily entries, and publishing format (book / PDF / email / blog).',
      },
      {
        path:        '/author/devotionals/library',
        label:       'Devotional Library',
        icon:        '📖',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Every devotional you have written — searchable by scripture, theme, season, and series. Clone and adapt for re-use.',
      },
      {
        path:        '/author/devotionals/calendar',
        label:       'Publishing Calendar',
        icon:        '🗓',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'When each devotional or series releases — daily / weekly cadence, email send dates, blog post dates, and gaps that need to be filled.',
      },
    ],
  },
  {
    key:   'research',
    label: 'Research & Notes',
    icon:  '🧠',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/author/research/notes',
        label:       'Research Notes',
        icon:        '📚',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Per-book research notes — interviews, articles, theological sources, historical context. Tagged by chapter so they surface in the writer when relevant.',
      },
      {
        path:        '/author/research/themes',
        label:       'Themes & Motifs',
        icon:        '🎨',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Recurring themes and motifs across a book or your whole catalog — track where each theme appears so you can develop them intentionally.',
      },
      {
        path:        '/author/research/characters',
        label:       'Characters & People',
        icon:        '👥',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Notes on real people you write about or fictional characters you invent — backstory, voice, arc, relationships, and per-chapter notes.',
      },
      {
        path:        '/author/research/settings',
        label:       'Settings & Places',
        icon:        '🌍',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Real or imagined places that feature in your writing — descriptions, sensory notes, photos, maps, and historical context.',
      },
    ],
  },
  {
    key:   'publishing',
    label: 'Publishing & Audience',
    icon:  '🚀',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/author/publishing/pitches',
        label:       'Submissions & Pitches',
        icon:        '📦',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Query letters, proposals, sample chapters sent — to which agents / publishers / magazines, date sent, response status, and follow-up reminders.',
      },
      {
        path:        '/author/publishing/pipeline',
        label:       'Publishing Pipeline',
        icon:        '📊',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Visual pipeline per project: Idea → Outlined → Drafting → With Editor → Revising → Submitted → Accepted → Published. Drag to advance.',
      },
      {
        path:        '/author/publishing/feedback',
        label:       'Reader Feedback',
        icon:        '💌',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Reviews, reader emails, beta-reader notes, and book-club discussion — captured per book, surfaced when planning the next one.',
      },
      {
        path:        '/author/publishing/sales',
        label:       'Sales & Royalties',
        icon:        '📈',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Sales reports, royalty statements, and per-title earnings — quarterly and lifetime, with simple charts for at-a-glance trends.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/author/team/editors',
        label:       'Editors & Collaborators',
        icon:        '🤝',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Editors, beta readers, illustrators, ghost-writers, and other collaborators — contact, role, projects together, and active engagements.',
      },
      {
        path:        '/author/team/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Broadcast composer (email + SMS) for newsletter subscribers, launch teams, and project-specific update lists.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#059669',
    items: [
      {
        path:        '/author/records/stats',
        label:       'Writing Stats',
        icon:        '📊',
        accent:      '#059669',
        description: 'Daily word-count streak, weekly / monthly output, time spent writing, and per-project velocity — to build the habit and see where the time goes.',
      },
      {
        path:        '/author/records/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      '#059669',
        description: 'Reader stories — how a chapter, a devotional, or a quoted line landed in someone\'s life. Encouragement to keep writing.',
      },
      {
        path:        '/author/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#059669',
        description: 'Shelved book ideas, abandoned drafts, retired devotional series, and historical project files — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Author page — used for routing + lookup. */
export const AUTHOR_PAGES = [
  AUTHOR_OVERVIEW,
  ...AUTHOR_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Author paths — used by NavRail to decide if the
   Author group should be auto-opened. */
export const AUTHOR_PATHS = AUTHOR_PAGES.map(p => p.path);

/* Look up an Author page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getAuthorPage(pathname) {
  return AUTHOR_PAGES.find(p => p.path === pathname);
}
