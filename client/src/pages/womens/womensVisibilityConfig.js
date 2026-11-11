/* ─────────────────────────────────────────────────────────────
   Women's Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as the
   main app's nav visibility (see ../settings/navVisibilityConfig.js),
   scoped to this circle's own dropdown menu instead of the rail.

   Storage shape (at user-store key 'womens:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/womens') is NOT included here — it's the ministry's
   landing page and stays mandatory, same as Calendar/Chat/Contacts
   are mandatory in the main rail.
   ───────────────────────────────────────────────────────────── */

import { WOMENS_MY_INVOLVEMENT, WOMENS_RESOURCE_LIBRARY, WOMENS_SAVED, WOMENS_GROUPS } from './womensConfig';

export const WOMENS_VISIBILITY_STORAGE_KEY = 'womens:visible-pages';

/* Set once (per account, ever) after a woman finishes — or dismisses —
   the "pick your pages" modal shown the first time she lands on the
   Overview. See WomensOnboardingModal / ComingSoon.jsx. */
export const WOMENS_ONBOARDING_SEEN_KEY = 'womens:onboarding-seen';

/* Flat pages that sit above the groups — toggleable individually. */
export const WOMENS_TOGGLEABLE_TOP_LINKS = [WOMENS_MY_INVOLVEMENT, WOMENS_RESOURCE_LIBRARY, WOMENS_SAVED];

/* Helper used by WomensShell to decide whether to render a page.
   Defaults to TRUE for any path not in the map. */
export function isWomensPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_WOMENS_TOGGLEABLE_PATHS = [
  ...WOMENS_TOGGLEABLE_TOP_LINKS.map(p => p.path),
  ...WOMENS_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
