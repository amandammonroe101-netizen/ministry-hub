import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { useUserStoreKey } from '../../lib/userStore';
import { calendarService } from '../../services/calendarService';
import { REMINDER_OPTIONS, isDayLevel } from '../../lib/reminders';
import { NAV_VISIBILITY_STORAGE_KEY, isCategoryVisible } from '../settings/navVisibilityConfig';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import DayPlannerPageSettings from './DayPlannerPageSettings';
import { parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';
import './DayPlanner.css';

/* ─────────────────────────────────────────────────────────────
   Day Planner — block out time across a single day.

   Storage:
     day-plans          → { 'YYYY-MM-DD': { theme, priorities, blocks, notes, updatedAt } }
     day-templates      → [{ id, name, theme, priorities, blocks, createdAt }]
     day-recurring      → [{ id, title, start, end, category, freq, weekdays }]
     day-planner-prefs  → { prayerFocusCount }

   Each block:  { id, title, start: 'HH:MM', end: 'HH:MM', category, notes, done, recurringId }
   Each priority: { id, text, done }
   ───────────────────────────────────────────────────────────── */

const HOUR_START   = 6;            // 6 AM
const HOUR_END     = 23;           // 11 PM (block can extend to midnight)
const HOUR_HEIGHT  = 64;           // px per hour
const SNAP_MIN     = 15;           // minute granularity for new blocks

const CATEGORIES = [
  { id: 'prayer',   label: 'Prayer',      color: '#8b5cf6' },
  { id: 'study',    label: 'Bible Study', color: '#60a5fa' },
  { id: 'ministry', label: 'Ministry',    color: '#ec4899' },
  { id: 'meeting',  label: 'Meeting',     color: '#f59e0b' },
  { id: 'work',     label: 'Work',        color: '#14b8a6' },
  { id: 'family',   label: 'Family',      color: '#f97316' },
  { id: 'meals',    label: 'Meals',       color: '#22c55e' },
  { id: 'rest',     label: 'Rest',        color: '#6b7280' },
  { id: 'travel',   label: 'Travel',      color: '#06b6d4' },
  { id: 'exercise', label: 'Exercise',    color: '#ef4444' },
  { id: 'outreach', label: 'Outreach',    color: '#84cc16' },
  { id: 'personal', label: 'Personal',    color: '#a855f7' },
  { id: 'other',    label: 'Other',       color: '#9ca3af' },
];
const CAT_BY_ID = CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

/* ─── Focus / energy levels ──────────────────────────────────
   Tag each block with the kind of energy it demands so the day's
   cognitive load is visible at a glance. 'untagged' is the
   implicit default for blocks without an energy set. */
const ENERGY = [
  { id: 'deep',  label: 'Deep focus', short: 'Deep',  emoji: '🧠', color: '#a78bfa' },
  { id: 'admin', label: 'Admin',      short: 'Admin', emoji: '🗂️', color: '#60a5fa' },
  { id: 'light', label: 'Light',      short: 'Light', emoji: '🌿', color: '#22c55e' },
];
const ENERGY_BY_ID = ENERGY.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

/* ─── Day-type preset templates ──────────────────────────────
   Ready-made schedules the user can drop onto any day with one
   click. They lay down a full set of blocks (+ a theme and a
   couple of priorities). These live alongside the user's own
   saved templates and are applied through the same path. */
const DAY_TYPE_TEMPLATES = [
  {
    id: 'preset-sermon',
    preset: true,
    name: '📖 Sermon Prep Day',
    theme: 'Sermon prep focus',
    priorities: [{ text: 'Finish the sermon outline' }, { text: 'Land one strong illustration' }],
    blocks: [
      { start: '06:30', end: '07:15', category: 'prayer',  title: 'Morning prayer',            energy: 'deep'  },
      { start: '07:15', end: '08:00', category: 'meals',   title: 'Breakfast',                 energy: 'light' },
      { start: '08:00', end: '10:30', category: 'study',   title: 'Exegesis & study',          energy: 'deep'  },
      { start: '10:30', end: '10:45', category: 'rest',    title: 'Break',                     energy: 'light' },
      { start: '10:45', end: '12:30', category: 'study',   title: 'Outline & main points',     energy: 'deep'  },
      { start: '12:30', end: '13:30', category: 'meals',   title: 'Lunch',                     energy: 'light' },
      { start: '13:30', end: '15:30', category: 'work',    title: 'Write the manuscript',      energy: 'deep'  },
      { start: '15:30', end: '16:00', category: 'rest',    title: 'Walk / rest',               energy: 'light' },
      { start: '16:00', end: '17:30', category: 'work',    title: 'Illustrations & application', energy: 'admin' },
    ],
  },
  {
    id: 'preset-visitation',
    preset: true,
    name: '🤝 Visitation Day',
    theme: 'Shepherding & visits',
    priorities: [{ text: 'See the two members in hospital' }, { text: 'Follow up with a first-time guest' }],
    blocks: [
      { start: '07:00', end: '07:45', category: 'prayer',   title: "Pray for those I'll see", energy: 'deep'  },
      { start: '07:45', end: '08:30', category: 'meals',    title: 'Breakfast',               energy: 'light' },
      { start: '08:30', end: '09:00', category: 'travel',   title: 'Drive to first visit',    energy: 'light' },
      { start: '09:00', end: '10:30', category: 'outreach', title: 'Home / hospital visit',   energy: 'admin' },
      { start: '10:30', end: '11:00', category: 'travel',   title: 'Drive to next visit',     energy: 'light' },
      { start: '11:00', end: '12:30', category: 'outreach', title: 'Member check-in',         energy: 'admin' },
      { start: '12:30', end: '13:30', category: 'meals',    title: 'Lunch',                   energy: 'light' },
      { start: '13:30', end: '15:00', category: 'outreach', title: 'Afternoon visits',        energy: 'admin' },
      { start: '15:00', end: '16:00', category: 'work',     title: 'Log notes & follow-ups',  energy: 'admin' },
      { start: '16:00', end: '16:30', category: 'rest',     title: 'Rest & decompress',       energy: 'light' },
    ],
  },
  {
    id: 'preset-sabbath',
    preset: true,
    name: '🕊️ Sabbath / Rest Day',
    theme: 'Rest & renewal',
    priorities: [{ text: 'Unplug from work' }, { text: 'Enjoy time with family' }],
    blocks: [
      { start: '08:00', end: '09:00', category: 'prayer',   title: 'Unhurried prayer & Scripture', energy: 'deep'  },
      { start: '09:00', end: '10:00', category: 'meals',    title: 'Slow breakfast',               energy: 'light' },
      { start: '10:00', end: '12:00', category: 'rest',     title: 'Rest / walk outdoors',         energy: 'light' },
      { start: '12:00', end: '13:30', category: 'family',   title: 'Family lunch',                 energy: 'light' },
      { start: '13:30', end: '15:00', category: 'rest',     title: 'Nap / read',                   energy: 'light' },
      { start: '15:00', end: '17:00', category: 'family',   title: 'Time with family / friends',   energy: 'light' },
      { start: '17:00', end: '18:30', category: 'meals',    title: 'Dinner together',              energy: 'light' },
      { start: '18:30', end: '20:00', category: 'rest',     title: 'Worship & reflection',         energy: 'light' },
    ],
  },
];

/* ─── Date / time helpers ────────────────────────────────── */
const todayIso = () => {
  const d = new Date();
  return iso(d);
};
const iso = (d) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const parseIso = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const formatLong = (s) => {
  const d = parseIso(s);
  if (!d) return s;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const shiftDate = (s, days) => {
  const d = parseIso(s);
  if (!d) return s;
  d.setDate(d.getDate() + days);
  return iso(d);
};
/* Convert 'HH:MM' to minutes-since-midnight. */
const toMin = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
};
const fromMin = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const fmtTime = (hhmm) => {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
};

const EMPTY_PLAN = () => ({
  theme: '',
  priorities: [],
  blocks: [],
  notes: '',
});

/* True if this Bible Study has a meeting on the given date,
   based on its start/end/schedule + customDates fields. Mirrors
   the logic the Calendar-sync uses so the Day Planner can show
   the same meetings WITHOUT requiring the user to push to
   Calendar first. */
function studyMeetsOnDate(study, dateStr) {
  if (!study?.schedule || !dateStr) return false;
  if (study.schedule === 'custom') {
    return Array.isArray(study.customDates) && study.customDates.includes(dateStr);
  }
  if (!study.startDate) return false;
  const start  = parseIso(study.startDate);
  const end    = study.endDate ? parseIso(study.endDate) : null;
  const target = parseIso(dateStr);
  if (!start || !target) return false;
  if (target < start) return false;
  if (end && target > end) return false;
  const diffDays = Math.round((target - start) / (1000 * 60 * 60 * 24));
  if (study.schedule === 'weekly')   return diffDays >= 0 && diffDays % 7 === 0;
  if (study.schedule === 'biweekly') return diffDays >= 0 && diffDays % 14 === 0;
  if (study.schedule === 'monthly')  return target.getDate() === start.getDate();
  return false;
}

const mkId = (prefix) => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

/* ─── Reach-out helpers (mirrors the Friends page logic so the
   "Who to reach out to" card stays consistent) ───────────── */
const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const safeParseDate = (s) => {
  if (!s) return null;
  try { return parseISO(s.includes('T') ? s : s.replace(' ', 'T')); }
  catch { return null; }
};
/* Next scheduled reach-out date for a friend, relative to their
   reach_out_days (weekday list) or communication_frequency. */
const nextReachOut = (friend) => {
  const days = (friend.reach_out_days || []).map(d => DAY_INDEX[d]).filter(n => n !== undefined);
  if (days.length > 0) {
    const base = startOfDay(new Date());
    const start = friend.last_contacted
      ? addDays(startOfDay(safeParseDate(friend.last_contacted) || base), 1)
      : base;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (days.includes(d.getDay())) return d;
    }
    return null;
  }
  if (!friend.last_contacted) return null;
  const last = safeParseDate(friend.last_contacted);
  if (!last) return null;
  return addDays(startOfDay(last), FREQ_DAYS[friend.communication_frequency] ?? 7);
};
/* Reach-out status relative to a reference date (the day being
   planned). Returns { state, overdue, dueDate } where state is
   'never' | 'overdue' | 'due' | 'upcoming'. */
const reachOutStatusFor = (friend, refDateStr) => {
  const ref = startOfDay(parseIso(refDateStr) || new Date());
  const due = nextReachOut(friend);
  const noSchedule = !friend.last_contacted && (friend.reach_out_days || []).length === 0;
  if (noSchedule || !due) return { state: 'never', overdue: null, dueDate: null };
  const diff = differenceInDays(due, ref);
  if (diff < 0)  return { state: 'overdue', overdue: -diff, dueDate: due };
  if (diff === 0) return { state: 'due', overdue: 0, dueDate: due };
  return { state: 'upcoming', overdue: -diff, dueDate: due };
};

/* ─── Recurring-rule helpers ─────────────────────────────────
   A rule: { id, title, start, end, category, freq, weekdays, anchor }
     freq 'daily'    → every day
     freq 'weekdays' → Mon–Fri
     freq 'weekly'   → the weekdays listed in `weekdays` (0–6), every week
     freq 'biweekly' → those weekdays, but only on weeks an even number of
                       weeks away from `anchor` (every 2 weeks)
     freq 'monthly'  → those weekdays, but only on the same week-of-month
                       as `anchor` (e.g. "first Monday of the month") */
