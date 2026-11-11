/* ─────────────────────────────────────────────────────────────
   Men's Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as
   womensVisibilityConfig.js, scoped to this ministry's own
   dropdown menu instead of the rail.

   Storage shape (at user-store key 'mens:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/mens') is NOT included here — it's the ministry's
   landing page and stays mandatory, same as Women's Overview.
   ───────────────────────────────────────────────────────────── */

import { MENS_GROUPS } from './mensConfig';

export const MENS_VISIBILITY_STORAGE_KEY = 'mens:visible-pages';

/* Set once (per account, ever) after a man finishes — or dismisses —
   the "pick your pages" modal shown the first time he lands on the
   Overview. See ComingSoon.jsx. */
export const MENS_ONBOARDING_SEEN_KEY = 'mens:onboarding-seen';

/* No flat top-level pages sit above Men's groups today (unlike
   Women's My Involvement / Resource Library / Saved) — every Men's
   page lives inside a group, so this stays empty. */
export const MENS_TOGGLEABLE_TOP_LINKS = [];

/* Helper used by MensShell to decide whether to render a page.
   Defaults to TRUE for any path not in the map. */
export function isMensPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_MENS_TOGGLEABLE_PATHS = [
  ...MENS_TOGGLEABLE_TOP_LINKS.map(p => p.path),
  ...MENS_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
