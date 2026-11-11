/* Women's Ministry conferences — Firestore-backed (one doc per conference).

   Storage layout:
     /users/{uid}/womens-conferences/{conferenceId}   ← one doc per conference
   Each conference doc embeds everything scoped to that conference —
   speakers, session schedule, attendees (optionally linked to a
   shared Women's directory record), group travel logistics, budget
   line items, and follow-up notes. None of it needs to be queried
   across conferences, so giving each conference its own doc mirrors
   the one-doc-per-retreat shape in retreatService.js.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';

const COLL_NAME = 'womens-conferences';

function conferencesCollRef(uid) {
  return collection(db, 'users', uid, COLL_NAME);
}
function conferenceDocRef(uid, id) {
  return doc(db, 'users', uid, COLL_NAME, id);
}

function defaultConference(data = {}) {
  return {
    id:               makeId('conf'),
    name:             data.name || 'Untitled Conference',
    theme:            data.theme || '',
    type:             data.type || 'attending', // 'attending' | 'hosting'
    status:           data.status || 'upcoming',
    startDate:        data.startDate || '',
    endDate:          data.endDate || '',
    location:         data.location || '',
    organizer:        data.organizer || '',
    website:          data.website || '',
    description:      data.description || '',
    cap:              data.cap ?? '',
    costPerPerson:    data.costPerPerson ?? '',
    speakers:         [],   // [{ id, name, topic, bio }]
    sessions:         [],   // [{ id, date, time, title, speakerName, location, notes }]
    attendees:        [],   // [{ id, womanId, name, email, phone, regStatus, paymentStatus, amountPaid, scholarship, scholarshipAmount, travelMethod, travelNotes, notes }]
    groupTravel:      { method: '', departureLocation: '', departureTime: '', returnTime: '', notes: '' },
    scholarshipFund:  data.scholarshipFund ?? '',
    scholarshipNotes: data.scholarshipNotes || '',
    budgetItems:      [],   // [{ id, kind: 'income'|'expense', category, label, amount, notes }]
    debrief:          '',
    takeaways:        [],   // [{ id, attendeeName, text }]
    actionItems:      [],   // [{ id, text, owner, done }]
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  };
}

async function readConference(uid, id) {
  const snap = await getDoc(conferenceDocRef(uid, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllConferences(uid) {
  const snap = await getDocs(conferencesCollRef(uid));
  return snap.docs.map(d => d.data());
}

export const conferenceService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readAllConferences(uid);
    return wrap(list.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    return wrap(await readConference(uid, id));
  },

  create: async (data) => {
    const uid = requireUid();
    const conference = defaultConference(data);
    await setDoc(conferenceDocRef(uid, conference.id), conference);
    return wrap(conference);
  },

  /** Shallow-merge patch onto the conference doc. Nested arrays/objects
   *  (speakers, sessions, attendees, groupTravel, budgetItems, takeaways,
   *  actionItems) are passed as whole values — the caller reads the
   *  current value off the in-memory conference, mutates it, and passes
   *  the new value back in `data`. */
  update: async (id, data) => {
    const uid = requireUid();
    const cur = await readConference(uid, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(conferenceDocRef(uid, id), next);
    return wrap(next);
  },

  delete: async (id) => {
    const uid = requireUid();
    await deleteDoc(conferenceDocRef(uid, id));
    return wrap({ id });
  },
};
