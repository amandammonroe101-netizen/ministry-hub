import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import {
  businessOrderService, INVOICE_STATUSES, PAYMENT_STATUSES, deriveInvoiceStatus,
} from '../../services/businessOrderService';
import { publicInvoiceService } from '../../services/publicInvoiceService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './BusinessInvoices.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Invoices & Payments. Every invoice here is
   generated 1:1 from an existing Order (see BusinessOrders.jsx) —
   there's no standalone invoice object. "Generate Invoice" stamps
   an invoice number + issue date onto the order; everything else
   (line items, totals, payment status/amount paid, balance due)
   is read straight off that same order, so there's only ever one
   source of truth for what's owed.

   Lifecycle status (Draft/Sent/Overdue/Paid) is derived, not
   stored — see deriveInvoiceStatus() in businessOrderService.js.
   ───────────────────────────────────────────────────────────── */

function currency(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

function orderTotals(order) {
  const subtotal = (order.items || []).reduce((sum, it) => sum + (Number(it.unitPrice) || 0) * (Number(it.qty) || 0), 0);
  const total = subtotal + (Number(order.rushFee) || 0) + (Number(order.tax) || 0) - (Number(order.discount) || 0);
  const balance = total - (Number(order.amountPaid) || 0);
  return { subtotal, total, balance };
}

function statusLabel(value) { return INVOICE_STATUSES.find(s => s.value === value)?.label || value; }
function payLabel(value) { return PAYMENT_STATUSES.find(s => s.value === value)?.label || value; }

const PUBLIC_INVOICE_BASE = () => `${window.location.origin}${window.location.pathname}#/invoice/`;

// "Due Soon" — an early warning, distinct from Overdue, so a member
// can follow up before payment is actually late. Only meaningful for
// invoices that are out (Draft/Sent) and still unpaid; once overdue
// or paid it's no longer "soon", it's either late or done.
const DUE_SOON_DAYS = 3;
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  const due = new Date(dateStr);
  return Math.round((due - today) / 86400000);
}
function isDueSoon(order, invoiceStatus) {
  if (invoiceStatus !== 'draft' && invoiceStatus !== 'sent') return false;
  const days = daysUntil(order.dueDate);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

export default function BusinessInvoices() {
  const { businessId } = useParams();
  const { profile, avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('active'); // 'active' | 'past'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewing, setViewing] = useState(null); // order object or null

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, orderRes] = await Promise.all([
        businessService.getOne(businessId),
        businessOrderService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setOrders(orderRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  // The status dropdown's options are tab-scoped (Past is always
  // "Paid"), so a filter picked on one tab shouldn't silently hide
  // everything on the other — reset it on every tab switch.
  function switchTab(next) { setTab(next); setStatusFilter('all'); }

  // Only orders that have (or could have) an invoice matter here —
  // every order is a *candidate* invoice, shown with "Not Invoiced"
  // until a member generates one.
  const rows = useMemo(() => orders.map(o => {
    const invoiceStatus = deriveInvoiceStatus(o);
    return { order: o, invoiceStatus, dueSoon: isDueSoon(o, invoiceStatus) };
  }), [orders]);

  // Past Invoices = paid off, done — split out of the main working
  // list so the Active tab only ever shows what still needs
  // attention (not yet invoiced, drafted, sent, or overdue).
  const activeRows = useMemo(() => rows.filter(r => r.invoiceStatus !== 'paid'), [rows]);
  const pastRows = useMemo(() => rows.filter(r => r.invoiceStatus === 'paid'), [rows]);
  const tabRows = tab === 'past' ? pastRows : activeRows;
  const tabStatusOptions = INVOICE_STATUSES.filter(s => (tab === 'past' ? s.value === 'paid' : s.value !== 'paid'));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabRows.filter(r => {
      if (statusFilter !== 'all' && r.invoiceStatus !== statusFilter) return false;
      if (!q) return true;
      const hay = [r.order.customerName, r.order.customerEmail, r.order.invoiceNumber].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tabRows, search, statusFilter]);

  // AR summary — outstanding total & overdue count across every
  // invoiced order regardless of the current filter, so the strip
  // always reflects the whole business.
  const summary = useMemo(() => {
    let outstanding = 0, overdueCount = 0, overdueAmount = 0, invoicedCount = 0, dueSoonCount = 0, dueSoonAmount = 0;
    rows.forEach(({ order, invoiceStatus, dueSoon }) => {
      if (invoiceStatus === 'not_invoiced') return;
      invoicedCount += 1;
      const { balance } = orderTotals(order);
      if (balance <= 0.001) return;
      outstanding += balance;
      if (invoiceStatus === 'overdue') { overdueCount += 1; overdueAmount += balance; }
      if (dueSoon) { dueSoonCount += 1; dueSoonAmount += balance; }
    });
    return { outstanding, overdueCount, overdueAmount, invoicedCount, dueSoonCount, dueSoonAmount };
  }, [rows]);

  async function patchOrder(id, patch) {
    const res = await businessOrderService.update(businessId, id, patch);
    setOrders(prev => prev.map(o => (o.id === id ? res.data.data : o)));
    return res.data.data;
  }

  async function generateInvoice(order) {
    try {
      const res = await businessService.consumeNextInvoiceNumber(businessId);
      const { number, business: nextBiz } = res.data.data;
      setBusiness(nextBiz);
      const updated = await patchOrder(order.id, {
        invoiceNumber: number,
        invoiceIssueDate: new Date().toISOString().slice(0, 10),
      });
      setViewing(updated);
    } catch (e) {
      setError(e?.message || 'Could not generate that invoice.');
    }
  }

  async function setDueDate(order, dueDate) {
    try {
      const updated = await patchOrder(order.id, { dueDate });
      setViewing(updated);
      if (order.invoiceShareToken) await publicInvoiceService.resync(businessId, business, updated);
    } catch (e) {
      setError(e?.message || 'Could not update the payment due date.');
    }
  }

  async function markSent(order) {
    try {
      const updated = await patchOrder(order.id, { invoiceSentAt: new Date().toISOString() });
      setViewing(updated);
      if (order.invoiceShareToken) await publicInvoiceService.resync(businessId, business, updated);
    } catch (e) {
      setError(e?.message || 'Could not update that invoice.');
    }
  }

  async function getShareLink(order) {
    try {
      const token = await publicInvoiceService.publish(businessId, business, order);
      const updated = await patchOrder(order.id, { invoiceShareToken: token });
      setViewing(updated);
    } catch (e) {
      setError(e?.message || 'Could not create a share link.');
    }
  }

  async function revokeShareLink(order) {
    try {
      await publicInvoiceService.revoke(order.invoiceShareToken);
      const updated = await patchOrder(order.id, { invoiceShareToken: null });
      setViewing(updated);
    } catch (e) {
      setError(e?.message || 'Could not revoke that link.');
    }
  }

  // Whenever an invoiced order's numbers change (payment logged, items
  // edited elsewhere), keep any live public share snapshot in sync.
  async function resyncIfShared(order) {
    if (!order.invoiceShareToken) return;
    try { await publicInvoiceService.resync(businessId, business, order); } catch { /* best-effort */ }
  }

  return (
    <BusinessShell
      title="Invoices & Payments"
      icon="💵"
      subtitle="Invoices generated from orders — payment status, outstanding balances, PDF export, and shareable links."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bzi-root">
        {error && (
          <div className="bzi-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzi-summary-strip">
          <div className="bzi-summary-card">
            <span className="bzi-summary-label">Outstanding</span>
            <span className="bzi-summary-value">{currency(summary.outstanding)}</span>
          </div>
          <div className="bzi-summary-card overdue">
            <span className="bzi-summary-label">Overdue</span>
            <span className="bzi-summary-value">{summary.overdueCount} · {currency(summary.overdueAmount)}</span>
          </div>
          <div className="bzi-summary-card duesoon">
            <span className="bzi-summary-label">Due Soon</span>
            <span className="bzi-summary-value">{summary.dueSoonCount} · {currency(summary.dueSoonAmount)}</span>
          </div>
          <div className="bzi-summary-card">
            <span className="bzi-summary-label">Invoiced Orders</span>
            <span className="bzi-summary-value">{summary.invoicedCount}</span>
          </div>
        </div>

        <div className="bzi-tabs">
          <button type="button" className={tab === 'active' ? 'is-active' : ''} onClick={() => switchTab('active')}>
            Active <span className="bzi-tab-count">{activeRows.length}</span>
          </button>
          <button type="button" className={tab === 'past' ? 'is-active' : ''} onClick={() => switchTab('past')}>
            Past Invoices <span className="bzi-tab-count">{pastRows.length}</span>
          </button>
        </div>

        <div className="bzi-toolbar">
          <input
            className="bzi-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, email, invoice #…"
          />
          {tab === 'active' && (
            <select className="bzi-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {tabStatusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="bzi-empty">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <div className="bzi-empty">
            <div className="bzi-empty-icon">💵</div>
            <h2>{tab === 'past' ? 'No paid invoices yet' : orders.length === 0 ? 'No orders yet' : 'No invoices match'}</h2>
            <p>
              {tab === 'past'
                ? 'Invoices move here automatically once their order is paid in full.'
                : orders.length === 0
                  ? 'Invoices are generated from orders — create one in Orders first.'
                  : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <div className="bzi-list">
            {filtered.map(({ order, invoiceStatus, dueSoon }) => {
              const { total, balance } = orderTotals(order);
              return (
                <div key={order.id} className={`bzi-row inv-${invoiceStatus}`}>
                  <button
                    type="button"
                    className="bzi-row-main"
                    onClick={() => setViewing(order)}
                    title="Click to open"
                  >
                    <div className="bzi-row-top">
                      <span className="bzi-row-name">{order.customerName || 'Unnamed customer'}</span>
                      <span className={`bzi-status-pill inv-${invoiceStatus}`}>{statusLabel(invoiceStatus)}</span>
                      {dueSoon && <span className="bzi-duesoon-badge">⏰ Due Soon</span>}
                    </div>
                    <div className="bzi-row-meta">
                      {order.invoiceNumber && <span>{order.invoiceNumber}</span>}
                      {order.dueDate && <span>Due {order.dueDate}</span>}
                      <span className={`bzi-pay-pill pay-${order.paymentStatus}`}>{payLabel(order.paymentStatus)}</span>
                    </div>
                  </button>
                  <div className="bzi-row-side">
                    <div className="bzi-row-total">{currency(total)}</div>
                    {balance > 0.001 && <div className="bzi-row-balance">{currency(balance)} due</div>}
                    {invoiceStatus === 'not_invoiced' ? (
                      <button type="button" className="bzi-btn tiny primary" onClick={() => generateInvoice(order)}>Generate</button>
                    ) : (
                      <button type="button" className="bzi-btn tiny" onClick={() => setViewing(order)}>Open</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewing && (
        <InvoiceView
          order={viewing}
          business={business}
          onGenerate={() => generateInvoice(viewing)}
          onMarkSent={() => markSent(viewing)}
          onGetLink={() => getShareLink(viewing)}
          onRevokeLink={() => revokeShareLink(viewing)}
          onSetDueDate={(date) => setDueDate(viewing, date)}
          onClose={() => setViewing(null)}
        />
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}

/* ── Invoice view / print sheet ─────────────────────────────────
   One component doubles as both the on-screen modal and the
   print-to-PDF layout (via .bzi-print-area + a print stylesheet in
   BusinessInvoices.css) — clicking "Print / Save as PDF" just calls
   window.print(), scoped by @media print to hide everything except
   this sheet. */
function InvoiceView({ order, business, onGenerate, onMarkSent, onGetLink, onRevokeLink, onSetDueDate, onClose }) {
  const invoiceStatus = deriveInvoiceStatus(order);
  const { subtotal, total, balance } = orderTotals(order);
  const [copied, setCopied] = useState(false);
  const dueSoon = isDueSoon(order, invoiceStatus);
  // Once an invoice is paid it joins the read-only Past tab — the due
  // date is history at that point, so lock the picker like the Orders
  // page locks a Past order's fields.
  const dueDateLocked = invoiceStatus === 'paid';

  const shareUrl = order.invoiceShareToken ? `${PUBLIC_INVOICE_BASE()}${order.invoiceShareToken}` : null;

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable — link is still shown/selectable */ }
  }

  return (
    <div className="bzi-modal-backdrop" onClick={onClose}>
      <div className="bzi-modal" onClick={e => e.stopPropagation()}>
        <div className="bzi-modal-head">
          <h2>{order.invoiceNumber || 'Invoice'}</h2>
          <div className="bzi-view-head-actions">
            <button type="button" className="bzi-icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="bzi-modal-body">
          <div className="bzi-view-pills">
            <span className={`bzi-status-pill inv-${invoiceStatus}`}>{statusLabel(invoiceStatus)}</span>
            <span className={`bzi-pay-pill pay-${order.paymentStatus}`}>{payLabel(order.paymentStatus)}</span>
            {dueSoon && <span className="bzi-duesoon-badge">⏰ Due Soon</span>}
          </div>

          {invoiceStatus !== 'not_invoiced' && (
            <div className="bzi-due-editor">
              <label htmlFor="bzi-due-date">Payment Due</label>
              <input
                id="bzi-due-date"
                type="date"
                className="bzi-input"
                value={order.dueDate || ''}
                disabled={dueDateLocked}
                onChange={e => onSetDueDate(e.target.value)}
              />
              {dueDateLocked && <span className="bzi-due-editor-hint">Paid — locked</span>}
            </div>
          )}

          {invoiceStatus === 'not_invoiced' ? (
            <div className="bzi-not-invoiced">
              <p>This order hasn't been invoiced yet.</p>
              <button type="button" className="bzi-btn primary" onClick={onGenerate}>Generate Invoice</button>
            </div>
          ) : (
            <>
              <div className="bzi-actions-row">
                {!order.invoiceSentAt && (
                  <button type="button" className="bzi-btn" onClick={onMarkSent}>✅ Mark Sent</button>
                )}
                <button type="button" className="bzi-btn" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
                {order.invoiceShareToken ? (
                  <button type="button" className="bzi-btn danger" onClick={onRevokeLink}>🔗 Revoke Link</button>
                ) : (
                  <button type="button" className="bzi-btn" onClick={onGetLink}>🔗 Get Shareable Link</button>
                )}
              </div>

              {shareUrl && (
                <div className="bzi-share-link">
                  <input className="bzi-input" readOnly value={shareUrl} onFocus={e => e.target.select()} />
                  <button type="button" className="bzi-btn tiny" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
              )}

              <InvoiceSheet order={order} business={business} totals={{ subtotal, total, balance }} />
            </>
          )}
        </div>

        <div className="bzi-modal-actions">
          <button type="button" className="bzi-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Printable invoice sheet — shared by the in-app modal and, in
   shape, by PublicInvoice.jsx's read-only page ─────────────────── */
export function InvoiceSheet({ order, business, totals }) {
  const { subtotal, total, balance } = totals;
  return (
    <div className="bzi-print-area">
      <div className="bzi-sheet-head">
        <div className="bzi-sheet-biz">
          <span className="bzi-sheet-biz-icon">{business?.icon || '🏢'}</span>
          <span className="bzi-sheet-biz-name">{business?.name || 'Business'}</span>
        </div>
        <div className="bzi-sheet-meta">
          <div><strong>{order.invoiceNumber}</strong></div>
          {order.invoiceIssueDate && <div>Issued {order.invoiceIssueDate}</div>}
          {order.dueDate && <div>Due {order.dueDate}{order.dueTime ? ` · ${order.dueTime}` : ''}</div>}
        </div>
      </div>

      <div className="bzi-sheet-bill-to">
        <span className="bzi-sheet-label">Bill To</span>
        <div className="bzi-sheet-customer-name">{order.customerName || 'Unnamed customer'}</div>
        {order.customerEmail && <div>{order.customerEmail}</div>}
        {order.customerPhone && <div>{order.customerPhone}</div>}
        {order.customerAddress && <div>{order.customerAddress}</div>}
      </div>

      <div className="bzi-sheet-items">
        {(order.items || []).map(it => (
          <div key={it.id} className="bzi-sheet-item">
            <span>{it.qty}× {it.productName || 'Item'}{it.tierLabel ? ` — ${it.tierLabel}` : ''}</span>
            <span>{currency((Number(it.unitPrice) || 0) * (Number(it.qty) || 0))}</span>
          </div>
        ))}
      </div>

      {order.customMessage && <div className="bzi-sheet-message">{order.customMessage}</div>}

      <div className="bzi-sheet-totals">
        <div className="bzi-sheet-total-row"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
        {order.rushFee > 0 && <div className="bzi-sheet-total-row"><span>Rush fee</span><span>{currency(order.rushFee)}</span></div>}
        {order.discount > 0 && <div className="bzi-sheet-total-row"><span>Discount</span><span>-{currency(order.discount)}</span></div>}
        {order.tax > 0 && <div className="bzi-sheet-total-row"><span>Tax</span><span>{currency(order.tax)}</span></div>}
        <div className="bzi-sheet-total-row"><span>Total</span><strong>{currency(total)}</strong></div>
        <div className="bzi-sheet-total-row"><span>Amount Paid</span><span>{currency(order.amountPaid)}</span></div>
        <div className="bzi-sheet-total-row"><span>Balance Due</span><strong className={balance > 0.001 ? 'due' : ''}>{currency(balance)}</strong></div>
      </div>
    </div>
  );
}
