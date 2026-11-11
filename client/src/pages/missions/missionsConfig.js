/* ─────────────────────────────────────────────────────────────
   Missions Ministry — page registry.
   Single source of truth for Missions sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: this ministry focuses on INTERNATIONAL / cross-cultural
   missions — sent and supported missionaries, short-term trips,
   focus regions and people groups, partner agencies, prayer for
   the field, designated giving, and missionary care. The local
   Outreach ministry stays in place for domestic outreach.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. MissionsSentOnes).
     2. In App.jsx, swap `<MissionsComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

/* Adventure/global palette — passport-stamp warmth (coral, gold,
   stamp-red) crossed with ocean-horizon cool (deep ocean blue,
   dusk violet, travel green, teal) instead of the generic shared
   --accent-* tokens every other ministry draws from. Mirrors
   MissionsShell.jsx's GROUP_ACCENTS map exactly, key for key, so
   the shell nav, the ComingSoon map cards, and any real page's own
   accent styling all read from one coherent Missions identity. */
export const MISSIONS_ACCENT = '#e0723f'; // sunset coral / passport-stamp ink

/* Top-level Missions landing page (no sub-group). */
export const MISSIONS_OVERVIEW = {
  path:        '/missions',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#e0723f',
  description: 'Dashboard for the Missions ministry — current missionaries on the field, upcoming trips, urgent prayer requests, recent field updates, and giving snapshots will live here.',
  group:       'Overview',
};

