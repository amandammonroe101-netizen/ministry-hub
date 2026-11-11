import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { businessProductService } from '../../services/businessProductService';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { auth } from '../../lib/firebase';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import ProductCatalogPageSettings from './ProductCatalogPageSettings';
import './ProductCatalog.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Product Catalog (the first real Business
   page). Every product this business sells: photos, pricing with
   multiple tiers, cost of goods, bundles, ingredients, digital vs.
   physical, descriptions, tags, and active/inactive status.

   Data lives in businessProductService, scoped to the current
   :businessId (see businessConfig.js for the multi-business route
   shape). Photos upload to Firebase Storage under
   users/{uid}/business-products/ (falls back to inline data URLs
   automatically when Storage is unreachable — see userStorage.js).

   "Binders" are member-defined top-level catalog sections (e.g.
   "Baked Goods", "Custom Orders", "Digital Downloads") — each
   product belongs to at most one. They live on the business doc
   itself (business.productBinders, see businessService.js) since
   they're catalog-wide organization rather than per-product data;
   a product just stores the binderId it belongs to. This page only
   *filters* by binder — adding, renaming, and deleting binders
   lives in Page Settings (Profile circle → 🗂 Page Settings), see
   ProductCatalogPageSettings.jsx.
   ───────────────────────────────────────────────────────────── */

const PHOTO_COLLECTION = 'business-products';

/* Food & fulfillment details only make sense for food-type
   businesses — gated on the business's category (see
   BUSINESS_CATEGORIES in BusinessOverview.jsx). */
