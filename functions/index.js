/* ─────────────────────────────────────────────────────────────
   Cloud Functions for Ministry Hub.

   Currently a single callable: deleteUserAccount. Client apps can
   never delete another user's Firebase Auth login — only a trusted
   backend with the Admin SDK can, which is why this exists.

   Deploy with: cd functions && npm install && firebase deploy --only functions
   (requires the Blaze pay-as-you-go plan — Cloud Functions aren't
   available on the free Spark plan).
   ───────────────────────────────────────────────────────────── */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

/* Keep this in sync with client/src/lib/founder.js — the two can't
   share a module since this runs in a separate Cloud Functions
   deployment, so the constant is duplicated by hand. */
const FOUNDER_EMAIL = 'amandammonroe101@gmail.com';

function assertFounder(request) {
  const email = request.auth?.token?.email;
  if (!email || email.toLowerCase() !== FOUNDER_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the founder account can do this.');
  }
}

/* Subcollections that live under /users/{uid}. Firestore's
   recursiveDelete on the parent doc already sweeps these, but they're
   listed here for clarity/documentation of what gets wiped. */
const USER_SUBCOLLECTIONS = ['kv', 'studio-projects', 'writingDocs'];

exports.deleteUserAccount = onCall(async (request) => {
  assertFounder(request);

  const targetUid = request.data?.uid;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'A target uid is required.');
  }

  let targetAuthUser;
  try {
    targetAuthUser = await admin.auth().getUser(targetUid);
  } catch {
    throw new HttpsError('not-found', 'No such user.');
  }

  if (targetAuthUser.email && targetAuthUser.email.toLowerCase() === FOUNDER_EMAIL) {
    throw new HttpsError('failed-precondition', 'The founder account can\'t be deleted.');
  }

  const firestore = admin.firestore();

  // Wipe Firestore data first — recursiveDelete sweeps the /users/{uid}
  // doc plus every subcollection (kv, studio-projects, writingDocs) in
  // one call. Doing this before removing the Auth record means if it
  // fails, the account still exists and the founder can retry rather
  // than being left with orphaned data and no way to log back in.
  await firestore.recursiveDelete(firestore.collection('users').doc(targetUid));

  // Wipe any uploaded blobs (avatars, stems, chat files, etc.) — all
  // per-user Storage objects live under users/{uid}/... per
  // client/src/lib/userStorage.js.
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `users/${targetUid}/` });
  } catch (err) {
    // Best-effort — a missing bucket/prefix shouldn't block account
    // deletion, but surface it so the founder knows to check manually.
    console.warn(`[deleteUserAccount] storage cleanup failed for ${targetUid}:`, err.message);
  }

  // Finally, revoke the login itself.
  await admin.auth().deleteUser(targetUid);

  return { success: true, uid: targetUid };
});
