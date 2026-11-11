/* ─────────────────────────────────────────────────────────────
   userStorage — per-user binary blob storage in Firebase Storage.

   Storage layout:
     /users/{uid}/<collection>/<filename>

   Pair this with userStore: keep the binary blob in Storage, keep a
   reference (URL + storagePath + metadata) in Firestore.

   Example for an audio file:
     // Upload
     const { url, path } = await uploadBlob(uid, 'stems', file);
     // Save the *reference* (not the binary!) to Firestore
     setStems(prev => [...prev, { id, name: file.name, audioUrl: url, storagePath: path }]);

     // Delete later
     await deleteBlobAtPath(item.storagePath);

   Why store storagePath in addition to url:
   - Download URLs are stable but their tokens can be rotated/revoked.
   - Storage references (e.g. `users/abc/stems/xyz.webm`) are forever and
     are what `deleteObject` operates on. Save both, use url for playback
     and path for delete/replace.

   Public surface:
     uploadBlob(uid, collection, blob, opts?) → { url, path, size, contentType }
     uploadDataUrl(uid, collection, dataUrl, opts?) → same
     dataUrlToBlob(dataUrl) → Blob
     deleteBlobAtPath(path) → Promise<void>
     getDownloadUrlFromPath(path) → Promise<string>
   ───────────────────────────────────────────────────────────── */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';

/** Turn a "data:audio/webm;base64,XXXX..." string into a Blob.
 *  Returns null if the input doesn't look like a data URL. */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const meta = dataUrl.slice(5, commaIdx); // e.g. "audio/webm;base64"
  const data = dataUrl.slice(commaIdx + 1);
  const isBase64 = meta.endsWith(';base64');
  const contentType = (isBase64 ? meta.slice(0, -7) : meta) || 'application/octet-stream';

  if (isBase64) {
    const binary = atob(data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: contentType });
  }
  // URL-encoded (rare for media). Decode then wrap.
  return new Blob([decodeURIComponent(data)], { type: contentType });
}

/** Build a unique-ish filename so concurrent uploads don't collide.
 *  Keeps the original extension so the Storage UI shows useful icons. */
function makeUniqueName(originalName = '', contentType = '') {
  const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  let ext = '';
  const dotIdx = originalName.lastIndexOf('.');
  if (dotIdx > 0) ext = originalName.slice(dotIdx); // includes the dot
  if (!ext && contentType) {
    // Common fallbacks. Anything else falls through with no extension.
    if (contentType.includes('webm'))      ext = '.webm';
    else if (contentType.includes('mp4'))  ext = '.mp4';
    else if (contentType.includes('mpeg')) ext = '.mp3';
    else if (contentType.includes('wav'))  ext = '.wav';
    else if (contentType.includes('png'))  ext = '.png';
    else if (contentType.includes('jpeg')) ext = '.jpg';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('gif'))  ext = '.gif';
  }
  return stamp + ext;
}

/** Firestore doc size cap is 1 MiB; base64 expands ~33%, so a blob
 *  up to ~700 KB raw fits inline alongside whatever else the caller
 *  wants to persist. The fallback below uses this threshold. */
export const INLINE_BLOB_MAX = 700 * 1024;

/** Read a Blob into a "data:<mime>;base64,..." string. Used by the
 *  uploadBlob fallback when Firebase Storage is unreachable. */
function blobToInlineUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Failed to read blob.'));
    r.readAsDataURL(blob);
  });
}

/** Upload a Blob (or File) under the given user's collection.
 *  Returns the download URL + storage path so callers can persist them.
 *
 *  Options:
 *    filename: optional preferred filename (otherwise auto-generated)
 *    contentType: optional override (otherwise read from blob.type)
 *
 *  When Firebase Storage is unreachable (404, CORS, etc.) small
 *  blobs (≤ INLINE_BLOB_MAX) fall back to an inline `data:` URL so
 *  the caller still gets a usable `url`. Returned shape adds:
 *    inline: true     — when the URL is a data URL not a Storage URL
 *  Callers don't need to know the difference — fetch() / <img src>
 *  / <audio src> all handle both URL kinds natively.
 *
 *  Throws if even the inline path can't be used (blob too large or
 *  FileReader fails) so callers see a real error instead of silent
 *  data loss. */
export async function uploadBlob(uid, collection, blob, opts = {}) {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  if (!uid)     throw new Error('Cannot upload: no user.');
  if (!blob)    throw new Error('Cannot upload: empty blob.');

  const contentType = opts.contentType || blob.type || 'application/octet-stream';
  const filename = opts.filename || makeUniqueName(blob.name || '', contentType);
  const path = `users/${uid}/${collection}/${filename}`;

  /* Primary path — actual Firebase Storage upload */
  try {
    const fileRef = ref(storage, path);
    const snap = await uploadBytes(fileRef, blob, { contentType });
    const url = await getDownloadURL(snap.ref);
    return {
      url,
      path,
      size: snap.metadata.size,
      contentType: snap.metadata.contentType,
    };
  } catch (storageErr) {
    /* Storage isn't reachable (Storage not enabled on the project,
       CORS, network, etc). If the blob fits inline, save it as a
       data URL on the caller's doc. Otherwise, surface the original
       Storage error so the caller knows the file was too big. */
    if (blob.size > INLINE_BLOB_MAX) {
      // eslint-disable-next-line no-console
      console.error('[userStorage] Storage upload failed and blob is too big to inline:', {
        size: blob.size, max: INLINE_BLOB_MAX,
        code: storageErr?.code, message: storageErr?.message,
      });
      throw storageErr;
    }
    // eslint-disable-next-line no-console
    console.warn('[userStorage] Storage upload failed, falling back to inline data URL:',
      storageErr?.code || storageErr?.message || storageErr);
    const dataUrl = await blobToInlineUrl(blob);
    return {
      url:         dataUrl,
      path:        '',          // not in Storage
      size:        blob.size,
      contentType,
      inline:      true,        // tag so callers can detect inline form
    };
  }
}

/** Convenience: take a data URL string, convert it to a Blob, upload it. */
export async function uploadDataUrl(uid, collection, dataUrl, opts = {}) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) throw new Error('Input is not a valid data URL.');
  return uploadBlob(uid, collection, blob, opts);
}

/** Delete a file by its storage path (e.g. "users/abc/stems/xyz.webm").
 *  Swallows "object-not-found" errors so callers can be idempotent. */
export async function deleteBlobAtPath(path) {
  if (!storage || !path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err?.code === 'storage/object-not-found') return;
    throw err;
  }
}

/** Re-fetch a fresh download URL from a stored storagePath. Useful if a
 *  cached URL goes stale (Storage tokens can rotate). */
export async function getDownloadUrlFromPath(path) {
  if (!storage || !path) return null;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}
