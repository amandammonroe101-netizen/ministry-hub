/* founderService — powers the Founder Dashboard (pages/founder/FounderDashboard.jsx),
   a founder-only page for keeping track of every registered user.

   Reading stats never writes to another user's data — it relies on
   docs/firestore.rules granting the founder account (client/src/lib/founder.js)
   read access to every user's /kv docs and studio-projects/writingDocs
   subcollections, on top of the /users profile that's already
   readable by any signed-in user.

   The one exception is deleteFounderAccount, which calls a Cloud Function
   (functions/index.js) to permanently delete an account — that needs the
   Admin SDK, which is why it can't be done with client-side Firestore
   writes alone. */
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { getValue } from '../lib/userStore';

/* Cap on how many messages we pull per channel for the Chat Log — keeps
   a chatty channel from blowing up read costs on every dashboard visit.
   Mirrors the limit(200) the Chat page itself uses for its live view. */
const MAX_MESSAGES_PER_CHANNEL = 500;

/* kv keys that hold an array of items — see the `const KEY = '...'`
   at the top of each service file. Kept in one place here so adding a
   new counted feature is a one-line change. */
export const KV_COUNTERS = [
  { id: 'journalEntries', key: 'journal-entries', label: 'Journal' },
  { id: 'prayers',        key: 'prayer-requests', label: 'Prayers' },
  { id: 'calendarEvents', key: 'calendar-events',  label: 'Calendar' },
  { id: 'friends',        key: 'friends',          label: 'Friends' },
];

/* Subcollections (one doc per item, rather than a single kv array). */
export const SUBCOLLECTION_COUNTERS = [
  { id: 'writingDocs', name: 'writingDocs', label: 'Writing Mode' },
];

async function countKv(uid, key) {
  try {
    const value = await getValue(uid, key);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0; // best-effort — a missing/unreadable doc just counts as 0
  }
}

async function countSubcollection(uid, name) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, name));
    return snap.size;
  } catch {
    return 0;
  }
}

/** Fetch every registered user's profile plus a breakdown of how much
 *  content they've created, for the Founder Dashboard roster table. */
export async function loadFounderStats() {
  if (!db) return [];
  const profilesSnap = await getDocs(collection(db, 'users'));
  const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

  return Promise.all(profiles.map(async (profile) => {
    const counts = {};
    await Promise.all([
      ...KV_COUNTERS.map(async (c) => { counts[c.id] = await countKv(profile.uid, c.key); }),
      ...SUBCOLLECTION_COUNTERS.map(async (c) => { counts[c.id] = await countSubcollection(profile.uid, c.name); }),
    ]);

    const totalItems = Object.values(counts).reduce((sum, n) => sum + n, 0);

    return {
      uid:            profile.uid,
      displayName:    profile.displayName || 'Member',
      email:          profile.email || '',
      identifyingKey: profile.identifyingKey || '',
      createdAt:      profile.createdAt || null,
      lastActiveAt:   profile.lastActiveAt || null,
      counts,
      totalItems,
    };
  }));
}

/** Fetch every PUBLIC channel's message history for the Founder Dashboard's
 *  Chat Log — lets the founder review conversations for foul language or
 *  conflicts between members. Private channels are deliberately excluded:
 *  the founder has no special read access to them under docs/firestore.rules
 *  (same public-only visibility as any other signed-in user), and this
 *  function relies entirely on that existing access rather than a rules
 *  change, so private conversations stay private. */
