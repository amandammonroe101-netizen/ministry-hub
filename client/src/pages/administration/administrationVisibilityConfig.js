/* ─────────────────────────────────────────────────────────────
   Administration Ministry — sidebar page visibility.
   Same "default visible, hide what you don't use" model as the
   main app's nav visibility (see ../settings/navVisibilityConfig.js),
   scoped to this ministry's own dropdown menu instead of the rail.

   Storage shape (at user-store key 'administration:visible-pages'):
     { <path>: boolean }
   Missing keys default to TRUE so new pages appear by default.

   Overview ('/administration') is NOT included here — it's the
   ministry's landing page and stays mandatory, same as
   Calendar/Chat/Contacts are mandatory in the main rail.
   ───────────────────────────────────────────────────────────── */

import { ADMINISTRATION_GROUPS } from './administrationConfig';

export const ADMINISTRATION_VISIBILITY_STORAGE_KEY = 'administration:visible-pages';

/* Set once (per account, ever) after a member finishes — or dismisses —
   the "pick your pages" modal shown the first time they land on the
   Overview. See AdministrationOnboardingModal / ComingSoon.jsx. */
export const ADMINISTRATION_ONBOARDING_SEEN_KEY = 'administration:onboarding-seen';

/* Helper used by AdministrationShell to decide whether to render a
   page. Defaults to TRUE for any path not in the map. */
export function isAdministrationPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

/* Every togglable path, in the order it appears in the dropdown.
   Used for "select all" / "hide all". */
export const ALL_ADMINISTRATION_TOGGLEABLE_PATHS = [
  ...ADMINISTRATION_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
