/* Studio projects service — Firestore-backed (one doc per project).

   Storage layout:
     /users/{uid}/studio-projects/{projectId}   ← one doc per project
   Each project doc embeds:
     tracks: [{ id, name, volume, pan, is_muted, is_solo, effects,
                sort_order,
                clips: [{ id, name, audio_url, storage_path,
                          clip_offset, trim_start, trim_end,
                          sort_order }] }]

   Firestore caps a single doc at 1 MiB. Putting each project in
   its own doc gives every project its own 1 MiB budget instead of
   sharing one budget across the whole library — which is the
   architecture the shared-projects service already uses, and which
   eliminates the "studio-projects doc full" error that surfaced
   when many recordings were inlined (because Firebase Storage
   wasn't reachable).

   Legacy migration:
     The previous version stored every project as an element of a
     single ARRAY at  /users/{uid}/kv/studio-projects . On the first
     call to getAll() per session we read that legacy doc, copy
     each project to its own per-project doc, and delete the
     legacy doc. If a project is too big to write (>1 MiB by
     itself, usually from inline-base64 audio), we retry the write
     with inline audio stripped from its clips — the project
     structure survives, the bloated audio fields become empty
     strings, and the user can re-record on those clips.

   When pages call addTrack/addClip with `audio_data` (a base64
   data URL — the legacy server-side format), we try to upload
   to Storage and fall back to inline only for small payloads.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';
import { getValue, deleteValue } from '../lib/userStore';
import { uploadDataUrl, deleteBlobAtPath } from '../lib/userStorage';

const LEGACY_KEY = 'studio-projects';
const COLL_NAME  = 'studio-projects';

function projectsCollRef(uid) {
  return collection(db, 'users', uid, COLL_NAME);
}
function projectDocRef(uid, id) {
  return doc(db, 'users', uid, COLL_NAME, id);
}

function defaultProject(data = {}) {
  return {
    id:                 makeId('sp'),
    name:               data.name || 'Untitled session',
    tempo:              data.tempo ?? 100,
    time_signature:     data.time_signature || '4/4',
    master_volume:      data.master_volume ?? 1,
    record_latency_ms:  data.record_latency_ms ?? 0,
    tracks:             [],
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };
}

/* ── Doc helpers ─────────────────────────────────────────── */

