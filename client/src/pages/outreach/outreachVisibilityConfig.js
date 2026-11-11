import { OUTREACH_GROUPS } from './outreachConfig';

export const OUTREACH_VISIBILITY_STORAGE_KEY = 'outreach:visible-pages';
export const OUTREACH_ONBOARDING_SEEN_KEY = 'outreach:onboarding-seen';

export function isOutreachPageVisible(visibilityMap, path) {
  const v = visibilityMap?.[path];
  return v === undefined ? true : !!v;
}

export const ALL_OUTREACH_TOGGLEABLE_PATHS = [
  ...OUTREACH_GROUPS.flatMap(g => g.items.map(i => i.path)),
];
