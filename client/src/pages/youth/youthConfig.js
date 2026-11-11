/* ─────────────────────────────────────────────────────────────
   Youth Ministry — page registry.
   Single source of truth for Youth sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. YouthStudents).
     2. In App.jsx, swap `<ComingSoon />` for `<YouthStudents />`
        on that route. Keep the entry here so the sidebar item
        stays consistent.
   ───────────────────────────────────────────────────────────── */

export const YOUTH_ACCENT = '#b45309';

/* Top-level Youth landing page (no sub-group). */
export const YOUTH_OVERVIEW = {
  path:        '/youth',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#b45309',
  description: 'Dashboard for the Youth ministry — next event, attendance trends, prayer requests, and follow-ups will live here.',
  group:       'Overview',
};

export const YOUTH_GROUPS = [
  {
    key:   'students',
    label: 'Students',
    icon:  '👥',
    color: '#b45309',
    items: [
      {
        path:        '/youth/students',
        label:       'All Students',
        icon:        '🧒',
        accent:      '#b45309',
        description: 'Roster of every student — photo, grade, school, birthday, contact info, attendance %, milestones, allergies, and emergency contact.',
      },
      {
        path:        '/youth/bible-studies',
        label:       'Bible Studies',
        icon:        '📖',
        accent:      '#b45309',
        description: 'Bible study cards with leader, meeting day, current book/series, and roster. Drill in to see attendance, discussion questions, and study notes per week.',
      },
      {
        path:        '/youth/visitors',
        label:       'Visitors / First-Timers',
        icon:        '👋',
        accent:      '#b45309',
        description: 'Pipeline view: New → Contacted → Returned → Connected. Auto-feeds from Students when first visit is recent.',
      },
    ],
  },
  {
    key:   'events',
    label: 'Events',
    icon:  '📅',
    color: '#b8410c',
    items: [
      {
        path:        '/youth/weekly-nights',
        label:       'Weekly Nights',
        icon:        '🌙',
        accent:      '#b8410c',
        description: 'Recurring youth nights with run sheet, worship set (linked to a Studio project), lesson, game, and announcements.',
      },
      {
        path:        '/youth/trips',
        label:       'Trips & Retreats',
        icon:        '🏕',
        accent:      '#b8410c',
        description: 'Trip dashboard: roster, rooms, packing list, schedule, budget, and permission-slip status.',
      },
      {
        path:        '/youth/outreach',
        label:       'Outreach',
        icon:        '🤲',
        accent:      '#b8410c',
        description: 'Service projects and community events with sign-up and volunteer slots.',
      },
    ],
  },
  {
    key:   'teaching',
    label: 'Teaching',
    icon:  '📖',
    color: '#a16207',
    items: [
      {
        path:        '/youth/lessons',
        label:       'Lessons & Series',
        icon:        '📚',
        accent:      '#a16207',
        description: 'Library of teaching series → individual lessons (big idea, scripture, discussion questions, media, leader guide).',
      },
      {
        path:        '/youth/games',
        label:       'Games & Icebreakers',
        icon:        '🎲',
        accent:      '#a16207',
        description: 'Searchable catalog filtered by group size, energy level, supplies needed, and indoor/outdoor.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: '#854d0e',
    items: [
      {
        path:        '/youth/leaders',
        label:       'Leaders',
        icon:        '🧑‍🏫',
        accent:      '#854d0e',
        description: 'Volunteer roster with background-check status, role, and schedule — ties into Scheduling Rec.',
      },
      {
        path:        '/youth/parents',
        label:       'Parent Communication',
        icon:        '📨',
        accent:      '#854d0e',
        description: 'Broadcast composer (email + SMS), opt-in groups, and sent history. 1-on-1 threads pull into Chat.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '🗂',
    color: '#713f12',
    items: [
      {
        path:        '/youth/forms',
        label:       'Forms & Permissions',
        icon:        '📝',
        accent:      '#713f12',
        description: 'Form builder + signed-form tracker per student per event. Status chip: signed / pending / missing.',
      },
      {
        path:        '/youth/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#713f12',
        description: 'Past series, past trips, and graduated students — collapsible just like Studio’s archive.',
      },
    ],
  },
];

/* Flat array of every Youth page — used for routing + lookup. */
export const YOUTH_PAGES = [
  YOUTH_OVERVIEW,
  ...YOUTH_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Youth paths — used by NavRail to decide if the Youth
   group should be auto-opened. */
export const YOUTH_PATHS = YOUTH_PAGES.map(p => p.path);

/* Look up a Youth page by exact path. Returns undefined for
   unknown paths so callers can render a fallback. */
export function getYouthPage(pathname) {
  return YOUTH_PAGES.find(p => p.path === pathname);
}
