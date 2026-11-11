/* Product Catalog Page Settings — the body rendered inside the
   Profile modal's "Page Settings" tab on the Product Catalog page.

   Owns binder management (add / rename / delete). Filtering by
   binder stays on the catalog page itself (ProductCatalog.jsx) —
   this tab is just where the binders themselves get created and
   edited, matching the Prayer/DayPlanner Page Settings pattern of
   keeping list-management out of the main toolbar. */

import { useState } from 'react';
import { businessService } from '../../services/businessService';
import { businessProductService } from '../../services/businessProductService';
import './ProductCatalog.css';

const BINDER_COLORS = ['#059669', '#d97706', '#0ea5e9', '#a855f7', '#f43f5e', '#65a30d', '#d4a537', '#2dd4bf'];

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export default function ProductCatalogPageSettings({
  businessId, business, setBusiness, products, setProducts, setError,
}) {
  const binders = business?.productBinders || [];

  const [newBinderName, setNewBinderName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function persistBinders(next) {
    setBusiness(prev => (prev ? { ...prev, productBinders: next } : prev));
    try {
      await businessService.update(businessId, { productBinders: next });
    } catch (e) {
      setError?.(e?.message || 'Could not save binders.');
    }
  }

  function addBinder() {
    const name = newBinderName.trim();
    if (!name) return;
    const binder = { id: uid(), name, color: BINDER_COLORS[binders.length % BINDER_COLORS.length] };
    persistBinders([...binders, binder]);
    setNewBinderName('');
  }

  function startRename(b) {
    setRenamingId(b.id);
    setRenameValue(b.name);
    setConfirmDeleteId(null);
  }

  function submitRename() {
    const name = renameValue.trim();
    if (name) persistBinders(binders.map(b => (b.id === renamingId ? { ...b, name } : b)));
    setRenamingId(null);
  }

  async function deleteBinder(id) {
    setConfirmDeleteId(null);
    persistBinders(binders.filter(b => b.id !== id));
    const affected = products.filter(p => p.binderId === id);
    setProducts(prev => prev.map(p => (p.binderId === id ? { ...p, binderId: null } : p)));
    try {
      await Promise.all(affected.map(p => businessProductService.update(businessId, p.id, { binderId: null })));
    } catch (e) {
      setError?.(e?.message || 'Could not update products in that binder.');
    }
  }

  return (
    <div className="pm-body">
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">🗂 Product Binders</div>
        <div className="pm-ps-section-sub">
          Organize this business's catalog into named sections — e.g. "Baked Goods,"
          "Custom Orders," "Digital Downloads." Each product can belong to at most one
          binder. Deleting a binder never deletes its products — they just become unsorted.
        </div>

        <div className="pcps-add-row">
          <input
            className="bzc-binder-add-input pcps-add-input"
            value={newBinderName}
            onChange={e => setNewBinderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBinder(); } }}
            placeholder="New binder name"
          />
          <button type="button" className="bzc-btn tiny" onClick={addBinder}>＋ Add</button>
        </div>

        {binders.length === 0 ? (
          <div className="pm-ps-empty">No binders yet — add one above to start organizing your catalog.</div>
        ) : (
          <div className="pcps-list">
            {binders.map(b => {
              const count = products.filter(p => p.binderId === b.id).length;
              return (
                <div key={b.id} className="pcps-row">
                  {renamingId === b.id ? (
                    <>
                      <input
                        autoFocus
                        className="bzc-binder-add-input pcps-add-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                      <button type="button" className="bzc-btn tiny" onClick={submitRename}>Save</button>
                      <button type="button" className="bzc-btn tiny" onClick={() => setRenamingId(null)}>Cancel</button>
                    </>
                  ) : confirmDeleteId === b.id ? (
                    <>
                      <span className="pcps-confirm-text">
                        Delete "{b.name}"? {count} product{count === 1 ? '' : 's'} will become unsorted.
                      </span>
                      <button type="button" className="bzc-btn tiny danger" onClick={() => deleteBinder(b.id)}>Delete</button>
                      <button type="button" className="bzc-btn tiny" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="bzc-binder-pill is-active pcps-pill" style={{ '--binder-color': b.color }}>
                        {b.name}
                      </span>
                      <span className="pcps-count">{count} product{count === 1 ? '' : 's'}</span>
                      <button type="button" className="bzc-btn tiny" onClick={() => startRename(b)}>Rename</button>
                      <button type="button" className="bzc-btn tiny danger" onClick={() => setConfirmDeleteId(b.id)}>Delete</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
