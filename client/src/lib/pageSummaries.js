/* ─────────────────────────────────────────────────────────────
   Page Summaries — generates a short, natural-language paragraph
   describing "what's new" in each of the personal pages, feeding the
   per-page summary carousel that opens once on the first launch of
   each day (right after the Verse of the Day, replacing the old
   list-style Daily Briefing).

   These are BUILT-IN smart summaries, not an LLM: each summarizer
   reads its page's real data and stitches together a paragraph from
   counts, names, dates, and recent items. No API key, works offline,
   and is instant. Adding a page is a single entry in SUMMARY_PAGES.

   Returned item shape (one per enabled page):
     { id, label, icon, accent, path, paragraph }

   Gating (once-per-day) + the Settings page toggles are shared with
   the old briefing module so a single preference key controls both.
   ───────────────────────────────────────────────────────────── */

import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getValue } from './userStore';
import { journalService } from '../services/journalService';
import { journalReminderService } from '../services/journalReminderService';
import { prayerService } from '../services/prayerService';
import { friendsService } from '../services/friendsService';
import { BRIEFING_PAGES_KEY, isBriefingPageEnabled } from './dailyBriefing';

/* ─── Date / time helpers (LOCAL time, never UTC) ──────────────── */
function localDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const todayWeekday = () => WEEKDAYS[new Date().getDay()];
const minutesOfDay = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

function parseHHMM(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmtTime(t) {
  const mins = parseHHMM(t);
  if (mins == null) return '';
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
const dateOnly = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : '');

/* Unwrap the legacy { data: { data } } service envelope → array. */
function listOf(res) {
  const v = res?.data?.data;
  return Array.isArray(v) ? v : [];
}

/* Join a list of names into readable prose: "Sara", "Sara and Mark",
   "Sara, Mark and 2 others". Filters out blanks. */
function listNames(names) {
  const clean = (names || []).map((n) => (n || '').trim()).filter(Boolean);
  if (!clean.length) return 'someone';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean[0]}, ${clean[1]} and ${clean.length - 2} other${clean.length - 2 > 1 ? 's' : ''}`;
}

function daysToBirthday(birthday) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday || '');
  if (!m) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((next - today) / 86400000);
}

function reachOutState(friend) {
  const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(new Date());

  let due = null;
  const days = (friend.reach_out_days || []).map((d) => DAY_INDEX[d]).filter((n) => n !== undefined);
  if (days.length) {
    const last = friend.last_contacted ? new Date(friend.last_contacted) : null;
    const start = last && !isNaN(last) ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) : today;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (days.includes(d.getDay())) { due = d; break; }
    }
  } else if (friend.last_contacted) {
    const last = new Date(friend.last_contacted);
    if (!isNaN(last)) {
      const interval = FREQ_DAYS[friend.communication_frequency] ?? 7;
      due = new Date(last.getFullYear(), last.getMonth(), last.getDate() + interval);
    }
  }
  if (!due) return 'never';
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due-today';
  return 'upcoming';
}

/* ─── Per-page summarizers — each returns a paragraph string ────── */

async function journalSummary(uid, ctx) {
  let entries = [];
  let reminders = [];
  try { entries = listOf(await journalService.getAll()); } catch { /* optional */ }
  try { reminders = listOf(await journalReminderService.getAll()); } catch { /* optional */ }

  const wroteToday = entries.some((e) => dateOnly(e.created_at) === ctx.today);
  const dueReminders = reminders.filter((r) => Array.isArray(r.days) && r.days.includes(ctx.weekday));

  let verse = null;
  try {
    const vs = JSON.parse(localStorage.getItem('mh_memory_verses') || '[]');
    verse = Array.isArray(vs) ? vs.find((v) => v && v.active && !v.archived && !v.memorized) : null;
  } catch { /* ignore */ }

  const parts = [];
  parts.push(wroteToday
    ? "You've already journaled today — nicely done."
    : "You haven't written today's entry yet.");
  if (entries.length) {
    parts.push(`Your journal now holds ${entries.length} entr${entries.length > 1 ? 'ies' : 'y'}.`);
  }
  if (dueReminders.length) {
    const r = dueReminders[0];
    parts.push(`Your "${r.label || 'journaling'}" reminder is set for ${r.time ? fmtTime(r.time) : 'today'}.`);
  }
  if (verse?.ref) {
    parts.push(`Your active memory verse, ${verse.ref}, is ready for a quick review.`);
  }
  return parts.join(' ');
}

async function prayersSummary(uid) {
  const prayers = listOf(await prayerService.getAll());
  if (!prayers.length) {
    return "Your prayer list is empty right now. Add a request or a praise whenever something's on your heart.";
  }
  const open = prayers.filter((p) => p.entry_type !== 'praise' && p.status !== 'answered');
  const urgent = open.filter((p) => p.is_urgent === 1 || p.is_urgent === true);
  const daily = open.filter((p) => p.is_daily === 1 || p.is_daily === true);
  const answered = prayers.filter((p) => p.status === 'answered');

  const parts = [];
  parts.push(open.length
    ? `You're carrying ${open.length} open prayer request${open.length === 1 ? '' : 's'} right now.`
    : "You have no open requests at the moment.");
  if (urgent.length) {
    parts.push(`${urgent.length} ${urgent.length > 1 ? 'are' : 'is'} marked urgent${urgent.length === 1 && urgent[0].title ? ` — "${urgent[0].title}"` : ''}.`);
  }
  if (daily.length) {
    parts.push(`You pray over ${daily.length} of them daily.`);
  }
  if (answered.length) {
    parts.push(`And ${answered.length} ${answered.length > 1 ? 'have' : 'has'} been answered — worth pausing to give thanks.`);
  }
  return parts.join(' ');
}

