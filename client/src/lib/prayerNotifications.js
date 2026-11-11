/* Shared Prayer notifications hook.

   Surfaces the "things to act on today" for the Prayers feature so
   the new bell + popover on Prayers.jsx and any future
   NavRail-prayer badge can render the same count without duplicating
   logic.

   Sources of notifications:
     • Today's prayer reminder (single — kv: 'prayer-reminders')
         Fires for the whole day whenever the reminder is enabled and
         today's weekday is in the reminder's day list. An empty/missing
         day list is treated as "every day".
     • Long-standing prayer alerts (kv: 'prayer-requests')
         Active prayers older than `longstandingThreshold` days without
         being answered. Surfaced when `longstandingAlert` is on.

   Dismissals live in kv 'prayer-dismissed-today' as
     { date: 'YYYY-MM-DD', ids: [...] }
   and reset automatically when the day rolls over (we just ignore
   entries that don't match today's date). */

import { useEffect, useMemo, useState } from 'react';
import { useUserStoreKey } from './userStore';
import { DEFAULT_REMINDERS, DEFAULT_NOTIF_PREFS } from './prayerPageSettings';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayISO() {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/* Re-render once per minute so time-gated notifications appear at
   their scheduled minute without the user reloading the page. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

/* `prayerStatus` mirrors getKind() in Prayers.jsx without importing
   from a page file. Praise + answered roll up; everything else is
   "praying" so it stays eligible for long-standing alerts. */
function isStillPraying(p) {
  if (!p) return false;
  if (p.entry_type === 'praise')   return false;
  if (p.status     === 'answered') return false;
  return true;
}

export function usePrayerNotifications() {
  useMinuteTick();

  const [reminders]  = useUserStoreKey('prayer-reminders',   DEFAULT_REMINDERS);
  const [prayers]    = useUserStoreKey('prayer-requests',    []);
  const [notifPrefs] = useUserStoreKey('prayer-notif-prefs', DEFAULT_NOTIF_PREFS);
  const [dismissed, setDismissed] = useUserStoreKey(
    'prayer-dismissed-today',
    { date: '', ids: [] },
  );

  const today      = todayISO();
  const todayShort = DAY_SHORT[new Date().getDay()];
  const dismissedIds = dismissed?.date === today ? (dismissed.ids || []) : [];

  const notifications = useMemo(() => {
    const out = [];

    /* Today's prayer reminder. Fires whenever the reminder is enabled,
       the user opted into surfacing reminders in the bell
       (notifPrefs.dailyReminderAlert), and today is one of the
       reminder's days. We surface it for the whole scheduled day —
       the configured time is shown in the body — so the notification
       is reliably visible in the bell rather than only at the exact
       firing minute (which the user could easily miss). An empty/
       missing day list is treated as "every day" so a freshly enabled
       reminder always shows. */
    if (reminders?.enabled
        && notifPrefs?.dailyReminderAlert !== false) {
      const days = (Array.isArray(reminders.days) && reminders.days.length > 0)
        ? reminders.days
        : DAY_SHORT;
      if (days.includes(todayShort)) {
        const nid = `pr-reminder-${today}`;
        if (!dismissedIds.includes(nid)) {
          out.push({
            id:     nid,
            title:  '🙏 Time to pray',
            body:   'Spend some time in prayer today.',
            source: 'prayer-reminder',
            icon:   '🙏',
          });
        }
      }
    }

    /* Long-standing prayer alerts — one per qualifying prayer, capped
       at 5 so the popover doesn't get overwhelmed. The cap is just a
       UX guard; the badge still counts ALL of them so the user knows
       there are more if they open the Board. */
    if (notifPrefs?.longstandingAlert !== false) {
      const threshold = Math.max(1, Number(notifPrefs?.longstandingThreshold) || 30);
      const eligible = (prayers || [])
        .filter(isStillPraying)
        .map(p => {
          const created = (p.created_at || '').slice(0, 10);
          if (!created) return null;
          const [py, pm, pd] = created.split('-').map(n => parseInt(n, 10));
          const [ty, tm, td] = today.split('-').map(n => parseInt(n, 10));
          const days = Math.round(
            (new Date(ty, tm - 1, td) - new Date(py, pm - 1, pd)) / 86_400_000
          );
          return days >= threshold ? { p, days } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      for (const { p, days } of eligible) {
        const nid = `pr-long-${p.id}-${today}`;
        if (dismissedIds.includes(nid)) continue;
        out.push({
          id:     nid,
          title:  '⏳ Still on the wall',
          body:   `"${p.title || 'Untitled prayer'}" — ${days} days waiting.`,
          source: 'long-standing',
          icon:   '⏳',
          prayerId: p.id,
        });
      }
    }

    return out;
  }, [reminders, prayers, notifPrefs, dismissedIds, today, todayShort]);

  const dismiss = (id) => {
    if (dismissedIds.includes(id)) return;
    setDismissed({ date: today, ids: [...dismissedIds, id] });
  };

  const dismissAll = () => {
    setDismissed({ date: today, ids: notifications.map(n => n.id) });
  };

  return { notifications, dismiss, dismissAll };
}
