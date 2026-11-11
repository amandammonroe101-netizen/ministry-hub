/* Journal service — Firestore-backed.
   Storage layout: /users/{uid}/kv/journal-entries
   Each entry stores small text fields directly. Big image data URLs are
   uploaded to Firebase Storage and the entry keeps only image_url +
   image_path references. Pre-migration entries with image_data are
   transparently migrated on next save. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';
import { uploadDataUrl, deleteBlobAtPath } from '../lib/userStorage';

const KEY = 'journal-entries';

/* If `image_data` is a data URL, upload it to Storage and replace with
   image_url + image_path. If it's already an https URL, leave it.

   Used to silently swallow upload failures and fall back to keeping
   the data URL inline, which caused two problems:
     1. Big images (>1 MiB) made the entries doc exceed Firestore's
        per-doc limit, so saves started failing for non-obvious reasons.
     2. The user had no idea Storage was misconfigured.
   Now we let the underlying error bubble up — the handler in
   Journal.jsx maps it to a clear user-facing message. The fallback
   to `image_url` inside `uploadBlob` still handles small (≤700 KB)
   images when Storage is unreachable, so most attached images
   succeed even without Storage configured. */
async function moveImageToStorage(uid, entry) {
  const img = entry?.image_data;
  if (typeof img !== 'string' || !img.startsWith('data:')) return entry;
  const result = await uploadDataUrl(uid, 'journal-images', img);
  const { image_data, ...rest } = entry;
  /* `uploadBlob` returns `{ inline: true }` for small blobs when
     Storage was unreachable — in that case there's no `path` to
     track, just an inline data URL we re-attach. */
  if (result.inline) {
    return { ...rest, image_url: result.url, image_path: '' };
  }
  return { ...rest, image_url: result.url, image_path: result.path };
}

export const journalService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    // Sort newest first (matches old SQL ORDER BY created_at DESC)
    return wrap([...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap(list.find(e => e.id === id) || null);
  },

  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    let entry = {
      id:                makeId('j'),
      title:             data.title || '',
      content:           data.content || '',
      mood:              data.mood || 'peaceful',
      scripture:         data.scripture || null,
      verse_text:        data.verse_text || null,
      verses:            data.verses || '[]',
      prompt_used:       data.prompt_used ? 1 : 0,
      prompt_text:       data.prompt_text || null,
      image_data:        data.image_data || null, // legacy field — preserved for old entries
      /* Per-entry visual theme id (picks from JOURNAL_THEMES in
         lib/journalPageSettings.js). Defaults 'default' for entries
         saved before this field existed. */
      theme_id:          data.theme_id || 'default',
      is_answered:       0,
      /* Entry lock — preserved across saves so locked entries stay
         locked. Empty values are fine (defaults are unlocked). */
      is_locked:         data.is_locked ? 1 : 0,
      lock_code:         data.lock_code || '',
      /* Optional list of prayer ids the entry references (Integrations
         → Link prayers). Stored as a JSON-stringified array so the
         shim treats it like any other scalar field. */
      linked_prayer_ids: Array.isArray(data.linked_prayer_ids)
        ? JSON.stringify(data.linked_prayer_ids)
        : (data.linked_prayer_ids || '[]'),
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };
    entry = await moveImageToStorage(uid, entry);
    await writeList(uid, KEY, [entry, ...list]);
    return wrap(entry);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const existing = list.find(e => e.id === id);
    if (!existing) return wrap(null);

    let next = {
      ...existing,
      ...data,
      prompt_used: data.prompt_used !== undefined ? (data.prompt_used ? 1 : 0) : existing.prompt_used,
      is_locked:   data.is_locked   !== undefined ? (data.is_locked   ? 1 : 0) : (existing.is_locked || 0),
      lock_code:   data.lock_code   !== undefined ? (data.lock_code || '')     : (existing.lock_code || ''),
      /* Stringify linked_prayer_ids if caller passes an array. */
      linked_prayer_ids: Array.isArray(data.linked_prayer_ids)
        ? JSON.stringify(data.linked_prayer_ids)
        : (data.linked_prayer_ids !== undefined ? (data.linked_prayer_ids || '[]') : (existing.linked_prayer_ids || '[]')),
      updated_at: new Date().toISOString(),
    };

    /* If the image changed: delete the old Storage blob (if any) before
       moving the new one up. */
    if (data.image_data !== undefined && data.image_data !== existing.image_data) {
      if (existing.image_path) {
        deleteBlobAtPath(existing.image_path).catch(() => {});
      }
      next = await moveImageToStorage(uid, next);
    }

    const updatedList = list.map(e => (e.id === id ? next : e));
    await writeList(uid, KEY, updatedList);
    return wrap(next);
  },

  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const target = list.find(e => e.id === id);
    if (target?.image_path) {
      deleteBlobAtPath(target.image_path).catch(() => {});
    }
    await writeList(uid, KEY, list.filter(e => e.id !== id));
    return wrap({ id });
  },
};
