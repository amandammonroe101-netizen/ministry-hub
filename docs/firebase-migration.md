# Firebase migration guide

## What changed

| Before | After |
|---|---|
| Custom Express + JWT auth | **Firebase Auth** (email/password) |
| `localStorage.getItem('blog:posts')` (per-device) | **userStore** at `/users/{uid}/kv/blog:posts` (per-user, synced) |
| Same data across all users on one device | **Per-user isolation** — Firestore rules enforce that you can only read/write your own subtree |

## Firebase Console setup (one-time, ~5 min)

1. Open https://console.firebase.google.com → **Add project** → name it anything (e.g. `ministry-hub`).
2. **Authentication** → **Get started** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → **Create database** → choose your region → **Production mode**.
4. **Firestore Database** → **Rules** tab → paste the contents of `docs/firestore.rules` → **Publish**.
5. **Storage** → **Get started** → pick the same region as Firestore → **Production mode**.
6. **Storage** → **Rules** tab → paste the contents of `docs/storage.rules` → **Publish**.
7. **Project settings** (⚙️ icon) → General → **Your apps** → click the **web (`</>`)** icon → register the app (any nickname) → copy the `firebaseConfig` object.
8. Copy `client/.env.example` → `client/.env`, paste your config values, restart `npm run dev`.

## Migrating a page from localStorage to Firestore

Almost every page in this app follows the same pattern:

```jsx
// BEFORE — single-user, single-device
function loadFoo() {
  try { return JSON.parse(localStorage.getItem('blog:posts') || '[]'); }
  catch { return []; }
}
function saveFoo(list) {
  localStorage.setItem('blog:posts', JSON.stringify(list));
}

export default function Page() {
  const [posts, setPosts] = useState(() => loadFoo());
  useEffect(() => { saveFoo(posts); }, [posts]);
  // ...
}
```

To migrate:

```jsx
// AFTER — per-user, multi-device, real-time sync
import { useUserStoreKey } from '../../lib/userStore';

export default function Page() {
  const [posts, setPosts, { loading }] = useUserStoreKey('blog:posts', []);
  // remove the saveFoo useEffect entirely — setPosts auto-persists
  // ...
  if (loading) return <div>Loading…</div>; // optional, otherwise renders []
}
```

That's it. `setPosts(...)` works identically to `useState`'s setter (accepts a value or an updater function), but writes to Firestore in the background. All other instances of this app for this user receive the update in real time via `onSnapshot`.

### Cross-page reads still work the same

If page A writes `blog:posts` and page B reads `blog:posts`, both call `useUserStoreKey('blog:posts', [])` — they'll see the same Firestore doc and stay in sync. The existing localStorage `storage` event listeners can be removed.

### Optional: one-time data import

If you want to keep existing localStorage data, do a one-time import on first login. Add this to a page (or a setup screen):

```jsx
import { setValue } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';

// inside a component or effect:
const { user } = useAuth();
if (user) {
  for (const key of ['blog:posts', 'blog:ideas', 'blog:quotes', /* ... */]) {
    const raw = localStorage.getItem(key);
    if (raw) await setValue(user.uid, key, JSON.parse(raw));
  }
}
```

## What about the Express backend?

It's still running and still mounted at `/api/*`. Nothing breaks — pages that use it (Calendar's custom events, Journal's prayer entries, etc.) continue to work. You can:

- **Leave it alone** — keep using it for non-user-scoped data, or for legacy pages you haven't migrated yet.
- **Decommission gradually** — as each page moves to userStore, the corresponding `/api/<thing>` route becomes unused.
- **Decommission completely** — eventually, drop the server entirely. Electron will just open the Vite-served React app pointed at Firestore.

## Adding shared collections (for things like Chat)

The default rules only allow per-user access. When you build something shared (a chat room, a team roster), add a top-level collection and an explicit rule for it. Example for a future chat:

```
match /channels/{channelId}/messages/{messageId} {
  allow read:  if request.auth != null;
  allow create: if request.auth != null
                && request.resource.data.authorUid == request.auth.uid;
}
```

## Media-heavy pages — Firebase Storage pattern

