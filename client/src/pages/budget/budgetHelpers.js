/* ─────────────────────────────────────────────────────────────
   budgetHelpers — shared constants + pure helpers for the Budget
   page and its subcomponents (BudgetSummary, CategoryBreakdown,
   ExpenseFilters, ExpenseTable, ExpenseModal).
   ───────────────────────────────────────────────────────────── */

/* ─── Categories ───────────────────────────────────────────── */
export const CATEGORIES = [
  { key: 'equipment',        label: 'Equipment',        icon: '📦' },
  { key: 'software',         label: 'Software',         icon: '💻' },
  { key: 'events',           label: 'Events',           icon: '🎉' },
  { key: 'supplies',         label: 'Supplies',         icon: '📋' },
  { key: 'music-licensing',  label: 'Music Licensing',  icon: '🎵' },
  { key: 'travel',           label: 'Travel',           icon: '✈️' },
  { key: 'food',             label: 'Food',             icon: '🍕' },
  { key: 'print',            label: 'Print/Materials',  icon: '🖨' },
  { key: 'honoraria',        label: 'Honoraria',        icon: '💵' },
  { key: 'other',            label: 'Other',            icon: '💰' },
];

export const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

export const PAID_WITH = [
  { key: 'card',          label: 'Card' },
  { key: 'cash',          label: 'Cash' },
  { key: 'check',         label: 'Check' },
  { key: 'reimbursement', label: 'Reimbursement' },
  { key: 'other',         label: 'Other' },
];

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ─── Date helpers ─────────────────────────────────────────── */
export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function todayISO() { return toISO(new Date()); }

export function monthKey(y, m /* 0-11 */) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}
export function monthKeyFromISO(iso) {
  if (!iso || iso.length < 7) return '';
  return iso.slice(0, 7);
}
export function yearFromISO(iso) {
  if (!iso || iso.length < 4) return 0;
  return parseInt(iso.slice(0, 4), 10) || 0;
}
export function firstDayISO(y, m) { return toISO(new Date(y, m, 1)); }
export function lastDayISO(y, m)  { return toISO(new Date(y, m + 1, 0)); }

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── CSV helpers ──────────────────────────────────────────── */
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function buildCsv(rows) {
  const header = ['Date','Vendor','Category','Description','Amount','PaidWith','Reimbursable','Notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const cat = CAT_BY_KEY[r.category]?.label || r.category || '';
    lines.push([
      r.date || '',
      r.vendor || '',
      cat,
      r.description || '',
      (Number(r.amount) || 0).toFixed(2),
      r.paidWith || '',
      r.reimbursable ? 'Yes' : 'No',
      r.notes || '',
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}
