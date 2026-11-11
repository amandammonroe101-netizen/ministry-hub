/* ─────────────────────────────────────────────────────────────
   Reminders — shared model for "remind me before this happens."

   The data lives on the Calendar event itself. A reminder is a
   pair of fields on a calendar event:
     reminder_offset : 'none' | 'at' | '5m' | '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w'
     reminder_time   : 'HH:MM' — only meaningful for day/week offsets
                       (controls what time of day the reminder fires);
                       sub-day offsets are computed relative to the
                       event_time itself, so reminder_time is ignored.

   A reminder is "due" when:
     - reminder_offset is set (not 'none' / empty)
     - the computed fire time is in the past
     - the event itself hasn't started yet

   The Calendar bell + NavRail badge both consume useDueReminders()
   so a single source of truth drives notification counts.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import { useUserStoreKey } from './userStore';

/* Dropdown options shown in any form that lets the user set a
   reminder. Order matters — appears top-to-bottom in the menu. */
export const REMINDER_OPTIONS = [
  { id: 'none', label: 'None'              },
  { id: 'at',   label: 'At meeting time'   },
  { id: '5m',   label: '5 minutes before'  },
  { id: '15m',  label: '15 minutes before' },
  { id: '30m',  label: '30 minutes before' },
  { id: '1h',   label: '1 hour before'     },
  { id: '2h',   label: '2 hours before'    },
  { id: '1d',   label: '1 day before'      },
  { id: '2d',   label: '2 days before'     },
  { id: '1w',   label: '1 week before'     },
];

const REMINDER_LABEL = REMINDER_OPTIONS.reduce((acc, o) => {
  acc[o.id] = o.label; return acc;
}, {});
export function reminderLabel(id) { return REMINDER_LABEL[id] || ''; }

/* offsets that span multiple days — the reminder_time field is
   used here to pick a sensible time-of-day. Sub-day offsets use
   the event_time itself. */
const DAY_LEVEL = new Set(['1d', '2d', '1w']);
export function isDayLevel(offset) { return DAY_LEVEL.has(offset); }

/* Compute when a reminder should actually fire for an event.
   Returns a Date or null when the input is invalid / 'none'.
   Local-midnight parsing avoids the UTC-shift gotcha. */
export function computeFireAt(eventDate, eventTime, offset, reminderTime) {
  if (!eventDate || !offset || offset === 'none') return null;
  const [y, m, d] = eventDate.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const [eh, em] = (eventTime || '00:00').split(':').map(n => parseInt(n, 10) || 0);
  const ev = new Date(y, m - 1, d, eh, em, 0, 0);
  if (isNaN(ev.getTime())) return null;

  if (offset === 'at')  return ev;
  if (offset === '5m')  return new Date(ev.getTime() -  5 * 60 * 1000);
  if (offset === '15m') return new Date(ev.getTime() - 15 * 60 * 1000);
  if (offset === '30m') return new Date(ev.getTime() - 30 * 60 * 1000);
  if (offset === '1h')  return new Date(ev.getTime() -  60 * 60 * 1000);
  if (offset === '2h')  return new Date(ev.getTime() - 2 * 60 * 60 * 1000);

  if (isDayLevel(offset)) {
    const days = offset === '1d' ? 1 : offset === '2d' ? 2 : 7;
    const fire = new Date(ev);
    fire.setDate(fire.getDate() - days);
    if (reminderTime && /^\d{2}:\d{2}$/.test(reminderTime)) {
      const [rh, rm] = reminderTime.split(':').map(n => parseInt(n, 10) || 0);
      fire.setHours(rh, rm, 0, 0);
    }
    return fire;
  }
  return null;
}

/* Pull the event's start time from its event_date + event_time. */
function eventStart(ev) {
  if (!ev?.event_date) return null;
  const [y, m, d] = ev.event_date.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const [h, mn] = (ev.event_time || '00:00').split(':').map(n => parseInt(n, 10) || 0);
  return new Date(y, m - 1, d, h, mn, 0, 0);
}

/* True when the reminder is due RIGHT NOW (fireAt has passed).
   No end-time cutoff: a reminder stays visible on the bell
   indefinitely until the user explicitly dismisses it. That way
   reminders that fire while you weren't looking are still
   waiting for you when you check the bell. */
export function isReminderDue(ev, now = Date.now()) {
  if (!ev?.reminder_offset || ev.reminder_offset === 'none') return false;
  const fire = computeFireAt(ev.event_date, ev.event_time, ev.reminder_offset, ev.reminder_time);
  if (!fire) return false;
  return fire.getTime() <= now;
}

const DISMISSED_KEY = 'reminders-dismissed';

/* React hook: subscribes to the user's calendar events doc and
   returns the subset whose reminder is currently due AND hasn't
   been dismissed by the user. Re-checks once a minute so reminders
   show up at the right time without needing a full page reload.

   Consumers:
     - Calendar bell (Calendar.jsx) — lists each due reminder
     - NavRail (NavRail.jsx)         — counts the badge
   Use `useDismissReminder()` (below) to clear a reminder.
   ───────────────────────────────────────────────────────────── */
export function useDueReminders() {
  const [events]                     = useUserStoreKey('calendar-events', []);
  const [dismissedRaw, setDismissed] = useUserStoreKey(DISMISSED_KEY, []);
  const [tick, setTick]              = useState(0);

  useEffect(() => {
    /* Tick once every 10 seconds so reminders fire within seconds
       of their scheduled time. (Previously 60 seconds, which made
       reminders appear up to a minute late.) */
    const i = setInterval(() => setTick(x => x + 1), 10 * 1000);
    return () => clearInterval(i);
  }, []);

  const dismissed = Array.isArray(dismissedRaw) ? dismissedRaw : [];

  /* Prune dismissed ids ONLY when the underlying event no longer
     exists (was deleted). Once dismissed, a reminder for an
     existing event stays dismissed forever — no auto-resurrection
     when the event time passes. Previously dismissed entries were
     GC'd by time, which caused dismissed reminders to come back
     after their fire time + grace window. */
  useEffect(() => {
    if (dismissed.length === 0) return;
    const evs = Array.isArray(events) ? events : [];
    const eventIds = new Set(evs.map(e => e.id));
    const pruned = dismissed.filter(id => eventIds.has(id));
    if (pruned.length !== dismissed.length) setDismissed(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick]);

  return useMemo(() => {
    const evs = Array.isArray(events) ? events : [];
    const now = Date.now();
    const skip = new Set(dismissed);
    return evs
      .filter(ev => !skip.has(ev.id) && isReminderDue(ev, now))
      .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
    // tick is intentionally a dep so the interval re-runs the filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, dismissed, tick]);
}

/* React hook: returns a dismiss function. Adding an event id
   removes that reminder from useDueReminders() output for the
   current user; the dismissal persists per-user via Firestore
   so it survives reload + follows the user across devices. */
export function useDismissReminder() {
  const [, setDismissed] = useUserStoreKey(DISMISSED_KEY, []);
  return (id) => {
    if (!id) return;
    setDismissed(prev => {
      const base = Array.isArray(prev) ? prev : [];
      if (base.includes(id)) return base;
      return [...base, id];
    });
  };
}
