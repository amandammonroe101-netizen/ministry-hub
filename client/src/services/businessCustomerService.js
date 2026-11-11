/* Business Ministry — customer notes, Firestore-backed
   (one doc per customer identity, scoped under its owning business).

   Storage layout:
     /users/{uid}/businesses/{businessId}/customers/{customerKey}

   The customer *directory* itself isn't stored here — BusinessCustomers.jsx
   derives it client-side by grouping order history under customerKey(),
   so "who bought from you" is always in sync with Orders and never drifts
   out of date. This collection exists only to persist the one thing that
   doesn't already live on an order: freeform notes about that person.
   ─────────────────────────────────────────────────────────── */
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, wrap } from './_firestoreShim';

const COLL_NAME = 'customers';

/** Group orders belonging to the same person under one stable key.
 *  A customerUid — set whenever the order was placed for a real,
 *  signed-up app member (see OrderEditor's member search) — is the
 *  one truly stable identifier, so it wins whenever present: it's
 *  the actual connector between the Customers & Clients directory
 *  and that person's real app account, immune to their name/email/
 *  phone changing later. Only when there's no linked member account
 *  (a manual, non-member client) does this fall back to matching by
 *  email, then phone, then name off the order's free-text fields. */
export function customerKey(order) {
  if (order.customerUid) return `uid:${order.customerUid}`;
  const email = (order.customerEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = (order.customerPhone || '').replace(/\D/g, '');
  if (phone) return `phone:${phone}`;
  const name = (order.customerName || '').trim().toLowerCase();
  return `name:${name || 'unknown'}`;
}

/** Group every order for this business by customer identity (see
 *  customerKey()) — the shared building block behind both the
 *  Customers & Clients directory and the "New Order" search, so
 *  there's exactly one definition of "who's the same person"
 *  anywhere order history is grouped. Each entry keeps its full list
 *  of orders so callers can derive whatever stats they need (revenue,
 *  order count, last order date, order history) without re-scanning. */
export function groupOrdersByCustomer(orders) {
  const byKey = new Map();
  (orders || []).forEach(order => {
    const key = customerKey(order);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: order.customerName || 'Unnamed customer',
        email: order.customerEmail || '',
        phone: order.customerPhone || '',
        address: order.customerAddress || '',
        newestCreatedAt: '',
        orders: [],
      });
    }
    const c = byKey.get(key);
    c.orders.push(order);
    // Prefer the most recently-placed order's contact details, in
    // case a repeat customer's info changed since their first order.
    if ((order.created_at || '') > c.newestCreatedAt) {
      c.newestCreatedAt = order.created_at || '';
      c.name = order.customerName || c.name;
      c.email = order.customerEmail || c.email;
      c.phone = order.customerPhone || c.phone;
      c.address = order.customerAddress || c.address;
    }
  });
  return Array.from(byKey.values());
}

/** Merge a member-directory search result list with this business's
 *  own past-customer directory, so "New Order" search shows one
 *  result per person instead of two when they're the same. A member
 *  result whose identity matches a past customer absorbs that
 *  person's order count (customerKey() is the same identity logic
 *  used to group orders in the first place); a past customer with no
 *  member account of their own still shows up as a pickable result,
 *  since plenty of real customers never sign up as members. */
export function mergeCustomerSearch(memberResults, pastCustomers, query) {
  const q = (query || '').trim().toLowerCase();
  const usedKeys = new Set();
  const merged = (memberResults || []).map(p => {
    const key = customerKey({ customerUid: p.uid, customerEmail: p.email, customerPhone: p.phone, customerName: p.displayName });
    const past = pastCustomers.find(c => c.key === key);
    if (past) usedKeys.add(key);
    return { kind: 'member', key, person: p, pastOrderCount: past?.orders.length || 0 };
  });
  const extraPast = (pastCustomers || [])
    .filter(c => !usedKeys.has(c.key))
    .filter(c => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q))
    .map(c => ({ kind: 'past', key: c.key, person: c, pastOrderCount: c.orders.length }));
  return [...merged, ...extraPast];
}

function customersCollRef(uid, businessId) {
  return collection(db, 'users', uid, 'businesses', businessId, COLL_NAME);
}
function customerDocRef(uid, businessId, key) {
  return doc(db, 'users', uid, 'businesses', businessId, COLL_NAME, key);
}

export const businessCustomerService = {
  /** Every persisted customer-notes doc for this business, keyed by
   *  customerKey() so the page can merge it onto the derived directory. */
  getAll: async (businessId) => {
    const uid = requireUid();
    const snap = await getDocs(customersCollRef(uid, businessId));
    const byKey = {};
    snap.docs.forEach(d => { byKey[d.id] = d.data(); });
    return wrap(byKey);
  },

  setNotes: async (businessId, key, notes) => {
    const uid = requireUid();
    await setDoc(customerDocRef(uid, businessId, key), { notes, updated_at: new Date().toISOString() }, { merge: true });
    return wrap({ key, notes });
  },
};

/* Used by businessService.delete() to clean up every customer-notes
 * doc when its owning business is deleted. */
export async function deleteAllCustomers(uid, businessId) {
  const snap = await getDocs(customersCollRef(uid, businessId));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}
