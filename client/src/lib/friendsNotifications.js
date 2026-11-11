/* Shared Friends notifications hook.

   Surfaces the "people to act on today" for the Friends feature so the
   in-page activity bell (Friends.jsx) and the NavRail "Friends" tab
   badge render the same count without duplicating the reach-out math.

   Sources of notifications (kv: 'friends' — the live friend list):
     • Reach-out due — friends whose next scheduled reach-out date is
       today or overdue.
     • Birthdays — friends whose birthday is today.

   The reach-out / birthday helpers below are pure copies of the ones
   in Friends.jsx (kept in sync intentionally) so this hook has no
   dependency on the page module. */

import { useMemo } from 'react';
import {
  parseISO, differenceInDays, addDays, addYears, isBefore, startOfDay,
} from 'date-fns';
import { useUserStoreKey } from './userStore';

const FREQ_DAYS  = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
const DAY_INDEX  = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const safeParseDate = (s) => {
  if (!s) return null;
  try { return parseISO(s.includes('T') ? s : s.replace(' ', 'T')); }
  catch { return null; }
};

/* Next scheduled reach-out date — weekday list takes precedence over
   the interval cadence. Returns a Date or null. */
function nextScheduledDate(friend) {
  const days = (friend.reach_out_days || [])
    .map(d => DAY_INDEX[d])
    .filter(n => n !== undefined);

  if (days.length > 0) {
    const today = startOfDay(new Date());
    const start = friend.last_contacted
      ? addDays(startOfDay(safeParseDate(friend.last_contacted) || today), 1)
      : today;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (days.includes(d.getDay())) return d;
    }
    return null;
  }

  if (!friend.last_contacted) return null;
  const last = safeParseDate(friend.last_contacted);
  if (!last) return null;
  const interval = FREQ_DAYS[friend.communication_frequency] ?? 7;
  return addDays(startOfDay(last), interval);
}

/* Reach-out state: 'never' | 'overdue' | 'due-today' | 'upcoming'. */
function reachOutStatus(friend) {
  const today = startOfDay(new Date());
  const dueDate = nextScheduledDate(friend);

  if (!friend.last_contacted && (friend.reach_out_days || []).length === 0) {
    return { state: 'never', overdue: null };
  }
  if (!dueDate) return { state: 'never', overdue: null };

  const diff = differenceInDays(dueDate, today);
  if (diff < 0)  return { state: 'overdue',   overdue: -diff };
  if (diff === 0) return { state: 'due-today', overdue: 0 };
  return            { state: 'upcoming',   overdue: -diff };
}

function daysToBirthday(friend) {
  if (!friend.birthday) return null;
  try {
    const bday = parseISO(friend.birthday);
    const now = new Date();
    let next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
    if (isBefore(next, new Date(now.getFullYear(), now.getMonth(), now.getDate()))) {
      next = addYears(next, 1);
    }
    return differenceInDays(next, now);
  } catch { return null; }
}

/* Build the bell items (reach-out due first, then today's birthdays),
   matching the shape Friends.jsx already renders: { id, kind, title,
   body, friend }. */
export function buildFriendsNotifications(friends) {
  const list = Array.isArray(friends) ? friends : [];
  const out = [];

  const due = list
    .map(f => ({ f, r: reachOutStatus(f) }))
    .filter(x => x.r.state === 'overdue' || x.r.state === 'due-today')
    .sort((a, b) => (b.r.overdue || 0) - (a.r.overdue || 0));

  for (const { f, r } of due) {
    out.push({
      id:    `reach-${f.id}`,
      kind:  'reach',
      title: f.name,
      body:  r.state === 'overdue'
        ? `${r.overdue} day${r.overdue === 1 ? '' : 's'} overdue`
        : 'Due to reach out today',
      friend: f,
    });
  }

  for (const f of list.filter(x => daysToBirthday(x) === 0)) {
    out.push({
      id:    `bday-${f.id}`,
      kind:  'birthday',
      title: f.name,
      body:  '🎂 Birthday today',
      friend: f,
    });
  }

  return out;
}

/* Live-subscribed Friends notifications. Used by the NavRail badge so
   it tracks the same reach-out + birthday signals as the page bell. */
export function useFriendsNotifications() {
  const [friendsRaw] = useUserStoreKey('friends', []);
  const friends = Array.isArray(friendsRaw) ? friendsRaw : [];
  const notifications = useMemo(() => buildFriendsNotifications(friends), [friends]);
  return { notifications };
}
