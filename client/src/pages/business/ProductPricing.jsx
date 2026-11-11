import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { businessProductService } from '../../services/businessProductService';
import { businessInventoryService } from '../../services/businessInventoryService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { generatePricingResearch } from '../../lib/pricingResearch';
import './ProductPricing.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — Pricing. A dedicated, spreadsheet-style
   view over every product's cost of goods and price tiers (or
   bundle price), so pricing can be reviewed/adjusted across the
   whole catalog without opening each product's full editor one
   at a time. Each price tier carries its own priced ingredients
   list — cost of goods is the sum of a tier's ingredient prices,
   not one product-wide number, since a Wholesale case rarely
   costs the same per unit to make as a single Retail item.
   Bundles (one price, no tiers) keep a top-level ingredients list
   instead. Reads/writes businessProductService: priceTiers
   (with nested ingredients), ingredients (bundles), bundlePrice.
   ───────────────────────────────────────────────────────────── */

function ingredientsTotal(ingredients) {
  return (ingredients || []).reduce((sum, i) => sum + (Number(i.price) || 0), 0);
}

/* An ingredient can optionally link to an Inventory item instead of
   a hand-typed price — `price` becomes derived (qtyUsed × that
   item's cost per unit), so it stays consistent with what's on the
   Inventory page, and that same link (inventoryItemId + qtyUsed) is
   exactly what powers the Demand Analysis dashboard's needed-vs-
   on-hand math. Unlinked ingredients are untouched: free-text name,
   manually typed price, nothing to sync. */
function ingredientPriceForLink(item, qtyUsed) {
  return (Number(item?.costPerUnit) || 0) * (Number(qtyUsed) || 0);
}

function applyIngredientField(ing, field, value, inventoryItems) {
  if (field === 'inventoryItemId') {
    if (!value) return { ...ing, inventoryItemId: null, qtyUsed: null };
    const item = (inventoryItems || []).find(i => i.id === value);
    const qtyUsed = ing.qtyUsed || 1;
    return {
      ...ing,
      inventoryItemId: value,
      qtyUsed,
      name: ing.name || item?.name || '',
      price: ingredientPriceForLink(item, qtyUsed),
    };
  }
  if (field === 'qtyUsed') {
    const item = (inventoryItems || []).find(i => i.id === ing.inventoryItemId);
    return { ...ing, qtyUsed: value, price: ingredientPriceForLink(item, value) };
  }
  return { ...ing, [field]: value };
}

/* Re-derives price for every linked ingredient from the *current*
   inventory cost — called whenever a tier/bundle's ingredients are
   loaded into view or edit state, so a cost-per-unit change made on
   the Inventory page shows up here without needing to re-link
   anything. An ingredient whose linked item was since deleted just
   keeps its last-known price. */
