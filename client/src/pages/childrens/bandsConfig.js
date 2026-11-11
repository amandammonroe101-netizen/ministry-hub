import { useUserStoreKey } from '../../lib/userStore';

/* ─────────────────────────────────────────────────────────────
   Shared age-band config for every Children's Ministry page.
   The bands are user-editable (via the Manage Bands modal on the
   Age Groups page) but ship with sensible defaults so the app
   works out of the box.

   Storage: childrens:bands → array of { id, label, minAge, maxAge,
   defaultRatio, sortOrder }.

   Foreign-key strategy: the kid's `ageBand` field stores the
   band's LABEL (not id). This stays backward-compatible with
   pre-editor data. Renaming a band cascades through kids + rooms
   (see migrateLabelTo in AgeGroups.jsx).
   ───────────────────────────────────────────────────────────── */

const makeBandId = () => 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export const DEFAULT_BANDS = [
  { id: 'b_nursery',   label: 'Nursery (0-2)',   minAge: 0, maxAge: 2,  defaultRatio: '1:4',  sortOrder: 0 },
  { id: 'b_toddler',   label: 'Toddler (2-3)',   minAge: 2, maxAge: 3,  defaultRatio: '1:6',  sortOrder: 1 },
  { id: 'b_preschool', label: 'Preschool (3-5)', minAge: 3, maxAge: 5,  defaultRatio: '1:10', sortOrder: 2 },
  { id: 'b_k2',        label: 'K-2nd',           minAge: 5, maxAge: 8,  defaultRatio: '1:10', sortOrder: 3 },
  { id: 'b_345',       label: '3rd-5th',         minAge: 8, maxAge: 11, defaultRatio: '1:10', sortOrder: 4 },
];

/* Common adult:kid ratios — used to populate the ratio dropdown
   so the user picks instead of free-types. Ordered from strictest
   to loosest so the default for younger bands lives near the top. */
export const COMMON_RATIOS = ['1:3', '1:4', '1:5', '1:6', '1:8', '1:10', '1:12', '1:15'];

/** Live-subscribed bands list, always sorted by sortOrder. Falls
 *  back to the defaults if storage hasn't seeded yet (first run on
 *  a brand-new install). Returns BOTH the list AND the setter so
 *  pages that need to mutate (the Manage Bands modal) can write. */
export function useBands() {
  const [bands, setBands, meta] = useUserStoreKey('childrens:bands', DEFAULT_BANDS);
  const safe = Array.isArray(bands) && bands.length > 0
    ? [...bands].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : DEFAULT_BANDS;
  return [safe, setBands, meta];
}

/** Lookup a band by either its id OR its label. Returns null when
 *  no match — caller should treat that as "orphaned / needs
 *  reassignment". */
export function findBand(bands, ageBandKey) {
  if (!ageBandKey || !Array.isArray(bands)) return null;
  return bands.find(b => b.id === ageBandKey)
      || bands.find(b => b.label === ageBandKey)
      || null;
}

/** Suggest a band LABEL from a YYYY-MM-DD birthday. Picks the
 *  first band whose age range contains the kid's current age.
 *  Returns '' on miss so the caller can decide what to show. */
export function suggestBandForBirthday(iso, bands) {
  if (!iso || !Array.isArray(bands)) return '';
  /* Parse YYYY-MM-DD as LOCAL midnight (avoids the UTC drift bug
     that's bitten us elsewhere on this page). */
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dob = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dob.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthday = now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthday) age--;
  const sorted = [...bands].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const b of sorted) {
    const lo = b.minAge ?? 0;
    const hi = b.maxAge ?? 99;
    if (age >= lo && age <= hi) return b.label;
  }
  return '';
}

/** Make a new band record with sensible defaults. */
export function makeBand(overrides = {}) {
  return {
    id:           makeBandId(),
    label:        '',
    minAge:       0,
    maxAge:       0,
    defaultRatio: '1:10',
    sortOrder:    Date.now(),
    ...overrides,
  };
}