async function readProject(uid, id) {
  const snap = await getDoc(projectDocRef(uid, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllProjects(uid) {
  const snap = await getDocs(projectsCollRef(uid));
  return snap.docs.map(d => d.data());
}

/** Write a project doc. If the payload exceeds Firestore's 1 MiB
 *  per-doc limit (most often because clips carry inline base64
 *  audio from a Storage-failure fallback), strip the inline audio
 *  from clips and retry. We preserve the project structure so the
 *  user doesn't lose their layout/edits — they only lose the
 *  audio for clips that were inline. */
async function writeProject(uid, project) {
  try {
    await setDoc(projectDocRef(uid, project.id), project);
    return project;
  } catch (err) {
    const tooBig =
      err?.code === 'invalid-argument' ||
      /exceeds the maximum allowed size|too large/i.test(err?.message || '');
    if (!tooBig) throw err;
    const stripped = stripInlineAudio(project);
    await setDoc(projectDocRef(uid, project.id), stripped);
    // eslint-disable-next-line no-console
    console.warn(
      `[studioProjectService] Project "${project.name}" was too big — `
      + 'saved with inline-audio clips emptied. Re-record affected clips.',
    );
    return stripped;
  }
}

function stripInlineAudio(project) {
  return {
    ...project,
    tracks: (project.tracks || []).map(t => ({
      ...t,
      clips: (t.clips || []).map(c => {
        const isInline = typeof c.audio_url === 'string'
          && c.audio_url.startsWith('data:');
        return isInline ? { ...c, audio_url: '', storage_path: '' } : c;
      }),
    })),
  };
}

async function mutateProject(uid, id, mutator) {
  const cur = await readProject(uid, id);
  if (!cur) return null;
  const next = mutator({
    ...cur,
    tracks: Array.isArray(cur.tracks) ? cur.tracks : [],
    updated_at: new Date().toISOString(),
  });
  return await writeProject(uid, next);
}

async function mutateTrack(uid, projectId, trackId, mutator) {
  let updatedTrack = null;
  await mutateProject(uid, projectId, (p) => ({
    ...p,
    tracks: p.tracks.map(t => {
      if (t.id !== trackId) return t;
      updatedTrack = mutator({
        ...t,
        clips: Array.isArray(t.clips) ? t.clips : [],
      });
      return updatedTrack;
    }),
  }));
  return updatedTrack;
}

/* ── Audio resolution (data: → upload, with inline fallback) ─ */

const INLINE_AUDIO_MAX = 700 * 1024;

async function resolveAudio(uid, data) {
  if (data?.audio_data && typeof data.audio_data === 'string' && data.audio_data.startsWith('data:')) {
    try {
      const { url, path } = await uploadDataUrl(uid, 'studio-audio', data.audio_data);
      return { audio_url: url, storage_path: path };
    } catch (e) {
      const commaIdx = data.audio_data.indexOf(',');
      const b64      = commaIdx >= 0 ? data.audio_data.slice(commaIdx + 1) : '';
      const approxBytes = Math.floor(b64.length * 0.75);
      if (approxBytes > 0 && approxBytes <= INLINE_AUDIO_MAX) {
        // eslint-disable-next-line no-console
        console.warn('[studioProjectService] Storage upload failed, inlining recording as data URL:',
          e?.code || e?.message || e);
        return { audio_url: data.audio_data, storage_path: '', inline: true };
      }
      // eslint-disable-next-line no-console
      console.error('[studioProjectService] Storage upload failed and recording is too big to inline:',
        { approxBytes, max: INLINE_AUDIO_MAX, err: e });
      return { audio_url: '', storage_path: '' };
    }
  }
  return {
    audio_url:    data?.audio_url || '',
    storage_path: data?.storage_path || '',
  };
}

/* ── Legacy migration (one-shot) ─────────────────────────── */

let migrationPromise = null;

async function migrateLegacyIfNeeded(uid) {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    let legacy;
    try {
      legacy = await getValue(uid, LEGACY_KEY);
    } catch {
      return;       // legacy doc unreadable — nothing to migrate
    }
    if (!Array.isArray(legacy) || legacy.length === 0) {
      return;       // nothing to migrate
    }
    // eslint-disable-next-line no-console
    console.info(`[studioProjectService] Migrating ${legacy.length} legacy project(s) to per-doc storage…`);
    let ok = 0, failed = 0;
    for (const project of legacy) {
      if (!project?.id) { failed++; continue; }
      try {
        // Don't clobber a project that's already been migrated.
        const existing = await readProject(uid, project.id);
        if (existing) { ok++; continue; }
        await writeProject(uid, project);   // strips inline audio on retry
        ok++;
      } catch (err) {
        failed++;
        // eslint-disable-next-line no-console
        console.error(`[studioProjectService] Could not migrate project ${project.id}:`, err);
      }
    }
    /* If every project migrated (with or without stripping), drop
       the legacy doc entirely so the user is fully on the new
       model. If anything failed, leave the legacy doc alone so the
       user's data isn't silently dropped. */
    if (failed === 0) {
      try { await deleteValue(uid, LEGACY_KEY); } catch { /* best-effort */ }
    }
    // eslint-disable-next-line no-console
    console.info(`[studioProjectService] Migration complete — ok=${ok}, failed=${failed}.`);
  })();
  return migrationPromise;
}

/* ── Public API ──────────────────────────────────────────── */

export const studioProjectService = {
  getAll: async () => {
    const uid = requireUid();
    await migrateLegacyIfNeeded(uid);
    const list = await readAllProjects(uid);
    return wrap(list.sort((a, b) =>
      (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
    ));
  },

  getOne: async (id) => {
    const uid = requireUid();
    await migrateLegacyIfNeeded(uid);
    return wrap(await readProject(uid, id));
  },

  create: async (data) => {
    const uid = requireUid();
    const project = defaultProject(data);
    await writeProject(uid, project);
    return wrap(project);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const updated = await mutateProject(uid, id, (p) => ({ ...p, ...data }));
    return wrap(updated);
  },

  delete: async (id) => {
    const uid = requireUid();
    const target = await readProject(uid, id);
    if (target?.tracks?.length) {
      target.tracks.forEach(t => (t.clips || []).forEach(c => {
        if (c.storage_path) deleteBlobAtPath(c.storage_path).catch(() => {});
      }));
    }
    await deleteDoc(projectDocRef(uid, id));
    return wrap({ id });
  },

  addTrack: async (id, data) => {
    const uid = requireUid();
    const { audio_url, storage_path } = await resolveAudio(uid, data);
    const firstClip = (audio_url || storage_path) ? [{
      id:           makeId('clip'),
      name:         data.name || '',
      audio_url,
      storage_path,
      clip_offset:  data.clip_offset ?? 0,
      trim_start:   data.trim_start ?? 0,
      trim_end:     data.trim_end ?? 0,
      sort_order:   0,
    }] : [];

    const track = {
      id:           makeId('tr'),
      name:         data.name || 'Track',
      volume:       data.volume ?? 1,
      pan:          data.pan ?? 0,
      is_muted:     data.is_muted ? 1 : 0,
      is_solo:      data.is_solo  ? 1 : 0,
      effects:      data.effects || {},
      sort_order:   0,
      clips:        firstClip,
    };
    await mutateProject(uid, id, (p) => {
      track.sort_order = p.tracks.length;
      return { ...p, tracks: [...p.tracks, track] };
    });
    return wrap(track);
  },

  updateTrack: async (id, trackId, data) => {
    const uid = requireUid();
    const updated = await mutateTrack(uid, id, trackId, (t) => ({ ...t, ...data }));
    return wrap(updated);
  },

  removeTrack: async (id, trackId) => {
    const uid = requireUid();
    const project = await readProject(uid, id);
    const track   = project?.tracks?.find(t => t.id === trackId);
    if (track?.clips?.length) {
      track.clips.forEach(c => {
        if (c.storage_path) deleteBlobAtPath(c.storage_path).catch(() => {});
      });
    }
    await mutateProject(uid, id, (p) => ({
      ...p,
      tracks: p.tracks
        .filter(t => t.id !== trackId)
        .map((t, i) => ({ ...t, sort_order: i })),
    }));
    return wrap({ id: trackId });
  },

  addClip: async (id, trackId, data) => {
    const uid = requireUid();
    const { audio_url, storage_path } = await resolveAudio(uid, data);
    const clip = {
      id:           makeId('clip'),
      name:         data.name || '',
      audio_url,
      storage_path,
      clip_offset:  data.clip_offset ?? 0,
      trim_start:   data.trim_start ?? 0,
      trim_end:     data.trim_end ?? 0,
      sort_order:   0,
    };
    await mutateTrack(uid, id, trackId, (t) => {
      clip.sort_order = t.clips.length;
      return { ...t, clips: [...t.clips, clip] };
    });
    return wrap(clip);
  },

  updateClip: async (id, trackId, clipId, data) => {
    const uid = requireUid();
    await mutateTrack(uid, id, trackId, (t) => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, ...data } : c),
    }));
    return wrap({ id: clipId });
  },

  removeClip: async (id, trackId, clipId) => {
    const uid = requireUid();
    const project = await readProject(uid, id);
    const target  = project
      ?.tracks?.find(t => t.id === trackId)
      ?.clips?.find(c => c.id === clipId);
    if (target?.storage_path) deleteBlobAtPath(target.storage_path).catch(() => {});
    await mutateTrack(uid, id, trackId, (t) => ({
      ...t,
      clips: t.clips.filter(c => c.id !== clipId).map((c, i) => ({ ...c, sort_order: i })),
    }));
    return wrap({ id: clipId });
  },
};
