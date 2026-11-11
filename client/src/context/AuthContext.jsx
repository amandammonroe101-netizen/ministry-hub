import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../lib/firebase';
import { ensureUserProfile } from '../lib/userProfile';

/* ─────────────────────────────────────────────────────────────
   AuthContext — Firebase Auth wrapper.

   Exposes the same shape we had with the custom JWT system:
     {
       user,         // { uid, email, displayName, photoURL } | null
       loading,      // true on first mount while Firebase boots
       configured,   // false if VITE_FIREBASE_* env vars are missing
       login(creds), // signInWithEmailAndPassword
       register(d),  // createUserWithEmailAndPassword + set displayName
       logout(),     // signOut
     }
   ───────────────────────────────────────────────────────────── */

const AuthContext = createContext(null);

/** Map a Firebase user to the trimmed shape the rest of the app consumes.
 *  Keep the raw uid as the document key for all user-scoped Firestore data. */
const shapeUser = (u) => u && ({
  uid:         u.uid,
  email:       u.email,
  displayName: u.displayName || u.email?.split('@')[0] || 'Member',
  photoURL:    u.photoURL || null,
});

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  /* Subscribe to Firebase's auth state. Fires once on mount with the
     currently-signed-in user (or null), then again on every sign-in /
     sign-out / token refresh. */
  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      const shaped = shapeUser(fbUser);
      setUser(shaped);
      setLoading(false);
      /* On every sign-in (or page reload while signed in) make sure the
         user's profile + identifying key exist. Best-effort: if Firestore
         rules aren't published yet this fails silently and the Chat page
         shows its own setup hint. */
      if (shaped) {
        try { await ensureUserProfile(shaped); } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[auth] ensureUserProfile failed:', e?.message || e);
        }
      }
    });
    return unsub;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* env vars.');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return shapeUser(cred.user);
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* env vars.');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      // displayName isn't set by createUserWithEmailAndPassword — patch it
      // immediately so the rest of the app sees the right label.
      await updateProfile(cred.user, { displayName: name });
    }
    return shapeUser(cred.user);
  }, []);

  const logout = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured: firebaseConfigured,
      login,
      register,
      logout,
    }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
