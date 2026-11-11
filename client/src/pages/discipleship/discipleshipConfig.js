/* ─────────────────────────────────────────────────────────────
   Discipleship Ministry — page registry.
   Single source of truth for Discipleship sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: this ministry covers CHURCH-WIDE discipleship
   infrastructure — the path from new believer → baptized →
   member → leader, mixed-gender community groups, mentorship
   pairings, equipping classes, and the leadership pipeline.
   Gender / age-specific discipleship (Youth Bible Studies,
   Women's Bible Studies, Men's Accountability, etc.) stays in
   each of those ministries.

   Top accent uses a custom gold/amber (#d9a441) — a warm
   "sunlight through the trees" tone that stands apart from
   Administration's cool slate/steel palette and the seven
   predefined accent vars already taken as top-level colors
   for the other ministries.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. DiscipleshipBaptism).
     2. In App.jsx, swap `<DiscipleshipComingSoon />` for the
        new component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const DISCIPLESHIP_ACCENT = '#d9a441';

/* Top-level Discipleship landing page (no sub-group). */
export const DISCIPLESHIP_OVERVIEW = {
  path:        '/discipleship',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#d9a441',
  description: 'Dashboard for the Discipleship ministry — new believers in onboarding, baptism candidates, current Bible studies, active community groups, mentor matches in progress, and the leadership pipeline at a glance.',
  group:       'Overview',
};

/* Personal page — sits flat under the header, right after Overview,
   before any of the sub-groups below. Scoped to the signed-in person
   themself: who's mentoring them, who they're mentoring, the studies/
   groups/classes they're part of, and anything they're leading.
   Mirrors WOMENS_MY_INVOLVEMENT. */
export const DISCIPLESHIP_MY_INVOLVEMENT = {
  path:        '/discipleship/my-involvement',
  label:       'My Involvement',
  icon:        '💗',
  accent:      'var(--accent-purple, #a78bfa)',
  description: "Your own place in the ministry — mentors and mentees, the Bible studies, community groups, and equipping classes you're part of, and anything you're leading.",
  group:       'My Involvement',
};

/* Standalone content library — sits flat, right after My Involvement,
   before the sub-groups. Internal teaching content — studies,
   printables, articles, video/audio links — organized by ministry
   area since it's used across every group below. Mirrors
   WOMENS_RESOURCE_LIBRARY. */
export const DISCIPLESHIP_RESOURCE_LIBRARY = {
  path:        '/discipleship/resources',
  label:       'Resource Library',
  icon:        '📚',
  accent:      'var(--accent-teal, #2dd4bf)',
  description: 'Suggested authors and teachers for Bible studies, discipleship curriculum, and leadership development — browse a teacher\'s full list of work and save what you want to come back to.',
  group:       'Resource Library',
};

/* Personal saved list — sits flat alongside Resource Library. Holds
   the individual studies/resources a person has saved from the
   suggested-teacher catalog above. Mirrors WOMENS_SAVED. */
export const DISCIPLESHIP_SAVED = {
  path:        '/discipleship/saved',
  label:       'My Saved',
  icon:        '❤️',
  accent:      'var(--accent-pink, #f472b6)',
  description: 'Your personal collection of studies, curriculum, and teaching resources saved from the Resource Library.',
  group:       'My Saved',
};

