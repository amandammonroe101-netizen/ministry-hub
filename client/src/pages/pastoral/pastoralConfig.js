/* ─────────────────────────────────────────────────────────────
   Pastoral / Teaching Ministry — page registry.
   Single source of truth for Pastoral / Teaching sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: this ministry is built around SERMON CREATION and
   REUSABLE NOTES. The Sermon Workshop is the writer/editor,
   the Reusable Notes library is where snippets, illustrations,
   quotes, and scripture notes live so they can be pulled into
   future sermons. Pastoral care (visits, counseling, weddings,
   funerals, crisis) lives here too since pastoral + teaching
   usually share staff.

   Top accent uses a custom deep burgundy (#9f1239) for a
   sacred / pastoral feel — distinct from the lighter Women's
   rose and from every other ministry top color.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. PastoralSermonWriter).
     2. In App.jsx, swap `<PastoralComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const PASTORAL_ACCENT = '#9f1239';

/* Top-level Pastoral / Teaching landing page (no sub-group). */
export const PASTORAL_OVERVIEW = {
  path:        '/pastoral',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#9f1239',
  description: "Dashboard for the Pastoral / Teaching ministry — next sermon in progress, current series, this week's pastoral visits, upcoming weddings and funerals, and quick links to the Sermon Workshop and Reusable Notes library.",
  group:       'Overview',
};

