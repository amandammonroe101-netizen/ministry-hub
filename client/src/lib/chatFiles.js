/* ─────────────────────────────────────────────────────────────
   chatFiles — chat attachment uploads.

   Delegates the actual upload to lib/userStorage.uploadBlob() so we
   ride on whatever path the rest of the app already uses
   successfully (blogs, podcasts, etc.). The collection name is
   `chat-files/<channelId>` so files for different channels stay
   separated under the uploader's /users/{uid}/ folder.

   Returns an attachment metadata object suitable for storing on the
   message doc:
     {
       type:     'image' | 'video' | 'audio' | 'file',
       url:      <download URL — long-lived signed URL>,
       path:     <storage path so we could delete it later>,
       fileName: <original name>,
       fileSize: <bytes>,
       mimeType: <browser-reported MIME type>,
     }
   ───────────────────────────────────────────────────────────── */

import { uploadBlob } from './userStorage';
import { auth } from './firebase';

/** Hard cap mirrors the Storage rule. Validated client-side so users
 *  see a friendly error instead of a cryptic Firebase one. */
export const CHAT_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** Files at or below this size can be inlined as base64 data URLs in
 *  the message doc (Firestore docs are capped at 1 MiB; base64
 *  expands ~33%, so ~700 KB of binary fits comfortably with room for
 *  the rest of the message's fields).
 *  This is the no-Storage fallback path. */
const INLINE_DATA_URL_MAX = 700 * 1024;

/** Read a File into a "data:<mime>;base64,..." string. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Failed to read file.'));
    r.readAsDataURL(file);
  });
}

/** Load a File or Blob into an HTMLImageElement. Used by the
 *  image-compress pipeline below. */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(objUrl);
      reject(e || new Error('Failed to load image.'));
    };
    img.src = objUrl;
  });
}

/** Re-encode an image at a smaller dimension + quality. Always
 *  outputs JPEG (image/jpeg) for predictable size. */
async function resizeImage(file, maxDim, quality) {
  const img = await loadImageFromFile(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const newW = Math.max(1, Math.round(w * scale));
  const newH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, newW, newH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
      'image/jpeg',
      quality,
    );
  });
}

/** Resize an image down through a series of size/quality steps until
 *  it fits under `maxBytes`. Returns null if even the smallest pass
 *  is still too big (extremely unusual for a photo). */
