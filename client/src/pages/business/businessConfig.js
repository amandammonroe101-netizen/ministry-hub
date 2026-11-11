/* ─────────────────────────────────────────────────────────────
   Business / Entrepreneur Ministry — page registry.
   Single source of truth for Business sub-pages. Both:
     • NavRail (sidebar entry)
     • BusinessShell (internal dropdown nav)
     • BusinessComingSoon (per-page header + meta)
   read from this list.

   Scope: unlike every other ministry here, Business is NOT a
   singleton — a member can be running several businesses at once
   (a bakery AND an Etsy shop AND a consulting LLC), so every real
   page lives under a `:businessId` — see businessService.js for how
   "Duplicate" clones one business (and all its data) into a brand
   new, independently-named one.

   Route shape:
     /business                        → BusinessOverview (the "my
                                         businesses" switcher — pick,
                                         create, duplicate, rename)
     /business/:businessId/<sub>      → one page, scoped to that
                                         business (e.g. .../catalog)

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. BusinessOrders).
     2. In App.jsx, swap `<BusinessComingSoon />` for the new
        component on that route. Keep the entry here so the
        sidebar/shell nav stays consistent.
   ───────────────────────────────────────────────────────────── */

export const BUSINESS_ACCENT = '#059669';

/* Top-level Business landing page — the "my businesses" switcher.
   No :businessId here since nothing is selected yet. */
export const BUSINESS_OVERVIEW = {
  path:        '/business',
  label:       'My Businesses',
  icon:        '🏢',
  accent:      BUSINESS_ACCENT,
  description: 'Every business you run, side by side — pick one to open it, or duplicate an existing one to stand up a new business with the same page structure.',
  group:       'Overview',
};

export const BUSINESS_GROUPS = [
  {
    key:   'products',
    label: 'Products',
    icon:  '📦',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/business/:businessId/catalog',
        label:       'Product Catalog',
        icon:        '🛍',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Every product this business sells — photos, descriptions, tags, price tiers, cost of goods, variations, bundles, and active/inactive status.',
      },
      {
        path:        '/business/:businessId/pricing',
        label:       'Pricing',
        icon:        '💲',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Cost of goods, price tiers, and margins for every product, editable in one place.',
      },
      {
        path:        '/business/:businessId/inventory',
        label:       'Inventory',
        icon:        '📋',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Ingredients, packaging, and supplies on hand — quantities, cost per unit, and low-stock alerts.',
      },
      {
        path:        '/business/:businessId/demand',
        label:       'Demand Analysis',
        icon:        '🧮',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'How much of each ingredient your open orders need, what\'s on hand, and what\'s short — pulled from Orders and the ingredient links in Pricing.',
      },
    ],
  },
  {
    key:   'sales',
    label: 'Sales',
    icon:  '💳',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/business/:businessId/orders',
        label:       'Orders',
        icon:        '🧾',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Incoming orders — status, fulfillment, and payment tracking per order.',
      },
      {
        path:        '/business/:businessId/invoices',
        label:       'Invoices & Payments',
        icon:        '💵',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Invoices sent, payment status, and outstanding balances.',
      },
    ],
  },
  {
    key:   'customers',
    label: 'Customers',
    icon:  '🤝',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/business/:businessId/customers',
        label:       'Customers & Clients',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Contact list, notes per client, follow-up reminders, and deal/pipeline stages.',
      },
    ],
  },
  {
    key:   'finance',
    label: 'Finance',
    icon:  '💰',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/business/:businessId/finances',
        label:       'Finances',
        icon:        '📊',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Income/expense tracking, budget, and a profit & loss summary.',
      },
    ],
  },
  {
    key:   'marketing',
    label: 'Marketing',
    icon:  '📣',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/business/:businessId/marketing',
        label:       'Marketing',
        icon:        '📅',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Content calendar, campaigns, and brand asset notes.',
      },
    ],
  },
  {
    key:   'operations',
    label: 'Operations',
    icon:  '🗂',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/business/:businessId/tasks',
        label:       'Tasks & To-Do',
        icon:        '✅',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Business-specific task list.',
      },
      {
        path:        '/business/:businessId/meetings',
        label:       'Meetings & Notes',
        icon:        '📝',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Meeting log, brainstorm notes, and decisions made.',
      },
      {
        path:        '/business/:businessId/documents',
        label:       'Documents & Contracts',
        icon:        '📄',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'LLC docs, contracts, and licenses — file/link references.',
      },
    ],
  },
  {
    key:   'team',
    label: 'Team',
    icon:  '🧑‍💼',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/business/:businessId/team',
        label:       'Team & Partners',
        icon:        '🧑‍💼',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Roles, contact info, and responsibilities for anyone working in this business.',
      },
    ],
  },
  {
    key:   'growth',
    label: 'Growth',
    icon:  '📈',
    color: BUSINESS_ACCENT,
    items: [
      {
        path:        '/business/:businessId/goals',
        label:       'Goals & Milestones',
        icon:        '🎯',
        accent:      BUSINESS_ACCENT,
        description: 'Quarterly/annual goals and a milestone tracker.',
      },
      {
        path:        '/business/:businessId/ideas',
        label:       'Ideas / Someday',
        icon:        '💡',
        accent:      BUSINESS_ACCENT,
        description: 'Parking lot for future product ideas and expansion thoughts.',
      },
    ],
  },
  {
    key:   'reflection',
    label: 'Vision & Prayer',
    icon:  '🙏',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/business/:businessId/vision',
        label:       'Vision & Mission',
        icon:        '🧭',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Mission statement, core values, target audience, and elevator pitch.',
      },
      {
        path:        '/business/:businessId/prayer',
        label:       'Prayer & Reflection',
        icon:        '🙏',
        accent:      'var(--accent-amber, #fbbf24)',
        description: "Prayer requests over this business, scripture/promises, and journal entries about God's leading.",
      },
    ],
  },
];

/* Flat array of every real Business sub-page (excludes Overview,
   which is handled separately since it has no :businessId). Used
   for routing + lookup. */
export const BUSINESS_GROUP_PAGES = BUSINESS_GROUPS.flatMap(g =>
  g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
);

/* Every Business page, including Overview — used by NavRail to
   decide if the Business nav item should read as "active". */
export const BUSINESS_PAGES = [BUSINESS_OVERVIEW, ...BUSINESS_GROUP_PAGES];

export const BUSINESS_PATHS = BUSINESS_PAGES.map(p => p.path);

/* First real page a business opens to once selected/created. */
export const BUSINESS_DEFAULT_SUBPATH = 'catalog';

/** Look up a Business sub-page config from the *current* pathname
 *  (which carries a real businessId, e.g. "/business/abc123/catalog")
 *  by normalizing it back to the ":businessId" template stored in
 *  BUSINESS_GROUP_PAGES above. Returns undefined for unknown paths. */
export function getBusinessPage(pathname) {
  if (pathname === BUSINESS_OVERVIEW.path) return BUSINESS_OVERVIEW;
  const parts = pathname.split('/').filter(Boolean); // ['business', ':id', 'catalog', ...]
  if (parts[0] !== 'business' || parts.length < 3) return undefined;
  const normalized = `/business/:businessId/${parts.slice(2).join('/')}`;
  return BUSINESS_GROUP_PAGES.find(p => p.path === normalized);
}

/** Build a concrete path for a business page template, substituting
 *  the real businessId in for ":businessId". */
export function businessPagePath(businessId, template) {
  return template.replace(':businessId', businessId);
}
