/* ─────────────────────────────────────────────────────────────
   Discipleship Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as
   womensVisibilityConfig.js, scoped to this ministry's own
   dropdown menu instead of the rail.

   Storage shape (at user-store key 'discipleship:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/discipleship') is NOT included here — it's the
   ministry's landing page and stays mandatory, same as Women's
   Overview.
   ───────────────────────────────────────────────────────────── */

import { DISCIPLESHIP_MY_INVOLVEMENT, DISCIPLESHIP_RESOURCE_LIBRARY, DISCIPLESHIP_SAVED, DISCIPLESHIP_GROUPS } from './discipleshipConfig';

export const DISCIPLESHIP_VISIBILITY_STORAGE_KEY = 'discipleship:visible-pages';

/* Set once (per account, ever) after someone finishes — or dismisses —
   the "pick your pages" modal shown the first time they land on the
   Overview. See ComingSoon.jsx. */
export const DISCIPLESHIP_ONBOARDING_SEEN_KEY = 'discipleship:onboarding-seen';

/* Flat pages that sit above the groups — toggleable individually. */
export const DISCIPLESHIP_TOGGLEABLE_TOP_LINKS = [DISCIPLESHIP_MY_INVOLVEMENT, DISCIPLESHIP_RESOURCE_LIBRARY, DISCIPLESHIP_SAVED];

/* Helper used by DiscipleshipShell to decide whether to render a page.
   Defaults to TRUE for any path not in the map. */
export function isDiscipleshipPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_DISCIPLESHIP_TOGGLEABLE_PATHS = [
  ...DISCIPLESHIP_TOGGLEABLE_TOP_LINKS.map(p => p.path),
  ...DISCIPLESHIP_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