async function friendsSummary(uid) {
  const friends = listOf(await friendsService.getFriends());
  if (!friends.length) {
    return "You haven't added any friends yet. Add a few to keep up with birthdays and check-ins.";
  }
  const bdayToday = friends.filter((f) => daysToBirthday(f.birthday) === 0);
  const bdaySoon = friends
    .map((f) => ({ f, d: daysToBirthday(f.birthday) }))
    .filter((x) => x.d != null && x.d > 0 && x.d <= 7)
    .sort((a, b) => a.d - b.d);
  const states = friends.map((f) => ({ f, r: reachOutState(f) }));
  const overdue = states.filter((x) => x.r === 'overdue');
  const dueToday = states.filter((x) => x.r === 'due-today');

  const parts = [`You're keeping up with ${friends.length} friend${friends.length > 1 ? 's' : ''}.`];
  if (bdayToday.length) {
    parts.push(`🎂 It's ${listNames(bdayToday.map((f) => f.name))}'s birthday today!`);
  } else if (bdaySoon.length) {
    const n = bdaySoon[0];
    parts.push(`${n.f.name || 'A friend'}'s birthday is in ${n.d} day${n.d > 1 ? 's' : ''}.`);
  }
  if (overdue.length) {
    parts.push(`${overdue.length} ${overdue.length > 1 ? 'are' : 'is'} overdue for a check-in.`);
  }
  if (dueToday.length) {
    parts.push(`You're due to reach out to ${listNames(dueToday.map((x) => x.f.name))} today.`);
  }
  if (parts.length === 1) {
    parts.push("Everyone's up to date — no check-ins due right now.");
  }
  return parts.join(' ');
}

