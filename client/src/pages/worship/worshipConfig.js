/* ─────────────────────────────────────────────────────────────
   Worship Ministry — page registry.
   Single source of truth for Worship sub-pages. Both:
     • NavRail (sidebar item)
     • WorshipShell (internal dropdown nav)
     • ComingSoon (per-page header + meta)
   read from this list.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component.
     2. In App.jsx, swap `<WorshipComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const WORSHIP_ACCENT = '#fb7185';

/* Top-level Worship landing page (no sub-group). */
export const WORSHIP_OVERVIEW = {
  path:        '/worship',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#fb7185',
  description: 'Dashboard for the Worship ministry — everything from live-service tools to song management, the band roster, gear, and admin lives here.',
  group:       'Overview',
};

export const WORSHIP_GROUPS = [
  {
    key:   'live',
    label: 'Live Worship / Events',
    icon:  '🎙',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/live/setlist',
        label:       'Setlist',
        icon:        '📋',
        accent:      '#94a3b8',
        description: 'Build and manage the setlist for each service — song order, keys, and transitions.',
      },
      {
        path:        '/worship/live/service-builder',
        label:       'Service Builder',
        icon:        '🗓',
        accent:      '#94a3b8',
        description: 'Plan the full service flow — songs, announcements, transitions, and cues in one timeline.',
      },
      {
        path:        '/worship/live/lyrics',
        label:       'Lyrics Display',
        icon:        '📺',
        accent:      '#94a3b8',
        description: 'Live lyrics display for the stage/screens during service.',
      },
      {
        path:        '/worship/live/countdown',
        label:       'Countdown',
        icon:        '⏱',
        accent:      '#94a3b8',
        description: 'Pre-service countdown timer for the stage and lobby screens.',
      },
    ],
  },
  {
    key:   'instruments',
    label: 'Instruments',
    icon:  '🎸',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/instruments/piano',
        label:       'Piano',
        icon:        '🎹',
        accent:      '#94a3b8',
        description: 'Virtual piano/keys instrument — play, record, and practice.',
      },
      {
        path:        '/worship/instruments/drums',
        label:       'Drums',
        icon:        '🥁',
        accent:      '#94a3b8',
        description: 'Virtual drum kit — play, record, and practice.',
      },
      {
        path:        '/worship/instruments/seaboard',
        label:       'Seaboard',
        icon:        '🌊',
        accent:      '#94a3b8',
        description: 'Seaboard-style expressive instrument surface.',
      },
      {
        path:        '/worship/instruments/akai',
        label:       'AKAI MPC',
        icon:        '🎛',
        accent:      '#94a3b8',
        description: 'AKAI MPC-style pad sampler and sequencer.',
      },
      {
        path:        '/worship/instruments/sound-creator',
        label:       'Sound Creator',
        icon:        '🌀',
        accent:      '#94a3b8',
        description: 'Record weird sounds and mix them into something new.',
      },
    ],
  },
  {
    key:   'production',
    label: 'Recording / Production',
    icon:  '🎚',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/production/multitrack',
        label:       'Studio',
        icon:        '🎚',
        accent:      '#94a3b8',
        description: 'Multitrack recording studio — record, mix, and produce worship tracks.',
      },
      {
        path:        '/worship/production/stems',
        label:       'Stems Library',
        icon:        '🎛',
        accent:      '#94a3b8',
        description: 'Library of recorded stems for mixing and re-use across sessions.',
      },
      {
        path:        '/worship/production/mix-notes',
        label:       'Mix Notes',
        icon:        '📝',
        accent:      '#94a3b8',
        description: 'Notes and feedback on mixes across sessions and songs.',
      },
      {
        path:        '/worship/production/scheduling-rec',
        label:       'Scheduling Rec.',
        icon:        '🎙',
        accent:      '#94a3b8',
        description: 'Scheduling for recording sessions — booking rooms, players, and engineers.',
      },
    ],
  },
  {
    key:   'songs',
    label: 'Song Management',
    icon:  '📚',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/songs/all',
        label:       'Songs',
        icon:        '🎵',
        accent:      '#94a3b8',
        description: 'Full song library — keys, tempos, arrangements, and links.',
      },
      {
        path:        '/worship/songs/themes',
        label:       'Themes',
        icon:        '🏷',
        accent:      '#94a3b8',
        description: 'Organize songs by theme or topic for service planning.',
      },
      {
        path:        '/worship/songs/ccli',
        label:       'CCLI Log',
        icon:        '📑',
        accent:      '#94a3b8',
        description: 'CCLI reporting log for licensed songs used in services.',
      },
      {
        path:        '/worship/songs/charts',
        label:       'Chord Charts',
        icon:        '📄',
        accent:      '#94a3b8',
        description: 'Chord charts for the band, organized per song.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Band / Team',
    icon:  '👥',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/team/roster',
        label:       'Roster',
        icon:        '👤',
        accent:      '#94a3b8',
        description: 'Directory of every worship team member — role, contact, and availability.',
      },
      {
        path:        '/worship/team/scheduling',
        label:       'Scheduling',
        icon:        '📆',
        accent:      '#94a3b8',
        description: 'Per-service schedule for the band and tech team — fills, swaps, and sub requests.',
      },
      {
        path:        '/worship/team/subs',
        label:       'Subs',
        icon:        '🔄',
        accent:      '#94a3b8',
        description: 'Substitute coverage tracking when a team member can’t make a service.',
      },
      {
        path:        '/worship/team/onboarding',
        label:       'Onboarding',
        icon:        '📝',
        accent:      '#94a3b8',
        description: 'Onboarding checklist for new worship team members.',
      },
    ],
  },
  {
    key:   'gear',
    label: 'Gear / Tech',
    icon:  '🛠',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/gear/inventory',
        label:       'Inventory',
        icon:        '📦',
        accent:      '#94a3b8',
        description: 'Inventory of instruments, cables, and gear owned by the ministry.',
      },
      {
        path:        '/worship/gear/maintenance',
        label:       'Maintenance Log',
        icon:        '🔧',
        accent:      '#94a3b8',
        description: 'Maintenance history and upcoming service needs for gear.',
      },
      {
        path:        '/worship/gear/stage-plot',
        label:       'Stage Plot',
        icon:        '🗺',
        accent:      '#94a3b8',
        description: 'Stage plot diagrams for setup — instrument and monitor placement.',
      },
      {
        path:        '/worship/gear/tech-issues',
        label:       'Tech Issues',
        icon:        '⚠',
        accent:      '#94a3b8',
        description: 'Tracked tech issues and fixes for stage and sound gear.',
      },
    ],
  },
  {
    key:   'admin',
    label: 'Admin',
    icon:  '🗂',
    color: '#94a3b8',
    items: [
      {
        path:        '/worship/admin/budget',
        label:       'Budget',
        icon:        '💰',
        accent:      '#94a3b8',
        description: 'Ministry budget tracking — spending, requests, and approvals.',
      },
      {
        path:        '/worship/admin/documents',
        label:       'Documents',
        icon:        '📄',
        accent:      '#94a3b8',
        description: 'Shared documents for the worship team — policies, forms, and references.',
      },
      {
        path:        '/worship/admin/meetings',
        label:       'Meetings',
        icon:        '🗣',
        accent:      '#94a3b8',
        description: 'Team meeting notes and agendas.',
      },
      {
        path:        '/worship/admin/backup',
        label:       'Backup & Export',
        icon:        '💾',
        accent:      '#94a3b8',
        description: 'Backup and export tools for worship ministry data.',
      },
    ],
  },
];

/* Flat array of every Worship page — used for routing + lookup. */
export const WORSHIP_PAGES = [
  WORSHIP_OVERVIEW,
  ...WORSHIP_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Worship paths — used by NavRail to decide if the
   Worship group should be auto-opened. */
export const WORSHIP_PATHS = WORSHIP_PAGES.map(p => p.path);

/* Look up a Worship page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getWorshipPage(pathname) {
  return WORSHIP_PAGES.find(p => p.path === pathname);
}
