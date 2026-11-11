/* ─────────────────────────────────────────────────────────────
   Administration Ministry — page registry.
   Single source of truth for Administration sub-pages. Both:
     • NavRail (sidebar items)
     • ComingSoon (per-page header + meta)
   read from this list.

   Scope: this ministry covers CHURCH-WIDE administration —
   staff/HR, finance, governance, facilities, legal/compliance,
   member database, and office operations. The existing
   Worship → Admin sub-group (Budget / Documents / Meetings /
   Backup & Export) stays in place for worship-specific admin.

   Top accent uses a custom slate (#64748b) to evoke an
   institutional / dashboard feel — distinct from all the
   other ministry top colors.

   To replace a Coming Soon page with a real one later:
     1. Build the new page component (e.g. AdminPayroll).
     2. In App.jsx, swap `<AdministrationComingSoon />` for
        the new component on that route. Keep the entry here
        so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export const ADMINISTRATION_ACCENT = '#64748b';

/* Top-level Administration landing page (no sub-group). */
export const ADMINISTRATION_OVERVIEW = {
  path:        '/administration',
  label:       'Overview',
  icon:        '🏠',
  accent:      '#64748b',
  description: 'Dashboard for the Administration ministry — staff status, this-month giving + expenses, open facility issues, expiring insurance / contracts, upcoming board meetings, and overall member counts will live here.',
  group:       'Overview',
};

