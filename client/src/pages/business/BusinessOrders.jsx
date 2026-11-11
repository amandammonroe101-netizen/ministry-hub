import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { businessProductService } from '../../services/businessProductService';
import { businessOrderService, defaultOrderItem, ORDER_STATUSES, PAYMENT_STATUSES, isPastOrder } from '../../services/businessOrderService';
import { groupOrdersByCustomer, mergeCustomerSearch } from '../../services/businessCustomerService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { searchUsers } from '../../lib/contactRequests';
import { requestInfoShare, useMyInfoShareRequests } from '../../lib/infoShareRequests';
import { useAuth } from '../../context/AuthContext';
import './BusinessOrders.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Orders. Every incoming order for this
   business: customer info, the line items pulled from the Product
   Catalog (snapshotted at order time so later catalog edits never
   rewrite history), fulfillment, payment, and status.

   A product's "🧾 Order" button (see ProductCatalog.jsx) links here
   with a ?newOrderForProduct=<id> query param — on load, if that
   product is found, a New Order form opens pre-filled with it as
   the first line item so a member never has to re-type what they
   just looked at in the catalog.
   ───────────────────────────────────────────────────────────── */

const FOOD_CATEGORIES = ['bakery', 'online-bakery', 'cafe', 'restaurant'];

const FULFILLMENT_OPTIONS = [
  { value: 'pickup', label: '🏠 Pickup' },
  { value: 'delivery', label: '🚗 Delivery' },
  { value: 'shipping', label: '📦 Shipping' },
];

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

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

