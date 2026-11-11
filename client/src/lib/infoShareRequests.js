/* ─────────────────────────────────────────────────────────────
   infoShareRequests — ask a member to share their email and/or
   phone number when those fields are hidden from the directory
   (see redactForOtherMembers in contactRequests.js). Unlike a
   Contacts connection, this is a one-off, purpose-scoped request
   ("Business Ministry needs it to fill out an order") rather than
   a persistent relationship — the recipient explicitly accepts or
   declines each time, and nothing is shared without that consent.

   Docs live at /infoShareRequests/{requestId} (auto-generated id):
     { senderUid, senderName,
       recipientUid, recipientName,
       wantEmail, wantPhone,        // which fields were asked for
       context,                     // e.g. "Order — Sweet Treats Bakery"
       message,                     // optional personal note from the sender
       status: 'pending' | 'accepted' | 'declined',
       sharedEmail, sharedPhone,    // filled in by the recipient on accept
       createdAt, respondedAt }
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { useAuth } from '../context/AuthContext';

/** Ask a member to share their email and/or phone with you. */
export async function requestInfoShare(me, target, { wantEmail = false, wantPhone = false, context = '', message = '' } = {}) {
  if (!db) throw new Error('Firestore unavailable.');
  const myUid = auth?.currentUser?.uid;
  if (!myUid) throw new Error('Not signed in.');
  if (!target?.uid || target.uid === myUid) throw new Error("Can't request info from yourself.");
  if (!wantEmail && !wantPhone) throw new Error('Nothing to request.');

  const ref = await addDoc(collection(db, 'infoShareRequests'), {
    senderUid:     myUid,
    senderName:    me?.displayName || 'A member',
    recipientUid:  target.uid,
    recipientName: target.displayName || 'Member',
    wantEmail,
    wantPhone,
    context,
    message: message.trim(),
    status:      'pending',
    sharedEmail: '',
    sharedPhone: '',
    createdAt:   serverTimestamp(),
  });
  return ref.id;
}

/** Recipient accepts — pulls a FRESH copy of their own email/phone
 *  straight from their profile doc (not whatever the sender's client
 *  might have cached) and writes it onto the request for the sender
 *  to pick up. */
export async function acceptInfoShare(req) {
  if (!db) throw new Error('Firestore unavailable.');
  const myUid = auth?.currentUser?.uid;
  if (!myUid) throw new Error('Not signed in.');
  if (req.recipientUid !== myUid) throw new Error('This request is for someone else.');

  const meSnap = await getDoc(doc(db, 'users', myUid));
  const me = meSnap.exists() ? meSnap.data() : {};

  await updateDoc(doc(db, 'infoShareRequests', req.id), {
    status:      'accepted',
    sharedEmail: req.wantEmail ? (me.email || '') : '',
    sharedPhone: req.wantPhone ? (me.phone || '') : '',
    respondedAt: serverTimestamp(),
  });
}

/** Recipient declines — nothing is shared. */
export async function declineInfoShare(req) {
  if (!db) throw new Error('Firestore unavailable.');
  const myUid = auth?.currentUser?.uid;
  if (!myUid) throw new Error('Not signed in.');
  if (req.recipientUid !== myUid) throw new Error('This request is for someone else.');
  await updateDoc(doc(db, 'infoShareRequests', req.id), {
    status:      'declined',
    respondedAt: serverTimestamp(),
  });
}

/** Withdraw a request you sent, or dismiss a resolved one from either side. */
export async function deleteInfoShareRequest(req) {
  if (!db) throw new Error('Firestore unavailable.');
  await deleteDoc(doc(db, 'infoShareRequests', req.id));
}

/* ─── Hooks ─────────────────────────────────────────────────── */

function subscribePair(uid, setter, setLoading) {
  if (!uid || !db) {
    setter([]);
    setLoading(false);
    return () => {};
  }
  setLoading(true);
  const sentQ = query(collection(db, 'infoShareRequests'), where('senderUid', '==', uid));
  const recvQ = query(collection(db, 'infoShareRequests'), where('recipientUid', '==', uid));

  let sent = null, recv = null;
  const emit = () => {
    if (sent === null || recv === null) return;
    setter([...sent, ...recv]);
    setLoading(false);
  };
  const unsubSent = onSnapshot(sentQ, (snap) => {
    sent = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  }, () => { sent = []; emit(); });
  const unsubRecv = onSnapshot(recvQ, (snap) => {
    recv = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  }, () => { recv = []; emit(); });

  return () => { unsubSent(); unsubRecv(); };
}

/** All infoShareRequests docs (any status) involving the current
 *  user, as sender or recipient — the Contacts page's "Info
 *  Requests" tab (and any other picker, like Business Orders)
 *  derives incoming / outgoing / resolved buckets from this. */
export function useMyInfoShareRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => subscribePair(user?.uid || null, setRequests, setLoading), [user?.uid]);

  return { requests, loading };
}