function refreshLinkedPrices(ingredients, inventoryItems) {
  return (ingredients || []).map(ing => {
    if (!ing.inventoryItemId) return ing;
    const item = (inventoryItems || []).find(i => i.id === ing.inventoryItemId);
    if (!item) return ing;
    return { ...ing, price: ingredientPriceForLink(item, ing.qtyUsed) };
  });
}

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function currency(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

function formatPrepTime(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const hrs = (m / 60).toFixed(1).replace(/\.0$/, '');
  return `${hrs} hr`;
}

function marketPositionClass(positioning) {
  const p = (positioning || '').toLowerCase();
  if (p.includes('above') || p.includes('premium')) return 'premium';
  if (p.includes('below') || p.includes('budget')) return 'budget';
  return 'mid';
}

/* Business-wide overhead & processing-fee numbers, derived once per
 * render of the business doc — used to spread fixed costs across
 * every unit and to work out a break-even point per tier below. */
function computeFinance(business) {
  const totalOverhead = (business?.overheadCosts || []).reduce((s, o) => s + (Number(o.monthlyAmount) || 0), 0);
  const units = Number(business?.estimatedMonthlyUnits) || 0;
  const overheadPerUnit = units > 0 ? totalOverhead / units : 0;
  const activeFee = (business?.processingFees || []).find(f => f.id === business?.activeProcessingFeeId);
  const feePct = Number(activeFee?.pct) || 0;
  return { totalOverhead, overheadPerUnit, feePct };
}

/* Business-wide settings panel — overhead costs, estimated monthly
 * unit volume, and named payment/platform processing fees. Collapsed
 * by default with a one-line summary; expands to a read-only view of
 * the current numbers, and double-clicking that view drops into a
 * full editor with its own dirty-check/save — same view/double-click
 * pattern as the rest of this page uses for per-product edits, just
 * triggered by a double-click instead of an Edit button since this
 * panel is business-wide settings rather than a repeated row. */
function OverheadFeesPanel({ business, onSave }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [overheadCosts, setOverheadCosts] = useState(business?.overheadCosts || []);
  const [estimatedMonthlyUnits, setEstimatedMonthlyUnits] = useState(business?.estimatedMonthlyUnits ?? 0);
  const [processingFees, setProcessingFees] = useState(business?.processingFees || []);
  const [activeProcessingFeeId, setActiveProcessingFeeId] = useState(business?.activeProcessingFeeId ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOverheadCosts(business?.overheadCosts || []);
    setEstimatedMonthlyUnits(business?.estimatedMonthlyUnits ?? 0);
    setProcessingFees(business?.processingFees || []);
    setActiveProcessingFeeId(business?.activeProcessingFeeId ?? null);
  }, [business]);

  const totalOverhead = useMemo(
    () => overheadCosts.reduce((s, o) => s + (Number(o.monthlyAmount) || 0), 0),
    [overheadCosts],
  );

  const dirty = useMemo(() => {
    if (JSON.stringify(overheadCosts) !== JSON.stringify(business?.overheadCosts || [])) return true;
    if (Number(estimatedMonthlyUnits) !== Number(business?.estimatedMonthlyUnits ?? 0)) return true;
    if (JSON.stringify(processingFees) !== JSON.stringify(business?.processingFees || [])) return true;
    if ((activeProcessingFeeId ?? null) !== (business?.activeProcessingFeeId ?? null)) return true;
    return false;
  }, [overheadCosts, estimatedMonthlyUnits, processingFees, activeProcessingFeeId, business]);

  function resetFromBusiness() {
    setOverheadCosts(business?.overheadCosts || []);
    setEstimatedMonthlyUnits(business?.estimatedMonthlyUnits ?? 0);
    setProcessingFees(business?.processingFees || []);
    setActiveProcessingFeeId(business?.activeProcessingFeeId ?? null);
  }
  function startEdit() { resetFromBusiness(); setMode('edit'); }
  function cancelEdit() { resetFromBusiness(); setMode('view'); }

  function addOverhead() {
    setOverheadCosts(list => [...list, { id: uid(), label: '', monthlyAmount: 0 }]);
  }
  function updateOverhead(id, field, value) {
    setOverheadCosts(list => list.map(o => (o.id === id ? { ...o, [field]: value } : o)));
  }
  function removeOverhead(id) {
    setOverheadCosts(list => list.filter(o => o.id !== id));
  }

  function addFee() {
    setProcessingFees(list => [...list, { id: uid(), label: '', pct: 0 }]);
  }
  function updateFee(id, field, value) {
    setProcessingFees(list => list.map(f => (f.id === id ? { ...f, [field]: value } : f)));
  }
  function removeFee(id) {
    setProcessingFees(list => list.filter(f => f.id !== id));
    if (activeProcessingFeeId === id) setActiveProcessingFeeId(null);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        overheadCosts,
        estimatedMonthlyUnits: Number(estimatedMonthlyUnits) || 0,
        processingFees,
        activeProcessingFeeId,
      });
      setSaved(true);
      setMode('view');
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  const activeFee = processingFees.find(f => f.id === activeProcessingFeeId);

  return (
    <div className="bzp-fin">
      <button type="button" className="bzp-fin-toggle" onClick={() => setOpen(o => !o)}>
        <span className="bzp-fin-caret">{open ? '▾' : '▸'}</span>
        <span>Overhead &amp; processing fees</span>
        <span className="bzp-fin-summary">
          {currency(totalOverhead)}/mo overhead
          {estimatedMonthlyUnits > 0 && ` · ${currency(totalOverhead / estimatedMonthlyUnits)}/unit`}
        </span>
      </button>

      {open && mode === 'view' && (
        <div className="bzp-fin-body bzp-fin-view" onDoubleClick={startEdit} title="Double-click to edit">
          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Monthly overhead costs</div>
            {overheadCosts.length === 0 ? (
              <div className="bzp-fin-hint">No overhead costs yet.</div>
            ) : overheadCosts.map(o => (
              <div key={o.id} className="bzp-fin-view-row">
                <span className="bzp-fin-view-label">{o.label || 'Untitled'}</span>
                <span className="bzp-fin-view-value">{currency(o.monthlyAmount)}/mo</span>
              </div>
            ))}
            <div className="bzp-fin-hint">Total {currency(totalOverhead)}/mo</div>
          </div>

          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Estimated units sold per month</div>
            <div className="bzp-fin-view-row">
              <span className="bzp-fin-view-value">{estimatedMonthlyUnits || 0}</span>
            </div>
          </div>

          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Payment/platform processing fees</div>
            {processingFees.length === 0 ? (
              <div className="bzp-fin-hint">No processing fees yet.</div>
            ) : processingFees.map(f => (
              <div key={f.id} className="bzp-fin-view-row">
                <span className="bzp-fin-view-label">
                  {f.id === activeProcessingFeeId && <span className="bzp-fin-active-dot" title="Active">●</span>}
                  {f.label || 'Untitled'}
                </span>
                <span className="bzp-fin-view-value">{f.pct}%</span>
              </div>
            ))}
            <div className="bzp-fin-hint">
              {activeFee ? `Active: ${activeFee.label || 'Untitled'} (${activeFee.pct}%)` : 'No active fee selected.'}
            </div>
          </div>

          <div className="bzp-fin-hint bzp-fin-edit-hint">Double-click to edit</div>
        </div>
      )}

      {open && mode === 'edit' && (
        <div className="bzp-fin-body">
          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Monthly overhead costs</div>
            {overheadCosts.map(o => (
              <div key={o.id} className="bzp-fin-row">
                <input
                  className="bzp-input"
                  placeholder="Label (e.g. Rent)"
                  value={o.label}
                  onChange={e => updateOverhead(o.id, 'label', e.target.value)}
                />
                <input
                  type="number" step="0.01" min="0"
                  className="bzp-input narrow"
                  value={o.monthlyAmount}
                  onChange={e => updateOverhead(o.id, 'monthlyAmount', parseFloat(e.target.value) || 0)}
                />
                <button type="button" className="bzp-icon-btn danger" onClick={() => removeOverhead(o.id)}>🗑</button>
              </div>
            ))}
            <button type="button" className="bzp-btn tiny" onClick={addOverhead}>＋ Add overhead cost</button>
            <div className="bzp-fin-hint">Total {currency(totalOverhead)}/mo</div>
          </div>

          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Estimated units sold per month</div>
            <input
              type="number" step="1" min="0"
              className="bzp-input narrow"
              value={estimatedMonthlyUnits}
              onChange={e => setEstimatedMonthlyUnits(e.target.value)}
            />
            <div className="bzp-fin-hint">Used to spread overhead evenly across each unit sold.</div>
          </div>

          <div className="bzp-fin-section">
            <div className="bzp-specifics-label">Payment/platform processing fees</div>
            {processingFees.map(f => (
              <div key={f.id} className="bzp-fin-row">
                <label className="bzp-fin-radio">
                  <input
                    type="radio"
                    name="activeFee"
                    checked={activeProcessingFeeId === f.id}
                    onChange={() => setActiveProcessingFeeId(f.id)}
                  />
                </label>
                <input
                  className="bzp-input"
                  placeholder="Label (e.g. Etsy)"
                  value={f.label}
                  onChange={e => updateFee(f.id, 'label', e.target.value)}
                />
                <input
                  type="number" step="0.1" min="0"
                  className="bzp-input narrow"
                  value={f.pct}
                  onChange={e => updateFee(f.id, 'pct', parseFloat(e.target.value) || 0)}
                />
                <span className="bzp-fin-pct-sign">%</span>
                <button type="button" className="bzp-icon-btn danger" onClick={() => removeFee(f.id)}>🗑</button>
              </div>
            ))}
            <button type="button" className="bzp-btn tiny" onClick={addFee}>＋ Add processing fee</button>
            <div className="bzp-fin-hint">Pick the fee that applies with the radio button — it's used in the cost &amp; break-even math below.</div>
          </div>

          <div className="bzp-fin-actions">
            {saved && <span className="bzp-saved">✓ Saved</span>}
            <button type="button" className="bzp-btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
            <button type="button" className="bzp-btn primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductPricing() {
  const { businessId } = useParams();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [bizRes, prodRes, invRes] = await Promise.all([
        businessService.getOne(businessId),
        businessProductService.getAll(businessId),
        businessInventoryService.getAll(businessId),
      ]);
      setBusiness(bizRes.data.data);
      setProducts(prodRes.data.data || []);
      setInventoryItems(invRes.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load pricing.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [businessId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => (p.name || '').toLowerCase().includes(q));
  }, [products, search]);

  const stats = useMemo(() => {
    const margins = [];
    products.forEach(p => {
      if (p.isBundle) {
        const cogs = ingredientsTotal(p.ingredients);
        const price = Number(p.bundlePrice) || 0;
        if (price > 0) margins.push(((price - cogs) / price) * 100);
      } else {
        const tier = (p.priceTiers || [])[0];
        const cogs = ingredientsTotal(tier?.ingredients);
        const price = Number(tier?.price) || 0;
        if (price > 0) margins.push(((price - cogs) / price) * 100);
      }
    });
    const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
    return { count: products.length, avgMargin };
  }, [products]);

  async function saveProduct(id, patch) {
    const res = await businessProductService.update(businessId, id, patch);
    setProducts(prev => prev.map(p => (p.id === id ? res.data.data : p)));
  }

  async function saveBusinessFinance(patch) {
    const res = await businessService.update(businessId, patch);
    setBusiness(res.data.data);
  }

  const finance = useMemo(() => computeFinance(business), [business]);

  return (
    <BusinessShell
      title="Pricing"
      icon="💲"
      subtitle="Cost of goods, price tiers, and margins for every product — edit and save right here, no need to open the full product form."
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bzp-root">
        {error && (
          <div className="bzp-error">
            {error}
            <button type="button" onClick={() => setError('')}>✕</button>
          </div>
        )}

        <OverheadFeesPanel business={business} onSave={saveBusinessFinance} />

        <div className="bzp-toolbar">
          <input
            className="bzp-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
          />
          <div className="bzp-stats">
            <span>{stats.count} product{stats.count === 1 ? '' : 's'}</span>
            {stats.avgMargin !== null && <span>Avg margin {stats.avgMargin.toFixed(0)}%</span>}
          </div>
        </div>

        {loading ? (
          <div className="bzp-empty">Loading pricing…</div>
        ) : filtered.length === 0 ? (
          <div className="bzp-empty">
            <div className="bzp-empty-icon">💲</div>
            <h2>{products.length === 0 ? 'No products yet' : 'No products match'}</h2>
            <p>
              {products.length === 0
                ? 'Add products in the Product Catalog first — their pricing shows up here.'
                : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="bzp-list">
            {filtered.map(p => (
              <PricingRow
                key={p.id}
                product={p}
                onSave={patch => saveProduct(p.id, patch)}
                businessCategory={business?.category}
                finance={finance}
                inventoryItems={inventoryItems}
              />
            ))}
          </div>
        )}
      </div>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}

/* Ensures every tier has its own `ingredients` array. For legacy
 * products saved before per-tier cost of goods existed, best-effort
 * migrates the old product-wide `cogs` number and flat (name-only)
 * `ingredients` list onto the first tier, so existing cost data isn't
 * silently lost — any gap between the migrated ingredients' total and
 * the old cogs number is preserved as a single catch-all line item. */
function defaultTiers(product) {
  const tiers = product.priceTiers?.length ? product.priceTiers : [{ id: uid(), label: 'Retail', price: 0, qty: 1, ingredients: [] }];
  return tiers.map((t, i) => {
    const qty = Number(t.qty) || 1;
    if (Array.isArray(t.ingredients)) return { ...t, qty };
    if (i === 0 && (Number(product.cogs) > 0 || product.ingredients?.length)) {
      const legacy = (product.ingredients || []).map(ing => ({
        id: ing.id || uid(), name: ing.name || '', price: Number(ing.price) || 0,
        inventoryItemId: ing.inventoryItemId || null, qtyUsed: ing.qtyUsed ?? null,
      }));
      const remainder = Math.max(0, (Number(product.cogs) || 0) - ingredientsTotal(legacy));
      return { ...t, qty, ingredients: remainder > 0 ? [...legacy, { id: uid(), name: 'Cost of goods (migrated)', price: remainder }] : legacy };
    }
    return { ...t, qty, ingredients: [] };
  });
}

/* Same best-effort migration as defaultTiers(), but for a bundle's
 * top-level ingredients list. */
function defaultBundleIngredients(product) {
  const legacy = (product.ingredients || []).map(ing => ({
    id: ing.id || uid(), name: ing.name || '', price: Number(ing.price) || 0,
    inventoryItemId: ing.inventoryItemId || null, qtyUsed: ing.qtyUsed ?? null,
  }));
  const remainder = Math.max(0, (Number(product.cogs) || 0) - ingredientsTotal(legacy));
  return remainder > 0 ? [...legacy, { id: uid(), name: 'Cost of goods (migrated)', price: remainder }] : legacy;
}

function PricingRow({ product, onSave, businessCategory, finance, inventoryItems }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [priceTiers, setPriceTiers] = useState(() => defaultTiers(product).map(
    t => ({ ...t, ingredients: refreshLinkedPrices(t.ingredients, inventoryItems) })
  ));
  const [bundleIngredients, setBundleIngredients] = useState(
    () => refreshLinkedPrices(defaultBundleIngredients(product), inventoryItems)
  );
  const [bundlePrice, setBundlePrice] = useState(product.bundlePrice ?? 0);
  const [rushFee, setRushFee] = useState(product.rushFee ?? 0);
  const [minOrderQty, setMinOrderQty] = useState(product.minOrderQty ?? '');
  const [seasonal, setSeasonal] = useState(product.seasonal ?? false);
  const [seasonalWindow, setSeasonalWindow] = useState(product.seasonalWindow ?? '');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(product.prepTimeMinutes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');

  const dirty = useMemo(() => {
    // Compared against refreshed (not raw) baselines — a linked
    // ingredient's price moving because its Inventory cost changed
    // isn't a user edit, so it shouldn't light up the Save button
    // on its own; it'll just be included next time something's
    // actually saved.
    if (product.isBundle) {
      if (Number(bundlePrice) !== Number(product.bundlePrice ?? 0)) return true;
      if (JSON.stringify(bundleIngredients) !== JSON.stringify(refreshLinkedPrices(defaultBundleIngredients(product), inventoryItems))) return true;
    } else if (JSON.stringify(priceTiers) !== JSON.stringify(defaultTiers(product).map(
      t => ({ ...t, ingredients: refreshLinkedPrices(t.ingredients, inventoryItems) })
    ))) {
      return true;
    }
    if (Number(rushFee) !== Number(product.rushFee ?? 0)) return true;
    if (String(minOrderQty) !== String(product.minOrderQty ?? '')) return true;
    if (!!seasonal !== !!(product.seasonal ?? false)) return true;
    if (seasonalWindow !== (product.seasonalWindow ?? '')) return true;
    if (String(prepTimeMinutes) !== String(product.prepTimeMinutes ?? '')) return true;
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundlePrice, bundleIngredients, priceTiers, rushFee, minOrderQty, seasonal, seasonalWindow, prepTimeMinutes, product, inventoryItems]);

  function resetFromProduct() {
    setPriceTiers(defaultTiers(product).map(t => ({ ...t, ingredients: refreshLinkedPrices(t.ingredients, inventoryItems) })));
    setBundleIngredients(refreshLinkedPrices(defaultBundleIngredients(product), inventoryItems));
    setBundlePrice(product.bundlePrice ?? 0);
    setRushFee(product.rushFee ?? 0);
    setMinOrderQty(product.minOrderQty ?? '');
    setSeasonal(product.seasonal ?? false);
    setSeasonalWindow(product.seasonalWindow ?? '');
    setPrepTimeMinutes(product.prepTimeMinutes ?? '');
  }
  function startEdit() { resetFromProduct(); setMode('edit'); }
  function cancelEdit() { resetFromProduct(); setMode('view'); }

  function addTier() { setPriceTiers(t => [...t, { id: uid(), label: '', price: 0, qty: 1, ingredients: [] }]); }
  function updateTier(id, field, value) {
    setPriceTiers(t => t.map(x => (x.id === id ? { ...x, [field]: value } : x)));
  }
  function removeTier(id) {
    setPriceTiers(t => (t.length <= 1 ? t : t.filter(x => x.id !== id)));
  }

  function addTierIngredient(tierId) {
    setPriceTiers(t => t.map(x => (x.id === tierId ? { ...x, ingredients: [...(x.ingredients || []), { id: uid(), name: '', price: 0, inventoryItemId: null, qtyUsed: null }] } : x)));
  }
  function updateTierIngredient(tierId, ingId, field, value) {
    setPriceTiers(t => t.map(x => (x.id === tierId
      ? { ...x, ingredients: x.ingredients.map(i => (i.id === ingId ? applyIngredientField(i, field, value, inventoryItems) : i)) }
      : x)));
  }
  function removeTierIngredient(tierId, ingId) {
    setPriceTiers(t => t.map(x => (x.id === tierId ? { ...x, ingredients: x.ingredients.filter(i => i.id !== ingId) } : x)));
  }

  function addBundleIngredient() { setBundleIngredients(list => [...list, { id: uid(), name: '', price: 0, inventoryItemId: null, qtyUsed: null }]); }
  function updateBundleIngredient(id, field, value) {
    setBundleIngredients(list => list.map(i => (i.id === id ? applyIngredientField(i, field, value, inventoryItems) : i)));
  }
  function removeBundleIngredient(id) {
    setBundleIngredients(list => list.filter(i => i.id !== id));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        ...(product.isBundle
          ? { bundlePrice: Number(bundlePrice) || 0, ingredients: bundleIngredients }
          : { priceTiers }),
        rushFee: Number(rushFee) || 0,
        minOrderQty: minOrderQty === '' ? null : Number(minOrderQty) || 0,
        seasonal: !!seasonal,
        seasonalWindow: seasonal ? seasonalWindow.trim() : '',
        prepTimeMinutes: prepTimeMinutes === '' ? null : Number(prepTimeMinutes) || 0,
      });
      setSaved(true);
      setMode('view');
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function runResearch() {
    setResearching(true);
    setResearchError('');
    try {
      const result = generatePricingResearch({ product, businessCategory });
      await onSave({ aiPricing: result });
    } catch (err) {
      setResearchError(err?.message || 'Could not research pricing for this product.');
    } finally {
      setResearching(false);
    }
  }

  function applyResearch() {
    const r = product.aiPricing;
    if (!r) return;
    if (product.isBundle) {
      setBundlePrice(r.retail);
    } else {
      setPriceTiers([
        { id: uid(), label: 'Retail', price: r.retail, qty: 1, ingredients: [] },
        { id: uid(), label: 'Wholesale', price: r.wholesale, qty: 1, ingredients: [] },
        ...(r.bulk != null ? [{ id: uid(), label: 'Bulk/Case', price: r.bulk, qty: 1, ingredients: [] }] : []),
      ]);
    }
    setMode('edit');
  }

  if (mode === 'view') {
    const viewTiers = defaultTiers(product).map(t => ({ ...t, ingredients: refreshLinkedPrices(t.ingredients, inventoryItems) }));
    const viewBundleIngredients = refreshLinkedPrices(defaultBundleIngredients(product), inventoryItems);
    const viewBundleCogs = ingredientsTotal(viewBundleIngredients);
    return (
      <div className={`bzp-row${product.active ? '' : ' is-inactive'}`}>
        <div className="bzp-row-head">
          <div className="bzp-row-name">
            {product.name}
            {!product.active && <span className="bzp-badge">Inactive</span>}
            {product.isBundle && <span className="bzp-badge bundle">Bundle</span>}
          </div>
          <button type="button" className="bzp-btn tiny" onClick={startEdit}>✏️ Edit</button>
        </div>

        {product.isBundle ? (
          <div className="bzp-view-tier-block">
            <div className="bzp-view-tier-row">
              <span className="bzp-view-tier-label">Bundle price</span>
              <span className="bzp-view-tier-price">{currency(product.bundlePrice)}</span>
              <MarginTag price={Number(product.bundlePrice) || 0} cogs={viewBundleCogs} />
            </div>
            <ViewCogs cogs={viewBundleCogs} ingredients={viewBundleIngredients} />
            <CostBreakdown
              price={Number(product.bundlePrice) || 0}
              cogs={viewBundleCogs}
              finance={finance}
            />
          </div>
        ) : (
          <div className="bzp-view-tier-list">
            {viewTiers.map(t => {
              const tierCogs = ingredientsTotal(t.ingredients);
              return (
                <div key={t.id} className="bzp-view-tier-block">
                  <div className="bzp-view-tier-row">
                    <span className="bzp-view-tier-label">{t.label || 'Untitled tier'}</span>
                    <span className="bzp-view-tier-price">{currency(t.price)}</span>
                    {Number(t.qty) > 1 && <span className="bzp-view-tier-qty">for {Number(t.qty)}</span>}
                    <MarginTag price={Number(t.price) || 0} cogs={tierCogs} />
                  </div>
                  <ViewCogs cogs={tierCogs} ingredients={t.ingredients} />
                  <CostBreakdown
                    price={Number(t.price) || 0}
                    cogs={tierCogs}
                    qty={Number(t.qty) || 1}
                    finance={finance}
                  />
                </div>
              );
            })}
          </div>
        )}

        {(product.rushFee > 0 || product.minOrderQty || product.seasonal || product.prepTimeMinutes) && (
          <div className="bzp-view-specifics">
            {product.rushFee > 0 && <span className="bzp-chip">⚡ Rush fee {currency(product.rushFee)}</span>}
            {product.minOrderQty > 0 && <span className="bzp-chip">📦 Min order {product.minOrderQty}</span>}
            {product.seasonal && <span className="bzp-chip">🍂 Seasonal{product.seasonalWindow ? ` — ${product.seasonalWindow}` : ''}</span>}
            {product.prepTimeMinutes > 0 && <span className="bzp-chip">⏱ Prep time {formatPrepTime(product.prepTimeMinutes)}</span>}
          </div>
        )}

        <AiPricingResearch
          product={product}
          researching={researching}
          researchError={researchError}
          onResearch={runResearch}
          onApply={applyResearch}
        />

        {saved && <div className="bzp-row-actions"><span className="bzp-saved">✓ Saved</span></div>}
      </div>
    );
  }

  return (
    <div className={`bzp-row${product.active ? '' : ' is-inactive'}`}>
      <div className="bzp-row-head">
        <div className="bzp-row-name">
          {product.name}
          {!product.active && <span className="bzp-badge">Inactive</span>}
          {product.isBundle && <span className="bzp-badge bundle">Bundle</span>}
        </div>
      </div>

      {product.isBundle ? (
        <div className="bzp-tier-block">
          <div className="bzp-tier-row">
            <span className="bzp-tier-label-static">Bundle price</span>
            <input
              autoFocus
              type="number" step="0.01" min="0"
              className="bzp-input narrow"
              value={bundlePrice}
              onChange={e => setBundlePrice(parseFloat(e.target.value) || 0)}
            />
            <MarginTag price={Number(bundlePrice) || 0} cogs={ingredientsTotal(bundleIngredients)} />
          </div>
          <IngredientEditor
            ingredients={bundleIngredients}
            onAdd={addBundleIngredient}
            onUpdate={updateBundleIngredient}
            onRemove={removeBundleIngredient}
            inventoryItems={inventoryItems}
          />
          <CostBreakdown
            price={Number(bundlePrice) || 0}
            cogs={ingredientsTotal(bundleIngredients)}
            finance={finance}
          />
        </div>
      ) : (
        <div className="bzp-tier-list">
          {priceTiers.map((t, i) => (
            <div key={t.id} className="bzp-tier-block">
              <div className="bzp-tier-row">
                <input
                  autoFocus={i === 0}
                  className="bzp-input"
                  placeholder="Tier label (e.g. Retail, Wholesale)"
                  value={t.label}
                  onChange={e => updateTier(t.id, 'label', e.target.value)}
                />
                <input
                  type="number" step="0.01" min="0"
                  className="bzp-input narrow"
                  value={t.price}
                  onChange={e => updateTier(t.id, 'price', parseFloat(e.target.value) || 0)}
                />
                <div className="bzp-tier-qty">
                  <span className="bzp-tier-qty-label">for</span>
                  <input
                    type="number" step="1" min="1"
                    className="bzp-input narrow qty"
                    value={t.qty ?? 1}
                    onChange={e => updateTier(t.id, 'qty', parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <MarginTag price={Number(t.price) || 0} cogs={ingredientsTotal(t.ingredients)} />
                <button
                  type="button"
                  className="bzp-icon-btn danger"
                  onClick={() => removeTier(t.id)}
                  disabled={priceTiers.length <= 1}
                >🗑</button>
              </div>
              <IngredientEditor
                ingredients={t.ingredients}
                onAdd={() => addTierIngredient(t.id)}
                onUpdate={(ingId, field, value) => updateTierIngredient(t.id, ingId, field, value)}
                onRemove={ingId => removeTierIngredient(t.id, ingId)}
                inventoryItems={inventoryItems}
              />
              <CostBreakdown
                price={Number(t.price) || 0}
                cogs={ingredientsTotal(t.ingredients)}
                qty={Number(t.qty) || 1}
                finance={finance}
              />
            </div>
          ))}
          <button type="button" className="bzp-btn tiny" onClick={addTier}>＋ Add price tier</button>
        </div>
      )}

      <div className="bzp-specifics">
        <div className="bzp-specifics-label">Product-specific</div>
        <div className="bzp-specifics-row">
          <div className="bzp-field">
            <label className="bzp-field-label">Rush fee</label>
            <input
              type="number" step="0.01" min="0"
              className="bzp-input narrow"
              value={rushFee}
              onChange={e => setRushFee(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="bzp-field">
            <label className="bzp-field-label">Min order qty</label>
            <input
              type="number" step="1" min="0"
              className="bzp-input narrow"
              value={minOrderQty}
              onChange={e => setMinOrderQty(e.target.value)}
              placeholder="None"
            />
          </div>
          <div className="bzp-field">
            <label className="bzp-field-label">Prep time (min)</label>
            <input
              type="number" step="5" min="0"
              className="bzp-input narrow"
              value={prepTimeMinutes}
              onChange={e => setPrepTimeMinutes(e.target.value)}
              placeholder="None"
            />
          </div>
        </div>
        <div className="bzp-specifics-row">
          <label className="bzp-check-row">
            <input type="checkbox" checked={seasonal} onChange={e => setSeasonal(e.target.checked)} />
            Seasonal / limited-time
          </label>
          {seasonal && (
            <input
              className="bzp-input grow"
              value={seasonalWindow}
              onChange={e => setSeasonalWindow(e.target.value)}
              placeholder="e.g. Oct – Dec"
            />
          )}
        </div>
      </div>

      <div className="bzp-row-actions">
        {saved && <span className="bzp-saved">✓ Saved</span>}
        <button type="button" className="bzp-btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
        <button type="button" className="bzp-btn primary" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function AiPricingResearch({ product, researching, researchError, onResearch, onApply }) {
  const r = product.aiPricing;
  return (
    <div className="bzp-ai">
      <div className="bzp-ai-head">
        <span className="bzp-ai-title">🤖 AI Pricing Research <span className="bzp-ai-free">free</span></span>
        <button type="button" className="bzp-btn tiny" onClick={onResearch} disabled={researching}>
          {researching ? 'Researching…' : r ? 'Refresh' : 'Research'}
        </button>
      </div>
      {researchError ? (
        <p className="bzp-ai-error">{researchError}</p>
      ) : researching ? (
        <p className="bzp-ai-note">Researching typical pricing for this kind of product…</p>
      ) : r ? (
        <>
          <div className="bzp-ai-prices">
            <div className="bzp-ai-price"><span>Retail</span><strong>{currency(r.retail)}</strong></div>
            <div className="bzp-ai-price"><span>Wholesale</span><strong>{currency(r.wholesale)}</strong></div>
            {r.bulk != null && <div className="bzp-ai-price"><span>Bulk/Case</span><strong>{currency(r.bulk)}</strong></div>}
          </div>
          {r.summary && <p className="bzp-ai-summary">{r.summary}</p>}
          {r.market && (
            <div className="bzp-ai-market">
              <div className="bzp-ai-market-head">
                <span className="bzp-ai-market-title">Market research</span>
                <span className={`bzp-ai-market-badge ${marketPositionClass(r.market.positioning)}`}>{r.market.positioning}</span>
              </div>
              <div className="bzp-ai-market-range">
                Comparable products typically sell for <strong>{currency(r.market.low)} – {currency(r.market.high)}</strong>
              </div>
              <p className="bzp-ai-market-note">{r.market.note}</p>
            </div>
          )}
          <button type="button" className="bzp-btn tiny" onClick={onApply}>Apply to price tiers</button>
        </>
      ) : (
        <p className="bzp-ai-note">One click reads this product's title and cost of goods and researches Retail, Wholesale, and Bulk/Case pricing for it — plus a competitor price range and premium/budget positioning read — with a summary of the reasoning. Nothing to type, no account needed.</p>
      )}
    </div>
  );
}

function MarginTag({ price, cogs }) {
  const margin = price - cogs;
  const marginPct = price > 0 ? (margin / price) * 100 : null;
  return (
    <span className="bzp-tier-margin" title="Profit margin">
      {marginPct !== null ? `${currency(margin)} · ${marginPct.toFixed(0)}%` : '—'}
    </span>
  );
}

/* Read-only cost-of-goods line for a tier/bundle in view mode — the
 * total plus which ingredients it's made of. */
function ViewCogs({ cogs, ingredients }) {
  return (
    <div className="bzp-view-cogs">
      Cost of goods <strong>{currency(cogs)}</strong>
      {ingredients?.length > 0 && (
        <span className="bzp-view-cogs-ingredients">
          {' — '}{ingredients.filter(i => i.name).map(i => `${i.name} ${currency(i.price)}`).join(', ')}
        </span>
      )}
    </div>
  );
}

/* Read-only per-unit cost breakdown for one tier/bundle, combining
 * its own price and cost of goods with the business-wide overhead
 * and processing-fee numbers from computeFinance() — plus how many
 * units of this tier need to sell each month to cover the whole
 * business's overhead. `qty` is how many units the tier's price
 * covers (e.g. "$30 for 12"), so price/cogs are normalized to a
 * single unit before the math runs. */
function CostBreakdown({ price, cogs, qty = 1, finance }) {
  if (!finance || (!finance.totalOverhead && !finance.feePct)) return null;
  const unitPrice = qty > 0 ? price / qty : price;
  const unitCogs = qty > 0 ? cogs / qty : cogs;
  const feeAmount = unitPrice * (finance.feePct / 100);
  const fullCostPerUnit = unitCogs + feeAmount + finance.overheadPerUnit;
  const contributionPerUnit = unitPrice - unitCogs - feeAmount;
  const breakEvenUnits = finance.totalOverhead > 0 && contributionPerUnit > 0
    ? Math.ceil(finance.totalOverhead / contributionPerUnit)
    : null;

  return (
    <div className="bzp-cost-breakdown">
      {finance.overheadPerUnit > 0 && (
        <span className="bzp-chip">🏢 Overhead {currency(finance.overheadPerUnit)}/unit</span>
      )}
      {finance.feePct > 0 && (
        <span className="bzp-chip">💳 Fee {currency(feeAmount)} ({finance.feePct}%)</span>
      )}
      {(finance.overheadPerUnit > 0 || finance.feePct > 0) && (
        <span className="bzp-chip">📐 Full cost {currency(fullCostPerUnit)}/unit</span>
      )}
      {finance.totalOverhead > 0 && (
        <span className="bzp-breakeven">
          {breakEvenUnits !== null
            ? `Break-even: ${breakEvenUnits} unit${breakEvenUnits === 1 ? '' : 's'}/mo`
            : 'Break-even: price doesn\u2019t cover cost + fees'}
        </span>
      )}
    </div>
  );
}

/* Editable ingredient list for one tier (or a bundle) — each
 * ingredient has its own price, and the running total (this tier's
 * cost of goods) is shown live at the top. An ingredient can
 * optionally link to an Inventory item (see applyIngredientField
 * above): once linked, price is derived from qty used × that item's
 * cost per unit instead of typed by hand, and that link is what lets
 * Demand Analysis work out how much of this ingredient is needed for
 * every open order using this tier. */
function IngredientEditor({ ingredients, onAdd, onUpdate, onRemove, inventoryItems }) {
  const total = ingredientsTotal(ingredients);
  return (
    <div className="bzp-ingredients">
      <div className="bzp-ingredients-head">
        <span className="bzp-field-label">Ingredients / cost of goods</span>
        <span className="bzp-ingredients-total">Total <strong>{currency(total)}</strong></span>
      </div>
      {(ingredients || []).map(ing => {
        const linkedItem = ing.inventoryItemId ? (inventoryItems || []).find(i => i.id === ing.inventoryItemId) : null;
        return (
          <div key={ing.id} className="bzp-ingredient-block">
            <div className="bzp-ingredient-row">
              <input
                className="bzp-input"
                placeholder="Ingredient (e.g. Flour, Sugar, Butter)"
                value={ing.name}
                onChange={e => onUpdate(ing.id, 'name', e.target.value)}
              />
              <input
                type="number" step="0.01" min="0"
                className="bzp-input narrow"
                value={ing.price}
                readOnly={!!ing.inventoryItemId}
                title={ing.inventoryItemId ? 'Derived from the linked inventory item — edit qty used, or unlink to type a price by hand.' : undefined}
                onChange={e => onUpdate(ing.id, 'price', parseFloat(e.target.value) || 0)}
              />
              <button type="button" className="bzp-icon-btn danger" onClick={() => onRemove(ing.id)}>🗑</button>
            </div>
            <div className="bzp-ingredient-link-row">
              <select
                className="bzp-input bzp-ingredient-link-select"
                value={ing.inventoryItemId || ''}
                onChange={e => onUpdate(ing.id, 'inventoryItemId', e.target.value || null)}
              >
                <option value="">Not linked to Inventory</option>
                {(inventoryItems || []).map(item => (
                  <option key={item.id} value={item.id}>{item.name || 'Untitled item'}{item.unit ? ` (${item.unit})` : ''}</option>
                ))}
              </select>
              {linkedItem && (
                <>
                  <label className="bzp-ingredient-link-qty">
                    Qty used
                    <input
                      type="number" step="any" min="0"
                      className="bzp-input narrow"
                      value={ing.qtyUsed ?? ''}
                      onChange={e => onUpdate(ing.id, 'qtyUsed', e.target.value)}
                    />
                  </label>
                  <span className="bzp-ingredient-link-unit">{linkedItem.unit || 'unit'}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="bzp-btn tiny" onClick={onAdd}>＋ Add ingredient</button>
    </div>
  );
}