export async function loadPublicChatLog() {
  if (!db) return { channels: [], messages: [] };

  const channelsSnap = await getDocs(query(collection(db, 'channels'), where('type', '==', 'public')));
  const channels = channelsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const perChannel = await Promise.all(channels.map(async (ch) => {
    try {
      const msgsSnap = await getDocs(query(
        collection(db, 'channels', ch.id, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(MAX_MESSAGES_PER_CHANNEL),
      ));
      return msgsSnap.docs.map(d => ({
        id: d.id,
        channelId: ch.id,
        channelName: ch.name || 'Untitled',
        ...d.data(),
      }));
    } catch {
      return []; // best-effort — a channel we can't read (e.g. banned from) just contributes nothing
    }
  }));

  const messages = perChannel.flat().sort(
    (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
  );

  return { channels, messages };
}

/* Same word-count logic JournalDashboard.jsx uses for its own stats —
   duplicated (rather than imported) since that file's copy is scoped to
   the signed-in user's own entries, not built to take a param list. */
function wordCount(text) {
  if (!text) return 0;
  const clean = String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

/* linked_prayer_ids is stored as a JSON-stringified array (see
   journalService.js) — parse defensively since it's free-form data. */
function hasLinkedPrayer(raw) {
  if (!raw) return false;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

/** Fetch every user's journal entries, reduced to privacy-safe metadata
 *  only (never the entry `content`/`title` text itself) — powers the
 *  Founder Dashboard's Journal Insights charts. `scripture` and
 *  `promptText` are app-provided strings (a Bible reference, or one of
 *  the app's own writing prompts), not the user's private writing, so
 *  they're safe to aggregate too. Returns one row per user:
 *  `{ uid, entries: [{ created_at, wordCount, hasScripture, scripture,
 *  promptUsed, promptText, isLocked, hasLinkedPrayer, themeId }] }`. */
export async function loadJournalInsights(uids) {
  return Promise.all(uids.map(async (uid) => {
    let list = [];
    try {
      const value = await getValue(uid, 'journal-entries');
      list = Array.isArray(value) ? value : [];
    } catch {
      list = []; // best-effort — a missing/unreadable doc just contributes nothing
    }
    return {
      uid,
      entries: list.map(e => ({
        created_at:      e.created_at || null,
        wordCount:       wordCount(e.content),
        hasScripture:    !!(e.scripture || e.verse_text),
        scripture:       e.scripture || null,
        promptUsed:      !!e.prompt_used,
        promptText:      e.prompt_used ? (e.prompt_text || null) : null,
        isLocked:        !!e.is_locked,
        hasLinkedPrayer: hasLinkedPrayer(e.linked_prayer_ids),
        themeId:         e.theme_id || 'default',
      })),
    };
  }));
}

/** Fetch every user's prayer requests, reduced to privacy-safe metadata
 *  only (never `title`/`content`/scripture text) — powers the Founder
 *  Dashboard's Prayer Insights charts. `updateDates` is just the
 *  timestamps off each prayer's `updates` timeline (never the update
 *  text). Returns one row per user: `{ uid, prayers: [{ created_at,
 *  updated_at, category, status, entry_type, is_urgent, is_daily,
 *  hasScripture, hasFriends, updateCount, updateDates }] }`. */
export async function loadPrayerInsights(uids) {
  return Promise.all(uids.map(async (uid) => {
    let list = [];
    try {
      const value = await getValue(uid, 'prayer-requests');
      list = Array.isArray(value) ? value : [];
    } catch {
      list = []; // best-effort — a missing/unreadable doc just contributes nothing
    }
    return {
      uid,
      prayers: list.map(p => ({
        created_at:   p.created_at || null,
        updated_at:   p.updated_at || null,
        category:     p.category || 'General',
        status:       p.status || 'praying',
        entry_type:   p.entry_type || 'request',
        is_urgent:    !!p.is_urgent,
        is_daily:     !!p.is_daily,
        hasScripture: !!((Array.isArray(p.verses) && p.verses.length) || p.scripture || p.verse_text),
        hasFriends:   Array.isArray(p.friend_ids) && p.friend_ids.length > 0,
        updateCount:  Array.isArray(p.updates) ? p.updates.length : 0,
        updateDates:  Array.isArray(p.updates) ? p.updates.map(u => u.created_at).filter(Boolean) : [],
      })),
    };
  }));
}

/** Permanently delete a user: their Firebase Auth login, their /users/{uid}
 *  Firestore doc + subcollections (kv, studio-projects, writingDocs), and
 *  any Storage blobs under users/{uid}/. Irreversible.
 *
 *  Runs server-side via the deleteUserAccount Cloud Function (functions/index.js)
 *  because a client SDK can never delete another user's Auth account — only
 *  the Admin SDK can. The function re-checks the founder email itself, so
 *  this is safe even though the check also happens client-side in the UI. */
export async function deleteFounderAccount(uid) {
  if (!functions) throw new Error('Firebase Functions not configured.');
  const call = httpsCallable(functions, 'deleteUserAccount');
  const { data } = await call({ uid });
  return data;
}
