import { useState, useEffect, useMemo } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import { uploadBlob, deleteBlobAtPath } from '../../lib/userStorage';
import BudgetSummary from './BudgetSummary';
import CategoryBreakdown from './CategoryBreakdown';
import ExpenseFilters from './ExpenseFilters';
import ExpenseTable from './ExpenseTable';
import ExpenseModal from './ExpenseModal';
import {
  CATEGORIES, todayISO, monthKey, monthKeyFromISO, yearFromISO,
  firstDayISO, lastDayISO, uid, buildCsv, downloadCsv,
} from './budgetHelpers';
import './Budget.css';

/* ─────────────────────────────────────────────────────────────
   Budget — ministry spending tracker with monthly targets
   Naming: .bg-*
   Persistence (via useUserStoreKey, Firestore-backed):
     admin:budget-expenses → array of expense objects
     admin:budget-targets  → { defaultMonthly, monthly: { "YYYY-MM": amount } }
   Receipts live in Firebase Storage at /users/{uid}/budget-receipts/,
   referenced on each expense by receiptUrl + receiptPath (see
   userStorage.js — same pattern as Documents.jsx).
   Accent: var(--accent-amber, #fbbf24)
   ───────────────────────────────────────────────────────────── */

/* ─── Toast ──────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="bg-toast" role="status">
      <span>{message}</span>
      <button className="bg-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function Budget() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useUserStoreKey('admin:budget-expenses', []);
  const [targets,  setTargets]  = useUserStoreKey('admin:budget-targets',  { defaultMonthly: 0, monthly: {} });

  /* Month nav (default: current month) */
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  /* Filters */
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor,   setFilterVendor]   = useState('');
  const [filterFrom,     setFilterFrom]     = useState(firstDayISO(today.getFullYear(), today.getMonth()));
  const [filterTo,       setFilterTo]       = useState(lastDayISO(today.getFullYear(), today.getMonth()));
  const [autoRangeKey,   setAutoRangeKey]   = useState(monthKey(today.getFullYear(), today.getMonth()));

  /* Modals & inline state */
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [armedDel, setArmedDel] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState('');

  /* Budget editor (clicking the "Budget this month" card) */
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft,   setBudgetDraft]   = useState('');

  /* (Both expenses and targets autosync via useUserStoreKey.) */

  /* When the month changes, snap the filter range to the new month
     (only if the user hasn't manually tweaked it for the previous month) */
  useEffect(() => {
    const curKey = monthKey(year, month);
    if (autoRangeKey !== curKey) return; // user has manual range
    setFilterFrom(firstDayISO(year, month));
    setFilterTo(lastDayISO(year, month));
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived: current month key + budget ──────────────── */
  const curMonthKey = monthKey(year, month);
  const hasMonthOverride = Object.prototype.hasOwnProperty.call(targets.monthly || {}, curMonthKey);
  const curMonthBudget = useMemo(() => {
    if (hasMonthOverride) return Number(targets.monthly[curMonthKey]) || 0;
    return Number(targets.defaultMonthly) || 0;
  }, [targets, curMonthKey, hasMonthOverride]);

  /* ── Monthly summary ──────────────────────────────────── */
  const summary = useMemo(() => {
    const monthSpent = expenses
      .filter(e => monthKeyFromISO(e.date) === curMonthKey)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const ytdSpent = expenses
      .filter(e => {
        const ey = yearFromISO(e.date);
        if (ey !== year) return false;
        const mk = monthKeyFromISO(e.date);
        return mk <= curMonthKey;
      })
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const remaining = curMonthBudget - monthSpent;
    return { monthSpent, ytdSpent, remaining };
  }, [expenses, curMonthKey, year, curMonthBudget]);

  /* ── Category breakdown (selected month) ──────────────── */
  const categoryBreakdown = useMemo(() => {
    const totals = Object.fromEntries(CATEGORIES.map(c => [c.key, 0]));
    for (const e of expenses) {
      if (monthKeyFromISO(e.date) !== curMonthKey) continue;
      const k = e.category && totals.hasOwnProperty(e.category) ? e.category : 'other';
      totals[k] += Number(e.amount) || 0;
    }
    const maxAmt = Math.max(0, ...Object.values(totals));
    const rows = CATEGORIES.map(c => ({
      ...c,
      amount: totals[c.key],
      pct: maxAmt > 0 ? (totals[c.key] / maxAmt) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);
    const totalSpend = Object.values(totals).reduce((s, v) => s + v, 0);
    return { rows, totalSpend };
  }, [expenses, curMonthKey]);

  /* ── Expense list (filtered, sorted desc) ─────────────── */
  const filteredExpenses = useMemo(() => {
    const vq = filterVendor.trim().toLowerCase();
    const from = filterFrom || '0000-00-00';
    const to   = filterTo   || '9999-12-31';
    return expenses
      .filter(e => {
        if (!e.date) return false;
        if (e.date < from) return false;
        if (e.date > to)   return false;
        if (filterCategory && e.category !== filterCategory) return false;
        if (vq && !(e.vendor || '').toLowerCase().includes(vq)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [expenses, filterCategory, filterVendor, filterFrom, filterTo]);

  /* ── Vendor autocomplete options ──────────────────────── */
  const vendorOptions = useMemo(() => {
    const set = new Set();
    for (const e of expenses) {
      const v = (e.vendor || '').trim();
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  /* ── Handlers ─────────────────────────────────────────── */
  function shiftMonth(delta) {
    let m = month + delta;
    let y = year;
    while (m < 0)  { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    setMonth(m);
    setYear(y);
    setAutoRangeKey(monthKey(y, m));
  }
  function jumpToToday() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth());
    setAutoRangeKey(monthKey(n.getFullYear(), n.getMonth()));
  }

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(exp) {
    setEditing(exp);
    setShowForm(true);
    setExpandedId(null);
  }

  /* Expense receipts live in Firebase Storage — upload the new file (if
     any), swap/delete the previous blob, then merge references onto the
     expense record. Throws on failure so the modal can show the error
     and let the user retry without losing their entered fields. */
  async function handleSave(data, receiptFile, removeReceipt) {
    const prevReceiptPath = editing?.receiptPath;
    let receiptFields = null;

    if (receiptFile) {
      if (!user?.uid) throw new Error('You must be signed in to attach a receipt.');
      const { url, path } = await uploadBlob(user.uid, 'budget-receipts', receiptFile, { filename: receiptFile.name });
      receiptFields = { receiptUrl: url, receiptPath: path };
      if (prevReceiptPath) deleteBlobAtPath(prevReceiptPath).catch(() => {});
    } else if (removeReceipt) {
      receiptFields = { receiptUrl: '', receiptPath: '' };
      if (prevReceiptPath) deleteBlobAtPath(prevReceiptPath).catch(() => {});
    }

    const finalData = receiptFields ? { ...data, ...receiptFields } : data;

    if (editing && editing.id) {
      setExpenses(prev => prev.map(e => (e.id === editing.id ? { ...e, ...finalData } : e)));
    } else {
      setExpenses(prev => [{ id: uid(), createdAt: Date.now(), ...finalData }, ...prev]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id) {
    if (armedDel !== id) { setArmedDel(id); return; }
    const target = expenses.find(e => e.id === id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setArmedDel(null);
    if (expandedId === id) setExpandedId(null);
    if (target?.receiptPath) deleteBlobAtPath(target.receiptPath).catch(() => {});
  }

  function startEditBudget() {
    setBudgetDraft(curMonthBudget ? String(curMonthBudget) : '');
    setEditingBudget(true);
  }
  function saveBudget() {
    const amt = parseFloat(budgetDraft);
    const cleaned = Number.isFinite(amt) && amt >= 0 ? Math.round(amt * 100) / 100 : 0;
    setTargets(prev => ({
      ...prev,
      monthly: { ...prev.monthly, [curMonthKey]: cleaned },
    }));
    setEditingBudget(false);
  }
  function clearBudgetForMonth() {
    setTargets(prev => {
      const next = { ...prev, monthly: { ...prev.monthly } };
      delete next.monthly[curMonthKey];
      return next;
    });
    setEditingBudget(false);
  }
  function saveAsDefault() {
    const amt = parseFloat(budgetDraft);
    const cleaned = Number.isFinite(amt) && amt >= 0 ? Math.round(amt * 100) / 100 : 0;
    setTargets(prev => ({
      ...prev,
      defaultMonthly: cleaned,
      // also set for the current month explicitly so users see consistency
      monthly: { ...prev.monthly, [curMonthKey]: cleaned },
    }));
    setEditingBudget(false);
  }

  function handleExport() {
    const filename = `budget-${todayISO()}.csv`;
    downloadCsv(filename, buildCsv(filteredExpenses));
  }

  function setFilterRangeManual(field, value) {
    if (field === 'from') setFilterFrom(value);
    else setFilterTo(value);
    setAutoRangeKey('__manual__');
  }
  function snapFilterToMonth() {
    setFilterFrom(firstDayISO(year, month));
    setFilterTo(lastDayISO(year, month));
    setAutoRangeKey(monthKey(year, month));
  }

  /* ── Render ───────────────────────────────────────────── */
  return (
    <WorshipShell title="Budget" icon="💰" subtitle="Ministry budget tracking — expenses, monthly targets, and category reporting.">
    <div className="bg-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="bg-main">
        {/* ── Top bar ── */}
        <div className="bg-topbar">
          <div className="bg-topbar-left">
            <h1 className="bg-page-title">Budget</h1>
            <p className="bg-page-sub">
              Track ministry spending — equipment, software, events, supplies — with
              monthly targets and category-level reporting.
            </p>
          </div>
          <div className="bg-topbar-right">
            <button className="bg-btn bg-btn-accent bg-btn-lg" onClick={openNew}>
              + Add Expense
            </button>
          </div>
        </div>

        <div className="bg-scroll">
          <BudgetSummary
            year={year}
            month={month}
            onShiftMonth={shiftMonth}
            onToday={jumpToToday}
            summary={summary}
            curMonthBudget={curMonthBudget}
            hasMonthOverride={hasMonthOverride}
            defaultMonthly={targets.defaultMonthly}
            editingBudget={editingBudget}
            budgetDraft={budgetDraft}
            setBudgetDraft={setBudgetDraft}
            onStartEdit={startEditBudget}
            onSaveBudget={saveBudget}
            onSaveDefault={saveAsDefault}
            onClearBudget={clearBudgetForMonth}
            onCancelEdit={() => setEditingBudget(false)}
          />

          <CategoryBreakdown year={year} month={month} categoryBreakdown={categoryBreakdown} />

          <section className="bg-section">
            <div className="bg-section-head">
              <h2 className="bg-section-title">Expenses</h2>
              <div className="bg-section-sub">
                {filteredExpenses.length} {filteredExpenses.length === 1 ? 'entry' : 'entries'} in view
              </div>
            </div>

            <ExpenseFilters
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              filterVendor={filterVendor}
              setFilterVendor={setFilterVendor}
              filterFrom={filterFrom}
              filterTo={filterTo}
              setFilterRangeManual={setFilterRangeManual}
              snapFilterToMonth={snapFilterToMonth}
              handleExport={handleExport}
              exportDisabled={filteredExpenses.length === 0}
            />

            <ExpenseTable
              expenses={expenses}
              filteredExpenses={filteredExpenses}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              armedDel={armedDel}
              setArmedDel={setArmedDel}
              openEdit={openEdit}
              handleDelete={handleDelete}
              openNew={openNew}
            />
          </section>
        </div>
      </main>

      {showForm && (
        <ExpenseModal
          initial={editing}
          vendors={vendorOptions}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onError={(msg) => setToast(msg)}
        />
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
    </WorshipShell>
  );
}
