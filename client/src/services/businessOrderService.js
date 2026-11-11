/* Business Ministry — customer orders, Firestore-backed
   (one doc per order, scoped under its owning business).

   Storage layout:
     /users/{uid}/businesses/{businessId}/orders/{orderId}

   Same one-doc-per-item shape as businessProductService — customer
   info, line items (each a snapshot of the product/tier/customization
   chosen at order time so later catalog edits never rewrite history),
   fulfillment, and payment all live on the order's own doc.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';

const COLL_NAME = 'orders';

export const ORDER_STATUSES = [
  { value: 'new',         label: 'New' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready',       label: 'Ready' },
  { value: 'fulfilled',   label: 'Fulfilled' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
];

// Orders in these statuses are done — they move to the read-only
// Past tab (Orders) and drop out of demand planning (Demand
// Analysis), since there's nothing left to make/buy for them.
export const PAST_ORDER_STATUSES = ['completed', 'cancelled'];

// An order also counts as "past" the moment it's Paid in Full,
// regardless of fulfillment status — once the money's settled,
// there's nothing left to work on, so it moves out of Active too.
export function isPastOrder(order) {
  return PAST_ORDER_STATUSES.includes(order.status) || order.paymentStatus === 'paid';
}

export const PAYMENT_STATUSES = [
  { value: 'unpaid',  label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit Paid' },
  { value: 'paid',    label: 'Paid in Full' },
];

export const INVOICE_STATUSES = [
  { value: 'not_invoiced', label: 'Not Invoiced' },
  { value: 'draft',        label: 'Draft' },
  { value: 'sent',         label: 'Sent' },
  { value: 'overdue',      label: 'Overdue' },
  { value: 'paid',         label: 'Paid' },
];

/** Derive an invoice's lifecycle status from the order it was
 *  generated from, instead of storing a separate status field that
 *  could drift out of sync — payment truth always lives on the order
 *  itself (paymentStatus/dueDate), so this is the one place that
 *  reads it. Shared by BusinessInvoices.jsx (authenticated) and
 *  PublicInvoice.jsx (the public share-link page), which both work
 *  from an order-shaped object with the same field names. */
export function deriveInvoiceStatus(order) {
  if (!order?.invoiceNumber) return 'not_invoiced';
  if (order.paymentStatus === 'paid') return 'paid';
  const today = new Date().toISOString().slice(0, 10);
  if (order.dueDate && order.dueDate < today) return 'overdue';
  if (order.invoiceSentAt) return 'sent';
  return 'draft';
}

function ordersCollRef(uid, businessId) {
  return collection(db, 'users', uid, 'businesses', businessId, COLL_NAME);
}
function orderDocRef(uid, businessId, id) {
  return doc(db, 'users', uid, 'businesses', businessId, COLL_NAME, id);
}

export function defaultOrderItem(data = {}) {
  return {
    id:          data.id || makeId('item'),
    productId:   data.productId || null,
    productName: data.productName || '',
    tierLabel:   data.tierLabel || '',
    unitPrice:   data.unitPrice ?? 0,
    qty:         data.qty ?? 1,
    flavor:      data.flavor || '',
    filling:     data.filling || '',
    frosting:    data.frosting || '',
    size:        data.size || '',
    notes:       data.notes || '',
  };
}

export function defaultOrder(data = {}) {
  return {
    id: makeId('order'),
    customerUid:     data.customerUid || null,   // set when the customer was picked from the member directory
    customerInfoRequestId: data.customerInfoRequestId || null, // infoShareRequests doc id, if hidden email/phone was requested for this order
    customerName:    data.customerName || '',
    customerPhone:   data.customerPhone || '',
    customerEmail:   data.customerEmail || '',
    customerAddress: data.customerAddress || '',
    items: (data.items || []).map(defaultOrderItem),
    fulfillmentMethod: data.fulfillmentMethod || '',
    dueDate: data.dueDate || '',
    dueTime: data.dueTime || '',
    customMessage: data.customMessage || '',
    rushFee:  data.rushFee ?? 0,
    discount: data.discount ?? 0,
    tax:      data.tax ?? 0,
    paymentStatus: data.paymentStatus || 'unpaid',
    amountPaid:    data.amountPaid ?? 0,
    status: data.status || 'new',
    notes:  data.notes || '',
    /* Invoice — generated 1:1 from this order by the Invoices &
       Payments page (see BusinessInvoices.jsx). null until a member
       clicks "Generate Invoice"; invoice *status* (Draft/Sent/Paid/
       Overdue) is deliberately NOT stored here — it's derived from
       these fields plus the order's own paymentStatus/dueDate, so
       there's only ever one source of truth for whether it's paid. */
    invoiceNumber:    data.invoiceNumber ?? null,
    invoiceIssueDate: data.invoiceIssueDate ?? null,
    invoiceSentAt:    data.invoiceSentAt ?? null,
    /* Set when a shareable public link has been generated (see
       publicInvoiceService.js) — the token doubles as the /publicInvoices
       doc id. null = no active link. */
    invoiceShareToken: data.invoiceShareToken ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function readOrder(uid, businessId, id) {
  const snap = await getDoc(orderDocRef(uid, businessId, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllOrders(uid, businessId) {
  const snap = await getDocs(ordersCollRef(uid, businessId));
  return snap.docs.map(d => d.data());
}

export const businessOrderService = {
  getAll: async (businessId) => {
    const uid = requireUid();
    const list = await readAllOrders(uid, businessId);
    return wrap(list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  },

  getOne: async (businessId, id) => {
    const uid = requireUid();
    return wrap(await readOrder(uid, businessId, id));
  },

  create: async (businessId, data) => {
    const uid = requireUid();
    const order = defaultOrder(data);
    await setDoc(orderDocRef(uid, businessId, order.id), order);
    return wrap(order);
  },

  update: async (businessId, id, data) => {
    const uid = requireUid();
    const cur = await readOrder(uid, businessId, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(orderDocRef(uid, businessId, id), next);
    return wrap(next);
  },

  delete: async (businessId, id) => {
    const uid = requireUid();
    await deleteDoc(orderDocRef(uid, businessId, id));
    return wrap({ id });
  },
};

/* Used by businessService.delete() to clean up every order when its
 * owning business is deleted. */
export async function deleteAllOrders(uid, businessId) {
  const snap = await getDocs(ordersCollRef(uid, businessId));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}
