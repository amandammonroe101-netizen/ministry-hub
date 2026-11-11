/* Women's Ministry meal trains — Firestore-backed (one doc per train).

   Storage layout:
     /users/{uid}/womens-meal-trains/{trainId}   ← one doc per meal train
   Each train embeds everything scoped to it — the day-by-day delivery
   schedule, the volunteer pool, reminder/communication log, and a
   coordinator notes log. Same one-doc-per-item shape as
   retreatService, since none of this is ever queried across trains.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';

const COLL_NAME = 'womens-meal-trains';

function trainsCollRef(uid) {
  return collection(db, 'users', uid, COLL_NAME);
}
function trainDocRef(uid, id) {
  return doc(db, 'users', uid, COLL_NAME, id);
}

function defaultMealTrain(data = {}) {
  return {
    id:                  makeId('mt'),
    recipientName:       data.recipientName || 'Untitled Meal Train',
    category:            data.category || 'baby',
    status:              data.status || 'planning',
    startDate:           data.startDate || '',
    endDate:             data.endDate || '',
    coordinator:         data.coordinator || '',
    contactPhone:        data.contactPhone || '',
    contactEmail:        data.contactEmail || '',
    address:             data.address || '',
    dropOffInstructions: data.dropOffInstructions || '',
    householdSize:       data.householdSize ?? '',
    mealTimePreference:  data.mealTimePreference || '',
    allergies:           data.allergies || '',
    dietaryNotes:        data.dietaryNotes || '',
    description:         data.description || '',
    schedule:            [],   // [{ id, date, mealTime, volunteerId, volunteerName, volunteerPhone, volunteerEmail, meal, status: 'open'|'claimed'|'delivered', notes }]
    volunteers:          [],   // [{ id, womanId, name, phone, email, allergySafeConfirmed, notes }]
    reminders:           [],   // [{ id, type: 'reminder'|'thank-you', date, note, sent }]
    notesLog:            [],   // [{ id, content, created_at }]
    created_at:          new Date().toISOString(),
    updated_at:          new Date().toISOString(),
  };
}

async function readTrain(uid, id) {
  const snap = await getDoc(trainDocRef(uid, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllTrains(uid) {
  const snap = await getDocs(trainsCollRef(uid));
  return snap.docs.map(d => d.data());
}

export const mealTrainService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readAllTrains(uid);
    return wrap(list.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    return wrap(await readTrain(uid, id));
  },

  create: async (data) => {
    const uid = requireUid();
    const train = defaultMealTrain(data);
    await setDoc(trainDocRef(uid, train.id), train);
    return wrap(train);
  },

  /** Shallow-merge patch onto the train doc. Nested arrays (schedule,
   *  volunteers, reminders, notesLog) are passed as whole arrays — the
   *  caller reads the current array off the in-memory train, mutates
   *  it, and passes the new array back in `data`. */
  update: async (id, data) => {
    const uid = requireUid();
    const cur = await readTrain(uid, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(trainDocRef(uid, id), next);
    return wrap(next);
  },

  delete: async (id) => {
    const uid = requireUid();
    await deleteDoc(trainDocRef(uid, id));
    return wrap({ id });
  },
};
