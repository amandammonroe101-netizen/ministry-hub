/* AppHeader — shared topbar rendered globally on every page.

   Mirrors the Calendar header style: logo · "Elite Journal Hub" ·
   page tag pill, plus an optional right-side action slot. Pulls
   the current page's name + tag color from the URL so each page
   gets the right pill automatically without per-page wiring.

   Pages that already have their own bespoke topbar (Journal,
   Prayers, Friends, Calendar, Day Planner) live in EXCLUDED_PATHS
   so this component returns null on those routes and doesn't
   create a duplicate header. */

import { useLocation } from 'react-router-dom';

/* Pages that already render their own .app-topbar with custom
   actions. Listing them here skips the shared header so we don't
   stack two on top of each other. */
const EXCLUDED_PATHS = new Set([
  '/journal',
  '/prayers',
  '/friends',
  '/calendar',
  '/day-planner',
  '/songs',
  '/studio',
  '/multitrack',
  '/testimony',
  '/writing',
  '/login',
  '/register',
]);

/* Exact path → { label, tag-color-class } map. Tag classes line up
   with the .app-tab-tag.* rules already defined in index.css. */
const PATH_INFO = {
  '/chat':           { label: 'Chat',          tag: '' },
  '/testimony':      { label: 'Testimony',     tag: '' },
  '/writing':        { label: 'Writing Mode',  tag: '' },
  '/library':        { label: 'Library',       tag: '' },
  '/settings':       { label: 'Settings',      tag: '' },

  '/songs':          { label: 'Songs',         tag: 'songs' },
  '/studio':         { label: 'Studio',        tag: 'studio' },
  '/multitrack':     { label: 'Multitrack',    tag: 'multitrack' },
  '/drums':          { label: 'Drums',         tag: '' },
  '/seaboard':       { label: 'Seaboard',      tag: '' },
  '/akai':           { label: 'AKAI MPC',      tag: '' },
  '/setlist':        { label: 'Setlist',       tag: '' },
  '/service-builder':{ label: 'Service Builder', tag: '' },
  '/lyrics':         { label: 'Lyrics Display', tag: '' },
  '/countdown':      { label: 'Countdown',     tag: '' },
  '/roster':         { label: 'Roster',        tag: '' },
  '/scheduling':     { label: 'Scheduling',    tag: '' },
  '/subs':           { label: 'Subs',          tag: '' },
  '/onboarding':     { label: 'Onboarding',    tag: '' },
  '/themes':         { label: 'Themes',        tag: '' },
  '/ccli':           { label: 'CCLI Log',      tag: '' },
  '/charts':         { label: 'Chord Charts',  tag: '' },
  '/stems':          { label: 'Stems Library', tag: '' },
  '/mix-notes':      { label: 'Mix Notes',     tag: '' },
  '/scheduling-rec': { label: 'Scheduling Rec.', tag: '' },
  '/inventory':      { label: 'Inventory',     tag: '' },
  '/maintenance':    { label: 'Maintenance Log', tag: '' },
  '/stage-plot':     { label: 'Stage Plot',    tag: '' },
  '/tech-issues':    { label: 'Tech Issues',   tag: '' },
  '/budget':         { label: 'Budget',        tag: '' },
  '/documents':      { label: 'Documents',     tag: '' },
  '/meetings':       { label: 'Meetings',      tag: '' },
  '/backup':         { label: 'Backup & Export', tag: '' },

  '/site-pages':     { label: 'Page Audit',    tag: '' },
  '/site-forms':     { label: 'Forms Tracker', tag: '' },
  '/site-tech-stack':{ label: 'Tech Stack',    tag: '' },
  '/style-guide':    { label: 'Style Guide',   tag: '' },
  '/update-log':     { label: 'Update Log',    tag: '' },
  '/site-issues':    { label: 'Site Issues',   tag: '' },
  '/seo':            { label: 'SEO Health',    tag: '' },
  '/hosting':        { label: 'Hosting',       tag: '' },
  '/feedback':       { label: 'Visitor Feedback', tag: '' },

  '/blog-posts':       { label: 'Blog Posts',       tag: '' },
  '/blog-ideas':       { label: 'Blog Ideas',       tag: '' },
  '/blog-quotes':      { label: 'Blog Quotes',      tag: '' },
  '/blog-series':      { label: 'Blog Series',      tag: '' },
  '/blog-authors':     { label: 'Blog Authors',     tag: '' },
  '/blog-comments':    { label: 'Blog Comments',    tag: '' },
  '/blog-newsletters': { label: 'Newsletter Issues', tag: '' },
  '/blog-performance': { label: 'Post Performance', tag: '' },

  '/podcast-studio':     { label: 'Podcast Studio',     tag: '' },
  '/podcast-recordings': { label: 'Podcast Recordings', tag: '' },
  '/podcast-editor':     { label: 'Podcast Editor',     tag: '' },
  '/podcast-scenes':     { label: 'Podcast Scenes',     tag: '' },
};

