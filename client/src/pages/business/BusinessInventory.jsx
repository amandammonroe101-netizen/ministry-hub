import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import {
  businessInventoryService, defaultInventoryItem, INVENTORY_CATEGORIES,
} from '../../services/businessInventoryService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './BusinessInventory.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Inventory (V1).

   Unlike Customers/Orders, there's no source of truth to derive
   this from — how much flour is on the shelf isn't implied by
   anything else in the app — so every item here is manually
   entered and adjusted. See businessInventoryService.js.
   ───────────────────────────────────────────────────────────── */

function currency(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

function categoryLabel(value) {
  return INVENTORY_CATEGORIES.find(c => c.value === value)?.label || 'Other';
}

function isLowStock(item) {
  return item.lowStockThreshold != null && Number(item.quantity) <= Number(item.lowStockThreshold);
}

export default function BusinessInventory() {
  const { businessId } = useParams();
  const { profile, avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState(null); // item being edited, or {} for a new one
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, itemsRes] = await Promise.all([
        businessService.getOne(businessId),
        businessInventoryService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setItems(itemsRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
      .filter(i => !q || [i.name, i.supplier, i.notes].join(' ').toLowerCase().includes(q));
  }, [items, search, categoryFilter]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const lowStockCount = items.filter(isLowStock).length;
    const totalValue = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.costPerUnit) || 0), 0);
    return { totalItems, lowStockCount, totalValue };
  }, [items]);

  async function saveItem(data) {
    try {
      if (data.id && items.some(i => i.id === data.id)) {
        const res = await businessInventoryService.update(businessId, data.id, data);
        setItems(prev => prev.map(i => (i.id === data.id ? res.data.data : i)));
      } else {
        const res = await businessInventoryService.create(businessId, data);
        setItems(prev => [...prev, res.data.data]);
      }
      setEditing(null);
    } catch (e) {
      setError(e?.message || 'Could not save that item.');
    }
  }

  async function adjust(item, delta) {
    try {
      const res = await businessInventoryService.adjustQuantity(businessId, item.id, delta);
      setItems(prev => prev.map(i => (i.id === item.id ? res.data.data : i)));
    } catch (e) {
      setError(e?.message || 'Could not update that quantity.');
    }
  }

  async function removeItem(id) {
    try {
      await businessInventoryService.delete(businessId, id);
      setItems(prev => prev.filter(i => i.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e?.message || 'Could not delete that item.');
    }
  }

  return (
    <BusinessShell
      title="Inventory"
      icon="📋"
      subtitle="Ingredients, packaging, and supplies on hand — quantities, cost per unit, and low-stock alerts."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bzv-root">
        {error && (
          <div className="bzv-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzv-summary-strip">
          <div className="bzv-summary-card">
            <span className="bzv-summary-label">Total Items</span>
            <span className="bzv-summary-value">{summary.totalItems}</span>
          </div>
          <div className={`bzv-summary-card${summary.lowStockCount > 0 ? ' warn' : ''}`}>
            <span className="bzv-summary-label">Low Stock</span>
            <span className="bzv-summary-value">{summary.lowStockCount}</span>
          </div>
          <div className="bzv-summary-card">
            <span className="bzv-summary-label">Inventory Value</span>
            <span className="bzv-summary-value">{currency(summary.totalValue)}</span>
          </div>
        </div>

        <div className="bzv-toolbar">
          <input
            className="bzv-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, supplier, notes…"
          />
          <select className="bzv-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button type="button" className="bzv-btn primary" onClick={() => setEditing({})}>＋ Add Item</button>
        </div>

        {loading ? (
          <div className="bzv-empty">Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div className="bzv-empty">
            <div className="bzv-empty-icon">📋</div>
            <h2>{items.length === 0 ? 'No inventory yet' : 'No items match'}</h2>
            <p>
              {items.length === 0
                ? 'Log ingredients, packaging, and supplies to track what you have on hand.'
                : 'Try a different search or category.'}
            </p>
            {items.length === 0 && (
              <button type="button" className="bzv-btn primary" onClick={() => setEditing({})}>＋ Add Item</button>
            )}
          </div>
        ) : (
          <div className="bzv-list">
            {filtered.map(item => {
              const low = isLowStock(item);
              return (
                <div key={item.id} className={`bzv-row${low ? ' low' : ''}`}>
                  <button type="button" className="bzv-row-main" onClick={() => setEditing(item)}>
                    <div className="bzv-row-top">
                      <span className="bzv-row-name">{item.name || 'Untitled item'}</span>
                      <span className="bzv-category-pill">{categoryLabel(item.category)}</span>
                      {low && <span className="bzv-low-badge">Low Stock</span>}
                    </div>
                    <div className="bzv-row-meta">
                      {item.supplier && <span>{item.supplier}</span>}
                      {item.costPerUnit > 0 && <span>{currency(item.costPerUnit)}/{item.unit || 'unit'}</span>}
                    </div>
                  </button>

                  <div className="bzv-row-qty">
                    <button type="button" className="bzv-qty-btn" onClick={() => adjust(item, -1)} disabled={Number(item.quantity) <= 0}>−</button>
                    <span className="bzv-qty-value">{item.quantity} {item.unit}</span>
                    <button type="button" className="bzv-qty-btn" onClick={() => adjust(item, 1)}>+</button>
                  </div>

                  <div className="bzv-row-value">{currency((Number(item.quantity) || 0) * (Number(item.costPerUnit) || 0))}</div>

                  <div className="bzv-row-actions">
                    <button type="button" className="bzv-icon-btn" title="Edit" onClick={() => setEditing(item)}>✏️</button>
                    {confirmDelete === item.id ? (
                      <>
                        <button type="button" className="bzv-icon-btn danger" title="Confirm delete" onClick={() => removeItem(item.id)}>✓</button>
                        <button type="button" className="bzv-icon-btn" title="Cancel" onClick={() => setConfirmDelete(null)}>✕</button>
                      </>
                    ) : (
                      <button type="button" className="bzv-icon-btn" title="Delete" onClick={() => setConfirmDelete(item.id)}>🗑</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <ItemEditor
          item={editing}
          onSave={saveItem}
          onClose={() => setEditing(null)}
        />
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}

function ItemEditor({ item, onSave, onClose }) {
  const isNew = !item.id;
  const [form, setForm] = useState(() => defaultInventoryItem(item));

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      quantity: Number(form.quantity) || 0,
      costPerUnit: Number(form.costPerUnit) || 0,
      lowStockThreshold: form.lowStockThreshold === '' || form.lowStockThreshold === null ? null : Number(form.lowStockThreshold),
    });
  }

  return (
    <div className="bzv-modal-backdrop" onClick={onClose}>
      <form className="bzv-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="bzv-modal-head">
          <h2>{isNew ? 'Add Item' : 'Edit Item'}</h2>
          <button type="button" className="bzv-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzv-modal-body">
          <div className="bzv-field">
            <label className="bzv-field-label">Name</label>
            <input
              autoFocus
              className="bzv-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. All-purpose flour"
              required
            />
          </div>

          <div className="bzv-field-row wrap">
            <div className="bzv-field grow">
              <label className="bzv-field-label">Category</label>
              <select className="bzv-select" value={form.category} onChange={e => set('category', e.target.value)}>
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="bzv-field grow">
              <label className="bzv-field-label">Supplier</label>
              <input className="bzv-input" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="bzv-field-row wrap">
            <div className="bzv-field">
              <label className="bzv-field-label">Quantity on hand</label>
              <input
                className="bzv-input narrow"
                type="number"
                step="any"
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
              />
            </div>
            <div className="bzv-field">
              <label className="bzv-field-label">Unit</label>
              <input className="bzv-input narrow" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="oz, lb, each…" />
            </div>
            <div className="bzv-field">
              <label className="bzv-field-label">Cost per unit</label>
              <input
                className="bzv-input narrow"
                type="number"
                step="any"
                min="0"
                value={form.costPerUnit}
                onChange={e => set('costPerUnit', e.target.value)}
              />
            </div>
            <div className="bzv-field">
              <label className="bzv-field-label">Low stock at</label>
              <input
                className="bzv-input narrow"
                type="number"
                step="any"
                min="0"
                value={form.lowStockThreshold ?? ''}
                onChange={e => set('lowStockThreshold', e.target.value)}
                placeholder="None"
              />
            </div>
          </div>

          <div className="bzv-field">
            <label className="bzv-field-label">Notes</label>
            <textarea
              className="bzv-notes-input"
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="bzv-modal-actions">
          <button type="button" className="bzv-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="bzv-btn primary">{isNew ? 'Add Item' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
