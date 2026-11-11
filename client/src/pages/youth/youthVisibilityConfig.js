/* ─────────────────────────────────────────────────────────────
   Youth Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as
   Women's Ministry (see womensVisibilityConfig.js), scoped to
   this section's own dropdown menu instead of the main rail.

   Storage shape (at user-store key 'youth:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/youth') is NOT included here — it's the section's
   landing page and stays mandatory.
   ───────────────────────────────────────────────────────────── */

import { YOUTH_GROUPS } from './youthConfig';

export const YOUTH_VISIBILITY_STORAGE_KEY = 'youth:visible-pages';

/* Set once (per account, ever) after a leader finishes — or dismisses —
   the "pick your pages" modal shown the first time they land on the
   Overview. See YouthOnboardingModal / Overview.jsx. */
export const YOUTH_ONBOARDING_SEEN_KEY = 'youth:onboarding-seen';

/* Youth has no flat top-level pages besides Overview (unlike Women's
   My Involvement / Resource Library / Saved) — every togglable page
   lives inside a group. */
export const YOUTH_TOGGLEABLE_TOP_LINKS = [];

/* Helper used by YouthShell to decide whether to render a page.
   Defaults to TRUE for any path not in the map. */
export function isYouthPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_YOUTH_TOGGLEABLE_PATHS = [
  ...YOUTH_TOGGLEABLE_TOP_LINKS.map(p => p.path),
  ...YOUTH_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
