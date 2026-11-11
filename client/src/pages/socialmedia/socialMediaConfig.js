/* ─────────────────────────────────────────────────────────────
   Social Media Ministry — page registry.
   Single source of truth for Social Media sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: built around the rhythm of running church social —
   a Content Studio where you create, a calendar that
   schedules + campaigns, per-platform pages (because
   Instagram / TikTok / YouTube really are different jobs),
   a brand asset library, an engagement inbox, analytics,
   and team coordination.

   Top accent uses a custom sky blue (#0ea5e9) — fresh and
   social-media-y, distinct from Men's lighter blue.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. SocialContentStudio).
     2. In App.jsx, swap `<SocialMediaComingSoon />` for the
        new component on that route. Keep the entry here so
        the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const SOCIAL_MEDIA_ACCENT = '#0ea5e9';

/* Top-level Social Media landing page (no sub-group). */
export const SOCIAL_MEDIA_OVERVIEW = {
  path:        '/social',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#0ea5e9',
  description: 'Dashboard for the Social Media ministry — this-week\'s content calendar, scheduled posts, comments and DMs waiting on a reply, top-performing recent post, and follower growth at a glance.',
  group:       'Overview',
};

export const SOCIAL_MEDIA_GROUPS = [
  {
    key:   'studio',
    label: 'Content Studio',
    icon:  '✍',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/social/studio/new',
        label:       'New Post',
        icon:        '📝',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Create a new post — choose platform(s), caption, hashtags, media, link, scheduled date. Save as draft or schedule directly.',
      },
      {
        path:        '/social/studio/drafts',
        label:       'Drafts',
        icon:        '🗂',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'In-progress posts not yet scheduled — last edited, platforms targeted, completion status, and a quick-jump back into the editor.',
      },
      {
        path:        '/social/studio/library',
        label:       'Content Library',
        icon:        '📚',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Every published post — searchable by platform, campaign, tag, and date. Clone to repost or remix for a different platform.',
      },
      {
        path:        '/social/studio/sermon-clips',
        label:       'Sermon Clips',
        icon:        '🎬',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Short clips pulled from full sermons (links into Tech / Streaming → Recordings) — trimmed, captioned, formatted per platform (Reels / Shorts / TikTok / X).',
      },
      {
        path:        '/social/studio/ideas',
        label:       'Content Ideas',
        icon:        '💡',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Backlog of post ideas — concept, target platform(s), inspiration link, scripture / theme, and "ready to create?" status.',
      },
    ],
  },
  {
    key:   'calendar',
    label: 'Calendar & Campaigns',
    icon:  '📅',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/social/calendar/content',
        label:       'Content Calendar',
        icon:        '📅',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Single calendar view across all platforms — drag-and-drop to reschedule, color-coded by platform / campaign, gap detection.',
      },
      {
        path:        '/social/calendar/scheduled',
        label:       'Scheduled Posts',
        icon:        '⏰',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Queue of upcoming posts — platform, time, status (scheduled / publishing / posted / failed), with quick-edit before publish.',
      },
      {
        path:        '/social/calendar/campaigns',
        label:       'Campaigns & Launches',
        icon:        '🎉',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Multi-post campaigns (sermon series launch, VBS, Christmas Eve, baptism Sunday) — campaign brief, post list, hashtag, and per-platform mix.',
      },
      {
        path:        '/social/calendar/series',
        label:       'Recurring Series',
        icon:        '🔄',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Standing weekly / monthly series (Sunday-recap Reel, Verse Monday, Worship Wednesday, Sermon-clip Sunday) — templates and slot reservations.',
      },
    ],
  },
  {
    key:   'platforms',
    label: 'Platforms',
    icon:  '🌐',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/social/platforms/instagram',
        label:       'Instagram',
        icon:        '📷',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Instagram-specific dashboard — Feed, Reels, Stories, Highlights, IGTV. Per-format ideas, posting cadence, hashtag bank, and account settings.',
      },
      {
        path:        '/social/platforms/facebook',
        label:       'Facebook',
        icon:        '📘',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Facebook page management — posts, events, groups, live-stream coordination (links into Tech / Streaming), and visitor messages.',
      },
      {
        path:        '/social/platforms/tiktok',
        label:       'TikTok',
        icon:        '🎵',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'TikTok strategy — trending sounds, hooks, format guidelines, posting cadence, and Sermon-clip optimization for the algorithm.',
      },
      {
        path:        '/social/platforms/youtube',
        label:       'YouTube',
        icon:        '▶',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'YouTube channel — long-form (full sermons / livestream replays), Shorts (clips), playlists, thumbnails, titles, and SEO descriptions.',
      },
      {
        path:        '/social/platforms/twitter',
        label:       'X / Twitter',
        icon:        '🐦',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'X / Twitter — text-first quote tweets, sermon takeaways, thread breakdowns, and engagement with the broader church conversation.',
      },
    ],
  },
  {
    key:   'brand',
    label: 'Brand & Assets',
    icon:  '🎨',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/social/brand/guidelines',
        label:       'Brand Guidelines',
        icon:        '🎨',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'The voice + visual rules — color palette, typography, logo usage, photography style, voice / tone, do-not-use phrases. Keeps the team on-brand.',
      },
      {
        path:        '/social/brand/library',
        label:       'Image & Video Library',
        icon:        '🖼',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Searchable library of photos, B-roll, footage, and stock — tagged by series, event, person, theme. Includes usage rights / model releases.',
      },
      {
        path:        '/social/brand/templates',
        label:       'Templates & Quote Cards',
        icon:        '🏷',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Per-platform post templates, quote-card designs, story templates, Reel covers, and a quick-create flow for routine series posts.',
      },
    ],
  },
  {
    key:   'engagement',
    label: 'Engagement',
    icon:  '💬',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/social/engagement/comments',
        label:       'Comments Inbox',
        icon:        '💬',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Unified comments inbox across platforms — needs-reply / replied / hidden states, assigned moderator, and template responses for common questions.',
      },
      {
        path:        '/social/engagement/dms',
        label:       'DMs Inbox',
        icon:        '📨',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Unified direct messages — pastoral / prayer requests routed to care team, general questions routed to office, and a sent-history audit log.',
      },
      {
        path:        '/social/engagement/moderation',
        label:       'Flags & Moderation',
        icon:        '⚠',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Hidden / reported / blocked log with reason, plus the comment policy itself. Escalation path for accusations or crises.',
      },
      {
        path:        '/social/engagement/highlights',
        label:       'Community Highlights',
        icon:        '🤝',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Notable user-generated content, member shoutouts, baptism reels worth sharing, and tagged-by-others posts to repost (with permission).',
      },
    ],
  },
  {
    key:   'analytics',
    label: 'Analytics & Ads',
    icon:  '📊',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/social/analytics/dashboard',
        label:       'Performance Dashboard',
        icon:        '📊',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'At-a-glance metrics across platforms — followers, reach, engagement rate, profile visits, link clicks, and week-over-week deltas.',
      },
      {
        path:        '/social/analytics/growth',
        label:       'Growth Trends',
        icon:        '📈',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Long-view charts — follower growth, engagement-rate trends, posting consistency, and per-format performance over months / quarters.',
      },
      {
        path:        '/social/analytics/top-content',
        label:       'Top Content',
        icon:        '🏆',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Top-performing posts across all platforms — by reach, engagement, saves, shares. Identifies what to do more of (and re-post).',
      },
      {
        path:        '/social/analytics/ads',
        label:       'Ad Campaigns',
        icon:        '💰',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Active and past paid campaigns (Meta Ads, YouTube Ads) — objective, audience, creative, spend, results, and cost per result.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🙋',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/social/team/members',
        label:       'Social Media Team',
        icon:        '🧑‍💻',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Team roster — creator / scheduler / community-manager / strategist / designer roles, platform ownership, and availability.',
      },
      {
        path:        '/social/team/communication',
        label:       'Communication',
        icon:        '📨',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Internal team broadcasts (email + SMS), weekly social huddle notes, and brief-distribution for campaigns and series.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#0ea5e9',
    items: [
      {
        path:        '/social/records/history',
        label:       'Stats & History',
        icon:        '📊',
        accent:      '#0ea5e9',
        description: 'Long-term snapshots of audience size, growth, top content, and campaign outcomes — exportable annual recap and board-ready summary.',
      },
      {
        path:        '/social/records/stories',
        label:       'Stories & Testimonies',
        icon:        '📷',
        accent:      '#0ea5e9',
        description: 'Stories of people who came / stayed / were ministered to through a social post — receipts that the work matters.',
      },
      {
        path:        '/social/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#0ea5e9',
        description: 'Retired campaigns, archived posts no longer in active rotation, and discontinued platforms — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Social Media page — used for routing + lookup. */
export const SOCIAL_MEDIA_PAGES = [
  SOCIAL_MEDIA_OVERVIEW,
  ...SOCIAL_MEDIA_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Social Media paths — used by NavRail to decide if the
   Social Media group should be auto-opened. */
export const SOCIAL_MEDIA_PATHS = SOCIAL_MEDIA_PAGES.map(p => p.path);

/* Look up a Social Media page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getSocialMediaPage(pathname) {
  return SOCIAL_MEDIA_PAGES.find(p => p.path === pathname);
}
