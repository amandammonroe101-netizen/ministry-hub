/* ─────────────────────────────────────────────────────────────
   Tech / Production Ministry — page registry.
   Single source of truth for Tech sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: this ministry focuses on SERVICE PRODUCTION
   (FOH/monitors/cameras/lights/stream/run sheets). The existing
   Worship → Gear/Tech sub-group stays in place for worship-
   specific instrument-side gear.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. TechFohMixing).
     2. In App.jsx, swap `<TechComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const TECH_ACCENT = '#1ba8c4';

/* Top-level Tech landing page (no sub-group). */
export const TECH_OVERVIEW = {
  path:        '/tech',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#1ba8c4',
  description: 'Dashboard for the Tech / Production ministry — this Sunday\'s run-of-show, open tech issues, gear flagged for maintenance, stream health, and team coverage will live here.',
  group:       'Overview',
};

export const TECH_GROUPS = [
  {
    key:   'team',
    label: 'Team',
    icon:  '🧑‍💻',
    color: '#3d5872',
    items: [
      {
        path:        '/tech/all',
        label:       'All Techs',
        icon:        '🧑‍🤝‍🧑',
        accent:      '#3d5872',
        description: 'Directory of every tech volunteer — photo, contact, primary discipline (audio / video / lighting / streaming), proficiency level, and availability.',
      },
      {
        path:        '/tech/roles',
        label:       'Roles & Positions',
        icon:        '🎯',
        accent:      '#3d5872',
        description: 'Every production position (FOH, Monitor Eng, Camera 1/2, Director, Lyrics Op, Lighting Op, Stream Op) — qualified techs per role, required training, and gear assignments.',
      },
      {
        path:        '/tech/training',
        label:       'In Training',
        icon:        '✨',
        accent:      '#3d5872',
        description: 'Trainees in onboarding — current position, shadow shifts logged, training-checklist progress, and target signoff date.',
      },
    ],
  },
  {
    key:   'audio',
    label: 'Audio',
    icon:  '🎚',
    color: '#b3261e',
    items: [
      {
        path:        '/tech/audio/foh',
        label:       'FOH Mixing',
        icon:        '🎚',
        accent:      '#b3261e',
        description: 'Front-of-house console scenes, gain settings, EQ snapshots, and mix notes per service or song. Quick recall presets for guest speakers and worship sets.',
      },
      {
        path:        '/tech/audio/monitors',
        label:       'Monitor Mixes',
        icon:        '🎧',
        accent:      '#b3261e',
        description: 'In-ear and wedge mixes per stage position — saved presets per musician, talent feedback log, and request inbox.',
      },
      {
        path:        '/tech/audio/mic-plot',
        label:       'Mic Plot',
        icon:        '🎙',
        accent:      '#b3261e',
        description: 'Per-service mic plot — channel, instrument/vocalist, mic model, stand, and battery status for wireless packs.',
      },
    ],
  },
  {
    key:   'video',
    label: 'Video',
    icon:  '📹',
    color: '#1d5fa8',
    items: [
      {
        path:        '/tech/video/cameras',
        label:       'Cameras',
        icon:        '📹',
        accent:      '#1d5fa8',
        description: 'Camera positions, shot framing per moment (wide / preacher CU / drummer / piano), camera-op cue sheets, and IMAG guidelines.',
      },
      {
        path:        '/tech/video/switcher',
        label:       'Switcher / Direction',
        icon:        '🎬',
        accent:      '#1d5fa8',
        description: 'Director shot list, transition timing, scene presets, and per-element cuts (worship set / sermon / announcements).',
      },
      {
        path:        '/tech/video/graphics',
        label:       'Graphics',
        icon:        '🖥',
        accent:      '#1d5fa8',
        description: 'Lower-thirds, sermon slides, announcement loops, and lyrics — template library, per-service deck builder, and presentation cues.',
      },
    ],
  },
  {
    key:   'lighting',
    label: 'Lighting',
    icon:  '💡',
    color: '#6d28d9',
    items: [
      {
        path:        '/tech/lighting/cues',
        label:       'Console & Cues',
        icon:        '💡',
        accent:      '#6d28d9',
        description: 'Cue lists per service element, fixture patch, busking macros, and recorded shows for re-use.',
      },
      {
        path:        '/tech/lighting/palettes',
        label:       'Color Palettes & Looks',
        icon:        '🌈',
        accent:      '#6d28d9',
        description: 'Saved color palettes and named looks (worship / sermon / call-to-response / baptism / candlelight) with screenshots.',
      },
      {
        path:        '/tech/lighting/stage-wash',
        label:       'Stage Wash & Spots',
        icon:        '🎭',
        accent:      '#6d28d9',
        description: 'Front wash, key light coverage, follow-spot cues, and intensity baselines for camera-ready stage lighting.',
      },
    ],
  },
  {
    key:   'streaming',
    label: 'Streaming',
    icon:  '📡',
    color: '#0e7c91',
    items: [
      {
        path:        '/tech/stream/live',
        label:       'Live Stream',
        icon:        '📡',
        accent:      '#0e7c91',
        description: 'Stream destinations (YouTube, Facebook, web), encoder settings, bitrate health, and pre-stream checklist.',
      },
      {
        path:        '/tech/stream/recordings',
        label:       'Recordings & Archive',
        icon:        '🎞',
        accent:      '#0e7c91',
        description: 'Service captures with date, length, file location, and publishing status. Edited highlight reels and sermon-only cuts.',
      },
      {
        path:        '/tech/stream/online-chat',
        label:       'Online Chat / Comments',
        icon:        '💬',
        accent:      '#0e7c91',
        description: 'Online-host roster, prayer-request capture from chat, comment moderation log, and post-service follow-up queue.',
      },
    ],
  },
  {
    key:   'operations',
    label: 'Operations',
    icon:  '📋',
    color: '#92650a',
    items: [
      {
        path:        '/tech/ops/service-plans',
        label:       'Service Plans',
        icon:        '📋',
        accent:      '#92650a',
        description: 'Per-service run-of-show — every element with times, presenter, audio / video / lighting / lyric cues. Printable + sharable with the team.',
      },
      {
        path:        '/tech/ops/pre-service',
        label:       'Pre-Service Checklist',
        icon:        '⏱',
        accent:      '#92650a',
        description: 'Standardized soundcheck + tech check — mic test, comms check, camera tally, stream test, lighting reset. Sign-off per service.',
      },
      {
        path:        '/tech/ops/scheduling',
        label:       'Scheduling',
        icon:        '📅',
        accent:      '#92650a',
        description: 'Per-position schedule across services — fills, swaps, sub requests. Integrates with the global Scheduling Rec.',
      },
    ],
  },
  {
    key:   'gear',
    label: 'Gear & IT',
    icon:  '🛠',
    color: '#52525b',
    items: [
      {
        path:        '/tech/gear/inventory',
        label:       'Inventory',
        icon:        '📦',
        accent:      '#52525b',
        description: 'Every piece of production gear — consoles, cameras, lenses, lights, mics, packs, cables, computers. Serial, location, value, owner.',
      },
      {
        path:        '/tech/gear/maintenance',
        label:       'Maintenance Log',
        icon:        '🔧',
        accent:      '#52525b',
        description: 'Cleaning, firmware updates, lamp hours, calibration, and repair history per asset. Reminders for periodic checks.',
      },
      {
        path:        '/tech/gear/issues',
        label:       'Tech Issues',
        icon:        '⚠',
        accent:      '#52525b',
        description: 'Open issues during or after service — symptom, gear affected, severity, owner, status. Becomes a record in Reliability & Issues when closed.',
      },
      {
        path:        '/tech/gear/network',
        label:       'Network & Cabling',
        icon:        '🌐',
        accent:      '#52525b',
        description: 'Network diagram, IP map for AV-over-IP, VLANs, switches, runs, patch panels, and cable labels. Diagram of stage tielines.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#0f7a6c',
    items: [
      {
        path:        '/tech/records/reliability',
        label:       'Reliability & Issues',
        icon:        '📊',
        accent:      '#0f7a6c',
        description: 'Trend report of tech issues over time — by discipline, by gear, by service. Surface chronic problems and quantify the fix-or-replace decision.',
      },
      {
        path:        '/tech/records/wins',
        label:       'Wins & Highlights',
        icon:        '📷',
        accent:      '#0f7a6c',
        description: 'Stand-out shots, mix recordings the band loved, lighting looks worth re-using, and stream moments worth celebrating.',
      },
      {
        path:        '/tech/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#0f7a6c',
        description: 'Retired gear, past service plans, closed issues, and archived stream captures — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Tech page — used for routing + lookup. */
export const TECH_PAGES = [
  TECH_OVERVIEW,
  ...TECH_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Tech paths — used by NavRail to decide if the
   Tech group should be auto-opened. */
export const TECH_PATHS = TECH_PAGES.map(p => p.path);

/* Look up a Tech page by exact path. Returns undefined
   for unknown paths so callers can render a fallback. */
export function getTechPage(pathname) {
  return TECH_PAGES.find(p => p.path === pathname);
}
