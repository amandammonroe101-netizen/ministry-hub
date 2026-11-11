/* ─────────────────────────────────────────────────────────────
   Children's Ministry — page registry.
   Single source of truth for Children's sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. ChildrensCheckIn).
     2. In App.jsx, swap `<ChildrensComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const CHILDRENS_ACCENT = 'var(--accent-amber, #fbbf24)';

/* Top-level Children's landing page (no sub-group). */
export const CHILDRENS_OVERVIEW = {
  path:        '/childrens',
  label:       'Overview',
  icon:        '🏠',
  accent:      'var(--accent-amber, #fbbf24)',
  description: "Dashboard for the Children's ministry — today's check-in totals, volunteer coverage, incident alerts, and supply low-stock warnings will live here.",
  group:       'Overview',
};

export const CHILDRENS_GROUPS = [
  {
    key:   'kids',
    label: 'Kids',
    icon:  '👶',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/childrens/kids',
        label:       'All Kids',
        icon:        '🧒',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Roster of every child — photo, age, grade, parents/guardians, contact info, attendance, milestones, and notes.',
      },
      {
        path:        '/childrens/age-groups',
        label:       'Age Groups',
        icon:        '🍼',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Nursery, Toddlers, Preschool, K-2, and 3-5 — each with its own roster, ratio, room, and lead.',
      },
      {
        path:        '/childrens/medical',
        label:       'Allergies & Medical',
        icon:        '🩺',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Allergies, dietary restrictions, medications, and emergency-medical notes flagged on the check-in screen.',
      },
    ],
  },
  {
    key:   'safety',
    label: 'Check-In & Safety',
    icon:  '🛡',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/childrens/check-in',
        label:       'Check-In Station',
        icon:        '🏷',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Live check-in with secure tag printing (kid sticker + parent claim ticket), allergy flags, and per-room caps.',
      },
      {
        path:        '/childrens/pickup',
        label:       'Pickup Authorization',
        icon:        '👨‍👩‍👧',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Authorized-adult list per child with photo and matched claim ticket required at pickup.',
      },
      {
        path:        '/childrens/incidents',
        label:       'Incident Reports',
        icon:        '🚨',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Log injuries, behavior incidents, and diaper changes with parent acknowledgment trail.',
      },
      {
        path:        '/childrens/background-checks',
        label:       'Background Checks',
        icon:        '✅',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Volunteer background-check status with expiry alerts — required before a volunteer can be scheduled.',
      },
    ],
  },
  {
    key:   'programs',
    label: 'Programs',
    icon:  '📅',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/childrens/sunday',
        label:       'Sunday Mornings',
        icon:        '☀',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Per-service run sheet, room assignments, volunteer roster, and lesson for each Sunday.',
      },
      {
        path:        '/childrens/midweek',
        label:       'Midweek / Clubs',
        icon:        '🌙',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Recurring midweek programs (Awana, Bible Buddies, etc.) with attendance and progress tracking.',
      },
      {
        path:        '/childrens/vbs',
        label:       'VBS & Special Events',
        icon:        '🎪',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Vacation Bible School and special events — registration, theme, daily schedule, decor list, and t-shirt counts.',
      },
    ],
  },
  {
    key:   'curriculum',
    label: 'Curriculum',
    icon:  '📖',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/childrens/lessons',
        label:       'Lessons & Series',
        icon:        '📚',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Age-banded teaching series → individual lessons (big idea, scripture, story, application, memory verse).',
      },
      {
        path:        '/childrens/crafts',
        label:       'Crafts & Activities',
        icon:        '✂',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Craft + activity library filtered by age, prep time, mess level, and supplies needed.',
      },
      {
        path:        '/childrens/take-home',
        label:       'Take-Home Sheets',
        icon:        '🏠',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Printable parent take-home for each lesson — recap, family devotional, and conversation starters.',
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
        path:        '/childrens/volunteers',
        label:       'Volunteers',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Volunteer roster with role, room preference, ratio coverage, and schedule — ties into Scheduling Rec.',
      },
      {
        path:        '/childrens/parents',
        label:       'Parent Communication',
        icon:        '📨',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Broadcast composer (email + SMS), opt-in groups by age band, and sent history. 1-on-1 threads pull into Chat.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '🗂',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/childrens/forms',
        label:       'Registration Forms',
        icon:        '📝',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Registration + photo-release forms per family, with signed/pending/missing status per child per program.',
      },
      {
        path:        '/childrens/snacks',
        label:       'Snacks & Supplies',
        icon:        '🍎',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Snack rotation, allergen-safe options, supply inventory, and low-stock reorder list.',
      },
      {
        path:        '/childrens/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Past programs, past VBS years, and graduated kids — collapsible just like the other archives.',
      },
    ],
  },
  {
    key:   'preschool',
    label: 'Preschool Program',
    icon:  '🍼',
    color: 'var(--accent-pink, #f9a8d4)',
    items: [
      {
        path:        '/childrens/preschool-classrooms',
        label:       'Classrooms & Ratios',
        icon:        '🧩',
        accent:      'var(--accent-pink, #f9a8d4)',
        description: 'Preschool room assignments, teacher-to-child ratios, and daily capacity by classroom.',
      },
      {
        path:        '/childrens/preschool-teachers',
        label:       'Teachers & Volunteers',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-pink, #f9a8d4)',
        description: 'Preschool-specific teacher roster, training status, and classroom rotation.',
      },
      {
        path:        '/childrens/preschool-curriculum',
        label:       'Curriculum & Lesson Plans',
        icon:        '🧸',
        accent:      'var(--accent-pink, #f9a8d4)',
        description: 'Age-appropriate preschool lesson plans, songs, and sensory activities.',
      },
      {
        path:        '/childrens/preschool-family',
        label:       'Family Communication',
        icon:        '💌',
        accent:      'var(--accent-pink, #f9a8d4)',
        description: 'Daily reports, milestones, and messages sent home to preschool parents.',
      },
      {
        path:        '/childrens/preschool-health',
        label:       'Health & Safety',
        icon:        '🩹',
        accent:      'var(--accent-pink, #f9a8d4)',
        description: 'Naptime, diapering, feeding schedules, and preschool-specific health/allergy protocols.',
      },
    ],
  },
];

/* Flat array of every Children's page — used for routing + lookup. */
export const CHILDRENS_PAGES = [
  CHILDRENS_OVERVIEW,
  ...CHILDRENS_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Children's paths — used by NavRail to decide if the
   Children's group should be auto-opened. */
export const CHILDRENS_PATHS = CHILDRENS_PAGES.map(p => p.path);

/* Look up a Children's page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getChildrensPage(pathname) {
  return CHILDRENS_PAGES.find(p => p.path === pathname);
}
