/* Business Ministry — the businesses a member runs, Firestore-backed
   (one doc per business).

   Storage layout:
     /users/{uid}/businesses/{businessId}
     /users/{uid}/businesses/{businessId}/products/{productId}  ← see businessProductService.js

   A member can run several businesses side by side (a bakery AND an
   Etsy shop AND a consulting LLC). "Duplicate" clones a business doc
   under a new id/name and deep-copies every sub-collection (currently
   just products) into it, so the new business starts as an
   independent copy — editing one never touches the other.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';
import { copyAllProducts } from './businessProductService';
import { deleteAllOrders } from './businessOrderService';
import { deleteAllCustomers } from './businessCustomerService';
import { deleteAllInventory } from './businessInventoryService';

const COLL_NAME = 'businesses';

const BUSINESS_ICONS = ['🏢', '🧁', '🛍', '🎨', '🧵', '📷', '🛠', '🌿', '💻', '📚', '🍯', '✂️'];
const BUSINESS_COLORS = ['#059669', '#d97706', '#0ea5e9', '#a855f7', '#f43f5e', '#65a30d'];

function businessesCollRef(uid) {
  return collection(db, 'users', uid, COLL_NAME);
}
function businessDocRef(uid, id) {
  return doc(db, 'users', uid, COLL_NAME, id);
}

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

function defaultBusiness(data = {}) {
  const id = makeId('biz');
  const seed = id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    id,
    name:        data.name || 'Untitled Business',
    icon:        data.icon || pick(BUSINESS_ICONS, seed),
    color:       data.color || pick(BUSINESS_COLORS, seed),
    description: data.description || '',
    /* What kind of business this is (Bakery, Cafe, Online Bakery,
       Retail, etc. — see BUSINESS_CATEGORIES in BusinessOverview.jsx).
       Asked once at creation so the workspace can eventually tailor
       itself (default binders, terminology) to the business type;
       purely informational for now. '' = not set / "Other" left blank. */
    category:    data.category || '',
    /* Product "binders" — top-level catalog sections a member
       defines for themselves (e.g. "Baked Goods", "Custom Orders",
       "Digital Downloads"). Each product belongs to at most one
       binder via its binderId (see businessProductService.js).
       Lives on the business doc since it's catalog-wide
       organization, not per-product data. */
    productBinders: data.productBinders || [],
    /* Overhead & fees — business-wide numbers the Pricing page uses to
       spread fixed costs across every unit sold and to compute a
       break-even point per product tier. Not tied to any one
       product/tier since rent, tool wear, software, and insurance are
       paid regardless of what's being made. */
    overheadCosts: data.overheadCosts || [               // [{ id, label, monthlyAmount }]
      { id: makeId('oh'), label: 'Rent', monthlyAmount: 0 },
      { id: makeId('oh'), label: 'Utensils/tools wear', monthlyAmount: 0 },
      { id: makeId('oh'), label: 'Software', monthlyAmount: 0 },
      { id: makeId('oh'), label: 'Insurance', monthlyAmount: 0 },
    ],
    /* Expected units sold per month across the whole business — used
       to spread the overheadCosts total across each unit. */
    estimatedMonthlyUnits: data.estimatedMonthlyUnits ?? 0,
    /* Named payment/platform processing fee rates (Etsy, Square,
       Stripe, etc.) — activeProcessingFeeId picks which one is applied
       to per-unit cost and break-even math on the Pricing page. */
    processingFees: data.processingFees || [              // [{ id, label, pct }]
      { id: makeId('fee'), label: 'Etsy', pct: 6.5 },
      { id: makeId('fee'), label: 'Square', pct: 2.6 },
      { id: makeId('fee'), label: 'Stripe', pct: 2.9 },
    ],
    activeProcessingFeeId: data.activeProcessingFeeId ?? null,
    /* Sequential invoice numbering (INV-0001, INV-0002, …) — the
       Invoices & Payments page reads this, stamps it onto the order
       being invoiced, then increments it here so numbers are never
       reused even if an invoiced order is later deleted. */
    nextInvoiceNumber: data.nextInvoiceNumber ?? 1,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };
}

async function readBusiness(uid, id) {
  const snap = await getDoc(businessDocRef(uid, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllBusinesses(uid) {
  const snap = await getDocs(businessesCollRef(uid));
  return snap.docs.map(d => d.data());
}

async function deleteAllProducts(uid, businessId) {
  const snap = await getDocs(collection(db, 'users', uid, COLL_NAME, businessId, 'products'));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

export const businessService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readAllBusinesses(uid);
    return wrap(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    return wrap(await readBusiness(uid, id));
  },

  create: async (data) => {
    const uid = requireUid();
    const business = defaultBusiness(data);
    await setDoc(businessDocRef(uid, business.id), business);
    return wrap(business);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const cur = await readBusiness(uid, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(businessDocRef(uid, id), next);
    return wrap(next);
  },

  rename: async (id, name) => {
    return businessService.update(id, { name });
  },

  /** Clone a business (metadata + every product) into a brand new,
   *  independently-editable business. `name` defaults to
   *  "<original> (Copy)" when not given. */
  duplicate: async (id, name) => {
    const uid = requireUid();
    const source = await readBusiness(uid, id);
    if (!source) return wrap(null);
    const copy = {
      ...defaultBusiness({ ...source, name: name || `${source.name} (Copy)` }),
    };
    await setDoc(businessDocRef(uid, copy.id), copy);
    await copyAllProducts(uid, id, copy.id);
    return wrap(copy);
  },

  delete: async (id) => {
    const uid = requireUid();
    await deleteAllProducts(uid, id);
    await deleteAllOrders(uid, id);
    await deleteAllCustomers(uid, id);
    await deleteAllInventory(uid, id);
    await deleteDoc(businessDocRef(uid, id));
    return wrap({ id });
  },

  /** Hand out the next sequential invoice number ("INV-0001", …) and
   *  bump the counter so it's never reused, even if the invoiced order
   *  is later deleted. Used by the Invoices & Payments page when a
   *  member clicks "Generate Invoice" on an order. */
  consumeNextInvoiceNumber: async (id) => {
    const uid = requireUid();
    const cur = await readBusiness(uid, id);
    if (!cur) return wrap(null);
    const n = cur.nextInvoiceNumber ?? 1;
    const next = { ...cur, nextInvoiceNumber: n + 1, updated_at: new Date().toISOString() };
    await setDoc(businessDocRef(uid, id), next);
    return wrap({ number: `INV-${String(n).padStart(4, '0')}`, business: next });
  },
};
