import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { businessProductService } from '../../services/businessProductService';
import { businessOrderService } from '../../services/businessOrderService';
import { businessInventoryService } from '../../services/businessInventoryService';
import { computeDemand } from '../../services/businessDemandService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './BusinessDemand.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Demand Analysis.

   Nothing is stored here — it's computeDemand() run over Orders,
   Pricing (for ingredients linked to an Inventory item — see
   ProductPricing.jsx), and Inventory's on-hand quantities. Answers
   "how much of each ingredient do my open orders need, do I have
   enough, and which orders are driving that" in one place, instead
   of doing that math by hand from three different pages.
   ───────────────────────────────────────────────────────────── */

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

function currency(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

export default function BusinessDemand() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [onlyShort, setOnlyShort] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, prodRes, orderRes, invRes] = await Promise.all([
        businessService.getOne(businessId),
        businessProductService.getAll(businessId),
        businessOrderService.getAll(businessId),
        businessInventoryService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setProducts(prodRes.data.data || []);
      setOrders(orderRes.data.data || []);
      setInventoryItems(invRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load demand analysis.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  const demand = useMemo(
    () => computeDemand({ products, orders, inventoryItems }),
    [products, orders, inventoryItems]
  );

  const filtered = useMemo(
    () => (onlyShort ? demand.filter(d => d.shortfall > 0) : demand),
    [demand, onlyShort]
  );

  const openOrderCount = useMemo(() => {
    const ids = new Set();
    demand.forEach(d => d.orders.forEach(o => ids.add(o.order.id)));
    return ids.size;
  }, [demand]);

  const summary = useMemo(() => {
    const shortItems = demand.filter(d => d.shortfall > 0);
    const restockCost = shortItems.reduce((sum, d) => sum + d.shortfall * (Number(d.item.costPerUnit) || 0), 0);
    return { trackedItems: demand.length, shortCount: shortItems.length, restockCost };
  }, [demand]);

  function goToOrder(orderId) {
    navigate(`/business/${businessId}/orders?viewOrder=${orderId}`);
  }

  return (
    <BusinessShell
      title="Demand Analysis"
      icon="🧮"
      subtitle="How much of each ingredient your open orders need, what's on hand, and what's short — pulled straight from Orders and the ingredient links in Pricing."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bzd-root">
        {error && (
          <div className="bzd-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzd-summary-strip">
          <div className="bzd-summary-card">
            <span className="bzd-summary-label">Open Orders Analyzed</span>
            <span className="bzd-summary-value">{openOrderCount}</span>
          </div>
          <div className="bzd-summary-card">
            <span className="bzd-summary-label">Ingredients Tracked</span>
            <span className="bzd-summary-value">{summary.trackedItems}</span>
          </div>
          <div className={`bzd-summary-card${summary.shortCount > 0 ? ' warn' : ''}`}>
            <span className="bzd-summary-label">Items to Restock</span>
            <span className="bzd-summary-value">{summary.shortCount}</span>
          </div>
          <div className={`bzd-summary-card${summary.restockCost > 0 ? ' warn' : ''}`}>
            <span className="bzd-summary-label">Est. Restock Cost</span>
            <span className="bzd-summary-value">{currency(summary.restockCost)}</span>
          </div>
        </div>

        <div className="bzd-toolbar">
          <label className="bzd-check-row">
            <input type="checkbox" checked={onlyShort} onChange={e => setOnlyShort(e.target.checked)} />
            Only show items short on stock
          </label>
        </div>

        {loading ? (
          <div className="bzd-empty">Loading demand analysis…</div>
        ) : demand.length === 0 ? (
          <div className="bzd-empty">
            <div className="bzd-empty-icon">🧮</div>
            <h2>Nothing to analyze yet</h2>
            <p>
              Link an ingredient on the{' '}
              <button type="button" className="bzd-link-btn" onClick={() => navigate(`/business/${businessId}/pricing`)}>Pricing</button> page to an{' '}
              <button type="button" className="bzd-link-btn" onClick={() => navigate(`/business/${businessId}/inventory`)}>Inventory</button> item, then place an order that uses it —
              demand shows up here automatically.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bzd-empty">
            <div className="bzd-empty-icon">✅</div>
            <h2>Fully stocked</h2>
            <p>Every tracked ingredient has enough on hand for your open orders.</p>
          </div>
        ) : (
          <div className="bzd-list">
            {filtered.map(d => {
              const expanded = expandedId === d.item.id;
              const short = d.shortfall > 0;
              return (
                <div key={d.item.id} className={`bzd-row${short ? ' short' : ''}`}>
                  <button type="button" className="bzd-row-main" onClick={() => setExpandedId(expanded ? null : d.item.id)}>
                    <div className="bzd-row-top">
                      <span className="bzd-caret">{expanded ? '▾' : '▸'}</span>
                      <span className="bzd-row-name">{d.item.name || 'Untitled item'}</span>
                      {short ? (
                        <span className="bzd-short-badge">Short {fmtQty(d.shortfall)} {d.item.unit}</span>
                      ) : (
                        <span className="bzd-ok-badge">Enough on hand</span>
                      )}
                    </div>
                    <div className="bzd-row-meta">
                      <span>Needed: <strong>{fmtQty(d.needed)} {d.item.unit}</strong></span>
                      <span>On Hand: <strong>{fmtQty(d.onHand)} {d.item.unit}</strong></span>
                      <span>{d.orders.length} open order{d.orders.length === 1 ? '' : 's'}</span>
                    </div>
                  </button>

                  {short && (
                    <div className="bzd-row-cost">{currency(d.shortfall * (Number(d.item.costPerUnit) || 0))}</div>
                  )}

                  {expanded && (
                    <div className="bzd-orders-list">
                      {d.orders.map(({ order, qty }) => (
                        <button
                          type="button"
                          key={order.id}
                          className="bzd-order-row"
                          onClick={() => goToOrder(order.id)}
                        >
                          <span className="bzd-order-customer">{order.customerName || 'Unnamed customer'}</span>
                          <span className="bzd-order-meta">{(order.created_at || '').slice(0, 10) || '—'}</span>
                          <span className="bzd-order-qty">{fmtQty(qty)} {d.item.unit} needed</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}
