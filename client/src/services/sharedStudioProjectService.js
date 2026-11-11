/* ─────────────────────────────────────────────────────────────
   sharedStudioProjectService

   Same shape as studioProjectService, but operates on top-level
   /sharedStudioProjects/{id} docs that multiple users can read +
   write. Used by the Studio's "Collaborate live" share option.

   Doc shape:
     /sharedStudioProjects/{id}
       ownerUid:       original creator
       editorUids:     [uid, uid, ...]   — everyone who can read/write
       name, tempo, time_signature, master_volume, record_latency_ms,
       tracks: [...],   created_at, updated_at

   The Multitrack page subscribes to all docs where the current
   user's uid is in `editorUids`, mixing them into the project
   list alongside personal projects (which still live in the
   user's kv).

   Mutation helpers below mirror studioProjectService — they read
   the doc, apply a transform, write the doc. setDoc+merge isn't
   sufficient for nested-array tweaks so we re-write the whole
   tracks array on each change. With Firestore's 1 MiB doc limit
   that's fine for typical projects.
   ───────────────────────────────────────────────────────────── */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { uploadDataUrl } from '../lib/userStorage';

const COLLECTION = 'sharedStudioProjects';

function uid() {
  const u = auth?.currentUser?.uid;
  if (!u) throw new Error('Not signed in.');
  return u;
}

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* Reuse the same inline-fallback rule chatFiles + studioProjectService
   use: try Storage, fall back to inlining the data URL when small. */
const INLINE_AUDIO_MAX = 700 * 1024;
async function resolveAudio(myUid, data) {
  if (data?.audio_data && typeof data.audio_data === 'string' && data.audio_data.startsWith('data:')) {
    try {
      const { url, path } = await uploadDataUrl(myUid, 'studio-audio', data.audio_data);
      return { audio_url: url, storage_path: path };
    } catch {
      const commaIdx = data.audio_data.indexOf(',');
      const b64      = commaIdx >= 0 ? data.audio_data.slice(commaIdx + 1) : '';
      const bytes    = Math.floor(b64.length * 0.75);
      if (bytes > 0 && bytes <= INLINE_AUDIO_MAX) {
        return { audio_url: data.audio_data, storage_path: '', inline: true };
      }
      return { audio_url: '', storage_path: '' };
    }
  }
  return {
    audio_url:    data?.audio_url || '',
    storage_path: data?.storage_path || '',
  };
}

/* Build a freshly-cloned project document ready for /sharedStudioProjects.
   Strips any per-user `_meta` and gives the doc a brand new id, while
   preserving track / clip structure verbatim (so the recipient hears the
   same audio the sender did).

   Two array fields control visibility:
   - editorUids:   who can read/write the doc (sender + all invitees)
   - acceptedUids: who currently has it in their Studio sidebar.
                   The sender starts accepted. Invitees only join
                   acceptedUids after they explicitly double-click
                   the chat invitation (see acceptInvite() below). */
