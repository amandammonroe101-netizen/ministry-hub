/* ─────────────────────────────────────────────────────────────
   Hospitality Ministry — page registry.
   Single source of truth for Hospitality sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Accent uses a custom warm orange (#fb923c) since the seven
   predefined accent vars are already taken as top-level
   colors for the other ministries. Inline hex keeps it from
   accidentally inheriting a different accent if a future theme
   redefines existing vars.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. HospitalityGreeters).
     2. In App.jsx, swap `<HospitalityComingSoon />` for the
        new component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const HOSPITALITY_ACCENT = '#fb923c';

/* Top-level Hospitality landing page (no sub-group). */
export const HOSPITALITY_OVERVIEW = {
  path:        '/hospitality',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#fb923c',
  description: "Dashboard for the Hospitality ministry — this Sunday's host coverage, first-time visitor count, follow-up pipeline status, upcoming events catering, and gift-bag inventory will live here.",
  group:       'Overview',
};

export const HOSPITALITY_GROUPS = [
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/hospitality/all',
        label:       'All Hosts',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Directory of every hospitality volunteer — photo, contact, primary role, service preference, and availability.',
      },
      {
        path:        '/hospitality/roles',
        label:       'Roles & Positions',
        icon:        '🎯',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Every hospitality position (Greeter, Usher, Parking Attendant, Welcome Desk, Coffee Host, Communion Prep, Decor) — qualified hosts per role and station assignments.',
      },
      {
        path:        '/hospitality/training',
        label:       'In Training',
        icon:        '✨',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Trainees in onboarding — current role, shadow shifts logged, hospitality-standards checklist, and target signoff date.',
      },
    ],
  },
  {
    key:   'sunday',
    label: 'Sunday Hosting',
    icon:  '🚪',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/hospitality/sunday/parking',
        label:       'Parking Lot',
        icon:        '🅿',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Parking-lot greeters — station map, weather plan, golf-cart shuttle for elderly / mobility-limited guests, and umbrella hospitality.',
      },
      {
        path:        '/hospitality/sunday/greeters',
        label:       'Greeters',
        icon:        '👋',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Door greeters at every entrance — per-door coverage, scripts/talking points, kids-area direction, and bulletin handouts.',
      },
      {
        path:        '/hospitality/sunday/welcome-center',
        label:       'Welcome Center',
        icon:        'ℹ',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Info / welcome desk — answers to FAQs, ministry brochures, kids check-in pointers, and visitor card capture.',
      },
      {
        path:        '/hospitality/sunday/ushers',
        label:       'Ushers & Seating',
        icon:        '🪑',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Ushers — seating map, late-arrival flow, reserved sections, accessibility seating, and headcount per service.',
      },
      {
        path:        '/hospitality/sunday/offering',
        label:       'Offering & Communion',
        icon:        '🪙',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Offering rotation, money-handling protocol, communion prep (elements, plates, gluten-free), and post-service cleanup.',
      },
    ],
  },
  {
    key:   'new-guests',
    label: 'New Guests',
    icon:  '🎁',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/hospitality/guests/gifts',
        label:       'First-Time Visitor Gifts',
        icon:        '🎁',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Gift-bag inventory and contents (mug, devotional, church info, kids welcome), distribution log, and reorder thresholds.',
      },
      {
        path:        '/hospitality/guests/follow-up',
        label:       'Follow-Up Pipeline',
        icon:        '📋',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Pipeline for first-time visitors — Card Received → Thank-You Sent → Called → Invited to Connect → Attending Group. Assigned per host.',
      },
      {
        path:        '/hospitality/guests/connect',
        label:       'Newcomer Connect Events',
        icon:        '🎉',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Connect-style events — newcomer lunch, pastor meet-and-greet, membership class — RSVPs, host home, schedule, and follow-up.',
      },
    ],
  },
  {
    key:   'food',
    label: 'Food & Refreshments',
    icon:  '☕',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/hospitality/food/coffee',
        label:       'Coffee & Snacks',
        icon:        '☕',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Weekly coffee bar and snack table — supplies, brewing schedule, allergen-aware options, and host rotation.',
      },
      {
        path:        '/hospitality/food/meals',
        label:       'Member / Community Meals',
        icon:        '🍽',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Recurring community meals (potlucks, fellowship lunches, all-church dinners) — menu, sign-ups, dietary accommodations, and cleanup crew.',
      },
      {
        path:        '/hospitality/food/catering',
        label:       'Event Catering',
        icon:        '🧁',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Catering for special events — vendor list, in-house vs. outsourced, headcount-based ordering, and per-event budget.',
      },
    ],
  },
  {
    key:   'special-events',
    label: 'Special Events',
    icon:  '💒',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/hospitality/events/weddings',
        label:       'Weddings',
        icon:        '💍',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Wedding coordination — venue setup, rehearsal hosting, ceremony ushers, reception support, and post-event cleanup.',
      },
      {
        path:        '/hospitality/events/funerals',
        label:       'Funerals',
        icon:        '🕊',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Funeral and memorial-service hospitality — reception meal coordination, ushers, family-room setup, and after-care.',
      },
      {
        path:        '/hospitality/events/holiday',
        label:       'Holiday Hosting',
        icon:        '🎄',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Christmas Eve, Easter, Thanksgiving — extra hosts, expanded greeter teams, overflow seating, and visitor-heavy logistics.',
      },
    ],
  },
  {
    key:   'operations',
    label: 'Operations',
    icon:  '📋',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/hospitality/ops/scheduling',
        label:       'Scheduling',
        icon:        '📅',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Per-position schedule across services — fills, swaps, sub requests. Integrates with the global Scheduling Rec.',
      },
      {
        path:        '/hospitality/ops/pre-service',
        label:       'Pre-Service Checklist',
        icon:        '⏱',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Standardized pre-service walkthrough — restrooms stocked, lobby tidy, coffee brewing, signage in place, kids check-in ready. Sign-off per service.',
      },
      {
        path:        '/hospitality/ops/setup',
        label:       'Setup & Decor',
        icon:        '🪑',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Room setup configurations (chairs, tables, signage) and seasonal / event decor — diagrams, supply lists, and tear-down assignments.',
      },
      {
        path:        '/hospitality/ops/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Broadcast composer (email + SMS) for team announcements, schedule reminders, and weekly hospitality huddles.',
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
        path:        '/hospitality/records/engagement',
        label:       'Engagement & Attendance',
        icon:        '📊',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Trends across services and events — host coverage, first-time visitor counts, follow-up conversion, and gaps to fill.',
      },
      {
        path:        '/hospitality/records/stories',
        label:       'Stories & Photos',
        icon:        '📷',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Photos from events, thank-you notes from guests, and stories of welcome that became real connection.',
      },
      {
        path:        '/hospitality/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Past events, retired gift designs, former hosts, and historical reports — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Hospitality page — used for routing + lookup. */
export const HOSPITALITY_PAGES = [
  HOSPITALITY_OVERVIEW,
  ...HOSPITALITY_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Hospitality paths — used by NavRail to decide if the
   Hospitality group should be auto-opened. */
export const HOSPITALITY_PATHS = HOSPITALITY_PAGES.map(p => p.path);

/* Look up a Hospitality page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getHospitalityPage(pathname) {
  return HOSPITALITY_PAGES.find(p => p.path === pathname);
}
