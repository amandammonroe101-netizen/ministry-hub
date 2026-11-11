/* directChat — open an instantly-usable 1:1 private channel with a
   known Contacts connection, with NO invite/accept step.

   The regular Chat flow (see chatInvites.js) always makes the owner
   send an invite that the other person must accept before a private
   channel becomes usable — by design, so a channel can't gain a
   second member without that member's consent.

   This helper is for places in the app (like a ministry directory's
   "Chat" button on someone you're already mutually-connected with in
   Contacts) where that consent step is redundant: the two of you are
   already connected, so there's no one to ask permission from. It
   creates the channel with BOTH uids in `memberUids` from the start.

   This is allowed by docs/firestore.rules — channel `create` only
   requires the creator's own uid to be a member of `memberUids`, not
   that they're the ONLY member:
     allow create: if request.auth != null
       && request.resource.data.ownerUid == request.auth.uid
       && request.resource.data.type in ['public', 'private']
       && request.auth.uid in request.resource.data.memberUids;
   So a two-person `memberUids` array at creation time is rule-legal
   without an invite doc — the other person can already `read` the
   channel (their uid is in memberUids) the moment it's created. */

import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/** Finds an existing 1:1 private channel between the two uids, or
 *  creates a new one with both already as members. Returns the
 *  channel id. */
export async function ensureDirectChannel({ myUid, myName, otherUid, otherName }) {
  if (!db) throw new Error('Firestore unavailable.');
  if (!myUid) throw new Error('Not signed in.');
  if (!otherUid) throw new Error('No contact selected.');
  if (otherUid === myUid) throw new Error("You can't chat with yourself.");

  // Look for a channel we're already both in — direct-chat channels
  // are tagged `direct: true` and hold exactly these two members, so
  // repeated clicks reopen the same room instead of creating dupes.
  const q = query(
    collection(db, 'channels'),
    where('memberUids', 'array-contains', myUid),
    where('direct', '==', true),
  );
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => {
    const m = d.data().memberUids || [];
    return m.length === 2 && m.includes(otherUid);
  });
  if (existing) return existing.id;

  const docRef = await addDoc(collection(db, 'channels'), {
    type:        'private',
    direct:      true, // marks this as a no-invite 1:1 room (see rules/comment above)
    name:        otherName || 'Direct message',
    description: '',
    ownerUid:    myUid,
    memberUids:  [myUid, otherUid],
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });
  return docRef.id;
}