export function cloneProjectForSharing(project, ownerUid, additionalEditorUids = []) {
  const cleanTracks = (project.tracks || []).map(t => ({
    ...t,
    clips: (t.clips || []).map(c => ({ ...c })),
  }));
  return {
    id:                 makeId('shared'),
    ownerUid,
    editorUids:         Array.from(new Set([ownerUid, ...additionalEditorUids])),
    acceptedUids:       [ownerUid],   // sender auto-accepts; invitees opt in
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

/* Public API */
export const sharedStudioProjectService = {
  /** Subscribe to every shared project the current user has ACCEPTED.
   *  An invite stays out of the Studio sidebar until the recipient
   *  explicitly accepts it (via acceptInvite below) — see the
   *  cloneProjectForSharing comment above for the rationale. */
  subscribeMine(cb) {
    const u = uid();
    const q = query(
      collection(db, COLLECTION),
      where('acceptedUids', 'array-contains', u),
    );
    return onSnapshot(q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        cb(list);
      },
      (err) => {
        /* Log the actual error rather than silently clearing — a
           silent failure here used to make accepted projects
           "disappear" from the Collaborate section with no clue
           in the console. Common cause: rules don't allow the
           subscription query (the read predicate must accept
           whatever field the query filters on). */
        // eslint-disable-next-line no-console
        console.error('[sharedStudioProjects] subscription failed:', err?.code || err?.message || err);
        cb([]);
      }
    );
  },

  /** Recipient action — add the current user to acceptedUids so the
   *  project shows up in their Studio sidebar. The user must already
   *  be in editorUids (which is set when the sender creates the
   *  invite), otherwise Firestore rules deny the write. */
  async acceptInvite(id) {
    const myUid = uid();
    const cur   = await this.getOne(id);
    if (!cur) throw new Error('That shared project no longer exists.');
    if (!(cur.editorUids || []).includes(myUid)) {
      throw new Error('You weren\'t invited to this project.');
    }
    if ((cur.acceptedUids || []).includes(myUid)) return; // already accepted
    const accepted = [...(cur.acceptedUids || []), myUid];
    await updateDoc(doc(db, COLLECTION, id), {
      acceptedUids: accepted,
      updated_at:   new Date().toISOString(),
    });
  },

  async getOne(id) {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  /** One-shot read of every shared project the current user has
   *  accepted. Mirrors subscribeMine's filter but returns a Promise
   *  instead of a live subscription — handy for pickers that just
   *  need the list once. */
  async getMine() {
    const u = uid();
    const q = query(
      collection(db, COLLECTION),
      where('acceptedUids', 'array-contains', u),
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return list;
  },

  /** Persist a fresh shared project (use cloneProjectForSharing to build it). */
  async create(sharedProject) {
    await setDoc(doc(db, COLLECTION, sharedProject.id), sharedProject);
    return sharedProject;
  },

  /** Top-level field updates (name, tempo, master volume, etc). */
  async updateMeta(id, patch) {
    const ref = doc(db, COLLECTION, id);
    await updateDoc(ref, { ...patch, updated_at: new Date().toISOString() });
  },

  /** Replace the whole tracks array. Used by track/clip mutations
   *  below — keeps logic simple at the cost of one full write per edit. */
  async replaceTracks(id, tracks) {
    const ref = doc(db, COLLECTION, id);
    await updateDoc(ref, { tracks, updated_at: new Date().toISOString() });
  },

  async addEditor(id, newEditorUid) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const editors = Array.from(new Set([...(cur.editorUids || []), newEditorUid]));
    await updateDoc(doc(db, COLLECTION, id), {
      editorUids: editors,
      updated_at: new Date().toISOString(),
    });
  },

  async removeEditor(id, removeUid) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const editors = (cur.editorUids || []).filter(u => u !== removeUid);
    await updateDoc(doc(db, COLLECTION, id), {
      editorUids: editors,
      updated_at: new Date().toISOString(),
    });
  },

  /** Self-leave: a non-owner collaborator removes themselves from
   *  the project. Strips their uid from both editorUids and
   *  acceptedUids so they lose access AND it disappears from
   *  their sidebar subscription. The doc itself stays for other
   *  collaborators — only the project owner can delete the whole
   *  doc.
   *
   *  Firestore-rules-wise this update is allowed because the rule
   *  checks `request.auth.uid in resource.data.editorUids` on the
   *  BEFORE state — at write time the caller is still an editor. */
  async leaveCollaboration(id) {
    const myUid = uid();
    const cur   = await this.getOne(id);
    if (!cur) return;
    if (cur.ownerUid === myUid) {
      /* Owners can't leave — they should delete the project
         (which destroys it for everyone) instead. */
      throw new Error('Owners can\'t leave — delete the project instead.');
    }
    const editors  = (cur.editorUids   || []).filter(u => u !== myUid);
    const accepted = (cur.acceptedUids || []).filter(u => u !== myUid);
    await updateDoc(doc(db, COLLECTION, id), {
      editorUids:   editors,
      acceptedUids: accepted,
      updated_at:   new Date().toISOString(),
    });
  },

  async deleteProject(id) {
    await deleteDoc(doc(db, COLLECTION, id));
  },

  /* ─── Track helpers (mirror studioProjectService shape) ──── */

  async addTrack(id, data) {
    const u = uid();
    const cur = await this.getOne(id);
    if (!cur) throw new Error('Shared project not found.');
    const { audio_url, storage_path } = await resolveAudio(u, data);
    const firstClip = (audio_url || storage_path) ? [{
      id:          makeId('clip'),
      name:        data.name || '',
      audio_url,
      storage_path,
      clip_offset: data.clip_offset ?? 0,
      trim_start:  data.trim_start ?? 0,
      trim_end:    data.trim_end ?? 0,
      sort_order:  0,
    }] : [];
    const track = {
      id:         makeId('tr'),
      name:       data.name || 'Track',
      volume:     data.volume ?? 1,
      pan:        data.pan ?? 0,
      is_muted:   data.is_muted ? 1 : 0,
      is_solo:    data.is_solo  ? 1 : 0,
      effects:    data.effects || {},
      sort_order: (cur.tracks || []).length,
      clips:      firstClip,
    };
    const nextTracks = [...(cur.tracks || []), track];
    await this.replaceTracks(id, nextTracks);
    return track;
  },

  async updateTrack(id, trackId, patch) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const next = (cur.tracks || []).map(t =>
      t.id === trackId ? { ...t, ...patch } : t
    );
    await this.replaceTracks(id, next);
  },

  async removeTrack(id, trackId) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const next = (cur.tracks || [])
      .filter(t => t.id !== trackId)
      .map((t, i) => ({ ...t, sort_order: i }));
    await this.replaceTracks(id, next);
  },

  async addClip(id, trackId, data) {
    const u = uid();
    const cur = await this.getOne(id);
    if (!cur) return;
    const { audio_url, storage_path } = await resolveAudio(u, data);
    const clip = {
      id:          makeId('clip'),
      name:        data.name || '',
      audio_url,
      storage_path,
      clip_offset: data.clip_offset ?? 0,
      trim_start:  data.trim_start ?? 0,
      trim_end:    data.trim_end ?? 0,
      sort_order:  0,
    };
    const next = (cur.tracks || []).map(t => {
      if (t.id !== trackId) return t;
      const clips = [...(t.clips || []), { ...clip, sort_order: (t.clips || []).length }];
      return { ...t, clips };
    });
    await this.replaceTracks(id, next);
    return clip;
  },

  async updateClip(id, trackId, clipId, patch) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const next = (cur.tracks || []).map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: (t.clips || []).map(c => c.id === clipId ? { ...c, ...patch } : c),
      };
    });
    await this.replaceTracks(id, next);
  },

  async removeClip(id, trackId, clipId) {
    const cur = await this.getOne(id);
    if (!cur) return;
    const next = (cur.tracks || []).map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: (t.clips || [])
          .filter(c => c.id !== clipId)
          .map((c, i) => ({ ...c, sort_order: i })),
      };
    });
    await this.replaceTracks(id, next);
  },
};
