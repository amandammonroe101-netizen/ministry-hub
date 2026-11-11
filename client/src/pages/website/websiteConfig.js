/* ─────────────────────────────────────────────────────────────
   Website Ministry — page registry.
   Single source of truth for Website sub-pages. Both:
     • NavRail (sidebar item)
     • App.jsx (route generation)
   read from this list.

   Unlike most of the other config-registry ministries, every one
   of these pages already had a real, fully-built component before
   this registry existed — this file just gives Website the same
   single-flat-nav-item + config-driven-routing shell as Women's /
   Hospitality. ComingSoon is kept only as a safety fallback for
   any path added here before its component is wired in App.jsx.
   ───────────────────────────────────────────────────────────── */

export const WEBSITE_ACCENT = '#a8791f';

/* Top-level Website landing page (no sub-group). */
export const WEBSITE_OVERVIEW = {
  path:        '/website',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#a8791f',
  description: "Dashboard for the Website ministry — page health, open forms and issues, upcoming SEO reviews, and hosting/domain status at a glance.",
  group:       'Overview',
};

export const WEBSITE_GROUPS = [
  {
    key:   'inventory',
    label: 'Inventory & Standards',
    icon:  '📚',
    color: '#3f6b5e',
    items: [
      {
        path:        '/site-pages',
        label:       'Page Audit',
        icon:        '📋',
        accent:      '#3f6b5e',
        description: 'Inventory of every page on the church website — section, owner, review cadence, and status (Active / Outdated / Draft / Archived / Broken).',
      },
      {
        path:        '/site-forms',
        label:       'Forms Tracker',
        icon:        '📥',
        accent:      '#3f6b5e',
        description: 'Every form embedded on the site — Contact, Prayer, Newsletter, RSVP, Volunteer, and more — with status and review due dates.',
      },
      {
        path:        '/site-tech-stack',
        label:       'Tech Stack',
        icon:        '🧱',
        accent:      '#3f6b5e',
        description: 'What the site is built on — hosting, CMS, plugins, email, analytics, giving, forms, integrations, media, security, and dev tools.',
      },
      {
        path:        '/style-guide',
        label:       'Style Guide',
        icon:        '🎨',
        accent:      '#3f6b5e',
        description: "The church's brand style guide — color palette, typography, voice & tone — kept consistent with the website.",
      },
    ],
  },
  {
    key:   'maintenance',
    label: 'Maintenance & Health',
    icon:  '🩺',
    color: '#7a2e2e',
    items: [
      {
        path:        '/update-log',
        label:       'Update Log',
        icon:        '📝',
        accent:      '#7a2e2e',
        description: 'Chronological changelog of every change made to the site — section, category, and who made it.',
      },
      {
        path:        '/site-issues',
        label:       'Broken Links & Issues',
        icon:        '🔗',
        accent:      '#7a2e2e',
        description: 'Ticket tracker for broken links and site issues — status and severity, from report to resolution.',
      },
      {
        path:        '/seo',
        label:       'SEO Health',
        icon:        '🔍',
        accent:      '#7a2e2e',
        description: 'Per-page SEO checklist — meta title/description, H1, canonical URL — pulled from the Page Audit.',
      },
    ],
  },
  {
    key:   'operations',
    label: 'Operations',
    icon:  '⚙',
    color: '#3b4a6b',
    items: [
      {
        path:        '/hosting',
        label:       'Hosting & Domain',
        icon:        '🖥',
        accent:      '#3b4a6b',
        description: "\"Don't lose the website\" reference — domain, DNS, hosting, SSL, backups, and emergency tech contacts.",
      },
      {
        path:        '/feedback',
        label:       'Visitor Feedback',
        icon:        '💬',
        accent:      '#3b4a6b',
        description: 'Inbox for feedback submitted through the site — compliments, complaints, suggestions, and questions.',
      },
    ],
  },
];

/* Flat array of every Website page — used for routing + lookup. */
export const WEBSITE_PAGES = [
  WEBSITE_OVERVIEW,
  ...WEBSITE_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Website paths — used by NavRail to decide if the Website
   entry should read as active. */
export const WEBSITE_PATHS = WEBSITE_PAGES.map(p => p.path);

/* Look up a Website page by exact path. Returns undefined for
   unknown paths so callers can render a fallback. */
export function getWebsitePage(pathname) {
  return WEBSITE_PAGES.find(p => p.path === pathname);
}
