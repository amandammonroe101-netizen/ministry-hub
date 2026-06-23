/* ─────────────────────────────────────────────────────────────
   writingDocsStore — per-document Firestore storage for Writing
   Mode.

   Why this exists:
     The Writing page used to keep ALL documents in one kv blob
     ('writing:documents'). Firestore caps a single document at
     1 MB, so a few rich docs (especially with inlined images)
     could push the blob past the limit and make saves fail.

   Storage model:
     /users/{uid}/writingDocs/{docId}  →  the full document object

   Each writing document is its own Firestore doc, so the 1 MB
   limit now applies per-document instead of to the whole library.

   Public surface:
     useWritingDocs() → {
       docs,        // array of document objects (live)
       loading,
       createDoc,   // (docObj) → docObj   (optimistic)
       updateDoc,   // (id, patchOrFn)     (optimistic, merge)
       removeDoc,   // (id)
       updateMany,  // (ids[], patch)      (batched merge)
     }

   On first run for a user, any legacy 'writing:documents' blob is
   migrated into the collection (one-time, guarded by a flag), so
   existing documents carry over without the user lifting a finger.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState, useCallback } from 'react';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc as fsDeleteDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';
import { getValue, setValue } from './userStore';

const colRef = (uid) => collection(db, 'users', uid, 'writingDocs');
const docRef = (uid, id) => doc(db, 'users', uid, 'writingDocs', String(id));

/* Bumping this key re-runs the migration (e.g. if the legacy shape
   ever changes). V1 = initial split out of the kv blob. */
const MIGRATION_FLAG = 'writing:docsMigratedV1';

export function useWritingDocs() {
  const { user } = useAuth();
  const uid = user?.uid || null;

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));

  /* Live subscription to the whole collection. The page does its own
     sorting (by updatedAt), so we don't impose an order here. */
  useEffect(() => {
    if (!uid) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      colRef(uid),
      (snap) => { setDocs(snap.docs.map(d => d.data())); setLoading(false); },
      (err) => {
        setLoading(false);
        // eslint-disable-next-line no-console
        console.error('[writingDocs] subscription error:', err);
      }
    );
    return unsub;
  }, [uid]);

  /* One-time migration of the legacy single-blob library into the
     per-document collection. Guarded by a flag so it only runs once
     per user; leaves the old blob in place (harmless) as a backup. */
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const done = await getValue(uid, MIGRATION_FLAG);
        if (done || cancelled) return;
        const legacy = await getValue(uid, 'writing:documents');
        if (Array.isArray(legacy) && legacy.length) {
          const batch = writeBatch(db);
          legacy.forEach(d => {
            if (d && d.id != null) batch.set(docRef(uid, d.id), d);
          });
          await batch.commit();
        }
        if (!cancelled) await setValue(uid, MIGRATION_FLAG, true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[writingDocs] migration failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const createDoc = useCallback(async (docObj) => {
    setDocs(prev => [docObj, ...prev]); // optimistic
    if (uid) {
      try { await setDoc(docRef(uid, docObj.id), docObj); }
      catch (e) { console.error('[writingDocs] create failed:', e); } // eslint-disable-line no-console
    }
    return docObj;
  }, [uid]);

  /* Accepts a partial patch object OR an updater fn (doc) => patch,
     mirroring useState's functional form. Always stamps updatedAt. */
  const updateDoc = useCallback(async (id, patchOrFn) => {
    let computed = null;
    setDocs(prev => prev.map(d => {
      if (d.id !== id) return d;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(d) : patchOrFn;
      computed = { ...patch, updatedAt: new Date().toISOString() };
      return { ...d, ...computed };
    }));
    if (uid && computed) {
      try { await setDoc(docRef(uid, id), computed, { merge: true }); }
      catch (e) { console.error('[writingDocs] update failed:', e); } // eslint-disable-line no-console
    }
  }, [uid]);

  const removeDoc = useCallback(async (id) => {
    setDocs(prev => prev.filter(d => d.id !== id)); // optimistic
    if (uid) {
      try { await fsDeleteDoc(docRef(uid, id)); }
      catch (e) { console.error('[writingDocs] delete failed:', e); } // eslint-disable-line no-console
    }
  }, [uid]);

  /* Merge the same patch into many docs in one batched write — used
     when un-filing a whole series' documents at once. */
  const updateMany = useCallback(async (ids, patch) => {
    const list = Array.isArray(ids) ? ids : [];
    const full = { ...patch, updatedAt: new Date().toISOString() };
    setDocs(prev => prev.map(d => (list.includes(d.id) ? { ...d, ...full } : d)));
    if (uid && list.length) {
      try {
        const batch = writeBatch(db);
        list.forEach(id => batch.set(docRef(uid, id), full, { merge: true }));
        await batch.commit();
      } catch (e) { console.error('[writingDocs] batch update failed:', e); } // eslint-disable-line no-console
    }
  }, [uid]);

  return { docs, loading, createDoc, updateDoc, removeDoc, updateMany };
}