const FOOD_CATEGORIES = ['bakery', 'online-bakery', 'cafe', 'restaurant'];
const ALLERGEN_OPTIONS = ['Milk', 'Eggs', 'Peanuts', 'Tree Nuts', 'Soy', 'Wheat/Gluten', 'Sesame', 'Shellfish', 'Fish'];
const DIETARY_OPTIONS = ['Vegan', 'Vegetarian', 'Gluten-Free', 'Keto', 'Sugar-Free', 'Nut-Free', 'Kosher', 'Halal'];
const FULFILLMENT_OPTIONS = [
  { value: 'pickup', label: 'Local Pickup' },
  { value: 'delivery', label: 'Local Delivery' },
  { value: 'shipping', label: 'Shipping' },
];

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function currency(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

function priceRange(product) {
  if (product.isBundle) return currency(product.bundlePrice);
  const prices = (product.priceTiers || []).map(t => Number(t.price) || 0);
  if (!prices.length) return currency(0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? currency(min) : `${currency(min)}–${currency(max)}`;
}

export default function ProductCatalog() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState('profile');

  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [editing, setEditing] = useState(null); // product object, 'new', or null
  const [viewing, setViewing] = useState(null); // product object or null (read-only view)
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [binderFilter, setBinderFilter] = useState('all'); // 'all' | 'none' | binderId

  const binders = business?.productBinders || [];
  const isFoodBusiness = FOOD_CATEGORIES.includes(business?.category);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, prodRes] = await Promise.all([
        businessService.getOne(businessId),
        businessProductService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setProducts(prodRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load the product catalog.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  /* Binders are managed from Page Settings (see
     ProductCatalogPageSettings), which can rename or delete one out
     from under this page while it's open. Fall back to "All" so the
     filter never points at a binder that no longer exists. */
  useEffect(() => {
    if (binderFilter === 'all' || binderFilter === 'none') return;
    if (!binders.some(b => b.id === binderFilter)) setBinderFilter('all');
  }, [binders, binderFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (binderFilter === 'none' && p.binderId) return false;
      if (binderFilter !== 'all' && binderFilter !== 'none' && p.binderId !== binderFilter) return false;
      if (!q) return true;
      const hay = [p.name, p.description, ...(p.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [products, search, statusFilter, typeFilter, binderFilter]);

  function openNew() { setEditing('new'); }
  function openView(p) { setViewing(p); }
  function closeView() { setViewing(null); }
  function openEdit(p) { setViewing(null); setEditing(p); }
  function closeEditor() { setEditing(null); }
  function orderProduct(p) { navigate(`/business/${businessId}/orders?newOrderForProduct=${p.id}`); }

  async function saveProduct(data) {
    try {
      if (editing === 'new') {
        const res = await businessProductService.create(businessId, data);
        setProducts(prev => [...prev, res.data.data]);
      } else {
        const res = await businessProductService.update(businessId, editing.id, data);
        setProducts(prev => prev.map(p => (p.id === editing.id ? res.data.data : p)));
      }
      setEditing(null);
    } catch (e) {
      setError(e?.message || 'Could not save that product.');
    }
  }

  async function duplicateProduct(p) {
    try {
      const { id, created_at, updated_at, ...rest } = p;
      const res = await businessProductService.create(businessId, { ...rest, name: `${p.name} (Copy)` });
      setProducts(prev => [...prev, res.data.data]);
    } catch (e) {
      setError(e?.message || 'Could not duplicate that product.');
    }
  }

  async function toggleActive(p) {
    setProducts(prev => prev.map(x => (x.id === p.id ? { ...x, active: !x.active } : x)));
    try {
      await businessProductService.update(businessId, p.id, { active: !p.active });
    } catch (e) {
      setError(e?.message || 'Could not update that product.');
      load();
    }
  }

  async function deleteProduct(id) {
    setConfirmDelete(null);
    setProducts(prev => prev.filter(p => p.id !== id));
    try {
      await businessProductService.delete(businessId, id);
    } catch (e) {
      setError(e?.message || 'Could not delete that product.');
      load();
    }
  }

  return (
    <BusinessShell
      title="Product Catalog"
      icon="🛍"
      subtitle="Everything this business sells — photos, pricing, cost of goods, ingredients, and bundles."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
      actions={
        <button type="button" className="bzc-btn primary" onClick={openNew}>＋ New Product</button>
      }
    >
      <div className="bzc-root">
        {error && (
          <div className="bzc-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div className="bzc-toolbar">
          <input
            className="bzc-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products, tags, descriptions…"
          />
          <select className="bzc-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <select className="bzc-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="physical">Physical</option>
            <option value="digital">Digital</option>
          </select>
        </div>

        <div className="bzc-binders">
          <button
            type="button"
            className={`bzc-binder-pill${binderFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setBinderFilter('all')}
          >
            All Products
          </button>
          {binders.length > 0 && (
            <button
              type="button"
              className={`bzc-binder-pill${binderFilter === 'none' ? ' is-active' : ''}`}
              onClick={() => setBinderFilter('none')}
            >
              Unsorted
            </button>
          )}
          {binders.map(b => (
            <button
              key={b.id}
              type="button"
              className={`bzc-binder-pill${binderFilter === b.id ? ' is-active' : ''}`}
              style={{ '--binder-color': b.color }}
              onClick={() => setBinderFilter(b.id)}
            >
              {b.name}
            </button>
          ))}
          <button
            type="button"
            className="bzc-binder-pill manage"
            onClick={() => { setProfileInitialTab('page'); setShowProfile(true); }}
            title="Add, rename, or delete binders from Page Settings"
          >
            🗂 Manage Binders
          </button>
        </div>

        {loading ? (
          <div className="bzc-empty">Loading catalog…</div>
        ) : filtered.length === 0 ? (
          <div className="bzc-empty">
            <div className="bzc-empty-icon">🛍</div>
            <h2>{products.length === 0 ? 'No products yet' : 'No products match'}</h2>
            <p>
              {products.length === 0
                ? "Add your first product to start building this business's catalog."
                : 'Try a different search or filter.'}
            </p>
            {products.length === 0 && (
              <button type="button" className="bzc-btn primary" onClick={openNew}>＋ New Product</button>
            )}
          </div>
        ) : (
          <div className="bzc-grid">
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                binder={binders.find(b => b.id === p.binderId)}
                onOpen={() => openView(p)}
                onEdit={() => openEdit(p)}
                onOrder={() => orderProduct(p)}
                onDuplicate={() => duplicateProduct(p)}
                onToggleActive={() => toggleActive(p)}
                onDeleteRequest={() => setConfirmDelete(p.id)}
                confirmingDelete={confirmDelete === p.id}
                onConfirmDelete={() => deleteProduct(p.id)}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <ProductView
          product={viewing}
          binder={binders.find(b => b.id === viewing.binderId)}
          allProducts={products}
          isFoodBusiness={isFoodBusiness}
          onEdit={() => openEdit(viewing)}
          onOrder={() => orderProduct(viewing)}
          onClose={closeView}
        />
      )}

      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          allProducts={products}
          binders={binders}
          isFoodBusiness={isFoodBusiness}
          onSave={saveProduct}
          onClose={closeEditor}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => { setShowProfile(false); setProfileInitialTab('profile'); }}
        initialTab={profileInitialTab}
        pageTabLabel="🗂 Page Settings"
        pageSettings={
          <ProductCatalogPageSettings
            businessId={businessId}
            business={business}
            setBusiness={setBusiness}
            products={products}
            setProducts={setProducts}
            setError={setError}
          />
        }
      />
    </BusinessShell>
  );
}

/* ── Catalog card ─────────────────────────────────────────────── */
function ProductCard({
  product, binder, onOpen, onEdit, onOrder, onDuplicate, onToggleActive,
  onDeleteRequest, confirmingDelete, onConfirmDelete, onCancelDelete,
}) {
  const cover = product.photos?.[0]?.url;
  return (
    <div className={`bzc-card${product.active ? '' : ' is-inactive'}`}>
      <button type="button" className="bzc-card-media" onClick={onOpen} onDoubleClick={onEdit} title="Click to view · double-click to edit">
        {cover
          ? <img src={cover} alt={product.name} />
          : <span className="bzc-card-media-fallback">{product.type === 'digital' ? '💾' : '📦'}</span>}
        {product.isBundle && <span className="bzc-badge bundle">Bundle</span>}
        {!product.active && <span className="bzc-badge inactive">Inactive</span>}
      </button>
      <div className="bzc-card-body">
        {binder && (
          <span className="bzc-card-binder" style={{ '--binder-color': binder.color }}>{binder.name}</span>
        )}
        <button type="button" className="bzc-card-name" onClick={onOpen} onDoubleClick={onEdit}>{product.name}</button>
        <div className="bzc-card-price">{priceRange(product)}</div>
        {product.tags?.length > 0 && (
          <div className="bzc-card-tags">
            {product.tags.slice(0, 4).map(t => <span key={t} className="bzc-tag">{t}</span>)}
            {product.tags.length > 4 && <span className="bzc-tag more">+{product.tags.length - 4}</span>}
          </div>
        )}
      </div>
      {confirmingDelete ? (
        <div className="bzc-card-confirm">
          <span>Delete this product?</span>
          <button type="button" className="bzc-btn tiny danger" onClick={onConfirmDelete}>Delete</button>
          <button type="button" className="bzc-btn tiny" onClick={onCancelDelete}>Cancel</button>
        </div>
      ) : (
        <div className="bzc-card-actions">
          <button type="button" className="bzc-icon-btn" title="Edit" onClick={onEdit}>✏️</button>
          <button type="button" className="bzc-icon-btn" title="Order this product" onClick={onOrder}>🧾</button>
          <button
            type="button"
            className="bzc-icon-btn"
            title={product.active ? 'Mark inactive' : 'Mark active'}
            onClick={onToggleActive}
          >
            {product.active ? '⏸' : '▶️'}
          </button>
          <button type="button" className="bzc-icon-btn" title="Duplicate" onClick={onDuplicate}>⧉</button>
          <button type="button" className="bzc-icon-btn danger" title="Delete" onClick={onDeleteRequest}>🗑</button>
        </div>
      )}
    </div>
  );
}

/* ── Reusable tag-style multi-value field (type + Enter to add,
   chip with ✕ to remove) — used for the Customization pickers. ── */
function TagListField({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');

  function add() {
    const t = input.trim();
    if (!t || (values || []).includes(t)) { setInput(''); return; }
    onChange([...(values || []), t]);
    setInput('');
  }
  function remove(t) { onChange((values || []).filter(x => x !== t)); }

  return (
    <>
      <div className="bzc-tag-input-row">
        <input
          className="bzc-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button type="button" className="bzc-btn tiny" onClick={add}>Add</button>
      </div>
      {(values || []).length > 0 && (
        <div className="bzc-tag-chips">
          {values.map(t => (
            <span key={t} className="bzc-tag">
              {t} <button type="button" onClick={() => remove(t)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Editor (create / edit) ──────────────────────────────────── */
const emptyForm = () => ({
  name: '',
  description: '',
  type: 'physical',
  binderId: null,
  tags: [],
  photos: [],
  priceTiers: [{ id: uid(), label: 'Retail', price: 0, qty: 1, ingredients: [] }],
  ingredients: [],
  isBundle: false,
  bundleProductIds: [],
  bundlePrice: 0,
  allergens: [],
  dietaryTags: [],
  leadTime: '',
  shelfLife: '',
  storageInstructions: '',
  servings: '',
  fulfillmentMethods: [],
  minOrderQty: null,
  seasonal: false,
  seasonalWindow: '',
  flavorOptions: [],
  fillingOptions: [],
  frostingOptions: [],
  sizeOptions: [],
  allowsCustomMessage: false,
  rushFee: 0,
  active: true,
});

function ProductEditor({ product, allProducts, binders, isFoodBusiness, onSave, onClose }) {
  const [form, setForm] = useState(() => (product ? {
    name:             product.name || '',
    description:      product.description || '',
    type:             product.type || 'physical',
    binderId:         product.binderId ?? null,
    tags:             product.tags || [],
    photos:           product.photos || [],
    priceTiers:       product.priceTiers?.length ? product.priceTiers : [{ id: uid(), label: 'Retail', price: 0, qty: 1, ingredients: [] }],
    ingredients:      product.ingredients || [],
    isBundle:         !!product.isBundle,
    bundleProductIds: product.bundleProductIds || [],
    bundlePrice:      product.bundlePrice ?? 0,
    allergens:            product.allergens || [],
    dietaryTags:          product.dietaryTags || [],
    leadTime:             product.leadTime || '',
    shelfLife:            product.shelfLife || '',
    storageInstructions:  product.storageInstructions || '',
    servings:             product.servings || '',
    fulfillmentMethods:   product.fulfillmentMethods || [],
    minOrderQty:          product.minOrderQty ?? null,
    seasonal:             product.seasonal ?? false,
    seasonalWindow:       product.seasonalWindow || '',
    flavorOptions:        product.flavorOptions || [],
    fillingOptions:       product.fillingOptions || [],
    frostingOptions:      product.frostingOptions || [],
    sizeOptions:          product.sizeOptions || [],
    allowsCustomMessage:  product.allowsCustomMessage ?? false,
    rushFee:              product.rushFee ?? 0,
    active:           product.active ?? true,
  } : emptyForm()));

  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function onPhotosChosen(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setPhotoError('');
    setUploading(true);
    try {
      const uidUser = auth?.currentUser?.uid;
      const newPhotos = [];
      for (const file of files) {
        const dataUrl = await fileToResizedDataUrl(file, { maxSize: 800, quality: 0.85 });
        if (uidUser) {
          const { url, path } = await uploadDataUrl(uidUser, PHOTO_COLLECTION, dataUrl);
          newPhotos.push({ id: uid(), url, path });
        } else {
          newPhotos.push({ id: uid(), url: dataUrl, path: '' });
        }
      }
      set('photos', [...form.photos, ...newPhotos]);
    } catch (err) {
      setPhotoError(err?.message || 'Could not add that photo.');
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(photo) {
    set('photos', form.photos.filter(p => p.id !== photo.id));
    if (photo.path) deleteBlobAtPath(photo.path).catch(() => {});
  }

  function addTier() { set('priceTiers', [...form.priceTiers, { id: uid(), label: '', price: 0, qty: 1, ingredients: [] }]); }
  function updateTier(id, field, value) {
    set('priceTiers', form.priceTiers.map(t => (t.id === id ? { ...t, [field]: value } : t)));
  }
  function removeTier(id) {
    if (form.priceTiers.length <= 1) return;
    set('priceTiers', form.priceTiers.filter(t => t.id !== id));
  }

  /* Only used for bundle products — non-bundle products track their
     ingredients (and cost of goods) per price tier on the Pricing
     page instead, since a Wholesale case rarely costs the same per
     unit to make as a single Retail item. */
  function addIngredient() { set('ingredients', [...form.ingredients, { id: uid(), name: '', price: 0 }]); }
  function updateIngredient(id, field, value) {
    set('ingredients', form.ingredients.map(v => (v.id === id ? { ...v, [field]: value } : v)));
  }
  function removeIngredient(id) { set('ingredients', form.ingredients.filter(v => v.id !== id)); }

  function toggleBundleProduct(id) {
    set('bundleProductIds', form.bundleProductIds.includes(id)
      ? form.bundleProductIds.filter(x => x !== id)
      : [...form.bundleProductIds, id]);
  }

  function toggleListValue(field, value) {
    const list = form[field] || [];
    set(field, list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  }

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
    } finally {
      setSaving(false);
    }
  }

  const otherProducts = allProducts.filter(p => !product || p.id !== product.id);

  return (
    <div className="bzc-modal-backdrop" onClick={onClose}>
      <div className="bzc-modal" onClick={e => e.stopPropagation()}>
        <div className="bzc-modal-head">
          <h2>{product ? 'Edit Product' : 'New Product'}</h2>
          <button type="button" className="bzc-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzc-modal-body">
          <div className="bzc-field-row">
            <div className="bzc-field grow">
              <label className="bzc-field-label">Product name</label>
              <input
                autoFocus
                className="bzc-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Cinnamon Sourdough Loaf"
              />
            </div>
            <div className="bzc-field">
              <label className="bzc-field-label">Status</label>
              <button
                type="button"
                className={`bzc-toggle${form.active ? ' is-on' : ''}`}
                onClick={() => set('active', !form.active)}
              >
                {form.active ? '● Active' : '○ Inactive'}
              </button>
            </div>
          </div>

          <div className="bzc-field">
            <label className="bzc-field-label">Type</label>
            <div className="bzc-segmented">
              <button type="button" className={form.type === 'physical' ? 'is-active' : ''} onClick={() => set('type', 'physical')}>📦 Physical</button>
              <button type="button" className={form.type === 'digital' ? 'is-active' : ''} onClick={() => set('type', 'digital')}>💾 Digital</button>
            </div>
          </div>

          {binders.length > 0 && (
            <div className="bzc-field">
              <label className="bzc-field-label">Binder</label>
              <select
                className="bzc-select"
                value={form.binderId || ''}
                onChange={e => set('binderId', e.target.value || null)}
              >
                <option value="">Unsorted</option>
                {binders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="bzc-field">
            <label className="bzc-field-label">Description</label>
            <textarea
              className="bzc-textarea"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What is it, what makes it special…"
            />
          </div>

          <div className="bzc-field">
            <label className="bzc-field-label">Photos</label>
            <div className="bzc-photo-grid">
              {form.photos.map(p => (
                <div key={p.id} className="bzc-photo-thumb">
                  <img src={p.url} alt="" />
                  <button type="button" onClick={() => removePhoto(p)}>✕</button>
                </div>
              ))}
              <label className="bzc-photo-add">
                {uploading ? '…' : '＋'}
                <input type="file" accept="image/*" multiple hidden onChange={onPhotosChosen} disabled={uploading} />
              </label>
            </div>
            {photoError && <div className="bzc-field-error">{photoError}</div>}
          </div>

          {!form.isBundle && (
            <div className="bzc-field">
              <label className="bzc-field-label">Price tiers</label>
              <div className="bzc-tier-list">
                {form.priceTiers.map(t => (
                  <div key={t.id} className="bzc-tier-row">
                    <input
                      className="bzc-input"
                      placeholder="Tier label (e.g. Retail, Wholesale)"
                      value={t.label}
                      onChange={e => updateTier(t.id, 'label', e.target.value)}
                    />
                    <input
                      type="number" step="0.01" min="0"
                      className="bzc-input narrow"
                      value={t.price}
                      onChange={e => updateTier(t.id, 'price', parseFloat(e.target.value) || 0)}
                    />
                    <span className="bzc-tier-qty-label">for</span>
                    <input
                      type="number" step="1" min="1"
                      className="bzc-input narrow qty"
                      value={t.qty ?? 1}
                      onChange={e => updateTier(t.id, 'qty', parseInt(e.target.value, 10) || 1)}
                    />
                    <button
                      type="button"
                      className="bzc-icon-btn danger"
                      onClick={() => removeTier(t.id)}
                      disabled={form.priceTiers.length <= 1}
                    >🗑</button>
                  </div>
                ))}
              </div>
              <button type="button" className="bzc-btn tiny" onClick={addTier}>＋ Add price tier</button>
              <p className="bzc-field-hint">Cost of goods & ingredients are set per tier on the Pricing page, since each tier can cost a different amount to make.</p>
            </div>
          )}

          {form.isBundle && (
            <div className="bzc-field">
              <label className="bzc-field-label">Ingredients / cost of goods</label>
              <div className="bzc-variation-list">
                {form.ingredients.map(v => (
                  <div key={v.id} className="bzc-ingredient-row">
                    <input
                      className="bzc-input"
                      placeholder="Ingredient (e.g. Flour, Sugar, Butter)"
                      value={v.name}
                      onChange={e => updateIngredient(v.id, 'name', e.target.value)}
                    />
                    <input
                      type="number" step="0.01" min="0"
                      className="bzc-input narrow"
                      value={v.price}
                      onChange={e => updateIngredient(v.id, 'price', parseFloat(e.target.value) || 0)}
                    />
                    <button type="button" className="bzc-icon-btn danger" onClick={() => removeIngredient(v.id)}>🗑</button>
                  </div>
                ))}
              </div>
              <button type="button" className="bzc-btn tiny" onClick={addIngredient}>＋ Add ingredient</button>
            </div>
          )}

          {isFoodBusiness && (
            <div className="bzc-field bzc-food-section">
              <label className="bzc-field-label bzc-food-title">🧁 Food &amp; Fulfillment Details</label>

              <div className="bzc-field">
                <label className="bzc-field-label">Allergens</label>
                <div className="bzc-chip-picker">
                  {ALLERGEN_OPTIONS.map(a => (
                    <button
                      key={a}
                      type="button"
                      className={`bzc-chip-toggle${form.allergens.includes(a) ? ' is-on' : ''}`}
                      onClick={() => toggleListValue('allergens', a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bzc-field">
                <label className="bzc-field-label">Dietary tags</label>
                <div className="bzc-chip-picker">
                  {DIETARY_OPTIONS.map(d => (
                    <button
                      key={d}
                      type="button"
                      className={`bzc-chip-toggle${form.dietaryTags.includes(d) ? ' is-on' : ''}`}
                      onClick={() => toggleListValue('dietaryTags', d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bzc-field-row">
                <div className="bzc-field grow">
                  <label className="bzc-field-label">Lead time</label>
                  <input
                    className="bzc-input"
                    value={form.leadTime}
                    onChange={e => set('leadTime', e.target.value)}
                    placeholder="e.g. 48 hours, Same day"
                  />
                </div>
                <div className="bzc-field grow">
                  <label className="bzc-field-label">Servings / yield</label>
                  <input
                    className="bzc-input"
                    value={form.servings}
                    onChange={e => set('servings', e.target.value)}
                    placeholder="e.g. Serves 8-10"
                  />
                </div>
              </div>

              <div className="bzc-field-row">
                <div className="bzc-field grow">
                  <label className="bzc-field-label">Shelf life</label>
                  <input
                    className="bzc-input"
                    value={form.shelfLife}
                    onChange={e => set('shelfLife', e.target.value)}
                    placeholder="e.g. 3 days at room temp"
                  />
                </div>
                <div className="bzc-field grow">
                  <label className="bzc-field-label">Storage instructions</label>
                  <input
                    className="bzc-input"
                    value={form.storageInstructions}
                    onChange={e => set('storageInstructions', e.target.value)}
                    placeholder="e.g. Refrigerate after opening"
                  />
                </div>
              </div>

              <div className="bzc-field">
                <label className="bzc-field-label">Fulfillment methods</label>
                <div className="bzc-chip-picker">
                  {FULFILLMENT_OPTIONS.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      className={`bzc-chip-toggle${form.fulfillmentMethods.includes(f.value) ? ' is-on' : ''}`}
                      onClick={() => toggleListValue('fulfillmentMethods', f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bzc-field bzc-food-subsection">
                <label className="bzc-field-label">Customization</label>
                <div className="bzc-field">
                  <label className="bzc-field-label">Flavor options</label>
                  <TagListField
                    values={form.flavorOptions}
                    onChange={v => set('flavorOptions', v)}
                    placeholder="Type a flavor and press Enter"
                  />
                </div>
                <div className="bzc-field">
                  <label className="bzc-field-label">Filling options</label>
                  <TagListField
                    values={form.fillingOptions}
                    onChange={v => set('fillingOptions', v)}
                    placeholder="Type a filling and press Enter"
                  />
                </div>
                <div className="bzc-field">
                  <label className="bzc-field-label">Frosting options</label>
                  <TagListField
                    values={form.frostingOptions}
                    onChange={v => set('frostingOptions', v)}
                    placeholder="Type a frosting and press Enter"
                  />
                </div>
                <div className="bzc-field">
                  <label className="bzc-field-label">Size / tier options</label>
                  <TagListField
                    values={form.sizeOptions}
                    onChange={v => set('sizeOptions', v)}
                    placeholder="Type a size/tier and press Enter"
                  />
                </div>
                <div className="bzc-field-row">
                  <div className="bzc-field grow">
                    <label className="bzc-check-row">
                      <input type="checkbox" checked={form.allowsCustomMessage} onChange={e => set('allowsCustomMessage', e.target.checked)} />
                      Allows a custom message
                    </label>
                  </div>
                  <div className="bzc-field">
                    <label className="bzc-field-label">Rush order fee</label>
                    <input
                      type="number" step="0.01" min="0"
                      className="bzc-input narrow"
                      value={form.rushFee}
                      onChange={e => set('rushFee', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              <div className="bzc-field-row">
                <div className="bzc-field">
                  <label className="bzc-field-label">Minimum order qty</label>
                  <input
                    type="number" min="0" step="1"
                    className="bzc-input narrow"
                    value={form.minOrderQty ?? ''}
                    onChange={e => set('minOrderQty', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="bzc-field grow">
                  <label className="bzc-check-row">
                    <input type="checkbox" checked={form.seasonal} onChange={e => set('seasonal', e.target.checked)} />
                    Seasonal / limited-time item
                  </label>
                  {form.seasonal && (
                    <input
                      className="bzc-input"
                      value={form.seasonalWindow}
                      onChange={e => set('seasonalWindow', e.target.value)}
                      placeholder="e.g. Oct - Dec"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bzc-field">
            <label className="bzc-check-row">
              <input type="checkbox" checked={form.isBundle} onChange={e => set('isBundle', e.target.checked)} />
              This product is a bundle of other products
            </label>
            {form.isBundle && (
              <div className="bzc-bundle-box">
                <div className="bzc-field-label">Included products</div>
                {otherProducts.length === 0 ? (
                  <p className="bzc-field-hint">Add other products first, then come back to bundle them.</p>
                ) : (
                  <div className="bzc-bundle-list">
                    {otherProducts.map(p => (
                      <label key={p.id} className="bzc-check-row">
                        <input
                          type="checkbox"
                          checked={form.bundleProductIds.includes(p.id)}
                          onChange={() => toggleBundleProduct(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                )}
                <label className="bzc-field-label">Bundle price</label>
                <input
                  type="number" step="0.01" min="0"
                  className="bzc-input narrow"
                  value={form.bundlePrice}
                  onChange={e => set('bundlePrice', parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="bzc-modal-actions">
          <button type="button" className="bzc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="bzc-btn primary" onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? 'Saving…' : product ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Viewer (read-only) — opens on single-click; "✏️ Edit" or a
   double-click on the card switches to ProductEditor for the same
   product. ─────────────────────────────────────────────────────── */
function ProductView({ product, binder, allProducts, isFoodBusiness, onEdit, onOrder, onClose }) {
  const bundleItems = product.isBundle
    ? allProducts.filter(p => product.bundleProductIds?.includes(p.id))
    : [];

  const hasFoodDetails = isFoodBusiness && (
    product.allergens?.length || product.dietaryTags?.length || product.leadTime
    || product.shelfLife || product.storageInstructions || product.servings
    || product.fulfillmentMethods?.length || product.minOrderQty || product.seasonal
    || product.flavorOptions?.length || product.fillingOptions?.length
    || product.frostingOptions?.length || product.sizeOptions?.length
    || product.allowsCustomMessage || product.rushFee > 0
  );

  return (
    <div className="bzc-modal-backdrop" onClick={onClose}>
      <div className="bzc-modal" onClick={e => e.stopPropagation()}>
        <div className="bzc-modal-head">
          <h2>{product.name}</h2>
          <button type="button" className="bzc-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bzc-modal-body">
          <div className="bzc-view-badges">
            <span className={`bzc-badge-pill${product.active ? ' active' : ''}`}>{product.active ? '● Active' : '○ Inactive'}</span>
            <span className="bzc-badge-pill">{product.type === 'digital' ? '💾 Digital' : '📦 Physical'}</span>
            {binder && <span className="bzc-badge-pill" style={{ '--binder-color': binder.color }}>{binder.name}</span>}
            {product.isBundle && <span className="bzc-badge-pill">Bundle</span>}
          </div>

          {product.photos?.length > 0 && (
            <div className="bzc-view-photos">
              {product.photos.map(p => (
                <div key={p.id} className="bzc-photo-thumb view-only"><img src={p.url} alt="" /></div>
              ))}
            </div>
          )}

          {product.description && (
            <div className="bzc-view-section">
              <div className="bzc-view-label">Description</div>
              <p className="bzc-view-text">{product.description}</p>
            </div>
          )}

          {product.tags?.length > 0 && (
            <div className="bzc-tag-chips">
              {product.tags.map(t => <span key={t} className="bzc-tag">{t}</span>)}
            </div>
          )}

          <div className="bzc-view-section">
            <div className="bzc-view-label">Pricing</div>
            {product.isBundle ? (
              <>
                <div className="bzc-view-tier-row"><span>Bundle price</span><strong>{currency(product.bundlePrice)}</strong></div>
                {bundleItems.length > 0 && (
                  <p className="bzc-view-text">Includes: {bundleItems.map(p => p.name).join(', ')}</p>
                )}
              </>
            ) : (
              <div className="bzc-view-tiers">
                {(product.priceTiers || []).map(t => (
                  <div key={t.id} className="bzc-view-tier-row">
                    <span>{t.label || 'Price'}</span>
                    <strong>{currency(t.price)}</strong>
                    {Number(t.qty) > 1 && <span className="bzc-tier-qty-label">for {Number(t.qty)}</span>}
                  </div>
                ))}
              </div>
            )}
            {!product.isBundle && (
              <p className="bzc-view-text">Cost of goods & ingredients are tracked per tier on the Pricing page.</p>
            )}
          </div>

          {product.isBundle && product.ingredients?.length > 0 && (
            <div className="bzc-view-section">
              <div className="bzc-view-label">Ingredients / cost of goods</div>
              <p className="bzc-view-text">
                {product.ingredients.filter(v => v.name).map(v => `${v.name} ${currency(v.price)}`).join(', ')}
              </p>
            </div>
          )}

          {hasFoodDetails && (
            <div className="bzc-view-section bzc-food-section">
              <div className="bzc-view-label bzc-food-title">🧁 Food &amp; Fulfillment Details</div>
              {product.allergens?.length > 0 && (
                <p className="bzc-view-text"><strong>Allergens:</strong> {product.allergens.join(', ')}</p>
              )}
              {product.dietaryTags?.length > 0 && (
                <p className="bzc-view-text"><strong>Dietary:</strong> {product.dietaryTags.join(', ')}</p>
              )}
              {product.leadTime && <p className="bzc-view-text"><strong>Lead time:</strong> {product.leadTime}</p>}
              {product.servings && <p className="bzc-view-text"><strong>Servings:</strong> {product.servings}</p>}
              {product.shelfLife && <p className="bzc-view-text"><strong>Shelf life:</strong> {product.shelfLife}</p>}
              {product.storageInstructions && <p className="bzc-view-text"><strong>Storage:</strong> {product.storageInstructions}</p>}
              {product.fulfillmentMethods?.length > 0 && (
                <p className="bzc-view-text">
                  <strong>Fulfillment:</strong> {product.fulfillmentMethods.map(v => FULFILLMENT_OPTIONS.find(f => f.value === v)?.label || v).join(', ')}
                </p>
              )}
              {product.minOrderQty > 0 && <p className="bzc-view-text"><strong>Minimum order:</strong> {product.minOrderQty}</p>}
              {product.seasonal && (
                <p className="bzc-view-text"><strong>Seasonal:</strong> {product.seasonalWindow || 'Yes'}</p>
              )}
              {product.flavorOptions?.length > 0 && (
                <p className="bzc-view-text"><strong>Flavors:</strong> {product.flavorOptions.join(', ')}</p>
              )}
              {product.fillingOptions?.length > 0 && (
                <p className="bzc-view-text"><strong>Fillings:</strong> {product.fillingOptions.join(', ')}</p>
              )}
              {product.frostingOptions?.length > 0 && (
                <p className="bzc-view-text"><strong>Frosting:</strong> {product.frostingOptions.join(', ')}</p>
              )}
              {product.sizeOptions?.length > 0 && (
                <p className="bzc-view-text"><strong>Sizes:</strong> {product.sizeOptions.join(', ')}</p>
              )}
              {product.allowsCustomMessage && (
                <p className="bzc-view-text"><strong>Custom message:</strong> Allowed</p>
              )}
              {product.rushFee > 0 && (
                <p className="bzc-view-text"><strong>Rush order fee:</strong> {currency(product.rushFee)}</p>
              )}
            </div>
          )}
        </div>

        <div className="bzc-modal-actions">
          <button type="button" className="bzc-btn" onClick={onClose}>Close</button>
          <button type="button" className="bzc-btn" onClick={onOrder}>🧾 Order</button>
          <button type="button" className="bzc-btn primary" onClick={onEdit}>✏️ Edit Product</button>
        </div>
      </div>
    </div>
  );
}
