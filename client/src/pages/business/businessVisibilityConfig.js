/* ─────────────────────────────────────────────────────────────
   Business Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as the
   main app's nav visibility (see ../settings/navVisibilityConfig.js),
   scoped to this ministry's own dropdown menu instead of the rail.

   Storage shape (at user-store key 'business:visible-pages'):
     { <path-template> : boolean }
   Missing keys default to TRUE so new pages appear by default.
   Keyed by the ":businessId" template path (not a resolved path),
   since visibility is a per-member preference that applies across
   every business, not just one.

   Overview ('/business') is NOT included here — it's the ministry's
   landing page and stays mandatory.
   ───────────────────────────────────────────────────────────── */

import { BUSINESS_GROUPS } from './businessConfig';

export const BUSINESS_VISIBILITY_STORAGE_KEY = 'business:visible-pages';

/* Helper used by BusinessShell to decide whether to render a page.
 *  Defaults to TRUE for any path not in the map. */
export function isBusinessPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path template, in the order it appears in the
   dropdown. Used for "select all" / "hide all". */
export const ALL_BUSINESS_TOGGLEABLE_PATHS = [
  ...BUSINESS_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