/* Path prefix → { label, tag } map. Used for ministry sub-pages
   (e.g. /youth/*, /childrens/*, /outreach/*). The page-specific
   label comes from the trailing slug, but the tag color reflects
   the ministry the page belongs to. */
const PREFIX_INFO = [
  { prefix: '/youth',          ministry: 'Youth',          tag: '' },
  { prefix: '/childrens',      ministry: "Children's",     tag: '' },
  { prefix: '/outreach',       ministry: 'Outreach',       tag: '' },
  { prefix: '/womens',         ministry: "Women's",        tag: '' },
  { prefix: '/mens',           ministry: "Men's",          tag: '' },
  { prefix: '/tech',           ministry: 'Tech',           tag: '' },
  { prefix: '/missions',       ministry: 'Missions',       tag: '' },
  { prefix: '/hospitality',    ministry: 'Hospitality',    tag: '' },
  { prefix: '/discipleship',   ministry: 'Discipleship',   tag: '' },
  { prefix: '/administration', ministry: 'Administration', tag: '' },
  { prefix: '/pastoral',       ministry: 'Pastoral',       tag: '' },
  { prefix: '/author',         ministry: 'Author',         tag: '' },
  { prefix: '/social-media',   ministry: 'Social Media',   tag: '' },
];

/* Pull a friendly label from a path slug — kebab-case → Title Case. */
function slugToLabel(slug) {
  if (!slug) return '';
  return slug
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function getPageInfo(pathname) {
  if (EXCLUDED_PATHS.has(pathname)) return null;

  const exact = PATH_INFO[pathname];
  if (exact) return exact;

  /* Ministry prefix match — derive sub-page label from the slug
     after the ministry root. e.g. /youth/bible-studies → "Bible
     Studies — Youth". */
  for (const entry of PREFIX_INFO) {
    if (pathname === entry.prefix) {
      return { label: entry.ministry, tag: entry.tag };
    }
    if (pathname.startsWith(entry.prefix + '/')) {
      const slug = pathname.slice(entry.prefix.length + 1);
      const subLabel = slugToLabel(slug);
      return {
        label: `${subLabel} — ${entry.ministry}`,
        tag: entry.tag,
      };
    }
  }

  return null;
}

export default function AppHeader({ children }) {
  const { pathname } = useLocation();
  const info = getPageInfo(pathname);
  if (!info) return null;

  return (
    <div className="app-topbar">
      <div className="app-logo">
        <div className="app-logo-gem">✝</div>
        <span className="app-logo-name">Elite Journal Hub</span>
        <span className="app-logo-sep">·</span>
        <span className={`app-tab-tag ${info.tag || ''}`.trim()}>
          {info.label}
        </span>
      </div>
      <div className="app-tb-actions">
        {/* Pages can pass extra actions in via `children`. Empty by
            default so the standard header stays clean on pages that
            don't need page-specific buttons. */}
        {children}
      </div>
    </div>
  );
}
