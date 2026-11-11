/* ─────────────────────────────────────────────────────────────
   Women's Ministry — page registry.
   Single source of truth for Women's sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. WomensBibleStudies).
     2. In App.jsx, swap `<WomensComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const WOMENS_ACCENT = 'var(--accent-rose, #fb7185)';

/* Top-level Women's landing page (no sub-group). */
export const WOMENS_OVERVIEW = {
  path:        '/womens',
  label:       'Overview',
  icon:        '🏠',
  accent:      'var(--accent-rose, #fb7185)',
  description: "Dashboard for the Women's ministry — upcoming events, current Bible studies, mentorship matches, care requests, and meal-train signups will live here.",
  group:       'Overview',
};

/* Personal page — sits flat under the header, right after Overview,
   before any of the sub-groups below. Unlike the groups (which track
   the whole ministry), this is scoped to the signed-in woman herself:
   who's mentoring her, who she's mentoring, the studies/groups she's
   part of, and anything she's leading or hosting. */
export const WOMENS_MY_INVOLVEMENT = {
  path:        '/womens/my-involvement',
  label:       'My Involvement',
  icon:        '💗',
  accent:      'var(--accent-purple, #a78bfa)',
  description: "Your own place in the ministry — mentors and mentees, the Bible studies and groups you're part of, and anything you're leading or hosting.",
  group:       'My Involvement',
};

/* Standalone content library — sits flat, right after My Involvement,
   before the sub-groups. Unlike the Care-group Referral Directory
   (external counselors/hotlines/orgs), this holds internal teaching
   content — Bible studies, printables, articles, video/audio links —
   organized by ministry area since it's used across every group below. */
export const WOMENS_RESOURCE_LIBRARY = {
  path:        '/womens/resources',
  label:       'Resource Library',
  icon:        '📚',
  accent:      'var(--accent-teal, #2dd4bf)',
  description: "Suggested authors and speakers who've written devotionals, books, and Bible study walkthroughs — browse an author's full list of work and save what you want to come back to.",
  group:       'Resource Library',
};

/* Personal saved list — sits flat alongside Resource Library.
   Holds the individual devotionals/books/Bible studies a woman has
   saved from the suggested author catalog above. */
export const WOMENS_SAVED = {
  path:        '/womens/saved',
  label:       'My Saved',
  icon:        '❤️',
  accent:      'var(--accent-pink, #f472b6)',
  description: "Your personal collection of devotionals, books, and Bible study walkthroughs saved from the Resource Library.",
  group:       'My Saved',
};

export const WOMENS_GROUPS = [
  {
    key:   'members',
    label: 'Members',
    icon:  '👩',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/womens/all',
        label:       'All Women',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Directory of every woman in the ministry — photo, life stage, contact info, current Bible study + mentor, and engagement history.',
      },
      {
        path:        '/womens/life-stages',
        label:       'Life Stages',
        icon:        '🌱',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Filter and view by stage: Young Adults, Newly Married, Moms, Empty Nesters, Widows, and Singles — each with its own gatherings and care needs.',
      },
      {
        path:        '/womens/new',
        label:       'New to Ministry',
        icon:        '✨',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Welcome pipeline for women new to the ministry — first contact, connect coffee, suggested next step (study / mentor / event).',
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
        path:        '/womens/bible-studies',
        label:       'Bible Studies',
        icon:        '📚',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Bible study cards with leader, meeting day, current book/series, and roster. Drill in for attendance, discussion questions, and study notes per week.',
      },
      {
        path:        '/womens/mentorship',
        label:       'Mentorship Pairs',
        icon:        '🤝',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Titus 2 mentor / mentee matches — pairings, meeting cadence, focus area, and check-in notes from the coordinator.',
      },
      {
        path:        '/womens/prayer-groups',
        label:       'Prayer Groups',
        icon:        '🙏',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Standing prayer groups with leader, meeting time, members, and a shared prayer request log (private to the group).',
      },
    ],
  },
  {
    key:   'events',
    label: 'Events',
    icon:  '📅',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/womens/retreats',
        label:       'Retreats',
        icon:        '🏞',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Annual retreat dashboards — theme, speaker, location, schedule, rooming, registration, and budget.',
      },
      {
        path:        '/womens/brunches',
        label:       'Brunches & Teas',
        icon:        '🍽',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Smaller hospitality gatherings — RSVPs, menu, host home, decor, and per-event invite lists.',
      },
      {
        path:        '/womens/conferences',
        label:       'Conferences',
        icon:        '🎤',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Conferences hosted or attended — speakers, sessions, group travel, scholarships, and follow-up reflections.',
      },
      {
        path:        '/womens/fellowship',
        label:       'Fellowship & Crafts',
        icon:        '🎨',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Casual fellowship nights — craft projects, paint-and-pray, book club, and supply lists.',
      },
    ],
  },
  {
    key:   'care',
    label: 'Care',
    icon:  '💝',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/womens/meal-train',
        label:       'Meal Train',
        icon:        '🍲',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Coordinate meal trains for new moms, surgery recovery, bereavement, and crisis — sign-up calendar, allergy notes, and drop-off instructions.',
      },
      {
        path:        '/womens/new-moms',
        label:       'New Mom Support',
        icon:        '🤱',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Welcome packages, postpartum check-ins, baby-step playdates, and mentor mom pairings.',
      },
      {
        path:        '/womens/crisis',
        label:       'Crisis & Counseling',
        icon:        '🆘',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Confidential care case log — intake, urgency, pastor/counselor referrals, resources given, and follow-up. Access restricted to care team.',
      },
      {
        path:        '/womens/support-groups',
        label:       'Support Groups',
        icon:        '🫂',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Standing recovery and support groups — grief, divorce care, addiction recovery — with facilitator, meeting info, and roster.',
      },
      {
        path:        '/womens/referrals',
        label:       'Referral Directory',
        icon:        '📇',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Standing directory of counselors, hotlines, and outside organizations to refer women to — phone, cost, specialty, and referral notes.',
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
        path:        '/womens/leaders',
        label:       'Leaders',
        icon:        '🧑‍🏫',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Ministry leaders and coordinators — role, area of focus, availability, and training status.',
      },
      {
        path:        '/womens/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-green, #6ee7b7)',
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
        path:        '/womens/engagement',
        label:       'Engagement & Attendance',
        icon:        '📊',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Trends across studies, events, and care — who is engaging, who has gone quiet, and where to invest next.',
      },
      {
        path:        '/womens/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Written, photo, and video stories of life change — collected with permission to share with the congregation.',
      },
      {
        path:        '/womens/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: "Everything that's already wrapped up across the ministry — Bible studies, events, mentorship, meal trains, new-mom graduations, closed groups, and closed care cases — grouped by year and searchable.",
      },
    ],
  },
];

/* Flat array of every Women's page — used for routing + lookup. */
export const WOMENS_PAGES = [
  WOMENS_OVERVIEW,
  WOMENS_MY_INVOLVEMENT,
  WOMENS_RESOURCE_LIBRARY,
  WOMENS_SAVED,
  ...WOMENS_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Women's paths — used by NavRail to decide if the
   Women's group should be auto-opened. */
export const WOMENS_PATHS = WOMENS_PAGES.map(p => p.path);

/* Look up a Women's page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getWomensPage(pathname) {
  return WOMENS_PAGES.find(p => p.path === pathname);
}