Firestore docs have a hard limit of **1 MiB** per document. The `useUserStoreKey`
helper writes the entire value into one doc, so it works great for arrays of
small JSON records (posts, ideas, schedules) but breaks the moment you try to
shove a base64-encoded audio file into one of those records.

For audio/video/large images, store the **blob in Firebase Storage** and only
keep a **URL reference** in Firestore. The `userStorage` helper does the
upload/delete; `userStore` keeps the metadata array.

### The recipe

```jsx
import { useUserStoreKey } from '../../lib/userStore';
import { uploadBlob, uploadDataUrl, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';

function MyPage() {
  const { user } = useAuth();
  // The METADATA list (small JSON, in Firestore)
  const [stems, setStems] = useUserStoreKey('worship:stems', []);

  // Upload a new audio File or Blob
  async function handleUpload(file) {
    const { url, path, size, contentType } = await uploadBlob(
      user.uid,
      'stems',    // becomes /users/{uid}/stems/<auto-filename>
      file
    );
    setStems(prev => [
      { id: 'stem_' + Date.now(), name: file.name, audioUrl: url, storagePath: path, size, contentType },
      ...prev,
    ]);
  }

  // Delete: remove the Firestore reference AND the Storage blob
  async function handleDelete(stem) {
    setStems(prev => prev.filter(s => s.id !== stem.id));
    if (stem.storagePath) await deleteBlobAtPath(stem.storagePath);
  }

  // Playback: just point an <audio> tag at the URL
  return <audio src={stems[0]?.audioUrl} controls />;
}
```

### Migrating an existing page that stored data URLs

If the page currently stores `audioDataUrl: 'data:audio/webm;base64,...'`
strings, use `uploadDataUrl` to convert + upload in one step:

```jsx
import { uploadDataUrl } from '../../lib/userStorage';

// One-time per record, e.g. inside a "migrate to cloud" button:
const { url, path } = await uploadDataUrl(user.uid, 'stems', oldRecord.audioDataUrl);
setStems(prev => prev.map(s => s.id === oldRecord.id
  ? { ...s, audioUrl: url, storagePath: path, audioDataUrl: undefined }
  : s
));
```

### Why store **both** `audioUrl` AND `storagePath`

- `audioUrl` is the public download URL — use it in `<audio src>`, `<video src>`, `<img src>`. Plays without any extra fetch.
- `storagePath` (e.g. `users/abc/stems/xyz.webm`) is the immutable storage reference — needed by `deleteBlobAtPath` and useful if you ever need to re-fetch a fresh URL (download tokens can be rotated).

Always save both at upload time, never just one.

### Storage limits (Spark free tier)

| Resource | Free tier |
|---|---|
| Total storage | 5 GiB |
| Daily uploads | 1 GiB |
| Daily downloads | 1 GiB |
| Upload operations / day | 20K |
| Download operations / day | 50K |
| Per-file cap (enforced in rules) | **50 MiB** — see `docs/storage.rules` |

The 50 MiB per-file rule is generous for individual audio clips and short
videos but blocks accidentally-huge uploads. Bump it if you need longer
podcast episodes or full-length sermon video, and consider Firebase's
resumable upload API at that point.

### Heads up: CORS and the `<audio>`/`<video>` Web Audio API

`<audio src={firebaseUrl}>` and `<video src={firebaseUrl}>` for plain
playback work out of the box.

If a page uses **Web Audio API** (`<audio>` routed through `MediaElementAudioSourceNode`,
common in Multitrack and Podcast Editor for level meters, ducking, mixing),
the browser blocks cross-origin audio without explicit CORS. Fix is one
of these:

1. **Easiest** — set `<audio crossOrigin="anonymous" src={url} />` on the
   element. Firebase Storage returns the right CORS headers by default for
   public download URLs, so this usually just works.
2. **If you still see CORS errors**, configure the bucket CORS in `gsutil`:
   ```
   gsutil cors set cors.json gs://YOUR_BUCKET.appspot.com
   ```
   where `cors.json` looks like:
   ```json
   [{
     "origin": ["*"],
     "method": ["GET"],
     "responseHeader": ["Content-Type"],
     "maxAgeSeconds": 3600
   }]
   ```

You only need this for pages that ROUTE audio through Web Audio (analysers,
gain nodes, etc.). Plain playback never trips CORS.
