/* Shared journal notifications hook.

   Surfaces the "things to act on today" for the Journal feature so
   both Journal.jsx (the bell + popover) and NavRail.jsx (the small
   blue badge on the Journal nav item) can render the same count
   without duplicating the computation.

   Sources of notifications:
     • Journal entry reminders   (kv: 'journal-reminders')
     • Memory verse review events (kv: 'calendar-events' where source
       === 'memory-verse' and event_date === today)

   Per request: reminders WITHOUT a specific time fire at 12:00 AM on
   their day (i.e. they're immediately visible the moment that day
   begins) — OR right away if added on the same day.

   Dismissals are stored in kv 'journal-dismissed-today' as
   `{ date: 'YYYY-MM-DD', ids: [...] }`. The list auto-resets when the
   day rolls over (we just ignore entries that don't match today's
   date), so no scheduled cleanup is needed. */

import { useEffect, useMemo, useState } from 'react';
import { useUserStoreKey } from './userStore';
import { DEFAULT_NOTIF_PREFS, DEFAULT_GOALS, isOnVacation } from './journalPageSettings';

/* Pretty-print "HH:MM" → "6 PM" / "6:30 PM". Mirrors format12Hour
   in Journal.jsx so reminder + bell strings stay consistent. */
function fmt12(hhmm) {
  if (!hhmm) return '';
  const [hStr, mStr = '0'] = String(hhmm).split(':');
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return hhmm;
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${period}` : `${h}:${String(m).padStart(2, '0')} ${period}`;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function parseTimeToMinutes(t) {
  if (!t) return 0; // no time → fires at 12 AM (i.e. immediately for today)
  const parts = String(t).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1] || '0', 10) || 0;
  return h * 60 + m;
}

/* Re-render once per minute so currentMin-driven gating moves on
   without needing the page to refresh. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

export function useJournalNotifications() {
  useMinuteTick();

  const [reminders]               = useUserStoreKey('journal-reminders', []);
  const [calEvents]               = useUserStoreKey('calendar-events', []);
  const [entries]                 = useUserStoreKey('journal-entries', []);
  const [notifPrefs]              = useUserStoreKey('journal-notif-prefs', DEFAULT_NOTIF_PREFS);
  const [goals]                   = useUserStoreKey('journal-goals', DEFAULT_GOALS);
  const [dismissed, setDismissed] = useUserStoreKey(
    'journal-dismissed-today',
    { date: '', ids: [] },
  );

  const today      = todayISO();
  const todayShort = DAY_SHORT[new Date().getDay()];
  const currentMin = nowMinutes();

  /* Auto-reset dismissed list if the stored date is from a previous
     day (we just treat it as empty rather than mutating storage,
     because writes during render are bad). */
  const dismissedIds = dismissed?.date === today ? (dismissed.ids || []) : [];

  const notifications = useMemo(() => {
    const out = [];

    /* Journal entry reminders that match today's weekday and whose
       fire time has passed. No-time reminders fire at 00:00, which
       means they're visible all day. */
    (reminders || []).forEach(r => {
      const days = Array.isArray(r.days) ? r.days : [];
      if (!days.includes(todayShort)) return;
      const fireMin = parseTimeToMinutes(r.time);
      if (currentMin < fireMin) return;
      const nid = `je-${r.id}-${today}`;
      if (dismissedIds.includes(nid)) return;
      out.push({
        id:      nid,
        title:   r.label || 'Journal entry reminder',
        body:    r.time ? `Reminded at ${fmt12(r.time)}` : 'Reminded today',
        source:  'journal-entry',
        time:    r.time || '',
        icon:    '📖',
      });
    });

    /* Memory verse review events scheduled for today. */
    (calEvents || []).forEach(e => {
      if (!e || e.source !== 'memory-verse') return;
      if (e.event_date !== today) return;
      const fireMin = parseTimeToMinutes(e.event_time);
      if (currentMin < fireMin) return;
      const nid = `mv-${e.id}`;
      if (dismissedIds.includes(nid)) return;
      out.push({
        id:     nid,
        title:  e.title || 'Memory verse review',
        body:   'Review your memory verse',
        source: 'memory-verse',
        time:   e.event_time || '',
        icon:   '📝',
      });
    });

    /* Skipped-day alert: if the user has gone N+ days without a
       new entry, surface a single notification per day. Suppressed
       while on vacation. */
    if (notifPrefs?.skippedDayAlert && !isOnVacation(goals, today)) {
      const threshold = Math.max(1, Number(notifPrefs.skippedDayThreshold) || 3);
      const latest = (entries || []).reduce((acc, e) => {
        const d = (e.created_at || '').slice(0, 10);
        return d && d > acc ? d : acc;
      }, '');
      if (latest) {
        const [ay, am, ad] = latest.split('-').map(n => parseInt(n, 10));
        const [ty, tm, td] = today.split('-').map(n => parseInt(n, 10));
        const diffDays = Math.round(
          (new Date(ty, tm - 1, td) - new Date(ay, am - 1, ad)) / 86_400_000
        );
        if (diffDays >= threshold) {
          const nid = `sk-${today}`;
          if (!dismissedIds.includes(nid)) {
            out.push({
              id:     nid,
              title:  'Time to journal?',
              body:   `It's been ${diffDays} day${diffDays === 1 ? '' : 's'} since your last entry.`,
              source: 'skipped-day',
              time:   '',
              icon:   '⏰',
            });
          }
        }
      }
    }

    /* Goal-miss alert: after the user's chosen "Evening nudge" time
       (HH:MM, defaults 20:00), if they haven't hit their daily goal
       and aren't on vacation, fire a gentle nudge. */
    if (notifPrefs?.goalMissAlert && goals?.dailyGoal > 0
        && !isOnVacation(goals, today)
        && currentMin >= parseTimeToMinutes(notifPrefs.goalMissTime || '20:00')) {
      const writtenToday = (entries || []).filter(e =>
        (e.created_at || '').slice(0, 10) === today
      ).length;
      if (writtenToday < goals.dailyGoal) {
        const nid = `gm-${today}`;
        if (!dismissedIds.includes(nid)) {
          out.push({
            id:     nid,
            title:  'Daily goal not yet met',
            body:   `You're at ${writtenToday}/${goals.dailyGoal} entries today.`,
            source: 'goal-miss',
            time:   notifPrefs.goalMissTime || '20:00',
            icon:   '🎯',
          });
        }
      }
    }

    return out;
  }, [reminders, calEvents, entries, notifPrefs, goals,
      dismissedIds, today, todayShort, currentMin]);

  const dismiss = (id) => {
    if (dismissedIds.includes(id)) return;
    setDismissed({ date: today, ids: [...dismissedIds, id] });
  };

  const dismissAll = () => {
    setDismissed({ date: today, ids: notifications.map(n => n.id) });
  };

  return { notifications, dismiss, dismissAll };
}
