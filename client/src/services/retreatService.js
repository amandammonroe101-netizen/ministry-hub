/* Women's Ministry retreats — Firestore-backed (one doc per retreat).

   Storage layout:
     /users/{uid}/womens-retreats/{retreatId}   ← one doc per retreat
   Each retreat doc embeds everything scoped to that retreat —
   schedule days (with sessions), attendees, rooms, team members,
   budget line items, and packing-list items. A retreat's data never
   needs to be queried across retreats, so giving each retreat its
   own doc (and its own 1 MiB budget) mirrors studioProjectService's
   one-doc-per-project shape.

   Nested collections (attendees, rooms, team, budgetItems,
   packingItems, schedule) have no async side effects per item (no
   file uploads, unlike studio clips), so callers just read/write
   whole arrays through `update()` — same pattern BibleStudies /
   Prayer Groups already use for their embedded lists.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';

const COLL_NAME = 'womens-retreats';

function retreatsCollRef(uid) {
  return collection(db, 'users', uid, COLL_NAME);
}
function retreatDocRef(uid, id) {
  return doc(db, 'users', uid, COLL_NAME, id);
}

function defaultRetreat(data = {}) {
  return {
    id:               makeId('ret'),
    name:             data.name || 'Untitled Retreat',
    theme:            data.theme || '',
    status:           data.status || 'planning',
    startDate:        data.startDate || '',
    endDate:          data.endDate || '',
    location:         data.location || '',
    venueContact:     data.venueContact || '',
    description:      data.description || '',
    cap:              data.cap ?? '',
    costPerPerson:    data.costPerPerson ?? '',
    scholarshipNotes: data.scholarshipNotes || '',
    schedule:         [],   // [{ id, date, label, sessions: [{ id, time, title, leader, location }] }]
    speakers:         [],   // [{ id, name, role, topic, email, phone, bio, notes }]
    attendees:        [],   // [{ id, name, email, phone, paymentStatus, amountPaid, dietary, emergencyContact, emergencyPhone, scholarship, roomId, notes }]
    rooms:            [],   // [{ id, name, capacity, notes }]
    team:             [],   // [{ id, name, role, phone, notes }]
    budgetItems:      [],   // [{ id, kind: 'income'|'expense', category, label, amount, notes }]
    packingItems:     [],   // [{ id, text, category }]
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  };
}

/* Seed list for "Reset to default packing list" — common items for a
   women's retreat. */
export const DEFAULT_PACKING_ITEMS = [
  { category: 'Faith',      text: 'Bible' },
  { category: 'Faith',      text: 'Journal & pen' },
  { category: 'Clothing',   text: 'Comfortable clothes for sessions' },
  { category: 'Clothing',   text: 'Weather-appropriate layers / jacket' },
  { category: 'Clothing',   text: 'Walking shoes' },
  { category: 'Clothing',   text: 'Pajamas & slippers' },
  { category: 'Toiletries', text: 'Toiletries & medications' },
  { category: 'Toiletries', text: 'Towel (if not provided by venue)' },
  { category: 'Essentials', text: 'Phone charger' },
  { category: 'Essentials', text: 'Water bottle' },
  { category: 'Essentials', text: 'Cash for offering / extras' },
  { category: 'Essentials', text: 'Snacks for the room' },
];

async function readRetreat(uid, id) {
  const snap = await getDoc(retreatDocRef(uid, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllRetreats(uid) {
  const snap = await getDocs(retreatsCollRef(uid));
  return snap.docs.map(d => d.data());
}

export const retreatService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readAllRetreats(uid);
    return wrap(list.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    return wrap(await readRetreat(uid, id));
  },

  create: async (data) => {
    const uid = requireUid();
    const retreat = defaultRetreat(data);
    await setDoc(retreatDocRef(uid, retreat.id), retreat);
    return wrap(retreat);
  },

  /** Shallow-merge patch onto the retreat doc. Nested arrays
   *  (schedule, attendees, rooms, team, budgetItems, packingItems)
   *  are passed as whole arrays — the caller reads the current
   *  array off the in-memory retreat, mutates it, and passes the
   *  new array back in `data`. */
  update: async (id, data) => {
    const uid = requireUid();
    const cur = await readRetreat(uid, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(retreatDocRef(uid, id), next);
    return wrap(next);
  },

  delete: async (id) => {
    const uid = requireUid();
    await deleteDoc(retreatDocRef(uid, id));
    return wrap({ id });
  },
};
