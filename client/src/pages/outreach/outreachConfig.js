/* ─────────────────────────────────────────────────────────────
   Outreach Ministry — page registry.
   Single source of truth for Outreach sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. OutreachEvangelism).
     2. In App.jsx, swap `<OutreachComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const OUTREACH_ACCENT = 'var(--accent-teal, #2dd4bf)';

/* Top-level Outreach landing page (no sub-group). */
export const OUTREACH_OVERVIEW = {
  path:        '/outreach',
  label:       'Overview',
  icon:        '🏠',
  accent:      'var(--accent-teal, #2dd4bf)',
  description: 'Dashboard for the Outreach ministry — upcoming initiatives, new contacts this week, follow-ups due, and quick links to partner orgs will live here.',
  group:       'Overview',
};

export const OUTREACH_GROUPS = [
  {
    key:   'initiatives',
    label: 'Initiatives',
    icon:  '🌍',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/outreach/community-service',
        label:       'Community Service',
        icon:        '🏘',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Service projects with local impact — food bank shifts, clothing drives, park cleanups, repair days. Schedule, sign-ups, and supply needs.',
      },
      {
        path:        '/outreach/evangelism',
        label:       'Evangelism',
        icon:        '🚪',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Street, door-to-door, and online evangelism — team training, target areas, conversations logged, and the follow-up queue.',
      },
      {
        path:        '/outreach/community-events',
        label:       'Community Events',
        icon:        '🎉',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Block parties, free events, and kids carnivals — flyers, schedule, volunteer roles, supplies, and per-event sign-ups.',
      },
      {
        path:        '/outreach/prayer-walks',
        label:       'Prayer Walks',
        icon:        '🙏',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Routes, prayer focuses per neighborhood, walking-team scheduling, and an observations log to track what God is doing.',
      },
    ],
  },
  {
    key:   'people',
    label: 'People Reached',
    icon:  '👥',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/outreach/contacts',
        label:       'New Contacts',
        icon:        '🆕',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'People met during outreach — name, contact info, where met, prayer request, and the next step assigned.',
      },
      {
        path:        '/outreach/follow-ups',
        label:       'Follow-Ups',
        icon:        '📋',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Pipeline of contacts needing a check-in, visit, or invite. Each follow-up is assigned to a team member with a due date.',
      },
      {
        path:        '/outreach/connection-tracker',
        label:       'Connection Tracker',
        icon:        '🌱',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Visual funnel: Met → Contacted → Engaged → Visited Church → Connected. Drag-and-drop to advance contacts.',
      },
    ],
  },
  {
    key:   'partners',
    label: 'Partners',
    icon:  '🤝',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/outreach/organizations',
        label:       'Local Organizations',
        icon:        '🏛',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Nonprofits, agencies, shelters, and schools we partner with — contact, partnership type, and joint initiatives.',
      },
      {
        path:        '/outreach/sister-churches',
        label:       'Sister Churches',
        icon:        '⛪',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Partner congregations for joint outreach, prayer covering, and shared resources.',
      },
      {
        path:        '/outreach/sponsors',
        label:       'Sponsors & Donors',
        icon:        '💼',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'People and businesses funding outreach efforts — giving history, contact, and recognition notes.',
      },
    ],
  },
  {
    key:   'resources',
    label: 'Resources',
    icon:  '📦',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/outreach/tracts',
        label:       'Tracts & Literature',
        icon:        '📖',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Inventory of tracts, gospel pamphlets, Bibles, and invite cards — per-language counts, reorder thresholds.',
      },
      {
        path:        '/outreach/supplies',
        label:       'Supplies & Donations',
        icon:        '🍞',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Food, clothing, hygiene kits, and school supplies — inventory, sources, and distribution log.',
      },
      {
        path:        '/outreach/budget',
        label:       'Budget & Giving',
        icon:        '💵',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Outreach budget broken out by initiative, donations received, expenses, and exportable reports.',
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
        path:        '/outreach/volunteers',
        label:       'Volunteers',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Outreach team roster with gifting (evangelism, hospitality, service), training, and availability.',
      },
      {
        path:        '/outreach/scheduling',
        label:       'Scheduling',
        icon:        '📅',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Sign-up sheets for upcoming outreach dates, roles needed, and confirmations — ties into Scheduling Rec.',
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
        path:        '/outreach/impact',
        label:       'Impact Reports',
        icon:        '📊',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Per-event stats — people served, meals given, contacts made, salvations, and baptisms.',
      },
      {
        path:        '/outreach/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Written, photo, and video stories from outreach — God-moments to share with the congregation.',
      },
      {
        path:        '/outreach/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Past initiatives, retired partnerships, and historical reports — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Outreach page — used for routing + lookup. */
export const OUTREACH_PAGES = [
  OUTREACH_OVERVIEW,
  ...OUTREACH_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Outreach paths — used by NavRail to decide if the
   Outreach group should be auto-opened. */
export const OUTREACH_PATHS = OUTREACH_PAGES.map(p => p.path);

/* Look up an Outreach page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getOutreachPage(pathname) {
  return OUTREACH_PAGES.find(p => p.path === pathname);
}
