/* ─────────────────────────────────────────────────────────────
   Tech / Production Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as
   womensVisibilityConfig.js / mensVisibilityConfig.js, scoped to
   this ministry's own dropdown menu instead of the rail.

   Storage shape (at user-store key 'tech:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/tech') is NOT included here — it's the ministry's
   landing page and stays mandatory, same as Women's/Men's Overview.
   ───────────────────────────────────────────────────────────── */

import { TECH_GROUPS } from './techConfig';

export const TECH_VISIBILITY_STORAGE_KEY = 'tech:visible-pages';

/* No flat top-level pages sit above Tech's groups today (unlike
   Women's My Involvement / Resource Library / Saved) — every Tech
   page lives inside a group, so this stays empty. */
export const TECH_TOGGLEABLE_TOP_LINKS = [];

/* Helper used by TechShell to decide whether to render a page.
   Defaults to TRUE for any path not in the map. */
export function isTechPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_TECH_TOGGLEABLE_PATHS = [
  ...TECH_TOGGLEABLE_TOP_LINKS.map(p => p.path),
  ...TECH_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
