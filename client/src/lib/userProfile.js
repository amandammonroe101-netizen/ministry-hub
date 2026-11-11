/* ─────────────────────────────────────────────────────────────
   userProfile — every signed-in user gets a public profile document
   at /users/{uid} with a unique, human-shareable identifying key.

   The key (e.g. "ABCD-EFGH") is what others type to add this user to
   a private chat. The /userKeys/{key} index lets us look up a uid
   from a key with a single doc read.

   Public surface:
     ensureUserProfile(authUser) → Promise<profile>
       Called on every sign-in. Creates the profile + claims an
       identifying key if this is the user's first login. Idempotent.

     getProfileByKey(key)        → Promise<{uid, ...profile} | null>
     getProfileByUid(uid)        → Promise<profile | null>

     useUserProfile()            → React hook returning the current
                                   user's profile (or null while loading).
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { useAuth } from '../context/AuthContext';

/* 31-char alphabet that excludes ambiguous characters (I, L, O, 0, 1)
   so keys are easy to share verbally without confusion. */
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomKey() {
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  }
  // Format as XXXX-XXXX for readability
  return s.slice(0, 4) + '-' + s.slice(4);
}

/** Reserve a unique key. Tries up to 20 candidates; throws if all collide. */
async function claimIdentifyingKey(uid) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomKey();
    const keyRef = doc(db, 'userKeys', candidate);
    const snap = await getDoc(keyRef);
    if (snap.exists()) continue; // taken — try again
    await setDoc(keyRef, { uid, createdAt: serverTimestamp() });
    return candidate;
  }
  throw new Error('Could not generate a unique identifying key.');
}

/* ─── Contact-detail visibility ────────────────────────────────
   /users/{uid} is readable by every signed-in member (that's what
   makes Contacts search and chat author labels work), so hiding your
   email or phone cannot mean "fetch it and don't render it" — anyone
   can read the document directly and ignore the UI.

   So a hidden field is simply NOT STORED. `email`/`phone` are deleted
   from the profile the moment their visibility toggle goes off, and
   re-written when it goes back on. docs/firestore.rules enforces the
   same invariant server-side, so a modified client can't park a
   hidden-but-present value there either.

   Every reader in the app already guards with
   `profile?.emailVisible !== false && profile?.email`, which handles
   an absent field unchanged. */

/** Build the email/phone half of a profile write. Spread into the
 *  patch wherever the visibility toggles are saved. */
export function contactFields({ emailVisible, phone, phoneVisible }) {
  const authEmail = auth?.currentUser?.email || '';
  return {
    emailVisible,
    email: emailVisible === false ? deleteField() : authEmail,
    phoneVisible,
    phone: phoneVisible === false ? deleteField() : String(phone || '').trim(),
  };
}

/** Bring an existing profile in line with its own visibility flags —
 *  strips a hidden value left behind by an older build, and restores
 *  the email from the auth record when it's been un-hidden.
 *
 *  Returns `{ patch, view }`: `patch` goes to Firestore (and may hold
 *  deleteField() sentinels), `view` is the same change applied to a
 *  plain object so callers can return an accurate profile without a
 *  second read. Both are empty / unchanged when nothing needs fixing. */
function healContactFields(data, authUser) {
  const patch = {};
  const view = { ...data };

  if (data.emailVisible === false && 'email' in data) {
    patch.email = deleteField();
    delete view.email;
  } else if (data.emailVisible !== false && !data.email && authUser?.email) {
    patch.email = authUser.email;
    view.email = authUser.email;
  }

  if (data.phoneVisible === false && 'phone' in data) {
    patch.phone = deleteField();
    delete view.phone;
  }

  return { patch, view };
}

/** Create the user's profile doc if it doesn't already exist. Returns it.
 *  Also stamps lastActiveAt on every call (every sign-in / app reload)
 *  so the Founder Dashboard can show when each user was last active. */
export async function ensureUserProfile(authUser) {
  if (!db || !authUser?.uid) return null;
  const profileRef = doc(db, 'users', authUser.uid);
  const snap = await getDoc(profileRef);
  if (snap.exists()) {
    // Profile exists. If somehow it's missing an identifying key
    // (e.g. partial old data), heal it here. Contact fields are
    // reconciled against their visibility flags on every sign-in, so
    // profiles written by an older build get cleaned up in place.
    const data = snap.data();
    const { patch, view } = healContactFields(data, authUser);
    if (!data.identifyingKey) {
      const identifyingKey = await claimIdentifyingKey(authUser.uid);
      await setDoc(
        profileRef,
        { ...patch, identifyingKey, lastActiveAt: serverTimestamp() },
        { merge: true },
      );
      return { ...view, identifyingKey };
    }
    await setDoc(profileRef, { ...patch, lastActiveAt: serverTimestamp() }, { merge: true });
    return view;
  }
  // First sign-in: claim a key and create the profile
  const identifyingKey = await claimIdentifyingKey(authUser.uid);
  const profile = {
    uid:           authUser.uid,
    email:         authUser.email || '',
    displayName:   authUser.displayName || (authUser.email || 'Member').split('@')[0],
    identifyingKey,
    createdAt:     serverTimestamp(),
    lastActiveAt:  serverTimestamp(),
  };
  await setDoc(profileRef, profile);
  return profile;
}

/** Look up a user by their public identifying key.
 *  Accepts keys with or without the dash. Returns null if not found. */
export async function getProfileByKey(rawKey) {
  if (!db) return null;
  const normalized = String(rawKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length !== 8) return null;
  const key = normalized.slice(0, 4) + '-' + normalized.slice(4);
  const keyRef = doc(db, 'userKeys', key);
  const keySnap = await getDoc(keyRef);
  if (!keySnap.exists()) return null;
  const uid = keySnap.data().uid;
  return getProfileByUid(uid);
}

/** Read a user's public profile by uid. */
export async function getProfileByUid(uid) {
  if (!db || !uid) return null;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

/* ─── Hook ─────────────────────────────────────────────────
   Returns { profile, loading } for the currently-signed-in user.
   Subscribes via onSnapshot so any profile edits stream in live. */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user?.uid || !db) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? { uid: user.uid, ...snap.data() } : null);
        setLoading(false);
      },
      () => {
        setProfile(null);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  return { profile, loading };
}

/* ─── Other users' saved avatars ───────────────────────────────
   Contacts/Chat rows only have {uid, name} snapshots (avatars
   aren't duplicated onto request/connection docs), so this hook
   fetches and caches each uid's chosen avatar (Guy/Gal/Emoji, or
   null) from /users/{uid} so those rows can render the same
   CustomAvatar the owner picked in their Profile tab, instead of
   falling back to initials for people other than yourself.

   Module-level cache: avatars don't change often, and this hook is
   called from list rows across renders/pages, so we fetch each uid
   at most once per session rather than re-reading on every render. */
const avatarCache = new Map(); // uid -> avatar object | null

export function useProfileAvatars(uids) {
  const key = Array.from(new Set((uids || []).filter(Boolean))).sort().join(',');
  const [, bump] = useState(0);

  useEffect(() => {
    const wanted = key ? key.split(',') : [];
    const missing = wanted.filter(u => !avatarCache.has(u));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(async (u) => {
      const p = await getProfileByUid(u);
      avatarCache.set(u, p?.avatar || null);
    })).then(() => { if (!cancelled) bump(n => n + 1); });
    return () => { cancelled = true; };
  }, [key]);

  const map = {};
  for (const u of (key ? key.split(',') : [])) map[u] = avatarCache.get(u) || null;
  return map;
}