function startOfWeekSunday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function weeksBetween(a, b) {
  const ms = startOfWeekSunday(b).getTime() - startOfWeekSunday(a).getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}
function weekOfMonth(d) {
  return Math.floor((d.getDate() - 1) / 7); // 0-based: 0 = first occurrence
}
function recurringMatchesDate(rule, dateStr) {
  const d = parseIso(dateStr);
  if (!d) return false;
  const dow = d.getDay();
  if (rule.freq === 'daily')    return true;
  if (rule.freq === 'weekdays') return dow >= 1 && dow <= 5;
  const onDay = Array.isArray(rule.weekdays) && rule.weekdays.includes(dow);
  if (!onDay) return false;
  if (rule.freq === 'weekly')   return true;
  const anchor = parseIso(rule.anchor);
  if (rule.freq === 'biweekly') {
    if (!anchor) return true;
    return weeksBetween(anchor, d) % 2 === 0;
  }
  if (rule.freq === 'monthly') {
    if (!anchor) return true;
    return weekOfMonth(d) === weekOfMonth(anchor);
  }
  return false;
}
const FREQ_LABEL = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };
const WEEK_DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* The 7 dates of the week (Sun→Sat) that contains `dateStr`. */
function weekDatesFor(dateStr) {
  const d = parseIso(dateStr) || new Date();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(sunday);
    x.setDate(sunday.getDate() + i);
    return iso(x);
  });
}

/* Lay out overlapping blocks side-by-side.
   For each block, assign:
     lane        — the column it lives in (0, 1, 2, …)
     totalLanes  — how many concurrent columns its overlap group spans
   Renderer then sets width = (1 / totalLanes) * available width so
   multiple blocks at the same time each shrink to share the row. */
function computeLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
  const lanes = [];        // each lane: number = the last end-min in it
  const annotated = sorted.map(b => {
    const s = toMin(b.start);
    const e = toMin(b.end);
    let idx = lanes.findIndex(end => end <= s);
    if (idx === -1) { idx = lanes.length; lanes.push(e); }
    else            { lanes[idx] = e; }
    return { ...b, _lane: idx };
  });
  /* totalLanes for each block = 1 + max lane of any block whose time
     range overlaps it. Two-pass so concurrent groups all see the
     widest column count. */
  return annotated.map(b => {
    const s = toMin(b.start);
    const e = toMin(b.end);
    let maxLane = b._lane;
    for (const other of annotated) {
      if (other === b) continue;
      const os = toMin(other.start);
      const oe = toMin(other.end);
      if (os < e && oe > s && other._lane > maxLane) maxLane = other._lane;
    }
    return { ...b, lane: b._lane, totalLanes: maxLane + 1 };
  });
}

