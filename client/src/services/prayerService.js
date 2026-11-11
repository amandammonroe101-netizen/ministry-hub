/* Prayers service — Firestore-backed.
   /users/{uid}/kv/prayer-requests → array of prayer objects.
   Each prayer embeds its updates array AND its linked friend_ids array. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY = 'prayer-requests';

export const prayerService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap([...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap(list.find(p => p.id === id) || null);
  },

  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const prayer = {
      id:          makeId('pr'),
      title:       data.title || '',
      content:     data.content || '',
      category:    data.category || 'General',
      status:      data.status || 'praying',
      is_urgent:   data.is_urgent ? 1 : 0,
      /* LEGACY single-verse fields — preserved so older prayers (and
         callers that still send `scripture` / `verse_text` instead of
         the new `verses` array) keep working. New saves use `verses`. */
      scripture:   data.scripture || null,
      verse_text:  typeof data.verse_text === 'string' ? data.verse_text : '',
      /* Multi-verse list — array of `{ ref, text }`. The detail
         Request tab renders each one as a collapsible card so the
         user can stack multiple references on a single prayer. */
      verses:      Array.isArray(data.verses) ? data.verses : [],
      is_daily:    data.is_daily ? 1 : 0,
      entry_type:  data.entry_type || 'request',
      updates:     [],
      /* Honor friend_ids on the create payload — the New Prayer form
         lets the user pick "Praying For" friends, but this was
         hardcoded to [] which silently dropped every selection. The
         user could pick Sarah/Tom/etc. and they'd never land on the
         saved prayer. Now we accept whatever the form sent (with a
         safe-array fallback). */
      friend_ids:  Array.isArray(data.friend_ids) ? data.friend_ids : [],
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    };
    await writeList(uid, KEY, [prayer, ...list]);
    return wrap(prayer);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(p => p.id === id ? {
      ...p,
      ...data,
      is_urgent: data.is_urgent !== undefined ? (data.is_urgent ? 1 : 0) : p.is_urgent,
      is_daily:  data.is_daily  !== undefined ? (data.is_daily  ? 1 : 0) : p.is_daily,
      updated_at: new Date().toISOString(),
    } : p);
    await writeList(uid, KEY, next);
    return wrap(next.find(p => p.id === id) || null);
  },

  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(p => p.id !== id));
    return wrap({ id });
  },

  addUpdate: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const updateRow = {
      id:         makeId('pu'),
      content:    data.content || '',
      created_at: new Date().toISOString(),
    };
    const next = list.map(p => p.id === id ? {
      ...p,
      updates: [...(p.updates || []), updateRow],
      updated_at: new Date().toISOString(),
    } : p);
    await writeList(uid, KEY, next);
    return wrap(updateRow);
  },

  /* Remove a single update entry from a prayer's updates timeline.
     Returns the full updated prayer (matching update/addUpdate). */
  deleteUpdate: async (prayerId, updateId) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(p => p.id === prayerId ? {
      ...p,
      updates: (p.updates || []).filter(u => u.id !== updateId),
      updated_at: new Date().toISOString(),
    } : p);
    await writeList(uid, KEY, next);
    return wrap(next.find(p => p.id === prayerId) || null);
  },

  setFriends: async (id, friend_ids) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const ids = Array.isArray(friend_ids) ? friend_ids : [];
    const next = list.map(p => p.id === id ? {
      ...p,
      friend_ids: ids,
      updated_at: new Date().toISOString(),
    } : p);
    await writeList(uid, KEY, next);
    /* Return the FULL updated prayer (not just {id, friend_ids}) —
       the page does `setSelected(res.data.data)` and writes back
       into the prayers array, so a stub would strip title/content/
       category from the cached prayer and crash subsequent renders.
       Matches the shape returned by `update()` and `addUpdate()`. */
    return wrap(next.find(p => p.id === id) || null);
  },
};
