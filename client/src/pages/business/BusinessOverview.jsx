import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { businessService } from '../../services/businessService';
import { businessPagePath, BUSINESS_DEFAULT_SUBPATH, BUSINESS_GROUPS } from './businessConfig';
import './BusinessOverview.css';

/* ─────────────────────────────────────────────────────────────
   Business / Entrepreneur Ministry — "My Businesses" overview.

   Unlike every other ministry's Overview (a dashboard for one
   singleton ministry), this is a switcher: a card per business the
   member runs, each opening into its own BusinessShell workspace.
   "Duplicate" is how a member stands up a second business with the
   same page structure without starting from scratch — it deep-copies
   the business doc and every product in its catalog into a brand
   new, independently-named/editable business (see businessService.js).

   This page intentionally does NOT use BusinessShell — there's no
   single business selected yet, so it renders as a normal app page
   (NavRail stays visible) with its own light header.
   ───────────────────────────────────────────────────────────── */

const ICON_CHOICES = ['🏢', '🧁', '🛍', '🎨', '🧵', '📷', '🛠', '🌿', '💻', '📚', '🍯', '✂️', '🚚', '🏠'];
const COLOR_CHOICES = ['#059669', '#d97706', '#0ea5e9', '#a855f7', '#f43f5e', '#65a30d', '#d4a537'];

/* Business category — asked once at creation. Picking one auto-fills
   a matching icon (still overridable below), and shows up as a badge
   on the business's card so a member running several businesses can
   tell them apart at a glance. */
const BUSINESS_CATEGORIES = [
  { value: 'bakery',        label: 'Bakery',                    icon: '🧁' },
  { value: 'online-bakery', label: 'Online Bakery',              icon: '🎂' },
  { value: 'cafe',          label: 'Cafe / Coffee Shop',         icon: '☕' },
  { value: 'restaurant',    label: 'Restaurant / Food Truck',    icon: '🍽' },
  { value: 'retail',        label: 'Retail / Storefront',        icon: '🛍' },
  { value: 'online-shop',   label: 'Online Shop / Etsy',         icon: '📦' },
  { value: 'boutique',      label: 'Boutique / Clothing',        icon: '👗' },
  { value: 'crafts',        label: 'Handmade / Crafts',          icon: '🧵' },
  { value: 'photography',   label: 'Photography',                icon: '📷' },
  { value: 'salon',         label: 'Salon / Beauty',              icon: '💅' },
  { value: 'fitness',       label: 'Fitness / Wellness',          icon: '🧘' },
  { value: 'cleaning',      label: 'Cleaning / Home Services',    icon: '🧹' },
  { value: 'consulting',    label: 'Consulting / Freelance',      icon: '💼' },
  { value: 'digital',       label: 'Digital Products / Courses',  icon: '💻' },
  { value: 'other',         label: 'Other',                       icon: '🏢' },
];
function categoryLabel(value) {
  return BUSINESS_CATEGORIES.find(c => c.value === value)?.label || '';
}

