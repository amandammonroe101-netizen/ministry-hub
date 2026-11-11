/* ─────────────────────────────────────────────────────────────
   Stems Library — shared helper.

   Pushes a recording into the Stems Library from Songs, Piano (Studio),
   Drums, Seaboard, AKAI. The stems list lives in Firestore at
   /users/{uid}/kv/band:stems, and the audio blob lives in Firebase
   Storage at /users/{uid}/stems/<filename>.

   Two callsite styles are supported:

   1) New (recommended) — the caller already uploaded the audio and
      passes a Storage URL + path:
        addStemFromRecording({
          name, audioUrl, storagePath, type, duration, bpm, source,
        })

   2) Legacy — the caller still has a data URL and we upload it here:
        addStemFromRecording({
          name, audioDataUrl, type, duration, bpm, source,
        })

   Always returns { ok, stem?, warning?, error? }. Async — await it.
   ───────────────────────────────────────────────────────────── */

import { auth } from '../lib/firebase';
import { getValue, setValue } from '../lib/userStore';
import { uploadDataUrl } from '../lib/userStorage';

const KEY = 'band:stems';

/* Roughly estimate the byte size of a base64 dataURL. */
const estimateDataUrlBytes = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round(b64.length * 0.75);
};

const inferExt = (dataUrlOrContentType) => {
  const s = String(dataUrlOrContentType || '').toLowerCase();
  if (s.includes('mp4'))  return 'm4a';
  if (s.includes('mpeg')) return 'mp3';
  if (s.includes('wav'))  return 'wav';
  if (s.includes('ogg'))  return 'ogg';
  if (s.includes('webm')) return 'webm';
  return 'webm';
};

export const addStemFromRecording = async (opts = {}) => {
  const {
    name,
    audioUrl,
    storagePath,
    audioDataUrl,
    type = 'other',
    duration = 0,
    bpm = null,
    songId = null,
    songTitle = '',
    songKey = '',
    source = '',
    timeSignature = '',
    notes = '',
    tags = [],
  } = opts;

  const uid = auth?.currentUser?.uid;
  if (!uid) {
    return { ok: false, error: 'Not signed in.' };
  }

  /* Figure out the final URL + storage path. If the caller supplied a
     data URL (legacy path), upload it now. */
  let finalUrl = audioUrl || '';
  let finalPath = storagePath || '';
  let fileSize = 0;
  let fileExt = 'webm';

  if (!finalUrl && audioDataUrl) {
    if (typeof audioDataUrl !== 'string' || !audioDataUrl.startsWith('data:')) {
      return { ok: false, error: 'Audio payload is not a valid data URL.' };
    }
    fileExt = inferExt(audioDataUrl);
    try {
      const { url, path, size } = await uploadDataUrl(uid, 'stems', audioDataUrl);
      finalUrl = url;
      finalPath = path;
      fileSize = size || estimateDataUrlBytes(audioDataUrl);
    } catch (err) {
      return { ok: false, error: 'Could not upload audio: ' + (err?.message || 'unknown error') };
    }
  }

  if (!finalUrl) {
    return { ok: false, error: 'No audio data — recording is empty.' };
  }

  const safeName = (name || 'stem').trim().replace(/[^\w\s.-]/g, '_');
  const stem = {
    id:           'stem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name:         (name || 'Untitled stem').trim() || 'Untitled stem',
    type,
    songId,
    songTitle,
    songKey,
    bpm,
    duration,
    timeSignature,
    fileName:     `${safeName}.${fileExt}`,
    fileSize,
    audioUrl:     finalUrl,
    storagePath:  finalPath,
    source,
    notes,
    tags:         Array.isArray(tags) ? tags : [],
    loopable:     false,
    rating:       0,
    createdAt:    Date.now(),
  };

  try {
    const existing = (await getValue(uid, KEY)) || [];
    const list = Array.isArray(existing) ? existing : [];
    await setValue(uid, KEY, [stem, ...list]);
  } catch (err) {
    return { ok: false, error: 'Could not save to Stems Library: ' + (err?.message || 'unknown error') };
  }

  return { ok: true, stem };
};

/* Legacy exports kept as stubs for any straggler import.
   The new addStemFromRecording above handles everything. */
export const STEMS_LS_KEY = 'band:stems';
export const loadStems = async () => {
  const uid = auth?.currentUser?.uid;
  if (!uid) return [];
  const v = await getValue(uid, KEY);
  return Array.isArray(v) ? v : [];
};
export const saveStems = async (list) => {
  const uid = auth?.currentUser?.uid;
  if (!uid) return { ok: false, error: 'Not signed in.' };
  try {
    await setValue(uid, KEY, list);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not save stems.' };
  }
};
export { estimateDataUrlBytes };
