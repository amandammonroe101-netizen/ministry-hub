/* ─────────────────────────────────────────────────────────────
   Nav Visibility — single source of truth for which top-level
   categories users can toggle on/off in their sidebar.

   Read by:
     • Settings page (renders the checkboxes)
     • NavRail (filters standalone items and conditionally
       renders each ministry section)

   Storage shape (at user-store key 'nav:visible-categories'):
     { <categoryId>: boolean }
   Missing keys default to TRUE so new ministries appear by
   default for existing users.

   The Settings page itself is NOT in this list — it must
   always be visible so users can re-enable categories they
   hid.

   Calendar, Chat, and Contacts are also NOT in this list —
   they're mandatory/always-on in NavRail (see the
   ALWAYS_VISIBLE_STANDALONE set there), so they're intentionally
   excluded here to keep them out of both the Settings "Pages"
   checkboxes and the FirstRunWizard "Personal pages" onboarding
   step, both of which render directly off this array.
   ───────────────────────────────────────────────────────────── */

export const NAV_VISIBILITY_STORAGE_KEY = 'nav:visible-categories';

/* Standalone (single-page) categories users can toggle on/off —
   top of the rail. Calendar, Chat, and Contacts are deliberately
   excluded (see note above) — NavRail renders those unconditionally. */
export const NAV_STANDALONE_CATEGORIES = [
  { id: 'journal',      path: '/journal',      icon: '📖', label: 'Journal'     },
  { id: 'prayers',      path: '/prayers',      icon: '🙏', label: 'Prayers'     },
  { id: 'friends',      path: '/friends',      icon: '👥', label: 'Friends'     },
  { id: 'day-planner',  path: '/day-planner',  icon: '🕐', label: 'Day Planner' },
  { id: 'testimony',    path: '/testimony',    icon: '🙌', label: 'Testimony'   },
  { id: 'writing',      path: '/writing',      icon: '✍️', label: 'Writing Mode' },
  { id: 'library',      path: '/library',      icon: '📚', label: 'Library'     },
];

/* Ministry (multi-page) categories — top-level collapsible
   groups in the rail. Order matches NavRail render order. */
export const NAV_MINISTRY_CATEGORIES = [
  { id: 'worship',        icon: '🎶', label: 'Worship Ministry'      },
  { id: 'website',        icon: '🌐', label: 'Website Ministry'      },
  { id: 'blog',           icon: '✍',  label: 'Blog Ministry'         },
  { id: 'podcast',        icon: '🎙', label: 'Podcast Ministry'      },
  { id: 'youth',          icon: '🧒', label: 'Youth Ministry'        },
  { id: 'childrens',      icon: '🧸', label: "Children's Ministry"   },
  { id: 'outreach',       icon: '🤲', label: 'Outreach Ministry'     },
  { id: 'womens',         icon: '🌸', label: "Women's Ministry"      },
  { id: 'mens',           icon: '⚒',  label: "Men's Ministry"        },
  { id: 'tech',           icon: '🎬', label: 'Tech / Production'     },
  { id: 'missions',       icon: '🌍', label: 'Missions Ministry'     },
  { id: 'hospitality',    icon: '🤗', label: 'Hospitality Ministry'  },
  { id: 'discipleship',   icon: '🌿', label: 'Discipleship Ministry' },
  { id: 'administration', icon: '🏛', label: 'Administration'        },
  { id: 'business',       icon: '🏢', label: 'Business / Entrepreneur' },
  { id: 'pastoral',       icon: '⛪', label: 'Pastoral / Teaching'   },
  { id: 'author',         icon: '🪶', label: 'Author Ministry'       },
  { id: 'social-media',   icon: '📱', label: 'Social Media Ministry' },
];

/* Helper used by NavRail to decide whether to render a
   category. Defaults to TRUE for any id not in the map. */
export function isCategoryVisible(visibilityMap, id) {
  const v = visibilityMap?.[id];
  return v === undefined ? true : !!v;
}

/* All visibility-toggleable category ids, in the order they
   appear in the rail. Used by Settings for "select all" /
   "hide all" actions. */
export const ALL_CATEGORY_IDS = [
  ...NAV_STANDALONE_CATEGORIES.map(c => c.id),
  ...NAV_MINISTRY_CATEGORIES.map(c => c.id),
];
