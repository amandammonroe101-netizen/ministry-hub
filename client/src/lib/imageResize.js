/* imageResize — turn a user-picked image File into a small, compressed
   data URL suitable for storing inline on a Firestore doc.

   Firestore caps a document at ~1 MiB and base64 expands ~33%, so we
   downscale to a modest max dimension and re-encode (WebP, falling back
   to PNG where WebP export isn't supported) before persisting. A logo at
   256px typically lands well under 30 KB. */

export function fileToResizedDataUrl(file, opts = {}) {
  const { maxSize = 256, quality = 0.85, mime = 'image/webp' } = opts;

  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file provided.')); return; }
    if (!String(file.type || '').startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load that image.'));
      img.onload = () => {
        const longest = Math.max(img.width, img.height) || 1;
        const scale = Math.min(1, maxSize / longest);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported.')); return; }
        ctx.drawImage(img, 0, 0, w, h);

        let url;
        try {
          url = canvas.toDataURL(mime, quality);
          // Some browsers silently ignore an unsupported mime and return
          // PNG; if the result isn't the requested type that's fine too.
        } catch {
          url = canvas.toDataURL('image/png');
        }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
