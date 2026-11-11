/* founderRequestService — the Settings page's "Send a Request" feature.
   Any signed-in user can file a bug report / feature request / add-on
   idea here; it lands in the founderRequests Firestore collection where
   the Founder Dashboard's Requests panel picks it up (see
   docs/firestore.rules for the rules that make this safe: anyone can
   create their own request, only the sender + founder can read it, and
   only the founder can change its status). */
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export const REQUEST_TYPES = [
  { id: 'bug',     label: 'Bug / App Fix' },
  { id: 'feature', label: 'Feature Request' },
  { id: 'addon',   label: 'Add-on / Integration' },
  { id: 'other',   label: 'Something Else' },
];

export const REQUEST_PRIORITIES = [
  { id: 'low',    label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high',   label: 'High' },
];

export const REQUEST_STATUSES = [
  { id: 'new',         label: 'New' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done',        label: 'Done' },
  { id: 'declined',    label: 'Declined' },
];

const COLLECTION = 'founderRequests';

const byNewestFirst = (a, b) =>
  (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);

/** File a new request from the Settings page form. `dueDate`, if given,
 *  is a plain 'YYYY-MM-DD' string from a native date input — kept as a
 *  string (not a Timestamp) since it's a user-picked calendar day, not
 *  a moment in time. */
export async function submitFounderRequest({ type, title, description, priority, dueDate, senderName, senderEmail }) {
  if (!db) throw new Error('Firestore unavailable.');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  if (!title?.trim()) throw new Error('Please add a short title.');

  await addDoc(collection(db, COLLECTION), {
    senderUid:   uid,
    senderName:  senderName || 'Member',
    senderEmail: senderEmail || '',
    type:        type || 'other',
    title:       title.trim(),
    description: (description || '').trim(),
    priority:    priority || 'medium',
    dueDate:     dueDate || null,
    status:      'new',
    createdAt:   serverTimestamp(),
  });
}

/** Every request this signed-in user has filed (most recent first). */
export async function getMyFounderRequests() {
  if (!db) return [];
  const uid = auth?.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('senderUid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewestFirst);
}

/** Every request ever filed — powers the Founder Dashboard's Requests panel. */
export async function listFounderRequests() {
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewestFirst);
}

/** Founder-only: move a request through New → In Progress → Done/Declined. */
export async function updateFounderRequestStatus(id, status) {
  if (!db) throw new Error('Firestore unavailable.');
  await updateDoc(doc(db, COLLECTION, id), { status, respondedAt: serverTimestamp() });
}

/** Founder-only: re-triage a request's priority (Low/Medium/High). */
export async function updateFounderRequestPriority(id, priority) {
  if (!db) throw new Error('Firestore unavailable.');
  await updateDoc(doc(db, COLLECTION, id), { priority });
}

/** Founder-only: set or clear a founder-assigned due date — independent
 *  of the sender's own optional due date, shown alongside it. */
export async function updateFounderDueDate(id, founderDueDate) {
  if (!db) throw new Error('Firestore unavailable.');
  await updateDoc(doc(db, COLLECTION, id), { founderDueDate: founderDueDate || null });
}

/** Sender: ask the founder to open two-way chat on this request, with an
 *  optional note explaining why. Only moves the flag to 'requested' — the
 *  founder still has to accept before the sender's own chat messages are
 *  allowed through by firestore.rules. */
export async function requestTwoWayAccess(id, note) {
  if (!db) throw new Error('Firestore unavailable.');
  await updateDoc(doc(db, COLLECTION, id), {
    twoWayStatus: 'requested',
    twoWayNote: (note || '').trim(),
  });
}

/** Founder-only: accept or decline a pending two-way chat request. */
export async function respondToTwoWayRequest(id, accept) {
  if (!db) throw new Error('Firestore unavailable.');
  await updateDoc(doc(db, COLLECTION, id), { twoWayStatus: accept ? 'accepted' : 'declined' });
}

/** Every message on a request's chat thread, oldest first. The founder
 *  can always post here (one-way, no permission needed); the sender can
 *  only post once twoWayStatus is 'accepted' — enforced in firestore.rules. */
export async function getRequestMessages(requestId) {
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTION, requestId, 'messages'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

/** Post a message on a request's chat thread. `role` is 'founder' or
 *  'user' — firestore.rules checks it actually matches who's signed in. */
export async function sendRequestMessage(requestId, { role, text }) {
  if (!db) throw new Error('Firestore unavailable.');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  if (!text?.trim()) return;
  await addDoc(collection(db, COLLECTION, requestId, 'messages'), {
    senderUid: uid,
    senderRole: role,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

/** Founder dismissing a request, or the sender withdrawing their own. */
export async function deleteFounderRequest(id) {
  if (!db) throw new Error('Firestore unavailable.');
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Sender confirming they've read a one-way message and clearing the
 *  thread — wipes every message on the request so the chat "room"
 *  disappears from both the sender's and founder's Chat pages (it
 *  only shows up there while it has at least one message). The
 *  underlying request itself (title/status/priority) is untouched —
 *  only the conversation is cleared. */
export async function clearRequestMessages(requestId) {
  if (!db) throw new Error('Firestore unavailable.');
  const snap = await getDocs(collection(db, COLLECTION, requestId, 'messages'));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
