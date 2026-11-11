/* ─────────────────────────────────────────────────────────────
   userStore — per-user, key/value Firestore storage that mirrors
   the localStorage shape the rest of the app already uses.

   Storage model:
     /users/{uid}/kv/{key}  →  { value: <anything>, updatedAt }

   Each "key" is a single document holding the entire value blob.
   This intentionally matches our localStorage pattern (one key →
   one JSON blob) so migrating a page is a near-drop-in swap.

   For pages that need real per-row isolation (e.g. very large
   lists, granular sharing) use Firestore collections directly.
   The kv pattern is for everything else — it's simple and fast.

   Public surface:
     getValue(uid, key)            → Promise<any | null>
     setValue(uid, key, value)     → Promise<void>
     deleteValue(uid, key)         → Promise<void>
     subscribeValue(uid, key, cb)  → unsubscribe()
     useUserStoreKey(key, initial) → [value, setValue, { loading, error }]
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/* Firestore doc IDs can't contain '/' — encode our colon-prefixed keys
   ("blog:posts", "podcast:projects") to a flat, safe id. */
const encodeKey = (key) => encodeURIComponent(key);

const kvDocRef = (uid, key) => doc(db, 'users', uid, 'kv', encodeKey(key));

/** One-shot read. Returns the stored value or null if the doc doesn't exist. */
export async function getValue(uid, key) {
  if (!db || !uid) return null;
  const snap = await getDoc(kvDocRef(uid, key));
  if (!snap.exists()) return null;
  return snap.data().value;
}

/** Upsert — overwrites the entire value for this key. */
export async function setValue(uid, key, value) {
  if (!db || !uid) return;
  await setDoc(kvDocRef(uid, key), {
    value,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteValue(uid, key) {
  if (!db || !uid) return;
  await deleteDoc(kvDocRef(uid, key));
}

/** Live subscription. Calls cb(value) whenever the doc changes server-side.
 *  Returns the unsubscribe function. */
export function subscribeValue(uid, key, cb) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    kvDocRef(uid, key),
    (snap) => cb(snap.exists() ? snap.data().value : null),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[userStore] subscribeValue error:', err);
      cb(null);
    }
  );
}

/* ─── Hook ──────────────────────────────────────────────────────
   useUserStoreKey('blog:posts', [])

   Returns a tuple identical to useState but the value is synced
   with the current user's Firestore doc at /users/{uid}/kv/<key>.

   - On mount, subscribes via onSnapshot for real-time updates
     across devices (and across this app's tabs).
   - setValue writes immediately and optimistically updates local
     state so the UI doesn't have to wait for the round-trip.
   - When the user signs out, value resets to `initial`.

   `initial` is what useState falls back to before the first
   snapshot arrives and when no doc exists yet.
   ───────────────────────────────────────────────────────────── */
export function useUserStoreKey(key, initial = null) {
  const { user } = useAuth();
  const uid = user?.uid || null;

  const [value, setLocal] = useState(initial);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState(null);

  /* Re-subscribe whenever the user or key changes. */
  useEffect(() => {
    if (!uid) {
      setLocal(initial);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      kvDocRef(uid, key),
      (snap) => {
        setLocal(snap.exists() ? snap.data().value : initial);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
        // eslint-disable-next-line no-console
        console.error(`[userStore] subscription error on "${key}":`, err);
      }
    );
    return unsub;
    // We intentionally do NOT depend on `initial` — it's an
    // initial-only default and re-running on every render would
    // be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  /* Optimistic write — update local state, then push to Firestore.
     Accepts either a value or an updater fn, mirroring useState. */
  const latestRef = useRef(value);
  latestRef.current = value;

  const setValueAndPersist = useCallback(
    async (next) => {
      const resolved = typeof next === 'function' ? next(latestRef.current) : next;
      setLocal(resolved);
      if (!uid) return; // No-op while logged out — initial-state behavior
      try {
        await setValue(uid, key, resolved);
      } catch (err) {
        setError(err);
        // eslint-disable-next-line no-console
        console.error(`[userStore] write failed for "${key}":`, err);
      }
    },
    [uid, key]
  );

  return [value, setValueAndPersist, { loading, error }];
}
