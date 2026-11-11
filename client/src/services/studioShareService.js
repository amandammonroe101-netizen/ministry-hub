/* ─────────────────────────────────────────────────────────────
   studioShareService

   "Send a copy" feature — the sender writes a one-shot project
   snapshot to /studioShares/{id}. A chat message references this
   id; the recipient clicks "Import" which copies the snapshot
   into their own /users/{uid}/kv/studio-projects list, then
   deletes the snapshot.

   Doc shape:
     /studioShares/{id}
       senderUid:      who sent it
       senderName:     denormalized for the chat card
       recipientUid:   who can import it
       project:        full project payload (same shape as personal projects)
       created_at
   ───────────────────────────────────────────────────────────── */

import {
  doc, getDoc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const COLLECTION = 'studioShares';

function uid() {
  const u = auth?.currentUser?.uid;
  if (!u) throw new Error('Not signed in.');
  return u;
}

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a clone of `project` ready to be persisted as a /studioShares
 *  snapshot. Strips any per-user metadata. */
export function cloneProjectForCopy(project) {
  const cleanTracks = (project.tracks || []).map(t => ({
    ...t,
    /* Re-id tracks + clips so the imported copy doesn't collide with
       the source project (which the sender still owns). */
    id: makeId('tr'),
    clips: (t.clips || []).map(c => ({ ...c, id: makeId('clip') })),
  }));
  return {
    id:                 makeId('sp'),
    name:               project.name || 'Shared project',
    tempo:              project.tempo ?? 100,
    time_signature:     project.time_signature || '4/4',
    master_volume:      project.master_volume ?? 1,
    record_latency_ms:  project.record_latency_ms ?? 0,
    tracks:             cleanTracks,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };
}

export const studioShareService = {
  /** Create a "send a copy" snapshot for `recipientUid`. Returns
   *  the share id, which the chat message will reference. */
  async createShare({ project, senderName, recipientUid }) {
    const senderUid = uid();
    const shareId   = makeId('share');
    const snapshot  = cloneProjectForCopy(project);
    await setDoc(doc(db, COLLECTION, shareId), {
      senderUid,
      senderName: senderName || 'Member',
      recipientUid,
      project: snapshot,
      created_at: new Date().toISOString(),
    });
    return shareId;
  },

  async getShare(shareId) {
    const snap = await getDoc(doc(db, COLLECTION, shareId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async deleteShare(shareId) {
    await deleteDoc(doc(db, COLLECTION, shareId));
  },

  /** Claim a share: copy the snapshot into the recipient's own
   *  studio-projects kv list and delete the share. Returns the
   *  imported project. The recipient can then navigate to the
   *  Studio and find the project at the top of their list. */
  async importShare(shareId) {
    const myUid = uid();
    const share = await this.getShare(shareId);
    if (!share)                        throw new Error('That share no longer exists.');
    if (share.recipientUid !== myUid)  throw new Error('This share isn\'t addressed to you.');

    /* Read the recipient's project list, prepend the imported
       project, write back. Mirrors the shape studioProjectService
       uses to persist projects. */
    const ref  = doc(db, 'users', myUid, 'kv', 'studio-projects');
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data().value || []) : [];
    await setDoc(ref, {
      value: [share.project, ...current],
      updatedAt: new Date().toISOString(),
    });

    /* Delete the snapshot so it doesn't clutter /studioShares.
       Best-effort — if the delete fails the import already
       succeeded and the user has their copy. */
    try { await deleteDoc(doc(db, COLLECTION, shareId)); } catch {}

    return share.project;
  },
};
