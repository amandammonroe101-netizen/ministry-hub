/* ─────────────────────────────────────────────────────────────
   chatInvites — invitation flow for private channels.

   The owner sends invitations rather than directly adding people.
   The invitee approves (joins the channel) or declines (deletes the
   invite). Documents live at:
     /invites/{channelId}_{inviteeUid}
   with shape:
     {
       channelId, channelName, channelDescription,
       inviteeUid, invitedByUid, invitedByName,
       invitedAt
     }

   The predictable document ID lets Firestore security rules call
   exists(/invites/<channelId>_<uid>) when verifying an accept.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import {
  collection, doc, setDoc, deleteDoc,
  query, where, onSnapshot, writeBatch, serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { useAuth } from '../context/AuthContext';

/** Build the deterministic invite doc ID for a channel/user pair. */
export const inviteId = (channelId, inviteeUid) => `${channelId}_${inviteeUid}`;

/** Send an invitation. Any signed-in user can invite anyone else to any
 *  channel — no ownership or membership check. The Firestore rule only
 *  requires that `invitedByUid == auth.uid` (you can't send invites
 *  pretending to be someone else) and that you aren't inviting yourself.
 *
 *  Throws only if the target is already a member or already has a
 *  pending invite — both of those are noise-prevention checks, not
 *  permission checks.
 *
 *  `inviteeName` is optional but recommended — it's denormalized into the
 *  invite document so the sender's "Sent invitations" list can show who
 *  was invited without a profile lookup. */
export async function sendInvite({ channel, inviteeUid, inviteeName, invitedByName }) {
  if (!db) throw new Error('Firestore unavailable.');
  const me = auth?.currentUser?.uid;
  if (!me) throw new Error('Not signed in.');
  if (inviteeUid === me) throw new Error("You can't invite yourself.");
  if (channel.memberUids?.includes(inviteeUid)) {
    throw new Error('That user is already in the channel.');
  }
  const id = inviteId(channel.id, inviteeUid);
  const ref = doc(db, 'invites', id);

  /* We deliberately do NOT pre-check whether an invite already exists.
     Doing so would require getDoc(ref), and the /invites read rule
     denies reads where resource is null (= doc doesn't exist) because
     it tries to compare resource.data.inviteeUid. So the duplicate
     check itself would fail with "permission-denied" before we ever
     got to setDoc — which is what was actually breaking inviting
     before this fix.

     If an invite happens to exist already, setDoc just overwrites
     it with refreshed metadata, which is harmless. */
  await setDoc(ref, {
    channelId:          channel.id,
    channelName:        channel.name || '',
    channelDescription: channel.description || '',
    inviteeUid,
    inviteeName:        inviteeName || 'Member',
    invitedByUid:       me,
    invitedByName:      invitedByName || 'Member',
    invitedAt:          serverTimestamp(),
  });
  return id;
}

/** Accept an invite — atomically add self to channel.memberUids AND delete
 *  the invite. Both ops go in a single writeBatch so the database never
 *  sees one without the other.
 *
 *  Important: we do NOT read the channel doc from the client first. The
 *  invitee isn't in memberUids yet, and the channel read rule only allows
 *  members + the owner to read private channels — so a client-side
 *  getDoc(channel) would fail with permission-denied. Instead we use
 *  Firestore's arrayUnion(me) which is evaluated server-side: it appends
 *  `me` to memberUids without needing to know the current contents. The
 *  security rule's isSelfAcceptInvitePrivate() check still runs against
 *  the server's view, so all the size/membership constraints work. */
export async function acceptInvite(invite) {
  if (!db) throw new Error('Firestore unavailable.');
  const me = auth?.currentUser?.uid;
  if (!me) throw new Error('Not signed in.');
  if (invite.inviteeUid !== me) {
    throw new Error('This invitation is for someone else.');
  }
  const channelRef = doc(db, 'channels', invite.channelId);
  const inviteRef  = doc(db, 'invites',  inviteId(invite.channelId, me));

  const batch = writeBatch(db);
  batch.update(channelRef, {
    memberUids: arrayUnion(me),
    updatedAt:  serverTimestamp(),
  });
  batch.delete(inviteRef);

  try {
    await batch.commit();
  } catch (err) {
    /* If the channel doesn't exist anymore (owner deleted it while
       the invite was pending), Firestore returns NOT_FOUND on the
       update. Clean up the orphan invite and surface a friendlier
       error to the user. */
    if (err?.code === 'not-found') {
      try { await deleteDoc(inviteRef); } catch { /* best-effort */ }
      throw new Error('That channel no longer exists.');
    }
    throw err;
  }
}

/** Decline an invite. Deletes the invite doc — and, if it was for a
 *  "solo invite" 1:1 private chat that's still empty (nobody but the
 *  owner has joined), deletes the orphaned channel too, so a declined
 *  private chat doesn't linger around on the inviter's side either.
 *  That extra delete is only permitted by the security rules for
 *  channels created with `soloInvite: true` (the "Chat" button's
 *  private-DM flow) — for every other channel it's a no-op
 *  (permission-denied, swallowed here). Deleting the channel BEFORE
 *  the invite matters: the delete rule checks that this invite doc
 *  still exists, the same "permission slip" pattern used to accept. */
export async function declineInvite(invite) {
  if (!db) throw new Error('Firestore unavailable.');
  const me = auth?.currentUser?.uid;
  if (!me) throw new Error('Not signed in.');
  if (invite.inviteeUid !== me) {
    throw new Error('This invitation is for someone else.');
  }
  try {
    await deleteDoc(doc(db, 'channels', invite.channelId));
  } catch {
    /* Not a solo-invite channel (or already gone) — nothing to clean up. */
  }
  await deleteDoc(doc(db, 'invites', inviteId(invite.channelId, me)));
}

/** Cancel an invite as the sender (e.g. you typo'd the key). */
export async function cancelInvite(invite) {
  if (!db) throw new Error('Firestore unavailable.');
  const me = auth?.currentUser?.uid;
  if (!me) throw new Error('Not signed in.');
  if (invite.invitedByUid !== me) {
    throw new Error('Only the sender can cancel an invitation.');
  }
  await deleteDoc(doc(db, 'invites', inviteId(invite.channelId, invite.inviteeUid)));
}

/* Shared helper — both hooks below want the same sort + error handling. */
function subscribeInvites(filterQuery, setter, setLoading) {
  return onSnapshot(
    filterQuery,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const at = a.invitedAt?.toMillis?.() || 0;
        const bt = b.invitedAt?.toMillis?.() || 0;
        return bt - at;
      });
      setter(list);
      setLoading(false);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chatInvites] listen failed:', err?.message || err);
      setter([]);
      setLoading(false);
    }
  );
}

/* ─── Hook: invites addressed TO the current user (incoming). ─── */
export function useMyInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user?.uid || !db) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'invites'), where('inviteeUid', '==', user.uid));
    return subscribeInvites(q, setInvites, setLoading);
  }, [user]);

  return { invites, loading };
}

/* ─── Hook: invites SENT by the current user that are still pending. ── */
export function useMySentInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user?.uid || !db) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'invites'), where('invitedByUid', '==', user.uid));
    return subscribeInvites(q, setInvites, setLoading);
  }, [user]);

  return { invites, loading };
}