async function compressImageToFit(file, maxBytes) {
  const attempts = [
    { maxDim: 1600, quality: 0.85 },
    { maxDim: 1200, quality: 0.80 },
    { maxDim: 1000, quality: 0.75 },
    { maxDim: 800,  quality: 0.70 },
    { maxDim: 640,  quality: 0.65 },
    { maxDim: 480,  quality: 0.55 },
  ];
  for (const { maxDim, quality } of attempts) {
    try {
      const blob = await resizeImage(file, maxDim, quality);
      // eslint-disable-next-line no-console
      console.log('[chatFiles] compress attempt:', { maxDim, quality, size: blob.size });
      if (blob.size <= maxBytes) {
        // Wrap as a File so we can keep using `file.name` downstream
        return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', {
          type: 'image/jpeg',
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[chatFiles] compress attempt failed:', e);
    }
  }
  return null;
}

/** Classify a MIME type into one of the renderable buckets the chat UI
 *  knows about. Unknown/missing types fall through to 'file'. */
export function classifyAttachment(mimeType) {
  const t = String(mimeType || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Human-friendly file size (e.g. "1.4 MB"). */
export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Upload a File for a chat attachment. Calls onProgress(0)/onProgress(1)
 *  at the start/end (no fine-grained progress — uploadBlob uses the
 *  single-shot uploadBytes API). Resolves to the attachment metadata
 *  object documented at the top of this file. */
export async function uploadChatFile({ channelId, file, onProgress }) {
  if (!channelId) throw new Error('Missing channelId.');
  if (!file)      throw new Error('No file provided.');
  if (file.size > CHAT_FILE_MAX_BYTES) {
    throw new Error(`File is too large. Max ${formatBytes(CHAT_FILE_MAX_BYTES)}.`);
  }
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');

  // eslint-disable-next-line no-console
  console.log('[chatFiles] uploading:', {
    uid, channelId, name: file.name, size: file.size, type: file.type,
  });

  onProgress?.(0);
  /* PRIMARY PATH: Firebase Storage upload. */
  try {
    const { url, path, size, contentType } = await uploadBlob(
      uid,
      `chat-files/${channelId}`,
      file,
      { filename: file.name, contentType: file.type || undefined }
    );
    onProgress?.(1);
    // eslint-disable-next-line no-console
    console.log('[chatFiles] uploaded via Storage:', { path, url });
    return {
      type:     classifyAttachment(contentType || file.type),
      url,
      path,
      fileName: file.name || 'file',
      fileSize: size || file.size,
      mimeType: contentType || file.type || 'application/octet-stream',
    };
  } catch (storageErr) {
    /* Storage upload failed. Try to recover by inlining the file in
       the Firestore message doc as a base64 data URL. Two paths: */
    const isImage = classifyAttachment(file.type) === 'image';

    /* (a) Already small enough — inline directly. */
    if (file.size <= INLINE_DATA_URL_MAX) {
      // eslint-disable-next-line no-console
      console.warn(
        '[chatFiles] Storage failed, falling back to inline data URL:',
        storageErr?.code || storageErr?.message || storageErr
      );
      try {
        const dataUrl = await fileToDataUrl(file);
        onProgress?.(1);
        return {
          type:     classifyAttachment(file.type),
          url:      dataUrl,
          path:     null,                  // not in Storage
          inline:   true,                  // tag so we know it's a data URL
          fileName: file.name || 'file',
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        };
      } catch (inlineErr) {
        // eslint-disable-next-line no-console
        console.error('[chatFiles] inline fallback also failed:', inlineErr);
        // fall through to error-reporting below
      }
    }

    /* (b) Image that's too big — try to compress it down until it
           fits the inline budget, then inline the compressed version.
           This is what lets a 3.9 MB phone photo go through without
           Storage being available. */
    if (isImage && file.size > INLINE_DATA_URL_MAX) {
      // eslint-disable-next-line no-console
      console.warn('[chatFiles] Storage failed, attempting to compress image to fit inline:', {
        originalSize: file.size,
        budget: INLINE_DATA_URL_MAX,
      });
      try {
        const compressed = await compressImageToFit(file, INLINE_DATA_URL_MAX);
        if (compressed) {
          const dataUrl = await fileToDataUrl(compressed);
          onProgress?.(1);
          // eslint-disable-next-line no-console
          console.log('[chatFiles] inlined compressed image:', {
            originalSize: file.size,
            compressedSize: compressed.size,
          });
          return {
            type:     'image',
            url:      dataUrl,
            path:     null,
            inline:   true,
            compressed: true,
            fileName: compressed.name,
            fileSize: compressed.size,
            mimeType: 'image/jpeg',
          };
        }
        // If we get here, even max compression couldn't fit — fall through
        // to error message that suggests using a smaller original.
      } catch (compressErr) {
        // eslint-disable-next-line no-console
        console.error('[chatFiles] image compression failed:', compressErr);
      }
    }
    const err = storageErr;
    /* Pull every diagnostic crumb the Firebase SDK gives us, so the
       toast can show something specific even when serverResponse is
       empty (which usually means the request never reached a server). */
    const serverResp = err?.customData?.serverResponse
                    || err?.serverResponse
                    || null;
    let parsedMsg = null;
    if (serverResp) {
      try {
        const j = JSON.parse(serverResp);
        parsedMsg = j?.error?.message || j?.error || serverResp;
      } catch {
        parsedMsg = serverResp;
      }
    }
    const code   = err?.code   || 'unknown';
    const status = err?.customData?.serverResponseCode || err?.status_ || err?.status || '';
    // eslint-disable-next-line no-console
    console.error('[chatFiles] upload failed:', {
      code, status,
      message: err?.message,
      serverResponse: serverResp,
      parsedServer:   parsedMsg,
      bucket: 'see firebase.js',
      uid,
      path: `users/${uid}/chat-files/${channelId}/${file.name}`,
    });

    /* Build the most useful single-line message we can for the toast. */
    let toastDetail;
    if (parsedMsg) {
      toastDetail = `${code}: ${parsedMsg}`;
    } else if (code === 'storage/unauthorized') {
      toastDetail = 'storage/unauthorized — Storage rules deny this write. Publish docs/storage.rules in Firebase Console.';
    } else if (code === 'storage/unknown') {
      /* Storage is unreachable AND we couldn't inline the file (either
         not an image, or image compression didn't get it under the
         budget, which is rare). Tell the user the real situation. */
      const isImage = classifyAttachment(file.type) === 'image';
      toastDetail = isImage
        ? `Firebase Storage is unreachable and this image (${formatBytes(file.size)}) ` +
          `couldn’t be compressed enough to send inline ` +
          `(max ${formatBytes(INLINE_DATA_URL_MAX)}). Try a lower-res photo.`
        : `Firebase Storage is unreachable, and this file is too big ` +
          `(${formatBytes(file.size)}) for the inline fallback ` +
          `(max ${formatBytes(INLINE_DATA_URL_MAX)}). ` +
          `Photos work at any size (we compress them); other large files need Storage.`;
    } else {
      toastDetail = `${code}${status ? ` [${status}]` : ''}: ${err?.message || 'unknown'}`;
    }
    throw new Error(toastDetail);
  }
}