export const MISSIONS_GROUPS = [
  {
    key:   'missionaries',
    label: 'Missionaries',
    icon:  '🧑‍✈',
    color: '#3d8bbd', // ocean blue
    items: [
      {
        path:        '/missions/sent-ones',
        label:       'Our Sent Ones',
        icon:        '🧑‍🤝‍🧑',
        accent:      '#3d8bbd',
        description: 'Missionaries we have sent from our church — field, sending agency, family, term length, current status, and home-church liaison.',
      },
      {
        path:        '/missions/supported',
        label:       'Supported Partners',
        icon:        '🤝',
        accent:      '#3d8bbd',
        description: 'Missionaries we financially support but did not personally send — sending church, agency, region, monthly support amount, and review cadence.',
      },
      {
        path:        '/missions/pipeline',
        label:       'Sending Pipeline',
        icon:        '📝',
        accent:      '#3d8bbd',
        description: 'Candidates in the sending process — call confirmed, training, fundraising, commissioning. Stage tracking + next steps per candidate.',
      },
      {
        path:        '/missions/care',
        label:       'Missionary Care',
        icon:        '💙',
        accent:      '#3d8bbd',
        description: 'Care plan per missionary — furlough schedule, member-care visits, sabbatical, debrief, kids in transition, and re-entry support.',
      },
    ],
  },
  {
    key:   'trips',
    label: 'Mission Trips',
    icon:  '🛫',
    color: '#d9954a', // warm amber-orange
    items: [
      {
        path:        '/missions/trips/upcoming',
        label:       'Upcoming Trips',
        icon:        '📅',
        accent:      '#d9954a',
        description: 'Trip dashboards — destination, dates, team roster, leaders, itinerary, budget, packing list, and registration status.',
      },
      {
        path:        '/missions/trips/past',
        label:       'Past Trips',
        icon:        '🌏',
        accent:      '#d9954a',
        description: 'Archive of past trips with debriefs, photos, lessons learned, and ongoing relationships established with hosts.',
      },
      {
        path:        '/missions/trips/application',
        label:       'Application & Approval',
        icon:        '📋',
        accent:      '#d9954a',
        description: 'Trip applications, references, leader interviews, background-check status, and approval workflow per participant.',
      },
      {
        path:        '/missions/trips/training',
        label:       'Training & Prep',
        icon:        '🧳',
        accent:      '#d9954a',
        description: 'Pre-trip training schedule — cross-cultural prep, language basics, safety briefing, vaccinations, passport / visa checklist.',
      },
    ],
  },
  {
    key:   'field',
    label: 'Field',
    icon:  '🌎',
    color: '#4f9e7a', // travel green
    items: [
      {
        path:        '/missions/field/regions',
        label:       'Regions & Countries',
        icon:        '🗺',
        accent:      '#4f9e7a',
        description: 'Geographic focus areas — country profile, security level, contextual notes, in-country partners, and our involvement summary.',
      },
      {
        path:        '/missions/field/people-groups',
        label:       'People Groups',
        icon:        '👥',
        accent:      '#4f9e7a',
        description: 'Specific people groups we focus on — population, language, religion, reached / unreached status, and current work among them.',
      },
      {
        path:        '/missions/field/agencies',
        label:       'Partner Agencies',
        icon:        '🤝',
        accent:      '#4f9e7a',
        description: 'Sending and support agencies we partner with (Wycliffe, IMB, IFES, OMF, Frontiers, etc.) — primary contact, missionaries we share, and joint initiatives.',
      },
      {
        path:        '/missions/field/updates',
        label:       'Field Updates',
        icon:        '📰',
        accent:      '#4f9e7a',
        description: 'Newsletters, prayer letters, and reports from missionaries — searchable, archived per sender, with attachment-friendly storage.',
      },
    ],
  },
  {
    key:   'prayer',
    label: 'Prayer',
    icon:  '🙏',
    color: '#7c7fdb', // dusk violet
    items: [
      {
        path:        '/missions/prayer/requests',
        label:       'Prayer Requests',
        icon:        '📋',
        accent:      '#7c7fdb',
        description: 'Active and urgent requests from the field — categorized by missionary, region, and topic. Mark answered to keep the list focused.',
      },
      {
        path:        '/missions/prayer/calendar',
        label:       'Prayer Calendar',
        icon:        '📅',
        accent:      '#7c7fdb',
        description: 'Daily / weekly rotation of missionaries and people groups to pray for — printable + sharable with congregation small groups.',
      },
    ],
  },
  {
    key:   'giving',
    label: 'Giving',
    icon:  '💰',
    color: '#c9a13f', // passport gold
    items: [
      {
        path:        '/missions/giving/budget',
        label:       'Missions Budget',
        icon:        '💵',
        accent:      '#c9a13f',
        description: 'Annual missions budget by category (people, projects, trips, admin) — actuals vs. budget and quarterly review.',
      },
      {
        path:        '/missions/giving/designated',
        label:       'Designated Giving',
        icon:        '🎯',
        accent:      '#c9a13f',
        description: 'Giving designated to specific missionaries, trips, or projects — per-fund balance, donor list, and disbursement log.',
      },
      {
        path:        '/missions/giving/faith-promise',
        label:       'Annual Faith Promise',
        icon:        '📊',
        accent:      '#c9a13f',
        description: 'Annual faith-promise commitments from members — pledges, fulfillment tracking, and totals toward the next-year missions ask.',
      },
    ],
  },
  {
    key:   'engagement',
    label: 'Engagement',
    icon:  '🎓',
    color: '#c9503f', // passport-stamp red
    items: [
      {
        path:        '/missions/engagement/education',
        label:       'Missions Education',
        icon:        '📖',
        accent:      '#c9503f',
        description: 'Curriculum for the congregation — Perspectives course, kids missions club, small-group studies on the unreached.',
      },
      {
        path:        '/missions/engagement/sunday',
        label:       'Missions Sunday & Conferences',
        icon:        '🎤',
        accent:      '#c9503f',
        description: 'Annual missions Sunday + conference planning — speakers, schedule, displays, country booths, and budget.',
      },
      {
        path:        '/missions/engagement/stories',
        label:       'Stories from the Field',
        icon:        '📺',
        accent:      '#c9503f',
        description: 'Curated video / written / photo stories for use in services and social — God-moments, baptisms, and breakthroughs.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: '#ab9264', // sandy khaki
    items: [
      {
        path:        '/missions/team/committee',
        label:       'Missions Committee',
        icon:        '🧑‍🏫',
        accent:      '#ab9264',
        description: 'Missions committee roster — role, term, focus area, meeting schedule, and decision log.',
      },
      {
        path:        '/missions/team/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      '#ab9264',
        description: 'Broadcast composer (email + SMS), opt-in groups (trip teams, supporters, prayer warriors), and sent history.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#3d9c9c', // teal
    items: [
      {
        path:        '/missions/records/stats',
        label:       'Stats & History',
        icon:        '📊',
        accent:      '#3d9c9c',
        description: 'Long-term trends — number of sent ones, trips per year, giving over time, regions covered, and people groups engaged.',
      },
      {
        path:        '/missions/records/testimonies',
        label:       'Testimonies',
        icon:        '📷',
        accent:      '#3d9c9c',
        description: 'Personal testimonies from returning trip participants, sent missionaries on furlough, and partners who visited.',
      },
      {
        path:        '/missions/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#3d9c9c',
        description: 'Retired partnerships, completed trips, former sent ones, and historical reports — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Missions page — used for routing + lookup. */
export const MISSIONS_PAGES = [
  MISSIONS_OVERVIEW,
  ...MISSIONS_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Missions paths — used by NavRail to decide if the
   Missions group should be auto-opened. */
export const MISSIONS_PATHS = MISSIONS_PAGES.map(p => p.path);

/* Look up a Missions page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getMissionsPage(pathname) {
  return MISSIONS_PAGES.find(p => p.path === pathname);
}
