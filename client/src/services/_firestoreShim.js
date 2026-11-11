/* ─────────────────────────────────────────────────────────────
   Internal helper used by the Firestore-backed service shims.

   Each existing service (songService, friendsService, etc.) was an
   Axios wrapper that returned `{ data: { success, data: <payload> } }`.
   We keep that response shape so pages don't have to change every
   call site — the shim just synthesizes the wrapper.

   Storage layout: each service owns a top-level key under
   /users/{uid}/kv/<key> and stores an array as its value.
   ───────────────────────────────────────────────────────────── */

import { auth } from '../lib/firebase';
import { getValue, setValue } from '../lib/userStore';

/** Throw a clear, recognizable error if the user isn't signed in.
 *  All service methods route through this so the page sees the same
 *  error shape regardless of which method triggered it. */
export function requireUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    const err = new Error('Not signed in.');
    err.code = 'auth/not-authenticated';
    throw err;
  }
  return uid;
}

/** Generate a stable random id with an optional prefix. */
export function makeId(prefix = '') {
  const id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${id}` : id;
}

/** Read the current list at a key (defaults to []). */
export async function readList(uid, key) {
  const v = await getValue(uid, key);
  return Array.isArray(v) ? v : [];
}

/** Write a list back to a key. */
export async function writeList(uid, key, list) {
  await setValue(uid, key, Array.isArray(list) ? list : []);
}

/** Wrap a value in the legacy Axios-ish response shape so existing
 *  `.then(r => r.data.data)` patterns in pages keep working. */
export function wrap(payload) {
  return { data: { success: true, data: payload } };
}
