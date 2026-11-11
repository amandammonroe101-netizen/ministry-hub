/* Calendar custom events service — Firestore-backed.
   /users/{uid}/kv/calendar-events → array of event objects. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY = 'calendar-events';

/* Build the canonical event shape. `source` + `source_id` are
   optional — features that auto-generate recurring events (Bible
   Studies, Scheduling Rec., etc.) stamp them so they can find
   and clean up their own events later. */
function makeEvent(data = {}) {
  return {
    id:              makeId('ce'),
    title:           data.title || '',
    description:     data.description || '',
    event_date:      data.event_date || '',
    event_time:      data.event_time || '',
    end_date:        data.end_date || '',
    color:           data.color || '#a78bfa',
    category:        data.category || 'general',
    source:          data.source || '',     // e.g. 'youth-bible-study'
    source_id:       data.source_id || '',  // e.g. the Bible Study id
    /* Reminder (see lib/reminders.js for the model). 'none'
       means no reminder; reminder_time is only used for
       day/week-level offsets; reminder_note is a free-text
       message surfaced on the Notification Bell when the
       reminder fires. */
    reminder_offset: data.reminder_offset || 'none',
    reminder_time:   data.reminder_time   || '',
    reminder_note:   data.reminder_note   || '',
    created_at:      new Date().toISOString(),
  };
}

export const calendarService = {
  getAll: async () => {
    const uid = requireUid();
    return wrap(await readList(uid, KEY));
  },
  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const ev = makeEvent(data);
    await writeList(uid, KEY, [ev, ...list]);
    return wrap(ev);
  },

  /* Create many events in a single Firestore round-trip — used by
     features like Bible-Study calendar sync that generate dozens
     of recurring events at once. */
  bulkCreate: async (datas) => {
    const uid = requireUid();
    if (!Array.isArray(datas) || datas.length === 0) return wrap([]);
    const list    = await readList(uid, KEY);
    const created = datas.map(makeEvent);
    await writeList(uid, KEY, [...created, ...list]);
    return wrap(created);
  },

  /* Delete many events in a single round-trip. Silently skips
     ids that aren't in the list. */
  bulkDelete: async (ids) => {
    const uid = requireUid();
    if (!Array.isArray(ids) || ids.length === 0) return wrap({ ids: [] });
    const set  = new Set(ids);
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(e => !set.has(e.id)));
    return wrap({ ids });
  },
  update: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const next = list.map(e => e.id === id ? { ...e, ...data } : e);
    await writeList(uid, KEY, next);
    return wrap(next.find(e => e.id === id) || null);
  },
  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(e => e.id !== id));
    return wrap({ id });
  },
};