/* ─────────────────────────────────────────────────────────── */
export default function DayPlanner() {
  const navigate                  = useNavigate();
  const [plans,     setPlans]     = useUserStoreKey('day-plans', {});
  const [templates, setTemplates] = useUserStoreKey('day-templates', []);
  const [studies]                 = useUserStoreKey('youth:bible-studies', []);
  const [recurring, setRecurring] = useUserStoreKey('day-recurring', []);
  const [prayers]                 = useUserStoreKey('prayer-requests', []);
  const [friends]                 = useUserStoreKey('friends', []);
  const [prefs,     setPrefs]     = useUserStoreKey('day-planner-prefs', { prayerFocusCount: 3 });

  /* Page-visibility — the Prayer Focus and Reach Out panels only
     make sense when the Prayers / Friends pages are enabled in
     Settings, so we mirror that toggle here. */
  const [navVisibility] = useUserStoreKey(NAV_VISIBILITY_STORAGE_KEY, {});
  const showPrayers = isCategoryVisible(navVisibility, 'prayers');
  const showFriends = isCategoryVisible(navVisibility, 'friends');

  /* Topbar profile avatar (mirrors Prayers). */
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile]  = useState(false);

  /* Initial date comes from ?date=YYYY-MM-DD in the URL when set
     (so a Calendar back-link can deep-link to a specific day). */
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(() => {
    const param = searchParams.get('date');
    return (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) ? param : todayIso();
  });
  /* Keep the URL in sync as the user navigates dates so the
     current page is always shareable / refreshable. */
  useEffect(() => {
    if (searchParams.get('date') !== date) {
      setSearchParams({ date }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  /* Calendar events for the selected day. We filter out events
     sourced from the Day Planner itself (since the user's block
     is already shown solid on the timeline — a ghost duplicate
     would just clutter the right margin) and from Bible Studies
     (which render as their own dedicated ghost overlays). */
  const [calendarEvents, setCalendarEvents] = useState([]);
  useEffect(() => {
    let live = true;
    calendarService.getAll().then(r => {
      if (!live) return;
      const all = r?.data?.data || [];
      setCalendarEvents(
        all.filter(e =>
          e.event_date === date
          && e.source !== 'youth-bible-study'
          && e.source !== 'day-planner'
        )
      );
    }).catch(() => setCalendarEvents([]));
    return () => { live = false; };
  }, [date]);

  /* Bible Study meetings on the selected date — computed directly
     from each study's schedule so they appear even if the user
     hasn't pushed them to Calendar yet. */
  const bibleStudyOverlays = useMemo(() => {
    const list = Array.isArray(studies) ? studies : [];
    return list
      .filter(s => studyMeetsOnDate(s, date))
      .filter(s => s.time)                  // skip studies with no time set
      .map(s => ({
        id:    `bs-${s.id}`,
        title: s.name || 'Bible Study',
        time:  s.time,
        leader: s.leader || '',
        location: s.location || '',
      }));
  }, [studies, date]);


  /* Tick the "now" marker forward every minute so it stays in
     sync with the wall clock without a page reload. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const plan = (plans && plans[date]) || EMPTY_PLAN();
  const setPlan = (patch) => {
    setPlans(prev => {
      const base = prev || {};
      const cur  = base[date] || EMPTY_PLAN();
      return { ...base, [date]: { ...cur, ...patch, updatedAt: Date.now() } };
    });
  };

  /* Stats */
  const stats = useMemo(() => {
    const total = (plan.blocks || []).reduce((sum, b) => sum + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
    const dayMinutes = (HOUR_END + 1 - HOUR_START) * 60;
    return {
      scheduledHrs:    (total / 60).toFixed(1),
      freeHrs:         Math.max(0, (dayMinutes - total) / 60).toFixed(1),
      prioritiesDone:  (plan.priorities || []).filter(p => p.done).length,
      prioritiesTotal: (plan.priorities || []).length,
    };
  }, [plan]);

  /* ── Focus / energy mix ────────────────────────────────────
     Sum scheduled minutes by energy level so the day's cognitive
     load is visible. Untagged blocks fall into their own bucket
     and don't count as deep work. */
  const energyStats = useMemo(() => {
    const acc = { deep: 0, admin: 0, light: 0, untagged: 0 };
    for (const b of plan.blocks || []) {
      const mins = Math.max(0, toMin(b.end) - toMin(b.start));
      if (b.energy === 'deep')       acc.deep += mins;
      else if (b.energy === 'admin') acc.admin += mins;
      else if (b.energy === 'light') acc.light += mins;
      else                           acc.untagged += mins;
    }
    return acc;
  }, [plan.blocks]);

  /* ── Prayer focus of the day ───────────────────────────────
     Pull the prayers flagged "daily" (📆 Daily on the Prayers
     page) that aren't yet answered, urgent ones first, and show
     as many as the user's prayerFocusCount preference allows. */
  const prayerFocusCount = Math.max(1, Math.min(10, prefs?.prayerFocusCount ?? 3));
  const prayerFocus = useMemo(() => {
    const list = Array.isArray(prayers) ? prayers : [];
    return list
      .filter(p => p.is_daily && p.status !== 'answered')
      .sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0))
      .slice(0, prayerFocusCount);
  }, [prayers, prayerFocusCount]);

  /* ── Who to reach out to ───────────────────────────────────
     Friends who are overdue or due (relative to the day being
     planned), plus never-scheduled-but-flagged. Overdue first. */
  const reachOutList = useMemo(() => {
    const list = Array.isArray(friends) ? friends : [];
    return list
      .map(f => ({ friend: f, status: reachOutStatusFor(f, date) }))
      .filter(x => x.status.state === 'overdue' || x.status.state === 'due')
      .sort((a, b) => (b.status.overdue || 0) - (a.status.overdue || 0));
  }, [friends, date]);

  /* ── Rest guardrail ────────────────────────────────────────
     Gentle nudges: warn when the day is overloaded or has no
     rest blocked out. */
  const guardrail = useMemo(() => {
    const blocks = plan.blocks || [];
    const scheduled = parseFloat(stats.scheduledHrs);
    const hasRest = blocks.some(b => b.category === 'rest');
    const warnings = [];
    if (scheduled >= 14) warnings.push(`${stats.scheduledHrs}h scheduled — this day is packed. Guard some margin.`);
    if (blocks.length > 0 && !hasRest) warnings.push('No rest blocked out today. Even a short pause matters.');
    return { warnings, ok: warnings.length === 0 && blocks.length > 0 };
  }, [plan.blocks, stats.scheduledHrs]);

  /* Center-pane view mode: single-day timeline vs. today/next-day
     split for evening planning. */
  const [viewMode, setViewMode] = useState('timeline');

  /* ── Recurring-block materialization ───────────────────────
     When a day is opened, drop in any recurring rule that matches
     the date and isn't already present (tracked by recurringId)
     or dismissed for that day. Naturally terminates: once added,
     the block carries recurringId so the next run finds nothing. */
  useEffect(() => {
    const rules = (Array.isArray(recurring) ? recurring : []).filter(r => recurringMatchesDate(r, date));
    if (rules.length === 0) return;
    const cur = (plans && plans[date]) || EMPTY_PLAN();
    const present  = new Set((cur.blocks || []).map(b => b.recurringId).filter(Boolean));
    const dismissed = new Set(cur.dismissedRecurring || []);
    const toAdd = rules.filter(r => !present.has(r.id) && !dismissed.has(r.id));
    if (toAdd.length === 0) return;
    const newBlocks = toAdd.map(r => ({
      id:              mkId('blk'),
      recurringId:     r.id,
      title:           r.title || '',
      start:           r.start,
      end:             r.end,
      category:        r.category || 'personal',
      notes:           '',
      done:            false,
      syncToCalendar:  false,
      reminder:        false,
      reminderOffset:  '15m',
      reminderTime:    '09:00',
      calendarEventId: '',
    }));
    setPlans(prev => {
      const base = prev || {};
      const c = base[date] || EMPTY_PLAN();
      return { ...base, [date]: { ...c, blocks: [...(c.blocks || []), ...newBlocks], updatedAt: Date.now() } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, recurring, plans]);

  /* ── Block CRUD ────────────────────────────────────────── */
  const addBlock = (startHHMM) => {
    const start = startHHMM;
    const endMin = Math.min(toMin(start) + 60, (HOUR_END + 1) * 60);
    const b = {
      id:               mkId('blk'),
      title:            '',
      start,
      end:              fromMin(endMin),
      category:         'personal',
      notes:            '',
      done:             false,
      syncToCalendar:   false,
      reminder:         false,
      reminderOffset:   '15m',
      reminderTime:     '09:00',
      calendarEventId:  '',
    };
    setPlan({ blocks: [...(plan.blocks || []), b] });
    setEditingBlockId(b.id);
  };
  /* Create a fully-specified block (used by the free-time gap
     filler so it can span the whole open slot and preset its
     category/title in one go). Opens the editor afterward. */
  const addBlockAt = ({ start, end, category = 'personal', title = '', energy }) => {
    const endStr = end || fromMin(Math.min(toMin(start) + 60, (HOUR_END + 1) * 60));
    const b = {
      id:               mkId('blk'),
      title,
      start,
      end:              endStr,
      category,
      energy:           energy || '',
      notes:            '',
      done:             false,
      syncToCalendar:   false,
      reminder:         false,
      reminderOffset:   '15m',
      reminderTime:     '09:00',
      calendarEventId:  '',
    };
    setPlan({ blocks: [...(plan.blocks || []), b] });
    setEditingBlockId(b.id);
  };
  const updateBlock = (id, patch) => {
    setPlan({ blocks: (plan.blocks || []).map(b => b.id === id ? { ...b, ...patch } : b) });
  };
  const removeBlock = async (id) => {
    /* If this block had a synced Calendar event, drop it first
       so we don't leave an orphan. Swallow errors — the block
       delete still goes through. */
    const target = (plan.blocks || []).find(b => b.id === id);
    if (target?.calendarEventId) {
      try { await calendarService.delete(target.calendarEventId); } catch { /* noop */ }
    }
    /* If this was a materialized recurring instance, remember the
       dismissal so it doesn't immediately reappear for this day. */
    const remaining = (plan.blocks || []).filter(b => b.id !== id);
    const patch = { blocks: remaining };
    if (target?.recurringId) {
      patch.dismissedRecurring = [...(plan.dismissedRecurring || []), target.recurringId];
    }
    /* If that was the last block, this day no longer has a plan — so
       pull the "Day Is Planned" marker back off the Calendar too. */
    if (remaining.length === 0 && plan.plannedEventId) {
      try { await calendarService.delete(plan.plannedEventId); } catch { /* noop */ }
      patch.plannedEventId = '';
    }
    setPlan(patch);
    if (editingBlockId === id) setEditingBlockId(null);
  };

  /* ── Roll over unfinished blocks to the next day ───────────
     Walk every not-done block and ask, one at a time, whether to
     carry it forward. Confirmed blocks move to tomorrow (fresh id,
     not-done, un-synced) and leave today's timeline. */
  const rollOverUnfinished = async () => {
    const undone = (plan.blocks || []).filter(b => !b.done);
    if (undone.length === 0) {
      window.alert('Nothing to roll over — every block is checked off. 🎉');
      return;
    }
    const next = shiftDate(date, 1);
    const moved = [];
    for (const b of undone) {
      const label = b.title || '(untitled block)';
      if (window.confirm(`Roll "${label}" over to ${formatLong(next)}?`)) {
        moved.push(b);
      }
    }
    if (moved.length === 0) return;
    const movedIds = new Set(moved.map(b => b.id));
    /* Recurring instances we move off today must be dismissed for
       today, or the materialize effect would instantly re-add them. */
    const movedRecurringIds = moved.map(b => b.recurringId).filter(Boolean);
    const carried = moved.map(b => ({
      ...b,
      id:              mkId('blk'),
      done:            false,
      recurringId:     undefined,
      syncToCalendar:  false,
      reminder:        false,
      calendarEventId: '',
    }));
    try {
      await setPlans(prev => {
        const base = prev || {};
        const today    = base[date] || EMPTY_PLAN();
        const tomorrow = base[next] || EMPTY_PLAN();
        return {
          ...base,
          [date]: {
            ...today,
            blocks: (today.blocks || []).filter(b => !movedIds.has(b.id)),
            dismissedRecurring: [...(today.dismissedRecurring || []), ...movedRecurringIds],
            updatedAt: Date.now(),
          },
          [next]: { ...tomorrow, blocks: [...(tomorrow.blocks || []), ...carried], updatedAt: Date.now() },
        };
      });
    } catch (err) {
      window.alert(`Couldn't save the roll-over — ${err?.message || 'please try again.'}`);
    }
  };

  /* ── Recurring-rule CRUD ───────────────────────────────────
     Rules live in their own store and materialize onto matching
     days via the effect above. */
  const addRecurring = (rule) => {
    const id = mkId('rec');
    setRecurring(prev => [...(Array.isArray(prev) ? prev : []), { ...rule, id }]);
    return id;
  };
  const deleteRecurring = (id) => {
    if (!window.confirm('Delete this recurring block? It will be removed from every day in your planner.')) return;
    setRecurring(prev => (Array.isArray(prev) ? prev : []).filter(r => r.id !== id));
    /* Strip every materialized instance of this rule from all days, so
       deleting the rule wipes its whole schedule (not just future days). */
    setPlans(prev => {
      const base = prev || {};
      let changed = false;
      const next = {};
      for (const [day, plan] of Object.entries(base)) {
        const blocks = plan.blocks || [];
        const kept = blocks.filter(b => b.recurringId !== id);
        if (kept.length !== blocks.length) {
          changed = true;
          next[day] = { ...plan, blocks: kept, updatedAt: Date.now() };
        } else {
          next[day] = plan;
        }
      }
      return changed ? next : base;
    });
  };
  /* Promote an existing block into a recurring rule. Instead of
     silently picking "weekly", open a modal that asks the user which
     weekdays + which cadence (every week / 2 weeks / month). */
  const [recurPrompt, setRecurPrompt] = useState(null); // { block }
  const makeBlockRecurring = (block) => setRecurPrompt({ block });
  /* Called by RecurringModal with the user's answers. Creates the
     rule, tags the source block so it isn't duplicated today, and
     confirms that it landed on the schedule. */
  const confirmRecurring = ({ freq, weekdays }) => {
    const block = recurPrompt?.block;
    if (!block) { setRecurPrompt(null); return; }
    const id = addRecurring({
      title:    block.title || '',
      start:    block.start,
      end:      block.end,
      category: block.category || 'personal',
      freq,
      weekdays: Array.isArray(weekdays) ? weekdays : [],
      anchor:   date,
    });
    /* If today is a day this rule fires on, tag the originating
       block so the materialize effect treats it as the instance. */
    if (recurringMatchesDate({ freq, weekdays, anchor: date }, date)) {
      updateBlock(block.id, { recurringId: id });
    }
    setRecurPrompt(null);
    setSyncMsg({ kind: 'ok', text: 'Recurring block added to your schedule.' });
  };

  /* Push every block on the current day to the Calendar in one
     batch + add ONE day-summary reminder at 12 AM (instead of
     per-block reminders — the user said one ping per day is
     plenty). Individual block reminders are turned off here;
     the user can still set per-block reminders manually via the
     editor afterwards if they want both. */
  const [syncMsg, setSyncMsg] = useState(null);
  /* Auto-dismiss the sync/copy status banner 5s after it reports a
     finished state (ok/err). Leave 'busy' (in-progress) banners alone. */
  useEffect(() => {
    if (!syncMsg || syncMsg.kind === 'busy') return;
    const t = setTimeout(() => setSyncMsg(null), 5000);
    return () => clearTimeout(t);
  }, [syncMsg]);
  const syncAllBlocks = async () => {
    const list = plan.blocks || [];
    if (list.length === 0) {
      setSyncMsg({ kind: 'err', text: 'No blocks to sync — add some first.' });
      return;
    }
    setSyncMsg({ kind: 'busy', text: 'Marking this day on your Calendar…' });

    /* The Calendar only ever shows ONE artifact per planned day: a
       "Day Is Planned" marker (shown as a pill on the day, under the
       Day Planner filter). Individual blocks are NOT put on the
       Calendar. So syncing does three things:

       1) Remove any individual block events we pushed before, and
          clear their syncToCalendar flag / stored event id.
       2) Remove any legacy "📋 Today's Schedule" summary event.
       3) Create (or refresh) the single "Day Is Planned" marker. */

    // 1) Tear down per-block calendar events from the old model.
    for (const b of list) {
      if (b.calendarEventId) {
        try { await calendarService.delete(b.calendarEventId); } catch { /* noop */ }
      }
    }
    setPlan({
      blocks: list.map(b => ({ ...b, syncToCalendar: false, calendarEventId: '' })),
    });

    // 2) Tear down the legacy day-summary event.
    if (plan.daySummaryEventId) {
      try { await calendarService.delete(plan.daySummaryEventId); } catch { /* noop */ }
      setPlan({ daySummaryEventId: '' });
    }

    // 3) Create / refresh the single "Day Is Planned" marker.
    try {
      if (plan.plannedEventId) {
        try { await calendarService.delete(plan.plannedEventId); } catch { /* noop */ }
      }
      const r = await calendarService.create({
        title:            '🗓 Day Is Planned',
        description:      plan.theme || '',
        event_date:       date,
        event_time:       '00:00',
        end_date:         '',
        color:            '#f59e0b',
        category:         'day-planner',
        source:           'day-planner',
        source_id:        `planned-${date}`,
        reminder_offset:  'none',
        reminder_time:    '',
      });
      const newId = r?.data?.data?.id || '';
      setPlan({ plannedEventId: newId });
      setSyncMsg({ kind: 'ok', text: 'Day marked as planned on your Calendar.' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DayPlanner] Day-planned marker failed:', e?.message || e);
      setSyncMsg({ kind: 'err', text: 'Could not mark the day — please try again.' });
    }
  };

  /* Push the block's current state to the global Calendar. An event
     is needed whenever the block is synced OR has a bell reminder —
     the bell feed reads calendar-events, so a reminder-only block
     still needs a backing event to fire (without forcing the visible
     "Sync to Calendar" checkbox on):
       - wants event, no event yet  → create
       - wants event, has event     → update in place
       - wants neither, has event   → delete
     Returns the new calendarEventId (empty string when deleted). */
  const syncBlockToCalendar = async (block) => {
    if (!block) return;
    const wantEvent = block.syncToCalendar || block.reminder;
    const cat = CAT_BY_ID[block.category] || CAT_BY_ID.personal;
    const payload = {
      title:            block.title || '(untitled block)',
      description:      block.notes || '',
      event_date:       date,
      event_time:       block.start,
      end_date:         '',
      color:            cat.color,
      category:         'day-planner',
      source:           'day-planner',
      source_id:        block.id,
      reminder_offset:  block.reminder ? (block.reminderOffset || 'at') : 'none',
      reminder_time:    block.reminderTime || '',
    };
    let newId = block.calendarEventId || '';
    try {
      if (wantEvent && block.calendarEventId) {
        await calendarService.update(block.calendarEventId, payload);
      } else if (wantEvent && !block.calendarEventId) {
        const r = await calendarService.create(payload);
        newId = r?.data?.data?.id || '';
      } else if (!wantEvent && block.calendarEventId) {
        await calendarService.delete(block.calendarEventId);
        newId = '';
      } else {
        return;   // nothing to do
      }
      /* Persist the eventId change back onto the block. */
      if (newId !== (block.calendarEventId || '')) {
        setPlan({
          blocks: (plan.blocks || []).map(b =>
            b.id === block.id ? { ...b, calendarEventId: newId } : b
          ),
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DayPlanner] Calendar sync failed:', e?.message || e);
    }
  };

  /* ── Priorities ────────────────────────────────────────── */
  const addPriority = () => {
    setPlan({ priorities: [...(plan.priorities || []), { id: mkId('pri'), text: '', done: false }] });
  };
  const updatePriority = (id, patch) => {
    setPlan({ priorities: (plan.priorities || []).map(p => p.id === id ? { ...p, ...patch } : p) });
  };
  const removePriority = (id) => {
    setPlan({ priorities: (plan.priorities || []).filter(p => p.id !== id) });
  };

  /* ── Templates ─────────────────────────────────────────── */
  /* Name comes from the inline input in TemplatesPanel — window.prompt
     is disabled in Electron, so we never rely on it. Falls back to the
     day theme or "My Day" when left blank. */
  const saveAsTemplate = (rawName) => {
    const name = (rawName || '').trim() || plan.theme || 'My Day';
    const tpl = {
      id:         mkId('tpl'),
      name,
      theme:      plan.theme || '',
      priorities: (plan.priorities || []).map(p => ({ ...p, id: mkId('pri'), done: false })),
      blocks:     (plan.blocks || []).map(b => ({ ...b, id: mkId('blk') })),
      createdAt:  Date.now(),
    };
    setTemplates(prev => [...(prev || []), tpl]);
  };
  const applyTemplate = (tpl) => {
    if (!tpl) return;
    if (!window.confirm(`Replace today's blocks + priorities with "${tpl.name}"? (Notes are kept.)`)) return;
    /* Normalize every block to the full shape — preset day-types
       only carry start/end/category/title/energy, so fill in the
       rest (done, sync flags, …) to keep them well-formed. */
    setPlan({
      theme:      tpl.theme || plan.theme || '',
      priorities: (tpl.priorities || []).map(p => ({ done: false, ...p, id: mkId('pri') })),
      blocks:     (tpl.blocks || []).map(b => ({
        title:           '',
        category:        'personal',
        energy:          '',
        notes:           '',
        done:            false,
        syncToCalendar:  false,
        reminder:        false,
        reminderOffset:  '15m',
        reminderTime:    '09:00',
        calendarEventId: '',
        ...b,
        id:              mkId('blk'),
        recurringId:     undefined,
      })),
    });
  };
  const deleteTemplate = (id) => {
    if (!window.confirm('Delete this template?')) return;
    setTemplates(prev => (prev || []).filter(t => t.id !== id));
  };

  /* ── Day sheet: print + copy ───────────────────────────────
     A clean printable agenda (print stylesheet hides chrome) and
     a plain-text version copied to the clipboard for sharing. */
  const printDay = () => window.print();
  const copyDaySheet = async () => {
    const sorted = [...(plan.blocks || [])].sort((a, b) => toMin(a.start) - toMin(b.start));
    const lines = [
      formatLong(date),
      plan.theme ? `Theme: ${plan.theme}` : '',
      '',
      ...sorted.map(b => `${b.done ? '[x]' : '[ ]'} ${fmtTime(b.start)}–${fmtTime(b.end)}  ${b.title || '(untitled)'} · ${(CAT_BY_ID[b.category] || CAT_BY_ID.other).label}`),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setSyncMsg({ kind: 'ok', text: 'Day sheet copied to clipboard.' });
    } catch {
      setSyncMsg({ kind: 'err', text: 'Could not copy — clipboard blocked.' });
    }
  };

  /* Block-editing state — when set, the corresponding block row
     in the timeline shows its inline edit form. */
  const [editingBlockId, setEditingBlockId] = useState(null);

  return (
    <div className="dp-root">
      <NavRail />

      <PageTourHost pageId="dayPlanner" />

      {/* ── Standard app topbar — logo · DAY PLANNER tag ·
            Today / prev / next / sync · + New Block. Matches the
            Calendar header style. The fixed ☰ NavRail trigger
            sits to the left of the logo (60px of left padding on
            .app-topbar reserves the space). */}
      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag dayplanner">Day Planner</span>
        </div>

        <div className="app-tb-actions">
          <button
            className="app-btn ghost"
            onClick={() => setDate(todayIso())}
            title="Jump to today"
          >Today</button>
          <button
            className="app-btn ghost icon-only"
            onClick={() => setDate(shiftDate(date, -1))}
            title="Previous day"
          >‹</button>
          <button
            className="app-btn ghost icon-only"
            onClick={() => setDate(shiftDate(date, 1))}
            title="Next day"
          >›</button>
          <button
            className="app-btn ghost"
            onClick={syncAllBlocks}
            title="Mark this day as planned on your Calendar"
          >📅 Sync</button>
          <button
            className="app-btn primary"
            data-tour="tour-primary-action"
            onClick={() => {
              /* Default a new block to the current minute, snapped. */
              const now = new Date();
              const minutes = Math.floor(now.getMinutes() / SNAP_MIN) * SNAP_MIN;
              const startStr = `${String(now.getHours()).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
              const endStr   = fromMin(toMin(startStr) + 60);
              addBlock({ title: 'New block', start: startStr, end: endStr, category: 'other' });
            }}
          >✦ New Block</button>

          {/* Profile avatar — opens the shared Profile / Settings
              modal (mirrors the Prayers + Journal topbars). */}
          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      <main className="dp-main">
        <div className="dp-shell">

          <DayHeader
            date={date}
            onDate={setDate}
            theme={plan.theme}
            onTheme={(t) => setPlan({ theme: t })}
            stats={stats}
            syncMsg={syncMsg}
            viewMode={viewMode}
          />

          {/* Week strip — quick day-hopping with an at-a-glance
              density bar per day. */}
          <WeekStrip date={date} plans={plans} now={now} onPick={setDate} />

          <div className="dp-body">

            {/* ── Left column ───────────────────────────── */}
            <aside className="dp-left">
              <GuardrailPanel guardrail={guardrail} />
              <FocusMixPanel energy={energyStats} />
              {showPrayers && (
                <PrayerFocusPanel
                  items={prayerFocus}
                  count={prayerFocusCount}
                  onCount={(n) => setPrefs(prev => ({ ...(prev || {}), prayerFocusCount: n }))}
                  onOpen={() => navigate('/prayers')}
                />
              )}
              {showFriends && (
                <ReachOutPanel
                  items={reachOutList}
                  onOpen={() => navigate('/friends')}
                />
              )}
              <PrioritiesPanel
                items={plan.priorities || []}
                onAdd={addPriority}
                onUpdate={updatePriority}
                onRemove={removePriority}
              />
              <NotesPanel
                value={plan.notes}
                onChange={(v) => setPlan({ notes: v })}
              />
            </aside>

            {/* ── Center column — timeline / split ──────── */}
            <section className="dp-center">
              {viewMode === 'week' ? (
                <WeekRhythmView
                  date={date}
                  plans={plans}
                  now={now}
                  viewMode={viewMode}
                  onView={setViewMode}
                  onPrint={printDay}
                  onCopy={copyDaySheet}
                  onRollOver={rollOverUnfinished}
                  onPickDate={setDate}
                />
              ) : viewMode === 'split' ? (
                <SplitView
                  date={date}
                  plans={plans}
                  viewMode={viewMode}
                  onView={setViewMode}
                  onPrint={printDay}
                  onCopy={copyDaySheet}
                  onRollOver={rollOverUnfinished}
                  onPickDate={setDate}
                />
              ) : (
                <TimelinePanel
                  blocks={plan.blocks || []}
                  calendarEvents={calendarEvents}
                  bibleStudies={bibleStudyOverlays}
                  date={date}
                  now={now}
                  viewMode={viewMode}
                  onView={setViewMode}
                  onPrint={printDay}
                  onCopy={copyDaySheet}
                  onRollOver={rollOverUnfinished}
                  onAdd={addBlock}
                  onAddSpan={addBlockAt}
                  onUpdate={updateBlock}
                  onRemove={removeBlock}
                  onSync={syncBlockToCalendar}
                  onMakeRecurring={makeBlockRecurring}
                  onOpenPrayers={() => navigate('/prayers')}
                  onOpenJournal={() => navigate('/journal')}
                  onOpenFriends={() => navigate('/friends')}
                  onOpenDevotions={() => navigate('/devotionals')}
                  editingId={editingBlockId}
                  setEditingId={setEditingBlockId}
                />
              )}
            </section>

            {/* ── Right column ──────────────────────────── */}
            <aside className="dp-right">
              <RecurringPanel
                rules={recurring || []}
                anchor={date}
                onAdd={addRecurring}
                onDelete={deleteRecurring}
              />
              <CategoriesPanel />
              <TemplatesPanel
                presets={DAY_TYPE_TEMPLATES}
                templates={templates || []}
                onSave={saveAsTemplate}
                onApply={applyTemplate}
                onDelete={deleteTemplate}
              />
            </aside>

          </div>
        </div>
      </main>

      {/* Profile / Settings modal — shared shell. */}
      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<DayPlannerPageSettings />}
      />

      {/* Make-recurring questions — weekdays + cadence. */}
      {recurPrompt && (
        <RecurringModal
          block={recurPrompt.block}
          date={date}
          onCancel={() => setRecurPrompt(null)}
          onConfirm={confirmRecurring}
        />
      )}
    </div>
  );
}

/* ─── Make-recurring modal ───────────────────────────────────
   Asks: which weekdays should this repeat on, and how often
   (every week / every 2 weeks / monthly). Defaults to the block's
   own weekday so a single click confirms a simple weekly repeat. */
function RecurringModal({ block, date, onCancel, onConfirm }) {
  const startDow = (parseIso(date) || new Date()).getDay();
  const [weekdays, setWeekdays] = useState([startDow]);
  const [freq, setFreq] = useState('weekly');
  const toggle = (i) =>
    setWeekdays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort());
  const valid = weekdays.length > 0;
  return (
    <div className="dp-modal-backdrop" onClick={onCancel}>
      <div className="dp-modal dp-recur-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="dp-modal-title">Repeat “{block.title || 'block'}”</h3>

        <div className="dp-recur-field">
          <label className="dp-recur-label">On which days?</label>
          <div className="dp-recur-days">
            {WEEK_DAYS.map((lbl, i) => (
              <button
                key={i}
                type="button"
                className={`dp-recur-day ${weekdays.includes(i) ? 'active' : ''}`}
                onClick={() => toggle(i)}
              >{lbl}</button>
            ))}
          </div>
        </div>

        <div className="dp-recur-field">
          <label className="dp-recur-label">How often?</label>
          <select
            className="dp-select"
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
          >
            <option value="weekly">Every week</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Every month (same week)</option>
          </select>
          {(freq === 'biweekly' || freq === 'monthly') && (
            <p className="dp-recur-hint">
              Counted from {date}. {freq === 'biweekly'
                ? 'Repeats every other week.'
                : 'Repeats on the same week-of-month.'}
            </p>
          )}
        </div>

        <div className="dp-modal-actions">
          <button className="dp-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="dp-btn-primary"
            disabled={!valid}
            onClick={() => onConfirm({ freq, weekdays })}
          >Add to schedule</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Header bar ─────────────────────────────────────────── */
function DayHeader({ date, onDate, theme, onTheme, stats, syncMsg, viewMode }) {
  /* In split / week views the big centered day-theme title is
     hidden — each day shows its own small inline title instead,
     editable only from the single-day (timeline) view. */
  const showTheme = viewMode === 'timeline';
  /* Theme editing model — always starts in VIEW mode (frameless
     bold title or placeholder). Double-click to drop into edit
     mode. Reset to view mode whenever the date changes too, so
     leaving + returning to the page never lands you in the input.
     Enter or losing focus commits the edit. */
  const [editingTheme, setEditingTheme] = useState(false);
  useEffect(() => {
    setEditingTheme(false);
  }, [date]);

  const finishThemeEdit = () => setEditingTheme(false);

  return (
    <header className="dp-header">
      <div className="dp-header-row">
        <div className="dp-title-row">
          <span className="dp-title-icon" aria-hidden="true">📅</span>
          <h1 className="dp-title">Day Planner</h1>
        </div>
        <div className="dp-date-controls">
          <button className="dp-date-btn" onClick={() => onDate(shiftDate(date, -1))} title="Previous day">◀</button>
          <button className="dp-date-btn dp-date-today" onClick={() => onDate(todayIso())} title="Today">Today</button>
          <button className="dp-date-btn" onClick={() => onDate(shiftDate(date, 1))} title="Next day">▶</button>
          <input
            type="date"
            className="dp-date-input"
            value={date}
            onChange={(e) => onDate(e.target.value)}
          />
        </div>
      </div>
      <div className="dp-header-row dp-header-meta">
        <div className="dp-date-pretty">{formatLong(date)}</div>
        <div className="dp-stats">
          <span className="dp-stat"><b>{stats.scheduledHrs}</b>h scheduled</span>
          <span className="dp-stat"><b>{stats.freeHrs}</b>h free</span>
          <span className="dp-stat"><b>{stats.prioritiesDone}/{stats.prioritiesTotal}</b> priorities done</span>
        </div>
      </div>

      {/* Day-theme editor: input while editing, frameless bold
          centered display once committed. Double-click the title
          to edit again. Hidden in split / week views. */}
      {showTheme && (editingTheme ? (
        <input
          type="text"
          className="dp-theme"
          placeholder="Day theme — e.g. Sermon prep focus, Family day, Rest"
          value={theme || ''}
          onChange={(e) => onTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishThemeEdit(); } }}
          onBlur={finishThemeEdit}
          autoFocus
        />
      ) : (
        <div
          className="dp-theme-display"
          onDoubleClick={() => setEditingTheme(true)}
          title="Double-click to edit"
        >
          {theme
            ? <span className="dp-theme-text">{theme}</span>
            : <span className="dp-theme-placeholder">Double-click to add a day theme</span>}
        </div>
      ))}

      {syncMsg && (
        <div className={`dp-sync-msg dp-sync-msg-${syncMsg.kind}`}>{syncMsg.text}</div>
      )}
    </header>
  );
}

/* ─── Priorities ─────────────────────────────────────────── */
function PrioritiesPanel({ items, onAdd, onUpdate, onRemove }) {
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">⭐ Top priorities</h3>
        <button className="dp-mini-btn" onClick={onAdd}>＋ Add</button>
      </div>
      {items.length === 0 ? (
        <p className="dp-card-empty">No priorities yet — pick 1–3 things that matter most today.</p>
      ) : (
        <ul className="dp-priorities">
          {items.map(p => (
            <PriorityRow key={p.id} p={p} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* A single priority row. Shows its text as a label; double-click to
   edit. Brand-new (empty) rows start in edit mode so the first word
   can be typed straight away, then it's read-only until double-clicked. */
function PriorityRow({ p, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(!p.text);
  return (
    <li className={`dp-priority${p.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={!!p.done}
        onChange={(e) => onUpdate(p.id, { done: e.target.checked })}
        className="dp-priority-cb"
      />
      {editing ? (
        <input
          type="text"
          value={p.text || ''}
          onChange={(e) => onUpdate(p.id, { text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.preventDefault(); setEditing(false); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          onBlur={() => setEditing(false)}
          placeholder="What matters today?"
          className="dp-priority-text"
          autoFocus
        />
      ) : (
        <span
          className="dp-priority-display"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {p.text
            ? <span className="dp-priority-words">{p.text}</span>
            : <span className="dp-priority-placeholder">Double-click to edit</span>}
        </span>
      )}
      <button
        type="button"
        className="dp-row-x"
        onClick={() => onRemove(p.id)}
        title="Remove"
      >×</button>
    </li>
  );
}

/* ─── Notes ──────────────────────────────────────────────── */
function NotesPanel({ value, onChange }) {
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">📝 Day notes</h3>
      </div>
      <textarea
        className="dp-textarea"
        rows={5}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Intentions, reminders, anything to keep in mind today…"
      />
    </div>
  );
}

/* ─── Rest guardrail ─────────────────────────────────────── */
function GuardrailPanel({ guardrail }) {
  if (guardrail.ok) {
    return (
      <div className="dp-card dp-guardrail dp-guardrail-ok">
        <div className="dp-guardrail-row">
          <span className="dp-guardrail-icon">🕊️</span>
          <span className="dp-guardrail-text">Balanced day — rest is on the calendar.</span>
        </div>
      </div>
    );
  }
  if (guardrail.warnings.length === 0) return null;
  return (
    <div className="dp-card dp-guardrail dp-guardrail-warn">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🛟 Guardrail</h3>
      </div>
      <ul className="dp-guardrail-list">
        {guardrail.warnings.map((w, i) => (
          <li key={i} className="dp-guardrail-warning">{w}</li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Focus / energy mix ─────────────────────────────────────
   A stacked bar + legend showing how the day's scheduled hours
   split across deep-focus / admin / light work. Helps the user
   see whether a day is front-loaded with hard cognitive work. */
function FocusMixPanel({ energy }) {
  const total = energy.deep + energy.admin + energy.light + energy.untagged;
  const hrs = (m) => {
    const h = m / 60;
    return h >= 1 ? `${(Math.round(h * 10) / 10)}h` : `${m}m`;
  };
  const pct = (m) => (total > 0 ? (m / total) * 100 : 0);
  const segments = [
    { ...ENERGY_BY_ID.deep,  mins: energy.deep },
    { ...ENERGY_BY_ID.admin, mins: energy.admin },
    { ...ENERGY_BY_ID.light, mins: energy.light },
  ];
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🧠 Focus mix</h3>
        {energy.deep > 0 && (
          <span className="dp-focus-deep-tag">{hrs(energy.deep)} deep</span>
        )}
      </div>
      {total === 0 ? (
        <p className="dp-card-empty">Tag blocks with a focus level (Deep / Admin / Light) to see your day's energy balance.</p>
      ) : (
        <>
          <div className="dp-energy-bar" role="img" aria-label="Focus mix">
            {segments.map(s => s.mins > 0 && (
              <span
                key={s.id}
                className="dp-energy-seg"
                style={{ width: `${pct(s.mins)}%`, background: s.color }}
                title={`${s.label}: ${hrs(s.mins)}`}
              />
            ))}
            {energy.untagged > 0 && (
              <span
                className="dp-energy-seg dp-energy-untagged"
                style={{ width: `${pct(energy.untagged)}%` }}
                title={`Untagged: ${hrs(energy.untagged)}`}
              />
            )}
          </div>
          <ul className="dp-energy-legend">
            {segments.map(s => (
              <li key={s.id} className="dp-energy-leg">
                <span className="dp-energy-swatch" style={{ background: s.color }} />
                <span className="dp-energy-leg-label">{s.emoji} {s.short}</span>
                <span className="dp-energy-leg-val">{hrs(s.mins)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ─── Prayer focus of the day ────────────────────────────── */
function PrayerFocusPanel({ items, count, onCount, onOpen }) {
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🙏 Prayer focus</h3>
        <div className="dp-count-stepper" title="How many daily prayers to surface">
          <button className="dp-step-btn" onClick={() => onCount(Math.max(1, count - 1))} aria-label="Show fewer">–</button>
          <span className="dp-step-val">{count}</span>
          <button className="dp-step-btn" onClick={() => onCount(Math.min(10, count + 1))} aria-label="Show more">+</button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="dp-card-empty">No daily prayers yet — flag prayers as 📆 Daily to focus on them here.</p>
      ) : (
        <ul className="dp-focus-list">
          {items.map(p => (
            <li key={p.id} className="dp-focus-item">
              <span className="dp-focus-dot">{p.is_urgent ? '🔴' : '🙏'}</span>
              <span className="dp-focus-text">
                <span className="dp-focus-title">{p.title || p.content || 'Prayer'}</span>
                {p.category && <span className="dp-focus-cat">{p.category}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button className="dp-card-cta" onClick={onOpen}>🙏 Open Prayers →</button>
    </div>
  );
}

/* ─── Who to reach out to ────────────────────────────────── */
function ReachOutPanel({ items, onOpen }) {
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">👥 Reach out today</h3>
      </div>
      {items.length === 0 ? (
        <p className="dp-card-empty">No one's due for a check-in. Set a cadence on the Friends page to see reminders here.</p>
      ) : (
        <ul className="dp-reach-list">
          {items.map(({ friend, status }) => {
            const initials = friend.initials || (friend.name || '?').slice(0, 2).toUpperCase();
            const label = status.state === 'overdue'
              ? `${status.overdue}d overdue`
              : 'Due today';
            return (
              <li key={friend.id} className="dp-reach-item">
                <span
                  className="dp-reach-avatar"
                  style={{ background: `linear-gradient(135deg, ${friend.color_from || '#3730a3'}, ${friend.color_to || '#6c3fc9'})` }}
                >{initials}</span>
                <span className="dp-reach-text">
                  <span className="dp-reach-name">{friend.name || 'Friend'}</span>
                  <span className={`dp-reach-due dp-reach-${status.state}`}>{label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <button className="dp-card-cta" onClick={onOpen}>👥 Open Friends →</button>
    </div>
  );
}

/* ─── Week strip ─────────────────────────────────────────── */
function WeekStrip({ date, plans, now, onPick }) {
  const week = useMemo(() => weekDatesFor(date), [date]);
  const todayStr = iso(now);
  /* Density = total scheduled minutes for the day, normalized
     against the busiest day in the visible week. */
  const minutesFor = (ds) => {
    const blocks = (plans && plans[ds]?.blocks) || [];
    return blocks.reduce((sum, b) => sum + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
  };
  const maxMin = Math.max(60, ...week.map(minutesFor));
  return (
    <div className="dp-weekstrip">
      {week.map(ds => {
        const d = parseIso(ds);
        const mins = minutesFor(ds);
        const count = ((plans && plans[ds]?.blocks) || []).length;
        const pct = Math.round((mins / maxMin) * 100);
        return (
          <button
            key={ds}
            className={`dp-week-day${ds === date ? ' on' : ''}${ds === todayStr ? ' today' : ''}`}
            onClick={() => onPick(ds)}
            title={`${count} block${count === 1 ? '' : 's'} · ${(mins / 60).toFixed(1)}h`}
          >
            <span className="dp-week-dow">{WEEK_DAYS[d.getDay()]}</span>
            <span className="dp-week-num">{d.getDate()}</span>
            <span className="dp-week-density"><span className="dp-week-fill" style={{ height: `${pct}%` }} /></span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Today vs. next-day split (evening planning) ────────── */
function SplitView({ date, plans, viewMode, onView, onPrint, onCopy, onRollOver, onPickDate }) {
  const next = shiftDate(date, 1);
  const col = (ds) => {
    const blocks = [...(((plans && plans[ds]?.blocks) || []))].sort((a, b) => toMin(a.start) - toMin(b.start));
    const dayTheme = (plans && plans[ds]?.theme) || '';
    return (
      <div className="dp-split-col">
        <button className="dp-split-head" onClick={() => onPickDate(ds)} title="Open this day">
          {formatLong(ds)}
        </button>
        {dayTheme && (
          <div className="dp-day-theme-mini" title="Edit this title from the Day view">{dayTheme}</div>
        )}
        {blocks.length === 0 ? (
          <p className="dp-card-empty">No blocks.</p>
        ) : (
          <ul className="dp-split-list">
            {blocks.map(b => {
              const cat = CAT_BY_ID[b.category] || CAT_BY_ID.other;
              return (
                <li key={b.id} className={`dp-split-item${b.done ? ' done' : ''}`}>
                  <span className="dp-split-dot" style={{ background: cat.color }} />
                  <span className="dp-split-time">{fmtTime(b.start)}</span>
                  <span className="dp-split-title">{b.title || '(untitled)'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };
  return (
    <div className="dp-tl-wrap">
      <TimelineToolbar
        viewMode={viewMode}
        onView={onView}
        onPrint={onPrint}
        onCopy={onCopy}
        onRollOver={onRollOver}
        hint="Tonight vs. tomorrow — tap a day's header to open it for editing."
      />
      <div className="dp-split">
        {col(date)}
        {col(next)}
      </div>
    </div>
  );
}

/* ─── Weekly rhythm view ─────────────────────────────────────
   Zoom out from a single day to the whole week (Sun→Sat). Each
   day is a mini vertical timeline of colored category bars, with
   balance flags underneath (packed / no rest / restful) so the
   shape of the week — and any imbalance — is visible at a glance. */
const WEEK_HOUR_PX = 15;   // px per hour in the mini tracks

function WeekRhythmView({ date, plans, now, viewMode, onView, onPrint, onCopy, onRollOver, onPickDate }) {
  const week     = useMemo(() => weekDatesFor(date), [date]);
  const todayStr = iso(now);
  const winStart = HOUR_START * 60;
  const winEnd   = (HOUR_END + 1) * 60;
  const trackH   = ((winEnd - winStart) / 60) * WEEK_HOUR_PX;

  const dayData = week.map(ds => {
    const blocks = ((plans && plans[ds]?.blocks) || []);
    const mins   = blocks.reduce((s, b) => s + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
    const restMin = blocks
      .filter(b => b.category === 'rest' || b.category === 'family')
      .reduce((s, b) => s + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
    return {
      ds, blocks, mins, restMin,
      packed:  mins >= 840,                       // ≥14h scheduled
      noRest:  mins > 0 && restMin === 0,
      restful: restMin >= 120,                    // ≥2h rest/family
    };
  });

  const weekMin    = dayData.reduce((s, d) => s + d.mins, 0);
  const restDays   = dayData.filter(d => d.restMin > 0).length;
  const packedDays = dayData.filter(d => d.packed).length;
  const hrs = (m) => `${Math.round((m / 60) * 10) / 10}h`;

  return (
    <div className="dp-tl-wrap">
      <TimelineToolbar
        viewMode={viewMode}
        onView={onView}
        onPrint={onPrint}
        onCopy={onCopy}
        onRollOver={onRollOver}
        hint="Your whole week at a glance — tap a day to open it. Watch for packed days and days with no rest."
      />

      <div className="dp-week-summary">
        <span className="dp-week-sum-stat"><b>{hrs(weekMin)}</b> scheduled</span>
        <span className="dp-week-sum-stat"><b>{restDays}</b>/7 days with rest</span>
        <span className={`dp-week-sum-stat${packedDays ? ' warn' : ''}`}><b>{packedDays}</b> packed {packedDays === 1 ? 'day' : 'days'}</span>
      </div>

      <div className="dp-rhythm">
        {dayData.map(d => {
          const dt = parseIso(d.ds);
          return (
            <div
              key={d.ds}
              className={`dp-rhythm-col${d.ds === date ? ' on' : ''}${d.ds === todayStr ? ' today' : ''}`}
            >
              <button
                type="button"
                className="dp-rhythm-head"
                onClick={() => onPickDate(d.ds)}
                title={`Open ${formatLong(d.ds)}`}
              >
                <span className="dp-rhythm-dow">{WEEK_DAYS[dt.getDay()]}</span>
                <span className="dp-rhythm-num">{dt.getDate()}</span>
              </button>

              <div className="dp-rhythm-track" style={{ height: trackH }}>
                {d.blocks.map(b => {
                  const cat = CAT_BY_ID[b.category] || CAT_BY_ID.other;
                  const s = Math.max(winStart, toMin(b.start));
                  const e = Math.min(winEnd, toMin(b.end));
                  if (e <= s) return null;
                  return (
                    <span
                      key={b.id}
                      className={`dp-rhythm-bar${b.done ? ' done' : ''}`}
                      style={{
                        top:    ((s - winStart) / 60) * WEEK_HOUR_PX,
                        height: Math.max(3, ((e - s) / 60) * WEEK_HOUR_PX),
                        background: cat.color,
                      }}
                      title={`${fmtTime(b.start)}–${fmtTime(b.end)} · ${b.title || cat.label}`}
                    />
                  );
                })}
              </div>

              <div className="dp-rhythm-foot">
                <span className="dp-rhythm-hrs">{d.mins > 0 ? hrs(d.mins) : '—'}</span>
                <span className="dp-rhythm-flags">
                  {d.packed  && <span className="dp-rhythm-flag warn"  title="Packed day — guard some margin">⚠</span>}
                  {d.noRest  && <span className="dp-rhythm-flag rest"  title="No rest blocked out">🛟</span>}
                  {d.restful && <span className="dp-rhythm-flag calm"  title="Rest is on the calendar">🕊️</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Recurring blocks ───────────────────────────────────── */
function RecurringPanel({ rules, anchor, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', start: '06:00', end: '07:00', category: 'prayer', freq: 'daily', weekdays: [1] });
  const needsDays = ['weekly', 'biweekly', 'monthly'].includes(form.freq);
  const submit = () => {
    if (!form.title.trim()) return;
    if (needsDays && form.weekdays.length === 0) return;
    onAdd({ ...form, weekdays: needsDays ? form.weekdays : [], anchor });
    setForm({ title: '', start: '06:00', end: '07:00', category: 'prayer', freq: 'daily', weekdays: [1] });
    setOpen(false);
  };
  const toggleDay = (i) => setForm(f => ({
    ...f,
    weekdays: f.weekdays.includes(i) ? f.weekdays.filter(x => x !== i) : [...f.weekdays, i],
  }));
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🔁 Recurring blocks</h3>
        <button className="dp-mini-btn" onClick={() => setOpen(o => !o)}>{open ? 'Close' : '＋ Add'}</button>
      </div>
      {open && (
        <div className="dp-rec-form">
          <input
            type="text"
            className="dp-rec-title"
            placeholder="e.g. Morning prayer"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <div className="dp-rec-row">
            <label className="dp-edit-field"><span>Start</span>
              <input type="time" step={SNAP_MIN * 60} value={form.start} onChange={(e) => setForm(f => ({ ...f, start: e.target.value }))} />
            </label>
            <label className="dp-edit-field"><span>End</span>
              <input type="time" step={SNAP_MIN * 60} value={form.end} onChange={(e) => setForm(f => ({ ...f, end: e.target.value }))} />
            </label>
          </div>
          <div className="dp-rec-row">
            <label className="dp-edit-field"><span>Category</span>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="dp-edit-field"><span>Repeat</span>
              <select value={form.freq} onChange={(e) => setForm(f => ({ ...f, freq: e.target.value }))}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly on…</option>
                <option value="biweekly">Every 2 weeks on…</option>
                <option value="monthly">Monthly on…</option>
              </select>
            </label>
          </div>
          {needsDays && (
            <div className="dp-rec-days">
              {WEEK_DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  className={`dp-rec-day${form.weekdays.includes(i) ? ' on' : ''}`}
                  onClick={() => toggleDay(i)}
                >{d}</button>
              ))}
            </div>
          )}
          <button className="dp-edit-done" onClick={submit}>Add recurring block</button>
        </div>
      )}
      {rules.length === 0 ? (
        <p className="dp-card-empty">Set up blocks that repeat — they drop onto every matching day automatically.</p>
      ) : (
        <ul className="dp-rec-list">
          {rules.map(r => {
            const cat = CAT_BY_ID[r.category] || CAT_BY_ID.other;
            const dayList = (r.weekdays || []).map(i => WEEK_DAYS[i]).join(', ');
            let freqText;
            if (r.freq === 'weekly')        freqText = dayList || 'Weekly';
            else if (r.freq === 'biweekly') freqText = `${dayList || 'Weekly'} · every 2 wks`;
            else if (r.freq === 'monthly')  freqText = `${dayList || 'Monthly'} · monthly`;
            else                            freqText = FREQ_LABEL[r.freq] || r.freq;
            return (
              <li key={r.id} className="dp-rec-item">
                <span className="dp-cat-dot" style={{ background: cat.color }} />
                <span className="dp-rec-info">
                  <span className="dp-rec-name">{r.title || '(untitled)'}</span>
                  <span className="dp-rec-meta">{fmtTime(r.start)} · {freqText}</span>
                </span>
                <button className="dp-row-x" onClick={() => onDelete(r.id)} title="Delete recurring block">×</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─── Shared timeline toolbar (view toggle + day-sheet actions) ─ */
function TimelineToolbar({ viewMode, onView, onPrint, onCopy, onRollOver, hint }) {
  return (
    <div className="dp-tl-head">
      <div className="dp-tl-head-left">
        <h3 className="dp-card-title">🕐 Timeline</h3>
        <div className="dp-view-toggle" role="tablist" aria-label="Planner view">
          <button
            role="tab" aria-selected={viewMode === 'timeline'}
            className={`dp-view-tab${viewMode === 'timeline' ? ' on' : ''}`}
            onClick={() => onView('timeline')}
          >Day</button>
          <button
            role="tab" aria-selected={viewMode === 'split'}
            className={`dp-view-tab${viewMode === 'split' ? ' on' : ''}`}
            onClick={() => onView('split')}
          >Split</button>
          <button
            role="tab" aria-selected={viewMode === 'week'}
            className={`dp-view-tab${viewMode === 'week' ? ' on' : ''}`}
            onClick={() => onView('week')}
          >Week</button>
        </div>
      </div>
      <div className="dp-tl-head-actions">
        <button className="dp-mini-btn" onClick={onRollOver} title="Carry unfinished blocks to tomorrow">↪ Roll over</button>
        <button className="dp-mini-btn" onClick={onCopy} title="Copy a text day sheet">📋 Copy</button>
        <button className="dp-mini-btn" onClick={onPrint} title="Print a clean day sheet">🖨 Print</button>
      </div>
      {hint && <span className="dp-tl-hint">{hint}</span>}
    </div>
  );
}

/* ─── Categories ─────────────────────────────────────────── */
function CategoriesPanel() {
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🏷 Categories</h3>
      </div>
      <p className="dp-card-empty">
        Each block gets a category color. Tap a block in the timeline to change its category.
      </p>
      <ul className="dp-cats">
        {CATEGORIES.map(c => (
          <li key={c.id} className="dp-cat">
            <span className="dp-cat-dot" style={{ background: c.color }} />
            <span className="dp-cat-label">{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Templates ──────────────────────────────────────────── */
function TemplatesPanel({ presets = [], templates, onSave, onApply, onDelete }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const commit = () => {
    onSave(name);
    setName('');
    setNaming(false);
  };
  const cancel = () => {
    setName('');
    setNaming(false);
  };
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <h3 className="dp-card-title">🧩 Templates</h3>
        <button className="dp-mini-btn" onClick={() => setNaming(v => !v)}>💾 Save today</button>
      </div>

      {/* Inline name field — window.prompt is unavailable in Electron,
          so name the template right here. */}
      {naming && (
        <div className="dp-tpl-namer">
          <input
            type="text"
            className="dp-tpl-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            placeholder="Template name…"
            autoFocus
          />
          <button type="button" className="dp-mini-btn" onClick={commit}>Save</button>
          <button type="button" className="dp-row-x" onClick={cancel} title="Cancel">×</button>
        </div>
      )}

      {/* Built-in day-type presets — drop a full schedule with one
          click. These can't be deleted; they're always available. */}
      {presets.length > 0 && (
        <>
          <div className="dp-tpl-subhead">Day types</div>
          <ul className="dp-templates">
            {presets.map(t => (
              <li key={t.id} className="dp-template">
                <button
                  type="button"
                  className="dp-template-name dp-template-preset"
                  onClick={() => onApply(t)}
                  title={`Lay down a ${t.name} schedule on the selected day`}
                >{t.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The user's own saved templates. */}
      <div className="dp-tpl-subhead">My templates</div>
      {templates.length === 0 ? (
        <p className="dp-card-empty">
          Save the current day as a template, then apply it to future days with one click.
        </p>
      ) : (
        <ul className="dp-templates">
          {templates.map(t => (
            <li key={t.id} className="dp-template">
              <button
                type="button"
                className="dp-template-name"
                onClick={() => onApply(t)}
                title="Apply this template to the selected day"
              >{t.name}</button>
              <button
                type="button"
                className="dp-row-x"
                onClick={() => onDelete(t.id)}
                title="Delete template"
              >×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Timeline ───────────────────────────────────────────── */
function TimelinePanel({
  blocks, calendarEvents, bibleStudies, date, now,
  viewMode, onView, onPrint, onCopy, onRollOver,
  onAdd, onAddSpan, onUpdate, onRemove, onSync, onMakeRecurring,
  onOpenPrayers, onOpenJournal, onOpenFriends, onOpenDevotions,
  editingId, setEditingId,
}) {
  /* Lane assignments for overlapping blocks. Recomputed whenever
     the blocks change. */
  const lanedBlocks = useMemo(() => computeLanes(blocks), [blocks]);
  const hours = useMemo(() => {
    const out = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) out.push(h);
    return out;
  }, []);

  /* DOUBLE-click an empty hour cell to create a 1-hour block. A
     single click does nothing (so a stray tap doesn't litter the
     timeline with empty blocks). */
  const handleHourDblClick = (h, e) => {
    if (e.target.closest('.dp-block, .dp-cal-ghost, .dp-bs-ghost')) return;
    const startMin = Math.floor((h * 60) / SNAP_MIN) * SNAP_MIN;
    onAdd(fromMin(startMin));
  };

  const top = (hhmm) => ((toMin(hhmm) - HOUR_START * 60) / 60) * HOUR_HEIGHT;
  const height = (start, end) => Math.max(24, ((toMin(end) - toMin(start)) / 60) * HOUR_HEIGHT);

  /* ── Drag-to-move + resize ──────────────────────────────
     - mousedown anywhere on the block body  → start MOVE drag
     - mousedown on the bottom 6px handle   → start RESIZE drag
     - moves under 4px treated as a click → opens the editor
     - mouseup commits whatever was dragged */
  const dragRef = useRef(null);

  const onMouseMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    const pxPerMin = HOUR_HEIGHT / 60;
    const deltaMin = Math.round((dy / pxPerMin) / SNAP_MIN) * SNAP_MIN;
    const dayMin   = (HOUR_END + 1) * 60;
    let patch;
    if (d.mode === 'move') {
      const dur = d.origEnd - d.origStart;
      let newStart = Math.max(HOUR_START * 60, Math.min(dayMin - dur, d.origStart + deltaMin));
      patch = { start: fromMin(newStart), end: fromMin(newStart + dur) };
    } else {
      const minEnd = d.origStart + SNAP_MIN;
      const newEnd = Math.max(minEnd, Math.min(dayMin, d.origEnd + deltaMin));
      patch = { end: fromMin(newEnd) };
    }
    if (patch) {
      d.lastPatch = patch;
      onUpdate(d.blockId, patch);
    }
  };
  const onMouseUp = () => {
    /* Single clicks no longer open the editor — double-click does.
       So mouseup just cleans up the drag state. */
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    dragRef.current = null;
  };
  const beginDrag = (e, block, mode) => {
    /* While the block is being edited, leave its mouse handling
       alone so the user can interact with the inputs. */
    if (editingId === block.id) return;
    /* Don't preventDefault here — that would suppress dblclick.
       Text selection during drag is suppressed via CSS user-select. */
    e.stopPropagation();
    dragRef.current = {
      blockId:   block.id,
      mode,                          // 'move' | 'resize'
      startY:    e.clientY,
      origStart: toMin(block.start),
      origEnd:   toMin(block.end),
      moved:     false,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  };

  /* ── Now marker — only when viewing today ─────────────── */
  const showNow = date === iso(now);
  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const nowTop  = (showNow && nowMin >= HOUR_START * 60 && nowMin <= (HOUR_END + 1) * 60)
    ? ((nowMin - HOUR_START * 60) / 60) * HOUR_HEIGHT
    : null;
  const nowLabel = `${fmtTime(fromMin(nowMin))}`;

  /* ── Free-time suggestions ──────────────────────────────
     Find the open slots between blocks (within the planning
     window) and surface a one-click filler in each. When the
     viewed day is today, ignore time that's already past so we
     only suggest using the hours still ahead. */
  const GAP_MIN = 30;                 // ignore slivers under 30 min
  const freeGaps = useMemo(() => {
    const winStart = HOUR_START * 60;
    const winEnd   = (HOUR_END + 1) * 60;
    const lower = showNow
      ? Math.min(winEnd, Math.max(winStart, Math.ceil(nowMin / SNAP_MIN) * SNAP_MIN))
      : winStart;
    /* Merge busy intervals from real blocks (skip done ones —
       a finished block's slot is effectively free again). */
    const busy = blocks
      .filter(b => !b.done)
      .map(b => ({ s: Math.max(winStart, toMin(b.start)), e: Math.min(winEnd, toMin(b.end)) }))
      .filter(iv => iv.e > iv.s)
      .sort((a, b) => a.s - b.s);
    /* Only suggest gaps once the day has at least one commitment —
       a wholly empty day shouldn't show one giant 18-hour "gap". */
    if (busy.length === 0) return [];
    const merged = [];
    for (const iv of busy) {
      const last = merged[merged.length - 1];
      if (last && iv.s <= last.e) last.e = Math.max(last.e, iv.e);
      else merged.push({ ...iv });
    }
    const gaps = [];
    let cursor = lower;
    for (const iv of merged) {
      if (iv.s > cursor) gaps.push({ s: cursor, e: iv.s });
      cursor = Math.max(cursor, iv.e);
    }
    if (cursor < winEnd) gaps.push({ s: cursor, e: winEnd });
    return gaps
      .filter(g => g.e - g.s >= GAP_MIN)
      .map(g => ({ startMin: g.s, endMin: g.e, mins: g.e - g.s }));
  }, [blocks, showNow, nowMin]);

  const gapLabel = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} min free`;
    if (m === 0) return `${h}h free`;
    return `${h}h ${m}m free`;
  };

  return (
    <div className="dp-tl-wrap">
      <TimelineToolbar
        viewMode={viewMode}
        onView={onView}
        onPrint={onPrint}
        onCopy={onCopy}
        onRollOver={onRollOver}
        hint="Double-click an empty hour to add · double-click a block to edit · drag to move · drag bottom edge to resize"
      />
      <div className="dp-tl">
        <div className="dp-tl-hours">
          {hours.map(h => (
            <div
              key={h}
              className="dp-tl-hour"
              style={{ height: HOUR_HEIGHT }}
              onDoubleClick={(e) => handleHourDblClick(h, e)}
            >
              <span className="dp-tl-hour-lbl">{fmtTime(`${String(h).padStart(2, '0')}:00`)}</span>
              <span className="dp-tl-hour-line" />
            </div>
          ))}
        </div>

        {/* Now marker — horizontal line + chip showing the current
            time. Only renders when viewing today. */}
        {nowTop !== null && (
          <div className="dp-now-marker" style={{ top: nowTop }}>
            <span className="dp-now-chip">Now · {nowLabel}</span>
            <span className="dp-now-line" />
          </div>
        )}

        {/* Free-time suggestions — a soft nudge in each open slot
            with one-click fillers. Tall gaps also offer a couple
            of contextual quick-adds (prayer / rest / focus). */}
        {freeGaps.map(g => {
          const gTop    = ((g.startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
          const gHeight = (g.mins / 60) * HOUR_HEIGHT;
          const roomy   = gHeight >= 56;
          /* Fill from the gap start, but cap the created block so a
             long open stretch doesn't mint a multi-hour block. The
             user can always drag it longer. */
          const span = (cap, extra) => onAddSpan && onAddSpan({
            start: fromMin(g.startMin),
            end:   fromMin(Math.min(g.endMin, g.startMin + cap)),
            ...extra,
          });
          return (
            <div
              key={`gap-${g.startMin}`}
              className={`dp-gap${roomy ? ' roomy' : ''}`}
              style={{ top: gTop, height: gHeight }}
            >
              <div className="dp-gap-inner">
                <button
                  type="button"
                  className="dp-gap-fill"
                  onClick={() => span(Math.min(g.mins, 120), { category: 'personal', title: '' })}
                  title="Add a block in this open time"
                >＋ {gapLabel(g.mins)}</button>
                {roomy && (
                  <div className="dp-gap-chips">
                    <button type="button" className="dp-gap-chip" title="Add a prayer block"
                      onClick={() => span(Math.min(g.mins, 30), { category: 'prayer', energy: 'deep', title: 'Prayer' })}>🙏 Pray</button>
                    <button type="button" className="dp-gap-chip" title="Add a focus-work block"
                      onClick={() => span(Math.min(g.mins, 90), { category: 'work', energy: 'deep', title: 'Focus work' })}>🧠 Focus</button>
                    <button type="button" className="dp-gap-chip" title="Add a rest block"
                      onClick={() => span(Math.min(g.mins, 60), { category: 'rest', energy: 'light', title: 'Rest' })}>🌿 Rest</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Bible Study ghost overlays (read directly from the
            Bible Studies data — show even if not synced to
            Calendar). */}
        {bibleStudies.map(bs => {
          const start = bs.time;
          const end   = fromMin(Math.min((HOUR_END + 1) * 60, toMin(start) + 60));
          return (
            <div
              key={bs.id}
              className="dp-bs-ghost"
              style={{ top: top(start), height: height(start, end) }}
              title={`Bible Study: ${bs.title}${bs.leader ? ' · ' + bs.leader : ''}${bs.location ? ' · ' + bs.location : ''}`}
            >
              <span className="dp-bs-ghost-time">📖 {fmtTime(start)}</span>
              <span className="dp-bs-ghost-title">{bs.title}</span>
              {bs.location && <span className="dp-bs-ghost-meta">{bs.location}</span>}
            </div>
          );
        })}

        {/* Ghost overlay for global Calendar events on this day. */}
        {calendarEvents.map(ev => {
          if (!ev.event_time) return null;
          const start = ev.event_time;
          const end   = fromMin(Math.min((HOUR_END + 1) * 60, toMin(start) + 60));
          return (
            <div
              key={`ce-${ev.id}`}
              className="dp-cal-ghost"
              style={{
                top:    top(start),
                height: height(start, end),
                borderColor: ev.color || '#a78bfa',
                background: `${ev.color || '#a78bfa'}22`,
              }}
              title={`Calendar: ${ev.title}`}
            >
              <span className="dp-cal-ghost-time">📅 {fmtTime(start)}</span>
              <span className="dp-cal-ghost-title">{ev.title}</span>
            </div>
          );
        })}

        {/* User blocks — laid out side-by-side when their times
            overlap. Editing forces full-width + auto height so
            the whole form is visible without scrolling. */}
        {lanedBlocks.map(b => {
          const cat = CAT_BY_ID[b.category] || CAT_BY_ID.personal;
          const isEditing = editingId === b.id;
          /* Track which corner chips this block renders so we can
             reserve matching right-padding on the text area (so
             time/title/category never sit BEHIND the chip buttons).
             Mapping (category → chips):
               prayer   → 🙏 Prayers + 📖 Journal
               outreach → 🧑‍🤝‍🧑 Friends
               study    → 🕯 Devotions  (study = Bible Study category) */
          const hasPrayerChips   = !isEditing && b.category === 'prayer';
          const hasFriendsChip   = !isEditing && b.category === 'outreach';
          const hasDevotionsChip = !isEditing && b.category === 'study';
          const chipClass =
              hasPrayerChips   ? ' has-prayer-chips'
            : hasFriendsChip   ? ' has-friends-chip'
            : hasDevotionsChip ? ' has-devotions-chip'
            : '';
          const blockStyle = isEditing
            ? {
                /* Editing mode: pop out of the lane, span full
                   width, and let the height stretch to fit the
                   form. */
                top:              top(b.start),
                height:           'auto',
                minHeight:        height(b.start, b.end),
                left:             70,
                right:            14,
                width:            'auto',
                borderLeftColor:  cat.color,
                background:       `${cat.color}26`,
              }
            : {
                top:              top(b.start),
                height:           height(b.start, b.end),
                /* Lane width math: split the available horizontal
                   space (between the 70px label gutter and the
                   right margin) into `totalLanes` columns. */
                '--lane':         b.lane,
                '--total-lanes':  b.totalLanes,
                borderLeftColor:  cat.color,
                background:       `${cat.color}26`,
              };
          return (
            <div
              key={b.id}
              className={`dp-block${isEditing ? ' editing' : ''}${b.done ? ' done' : ''}${b.totalLanes > 1 && !isEditing ? ' laned' : ''}${chipClass}`}
              style={blockStyle}
              onMouseDown={(e) => beginDrag(e, b, 'move')}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingId(isEditing ? null : b.id);
              }}
            >
              {!isEditing ? (
                <>
                  {/* Top-right corner controls. Category-specific
                      chip buttons sit to the LEFT of the always-
                      visible × delete button:
                        Prayer   → 🙏 Prayers + 📖 Journal
                        Outreach → 🧑‍🤝‍🧑 Friends
                        Study    → 🕯 Devotions   (Bible Study cat)
                      The flex container handles layout so the chip
                      widths can vary without manual offset math. */}
                  {(hasPrayerChips || hasFriendsChip || hasDevotionsChip) && (
                    <div className="dp-block-corner-extras">
                      {b.category === 'prayer' && (
                        <>
                          <button
                            type="button"
                            className="dp-block-chip dp-chip-prayers"
                            onClick={(e) => { e.stopPropagation(); onOpenPrayers && onOpenPrayers(b); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            title="Open Prayers"
                          ><span className="dp-chip-emoji">🙏</span><span className="dp-chip-label">Prayers</span></button>
                          <button
                            type="button"
                            className="dp-block-chip dp-chip-journal"
                            onClick={(e) => { e.stopPropagation(); onOpenJournal && onOpenJournal(b); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            title="Open Journal"
                          ><span className="dp-chip-emoji">📖</span><span className="dp-chip-label">Journal</span></button>
                        </>
                      )}
                      {b.category === 'outreach' && (
                        <button
                          type="button"
                          className="dp-block-chip dp-chip-friends"
                          onClick={(e) => { e.stopPropagation(); onOpenFriends && onOpenFriends(b); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          title="Open Friends"
                        ><span className="dp-chip-emoji">👥</span><span className="dp-chip-label">Friends</span></button>
                      )}
                      {b.category === 'study' && (
                        <button
                          type="button"
                          className="dp-block-chip dp-chip-devotions"
                          onClick={(e) => { e.stopPropagation(); onOpenDevotions && onOpenDevotions(b); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          title="Open Devotionals"
                        ><span className="dp-chip-emoji">🕯</span><span className="dp-chip-label">Devotions</span></button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="dp-block-del"
                    onClick={(e) => { e.stopPropagation(); onRemove(b.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Delete this block"
                  >×</button>
                  <div className="dp-block-view">
                    <label
                      className="dp-block-done"
                      title={b.done ? 'Mark not done' : 'Mark done'}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={!!b.done}
                        onChange={(e) => onUpdate(b.id, { done: e.target.checked })}
                      />
                    </label>
                    <span className="dp-block-time">{fmtTime(b.start)} – {fmtTime(b.end)}</span>
                    <span className="dp-block-title">{b.title || '(untitled block)'}</span>
                    <span className="dp-block-cat" style={{ color: cat.color }}>● {cat.label}</span>
                    {ENERGY_BY_ID[b.energy] && (
                      <span
                        className="dp-block-energy"
                        style={{ color: ENERGY_BY_ID[b.energy].color }}
                        title={`${ENERGY_BY_ID[b.energy].label} focus`}
                      >{ENERGY_BY_ID[b.energy].emoji} {ENERGY_BY_ID[b.energy].short}</span>
                    )}
                  </div>
                  {/* Bottom resize handle — separate hit area so
                      the resize drag doesn't conflict with the
                      block-body move drag. */}
                  <div
                    className="dp-block-resize"
                    title="Drag to resize"
                    onMouseDown={(e) => beginDrag(e, b, 'resize')}
                  />
                </>
              ) : (
                <BlockEditor
                  block={b}
                  onUpdate={(patch) => onUpdate(b.id, patch)}
                  onRemove={() => onRemove(b.id)}
                  onMakeRecurring={() => onMakeRecurring && onMakeRecurring(b)}
                  onDone={async () => {
                    /* Sync to Calendar (create / update / delete)
                       based on current flags, then close. */
                    const latest = blocks.find(x => x.id === b.id);
                    if (latest && onSync) await onSync(latest);
                    setEditingId(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Inline editor that swaps into a block when you double-click it.
   When this editor is visible the parent block uses `height: auto`
   so the whole form fits without internal scrolling. */
function BlockEditor({ block, onUpdate, onRemove, onDone, onMakeRecurring }) {
  return (
    <div className="dp-block-edit" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <input
        type="text"
        className="dp-edit-title"
        placeholder="What's happening?"
        value={block.title || ''}
        onChange={(e) => onUpdate({ title: e.target.value })}
        autoFocus
      />
      <div className="dp-edit-row">
        <label className="dp-edit-field">
          <span>Start</span>
          <input
            type="time"
            className="dp-edit-time"
            value={block.start}
            step={SNAP_MIN * 60}
            onChange={(e) => onUpdate({ start: e.target.value })}
          />
        </label>
        <label className="dp-edit-field">
          <span>End</span>
          <input
            type="time"
            className="dp-edit-time"
            value={block.end}
            step={SNAP_MIN * 60}
            onChange={(e) => onUpdate({ end: e.target.value })}
          />
        </label>
        <label className="dp-edit-field">
          <span>Category</span>
          <select
            className="dp-edit-cat"
            value={block.category || 'personal'}
            onChange={(e) => onUpdate({ category: e.target.value })}
          >
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="dp-edit-field">
          <span>Focus</span>
          <select
            className="dp-edit-cat"
            value={block.energy || ''}
            onChange={(e) => onUpdate({ energy: e.target.value })}
            title="How much focus / energy does this block need?"
          >
            <option value="">— None —</option>
            {ENERGY.map(en => (
              <option key={en.id} value={en.id}>{en.emoji} {en.label}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="dp-edit-notes"
        rows={3}
        placeholder="Notes (optional)…"
        value={block.notes || ''}
        onChange={(e) => onUpdate({ notes: e.target.value })}
      />

      {/* Per-block reminder toggle. Putting the day on the Calendar is
          handled by the single Sync button in the header — individual
          blocks are never pushed to the Calendar separately. */}
      <div className="dp-edit-syncbox">
        <label className="dp-edit-toggle">
          <input
            type="checkbox"
            checked={!!block.reminder}
            onChange={(e) => onUpdate({ reminder: e.target.checked })}
          />
          <span>🔔 Remind me via the bell</span>
        </label>

        {block.reminder && (
          <div className="dp-edit-rem-controls">
            <label className="dp-edit-field">
              <span>When</span>
              <select
                className="dp-edit-cat"
                value={block.reminderOffset || '15m'}
                onChange={(e) => onUpdate({ reminderOffset: e.target.value })}
              >
                {REMINDER_OPTIONS.filter(o => o.id !== 'none').map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            {isDayLevel(block.reminderOffset) && (
              <label className="dp-edit-field">
                <span>At time</span>
                <input
                  type="time"
                  className="dp-edit-time"
                  value={block.reminderTime || '09:00'}
                  onChange={(e) => onUpdate({ reminderTime: e.target.value })}
                />
              </label>
            )}
          </div>
        )}
      </div>

      <div className="dp-edit-actions">
        <button type="button" className="dp-edit-del" onClick={onRemove}>🗑 Delete</button>
        <button
          type="button"
          className="dp-edit-recur"
          onClick={() => { onMakeRecurring && onMakeRecurring(); onDone(); }}
          title="Repeat this block on a schedule"
        >🔁 Make recurring</button>
        <button type="button" className="dp-edit-done" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