async function dayPlannerSummary(uid, ctx) {
  const plans = (await getValue(uid, 'day-plans')) || {};
  const plan = plans[ctx.today];
  if (!plan) {
    return "You haven't mapped out today yet. Open the Day Planner to block out your time and set your top priorities.";
  }
  const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
  const done = blocks.filter((b) => b.done).length;
  const open = blocks.filter((b) => !b.done);
  const overdue = open.filter((b) => {
    const end = parseHHMM(b.end) ?? parseHHMM(b.start);
    return end != null && end < ctx.nowMin;
  });
  const upcoming = open
    .filter((b) => {
      const s = parseHHMM(b.start);
      return s != null && s >= ctx.nowMin;
    })
    .sort((a, b) => (parseHHMM(a.start) ?? 0) - (parseHHMM(b.start) ?? 0));
  const prios = (Array.isArray(plan.priorities) ? plan.priorities : []).filter((p) => !p.done);

  const parts = [];
  if (blocks.length) {
    parts.push(`You've planned ${blocks.length} time block${blocks.length > 1 ? 's' : ''} for today${done ? `, and you've already wrapped up ${done}` : ''}.`);
  } else {
    parts.push("You haven't added any time blocks yet today.");
  }
  if (overdue.length) {
    parts.push(`${overdue.length} ${overdue.length > 1 ? 'are' : 'is'} still unfinished from earlier.`);
  }
  if (upcoming.length) {
    const n = upcoming[0];
    parts.push(`Next up is "${n.title || 'an untitled block'}"${n.start ? ` at ${fmtTime(n.start)}` : ''}.`);
  } else if (open.length) {
    parts.push("Nothing's left on the clock for the rest of the day.");
  }
  if (prios.length) {
    parts.push(`You still have ${prios.length} top priorit${prios.length > 1 ? 'ies' : 'y'} to tackle.`);
  }
  return parts.join(' ');
}

async function chatSummary(uid) {
  let channels = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'channels'), where('memberUids', 'array-contains', uid)),
    );
    channels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { /* rules / offline */ }

  if (!channels.length) {
    return "You haven't joined any channels yet. Head to Chat to find a conversation or start your own.";
  }

  const lastReads = (await getValue(uid, 'chat:last-reads')) || {};
  let totalUnread = 0;
  const hot = [];
  await Promise.all(channels.slice(0, 25).map(async (c) => {
    try {
      const ms = await getDocs(query(
        collection(db, 'channels', c.id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50),
      ));
      const cutoff = lastReads[c.id] || 0;
      let n = 0;
      ms.forEach((d) => {
        const data = d.data();
        if (data.authorUid === uid) return;
        const t = data.createdAt?.toMillis?.() || 0;
        if (t > cutoff) n++;
      });
      if (n > 0) hot.push({ name: c.name || 'a channel', n });
      totalUnread += n;
    } catch { /* skip unreadable channel */ }
  }));

  const parts = [`You're a member of ${channels.length} channel${channels.length > 1 ? 's' : ''}.`];
  if (totalUnread > 0) {
    hot.sort((a, b) => b.n - a.n);
    parts.push(`There ${totalUnread > 1 ? 'are' : 'is'} ${totalUnread} unread message${totalUnread > 1 ? 's' : ''} waiting across ${hot.length} of them${hot[0] ? ` — most in "${hot[0].name}"` : ''}.`);
  } else {
    parts.push("You're all caught up — no unread messages.");
  }
  return parts.join(' ');
}

/* ─── Registry: the personal pages, in carousel order. The same
   list drives the Settings toggles (id/label/icon). ─────────────── */
export const SUMMARY_PAGES = [
  { id: 'journal',    label: 'Journal',     icon: '📖', accent: '#a78bfa', path: '/journal',     run: journalSummary },
  { id: 'prayers',    label: 'Prayers',     icon: '🙏', accent: '#f472b6', path: '/prayers',     run: prayersSummary },
  { id: 'friends',    label: 'Friends',     icon: '🤝', accent: '#fbbf24', path: '/friends',     run: friendsSummary },
  { id: 'dayPlanner', label: 'Day Planner', icon: '🗓', accent: '#60a5fa', path: '/day-planner', run: dayPlannerSummary },
  { id: 'chat',       label: 'Chat',        icon: '💬', accent: '#38bdf8', path: '/chat',        run: chatSummary },
];

/**
 * Build one paragraph summary per ENABLED personal page, in carousel
 * order. Respects the same Settings toggles as the old briefing
 * (a page is included unless its box is unchecked). Failures are
 * isolated — a page that errors still gets a graceful fallback line.
 */
export async function getPageSummaries() {
  const uid = auth?.currentUser?.uid;
  if (!uid) return [];

  const ctx = {
    today: localDateKey(),
    weekday: todayWeekday(),
    nowMin: minutesOfDay(),
  };

  let prefs = {};
  try { prefs = (await getValue(uid, BRIEFING_PAGES_KEY)) || {}; } catch { /* all-enabled */ }
  const active = SUMMARY_PAGES.filter((p) => isBriefingPageEnabled(prefs, p.id));

  const results = await Promise.allSettled(active.map((p) => p.run(uid, ctx)));
  return active.map((p, i) => {
    const r = results[i];
    const paragraph = r.status === 'fulfilled' && r.value
      ? r.value
      : `Couldn't load your ${p.label} summary right now — try opening the page directly.`;
    return { id: p.id, label: p.label, icon: p.icon, accent: p.accent, path: p.path, paragraph };
  });
}