export default function BusinessOverview() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newIcon, setNewIcon] = useState(ICON_CHOICES[0]);
  const [newColor, setNewColor] = useState(COLOR_CHOICES[0]);
  const [saving, setSaving] = useState(false);

  const [renaming, setRenaming] = useState(null);   // business id being renamed
  const [renameValue, setRenameValue] = useState('');
  const [duplicating, setDuplicating] = useState(null); // business id being duplicated
  const [duplicateValue, setDuplicateValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // business id

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await businessService.getAll();
      setBusinesses(res.data.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load businesses.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setNewName('');
    setNewCategory('');
    setNewIcon(ICON_CHOICES[Math.floor(Math.random() * ICON_CHOICES.length)]);
    setNewColor(COLOR_CHOICES[Math.floor(Math.random() * COLOR_CHOICES.length)]);
    setShowNew(true);
  }

  /* Picking a category auto-fills a matching icon so the common
     path (pick category → name it → create) needs no extra clicks —
     the icon picker below is still there to override it. */
  function chooseCategory(value) {
    setNewCategory(value);
    const cat = BUSINESS_CATEGORIES.find(c => c.value === value);
    if (cat) setNewIcon(cat.icon);
  }

  async function createBusiness() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const res = await businessService.create({ name, category: newCategory, icon: newIcon, color: newColor });
      const biz = res.data.data;
      setShowNew(false);
      navigate(businessPagePath(biz.id, `/business/:businessId/${BUSINESS_DEFAULT_SUBPATH}`));
    } catch (e) {
      setError(e?.message || 'Could not create business.');
    } finally {
      setSaving(false);
    }
  }

  function openBusiness(biz) {
    navigate(businessPagePath(biz.id, `/business/:businessId/${BUSINESS_DEFAULT_SUBPATH}`));
  }

  function startRename(biz) {
    setRenaming(biz.id);
    setRenameValue(biz.name);
  }

  async function submitRename(id) {
    const name = renameValue.trim();
    if (!name) { setRenaming(null); return; }
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, name } : b));
    setRenaming(null);
    try {
      await businessService.rename(id, name);
    } catch (e) {
      setError(e?.message || 'Could not rename business.');
      load();
    }
  }

  function startDuplicate(biz) {
    setDuplicating(biz.id);
    setDuplicateValue(`${biz.name} (Copy)`);
  }

  async function submitDuplicate(id) {
    const name = duplicateValue.trim();
    setDuplicating(null);
    try {
      await businessService.duplicate(id, name || undefined);
      load();
    } catch (e) {
      setError(e?.message || 'Could not duplicate business.');
    }
  }

  async function submitDelete(id) {
    setConfirmDelete(null);
    setBusinesses(prev => prev.filter(b => b.id !== id));
    try {
      await businessService.delete(id);
    } catch (e) {
      setError(e?.message || 'Could not delete business.');
      load();
    }
  }

  const totalPages = BUSINESS_GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="bzo-root">
      <header className="bzo-header">
        <div>
          <div className="bzo-eyebrow">Business / Entrepreneur Ministry</div>
          <h1 className="bzo-title">🏢 My Businesses</h1>
          <p className="bzo-sub">
            Each business gets its own {totalPages}-page workspace — Product Catalog, Sales, Finance,
            Customers, and more. Duplicate an existing business to stand up a new one with the same
            structure, then rename it so it's its own thing.
          </p>
        </div>
        <button type="button" className="bzo-btn primary" onClick={openNew}>
          ＋ New Business
        </button>
      </header>

      {error && (
        <div className="bzo-error">
          {error}
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="bzo-empty">Loading your businesses…</div>
      ) : businesses.length === 0 ? (
        <div className="bzo-empty">
          <div className="bzo-empty-icon">🏢</div>
          <h2>No businesses yet</h2>
          <p>Create your first business to start building out its Product Catalog.</p>
          <button type="button" className="bzo-btn primary" onClick={openNew}>＋ New Business</button>
        </div>
      ) : (
        <div className="bzo-grid">
          {businesses.map(biz => (
            <div
              key={biz.id}
              className="bzo-card"
              style={{ '--bzo-card-accent': biz.color || '#059669' }}
            >
              <button type="button" className="bzo-card-main" onClick={() => openBusiness(biz)}>
                <span className="bzo-card-icon">{biz.icon || '🏢'}</span>
                {renaming === biz.id ? (
                  <input
                    autoFocus
                    className="bzo-rename-input"
                    value={renameValue}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitRename(biz.id);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={() => submitRename(biz.id)}
                  />
                ) : (
                  <span className="bzo-card-name">{biz.name}</span>
                )}
                {biz.category && <span className="bzo-card-category">{categoryLabel(biz.category)}</span>}
                {biz.description && <span className="bzo-card-desc">{biz.description}</span>}
              </button>

              {duplicating === biz.id && (
                <div className="bzo-duplicate-row" onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    className="bzo-rename-input"
                    value={duplicateValue}
                    onChange={e => setDuplicateValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitDuplicate(biz.id);
                      if (e.key === 'Escape') setDuplicating(null);
                    }}
                    placeholder="New business name"
                  />
                  <button type="button" className="bzo-btn tiny primary" onClick={() => submitDuplicate(biz.id)}>Copy</button>
                  <button type="button" className="bzo-btn tiny" onClick={() => setDuplicating(null)}>Cancel</button>
                </div>
              )}

              {confirmDelete === biz.id ? (
                <div className="bzo-confirm-row">
                  <span>Delete "{biz.name}" and everything in it?</span>
                  <button type="button" className="bzo-btn tiny danger" onClick={() => submitDelete(biz.id)}>Delete</button>
                  <button type="button" className="bzo-btn tiny" onClick={() => setConfirmDelete(null)}>Cancel</button>
                </div>
              ) : (
                <div className="bzo-card-actions">
                  <button type="button" className="bzo-icon-btn" title="Rename" onClick={() => startRename(biz)}>✏️</button>
                  <button type="button" className="bzo-icon-btn" title="Duplicate" onClick={() => startDuplicate(biz)}>⧉</button>
                  <button type="button" className="bzo-icon-btn danger" title="Delete" onClick={() => setConfirmDelete(biz.id)}>🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="bzo-modal-backdrop" onClick={() => !saving && setShowNew(false)}>
          <div className="bzo-modal" onClick={e => e.stopPropagation()}>
            <h2>New Business</h2>
            <label className="bzo-field-label">Name</label>
            <input
              autoFocus
              className="bzo-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Sweet Grace Bakery"
              onKeyDown={e => { if (e.key === 'Enter') createBusiness(); }}
            />
            <label className="bzo-field-label">Category</label>
            <select
              className="bzo-input"
              value={newCategory}
              onChange={e => chooseCategory(e.target.value)}
            >
              <option value="">Select a category…</option>
              {BUSINESS_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
            <label className="bzo-field-label">Icon</label>
            <div className="bzo-icon-picker">
              {ICON_CHOICES.map(ic => (
                <button
                  key={ic}
                  type="button"
                  className={`bzo-icon-choice${ic === newIcon ? ' is-selected' : ''}`}
                  onClick={() => setNewIcon(ic)}
                >{ic}</button>
              ))}
            </div>
            <label className="bzo-field-label">Color</label>
            <div className="bzo-color-picker">
              {COLOR_CHOICES.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`bzo-color-choice${c === newColor ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className="bzo-modal-actions">
              <button type="button" className="bzo-btn" onClick={() => setShowNew(false)} disabled={saving}>Cancel</button>
              <button type="button" className="bzo-btn primary" onClick={createBusiness} disabled={!newName.trim() || saving}>
                {saving ? 'Creating…' : 'Create Business'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
