/* Journal reminders service — Firestore-backed.
   /users/{uid}/kv/journal-reminders → array of { id, time, label, days, created_at } */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY = 'journal-reminders';

export const journalReminderService = {
  getAll: async () => {
    const uid = requireUid();
    return wrap(await readList(uid, KEY));
  },
  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const reminder = {
      id:           makeId('jr'),
      time:         data.time || '',
      label:        data.label || '',
      days:         Array.isArray(data.days) ? data.days : [],
      /* `syncCalendar` toggles whether this reminder also creates
         calendar events (one per matching weekday). `syncWeeks` is
         the span (1..52). `eventIds` tracks the events we created
         so they can be cleaned up on delete or when sync is off. */
      syncCalendar: !!data.syncCalendar,
      syncWeeks:    Math.max(1, Math.min(52, parseInt(data.syncWeeks, 10) || 12)),
      eventIds:     Array.isArray(data.eventIds) ? data.eventIds : [],
      created_at:   new Date().toISOString(),
    };
    await writeList(uid, KEY, [reminder, ...list]);
    return wrap(reminder);
  },
  update: async (id, patch) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(r => r.id === id ? { ...r, ...patch } : r);
    await writeList(uid, KEY, next);
    return wrap(next.find(r => r.id === id) || null);
  },
  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(r => r.id !== id));
    return wrap({ id });
  },
};
