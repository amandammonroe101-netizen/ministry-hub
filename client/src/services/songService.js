/* Songs service — Firestore-backed.
   /users/{uid}/kv/songs → array of song objects.
   Each song embeds:
     sections: [{ id, section_type, label, content, sort_order, bars }]
     recordings: [{ id, label, audio_url, storage_path, duration, created_at }]

   Audio recording blobs live in Firebase Storage at
   /users/{uid}/song-recordings/<filename>. Pre-migration `audio_data`
   data-URLs are transparently uploaded on first save. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';
import { uploadDataUrl, deleteBlobAtPath } from '../lib/userStorage';

const KEY = 'songs';

function defaultSong(data = {}) {
  return {
    id:                makeId('s'),
    title:             data.title || '',
    artist:            data.artist || '',
    song_key:          data.song_key || '',
    tempo:             data.tempo ?? null,
    time_signature:    data.time_signature || '4/4',
    status:            data.status || 'idea',
    tags:              Array.isArray(data.tags) ? data.tags : [],
    theme:             data.theme || '',
    scripture:         data.scripture || '',
    inspiration:       data.inspiration || '',
    notes:             data.notes || '',
    performance_notes: data.performance_notes || '',
    prayer_id:         data.prayer_id || null,
    journal_id:        data.journal_id || null,
    sections:          [],
    recordings:        [],
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  };
}

/* Find a song by id, rebuild the list with a mutator applied to it.
   Returns the updated song (or null). */
async function mutateSong(uid, id, mutator) {
  const list = await readList(uid, KEY);
  let updated = null;
  const next = list.map(s => {
    if (s.id !== id) return s;
    updated = mutator({
      ...s,
      sections:   Array.isArray(s.sections)   ? s.sections   : [],
      recordings: Array.isArray(s.recordings) ? s.recordings : [],
      updated_at: new Date().toISOString(),
    });
    return updated;
  });
  await writeList(uid, KEY, next);
  return updated;
}

export const songService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap([...list].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const song = list.find(s => s.id === id) || null;
    return wrap(song);
  },

  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const song = defaultSong(data);
    await writeList(uid, KEY, [song, ...list]);
    return wrap(song);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const updated = await mutateSong(uid, id, (s) => ({ ...s, ...data }));
    return wrap(updated);
  },

  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const target = list.find(s => s.id === id);
    // Clean up any Storage blobs this song owned
    if (target?.recordings?.length) {
      target.recordings.forEach(r => {
        if (r.storage_path) deleteBlobAtPath(r.storage_path).catch(() => {});
      });
    }
    await writeList(uid, KEY, list.filter(s => s.id !== id));
    return wrap({ id });
  },

  /* ── Sections ────────────────────────────────────────── */
  addSection: async (id, data) => {
    const uid = requireUid();
    const section = {
      id:           makeId('sec'),
      section_type: data.section_type || 'verse',
      label:        data.label || '',
      content:      data.content || '',
      bars:         data.bars ?? 4,
      sort_order:   0, // set below
    };
    const updated = await mutateSong(uid, id, (s) => {
      section.sort_order = s.sections.length;
      return { ...s, sections: [...s.sections, section] };
    });
    return wrap(section);
  },

  duplicateSection: async (id, sectionId) => {
    const uid = requireUid();
    const updated = await mutateSong(uid, id, (s) => {
      const src = s.sections.find(x => x.id === sectionId);
      if (!src) return s;
      const copy = { ...src, id: makeId('sec'), sort_order: s.sections.length };
      return { ...s, sections: [...s.sections, copy] };
    });
    return wrap(updated);
  },

  updateSection: async (id, sectionId, data) => {
    const uid = requireUid();
    await mutateSong(uid, id, (s) => ({
      ...s,
      sections: s.sections.map(x => x.id === sectionId ? { ...x, ...data } : x),
    }));
    return wrap({ id: sectionId });
  },

  removeSection: async (id, sectionId) => {
    const uid = requireUid();
    await mutateSong(uid, id, (s) => ({
      ...s,
      sections: s.sections
        .filter(x => x.id !== sectionId)
        .map((x, i) => ({ ...x, sort_order: i })),
    }));
    return wrap({ id: sectionId });
  },

  reorderSections: async (id, order) => {
    const uid = requireUid();
    await mutateSong(uid, id, (s) => {
      const byId = new Map(s.sections.map(x => [x.id, x]));
      const reordered = (order || [])
        .map((sid, i) => byId.get(sid) && { ...byId.get(sid), sort_order: i })
        .filter(Boolean);
      // Append any sections that weren't in the order array
      const orderSet = new Set(order || []);
      const remaining = s.sections.filter(x => !orderSet.has(x.id));
      return { ...s, sections: [...reordered, ...remaining] };
    });
    return wrap({ id });
  },

  /* ── Recordings (audio) ──────────────────────────────── */
  addRecording: async (id, data) => {
    const uid = requireUid();
    let audio_url = data.audio_url || '';
    let storage_path = data.storage_path || '';
    if (data.audio_data && typeof data.audio_data === 'string' && data.audio_data.startsWith('data:')) {
      try {
        const { url, path } = await uploadDataUrl(uid, 'song-recordings', data.audio_data);
        audio_url = url;
        storage_path = path;
      } catch (e) {
        // fall through — caller will see the missing audio
      }
    }
    const recording = {
      id:           makeId('rec'),
      label:        data.label || '',
      audio_url,
      storage_path,
      duration:     data.duration || 0,
      created_at:   new Date().toISOString(),
    };
    await mutateSong(uid, id, (s) => ({
      ...s,
      recordings: [recording, ...s.recordings],
    }));
    return wrap(recording);
  },

  getRecording: async (id, recordingId) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const song = list.find(s => s.id === id);
    const rec = song?.recordings?.find(r => r.id === recordingId) || null;
    return wrap(rec);
  },

  removeRecording: async (id, recordingId) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const song = list.find(s => s.id === id);
    const target = song?.recordings?.find(r => r.id === recordingId);
    if (target?.storage_path) deleteBlobAtPath(target.storage_path).catch(() => {});
    await mutateSong(uid, id, (s) => ({
      ...s,
      recordings: s.recordings.filter(r => r.id !== recordingId),
    }));
    return wrap({ id: recordingId });
  },
};
