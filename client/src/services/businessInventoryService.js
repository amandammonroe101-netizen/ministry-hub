/* Business Ministry — inventory (ingredients, packaging, supplies),
   Firestore-backed (one doc per item, scoped under its owning
   business).

   Storage layout:
     /users/{uid}/businesses/{businessId}/inventory/{itemId}

   Unlike Customers & Orders, inventory can't be derived from
   anything else in the app — how much flour is on the shelf right
   now isn't implied by any order — so this is genuinely new,
   manually-maintained data. Same one-doc-per-item shape as
   businessProductService/businessOrderService.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';

const COLL_NAME = 'inventory';

export const INVENTORY_CATEGORIES = [
  { value: 'ingredient', label: 'Ingredient' },
  { value: 'packaging',  label: 'Packaging' },
  { value: 'supply',     label: 'Supply' },
  { value: 'other',      label: 'Other' },
];

function inventoryCollRef(uid, businessId) {
  return collection(db, 'users', uid, 'businesses', businessId, COLL_NAME);
}
function inventoryDocRef(uid, businessId, id) {
  return doc(db, 'users', uid, 'businesses', businessId, COLL_NAME, id);
}

export function defaultInventoryItem(data = {}) {
  return {
    id:       data.id || makeId('inv'),
    name:     data.name || '',
    category: data.category || 'ingredient',
    quantity: data.quantity ?? 0,
    unit:     data.unit || '',           // free text, e.g. 'oz', 'lb', 'each', 'yards'
    costPerUnit: data.costPerUnit ?? 0,
    /* Flagged as low stock once quantity drops to/under this — null
       means "don't warn for this item" (e.g. an item you restock
       ad hoc and don't want cluttering the Low Stock count). */
    lowStockThreshold: data.lowStockThreshold ?? null,
    supplier: data.supplier || '',
    notes:    data.notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function readItem(uid, businessId, id) {
  const snap = await getDoc(inventoryDocRef(uid, businessId, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllItems(uid, businessId) {
  const snap = await getDocs(inventoryCollRef(uid, businessId));
  return snap.docs.map(d => d.data());
}

export const businessInventoryService = {
  getAll: async (businessId) => {
    const uid = requireUid();
    const list = await readAllItems(uid, businessId);
    return wrap(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  },

  create: async (businessId, data) => {
    const uid = requireUid();
    const item = defaultInventoryItem(data);
    await setDoc(inventoryDocRef(uid, businessId, item.id), item);
    return wrap(item);
  },

  update: async (businessId, id, data) => {
    const uid = requireUid();
    const cur = await readItem(uid, businessId, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(inventoryDocRef(uid, businessId, id), next);
    return wrap(next);
  },

  /** Bump quantity by a signed delta (+1 restock, -1 use) without
   *  requiring the full edit form — powers the row-level +/- buttons. */
  adjustQuantity: async (businessId, id, delta) => {
    const uid = requireUid();
    const cur = await readItem(uid, businessId, id);
    if (!cur) return wrap(null);
    const next = { ...cur, quantity: Math.max(0, (Number(cur.quantity) || 0) + delta), updated_at: new Date().toISOString() };
    await setDoc(inventoryDocRef(uid, businessId, id), next);
    return wrap(next);
  },

  delete: async (businessId, id) => {
    const uid = requireUid();
    await deleteDoc(inventoryDocRef(uid, businessId, id));
    return wrap({ id });
  },
};

/* Used by businessService.delete() to clean up every inventory item
 * when its owning business is deleted. */
export async function deleteAllInventory(uid, businessId) {
  const snap = await getDocs(inventoryCollRef(uid, businessId));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}
