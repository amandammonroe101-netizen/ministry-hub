/* Business Ministry — public invoice share links.

   Storage layout:
     /publicInvoices/{token}   ← top-level, NOT under /users/{uid},
                                  so an unauthenticated customer can
                                  read it via a plain link.

   An invoice is always generated 1:1 from an order (see
   businessOrderService.js's invoiceNumber/invoiceShareToken fields).
   When a member clicks "Get shareable link", we write a read-only
   *snapshot* of that order + its business here — never the live order
   doc itself, since that lives under the member's private /users/{uid}
   tree the public can't reach. The snapshot is re-published (resync)
   any time the invoiced order changes, so the public page stays
   accurate (e.g. reflects a payment as soon as it's logged).

   Deliberately excludes the order's internal `notes` field — those
   are the member's own notes to themselves, not meant for a customer
   who opens the link. `customMessage` (already customer-facing
   elsewhere in Orders) is included.
   ─────────────────────────────────────────────────────────── */
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId } from './_firestoreShim';

function tokenDocRef(token) {
  return doc(db, 'publicInvoices', token);
}

function snapshotFrom({ businessId, business, order }) {
  const subtotal = (order.items || []).reduce((sum, it) => sum + (Number(it.unitPrice) || 0) * (Number(it.qty) || 0), 0);
  const total = subtotal + (Number(order.rushFee) || 0) + (Number(order.tax) || 0) - (Number(order.discount) || 0);
  const balance = total - (Number(order.amountPaid) || 0);
  return {
    businessId,
    orderId:        order.id,
    businessName:   business?.name || '',
    businessIcon:   business?.icon || '🏢',
    invoiceNumber:    order.invoiceNumber,
    invoiceIssueDate: order.invoiceIssueDate,
    invoiceSentAt:    order.invoiceSentAt,
    customerName:    order.customerName || '',
    customerEmail:   order.customerEmail || '',
    customerPhone:   order.customerPhone || '',
    customerAddress: order.customerAddress || '',
    customMessage:   order.customMessage || '',
    items:    order.items || [],
    rushFee:  Number(order.rushFee) || 0,
    discount: Number(order.discount) || 0,
    tax:      Number(order.tax) || 0,
    subtotal, total, balance,
    amountPaid:    Number(order.amountPaid) || 0,
    paymentStatus: order.paymentStatus || 'unpaid',
    dueDate: order.dueDate || '',
    dueTime: order.dueTime || '',
  };
}

export const publicInvoiceService = {
  /** Create (or reuse) a share link for this order's invoice, writing
   *  the initial public snapshot. Returns the token. */
  publish: async (businessId, business, order) => {
    const uid = requireUid();
    const token = order.invoiceShareToken || makeId('pubinv');
    const now = new Date().toISOString();
    await setDoc(tokenDocRef(token), {
      token,
      ownerUid: uid,
      ...snapshotFrom({ businessId, business, order }),
      created_at: now,
      updated_at: now,
    });
    return token;
  },

  /** Re-publish the snapshot after the underlying order changes
   *  (payment logged, items edited, etc). No-op if no link exists. */
  resync: async (businessId, business, order) => {
    if (!order.invoiceShareToken) return;
    const uid = requireUid();
    await setDoc(tokenDocRef(order.invoiceShareToken), {
      token: order.invoiceShareToken,
      ownerUid: uid,
      ...snapshotFrom({ businessId, business, order }),
      updated_at: new Date().toISOString(),
    }, { merge: true });
  },

  /** Revoke a share link — the page stops resolving for anyone
   *  holding the old URL. */
  revoke: async (token) => {
    if (!token) return;
    await deleteDoc(tokenDocRef(token));
  },

  /** Public, unauthenticated read — used by PublicInvoice.jsx. */
  getOne: async (token) => {
    const snap = await getDoc(tokenDocRef(token));
    return snap.exists() ? snap.data() : null;
  },
};
