/* Shared helper for "sync this recurring reminder to my Calendar".
   Pulled out of Journal.jsx so the Prayer page can use the same code
   path — both pages let the user pick days-of-week + a time + a span
   (1..52 weeks) and want the next N matching weekdays materialized as
   calendar events.

   Each generated event carries a `source` tag (e.g. 'prayer-reminder'
   or 'journal-reminder') and the caller stores the returned event ids
   so the events can be cleaned up when the user toggles sync off,
   changes the schedule, or deletes the reminder. */

import { calendarService } from '../services/calendarService';

const SHORT_INDEX = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

/** YYYY-MM-DD in the local timezone (calendarService expects this). */
function toLocalISO(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Next occurrence of `targetWeekday` (0=Sun..6=Sat) on/after `baseDate`. */
function nextOccurrenceISOFor(targetWeekday, baseDate = new Date()) {
  const offset = (targetWeekday - baseDate.getDay() + 7) % 7;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offset);
  return toLocalISO(d);
}

/** For each selected weekday, walk forward `weeks` * 7 days and emit
 *  the local-ISO dates. Returns a sorted, deduped list. */
export function reminderDates(days, weeks = 12) {
  const span = Math.max(1, Math.min(52, parseInt(weeks, 10) || 12));
  const out = new Set();
  const base = new Date();
  for (const short of days || []) {
    const target = SHORT_INDEX[short];
    if (target == null) continue;
    const startISO = nextOccurrenceISOFor(target, base);
    const [y, m, d] = startISO.split('-').map(n => parseInt(n, 10));
    const start = new Date(y, m - 1, d);
    for (let i = 0; i < span; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i * 7);
      out.add(toLocalISO(cur));
    }
  }
  return Array.from(out).sort();
}

/** Materialize a recurring reminder as calendar events. Returns the
 *  array of created event ids so the caller can persist them and
 *  tear them down later. Failures are logged + swallowed (we don't
 *  want a calendar outage to break the settings save). */
export async function createReminderEvents({ label, time, days, weeks, color, source, sourceId }) {
  try {
    const dates = reminderDates(days || [], weeks);
    if (!dates.length) return [];
    const title  = label || 'Reminder';
    const events = dates.map(date => ({
      title,
      description: '',
      event_date:  date,
      event_time:  time || '',
      color:       color || '#a78bfa',
      category:    'general',
      source:      source || 'reminder',
      source_id:   sourceId || '',
    }));
    const res = await calendarService.bulkCreate(events);
    return (res?.data?.data || []).map(e => e.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[reminderCalendarSync] create failed:', e?.message || e);
    return [];
  }
}

/** Bulk-delete previously-created reminder events. Safe to call with
 *  an empty / non-array argument — turns into a noop. */
export async function deleteReminderEvents(eventIds) {
  if (!Array.isArray(eventIds) || !eventIds.length) return;
  try {
    await calendarService.bulkDelete(eventIds);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[reminderCalendarSync] delete failed:', e?.message || e);
  }
}
