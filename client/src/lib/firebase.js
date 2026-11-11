/* ─────────────────────────────────────────────────────────────
   Firebase SDK bootstrap.
   - Reads config from Vite env vars (client/.env, prefixed VITE_).
   - Exports the shared app, auth, and firestore instances so the
     rest of the app imports them from one place.

   Setup:
     1. In Firebase Console, create a project + enable Email/Password
        sign-in and Firestore (start in production mode with the
        security rules in /docs/firestore.rules — see README).
     2. Copy your web app's config into client/.env using the keys
        listed in client/.env.example.
     3. Restart `npm run dev`.
   ───────────────────────────────────────────────────────────── */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True if at least the apiKey and projectId env vars are present.
 *  Used by AuthContext to fall back to a "config missing" screen
 *  rather than throwing a cryptic Firebase error. */
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app       = null;
let auth      = null;
let db        = null;
let storage   = null;
let functions = null;

if (firebaseConfigured) {
  app       = initializeApp(firebaseConfig);
  auth      = getAuth(app);
  db        = getFirestore(app);
  storage   = getStorage(app);
  functions = getFunctions(app);
} else {
  // Loud warning in dev so a misconfigured env doesn't fail silently.
  // The AuthContext will surface a friendly setup message to the user.
  // eslint-disable-next-line no-console
  console.warn(
    '[firebase] Missing VITE_FIREBASE_* env vars — auth, Firestore, and Storage are disabled. ' +
    'See client/.env.example.'
  );
}

export { app, auth, db, storage, functions };