export const ADMINISTRATION_GROUPS = [
  {
    key:   'hr',
    label: 'Staff & HR',
    icon:  '💼',
    color: 'var(--accent-blue, #60a5fa)',
    items: [
      {
        path:        '/administration/hr/staff',
        label:       'Staff Directory',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Directory of every staff member — photo, role, department, contact, start date, employment type, and reporting line.',
      },
      {
        path:        '/administration/hr/payroll',
        label:       'Payroll & Benefits',
        icon:        '💰',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Payroll runs, benefits enrollment, retirement / 403(b) contributions, housing allowance for clergy, and W-2 / 1099 management.',
      },
      {
        path:        '/administration/hr/hiring',
        label:       'Hiring & Onboarding',
        icon:        '📋',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Open positions, applicant tracking, interview workflow, offer letters, and new-hire onboarding checklists.',
      },
      {
        path:        '/administration/hr/reviews',
        label:       'Reviews & Evaluations',
        icon:        '📊',
        accent:      'var(--accent-blue, #60a5fa)',
        description: 'Annual reviews, goals tracking, professional-development plans, and performance documentation per staff member.',
      },
    ],
  },
  {
    key:   'finance',
    label: 'Finance',
    icon:  '💵',
    color: 'var(--accent-green, #6ee7b7)',
    items: [
      {
        path:        '/administration/finance/giving',
        label:       'Giving & Donations',
        icon:        '💰',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Tithes, offerings, designated gifts, online giving, and end-of-year contribution statements per giver.',
      },
      {
        path:        '/administration/finance/expenses',
        label:       'Expenses & Reimbursements',
        icon:        '💸',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Expense entry, reimbursement requests, receipt capture, approval workflow, and AP / vendor payments.',
      },
      {
        path:        '/administration/finance/budget',
        label:       'Budget',
        icon:        '📊',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Annual budget by department / ministry — actuals vs. budget, variance reports, and re-forecast workflow.',
      },
      {
        path:        '/administration/finance/audit',
        label:       'Annual Audit & Reports',
        icon:        '📑',
        accent:      'var(--accent-green, #6ee7b7)',
        description: 'Annual financial review / audit, board financial reports, congregational summary, and 990-EZ / 990 filings if applicable.',
      },
    ],
  },
  {
    key:   'governance',
    label: 'Governance',
    icon:  '🏛',
    color: 'var(--accent-purple, #a78bfa)',
    items: [
      {
        path:        '/administration/governance/board',
        label:       'Elders / Board',
        icon:        '👥',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Elder / board roster — term, role, areas of oversight, qualifications, and ordination / installation dates.',
      },
      {
        path:        '/administration/governance/minutes',
        label:       'Meeting Minutes',
        icon:        '📋',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Board and committee meeting minutes — agenda, attendance, motions, decisions, action items, and approval status.',
      },
      {
        path:        '/administration/governance/bylaws',
        label:       'Bylaws & Policies',
        icon:        '📜',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Articles of incorporation, constitution / bylaws, statement of faith, and all church policies — current and historical versions.',
      },
      {
        path:        '/administration/governance/votes',
        label:       'Votes & Decisions',
        icon:        '🗳',
        accent:      'var(--accent-purple, #a78bfa)',
        description: 'Congregational and board votes — proposal, period, results, and decision log for the historical record.',
      },
    ],
  },
  {
    key:   'facilities',
    label: 'Facilities',
    icon:  '🏢',
    color: 'var(--accent-amber, #fbbf24)',
    items: [
      {
        path:        '/administration/facilities/building',
        label:       'Building Overview',
        icon:        '🏛',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Floor plans, room inventory, capacities, AV/network drops per room, and emergency exits / first-aid / AED locations.',
      },
      {
        path:        '/administration/facilities/maintenance',
        label:       'Maintenance & Repairs',
        icon:        '🔧',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Open maintenance tickets, preventative-maintenance schedule (HVAC, roof, parking lot), vendor list, and warranty tracking.',
      },
      {
        path:        '/administration/facilities/custodial',
        label:       'Custodial',
        icon:        '🧹',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Cleaning schedule, supplies inventory, vendor or in-house staff, and post-event reset checklists.',
      },
      {
        path:        '/administration/facilities/keys',
        label:       'Keys & Access',
        icon:        '🔑',
        accent:      'var(--accent-amber, #fbbf24)',
        description: 'Who holds which key / fob / door code, issued / returned status, alarm codes, and access-revoke checklist for staff transitions.',
      },
    ],
  },
  {
    key:   'legal',
    label: 'Legal & Compliance',
    icon:  '🛡',
    color: 'var(--accent-rose, #fb7185)',
    items: [
      {
        path:        '/administration/legal/tax',
        label:       '501(c)(3) & Tax-Exempt',
        icon:        '📜',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'IRS determination letter, state tax-exempt status, annual filings, and any tax-related correspondence.',
      },
      {
        path:        '/administration/legal/insurance',
        label:       'Insurance',
        icon:        '🛡',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Liability, property, D&O, workers comp, and auto coverage — carriers, policy numbers, renewal dates, and claim history.',
      },
      {
        path:        '/administration/legal/contracts',
        label:       'Contracts',
        icon:        '📋',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Active vendor and service contracts, leases, licensing agreements — expiration dates, renewal flags, and termination clauses.',
      },
      {
        path:        '/administration/legal/risk',
        label:       'Risk Management',
        icon:        '⚠',
        accent:      'var(--accent-rose, #fb7185)',
        description: 'Risk register, incident log, safety procedures, emergency response plan, and child-protection policy enforcement.',
      },
    ],
  },
  {
    key:   'members',
    label: 'Member Database',
    icon:  '👥',
    color: 'var(--accent-teal, #2dd4bf)',
    items: [
      {
        path:        '/administration/members/all',
        label:       'All Members',
        icon:        '🧑‍🤝‍🧑',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Master member directory — household, contact info, membership date, ministries involved, and a privacy-aware view per role.',
      },
      {
        path:        '/administration/members/life-events',
        label:       'Life Events',
        icon:        '💍',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Births, baptisms, weddings, deaths, anniversaries — captured per member, used for pastoral follow-up and care.',
      },
      {
        path:        '/administration/members/care-notes',
        label:       'Pastoral Care Notes',
        icon:        '📞',
        accent:      'var(--accent-teal, #2dd4bf)',
        description: 'Confidential pastoral notes — hospital visits, counseling sessions, prayer needs. Access restricted to pastoral staff.',
      },
    ],
  },
  {
    key:   'office',
    label: 'Office',
    icon:  '📞',
    color: 'var(--accent-pink, #f472b6)',
    items: [
      {
        path:        '/administration/office/communications',
        label:       'Mass Communications',
        icon:        '📧',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Church-wide email + SMS broadcasts, newsletter coordination, and a consolidated sent log across ministries.',
      },
      {
        path:        '/administration/office/calendar',
        label:       'Master Calendar',
        icon:        '🗓',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Single source-of-truth church calendar — room reservations, conflict detection, ministry-color overlay, and a public-facing view.',
      },
      {
        path:        '/administration/office/supplies',
        label:       'Supplies & Reception',
        icon:        '📦',
        accent:      'var(--accent-pink, #f472b6)',
        description: 'Office supplies inventory, reorder thresholds, mail / package log, reception shift schedule, and phone-tree directory.',
      },
    ],
  },
  {
    key:   'records',
    label: 'Records',
    icon:  '📝',
    color: '#64748b',
    items: [
      {
        path:        '/administration/records/reports',
        label:       'Reports & Stats',
        icon:        '📊',
        accent:      '#64748b',
        description: 'Cross-cutting reports — staff count by department, year-over-year giving, attendance trends, member growth, and budget execution.',
      },
      {
        path:        '/administration/records/documents',
        label:       'Document Archive',
        icon:        '📑',
        accent:      '#64748b',
        description: 'Searchable archive of past contracts, signed forms, board minutes, policies, and any document with a retention requirement.',
      },
      {
        path:        '/administration/records/archive',
        label:       'Archive',
        icon:        '📦',
        accent:      '#64748b',
        description: 'Retired policies, former staff records, closed contracts, and other historical admin records — collapsible just like the other archives.',
      },
    ],
  },
];

/* Flat array of every Administration page — used for routing + lookup. */
export const ADMINISTRATION_PAGES = [
  ADMINISTRATION_OVERVIEW,
  ...ADMINISTRATION_GROUPS.flatMap(g =>
    g.items.map(i => ({ ...i, group: g.label, groupIcon: g.icon }))
  ),
];

/* All Administration paths — used by NavRail to decide if the
   Administration group should be auto-opened. */
export const ADMINISTRATION_PATHS = ADMINISTRATION_PAGES.map(p => p.path);

/* Look up an Administration page by exact path. Returns
   undefined for unknown paths so callers can render a fallback. */
export function getAdministrationPage(pathname) {
  return ADMINISTRATION_PAGES.find(p => p.path === pathname);
}
