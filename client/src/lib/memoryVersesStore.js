/* Tiny shared store for Memory Verses.

   Verses live in localStorage under `mh_memory_verses`. Both the
   Journal dashboard (where the user adds + interacts with the
   current verse) and Page Settings → Archived / Memorized tabs
   (where the user manages the historical list) need to read and
   write the same array — and changes in one place need to flow to
   the other immediately.

   This hook gives both consumers a synced view by:
     • Reading from localStorage on mount.
     • Broadcasting a `mh-verses-updated` window event on every write.
     • Subscribing to that event + the native `storage` event so a
       write in one component triggers a re-read everywhere else. */

import { useEffect, useState, useCallback } from 'react';

const KEY      = 'mh_memory_verses';
const EVENT    = 'mh-verses-updated';

function normalize(v) {
  return {
    id:          v.id || `mv_${Math.random().toString(36).slice(2, 10)}`,
    ref:         v.ref || '',
    text:        v.text || '',
    numbered:    Array.isArray(v.numbered) ? v.numbered : [],
    addedAt:     v.addedAt || new Date().toISOString(),
    active:      !!v.active,
    archived:    v.archived === true,
    memorized:   v.memorized === true,
    memorizedAt: v.memorizedAt || null,
    srEventIds:  Array.isArray(v.srEventIds) ? v.srEventIds : [],
  };
}

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.map(normalize) : [];
  } catch { return []; }
}

function writeAll(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* noop */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* noop */ }
}

export function useMemoryVerses() {
  const [verses, setVerses] = useState(readAll);

  useEffect(() => {
    const refresh = () => setVerses(readAll());
    window.addEventListener(EVENT, refresh);
    /* `storage` only fires for OTHER tabs/windows, but it's cheap
       to listen for in case the user has the app open in two tabs. */
    window.addEventListener('storage', (e) => {
      if (!e || e.key === KEY) refresh();
    });
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const save = useCallback((arr) => {
    setVerses(arr);
    writeAll(arr);
  }, []);

  return [verses, save];
}
