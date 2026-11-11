/* ─────────────────────────────────────────────────────────────
   contactRequests — search for other members and request to connect,
   powering the Contacts page (a Facebook-style "search + add friend"
   flow).

   Search reuses the public /users/{uid} profiles (readable by any
   signed-in user — see docs/firestore.rules) and filters client-side
   by displayName / email / identifying key.

   Connections live at /contactRequests/{senderUid}__{recipientUid}:
     { senderUid, senderName, senderKey,
       recipientUid, recipientName, recipientKey,
       status: 'pending' | 'accepted',
       createdAt, respondedAt }

   The same doc represents the request AND, once accepted, the
   connection itself — so "remove connection" and "cancel/decline
   request" are both just deleting this doc.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { useAuth } from '../context/AuthContext';

/** Deterministic doc ID for a sender/recipient pair. */
export const requestId = (senderUid, recipientUid) => `${senderUid}__${recipientUid}`;

/* Cache the full profile list briefly — the Contacts search box fires
   on every keystroke, and re-fetching the whole /users collection each
   time would be wasteful. 30s is plenty for a single search session. */
let profileCache = null;
let profileCacheAt = 0;
const CACHE_MS = 30_000;

async function loadAllProfiles() {
  const now = Date.now();
  if (profileCache && now - profileCacheAt < CACHE_MS) return profileCache;
  const snap = await getDocs(collection(db, 'users'));
  profileCache = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  profileCacheAt = now;
  return profileCache;
}

/** Strips fields a profile owner has hidden from other members (email,
 *  phone) before that profile leaves this module — so every caller gets
 *  privacy-safe data by construction instead of having to remember to
 *  check `emailVisible` / `phoneVisible` itself.
 *
 *  This is defence in depth, not the actual protection. A hidden field
 *  is never written to /users/{uid} in the first place (see
 *  contactFields() in userProfile.js, and the matching invariant in
 *  docs/firestore.rules) — because this function runs client-side,
 *  after the fetch, and anyone can read the raw document directly. It
 *  stays as a guard for profiles written by an older build that hasn't
 *  been healed on sign-in yet. */
function redactForOtherMembers(p) {
  const out = { ...p };
  if (out.emailVisible === false) delete out.email;
  if (out.phoneVisible === false) delete out.phone;
  return out;
}

/** Search public profiles by name, email, or identifying key.
 *  Case-insensitive substring match; excludes the current user.
 *
 *  Email matching only reaches members who have left their email
 *  visible. Searching by a *hidden* email cannot work and shouldn't:
 *  the field isn't in the document, and any scheme that let a client
 *  test it from a readable profile would also let a client enumerate
 *  it. The identifying key is the deliberate way to find someone whose
 *  details are private — it's shareable precisely because it reveals
 *  nothing else about them. */
export async function searchUsers(term, excludeUid) {
  if (!db) return [];
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [];
  const all = await loadAllProfiles();
  return all
    .filter(p => p.uid !== excludeUid)
    .filter(p => (
      (p.displayName || '').toLowerCase().includes(needle)
      || (p.email || '').toLowerCase().includes(needle)
      || (p.identifyingKey || '').toLowerCase().replace('-', '').includes(needle.replace('-', ''))
    ))
    .slice(0, 25)
    .map(redactForOtherMembers);
}

/** Send (or re-send) a connection request. Any signed-in user can
 *  request anyone else — the Firestore rule only enforces that you're
 *  acting as yourself and not requesting yourself. */
export async function sendConnectionRequest(me, target) {
  if (!db) throw new Error('Firestore unavailable.');
  const myUid = auth?.currentUser?.uid;
  if (!myUid) throw new Error('Not signed in.');
  if (target.uid === myUid) throw new Error("You can't connect with yourself.");

  const id = requestId(myUid, target.uid);
  await setDoc(doc(db, 'contactRequests', id), {
    senderUid:      myUid,
    senderName:     me.displayName || 'Member',
    senderKey:      me.identifyingKey || '',
    recipientUid:   target.uid,
    recipientName:  target.displayName || 'Member',
    recipientKey:   target.identifyingKey || '',
    status:         'pending',
    createdAt:      serverTimestamp(),
  });
  return id;
}

/** Accept an incoming pending request — flips status to 'accepted'. */
export async function acceptRequest(req) {
  if (!db) throw new Error('Firestore unavailable.');
  const me = auth?.currentUser?.uid;
  if (!me) throw new Error('Not signed in.');
  if (req.recipientUid !== me) throw new Error('This request is for someone else.');
  await updateDoc(doc(db, 'contactRequests', req.id), {
    status:      'accepted',
    respondedAt: serverTimestamp(),
  });
}

/** Decline an incoming request, cancel one you sent, or remove an
 *  existing connection — all the same operation: delete the doc. */
export async function deleteConnection(req) {
  if (!db) throw new Error('Firestore unavailable.');
  await deleteDoc(doc(db, 'contactRequests', req.id));
}

/* ─── Hooks ─────────────────────────────────────────────────── */

function subscribePair(uid, setter, setLoading) {
  if (!uid || !db) {
    setter([]);
    setLoading(false);
    return () => {};
  }
  setLoading(true);
  const sentQ = query(collection(db, 'contactRequests'), where('senderUid', '==', uid));
  const recvQ = query(collection(db, 'contactRequests'), where('recipientUid', '==', uid));

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

/** All contactRequests docs (any status) involving the current user,
 *  as sender or recipient. The Contacts page derives incoming /
 *  outgoing / connected buckets from this single stream. */
export function useMyContactRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => subscribePair(user?.uid || null, setRequests, setLoading), [user?.uid]);

  return { requests, loading };
}

/** Accepted connections only, reduced to `{ uid, name }`. Powers the
 *  "From your Contacts" name-suggestion typeahead reused across pages
 *  (Friends' Add Friend form, Women's Ministry, etc.). */
export function useMyConnections() {
  const { user } = useAuth();
  const { requests, loading } = useMyContactRequests();
  const connections = useMemo(() => {
    const myUid = user?.uid;
    if (!myUid) return [];
    return requests
      .filter(r => r.status === 'accepted')
      .map(r => r.senderUid === myUid
        ? { uid: r.recipientUid, name: r.recipientName }
        : { uid: r.senderUid, name: r.senderName });
  }, [requests, user?.uid]);
  return { connections, loading };
}