function initialsOf(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusLabel(value) { return ORDER_STATUSES.find(s => s.value === value)?.label || value; }
function paymentLabel(value) { return PAYMENT_STATUSES.find(s => s.value === value)?.label || value; }

function tierOptionsFor(product) {
  if (!product) return [];
  if (product.isBundle) return [{ id: 'bundle', label: 'Bundle price', price: product.bundlePrice || 0 }];
  return (product.priceTiers || []).map(t => ({ id: t.id, label: t.label || 'Price', price: t.price || 0 }));
}

export default function BusinessOrders() {
  const { businessId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, avatarSourceName, initials } = useProfileTopbar();
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('active'); // 'active' | 'past'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');

  const [editing, setEditing] = useState(null); // order object, 'new', or null
  const [viewing, setViewing] = useState(null); // order object or null (read-only view)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [customerChoiceProduct, setCustomerChoiceProduct] = useState(null); // product waiting on a customer pick

  const isFoodBusiness = FOOD_CATEGORIES.includes(business?.category);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, prodRes, orderRes] = await Promise.all([
        businessService.getOne(businessId),
        businessProductService.getAll(businessId),
        businessOrderService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setProducts(prodRes.data.data || []);
      setOrders(orderRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  /* Pre-fill a New Order from the Product Catalog's "🧾 Order" button —
     first asks who the order is for (an existing member or a brand-new
     client), then opens a blank New Order with the item-customize popup
     already open for that product, instead of silently dropping in a
     default item under whatever customer was left in the form. */
  useEffect(() => {
    const productId = searchParams.get('newOrderForProduct');
    if (!productId || loading) return;
    const product = products.find(p => p.id === productId);
    if (product) {
      setCustomerChoiceProduct(product);
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('newOrderForProduct'); return next; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, loading]);

  /* Deep-link straight into one order's read-only view — used by the
     Demand Analysis dashboard's "which orders need this" drill-down
     so clicking an order there jumps here already open, instead of
     making the member hunt for it by hand. */
  useEffect(() => {
    const orderId = searchParams.get('viewOrder');
    if (!orderId || loading) return;
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setTab(isPastOrder(order) ? 'past' : 'active');
      setViewing(order);
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('viewOrder'); return next; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, loading]);

  function chooseCustomerForNewOrder(customer) {
    const product = customerChoiceProduct;
    setCustomerChoiceProduct(null);
    if (!product) return;
    setEditing({ __prefill: true, items: [], __customizeProductId: product.id, __customer: customer });
  }

  /* Instead of starting a new order, drop this product straight into an
     order that's already in progress — opens that order for editing with
     the item-customize popup pre-opened for it. */
  function addProductToExistingOrder(order) {
    const product = customerChoiceProduct;
    setCustomerChoiceProduct(null);
    if (!product) return;
    setEditing({ ...order, __customizeProductId: product.id });
  }

  /* When a member accepts one of our info-share requests, backfill the
     shared email/phone straight onto the ONE order that request was made
     for (matched by customerInfoRequestId, not just by customer) — so it
     shows up there without anyone having to reopen that order's editor.
     Each order's request is its own scoped ask, so accepting it never
     leaks that info onto some other order for the same person. */
  const { requests: infoRequests } = useMyInfoShareRequests();
  useEffect(() => {
    if (!user?.uid || !infoRequests.length || !orders.length) return;
    const accepted = infoRequests.filter(r => r.status === 'accepted' && r.senderUid === user.uid);
    if (!accepted.length) return;
    orders.forEach(o => {
      if (!o.customerInfoRequestId) return;
      const match = accepted.find(r => r.id === o.customerInfoRequestId);
      if (!match) return;
      const patch = {};
      if (!o.customerEmail && match.sharedEmail) patch.customerEmail = match.sharedEmail;
      if (!o.customerPhone && match.sharedPhone) patch.customerPhone = match.sharedPhone;
      if (Object.keys(patch).length === 0) return;
      businessOrderService.update(businessId, o.id, patch).then(res => {
        setOrders(prev => prev.map(x => (x.id === o.id ? res.data.data : x)));
      });
    });
  }, [infoRequests, orders, businessId, user]);

  const activeOrders = useMemo(() => orders.filter(o => !isPastOrder(o)), [orders]);
  const pastOrders = useMemo(() => orders.filter(isPastOrder), [orders]);
  const tabOrders = tab === 'past' ? pastOrders : activeOrders;
  // Past orders aren't limited to a fixed set of statuses (a Paid In
  // Full order can carry any fulfillment status), so the status
  // filter offers the full list on both tabs.
  const tabStatusOptions = ORDER_STATUSES;

  // The status dropdown is tab-scoped (Past only offers
  // Completed/Cancelled), so a filter picked on one tab shouldn't
  // silently hide everything on the other — reset it on switch.
  function switchTab(next) { setTab(next); setStatusFilter('all'); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabOrders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (fulfillmentFilter !== 'all' && o.fulfillmentMethod !== fulfillmentFilter) return false;
      if (!q) return true;
      const hay = [o.customerName, o.customerEmail, o.customerPhone, ...(o.items || []).map(i => i.productName)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tabOrders, search, statusFilter, fulfillmentFilter]);

  function openNew() { setEditing('new'); }
  function openEdit(o) { if (isPastOrder(o)) return; setViewing(null); setEditing(o); }
  function closeEditor() { setEditing(null); }
  function openView(o) { setViewing(o); }
  function closeView() { setViewing(null); }

  async function saveOrder(data) {
    try {
      const isNew = editing === 'new' || editing?.__prefill;
      if (isNew) {
        const res = await businessOrderService.create(businessId, data);
        setOrders(prev => [res.data.data, ...prev]);
      } else {
        const res = await businessOrderService.update(businessId, editing.id, data);
        setOrders(prev => prev.map(o => (o.id === editing.id ? res.data.data : o)));
      }
      setEditing(null);
    } catch (e) {
      setError(e?.message || 'Could not save that order.');
    }
  }

  async function deleteOrder(id) {
    setConfirmDelete(null);
    setOrders(prev => prev.filter(o => o.id !== id));
    try {
      await businessOrderService.delete(businessId, id);
    } catch (e) {
      setError(e?.message || 'Could not delete that order.');
      load();
    }
  }

  return (
    <BusinessShell
      title="Orders"
      icon="🧾"
      subtitle="Incoming orders — customer info, line items pulled from the catalog, fulfillment, and payment tracking."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
      actions={
        <button type="button" className="bzr-btn primary" onClick={openNew}>＋ New Order</button>
      }
    >
      <div className="bzr-root">
        {error && (
          <div className="bzr-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzr-tabs">
          <button type="button" className={tab === 'active' ? 'is-active' : ''} onClick={() => switchTab('active')}>
            Active <span className="bzr-tab-count">{activeOrders.length}</span>
          </button>
          <button type="button" className={tab === 'past' ? 'is-active' : ''} onClick={() => switchTab('past')}>
            Past <span className="bzr-tab-count">{pastOrders.length}</span>
          </button>
        </div>

        <div className="bzr-toolbar">
          <input
            className="bzr-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, email, phone, product…"
          />
          <select className="bzr-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {tabStatusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="bzr-select" value={fulfillmentFilter} onChange={e => setFulfillmentFilter(e.target.value)}>
            <option value="all">All fulfillment</option>
            {FULFILLMENT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="bzr-empty">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="bzr-empty">
            <div className="bzr-empty-icon">🧾</div>
            <h2>{tab === 'past' ? 'No past orders yet' : orders.length === 0 ? 'No orders yet' : 'No orders match'}</h2>
            <p>
              {tab === 'past'
                ? 'Orders move here automatically once marked Completed, Cancelled, or Paid in Full.'
                : orders.length === 0
                  ? 'New orders can be created here, or start one from a product in the Product Catalog.'
                  : 'Try a different search or filter.'}
            </p>
            {tab === 'active' && orders.length === 0 && (
              <button type="button" className="bzr-btn primary" onClick={openNew}>＋ New Order</button>
            )}
          </div>
        ) : (
          <div className="bzr-list">
            {filtered.map(o => {
              const { total, balance } = orderTotals(o);
              const itemSummary = (o.items || []).map(i => `${i.qty}× ${i.productName}`).join(', ') || 'No items';
              const isPast = isPastOrder(o);
              return (
                <div key={o.id} className={`bzr-row status-${o.status}`}>
                  <button
                    type="button"
                    className="bzr-row-main"
                    onClick={() => openView(o)}
                    onDoubleClick={e => { e.preventDefault(); openView(o); }}
                    title={isPast ? 'Double-click to view' : 'Double-click to view · use ✏️ to edit'}
                  >
                    <div className="bzr-row-top">
                      <span className="bzr-row-name">{o.customerName || 'Unnamed customer'}</span>
                      {/* "New" is a call to action ("this needs attention") —
                          meaningless once the order's landed in the
                          read-only Past tab, so it's the one status that's
                          suppressed there rather than shown as a pill. */}
                      {!(isPast && o.status === 'new') && (
                        <span className={`bzr-status-pill status-${o.status}`}>{statusLabel(o.status)}</span>
                      )}
                    </div>
                    <div className="bzr-row-items">{itemSummary}</div>
                    <div className="bzr-row-meta">
                      {o.fulfillmentMethod && <span>{FULFILLMENT_OPTIONS.find(f => f.value === o.fulfillmentMethod)?.label}</span>}
                      {o.dueDate && <span>Due {o.dueDate}{o.dueTime ? ` · ${o.dueTime}` : ''}</span>}
                      <span className={`bzr-pay-pill pay-${o.paymentStatus}`}>{paymentLabel(o.paymentStatus)}</span>
                    </div>
                  </button>
                  <div className="bzr-row-side">
                    <div className="bzr-row-total">{currency(total)}</div>
                    {balance > 0.001 && <div className="bzr-row-balance">{currency(balance)} due</div>}
                    {isPast ? null : confirmDelete === o.id ? (
                      <div className="bzr-confirm-row">
                        <button type="button" className="bzr-btn tiny danger" onClick={() => deleteOrder(o.id)}>Delete</button>
                        <button type="button" className="bzr-btn tiny" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="bzr-row-actions">
                        <button type="button" className="bzr-icon-btn" title="Edit" onClick={() => openEdit(o)}>✏️</button>
                        <button type="button" className="bzr-icon-btn danger" title="Delete" onClick={() => setConfirmDelete(o.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewing && (
        <OrderView
          order={viewing}
          onEdit={() => openEdit(viewing)}
          onClose={closeView}
        />
      )}

      {editing && (
        <OrderEditor
          order={(editing === 'new' || editing?.__prefill) ? null : editing}
          prefillItems={editing?.__prefill ? editing.items : null}
          initialCustomizeProductId={editing?.__customizeProductId || null}
          initialCustomer={editing?.__customer || null}
          orders={orders}
          products={products}
          isFoodBusiness={isFoodBusiness}
          profile={profile}
          businessName={business?.name}
          onSave={saveOrder}
          onClose={closeEditor}
        />
      )}

      {customerChoiceProduct && (
        <ChooseCustomerModal
          productName={customerChoiceProduct.name}
          orders={orders}
          onChoose={chooseCustomerForNewOrder}
          onAddToExisting={addProductToExistingOrder}
          onClose={() => setCustomerChoiceProduct(null)}
        />
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}

/* ── Choose customer (shown before opening a New Order started from
   the Product Catalog's "🧾 Order" button) — search the whole member
   directory for an existing client, or start a brand-new one who
   isn't a member yet, before customizing the item itself. */
function ChooseCustomerModal({ productName, orders, onChoose, onAddToExisting, onClose }) {
  const { user } = useAuth();
  const [mode, setMode] = useState('new'); // 'new' | 'existing'
  const [query, setQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState('');
  const [orderQuery, setOrderQuery] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setMemberResults([]); setSearching(false); return undefined; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchUsers(q, user?.uid);
        setMemberResults(matches);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, user]);

  // Everyone who's ordered from this business before, grouped by
  // identity — merged into the member search below so the same person
  // never shows up twice just because they also happen to be a member.
  const pastCustomers = useMemo(() => groupOrdersByCustomer(orders), [orders]);
  const results = useMemo(
    () => mergeCustomerSearch(memberResults, pastCustomers, query),
    [memberResults, pastCustomers, query]
  );

  function pickEntry(entry) {
    if (entry.kind === 'member') {
      const p = entry.person;
      onChoose({
        customerUid: p.uid,
        customerName: p.displayName || '',
        customerEmail: p.email || '',
        customerPhone: p.phone || '',
        emailHidden: p.emailVisible === false && !p.email,
        phoneHidden: p.phoneVisible === false && !p.phone,
      });
    } else {
      const c = entry.person;
      onChoose({ customerUid: null, customerName: c.name || '', customerEmail: c.email || '', customerPhone: c.phone || '', emailHidden: false, phoneHidden: false });
    }
  }

  function useNewClient() {
    const name = newName.trim();
    if (!name) return;
    onChoose({ customerUid: null, customerName: name, customerEmail: '', customerPhone: '', emailHidden: false, phoneHidden: false });
  }

  // Open orders only — an item wouldn't get made/shipped by adding it to
  // one that's already landed in the read-only Past tab (completed,
  // cancelled, or paid in full).
  const openOrders = useMemo(
    () => (orders || []).filter(o => !isPastOrder(o)),
    [orders]
  );
  const orderMatches = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return openOrders;
    return openOrders.filter(o => (o.customerName || '').toLowerCase().includes(q));
  }, [openOrders, orderQuery]);

  return (
    <div className="bzr-modal-backdrop" onClick={onClose}>
      <div className="bzr-modal narrow" onClick={e => e.stopPropagation()}>
        <div className="bzr-modal-head">
          <h2>Who's this order for?</h2>
          <button type="button" className="bzr-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzr-modal-body">
          {productName && <p className="bzr-choose-customer-hint">Ordering <strong>{productName}</strong>.</p>}

          <div className="bzr-segmented">
            <button type="button" className={mode === 'new' ? 'is-active' : ''} onClick={() => setMode('new')}>＋ New order</button>
            <button type="button" className={mode === 'existing' ? 'is-active' : ''} onClick={() => setMode('existing')}>📎 Add to existing order</button>
          </div>

          {mode === 'new' ? (
            <>
              <div className="bzr-field">
                <label className="bzr-field-label">Search members</label>
                <input
                  autoFocus
                  className="bzr-input"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  autoComplete="off"
                />
              </div>

              {query.trim() && (
                <div className="bzr-choose-customer-results">
                  {searching && <div className="bzr-customer-result-empty">Searching…</div>}
                  {!searching && results.length === 0 && (
                    <div className="bzr-customer-result-empty">No matches.</div>
                  )}
                  {!searching && results.map(entry => {
                    const p = entry.person;
                    const name = entry.kind === 'member' ? (p.displayName || 'Member') : (p.name || 'Customer');
                    const sub = entry.kind === 'member'
                      ? (p.emailVisible !== false && p.email ? p.email : '')
                      : (p.email || p.phone || '');
                    return (
                      <button type="button" key={entry.key} className="bzr-customer-result" onClick={() => pickEntry(entry)}>
                        <span className="bzr-customer-result-avatar">{initialsOf(name)}</span>
                        <span className="bzr-customer-result-text">
                          <span className="bzr-customer-result-name">
                            {name}
                            {entry.kind === 'past' && <span className="bzr-past-customer-tag">Past customer</span>}
                          </span>
                          {sub && <span className="bzr-customer-result-sub">{sub}</span>}
                        </span>
                        {entry.pastOrderCount > 0 && (
                          <span className="bzr-past-order-count">{entry.pastOrderCount} order{entry.pastOrderCount === 1 ? '' : 's'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="bzr-choose-customer-divider">or</div>

              <div className="bzr-field">
                <label className="bzr-field-label">New client's name</label>
                <input
                  className="bzr-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Not a member yet…"
                  onKeyDown={e => { if (e.key === 'Enter') useNewClient(); }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="bzr-field">
                <label className="bzr-field-label">Search open orders</label>
                <input
                  autoFocus
                  className="bzr-input"
                  value={orderQuery}
                  onChange={e => setOrderQuery(e.target.value)}
                  placeholder="Filter by customer…"
                  autoComplete="off"
                />
              </div>

              <div className="bzr-choose-customer-results">
                {orderMatches.length === 0 && (
                  <div className="bzr-customer-result-empty">
                    {openOrders.length === 0 ? 'No open orders yet.' : 'No orders match.'}
                  </div>
                )}
                {orderMatches.map(o => (
                  <button type="button" key={o.id} className="bzr-customer-result" onClick={() => onAddToExisting(o)}>
                    <span className="bzr-customer-result-avatar">{initialsOf(o.customerName)}</span>
                    <span className="bzr-customer-result-text">
                      <span className="bzr-customer-result-name">{o.customerName || 'Unnamed customer'}</span>
                      <span className="bzr-customer-result-sub">{statusLabel(o.status)} · {(o.items || []).length} item{(o.items || []).length === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {mode === 'new' && (
          <div className="bzr-modal-actions">
            <button type="button" className="bzr-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="bzr-btn primary" disabled={!newName.trim()} onClick={useNewClient}>＋ Continue with new client</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Order editor (create / edit) ────────────────────────────── */
const emptyOrder = () => ({
  customerUid: null,
  customerInfoRequestId: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  items: [],
  fulfillmentMethod: '',
  dueDate: '',
  dueTime: '',
  customMessage: '',
  rushFee: 0,
  discount: 0,
  tax: 0,
  paymentStatus: 'unpaid',
  amountPaid: 0,
  status: 'new',
  notes: '',
});

function OrderEditor({ order, prefillItems, initialCustomizeProductId, initialCustomer, orders, products, isFoodBusiness, profile, businessName, onSave, onClose }) {
  const [form, setForm] = useState(() => (order ? {
    customerUid:     order.customerUid || null,
    customerInfoRequestId: order.customerInfoRequestId || null,
    customerName:    order.customerName || '',
    customerPhone:   order.customerPhone || '',
    customerEmail:   order.customerEmail || '',
    customerAddress: order.customerAddress || '',
    items:           order.items?.length ? order.items : [],
    fulfillmentMethod: order.fulfillmentMethod || '',
    dueDate: order.dueDate || '',
    dueTime: order.dueTime || '',
    customMessage: order.customMessage || '',
    rushFee:  order.rushFee ?? 0,
    discount: order.discount ?? 0,
    tax:      order.tax ?? 0,
    paymentStatus: order.paymentStatus || 'unpaid',
    amountPaid:    order.amountPaid ?? 0,
    status: order.status || 'new',
    notes:  order.notes || '',
  } : {
    ...emptyOrder(),
    items: prefillItems || [],
    customerUid:     initialCustomer?.customerUid || null,
    customerName:    initialCustomer?.customerName || '',
    customerEmail:   initialCustomer?.customerEmail || '',
    customerPhone:   initialCustomer?.customerPhone || '',
  }));

  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  /* Customer name search — looks up the whole member directory (not
     just this member's own Contacts) so an order can be linked to any
     signed-up member's profile, auto-filling their email. */
  const [customerResults, setCustomerResults] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const customerDebounceRef = useRef(null);
  const customerWrapRef = useRef(null);

  useEffect(() => {
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    const q = form.customerName.trim();
    if (!q) { setCustomerResults([]); setCustomerSearching(false); return undefined; }
    setCustomerSearching(true);
    customerDebounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchUsers(q, user?.uid);
        setCustomerResults(matches);
      } finally {
        setCustomerSearching(false);
      }
    }, 200);
    return () => { if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customerName, user]);

  useEffect(() => {
    function onDocClick(e) {
      if (customerWrapRef.current && !customerWrapRef.current.contains(e.target)) setCustomerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Everyone who's ordered from this business before, merged with the
  // member-directory search above so the same person (member or not)
  // only ever shows up once — see mergeCustomerSearch().
  const pastCustomers = useMemo(() => groupOrdersByCustomer(orders), [orders]);
  const customerMatches = useMemo(
    () => mergeCustomerSearch(customerResults, pastCustomers, form.customerName),
    [customerResults, pastCustomers, form.customerName]
  );

  function pickCustomer(p) {
    setForm(f => ({
      ...f,
      customerUid: p.uid,
      // A new customer means any info request already linked to this form
      // no longer applies — start fresh so the request stays scoped to
      // this specific order/form rather than following the person around.
      customerInfoRequestId: p.uid === f.customerUid ? f.customerInfoRequestId : null,
      customerName: p.displayName || f.customerName,
      customerEmail: p.email || f.customerEmail,
      customerPhone: p.phone || f.customerPhone,
    }));
    setPickedCustomerMeta({
      emailHidden: p.emailVisible === false && !p.email,
      phoneHidden: p.phoneVisible === false && !p.phone,
    });
    setCustomerOpen(false);
  }

  function pickCustomerEntry(entry) {
    if (entry.kind === 'member') {
      pickCustomer(entry.person);
      return;
    }
    const c = entry.person;
    setForm(f => ({
      ...f,
      customerUid: null,
      customerInfoRequestId: null,
      customerName: c.name || f.customerName,
      customerEmail: c.email || f.customerEmail,
      customerPhone: c.phone || f.customerPhone,
    }));
    setPickedCustomerMeta({ emailHidden: false, phoneHidden: false });
    setCustomerOpen(false);
  }

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  /* Request-info flow — when the picked member's email/phone is hidden
     from the directory, offer to ask them for it instead of leaving the
     field blank. Consent-based: nothing is shared until they Accept. */
  const [pickedCustomerMeta, setPickedCustomerMeta] = useState(() => (initialCustomer
    ? { emailHidden: initialCustomer.emailHidden, phoneHidden: initialCustomer.phoneHidden }
    : null));
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [infoRequestError, setInfoRequestError] = useState('');
  const [infoRequestMessage, setInfoRequestMessage] = useState('');
  const { requests: infoRequests } = useMyInfoShareRequests();

  // Scoped to THIS form's request only (by id), not to every request ever
  // sent to this customer — a different order for the same person needs
  // its own request and its own consent.
  const sentInfoRequest = useMemo(() => {
    if (!form.customerInfoRequestId) return null;
    return infoRequests.find(r => r.id === form.customerInfoRequestId) || null;
  }, [infoRequests, form.customerInfoRequestId]);

  useEffect(() => {
    if (!sentInfoRequest || sentInfoRequest.status !== 'accepted') return;
    setForm(f => ({
      ...f,
      customerEmail: f.customerEmail || sentInfoRequest.sharedEmail || f.customerEmail,
      customerPhone: f.customerPhone || sentInfoRequest.sharedPhone || f.customerPhone,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentInfoRequest]);

  const needsEmail = pickedCustomerMeta?.emailHidden && !form.customerEmail;
  const needsPhone = pickedCustomerMeta?.phoneHidden && !form.customerPhone;

  async function handleRequestInfo() {
    if (!form.customerUid || (!needsEmail && !needsPhone)) return;
    setRequestingInfo(true);
    setInfoRequestError('');
    try {
      const requestId = await requestInfoShare(
        profile,
        { uid: form.customerUid, displayName: form.customerName },
        {
          wantEmail: needsEmail,
          wantPhone: needsPhone,
          context: businessName ? `Order — ${businessName}` : '',
          message: infoRequestMessage,
        }
      );
      set('customerInfoRequestId', requestId);
      setInfoRequestMessage('');
    } catch (err) {
      setInfoRequestError(err.message || 'Could not send request.');
    } finally {
      setRequestingInfo(false);
    }
  }

  function removeItem(id) { set('items', form.items.filter(it => it.id !== id)); }

  /* Item customize popup — every item (new or edited) is configured in
     its own modal (product, tier, qty, flavor/filling/frosting/size,
     and a note) rather than inline in the order form. */
  const [itemModal, setItemModal] = useState(null); // null | { isNew, item }

  function seedItem(productId) {
    const base = defaultOrderItem();
    if (!productId) return base;
    const product = products.find(p => p.id === productId);
    const tier = tierOptionsFor(product)[0];
    return {
      ...base,
      productId: product?.id || null,
      productName: product?.name || '',
      tierLabel: tier?.label || '',
      unitPrice: tier?.price ?? 0,
    };
  }
  function openAddItem(productId = null) { setItemModal({ isNew: true, item: seedItem(productId) }); }
  function openEditItem(it) { setItemModal({ isNew: false, item: it }); }
  function closeItemModal() { setItemModal(null); }
  function saveItem(data) {
    if (itemModal?.isNew) {
      set('items', [...form.items, data]);
    } else {
      set('items', form.items.map(it => (it.id === data.id ? data : it)));
    }
    setItemModal(null);
  }

  useEffect(() => {
    if (initialCustomizeProductId) openAddItem(initialCustomizeProductId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { subtotal, total, balance } = orderTotals(form);

  async function submit() {
    if (!form.customerName.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ ...form, customerName: form.customerName.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="bzr-modal-backdrop" onClick={onClose}>
      <div className="bzr-modal" onClick={e => e.stopPropagation()}>
        <div className="bzr-modal-head">
          <h2>{order ? 'Edit Order' : 'New Order'}</h2>
          <button type="button" className="bzr-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzr-modal-body">
          <div className="bzr-field-row">
            <div className="bzr-field grow bzr-customer-search" ref={customerWrapRef}>
              <label className="bzr-field-label">Customer name</label>
              <input
                autoFocus
                className="bzr-input"
                value={form.customerName}
                onChange={e => { set('customerName', e.target.value); setCustomerOpen(true); }}
                onFocus={() => setCustomerOpen(true)}
                placeholder="Search any member, or type a name…"
                autoComplete="off"
              />
              {customerOpen && form.customerName.trim() && (
                <div className="bzr-customer-results">
                  {customerSearching && <div className="bzr-customer-result-empty">Searching…</div>}
                  {!customerSearching && customerMatches.length === 0 && (
                    <div className="bzr-customer-result-empty">No matches — this will be saved as a manual customer.</div>
                  )}
                  {!customerSearching && customerMatches.map(entry => {
                    const p = entry.person;
                    const name = entry.kind === 'member' ? (p.displayName || 'Member') : (p.name || 'Customer');
                    const sub = entry.kind === 'member'
                      ? (p.emailVisible !== false && p.email ? p.email : '')
                      : (p.email || p.phone || '');
                    return (
                      <button
                        type="button"
                        key={entry.key}
                        className="bzr-customer-result"
                        onClick={() => pickCustomerEntry(entry)}
                      >
                        <span className="bzr-customer-result-avatar">{initialsOf(name)}</span>
                        <span className="bzr-customer-result-text">
                          <span className="bzr-customer-result-name">
                            {name}
                            {entry.kind === 'past' && <span className="bzr-past-customer-tag">Past customer</span>}
                          </span>
                          {sub && <span className="bzr-customer-result-sub">{sub}</span>}
                        </span>
                        {entry.pastOrderCount > 0 && (
                          <span className="bzr-past-order-count">{entry.pastOrderCount} order{entry.pastOrderCount === 1 ? '' : 's'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bzr-field">
              <label className="bzr-field-label">Status</label>
              <select className="bzr-select" value={form.status} onChange={e => set('status', e.target.value)}>
                {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="bzr-field-row">
            <div className="bzr-field grow">
              <label className="bzr-field-label">Phone</label>
              <input
                className="bzr-input"
                value={form.customerPhone}
                onChange={e => set('customerPhone', e.target.value)}
                placeholder={needsPhone ? 'Hidden from directory' : ''}
              />
            </div>
            <div className="bzr-field grow">
              <label className="bzr-field-label">Email</label>
              <input
                className="bzr-input"
                value={form.customerEmail}
                onChange={e => set('customerEmail', e.target.value)}
                placeholder={needsEmail ? 'Hidden from directory' : ''}
              />
            </div>
          </div>

          {(needsEmail || needsPhone) && !sentInfoRequest && (
            <div className="bzr-info-request bzr-info-request-form">
              <span className="bzr-info-request-text">
                🔒 {form.customerName || 'This member'} keeps {needsEmail && needsPhone ? 'their email and phone' : needsEmail ? 'their email' : 'their phone number'} private.
              </span>
              <textarea
                className="bzr-input bzr-info-request-note"
                value={infoRequestMessage}
                onChange={e => setInfoRequestMessage(e.target.value)}
                placeholder="Add an optional message (e.g. why you need it)…"
                rows={2}
              />
              <button type="button" className="app-btn ghost bzr-info-request-btn" disabled={requestingInfo} onClick={handleRequestInfo}>
                {requestingInfo ? 'Sending…' : 'Request info'}
              </button>
              {infoRequestError && <span className="bzr-info-request-error">{infoRequestError}</span>}
            </div>
          )}
          {sentInfoRequest && sentInfoRequest.status === 'pending' && (needsEmail || needsPhone) && (
            <div className="bzr-info-request bzr-info-request-pending">
              <span className="bzr-info-request-text">🔒 Waiting for {form.customerName || 'this member'} to accept your info request…</span>
            </div>
          )}
          {sentInfoRequest && sentInfoRequest.status === 'declined' && (needsEmail || needsPhone) && (
            <div className="bzr-info-request bzr-info-request-declined">
              <span className="bzr-info-request-text">{form.customerName || 'This member'} declined to share that info.</span>
            </div>
          )}

          <div className="bzr-field">
            <label className="bzr-field-label">Items</label>
            <div className="bzr-item-summary-list">
              {form.items.length === 0 && (
                <div className="bzr-view-empty">No items yet — add one below.</div>
              )}
              {form.items.map(it => {
                const details = [it.flavor, it.filling, it.frosting, it.size].filter(Boolean).join(' · ');
                return (
                  <div key={it.id} className="bzr-item-summary-row">
                    <button type="button" className="bzr-item-summary-main" onClick={() => openEditItem(it)}>
                      <span className="bzr-item-summary-name">
                        {it.qty}× {it.productName || 'Select a product…'}{it.tierLabel ? ` — ${it.tierLabel}` : ''}
                      </span>
                      {details && <span className="bzr-item-summary-sub">{details}</span>}
                      {it.notes && <span className="bzr-item-summary-sub">{it.notes}</span>}
                    </button>
                    <span className="bzr-item-summary-price">{currency((Number(it.unitPrice) || 0) * (Number(it.qty) || 0))}</span>
                    <button type="button" className="bzr-icon-btn danger" title="Remove" onClick={() => removeItem(it.id)}>🗑</button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="bzr-btn tiny" onClick={() => openAddItem()}>＋ Add Item</button>
          </div>

          <div className="bzr-field">
            <label className="bzr-field-label">Fulfillment method</label>
            <div className="bzr-segmented">
              <button type="button" className={form.fulfillmentMethod === '' ? 'is-active' : ''} onClick={() => set('fulfillmentMethod', '')}>—</button>
              {FULFILLMENT_OPTIONS.map(f => (
                <button key={f.value} type="button" className={form.fulfillmentMethod === f.value ? 'is-active' : ''} onClick={() => set('fulfillmentMethod', f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bzr-field-row">
            <div className="bzr-field grow">
              <label className="bzr-field-label">Due date</label>
              <input type="date" className="bzr-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
            <div className="bzr-field grow">
              <label className="bzr-field-label">Due time</label>
              <input type="time" className="bzr-input" value={form.dueTime} onChange={e => set('dueTime', e.target.value)} />
            </div>
          </div>

          {(form.fulfillmentMethod === 'delivery' || form.fulfillmentMethod === 'shipping') && (
            <div className="bzr-field">
              <label className="bzr-field-label">Delivery / shipping address</label>
              <textarea className="bzr-textarea" rows={2} value={form.customerAddress} onChange={e => set('customerAddress', e.target.value)} />
            </div>
          )}

          {isFoodBusiness && (
            <div className="bzr-field">
              <label className="bzr-field-label">Custom message</label>
              <input className="bzr-input" value={form.customMessage} onChange={e => set('customMessage', e.target.value)} placeholder="e.g. Happy Birthday, Sam!" />
            </div>
          )}

          <div className="bzr-field-row">
            <div className="bzr-field">
              <label className="bzr-field-label">Rush fee</label>
              <input type="number" step="0.01" min="0" className="bzr-input narrow" value={form.rushFee} onChange={e => set('rushFee', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="bzr-field">
              <label className="bzr-field-label">Discount</label>
              <input type="number" step="0.01" min="0" className="bzr-input narrow" value={form.discount} onChange={e => set('discount', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="bzr-field">
              <label className="bzr-field-label">Tax</label>
              <input type="number" step="0.01" min="0" className="bzr-input narrow" value={form.tax} onChange={e => set('tax', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="bzr-field-row">
            <div className="bzr-field grow">
              <label className="bzr-field-label">Payment status</label>
              <select className="bzr-select" value={form.paymentStatus} onChange={e => set('paymentStatus', e.target.value)}>
                {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="bzr-field">
              <label className="bzr-field-label">Amount paid</label>
              <input type="number" step="0.01" min="0" className="bzr-input narrow" value={form.amountPaid} onChange={e => set('amountPaid', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="bzr-field">
            <label className="bzr-field-label">Notes</label>
            <textarea className="bzr-textarea" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="bzr-summary">
            <div className="bzr-summary-row"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
            <div className="bzr-summary-row"><span>Total</span><strong>{currency(total)}</strong></div>
            <div className="bzr-summary-row"><span>Balance due</span><strong className={balance > 0.001 ? 'due' : ''}>{currency(balance)}</strong></div>
          </div>
        </div>

        <div className="bzr-modal-actions">
          <button type="button" className="bzr-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="bzr-btn primary" onClick={submit} disabled={!form.customerName.trim() || saving}>
            {saving ? 'Saving…' : order ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>

    {itemModal && (
      <ItemCustomizeModal
        item={itemModal.item}
        isNew={itemModal.isNew}
        products={products}
        isFoodBusiness={isFoodBusiness}
        onSave={saveItem}
        onClose={closeItemModal}
      />
    )}
    </>
  );
}

/* ── Item customize popup (add / edit a single line item) ───────── */
function ItemCustomizeModal({ item, isNew, products, isFoodBusiness, onSave, onClose }) {
  const [data, setData] = useState(item);
  const product = products.find(p => p.id === data.productId);
  const tiers = tierOptionsFor(product);

  function set(field, value) { setData(d => ({ ...d, [field]: value })); }

  function chooseProduct(productId) {
    const p = products.find(x => x.id === productId);
    const tier = tierOptionsFor(p)[0];
    setData(d => ({
      ...d,
      productId: p?.id || null,
      productName: p?.name || '',
      tierLabel: tier?.label || '',
      unitPrice: tier?.price ?? 0,
      flavor: '', filling: '', frosting: '', size: '',
    }));
  }
  function chooseTier(tierLabel) {
    const tier = tiers.find(t => t.label === tierLabel);
    setData(d => ({ ...d, tierLabel, unitPrice: tier?.price ?? 0 }));
  }

  const lineTotal = (Number(data.unitPrice) || 0) * (Number(data.qty) || 0);

  return (
    <div className="bzr-modal-backdrop" onClick={onClose}>
      <div className="bzr-modal narrow" onClick={e => e.stopPropagation()}>
        <div className="bzr-modal-head">
          <h2>{isNew ? 'Add Item' : 'Edit Item'}</h2>
          <button type="button" className="bzr-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzr-modal-body">
          <div className="bzr-field-row">
            <div className="bzr-field grow">
              <label className="bzr-field-label">Product</label>
              <select className="bzr-select" value={data.productId || ''} onChange={e => chooseProduct(e.target.value)}>
                <option value="">Select a product…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
            <div className="bzr-field">
              <label className="bzr-field-label">Qty</label>
              <input
                type="number" min="1" step="1"
                className="bzr-input narrow"
                value={data.qty}
                onChange={e => set('qty', parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          {tiers.length > 0 && (
            <div className="bzr-field-row">
              <div className="bzr-field grow">
                <label className="bzr-field-label">Tier</label>
                <select className="bzr-select" value={data.tierLabel} onChange={e => chooseTier(e.target.value)}>
                  {tiers.map(t => <option key={t.id} value={t.label}>{t.label} — {currency(t.price)}</option>)}
                </select>
              </div>
              <div className="bzr-field">
                <label className="bzr-field-label">Unit price</label>
                <input
                  type="number" step="0.01" min="0"
                  className="bzr-input narrow"
                  value={data.unitPrice}
                  onChange={e => set('unitPrice', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {isFoodBusiness && product && (product.flavorOptions?.length || product.fillingOptions?.length || product.frostingOptions?.length || product.sizeOptions?.length) > 0 && (
            <div className="bzr-field-row wrap">
              {product.flavorOptions?.length > 0 && (
                <div className="bzr-field grow">
                  <label className="bzr-field-label">Flavor</label>
                  <select className="bzr-select" value={data.flavor} onChange={e => set('flavor', e.target.value)}>
                    <option value="">—</option>
                    {product.flavorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              {product.fillingOptions?.length > 0 && (
                <div className="bzr-field grow">
                  <label className="bzr-field-label">Filling</label>
                  <select className="bzr-select" value={data.filling} onChange={e => set('filling', e.target.value)}>
                    <option value="">—</option>
                    {product.fillingOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              {product.frostingOptions?.length > 0 && (
                <div className="bzr-field grow">
                  <label className="bzr-field-label">Frosting</label>
                  <select className="bzr-select" value={data.frosting} onChange={e => set('frosting', e.target.value)}>
                    <option value="">—</option>
                    {product.frostingOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              {product.sizeOptions?.length > 0 && (
                <div className="bzr-field grow">
                  <label className="bzr-field-label">Size</label>
                  <select className="bzr-select" value={data.size} onChange={e => set('size', e.target.value)}>
                    <option value="">—</option>
                    {product.sizeOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="bzr-field">
            <label className="bzr-field-label">Note</label>
            <textarea
              className="bzr-textarea"
              rows={2}
              value={data.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="e.g. no nuts, extra frosting"
            />
          </div>

          <div className="bzr-item-modal-total">Line total <strong>{currency(lineTotal)}</strong></div>
        </div>

        <div className="bzr-modal-actions">
          <button type="button" className="bzr-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="bzr-btn primary" disabled={!data.productId} onClick={() => onSave(data)}>
            {isNew ? '＋ Add to Order' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order view (read-only, opened via double-click) ────────────── */
function OrderView({ order, onEdit, onClose }) {
  const { subtotal, total, balance } = orderTotals(order);
  const fulfillment = FULFILLMENT_OPTIONS.find(f => f.value === order.fulfillmentMethod);
  const isPast = isPastOrder(order);

  return (
    <div className="bzr-modal-backdrop" onClick={onClose}>
      <div className="bzr-modal" onClick={e => e.stopPropagation()}>
        <div className="bzr-modal-head">
          <h2>{order.customerName || 'Unnamed customer'}</h2>
          <div className="bzr-view-head-actions">
            {!isPast && <button type="button" className="bzr-icon-btn" title="Edit" onClick={onEdit}>✏️</button>}
            <button type="button" className="bzr-icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="bzr-modal-body">
          <div className="bzr-view-pills">
            {!(isPast && order.status === 'new') && (
              <span className={`bzr-status-pill status-${order.status}`}>{statusLabel(order.status)}</span>
            )}
            <span className={`bzr-pay-pill pay-${order.paymentStatus}`}>{paymentLabel(order.paymentStatus)}</span>
          </div>

          <div className="bzr-view-grid">
            {order.customerPhone && <ViewField label="Phone" value={order.customerPhone} />}
            {order.customerEmail && <ViewField label="Email" value={order.customerEmail} />}
            {order.customerAddress && <ViewField label="Address" value={order.customerAddress} />}
            {fulfillment && <ViewField label="Fulfillment" value={fulfillment.label} />}
            {order.dueDate && <ViewField label="Due" value={`${order.dueDate}${order.dueTime ? ` · ${order.dueTime}` : ''}`} />}
          </div>

          <div className="bzr-field">
            <label className="bzr-field-label">Line items</label>
            <div className="bzr-view-items">
              {(order.items || []).length === 0 && <div className="bzr-view-empty">No items.</div>}
              {(order.items || []).map(it => {
                const details = [it.flavor, it.filling, it.frosting, it.size].filter(Boolean).join(' · ');
                return (
                  <div key={it.id} className="bzr-view-item">
                    <div className="bzr-view-item-main">
                      <span>{it.qty}× {it.productName || 'Item'}{it.tierLabel ? ` — ${it.tierLabel}` : ''}</span>
                      <span>{currency((Number(it.unitPrice) || 0) * (Number(it.qty) || 0))}</span>
                    </div>
                    {details && <div className="bzr-view-item-sub">{details}</div>}
                    {it.notes && <div className="bzr-view-item-sub">{it.notes}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {order.customMessage && <ViewField label="Custom message" value={order.customMessage} block />}
          {order.notes && <ViewField label="Notes" value={order.notes} block />}

          <div className="bzr-summary">
            <div className="bzr-summary-row"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
            {order.rushFee > 0 && <div className="bzr-summary-row"><span>Rush fee</span><span>{currency(order.rushFee)}</span></div>}
            {order.discount > 0 && <div className="bzr-summary-row"><span>Discount</span><span>-{currency(order.discount)}</span></div>}
            {order.tax > 0 && <div className="bzr-summary-row"><span>Tax</span><span>{currency(order.tax)}</span></div>}
            <div className="bzr-summary-row"><span>Total</span><strong>{currency(total)}</strong></div>
            <div className="bzr-summary-row"><span>Amount paid</span><span>{currency(order.amountPaid)}</span></div>
            <div className="bzr-summary-row"><span>Balance due</span><strong className={balance > 0.001 ? 'due' : ''}>{currency(balance)}</strong></div>
          </div>
        </div>

        <div className="bzr-modal-actions">
          <button type="button" className="bzr-btn" onClick={onClose}>Close</button>
          {!isPast && <button type="button" className="bzr-btn primary" onClick={onEdit}>✏️ Edit Order</button>}
        </div>
      </div>
    </div>
  );
}

function ViewField({ label, value, block }) {
  return (
    <div className={`bzr-view-field${block ? ' block' : ''}`}>
      <span className="bzr-view-field-label">{label}</span>
      <span className="bzr-view-field-value">{value}</span>
    </div>
  );
}