export const PASTORAL_GROUPS = [
  {
    key:   'workshop',
    label: 'Sermon Workshop',
    icon:  '✍',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/pastoral/workshop/new',
        label:       'New Sermon',
        icon:        '📝',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'The writer / editor — start a sermon from scratch or a template. Outline, scripture passage(s), big idea, manuscript, and delivery notes all in one place. Pull from the Reusable Notes library while you write.',
      },
      {
        path:        '/pastoral/workshop/drafts',
        label:       'My Drafts',
        icon:        '📋',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'In-progress sermons — last edited, target preach date, completion status (outline / draft / ready), and a quick-jump back into the writer.',
      },
      {
        path:        '/pastoral/workshop/library',
        label:       'Sermon Library',
        icon:        '📖',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Every completed sermon — searchable by title, scripture, theme, series, tag, and date preached. Full manuscript, outline, slides, audio link, and notes.',
      },
      {
        path:        '/pastoral/workshop/reuse',
        label:       'Reuse / Adapt',
        icon:        '🔄',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Clone a past sermon to preach again — at a retreat, a different campus, or refreshed for a new season. Tracks the lineage so you know what came from where.',
      },
    ],
  },
  {
    key:   'notes',
    label: 'Reusable Notes',
    icon:  '💡',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/pastoral/notes/snippets',
        label:       'Note Snippets',
        icon:        '📝',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Reusable note fragments — outlines, transitions, intros, closings, application points. Tag and search so they surface when relevant in a future sermon.',
      },
      {
        path:        '/pastoral/notes/illustrations',
        label:       'Illustrations & Stories',
        icon:        '💡',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Library of sermon illustrations and stories — source, length, tone (humor / poignant / convicting), themes, and whether already used (and when).',
      },
      {
        path:        '/pastoral/notes/quotes',
        label:       'Quotes Library',
        icon:        '❝',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Quote collection — author, source, themes, and a "used in" log to avoid repeating the same quote in back-to-back sermons.',
      },
      {
        path:        '/pastoral/notes/scripture',
        label:       'Scripture Notes',
        icon:        '📖',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Per-passage notes that build over time — observations, cross-references, original-language nuggets, and historical / cultural context. Pull straight into a sermon on that passage.',
      },
      {
        path:        '/pastoral/notes/commentaries',
        label:       'Commentaries & References',
        icon:        '📚',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Notes from commentaries, theological reading, and reference works — tagged by passage / topic for quick recall during prep.',
      },
    ],
  },
  {
    key:   'series',
    label: 'Series & Themes',
    icon:  '🎬',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/pastoral/series/current',
        label:       'Current Series',
        icon:        '🎬',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'The active sermon series — big idea, scripture arc, per-sermon outlines, graphics, promotional plan, and series-resource handouts.',
      },
      {
        path:        '/pastoral/series/ideas',
        label:       'Series Ideas',
        icon:        '💡',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Backlog of future series ideas — concept, scripture, target season, length, and notes from your own thinking and team brainstorms.',
      },
      {
        path:        '/pastoral/series/themes',
        label:       'Sermon Themes / Tags',
        icon:        '🏷',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'The vocabulary of themes / tags applied across the Sermon Library and Notes — gives you "every sermon on grace" or "every illustration on suffering" in one click.',
      },
    ],
  },
  {
    key:   'delivery',
    label: 'Schedule & Delivery',
    icon:  '📅',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/pastoral/delivery/calendar',
        label:       'Preaching Calendar',
        icon:        '📅',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Who is preaching on which Sunday, what passage, what series. Highlights gaps and lets you assign drafts to dates.',
      },
      {
        path:        '/pastoral/delivery/guest-speakers',
        label:       'Guest Speakers',
        icon:        '🎤',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Guest preacher roster — bio, contact, travel + lodging, honorarium, topic, and post-visit follow-up.',
      },
      {
        path:        '/pastoral/delivery/service-notes',
        label:       'Service Notes',
        icon:        '📋',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Post-delivery notes — congregational response, time delivered vs. planned, what worked, what to tighten next time.',
      },
      {
        path:        '/pastoral/delivery/recordings',
        label:       'Audio / Video Archive',
        icon:        '🎙',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Per-sermon audio and video archive (links into Tech / Streaming → Recordings) plus transcripts and clip-able highlights.',
      },
    ],
  },
  {
    key:   'care',
    label: 'Pastoral Care',
    icon:  '🙏',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/pastoral/care/visits',
        label:       'Visits Log',
        icon:        '🏥',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Hospital, home, and care-facility visits — date, person, condition, conversation notes, and scheduled follow-up. Confidential.',
      },
      {
        path:        '/pastoral/care/counseling',
        label:       'Counseling Sessions',
        icon:        '🤝',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Pastoral counseling — session log, focus area, referrals to licensed counselors when needed, and consent / confidentiality tracking.',
      },
      {
        path:        '/pastoral/care/weddings',
        label:       'Weddings',
        icon:        '💍',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Wedding officiation — couple, pre-marital counseling sessions, ceremony plan, rehearsal date, and license filing.',
      },
      {
        path:        '/pastoral/care/funerals',
        label:       'Funerals',
        icon:        '🕊',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Funerals officiated — deceased, family, service plan, eulogy notes, and bereavement follow-up.',
      },
      {
        path:        '/pastoral/care/crisis',
        label:       'Crisis & Urgent',
        icon:        '🚨',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Urgent pastoral situations — current crises, who is on-call, escalation contacts, and a debrief log once resolved.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/pastoral/team/pastors',
        label:       'Pastors',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Pastoral team roster — role (senior / associate / care / teaching), areas of oversight, preaching rotation, and personal sermon library cross-references.',
      },
      {
        path:        '/pastoral/team/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Broadcast composer (email + SMS) for prayer requests, pastoral updates, and special-service announcements.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/pastoral/records/themes',
        label:       'Themes & Frequency',
        icon:        '📊',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Long-view report — what topics, books of the Bible, and themes have been preached, and how often. Helps balance the teaching diet across years.',
      },
      {
        path:        '/pastoral/records/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Stories of life change tied to specific sermons or pastoral encounters — testimonies, before/after, baptism follow-ups.',
      },
      {
        path:        '/pastoral/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Retired series, archived sermons no longer in active rotation, and historical pastoral records — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Pastoral page — used for routing + lookup. */
export const PASTORAL_PAGES = [
  PASTORAL_OVERVIEW,
  ...PASTORAL_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Pastoral paths — used by NavRail to decide if the
   Pastoral group should be auto-opened. */
export const PASTORAL_PATHS = PASTORAL_PAGES.map(p => p.path);

/* Look up a Pastoral page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getPastoralPage(pathname) {
  return PASTORAL_PAGES.find(p => p.path === pathname);
}
