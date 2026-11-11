/* Setlists service — Firestore-backed.
   /users/{uid}/kv/setlists → array of setlist objects.
   Each setlist embeds `songs: [{ link_id, song_id, sort_order, notes, leader_id }]`
   where link_id is the per-row id (matches the legacy SQL join row id).
   `leader_id` is a Roster member id — who leads that specific song, picked
   from the linked Schedule item's Worship Leader/Vocal crew. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY      = 'setlists';
const SONGS_KEY = 'songs';

async function readSongIndex(uid) {
  const songs = await readList(uid, SONGS_KEY);
  const byId = new Map();
  songs.forEach(s => byId.set(s.id, s));
  return byId;
}

/* Hydrate a setlist's `songs` array with the full song record so the page
   can render title/key/tempo. Matches the legacy server response.
   `override_key` lets a setlist transpose a song for that service only —
   the effective `song_key` reflects the override, while `original_key`
   preserves the song library's own key for reference/reset. */
async function hydrate(uid, setlist) {
  if (!setlist) return setlist;
  const byId = await readSongIndex(uid);
  const songs = (setlist.songs || []).map(row => {
    const s = byId.get(row.song_id);
    if (!s) return null;
    const override_key = row.override_key || '';
    return {
      ...s,
      link_id:      row.link_id,
      sort_order:   row.sort_order,
      notes:        row.notes,
      original_key: s.song_key,
      override_key,
      song_key:     override_key || s.song_key,
      leader_id:    row.leader_id || null,
    };
  }).filter(Boolean);
  return { ...setlist, songs };
}

export const setlistService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    // Hydrate each setlist's song list so callers see full song objects
    const hydrated = await Promise.all(list.map(s => hydrate(uid, s)));
    return wrap(hydrated.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap(await hydrate(uid, list.find(s => s.id === id) || null));
  },

  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const setlist = {
      id:           makeId('sl'),
      name:         data.name || '',
      description:  data.description || '',
      occasion:     data.occasion || '',
      event_date:   data.event_date || '',
      leader:       data.leader || null,     // { id, name } — pulled from Roster/Subs
      played_at:    null,                    // set once "Mark as Played" is confirmed
      scheduled_item_id: null,               // linked Schedule-page service id (band:schedule) — its crew/role assignments render as an outline on this setlist
      songs:        [],
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };
    await writeList(uid, KEY, [setlist, ...list]);
    return wrap(setlist);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => s.id === id
      ? { ...s, ...data, updated_at: new Date().toISOString() }
      : s);
    await writeList(uid, KEY, next);
    return wrap(next.find(s => s.id === id) || null);
  },

  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(s => s.id !== id));
    return wrap({ id });
  },

  addSong: async (id, song_id, notes) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const link = {
      link_id:    makeId('sls'),
      song_id,
      sort_order: 0,
      notes:      notes || '',
      leader_id:  null,
    };
    const next = list.map(s => {
      if (s.id !== id) return s;
      const songs = Array.isArray(s.songs) ? s.songs : [];
      link.sort_order = songs.length;
      return { ...s, songs: [...songs, link], updated_at: new Date().toISOString() };
    });
    await writeList(uid, KEY, next);
    return wrap(link);
  },

  updateSongNotes: async (id, linkId, notes) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        songs: (s.songs || []).map(r => r.link_id === linkId ? { ...r, notes: notes || '' } : r),
        updated_at: new Date().toISOString(),
      };
    });
    await writeList(uid, KEY, next);
    return wrap({ link_id: linkId, notes });
  },

  updateSongKey: async (id, linkId, overrideKey) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        songs: (s.songs || []).map(r => r.link_id === linkId ? { ...r, override_key: overrideKey || '' } : r),
        updated_at: new Date().toISOString(),
      };
    });
    await writeList(uid, KEY, next);
    return wrap({ link_id: linkId, override_key: overrideKey || '' });
  },

  updateSongLeader: async (id, linkId, leaderId) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        songs: (s.songs || []).map(r => r.link_id === linkId ? { ...r, leader_id: leaderId || null } : r),
        updated_at: new Date().toISOString(),
      };
    });
    await writeList(uid, KEY, next);
    return wrap({ link_id: linkId, leader_id: leaderId || null });
  },

  removeSong: async (id, linkId) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        songs: (s.songs || []).filter(r => r.link_id !== linkId).map((r, i) => ({ ...r, sort_order: i })),
        updated_at: new Date().toISOString(),
      };
    });
    await writeList(uid, KEY, next);
    return wrap({ link_id: linkId });
  },

  /* Clone a setlist — useful as a "Save as template" for recurring services
     (e.g. "Sunday Morning"). Resets the event date and played status since
     the copy is a fresh, not-yet-scheduled instance; keeps songs, team,
     and leader as a starting point. Returns the raw (unhydrated) copy —
     callers should re-fetch via getOne() to get hydrated song objects. */
  duplicate: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const source = list.find(s => s.id === id);
    if (!source) throw new Error('Setlist not found');
    const now = new Date().toISOString();
    const copy = {
      ...source,
      id:                makeId('sl'),
      name:              `${source.name || 'Untitled'} (Copy)`,
      event_date:        '',
      played_at:         null,
      scheduled_item_id: null,
      songs:             (source.songs || []).map(row => ({ ...row, link_id: makeId('sls') })),
      created_at: now,
      updated_at: now,
    };
    await writeList(uid, KEY, [copy, ...list]);
    return wrap(copy);
  },

  reorderSongs: async (id, order) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(s => {
      if (s.id !== id) return s;
      const byLink = new Map((s.songs || []).map(r => [r.link_id, r]));
      const reordered = (order || [])
        .map((linkId, i) => byLink.get(linkId) && { ...byLink.get(linkId), sort_order: i })
        .filter(Boolean);
      const ordered = new Set(order || []);
      const tail = (s.songs || []).filter(r => !ordered.has(r.link_id));
      return { ...s, songs: [...reordered, ...tail], updated_at: new Date().toISOString() };
    });
    await writeList(uid, KEY, next);
    return wrap({ id });
  },
};
