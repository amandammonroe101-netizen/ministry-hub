import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { businessOrderService } from '../../services/businessOrderService';
import { businessCustomerService, groupOrdersByCustomer } from '../../services/businessCustomerService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './BusinessCustomers.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Customers & Clients (V1).

   The directory itself is derived, not manually maintained — every
   order already carries customer contact info (see
   businessOrderService.defaultOrder), so grouping orders by
   customerKey() gives "everyone who's bought from you" for free and
   keeps it perfectly in sync with Orders. The only thing persisted
   here is freeform notes per customer (see businessCustomerService).
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

export default function BusinessCustomers() {
  const { businessId } = useParams();
  const { profile, avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [orders, setOrders] = useState([]);
  const [notesByKey, setNotesByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [viewingKey, setViewingKey] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, orderRes, notesRes] = await Promise.all([
        businessService.getOne(businessId),
        businessOrderService.getAll(businessId),
        businessCustomerService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setOrders(orderRes.data.data || []);
      setNotesByKey(notesRes.data.data || {});
    } catch (e) {
      setError(e?.message || 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  // Group every order by customer identity so the directory is
  // derived straight from order history — one entry per distinct
  // buyer, however many orders they've placed. Shared with the
  // "New Order" search (BusinessOrders.jsx) via groupOrdersByCustomer()
  // so both pages agree on who counts as "the same person".
  const customers = useMemo(() => {
    return groupOrdersByCustomer(orders)
      .map(c => {
        const lifetimeRevenue = c.orders.reduce((sum, o) => sum + orderTotals(o).total, 0);
        const outstandingBalance = c.orders.reduce((sum, o) => sum + orderTotals(o).balance, 0);
        return {
          ...c,
          orderCount: c.orders.length,
          lifetimeRevenue,
          outstandingBalance,
          notes: notesByKey[c.key]?.notes || '',
        };
      })
      .sort((a, b) => (b.newestCreatedAt || '').localeCompare(a.newestCreatedAt || ''));
  }, [orders, notesByKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => [c.name, c.email, c.phone].join(' ').toLowerCase().includes(q));
  }, [customers, search]);

  const summary = useMemo(() => {
    const totalCustomers = customers.length;
    const repeatCustomers = customers.filter(c => c.orderCount >= 2).length;
    const lifetimeRevenue = customers.reduce((sum, c) => sum + c.lifetimeRevenue, 0);
    const outstandingBalance = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
    return { totalCustomers, repeatCustomers, lifetimeRevenue, outstandingBalance };
  }, [customers]);

  const viewing = viewingKey ? customers.find(c => c.key === viewingKey) : null;

  async function saveNotes(key, notes) {
    try {
      await businessCustomerService.setNotes(businessId, key, notes);
      setNotesByKey(prev => ({ ...prev, [key]: { ...(prev[key] || {}), notes } }));
    } catch (e) {
      setError(e?.message || 'Could not save that note.');
    }
  }

  return (
    <BusinessShell
      title="Customers & Clients"
      icon="🧑‍🤝‍🧑"
      subtitle="Everyone who's bought from you — contact info, order history, and notes, all in one place."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bzc-root">
        {error && (
          <div className="bzc-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzc-summary-strip">
          <div className="bzc-summary-card">
            <span className="bzc-summary-label">Total Customers</span>
            <span className="bzc-summary-value">{summary.totalCustomers}</span>
          </div>
          <div className="bzc-summary-card">
            <span className="bzc-summary-label">Repeat Customers</span>
            <span className="bzc-summary-value">{summary.repeatCustomers}</span>
          </div>
          <div className="bzc-summary-card">
            <span className="bzc-summary-label">Lifetime Revenue</span>
            <span className="bzc-summary-value">{currency(summary.lifetimeRevenue)}</span>
          </div>
          <div className="bzc-summary-card overdue">
            <span className="bzc-summary-label">Outstanding</span>
            <span className="bzc-summary-value">{currency(summary.outstandingBalance)}</span>
          </div>
        </div>

        <div className="bzc-toolbar">
          <input
            className="bzc-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
          />
        </div>

        {loading ? (
          <div className="bzc-empty">Loading customers…</div>
        ) : filtered.length === 0 ? (
          <div className="bzc-empty">
            <div className="bzc-empty-icon">🧑‍🤝‍🧑</div>
            <h2>{orders.length === 0 ? 'No customers yet' : 'No customers match'}</h2>
            <p>
              {orders.length === 0
                ? "Customers appear here automatically once someone's ordered from you."
                : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="bzc-list">
            {filtered.map(c => (
              <button key={c.key} type="button" className="bzc-row" onClick={() => setViewingKey(c.key)}>
                <div className="bzc-row-main">
                  <div className="bzc-row-top">
                    <span className="bzc-row-name">{c.name}</span>
                    {c.orderCount >= 2 && <span className="bzc-repeat-badge">Repeat</span>}
                  </div>
                  <div className="bzc-row-meta">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {!c.email && !c.phone && <span>No contact info on file</span>}
                  </div>
                </div>
                <div className="bzc-row-side">
                  <div className="bzc-row-orders">{c.orderCount} order{c.orderCount === 1 ? '' : 's'}</div>
                  <div className="bzc-row-revenue">{currency(c.lifetimeRevenue)}</div>
                  {c.outstandingBalance > 0.001 && <div className="bzc-row-balance">{currency(c.outstandingBalance)} due</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <CustomerView
          customer={viewing}
          onSaveNotes={(notes) => saveNotes(viewing.key, notes)}
          onClose={() => setViewingKey(null)}
        />
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}

function CustomerView({ customer, onSaveNotes, onClose }) {
  const [notes, setNotes] = useState(customer.notes || '');
  const [dirty, setDirty] = useState(false);

  function handleBlur() {
    if (!dirty) return;
    onSaveNotes(notes);
    setDirty(false);
  }

  const sortedOrders = useMemo(
    () => [...customer.orders].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [customer.orders]
  );

  return (
    <div className="bzc-modal-backdrop" onClick={onClose}>
      <div className="bzc-modal" onClick={e => e.stopPropagation()}>
        <div className="bzc-modal-head">
          <h2>{customer.name}</h2>
          <button type="button" className="bzc-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzc-modal-body">
          <div className="bzc-contact-card">
            {customer.email && <div>✉️ {customer.email}</div>}
            {customer.phone && <div>📞 {customer.phone}</div>}
            {customer.address && <div>📍 {customer.address}</div>}
            {!customer.email && !customer.phone && !customer.address && <div>No contact info on file</div>}
          </div>

          <div className="bzc-stats-row">
            <div className="bzc-stat">
              <span className="bzc-stat-label">Orders</span>
              <span className="bzc-stat-value">{customer.orderCount}</span>
            </div>
            <div className="bzc-stat">
              <span className="bzc-stat-label">Lifetime Revenue</span>
              <span className="bzc-stat-value">{currency(customer.lifetimeRevenue)}</span>
            </div>
            {customer.outstandingBalance > 0.001 && (
              <div className="bzc-stat">
                <span className="bzc-stat-label">Outstanding</span>
                <span className="bzc-stat-value balance">{currency(customer.outstandingBalance)}</span>
              </div>
            )}
          </div>

          <div className="bzc-notes-section">
            <label htmlFor="bzc-notes">Notes</label>
            <textarea
              id="bzc-notes"
              className="bzc-notes-input"
              rows={4}
              value={notes}
              onChange={e => { setNotes(e.target.value); setDirty(true); }}
              onBlur={handleBlur}
              placeholder="Anything worth remembering about this customer…"
            />
          </div>

          <div className="bzc-history-section">
            <h3>Order History</h3>
            <div className="bzc-history-list">
              {sortedOrders.map(o => {
                const { total, balance } = orderTotals(o);
                return (
                  <div key={o.id} className="bzc-history-row">
                    <div className="bzc-history-date">{(o.created_at || '').slice(0, 10) || '—'}</div>
                    <div className="bzc-history-items">
                      {(o.items || []).map(it => `${it.qty}× ${it.productName || 'Item'}`).join(', ') || '—'}
                    </div>
                    <div className="bzc-history-total">
                      {currency(total)}
                      {balance > 0.001 && <span className="bzc-history-balance"> · {currency(balance)} due</span>}
                      {o.invoiceNumber && <span className="bzc-history-invoice"> · {o.invoiceNumber}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bzc-modal-actions">
          <button type="button" className="bzc-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
