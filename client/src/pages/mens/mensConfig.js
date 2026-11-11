/* ─────────────────────────────────────────────────────────────
   Men's Ministry — page registry.
   Single source of truth for Men's sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. MensBibleStudies).
     2. In App.jsx, swap `<MensComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const MENS_ACCENT = 'var(--accent-blue, #60a5fa)';

/* Top-level Men's landing page (no sub-group). */
export const MENS_OVERVIEW = {
  path:        '/mens',
  label:       'Overview',
  icon:        '🏠',
  accent:      'var(--accent-blue, #60a5fa)',
  description: "Dashboard for the Men's ministry — upcoming events, current Bible studies, accountability groups, work days, and recent stories will live here.",
  group:       'Overview',
};

export const MENS_GROUPS = [
  {
    key:   'members',
    label: 'Members',
    icon:  '👨',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/mens/all',
        label:       'All Men',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Directory of every man in the ministry — photo, life stage, contact info, current Bible study + mentor, and engagement history.',
      },
      {
        path:        '/mens/life-stages',
        label:       'Life Stages',
        icon:        '🌱',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Filter and view by stage: Young Adults, Husbands, Fathers, Empty Nesters, Widowers, and Singles — each with its own gatherings and care needs.',
      },
      {
        path:        '/mens/new',
        label:       'New to Ministry',
        icon:        '✨',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Welcome pipeline for men new to the ministry — first contact, connect coffee, suggested next step (study / mentor / event).',
      },
    ],
  },
  {
    key:   'discipleship',
    label: 'Discipleship',
    icon:  '📖',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/mens/bible-studies',
        label:       'Bible Studies',
        icon:        '📚',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Bible study cards with leader, meeting day, current book/series, and roster. Drill in for attendance, discussion questions, and study notes per week.',
      },
      {
        path:        '/mens/mentorship',
        label:       'Mentorship Pairs',
        icon:        '🤝',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Older men investing in younger men — pairings, meeting cadence, focus area, and check-in notes from the coordinator.',
      },
      {
        path:        '/mens/accountability',
        label:       'Accountability Groups',
        icon:        '🛡',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Small brotherhood groups for confession, struggle, and growth — covenant, meeting rhythm, and a private group log.',
      },
      {
        path:        '/mens/prayer-breakfast',
        label:       'Prayer Breakfast',
        icon:        '🙏',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Recurring early-morning prayer breakfast — schedule, hosts, devotional speaker, food coordination, and RSVP.',
      },
    ],
  },
  {
    key:   'events',
    label: 'Events & Fellowship',
    icon:  '📅',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/mens/retreats',
        label:       'Retreats',
        icon:        '🏞',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Annual retreat dashboards — theme, speaker, location, schedule, cabins/rooming, registration, and budget.',
      },
      {
        path:        '/mens/bbqs',
        label:       'BBQs & Cookouts',
        icon:        '🥩',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Cookouts and tailgates — RSVPs, menu, grill team, host home, and supplies.',
      },
      {
        path:        '/mens/conferences',
        label:       'Conferences',
        icon:        '🎤',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Conferences hosted or attended — speakers, sessions, group travel, scholarships, and follow-up reflections.',
      },
      {
        path:        '/mens/outdoors',
        label:       'Sports & Outdoors',
        icon:        '⛰',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Hikes, fishing trips, sports leagues, and outdoor fellowship — sign-ups, gear lists, and trip leaders.',
      },
    ],
  },
  {
    key:   'service',
    label: 'Service',
    icon:  '🛠',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/mens/work-days',
        label:       'Work Days',
        icon:        '🔨',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Church and community work days — labor type, tools needed, sign-ups, project leaders, and before/after photos.',
      },
      {
        path:        '/mens/helping-hands',
        label:       'Helping Hands',
        icon:        '🚗',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Fix-it requests for single moms, widows, and the elderly — request intake, skill matching, scheduling, and completion log.',
      },
    ],
  },
  {
    key:   'family',
    label: 'Family & Calling',
    icon:  '👨‍👦',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/mens/father-son',
        label:       'Father-Son',
        icon:        '👨‍👦',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Father-son events, trips, and rite-of-passage milestones — registration, devotionals, and keepsake resources.',
      },
      {
        path:        '/mens/marriage',
        label:       'Marriage Support',
        icon:        '💍',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Marriage workshops, date-night resources, and pastoral referrals for husbands — confidential where needed.',
      },
      {
        path:        '/mens/calling',
        label:       'Work & Calling',
        icon:        '💼',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Career, calling, and vocation discipleship — workplace ethics, integration of faith and work, and peer-coaching circles.',
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
        path:        '/mens/leaders',
        label:       'Leaders',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Ministry leaders and coordinators — role, area of focus, availability, and training status.',
      },
      {
        path:        '/mens/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Broadcast composer (email + SMS), opt-in groups (by life stage / Bible study), and sent history.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/mens/engagement',
        label:       'Engagement & Attendance',
        icon:        '📊',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Trends across studies, events, and service — who is engaging, who has gone quiet, and where to invest next.',
      },
      {
        path:        '/mens/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Written, photo, and video stories of life change — collected with permission to share with the congregation.',
      },
      {
        path:        '/mens/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Past Bible studies, past retreats, completed work-day projects — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Men's page — used for routing + lookup. */
export const MENS_PAGES = [
  MENS_OVERVIEW,
  ...MENS_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Men's paths — used by NavRail to decide if the
   Men's group should be auto-opened. */
export const MENS_PATHS = MENS_PAGES.map(p => p.path);

/* Look up a Men's page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getMensPage(pathname) {
  return MENS_PAGES.find(p => p.path === pathname);
}
