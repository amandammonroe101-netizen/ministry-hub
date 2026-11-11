import { useUserStoreKey } from './userStore';

/* ─────────────────────────────────────────────────────────────
   Page Locks — code-gate whole sections behind a PIN, set from
   Settings → Page Settings (see pages/settings/Settings.jsx).

   Single Firestore kv doc, shaped:
     { [pageId]: { enabled: boolean, code: string } }

   Unlike Journal's per-page "master lock" (set from that page's own
   Page Settings tab), these locks are managed from the main app
   Settings page — which is never itself lockable — so there's no
   "forgot code" escape hatch needed: the same screen that turns a
   lock on can always turn it back off.

   To make another section lockable:
     1. Add an entry to LOCKABLE_PAGES below.
     2. In that section's shared shell/layout component, read
        usePageLocks() + isPageLocked(locks, id) and render a lock
        screen instead of children when locked (see WomensShell.jsx).
   ───────────────────────────────────────────────────────────── */

export const PAGE_LOCKS_KEY = 'settings:page-locks';

export const LOCKABLE_PAGES = [
  {
    id:          'womens',
    label:       "Women's Ministry",
    icon:        '🌸',
    description: 'Require a code before any Women\'s Ministry page opens.',
  },
  {
    id:          'mens',
    label:       "Men's Ministry",
    icon:        '🧭',
    description: 'Require a code before any Men\'s Ministry page opens.',
  },
  {
    id:          'website',
    label:       'Website Ministry',
    icon:        '🌐',
    description: 'Require a code before any Website Ministry page opens.',
  },
  {
    id:          'blog',
    label:       'Blog Ministry',
    icon:        '✍',
    description: 'Require a code before any Blog Ministry page opens.',
  },
  {
    id:          'tech',
    label:       'Tech / Production Ministry',
    icon:        '🎛',
    description: 'Require a code before any Tech / Production Ministry page opens.',
  },
  {
    id:          'youth',
    label:       'Youth Ministry',
    icon:        '⚡',
    description: 'Require a code before any Youth Ministry page opens.',
  },
  {
    id:          'missions',
    label:       'Missions Ministry',
    icon:        '✈️',
    description: 'Require a code before any Missions Ministry page opens.',
  },
  {
    id:          'discipleship',
    label:       'Discipleship Ministry',
    icon:        '🌿',
    description: 'Require a code before any Discipleship Ministry page opens.',
  },
  {
    id:          'administration',
    label:       'Administration',
    icon:        '🏛',
    description: 'Require a code before any Administration page opens.',
  },
  {
    id:          'business',
    label:       'Business / Entrepreneur',
    icon:        '🏢',
    description: 'Require a code before any Business page opens.',
  },
];

/* True only when a page is both switched on AND has a non-empty
   code — mirrors Journal's "auto-heal" guard so a stray `enabled:
   true` with no code can never actually lock anyone out. */
export function isPageLocked(locks, id) {
  const entry = locks?.[id];
  return !!(entry?.enabled && String(entry?.code || '').trim());
}

export function usePageLocks() {
  return useUserStoreKey(PAGE_LOCKS_KEY, {});
}