export const DISCIPLESHIP_GROUPS = [
  {
    key:   'path',
    label: "Disciple's Path",
    icon:  '🚶',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/discipleship/path/new-believer',
        label:       'New Believer Steps',
        icon:        '✨',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Onboarding for new believers — first conversation, follow-up call, starter Bible, devotional, and assignment to a follow-up partner.',
      },
      {
        path:        '/discipleship/path/baptism',
        label:       'Baptism',
        icon:        '💧',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Baptism candidates, class schedule, interview status, testimony capture, baptism dates, and post-baptism follow-up.',
      },
      {
        path:        '/discipleship/path/membership',
        label:       'Membership',
        icon:        '🪪',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Membership class, statement-of-faith review, interview, vote / confirmation, and member-care assignment.',
      },
      {
        path:        '/discipleship/path/pathway',
        label:       'Next Steps Pathway',
        icon:        '🪜',
        accent:      'var(--accent-blue, #60a5fa)',
        description: "The church's overall discipleship journey map — Connect → Grow → Serve → Lead — with each person's current step and suggested next move.",
      },
    ],
  },
  {
    key:   'bible',
    label: 'Bible Engagement',
    icon:  '📖',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/discipleship/bible/studies',
        label:       'Adult Bible Studies',
        icon:        '📚',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Church-wide adult studies — current studies, leader, meeting day, current book/series, and roster. Drill in for attendance and discussion notes per week.',
      },
      {
        path:        '/discipleship/bible/reading-plans',
        label:       'Bible Reading Plans',
        icon:        '📖',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Church-wide reading plans (read-the-Bible-in-a-year, Psalms+Proverbs, McCheyne) — sign-ups, progress tracking, and weekly discussion prompts.',
      },
      {
        path:        '/discipleship/bible/sermon-based',
        label:       'Sermon-Based Studies',
        icon:        '🗣',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Discussion guides aligned to each Sunday sermon — distributed to groups, available digitally, with weekly creation cadence.',
      },
    ],
  },
  {
    key:   'groups',
    label: 'Community Groups',
    icon:  '🫂',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/discipleship/groups/directory',
        label:       'Group Directory',
        icon:        '🫂',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'All community / life groups — leader, meeting day, location, life stage / focus, roster, and open seats.',
      },
      {
        path:        '/discipleship/groups/finder',
        label:       'Group Finder',
        icon:        '📍',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Public-facing finder for newcomers — filter by location, day, life stage, kids welcome, and topic. Request-to-join workflow.',
      },
      {
        path:        '/discipleship/groups/leaders',
        label:       'Group Leaders',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Community group leader roster — training status, coach assignment, monthly check-in notes, and group-health flags.',
      },
    ],
  },
  {
    key:   'mentorship',
    label: 'Mentorship',
    icon:  '🤝',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/discipleship/mentorship/pairs',
        label:       'Mentor / Mentee Pairs',
        icon:        '🤝',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Active 1-on-1 discipling pairs — mentor, mentee, meeting cadence, focus area, and check-in notes from the coordinator.',
      },
      {
        path:        '/discipleship/mentorship/training',
        label:       'Mentor Training',
        icon:        '🎓',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Training for mentors — curriculum, certification status, coaching cohort, and ongoing equipping.',
      },
      {
        path:        '/discipleship/mentorship/requests',
        label:       'Pairing Requests',
        icon:        '📋',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Incoming requests for a mentor — applicant info, focus area, preferences, and matching workflow.',
      },
    ],
  },
  {
    key:   'equipping',
    label: 'Equipping',
    icon:  '🎓',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/discipleship/equipping/catalog',
        label:       'Class Catalog',
        icon:        '📚',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Catalog of equipping classes — theology, apologetics, marriage, finance, parenting, evangelism. Description, length, prereqs, and teacher.',
      },
      {
        path:        '/discipleship/equipping/schedule',
        label:       'Class Schedule',
        icon:        '📅',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Upcoming class offerings — dates, room, registration, materials, and roster.',
      },
      {
        path:        '/discipleship/equipping/spiritual-gifts',
        label:       'Spiritual Gifts',
        icon:        '🎯',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Spiritual-gifts assessment, results per person, and recommended next steps for serving in their gift mix.',
      },
      {
        path:        '/discipleship/equipping/disciplines',
        label:       'Spiritual Disciplines',
        icon:        '🌱',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Practical equipping in prayer, fasting, Sabbath, solitude, scripture memorization, and silence — guides, challenges, and group rhythms.',
      },
    ],
  },
  {
    key:   'leadership',
    label: 'Leadership Pipeline',
    icon:  '🪜',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/discipleship/leadership/aspiring',
        label:       'Aspiring Leaders',
        icon:        '🌱',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'People identified as having leadership potential — gifts noted, current ministry, suggested next development step, and pastor assignment.',
      },
      {
        path:        '/discipleship/leadership/pipeline',
        label:       'Pipeline Stages',
        icon:        '🎓',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Visual pipeline: Identified → Developing → Apprenticing → Leading → Multiplying. Drag-and-drop to advance candidates between stages.',
      },
      {
        path:        '/discipleship/leadership/training',
        label:       'Leadership Training',
        icon:        '📚',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Leadership development curriculum, cohort schedules, books read, retreats attended, and one-on-one coaching log.',
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
        path:        '/discipleship/team/pastors',
        label:       'Pastors & Coaches',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Pastors and discipleship coaches — focus area (groups / mentorship / leadership / equipping), people they shepherd, and meeting cadence.',
      },
      {
        path:        '/discipleship/team/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Broadcast composer (email + SMS), opt-in groups (group leaders / mentors / pipeline candidates), and sent history.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#d9a441',
    items: [
      {
        path:        '/discipleship/records/engagement',
        label:       'Engagement & Progress',
        icon:        '📊',
        accent:      '#d9a441',
        description: 'Per-person and church-wide trends — pathway progression, group attendance, baptisms, members added, leaders developed.',
      },
      {
        path:        '/discipleship/records/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      '#d9a441',
        description: 'Personal stories of life change — baptism testimonies, group transformation, mentorship breakthroughs, leadership multiplication.',
      },
      {
        path:        '/discipleship/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#d9a441',
        description: 'Past studies, retired groups, completed mentor pairs, and historical reports — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Discipleship page — used for routing + lookup. */
export const DISCIPLESHIP_PAGES = [
  DISCIPLESHIP_OVERVIEW,
  DISCIPLESHIP_MY_INVOLVEMENT,
  DISCIPLESHIP_RESOURCE_LIBRARY,
  DISCIPLESHIP_SAVED,
  ...DISCIPLESHIP_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Discipleship paths — used by NavRail to decide if the
   Discipleship group should be auto-opened. */
export const DISCIPLESHIP_PATHS = DISCIPLESHIP_PAGES.map(p => p.path);

/* Look up a Discipleship page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getDiscipleshipPage(pathname) {
  return DISCIPLESHIP_PAGES.find(p => p.path === pathname);
}
