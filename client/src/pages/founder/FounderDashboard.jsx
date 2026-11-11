import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  format, formatDistanceToNow, isAfter, subDays, parseISO,
  startOfWeek, subWeeks, addWeeks, differenceInCalendarDays,
} from 'date-fns';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush,
  BarChart, LineChart, PieChart, Pie, Cell,
} from 'recharts';
import { loadFounderStats, deleteFounderAccount, loadPublicChatLog, loadJournalInsights, loadPrayerInsights, KV_COUNTERS, SUBCOLLECTION_COUNTERS } from '../../services/founderService';
import {
  listFounderRequests, updateFounderRequestStatus, updateFounderRequestPriority, updateFounderDueDate,
  respondToTwoWayRequest, getRequestMessages, sendRequestMessage, deleteFounderRequest,
  REQUEST_TYPES, REQUEST_STATUSES, REQUEST_PRIORITIES,
} from '../../services/founderRequestService';
import { isFounder } from '../../lib/founder';
import './FounderDashboard.css';

const COUNTER_META = [...KV_COUNTERS, ...SUBCOLLECTION_COUNTERS];

/* Sub-views inside the Users tab — "Overview" is the original all-users
   table, one entry per COUNTER_META item drills into that single page's
   usage across every user, and "Chat" shows the whole public chat log
   (not scoped to one page's counts, since chat needs actual message
   content for moderation, not just a count). */
const USER_VIEWS = [
  { id: 'overview', label: 'Overview' },
  ...COUNTER_META.map(c => ({ id: c.id, label: c.label })),
  { id: 'chat', label: 'Chat' },
];
const REQUEST_TYPE_BY_ID = REQUEST_TYPES.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

const REQUEST_STATUS_FILTERS = [{ id: 'all', label: 'All' }, ...REQUEST_STATUSES];
const REQUEST_PRIORITY_FILTERS = [{ id: 'all', label: 'All' }, ...REQUEST_PRIORITIES];

const REQUEST_STATUS_META = {
  'new':         { label: 'New',         color: '#2563eb', bg: 'rgba(37,99,235,0.14)',  border: 'rgba(37,99,235,0.38)' },
  'in-progress': { label: 'In Progress', color: '#b45309', bg: 'rgba(180,83,9,0.14)',   border: 'rgba(180,83,9,0.36)' },
  'done':        { label: 'Done',        color: '#059669', bg: 'rgba(5,150,105,0.14)',  border: 'rgba(5,150,105,0.36)' },
  'declined':    { label: 'Declined',    color: 'rgba(11,61,61,0.55)', bg: 'rgba(11,61,61,0.06)', border: 'rgba(11,61,61,0.18)' },
};

const REQUEST_PRIORITY_META = {
  low:    { label: 'Low',    color: '#2563eb', bg: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.38)' },
  medium: { label: 'Medium', color: '#b45309', bg: 'rgba(180,83,9,0.14)', border: 'rgba(180,83,9,0.36)' },
  high:   { label: 'High',   color: '#dc2626', bg: 'rgba(220,38,38,0.14)', border: 'rgba(220,38,38,0.40)' },
};

/* An account counts as "at risk" once it's been around a month with
   almost nothing to show for it — a churn signal worth a founder's
   attention (reach out, or just know engagement is low). */
const RISK_AGE_DAYS = 30;
const RISK_MAX_ITEMS = 2;

const SEGMENTS = [
  { id: 'all',        label: 'All' },
  { id: 'new-week',   label: 'New This Week' },
  { id: 'inactive-30',label: 'Inactive 30+ Days' },
  { id: 'power',      label: 'Power Users' },
  { id: 'at-risk',    label: 'At Risk' },
];

/* Firestore Timestamps (from getDoc/getDocs) expose .toDate(); values
   that are still pending server resolution (rare, right after a write
   on this same client) come back as null until the next snapshot. */
const toDate = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate() : null);

function SortIcon({ active, dir }) {
  if (!active) return <span className="fd-sort-icon fd-sort-idle">↕</span>;
  return <span className="fd-sort-icon">{dir === 'asc' ? '↑' : '↓'}</span>;
}

/* Weekly signup buckets for the growth chart — last `weeksBack` full
   weeks (Mon–Sun), including the current in-progress week. */
function buildWeeklySignups(users, weeksBack = 12) {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const buckets = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = subWeeks(thisWeekStart, i);
    buckets.push({ start, end: addWeeks(start, 1), count: 0 });
  }
  users.forEach(u => {
    const d = toDate(u.createdAt);
    if (!d) return;
    const bucket = buckets.find(b => d >= b.start && d < b.end);
    if (bucket) bucket.count += 1;
  });
  return buckets;
}

/* ── Journal Insights helpers ─────────────────────────────────────
   All of these work off privacy-safe entry metadata only (created_at,
   word count, hasScripture, promptUsed — never the entry text itself),
   fetched via loadJournalInsights. */

const parseEntryDate = (iso) => {
  try { return iso ? parseISO(iso) : null; } catch { return null; }
};

/* Weekly entry volume + distinct active writers, same 12-week bucket
   shape as buildWeeklySignups above (for visual/UX consistency). */
function buildJournalWeeklyActivity(insights, weeksBack = 12) {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const buckets = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = subWeeks(thisWeekStart, i);
    buckets.push({ start, end: addWeeks(start, 1), entries: 0, writers: new Set() });
  }
  insights.forEach(({ uid, entries }) => {
    entries.forEach(e => {
      const d = parseEntryDate(e.created_at);
      if (!d) return;
      const bucket = buckets.find(b => d >= b.start && d < b.end);
      if (bucket) { bucket.entries += 1; bucket.writers.add(uid); }
    });
  });
  return buckets.map(b => ({ label: format(b.start, 'MMM d'), entries: b.entries, writers: b.writers.size }));
}

const WORD_COUNT_BUCKETS = [
  { label: '0–50',    min: 0,   max: 50 },
  { label: '50–100',  min: 50,  max: 100 },
  { label: '100–200', min: 100, max: 200 },
  { label: '200–400', min: 200, max: 400 },
  { label: '400+',    min: 400, max: Infinity },
];

function buildWordCountHistogram(allEntries) {
  return WORD_COUNT_BUCKETS.map(b => ({
    label: b.label,
    count: allEntries.filter(e => e.wordCount >= b.min && e.wordCount < b.max).length,
  }));
}

function buildUsagePie(allEntries, field) {
  const used = allEntries.filter(e => e[field]).length;
  return [
    { name: 'Used', value: used },
    { name: 'Not used', value: Math.max(0, allEntries.length - used) },
  ];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildDayHourGrid(allEntries) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  allEntries.forEach(e => {
    const d = parseEntryDate(e.created_at);
    if (!d) return;
    grid[d.getDay()][d.getHours()] += 1;
  });
  return grid;
}

/* Per user request, journaling "streaks" are about ENTRY COUNT, not
   consecutive days (see JournalDashboard.jsx's own getEntryStats) — so
   this buckets users by their single busiest day, not a day-streak. */
function buildBusiestDayDistribution(insights) {
  const buckets = { '1': 0, '2': 0, '3': 0, '4+': 0 };
  insights.forEach(({ entries }) => {
    if (!entries.length) return;
    const perDay = {};
    entries.forEach(e => {
      const d = parseEntryDate(e.created_at);
      if (!d) return;
      const key = format(d, 'yyyy-MM-dd');
      perDay[key] = (perDay[key] || 0) + 1;
    });
    const most = Math.max(0, ...Object.values(perDay));
    if (most <= 0) return;
    const key = most >= 4 ? '4+' : String(most);
    buckets[key] += 1;
  });
  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
}

/* ── Growth & retention ── */

const RETENTION_WEEKS = 8;

/* Classic activation/retention curve, anchored to each user's own first
   journal entry (not signup date) — week 0 is always 100% by definition,
   so it reads as "of the people who started, how many were still going
   by week N." A user only counts toward the denominator for week N once
   that week has actually happened for them. */
function buildRetentionCurve(insights) {
  const now = new Date();
  const weeks = Array.from({ length: RETENTION_WEEKS }, () => ({ eligible: 0, retained: 0 }));

  insights.forEach(({ entries }) => {
    const dates = entries.map(e => parseEntryDate(e.created_at)).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return;
    const firstWeekStart = startOfWeek(dates[0], { weekStartsOn: 1 });
    const weeksWritten = new Set(dates.map(d => Math.round(
      (startOfWeek(d, { weekStartsOn: 1 }) - firstWeekStart) / (7 * 24 * 3600 * 1000)
    )));
    for (let w = 0; w < RETENTION_WEEKS; w++) {
      if (addWeeks(firstWeekStart, w) > now) break;
      weeks[w].eligible += 1;
      if (weeksWritten.has(w)) weeks[w].retained += 1;
    }
  });

  return weeks.map((w, i) => ({
    label: `Week ${i}`,
    pct: w.eligible ? Math.round((w.retained / w.eligible) * 100) : 0,
  }));
}

/* Splits each week's writers into "new" (this is the week of their
   very first-ever entry) vs. "returning" (they'd already started). */
function buildNewVsReturningWriters(insights, weeksBack = 12) {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const buckets = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = subWeeks(thisWeekStart, i);
    buckets.push({ start, end: addWeeks(start, 1), New: new Set(), Returning: new Set() });
  }

  const firstWeekByUid = {};
  insights.forEach(({ uid, entries }) => {
    let min = null;
    entries.forEach(e => {
      const d = parseEntryDate(e.created_at);
      if (d && (!min || d < min)) min = d;
    });
    if (min) firstWeekByUid[uid] = startOfWeek(min, { weekStartsOn: 1 }).getTime();
  });

  insights.forEach(({ uid, entries }) => {
    entries.forEach(e => {
      const d = parseEntryDate(e.created_at);
      if (!d) return;
      const bucket = buckets.find(b => d >= b.start && d < b.end);
      if (!bucket) return;
      const weekStart = startOfWeek(d, { weekStartsOn: 1 }).getTime();
      (weekStart === firstWeekByUid[uid] ? bucket.New : bucket.Returning).add(uid);
    });
  });

  return buckets.map(b => ({ label: format(b.start, 'MMM d'), New: b.New.size, Returning: b.Returning.size }));
}

/* Of users with at least one entry, what % wrote a 2nd entry within a
   week of their 1st — a "did the habit stick" activation metric. */
function buildActivationRate(insights) {
  let eligible = 0;
  let activated = 0;
  insights.forEach(({ entries }) => {
    const dates = entries.map(e => parseEntryDate(e.created_at)).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return;
    eligible += 1;
    if (dates.length >= 2 && differenceInCalendarDays(dates[1], dates[0]) <= 7) activated += 1;
  });
  return { eligible, activated, pct: eligible ? Math.round((activated / eligible) * 100) : 0 };
}

/* ── Engagement depth ── */

const ENTRY_COUNT_BUCKETS = [
  { label: '1',    min: 1,  max: 1 },
  { label: '2–5',  min: 2,  max: 5 },
  { label: '6–20', min: 6,  max: 20 },
  { label: '21+',  min: 21, max: Infinity },
];

function buildEntriesPerUserHistogram(insights) {
  return ENTRY_COUNT_BUCKETS.map(b => ({
    label: b.label,
    count: insights.filter(i => i.entries.length >= b.min && i.entries.length <= b.max).length,
  }));
}

function buildWordCountTrend(insights, weeksBack = 12) {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const buckets = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = subWeeks(thisWeekStart, i);
    buckets.push({ start, end: addWeeks(start, 1), totalWords: 0, count: 0 });
  }
  insights.forEach(({ entries }) => {
    entries.forEach(e => {
      const d = parseEntryDate(e.created_at);
      if (!d) return;
      const bucket = buckets.find(b => d >= b.start && d < b.end);
      if (bucket) { bucket.totalWords += e.wordCount; bucket.count += 1; }
    });
  });
  return buckets.map(b => ({ label: format(b.start, 'MMM d'), avgWords: b.count ? Math.round(b.totalWords / b.count) : 0 }));
}

/* ── Feature adoption ── */

function buildThemePopularity(allEntries) {
  const counts = {};
  allEntries.forEach(e => { const t = e.themeId || 'default'; counts[t] = (counts[t] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

/* ── Content insights (app-provided strings, not private writing) ── */

function buildTopPrompts(allEntries, limitN = 8) {
  const counts = {};
  allEntries.forEach(e => { if (e.promptText) counts[e.promptText] = (counts[e.promptText] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limitN).map(([label, count]) => ({ label, count }));
}

/* Best-effort book extraction from a reference like "1 John 3:16" or
   "Song of Solomon 2:1" — leading word(s) before the first digit run
   that isn't itself a leading chapter numeral (e.g. "1", "2", "3"). */
function extractScriptureBook(ref) {
  if (!ref) return null;
  const match = String(ref).trim().match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*?)\s+\d/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

function buildScriptureBookFrequency(allEntries, limitN = 10) {
  const counts = {};
  allEntries.forEach(e => {
    const book = extractScriptureBook(e.scripture);
    if (book) counts[book] = (counts[book] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limitN).map(([label, count]) => ({ label, count }));
}

/* ── Prayer Insights helpers ───────────────────────────────────────
   All of these work off privacy-safe prayer metadata only (dates,
   category, status flags, update COUNTS/dates — never title, content,
   or scripture text), fetched via loadPrayerInsights. */

const PRAYER_RANGES = [
  { id: '7',    label: '7 Days',   days: 7 },
  { id: '30',   label: '30 Days',  days: 30 },
  { id: '90',   label: '90 Days',  days: 90 },
  { id: 'all',  label: 'All Time', days: null },
];

/* Mirrors getKind() in Prayers.jsx — collapses status + entry_type
   into one of three states: an active request, a testimony the
   request was answered, or a standalone thanksgiving entry. */
function prayerKind(p) {
  if (p.entry_type === 'praise') return 'praise';
  if (p.status === 'answered') return 'answered';
  return 'praying'; // legacy 'waiting' rolls in here too
}

function filterPrayersByRange(prayers, rangeId) {
  const range = PRAYER_RANGES.find(r => r.id === rangeId);
  if (!range || range.days == null) return prayers;
  const cutoff = subDays(new Date(), range.days);
  return prayers.filter(p => {
    const d = parseEntryDate(p.created_at);
    return d && d >= cutoff;
  });
}

function countCreatedInWindow(prayers, start, end) {
  return prayers.filter(p => {
    const d = parseEntryDate(p.created_at);
    return d && d >= start && d < end;
  }).length;
}

/* Current + longest consecutive-day streak of prayer activity (a
   prayer created OR updated that day) for one user's activity dates. */
function computeStreak(dates) {
  const days = [...new Set(dates.filter(Boolean).map(d => format(d, 'yyyy-MM-dd')))].sort();
  if (!days.length) return { current: 0, longest: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = differenceInCalendarDays(parseISO(days[i]), parseISO(days[i - 1]));
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  let current = 0;
  const last = days[days.length - 1];
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      const diff = differenceInCalendarDays(parseISO(days[i]), parseISO(days[i - 1]));
      if (diff === 1) current += 1; else break;
    }
  }
  return { current, longest };
}

function activityDatesFor(prayers) {
  const dates = [];
  prayers.forEach(p => {
    const c = parseEntryDate(p.created_at);
    if (c) dates.push(c);
    (p.updateDates || []).forEach(iso => {
      const d = parseEntryDate(iso);
      if (d) dates.push(d);
    });
  });
  return dates;
}

/* Prayers created vs. updates logged, last 12 weeks — fixed lookback
   (not tied to the range picker), same bucket shape as
   buildJournalWeeklyActivity for visual consistency. */
function buildPrayerWeeklyActivity(insights, weeksBack = 12) {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const buckets = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = subWeeks(thisWeekStart, i);
    buckets.push({ start, end: addWeeks(start, 1), created: 0, updated: 0 });
  }
  insights.forEach(({ prayers }) => {
    prayers.forEach(p => {
      const c = parseEntryDate(p.created_at);
      if (c) { const b = buckets.find(bk => c >= bk.start && c < bk.end); if (b) b.created += 1; }
      (p.updateDates || []).forEach(iso => {
        const d = parseEntryDate(iso);
        if (!d) return;
        const b = buckets.find(bk => d >= bk.start && d < bk.end);
        if (b) b.updated += 1;
      });
    });
  });
  return buckets.map(b => ({ label: format(b.start, 'MMM d'), created: b.created, updated: b.updated }));
}

function buildCategoryDistribution(prayers) {
  const counts = {};
  prayers.forEach(p => { const c = p.category || 'General'; counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

const STREAK_BUCKETS = [
  { label: '1',   min: 1, max: 1 },
  { label: '2–3', min: 2, max: 3 },
  { label: '4–7', min: 4, max: 7 },
  { label: '8+',  min: 8, max: Infinity },
];

function buildStreakDistribution(streaksByUid) {
  return STREAK_BUCKETS.map(b => ({
    label: b.label,
    count: Object.values(streaksByUid).filter(s => s.longest >= b.min && s.longest <= b.max).length,
  }));
}

const truncateLabel = (s, n = 26) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

const CHART_TOOLTIP_STYLE = { background: '#ffffff', border: '1px solid rgba(13,148,136,.22)', borderRadius: 10, fontSize: 12.5, boxShadow: '0 4px 16px rgba(11,61,61,.18)' };
const CHART_AXIS_TICK = { fill: 'rgba(11,61,61,.55)', fontSize: 11 };
const PIE_COLORS = ['#0d9488', 'rgba(11,61,61,.12)'];

/** Journal category tab — aggregate journaling activity across every
 *  user. Deliberately reads only structured metadata (dates, word
 *  counts, whether a prompt/scripture was used) fetched via
 *  loadJournalInsights — entry `content`/`title` text is never
 *  requested, so private journal writing stays private. */
function JournalInsightsPanel({ insights, error, onRefresh, users }) {
  const allEntries = useMemo(() => (insights ? insights.flatMap(i => i.entries) : []), [insights]);
  const weekly = useMemo(() => (insights ? buildJournalWeeklyActivity(insights) : []), [insights]);
  const wordHistogram = useMemo(() => buildWordCountHistogram(allEntries), [allEntries]);
  const promptPie = useMemo(() => buildUsagePie(allEntries, 'promptUsed'), [allEntries]);
  const scripturePie = useMemo(() => buildUsagePie(allEntries, 'hasScripture'), [allEntries]);
  const dayHourGrid = useMemo(() => buildDayHourGrid(allEntries), [allEntries]);
  const busiestDayDist = useMemo(() => (insights ? buildBusiestDayDistribution(insights) : []), [insights]);
  const maxCell = Math.max(1, ...dayHourGrid.flat());

  const retentionCurve = useMemo(() => (insights ? buildRetentionCurve(insights) : []), [insights]);
  const newVsReturning = useMemo(() => (insights ? buildNewVsReturningWriters(insights) : []), [insights]);
  const activation = useMemo(() => (insights ? buildActivationRate(insights) : { eligible: 0, activated: 0, pct: 0 }), [insights]);

  const entriesPerUserHist = useMemo(() => (insights ? buildEntriesPerUserHistogram(insights) : []), [insights]);
  const avgPerWriterTrend = useMemo(() => weekly.map(w => ({ label: w.label, avgPerWriter: w.writers ? +(w.entries / w.writers).toFixed(1) : 0 })), [weekly]);
  const wordCountTrend = useMemo(() => (insights ? buildWordCountTrend(insights) : []), [insights]);

  const lockPie = useMemo(() => buildUsagePie(allEntries, 'isLocked'), [allEntries]);
  const prayerLinkPie = useMemo(() => buildUsagePie(allEntries, 'hasLinkedPrayer'), [allEntries]);
  const themePopularity = useMemo(() => buildThemePopularity(allEntries), [allEntries]);

  const topPrompts = useMemo(() => buildTopPrompts(allEntries), [allEntries]);
  const scriptureBooks = useMemo(() => buildScriptureBookFrequency(allEntries), [allEntries]);

  if (error) {
    return <div className="fd-error">⚠ {error}</div>;
  }
  if (insights === null) {
    return <div className="fd-loading">Loading journal insights…</div>;
  }

  const totalEntries = allEntries.length;
  const writersWithEntries = insights.filter(i => i.entries.length > 0).length;

  return (
    <section>
      <div className="fd-requests-head">
        <p className="fd-detail-chat-hint" style={{ margin: 0 }}>
          Aggregate journaling activity across every user — dates, word counts, and prompt/scripture
          usage only. Entry text is never read.
        </p>
        <button type="button" className="fd-refresh" onClick={onRefresh}>⟳ Refresh</button>
      </div>

      <div className="fd-cards">
        <div className="fd-card">
          <div className="fd-card-value">{totalEntries}</div>
          <div className="fd-card-label">Total Entries</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{writersWithEntries}</div>
          <div className="fd-card-label">Users With Entries</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{users.length ? Math.round((writersWithEntries / users.length) * 100) : 0}%</div>
          <div className="fd-card-label">Adoption</div>
        </div>
      </div>

      {totalEntries === 0 ? (
        <div className="fd-empty">No journal entries yet.</div>
      ) : (
        <>
          <div className="fd-chart-card">
            <div className="fd-chart-title">Entries &amp; Active Writers — Last 12 Weeks</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={weekly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                <YAxis yAxisId="left" tick={CHART_AXIS_TICK} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={CHART_AXIS_TICK} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="entries" name="Entries" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="writers" name="Active Writers" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
                <Brush dataKey="label" height={18} stroke="#0d9488" travellerWidth={8} fill="rgba(13,148,136,.06)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="fd-insights-row">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Entry Length (Words)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={wordHistogram} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Entries" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Prompt Usage</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={promptPie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={2}>
                    {promptPie.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Scripture Engagement</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={scripturePie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={2}>
                    {scripturePie.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="fd-insights-row fd-insights-row-2">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">When People Journal <span className="fd-chart-subtitle">Day × hour, all users</span></div>
              <div className="fd-heatgrid">
                {dayHourGrid.map((row, dayIdx) => (
                  <div key={dayIdx} className="fd-heatgrid-row">
                    <span className="fd-heatgrid-daylabel">{DAY_LABELS[dayIdx]}</span>
                    <div className="fd-heatgrid-cells">
                      {row.map((count, hourIdx) => (
                        <div
                          key={hourIdx}
                          className="fd-heatgrid-cell"
                          title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 · ${count} entr${count !== 1 ? 'ies' : 'y'}`}
                          style={{
                            background: count === 0 ? 'rgba(11,61,61,.07)' : 'rgba(13,148,136,.85)',
                            opacity: count > 0 ? Math.min(1, 0.4 + (count / maxCell) * 0.6) : 1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="fd-heatgrid-hourlabels">
                  <span className="fd-heatgrid-spacer" />
                  <div className="fd-heatgrid-cells">
                    {[0, 6, 12, 18].map(h => (
                      <span key={h} className="fd-heatgrid-hourlabel" style={{ gridColumnStart: h + 1 }}>{h}:00</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Busiest Day, Per User <span className="fd-chart-subtitle">Most entries in a single day</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={busiestDayDist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Users" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3 className="fd-detail-section-title">Growth &amp; Retention</h3>
          <div className="fd-insights-row fd-insights-row-2">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Retention Curve <span className="fd-chart-subtitle">% still journaling, by weeks since first entry</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={retentionCurve} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Retained']} />
                  <Line type="monotone" dataKey="pct" name="Retained" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">New vs. Returning Writers <span className="fd-chart-subtitle">Last 12 weeks</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={newVsReturning} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="New" name="New" stackId="w" fill="#b45309" />
                  <Bar dataKey="Returning" name="Returning" stackId="w" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="fd-cards">
            <div className="fd-card">
              <div className="fd-card-value">{activation.pct}%</div>
              <div className="fd-card-label">Activation Rate — 2nd Entry Within 7 Days</div>
            </div>
          </div>

          <h3 className="fd-detail-section-title">Engagement Depth</h3>
          <div className="fd-insights-row">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Entries Per User</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={entriesPerUserHist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Users" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Avg Entries / Active Writer <span className="fd-chart-subtitle">Last 12 weeks</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={avgPerWriterTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="avgPerWriter" name="Avg Entries" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Avg Word Count Trend <span className="fd-chart-subtitle">Last 12 weeks</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={wordCountTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="avgWords" name="Avg Words" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3 className="fd-detail-section-title">Feature Adoption</h3>
          <div className="fd-insights-row">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Lock Usage</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={lockPie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={2}>
                    {lockPie.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Prayer Linking</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={prayerLinkPie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={2}>
                    {prayerLinkPie.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Theme Popularity</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={themePopularity} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Entries" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3 className="fd-detail-section-title">Content Insights</h3>
          <div className="fd-insights-row fd-insights-row-2">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Top Prompts Used</div>
              {topPrompts.length === 0 ? (
                <div className="fd-empty">No prompt-based entries yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topPrompts} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" horizontal={false} />
                    <XAxis type="number" tick={CHART_AXIS_TICK} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ ...CHART_AXIS_TICK, fontSize: 10 }} width={150} tickFormatter={truncateLabel} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Times Used" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Scripture Book Frequency</div>
              {scriptureBooks.length === 0 ? (
                <div className="fd-empty">No scripture references yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scriptureBooks} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" horizontal={false} />
                    <XAxis type="number" tick={CHART_AXIS_TICK} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ ...CHART_AXIS_TICK, fontSize: 10 }} width={150} tickFormatter={truncateLabel} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="References" fill="#b45309" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** Prayers category tab — aggregate + per-user prayer activity across
 *  every user. Deliberately reads only structured metadata (dates,
 *  category, status flags, update counts/dates) fetched via
 *  loadPrayerInsights — prayer `title`/`content`/scripture text is
 *  never requested, so private prayer requests stay private. */
function PrayerInsightsPanel({ insights, error, onRefresh, users, onSelectUser }) {
  const [range, setRange] = useState('30');
  const [tableFilter, setTableFilter] = useState(null); // { type, value, label }
  const [sort, setSort] = useState({ key: 'count', dir: 'desc' });
  const [expandedUid, setExpandedUid] = useState(null);

  const insightsByUid = useMemo(() => {
    const map = {};
    (insights || []).forEach(i => { map[i.uid] = i.prayers; });
    return map;
  }, [insights]);

  const allPrayersAllTime = useMemo(() => (insights ? insights.flatMap(i => i.prayers) : []), [insights]);
  const rangedPrayers = useMemo(() => filterPrayersByRange(allPrayersAllTime, range), [allPrayersAllTime, range]);
  const selectedRange = PRAYER_RANGES.find(r => r.id === range);

  /* Period-over-period delta on Total Prayers — compares the selected
     window to the equal-length window right before it. Skipped for
     "All Time" since there's no meaningful "previous" window. */
  const delta = useMemo(() => {
    if (!insights || !selectedRange || selectedRange.days == null) return null;
    const end = new Date();
    const start = subDays(end, selectedRange.days);
    const prevStart = subDays(start, selectedRange.days);
    const current = countCreatedInWindow(allPrayersAllTime, start, end);
    const previous = countCreatedInWindow(allPrayersAllTime, prevStart, start);
    if (previous === 0) return current > 0 ? { pct: null, dir: 'up' } : null;
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct, dir: pct >= 0 ? 'up' : 'down' };
  }, [insights, allPrayersAllTime, selectedRange]);

  const totalPrayers = rangedPrayers.length;
  const usersWithPrayers = users.filter(u => filterPrayersByRange(insightsByUid[u.uid] || [], range).length > 0).length;
  const adoptionPct = users.length ? Math.round((usersWithPrayers / users.length) * 100) : 0;

  const kindCounts = useMemo(() => {
    const c = { praying: 0, answered: 0, praise: 0 };
    rangedPrayers.forEach(p => { c[prayerKind(p)] += 1; });
    return c;
  }, [rangedPrayers]);
  const answerablePool = kindCounts.praying + kindCounts.answered;
  const answerRate = answerablePool ? Math.round((kindCounts.answered / answerablePool) * 100) : 0;
  const praiseRatio = totalPrayers ? Math.round((kindCounts.praise / totalPrayers) * 100) : 0;

  const totalUpdates = rangedPrayers.reduce((sum, p) => sum + (p.updateCount || 0), 0);
  const engagementDepth = totalPrayers ? +(totalUpdates / totalPrayers).toFixed(1) : 0;

  const urgentPct = totalPrayers ? Math.round((rangedPrayers.filter(p => p.is_urgent).length / totalPrayers) * 100) : 0;
  const dailyPct = totalPrayers ? Math.round((rangedPrayers.filter(p => p.is_daily).length / totalPrayers) * 100) : 0;
  const friendPct = totalPrayers ? Math.round((rangedPrayers.filter(p => p.hasFriends).length / totalPrayers) * 100) : 0;
  const scripturePct = totalPrayers ? Math.round((rangedPrayers.filter(p => p.hasScripture).length / totalPrayers) * 100) : 0;

  /* Stale count is a snapshot metric (not tied to the range picker) —
     "how much is currently sitting untouched" doesn't make sense to
     window by creation date, so it's always computed off all-time data. */
  const staleCount = allPrayersAllTime.filter(p => prayerKind(p) === 'praying' && p.updated_at
    && differenceInCalendarDays(new Date(), parseISO(p.updated_at)) >= 30).length;

  /* Streaks are also a snapshot metric, computed off each user's full
     activity history regardless of the selected range. */
  const streaksByUid = useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.uid] = computeStreak(activityDatesFor(insightsByUid[u.uid] || [])); });
    return map;
  }, [users, insightsByUid]);

  const weekly = useMemo(() => (insights ? buildPrayerWeeklyActivity(insights) : []), [insights]);
  const categoryDist = useMemo(() => buildCategoryDistribution(rangedPrayers), [rangedPrayers]);
  const streakDist = useMemo(() => buildStreakDistribution(streaksByUid), [streaksByUid]);

  const userRows = useMemo(() => {
    return users.map(u => {
      const all = insightsByUid[u.uid] || [];
      const ranged = filterPrayersByRange(all, range);
      const updates = ranged.reduce((s, p) => s + (p.updateCount || 0), 0);
      const engagement = ranged.length ? +(updates / ranged.length).toFixed(1) : 0;
      const urgentCount = ranged.filter(p => p.is_urgent).length;
      const dailyCount = ranged.filter(p => p.is_daily).length;
      const friendCount = ranged.filter(p => p.hasFriends).length;
      const praiseCount = ranged.filter(p => prayerKind(p) === 'praise').length;
      const stale = all.filter(p => prayerKind(p) === 'praying' && p.updated_at
        && differenceInCalendarDays(new Date(), parseISO(p.updated_at)) >= 30).length;
      const streak = streaksByUid[u.uid] || { current: 0, longest: 0 };
      return {
        uid: u.uid,
        displayName: u.displayName,
        email: u.email,
        lastActiveAt: u._lastActiveAt,
        count: ranged.length,
        engagement,
        urgentCount,
        dailyCount,
        friendPct: ranged.length ? Math.round((friendCount / ranged.length) * 100) : 0,
        praisePct: ranged.length ? Math.round((praiseCount / ranged.length) * 100) : 0,
        stale,
        streakLongest: streak.longest,
        categoryBreakdown: buildCategoryDistribution(ranged),
      };
    });
  }, [users, insightsByUid, range, streaksByUid]);

  const filteredRows = useMemo(() => {
    if (!tableFilter) return userRows;
    return userRows.filter(r => {
      if (tableFilter.type === 'urgent') return r.urgentCount > 0;
      if (tableFilter.type === 'daily') return r.dailyCount > 0;
      if (tableFilter.type === 'friends') return r.friendPct > 0;
      if (tableFilter.type === 'praise') return r.praisePct > 0;
      if (tableFilter.type === 'stale') return r.stale > 0;
      if (tableFilter.type === 'category') return r.categoryBreakdown.some(c => c.label === tableFilter.value && c.count > 0);
      return true;
    });
  }, [userRows, tableFilter]);

  const sortedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      let av, bv;
      switch (sort.key) {
        case 'name':       av = (a.displayName || '').toLowerCase(); bv = (b.displayName || '').toLowerCase(); break;
        case 'engagement': av = a.engagement; bv = b.engagement; break;
        case 'urgent':     av = a.urgentCount; bv = b.urgentCount; break;
        case 'friendPct':  av = a.friendPct; bv = b.friendPct; break;
        case 'praisePct':  av = a.praisePct; bv = b.praisePct; break;
        case 'stale':      av = a.stale; bv = b.stale; break;
        case 'streak':     av = a.streakLongest; bv = b.streakLongest; break;
        case 'lastActive': av = a.lastActiveAt?.getTime() || 0; bv = b.lastActiveAt?.getTime() || 0; break;
        default:           av = a.count; bv = b.count;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredRows, sort]);

  const toggleSort = (key) => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const applyFilter = (type, value, label) => {
    setTableFilter(prev => ((prev && prev.type === type && prev.value === value) ? null : { type, value, label }));
  };

  if (error) {
    return <div className="fd-error">⚠ {error}</div>;
  }
  if (insights === null) {
    return <div className="fd-loading">Loading prayer insights…</div>;
  }

  return (
    <section>
      <div className="fd-requests-head">
        <p className="fd-detail-chat-hint" style={{ margin: 0 }}>
          Aggregate prayer activity across every user — dates, categories, and status flags only.
          Prayer title, content, and scripture text are never read.
        </p>
        <button type="button" className="fd-refresh" onClick={onRefresh}>⟳ Refresh</button>
      </div>

      <div className="fd-chips">
        {PRAYER_RANGES.map(r => (
          <button
            key={r.id}
            type="button"
            className={`fd-chip${range === r.id ? ' fd-chip-on' : ''}`}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="fd-cards">
        <div className="fd-card">
          <div className="fd-card-value">
            {totalPrayers}
            {delta && delta.pct != null && (
              <span className={`fd-delta ${delta.dir === 'up' ? 'fd-delta-up' : 'fd-delta-down'}`}>
                {delta.dir === 'up' ? '▲' : '▼'}{Math.abs(delta.pct)}%
              </span>
            )}
          </div>
          <div className="fd-card-label">Total Prayers</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{usersWithPrayers}</div>
          <div className="fd-card-label">Users With Prayers</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{adoptionPct}%</div>
          <div className="fd-card-label">Adoption</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{answerRate}%</div>
          <div className="fd-card-label">Answer Rate</div>
        </div>
      </div>

      {totalPrayers === 0 ? (
        <div className="fd-empty">No prayers logged in this range.</div>
      ) : (
        <>
          <h3 className="fd-detail-section-title">Engagement &amp; Adoption <span className="fd-chart-subtitle">Click a tile to filter the table below</span></h3>
          <div className="fd-cards">
            <div className="fd-card">
              <div className="fd-card-value">{engagementDepth}</div>
              <div className="fd-card-label">Avg Updates / Prayer</div>
            </div>
            <button type="button" className={`fd-card fd-card-clickable${tableFilter?.type === 'urgent' ? ' fd-card-active' : ''}`} onClick={() => applyFilter('urgent', true, 'Urgent')}>
              <div className="fd-card-value">{urgentPct}%</div>
              <div className="fd-card-label">Urgent</div>
            </button>
            <button type="button" className={`fd-card fd-card-clickable${tableFilter?.type === 'daily' ? ' fd-card-active' : ''}`} onClick={() => applyFilter('daily', true, 'Daily List')}>
              <div className="fd-card-value">{dailyPct}%</div>
              <div className="fd-card-label">Daily List</div>
            </button>
            <button type="button" className={`fd-card fd-card-clickable${tableFilter?.type === 'friends' ? ' fd-card-active' : ''}`} onClick={() => applyFilter('friends', true, 'Friend-Linked')}>
              <div className="fd-card-value">{friendPct}%</div>
              <div className="fd-card-label">Friend-Linked</div>
            </button>
            <div className="fd-card">
              <div className="fd-card-value">{scripturePct}%</div>
              <div className="fd-card-label">Scripture Attached</div>
            </div>
            <button type="button" className={`fd-card fd-card-clickable${tableFilter?.type === 'praise' ? ' fd-card-active' : ''}`} onClick={() => applyFilter('praise', true, 'Praise Entries')}>
              <div className="fd-card-value">{praiseRatio}%</div>
              <div className="fd-card-label">Praise Entries</div>
            </button>
            <button type="button" className={`fd-card fd-card-clickable${tableFilter?.type === 'stale' ? ' fd-card-active' : ''}`} onClick={() => applyFilter('stale', true, 'Stale 30+ Days')}>
              <div className="fd-card-value">{staleCount}</div>
              <div className="fd-card-label">Stale 30+ Days</div>
            </button>
          </div>

          <div className="fd-chart-card">
            <div className="fd-chart-title">Prayers Created &amp; Updates Logged — Last 12 Weeks</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={weekly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                <YAxis yAxisId="left" tick={CHART_AXIS_TICK} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={CHART_AXIS_TICK} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="created" name="Prayers Created" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="updated" name="Updates Logged" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
                <Brush dataKey="label" height={18} stroke="#0d9488" travellerWidth={8} fill="rgba(13,148,136,.06)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="fd-insights-row fd-insights-row-2">
            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">By Category <span className="fd-chart-subtitle">Click a bar to filter the table below</span></div>
              <ResponsiveContainer width="100%" height={Math.max(180, categoryDist.length * 34)}>
                <BarChart data={categoryDist} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" horizontal={false} />
                  <XAxis type="number" tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ ...CHART_AXIS_TICK, fontSize: 10 }} width={110} tickFormatter={truncateLabel} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar
                    dataKey="count"
                    name="Prayers"
                    fill="#0d9488"
                    radius={[0, 4, 4, 0]}
                    onClick={(d) => applyFilter('category', d.label, d.label)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="fd-chart-card fd-chart-card-flush">
              <div className="fd-chart-title">Streaks <span className="fd-chart-subtitle">Longest consecutive-day run, per user</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={streakDist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,61,61,.10)" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Users" fill="#b45309" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3 className="fd-detail-section-title">By User</h3>
          {tableFilter && (
            <div className="fd-chips">
              <button type="button" className="fd-chip fd-chip-on" onClick={() => setTableFilter(null)}>
                Filter: {tableFilter.label} ✕
              </button>
            </div>
          )}

          {sortedRows.length === 0 ? (
            <div className="fd-empty">No users match this filter.</div>
          ) : (
            <div className="fd-table-wrap">
              <table className="fd-table">
                <thead>
                  <tr>
                    <th className="fd-th-sortable" onClick={() => toggleSort('name')}>User <SortIcon active={sort.key === 'name'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('count')}>Prayers <SortIcon active={sort.key === 'count'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('engagement')}>Engagement <SortIcon active={sort.key === 'engagement'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('urgent')}>Urgent <SortIcon active={sort.key === 'urgent'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('friendPct')}>Friend-Linked <SortIcon active={sort.key === 'friendPct'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('praisePct')}>Praise <SortIcon active={sort.key === 'praisePct'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('stale')}>Stale <SortIcon active={sort.key === 'stale'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('streak')}>Streak <SortIcon active={sort.key === 'streak'} dir={sort.dir} /></th>
                    <th className="fd-th-sortable" onClick={() => toggleSort('lastActive')}>Last Active <SortIcon active={sort.key === 'lastActive'} dir={sort.dir} /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(r => (
                    <Fragment key={r.uid}>
                      <tr className="fd-row-clickable" onClick={() => setExpandedUid(prev => (prev === r.uid ? null : r.uid))}>
                        <td>
                          <div className="fd-user-name">{r.displayName}</div>
                          <div className="fd-user-email">{r.email}</div>
                        </td>
                        <td className="fd-th-count fd-cell-total">{r.count}</td>
                        <td className="fd-th-count">{r.engagement}</td>
                        <td className="fd-th-count">{r.urgentCount}</td>
                        <td className="fd-th-count">{r.friendPct}%</td>
                        <td className="fd-th-count">{r.praisePct}%</td>
                        <td className="fd-th-count">{r.stale}</td>
                        <td className="fd-th-count">{r.streakLongest}</td>
                        <td className="fd-cell-date">{r.lastActiveAt ? formatDistanceToNow(r.lastActiveAt, { addSuffix: true }) : '—'}</td>
                      </tr>
                      {expandedUid === r.uid && (
                        <tr className="fd-table-expand-row">
                          <td colSpan={9}>
                            {r.categoryBreakdown.length === 0 ? (
                              <div className="fd-empty">No prayers logged in this range.</div>
                            ) : (
                              <div className="fd-modal-bars">
                                {r.categoryBreakdown.map(c => {
                                  const max = Math.max(1, ...r.categoryBreakdown.map(x => x.count));
                                  return (
                                    <div key={c.label} className="fd-modal-bar-row">
                                      <span className="fd-modal-bar-label">{c.label}</span>
                                      <div className="fd-modal-bar-track">
                                        <div className="fd-modal-bar-fill" style={{ width: `${(c.count / max) * 100}%` }} />
                                      </div>
                                      <span className="fd-modal-bar-count">{c.count}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <button
                              type="button"
                              className="fd-mini-btn"
                              onClick={(e) => { e.stopPropagation(); onSelectUser(r.uid); }}
                            >
                              Open full profile →
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows) {
  const headers = ['Name', 'Email', 'Joined', 'Last Active', ...COUNTER_META.map(c => c.label), 'Total'];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(u => {
    lines.push([
      csvEscape(u.displayName),
      csvEscape(u.email),
      csvEscape(u._createdAt ? format(u._createdAt, 'yyyy-MM-dd') : ''),
      csvEscape(u._lastActiveAt ? format(u._lastActiveAt, 'yyyy-MM-dd') : ''),
      ...COUNTER_META.map(c => u.counts[c.id] ?? 0),
      u.totalItems,
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `founder-dashboard-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* Type-to-confirm delete, same pattern GitHub uses for deleting a repo —
   the button stays disabled until the founder types the account's exact
   email (or display name, if it has no email) into the box. Deletion is
   irreversible: it wipes the Firebase Auth login, every Firestore doc,
   and every Storage blob for this uid — see functions/index.js. */
function DeleteAccountSection({ user, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const expected = (user.email || user.displayName || '').trim().toLowerCase();
  const canDelete = expected.length > 0 && confirmText.trim().toLowerCase() === expected;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteFounderAccount(user.uid);
      onDeleted(user.uid);
    } catch (e) {
      setError(e?.message || 'Failed to delete account.');
      setDeleting(false);
    }
  };

  return (
    <div className="fd-danger">
      <div className="fd-danger-title">⚠ Danger zone</div>
      <p className="fd-danger-text">
        Permanently deletes this person's login and every piece of their data
        (journal entries, prayers, songs, studio projects, writing docs — all
        of it). This can't be undone.
      </p>
      <label className="fd-danger-label">
        Type <strong>{user.email || user.displayName}</strong> to confirm
      </label>
      <input
        className="fd-danger-input"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={user.email || user.displayName}
        disabled={deleting}
        autoComplete="off"
      />
      {error && <div className="fd-danger-error">⚠ {error}</div>}
      <button
        type="button"
        className="fd-danger-btn"
        disabled={!canDelete || deleting}
        onClick={handleDelete}
      >
        {deleting ? 'Deleting…' : 'Delete account permanently'}
      </button>
    </div>
  );
}

/* A user's own chat messages across every PUBLIC channel — the founder's
   per-person moderation view, so a report of "so-and-so was rude in chat"
   can be checked without digging through the live Chat page. Scoped to
   messages already loaded into the shared chatLog (see loadPublicChatLog),
   filtered client-side by author. */
function UserChatHistory({ uid, chatLog, chatLogError, onLoad }) {
  const messages = useMemo(
    () => (chatLog ? chatLog.messages.filter(m => m.authorUid === uid) : []),
    [chatLog, uid]
  );

  return (
    <div className="fd-detail-chat">
      <div className="fd-detail-chat-head">
        <h3 className="fd-detail-section-title">Chat history</h3>
        {chatLog && (
          <button type="button" className="fd-mini-btn" onClick={onLoad}>⟳ Refresh</button>
        )}
      </div>
      <p className="fd-detail-chat-hint">
        Every message this person has posted in a public channel — public channels only, same visibility any signed-in member already has.
      </p>

      {chatLogError && <div className="fd-error">⚠ {chatLogError}</div>}

      {!chatLog && !chatLogError && (
        <button type="button" className="fd-mini-btn" onClick={onLoad}>Load chat history</button>
      )}

      {chatLog && messages.length === 0 && (
        <div className="fd-empty">No public chat messages found for this person.</div>
      )}

      {messages.length > 0 && (
        <div className="fd-chat-log-list">
          {messages.map(m => {
            const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
            return (
              <div key={`${m.channelId}_${m.id}`} className="fd-chat-log-row">
                <div className="fd-chat-log-meta">
                  <span className="fd-chat-log-channel">#{m.channelName}</span>
                  {created && <span className="fd-chat-log-time">{format(created, 'MMM d, yyyy h:mm a')}</span>}
                </div>
                <div className="fd-chat-log-text">{m.text || (m.attachment ? '📎 Attachment' : '')}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Drill-down page for a single user — their own mini breakdown of which
   features they actually use, scaled to their own busiest feature (not
   the whole userbase), so it reads as "what do THEY use most" rather
   than "how do they compare to others" — plus their public chat history
   for moderation. */
function UserDetailPage({ user, chatLog, chatLogError, onLoadChatLog, onBack, onDeleted }) {
  const maxOwnCount = Math.max(1, ...COUNTER_META.map(c => user.counts[c.id] ?? 0));
  const ageDays = user._createdAt ? differenceInCalendarDays(new Date(), user._createdAt) : null;

  return (
    <div className="fd-detail">
      <button type="button" className="fd-detail-back" onClick={onBack}>← Back to users</button>

      <div className="fd-detail-head">
        <div>
          <div className="fd-detail-name">{user.displayName}</div>
          <div className="fd-detail-email">{user.email}</div>
        </div>
      </div>

      <div className="fd-modal-badges">
        {user._isAtRisk && <span className="fd-badge fd-badge-risk">⚠ At risk</span>}
        {user._isPowerUser && <span className="fd-badge fd-badge-power">⭐ Power user</span>}
      </div>

      <div className="fd-modal-meta">
        <div className="fd-modal-meta-row">
          <span className="fd-modal-meta-label">Identifying key</span>
          <span className="fd-modal-meta-value">{user.identifyingKey || '—'}</span>
        </div>
        <div className="fd-modal-meta-row">
          <span className="fd-modal-meta-label">Joined</span>
          <span className="fd-modal-meta-value">
            {user._createdAt ? format(user._createdAt, 'MMM d, yyyy') : '—'}
            {ageDays != null && <span className="fd-modal-meta-sub"> ({ageDays}d ago)</span>}
          </span>
        </div>
        <div className="fd-modal-meta-row">
          <span className="fd-modal-meta-label">Last active</span>
          <span className="fd-modal-meta-value">
            {user._lastActiveAt ? formatDistanceToNow(user._lastActiveAt, { addSuffix: true }) : '—'}
          </span>
        </div>
        <div className="fd-modal-meta-row">
          <span className="fd-modal-meta-label">Total items</span>
          <span className="fd-modal-meta-value">{user.totalItems}</span>
        </div>
      </div>

      <h3 className="fd-detail-section-title">Usage by page</h3>
      <div className="fd-modal-bars">
        {COUNTER_META.map(c => {
          const n = user.counts[c.id] ?? 0;
          return (
            <div key={c.id} className="fd-modal-bar-row">
              <span className="fd-modal-bar-label">{c.label}</span>
              <div className="fd-modal-bar-track">
                <div className="fd-modal-bar-fill" style={{ width: `${(n / maxOwnCount) * 100}%` }} />
              </div>
              <span className="fd-modal-bar-count">{n}</span>
            </div>
          );
        })}
      </div>

      <UserChatHistory
        uid={user.uid}
        chatLog={chatLog}
        chatLogError={chatLogError}
        onLoad={onLoadChatLog}
      />

      {!isFounder({ email: user.email }) && (
        <DeleteAccountSection user={user} onDeleted={onDeleted} />
      )}
    </div>
  );
}

/* Chat Log tab — the founder's whole-chat moderation view: every message
   across every PUBLIC channel, newest first, filterable by channel and
   searchable by text/author, so a report of "there was a fight in chat"
   can be checked without joining the channel. Private channels are
   excluded — see loadPublicChatLog in founderService.js. */
/* One page/feature's usage across EVERY user — e.g. picking "Prayers"
   shows every user ranked by how many prayer requests they have, instead
   of the Overview's one-row-per-user table with every page crammed into
   columns. Clicking a row still opens that user's full detail page. */
function CategoryDashboard({ category, users, onSelectUser }) {
  const rows = useMemo(() => {
    return users
      .map(u => ({
        uid: u.uid,
        displayName: u.displayName,
        email: u.email,
        count: u.counts[category.id] ?? 0,
        lastActiveAt: u._lastActiveAt,
      }))
      .sort((a, b) => b.count - a.count);
  }, [users, category.id]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const usersWithAny = rows.filter(r => r.count > 0).length;

  return (
    <section>
      <div className="fd-cards">
        <div className="fd-card">
          <div className="fd-card-value">{total}</div>
          <div className="fd-card-label">Total {category.label}</div>
        </div>
        <div className="fd-card">
          <div className="fd-card-value">{usersWithAny}</div>
          <div className="fd-card-label">Users With Any</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="fd-empty">No users yet.</div>
      ) : (
        <div className="fd-table-wrap">
          <table className="fd-table">
            <thead>
              <tr>
                <th>User</th>
                <th className="fd-th-count">{category.label}</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.uid} className="fd-row-clickable" onClick={() => onSelectUser(r.uid)}>
                  <td>
                    <div className="fd-user-name">{r.displayName}</div>
                    <div className="fd-user-email">{r.email}</div>
                  </td>
                  <td className="fd-th-count fd-cell-total">{r.count}</td>
                  <td className="fd-cell-date">
                    {r.lastActiveAt ? formatDistanceToNow(r.lastActiveAt, { addSuffix: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChatLogPanel({ chatLog, error, onRefresh }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [query, setQuery] = useState('');

  const channels = chatLog?.channels || [];
  const messages = chatLog?.messages || [];

  const filtered = useMemo(() => {
    let rows = channelFilter === 'all' ? messages : messages.filter(m => m.channelId === channelFilter);
    const needle = query.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(m =>
        (m.text || '').toLowerCase().includes(needle)
        || (m.authorName || '').toLowerCase().includes(needle));
    }
    return [...rows].reverse(); // newest first
  }, [messages, channelFilter, query]);

  return (
    <section className="fd-chat-log">
      <div className="fd-requests-head">
        <div>
          <h2 className="fd-requests-title">Chat Log</h2>
          <p className="fd-detail-chat-hint">
            Every message across public channels, so you can check for foul language or fights. Private channels aren't included.
          </p>
        </div>
        <button type="button" className="fd-refresh" onClick={onRefresh} disabled={chatLog === null}>
          ⟳ Refresh
        </button>
      </div>

      {error && <div className="fd-error">⚠ {error}</div>}

      {chatLog === null && !error && (
        <div className="fd-loading">Loading chat history…</div>
      )}

      {chatLog && (
        <>
          <div className="fd-chips">
            <button
              type="button"
              className={`fd-chip${channelFilter === 'all' ? ' fd-chip-on' : ''}`}
              onClick={() => setChannelFilter('all')}
            >
              All channels <span className="fd-chip-count">{messages.length}</span>
            </button>
            {channels.map(ch => (
              <button
                key={ch.id}
                type="button"
                className={`fd-chip${channelFilter === ch.id ? ' fd-chip-on' : ''}`}
                onClick={() => setChannelFilter(ch.id)}
              >
                #{ch.name || 'Untitled'} <span className="fd-chip-count">{messages.filter(m => m.channelId === ch.id).length}</span>
              </button>
            ))}
          </div>

          <div className="fd-toolbar">
            <input
              className="fd-search"
              type="text"
              placeholder="Search messages or names…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="fd-empty">No messages match this view.</div>
          ) : (
            <div className="fd-chat-log-list">
              {filtered.map(m => {
                const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
                return (
                  <div key={`${m.channelId}_${m.id}`} className="fd-chat-log-row">
                    <div className="fd-chat-log-meta">
                      <span className="fd-chat-log-channel">#{m.channelName}</span>
                      <span className="fd-chat-log-author">{m.authorName || 'Member'}</span>
                      {created && <span className="fd-chat-log-time">{format(created, 'MMM d, yyyy h:mm a')}</span>}
                    </div>
                    <div className="fd-chat-log-text">{m.text || (m.attachment ? '📎 Attachment' : '')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* Chat thread for a single request — the founder can always post here
   (one-way, no permission needed from the sender), plus accept/decline
   a pending two-way chat request the sender has filed. Once accepted,
   the sender can post back too (enforced by firestore.rules). */
function RequestChatModal({ request, onClose, onTwoWayChange }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const rows = await getRequestMessages(request.id);
      setMessages(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load messages.');
      setMessages([]);
    }
  };

  useEffect(() => { load(); }, [request.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendRequestMessage(request.id, { role: 'founder', text });
      setText('');
      await load();
    } catch (err) {
      window.alert(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleTwoWay = async (accept) => {
    setRespondBusy(true);
    try {
      await respondToTwoWayRequest(request.id, accept);
      onTwoWayChange(request.id, accept ? 'accepted' : 'declined');
    } catch (err) {
      window.alert(err?.message || 'Failed to update two-way chat access.');
    } finally {
      setRespondBusy(false);
    }
  };

  return (
    <div className="fd-modal-backdrop" onClick={onClose}>
      <div className="fd-chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fd-chat-modal-head">
          <div>
            <h2 className="fd-chat-modal-title">{request.title}</h2>
            <p className="fd-chat-modal-sub">Chat with {request.senderName}</p>
          </div>
          <button type="button" className="fd-chat-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {request.twoWayStatus === 'requested' && (
          <div className="fd-two-way-banner">
            <span>
              {request.senderName} asked for two-way chat access
              {request.twoWayNote ? `: "${request.twoWayNote}"` : '.'}
            </span>
            <div className="fd-two-way-actions">
              <button type="button" className="fd-mini-btn" disabled={respondBusy} onClick={() => handleTwoWay(true)}>Accept</button>
              <button type="button" className="fd-mini-btn fd-mini-btn-danger" disabled={respondBusy} onClick={() => handleTwoWay(false)}>Decline</button>
            </div>
          </div>
        )}

        {request.twoWayStatus === 'accepted' && (
          <div className="fd-two-way-banner fd-two-way-banner-on">Two-way chat is enabled for this request.</div>
        )}

        {error && <div className="fd-error">⚠ {error}</div>}
        {messages === null && !error && <div className="fd-loading">Loading messages…</div>}

        {messages && (
          <div className="fd-chat-thread">
            {messages.length === 0 ? (
              <div className="fd-empty">No messages yet — say hi.</div>
            ) : messages.map(m => {
              const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
              return (
                <div key={m.id} className={`fd-chat-bubble${m.senderRole === 'founder' ? ' fd-chat-bubble-founder' : ' fd-chat-bubble-user'}`}>
                  <div className="fd-chat-bubble-text">{m.text}</div>
                  {created && <div className="fd-chat-bubble-time">{format(created, 'MMM d, h:mm a')}</div>}
                </div>
              );
            })}
          </div>
        )}

        <form className="fd-chat-form" onSubmit={handleSend}>
          <input
            className="fd-chat-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Send a message…"
          />
          <button type="submit" className="fd-mini-btn fd-chat-send-btn" disabled={sending || !text.trim()}>
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* Requests panel — bug/feature/add-on requests filed from the Settings
   page's "Send a Request" button (see founderRequestService.js). Lets
   the founder triage: filter by status, move a request forward, or
   dismiss it once handled. */
function RequestsPanel({ requests, error, onRefresh, onChange }) {
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [chatRequestId, setChatRequestId] = useState(null);

  const handleFilterClick = (id) => {
    setFilter(id);
    setPriorityFilter('all');
  };

  const counts = useMemo(() => {
    const c = { all: (requests || []).length };
    REQUEST_STATUSES.forEach(s => { c[s.id] = 0; });
    (requests || []).forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [requests]);

  /* Priority breakdown of just the In Progress requests — powers the
     Low/Medium/High sub-tabs that only appear under that status. */
  const inProgressPriorityCounts = useMemo(() => {
    const c = { all: 0, low: 0, medium: 0, high: 0 };
    (requests || []).filter(r => r.status === 'in-progress').forEach(r => {
      c.all += 1;
      const p = r.priority || 'medium';
      c[p] = (c[p] || 0) + 1;
    });
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    let rows = filter === 'all' ? requests : requests.filter(r => r.status === filter);
    if (filter === 'in-progress' && priorityFilter !== 'all') {
      rows = rows.filter(r => (r.priority || 'medium') === priorityFilter);
    }
    return rows;
  }, [requests, filter, priorityFilter]);

  const handleStatus = async (id, status) => {
    setBusyId(id);
    try {
      await updateFounderRequestStatus(id, status);
      onChange(prev => (prev || []).map(r => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      window.alert(e?.message || 'Failed to update request.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePriority = async (id, priority) => {
    setBusyId(id);
    try {
      await updateFounderRequestPriority(id, priority);
      onChange(prev => (prev || []).map(r => (r.id === id ? { ...r, priority } : r)));
    } catch (e) {
      window.alert(e?.message || 'Failed to update priority.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Dismiss this request? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await deleteFounderRequest(id);
      onChange(prev => (prev || []).filter(r => r.id !== id));
    } catch (e) {
      window.alert(e?.message || 'Failed to dismiss request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleFounderDueDate = async (id, value) => {
    setBusyId(id);
    try {
      await updateFounderDueDate(id, value);
      onChange(prev => (prev || []).map(r => (r.id === id ? { ...r, founderDueDate: value || null } : r)));
    } catch (e) {
      window.alert(e?.message || 'Failed to update due date.');
    } finally {
      setBusyId(null);
    }
  };

  const chatRequest = chatRequestId ? (requests || []).find(r => r.id === chatRequestId) : null;

  return (
    <section className="fd-requests">
      <div className="fd-requests-head">
        <h2 className="fd-requests-title">Requests</h2>
        <button type="button" className="fd-refresh" onClick={onRefresh} disabled={requests === null}>
          ⟳ Refresh
        </button>
      </div>

      {error && <div className="fd-error">⚠ {error}</div>}

      {requests === null && !error && (
        <div className="fd-loading">Loading requests…</div>
      )}

      {requests && (
        <>
          <div className="fd-chips">
            {REQUEST_STATUS_FILTERS.map(s => (
              <button
                key={s.id}
                type="button"
                className={`fd-chip${filter === s.id ? ' fd-chip-on' : ''}`}
                onClick={() => handleFilterClick(s.id)}
              >
                {s.label} <span className="fd-chip-count">{counts[s.id] ?? 0}</span>
              </button>
            ))}
          </div>

          {filter === 'in-progress' && (
            <div className="fd-subtabs">
              {REQUEST_PRIORITY_FILTERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`fd-subtab${priorityFilter === p.id ? ' fd-subtab-on' : ''}`}
                  onClick={() => setPriorityFilter(p.id)}
                >
                  {p.label} <span className="fd-chip-count">{inProgressPriorityCounts[p.id] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="fd-empty">No requests in this view.</div>
          ) : (
            <div className="fd-requests-list">
              {filtered.map(r => {
                const statusMeta = REQUEST_STATUS_META[r.status] || REQUEST_STATUS_META.new;
                const priorityMeta = REQUEST_PRIORITY_META[r.priority] || REQUEST_PRIORITY_META.medium;
                const typeLabel = REQUEST_TYPE_BY_ID[r.type]?.label || r.type;
                const created = r.createdAt?.toDate ? r.createdAt.toDate() : null;
                const dueDate = r.dueDate ? new Date(`${r.dueDate}T00:00:00`) : null;
                const founderDueDate = r.founderDueDate ? new Date(`${r.founderDueDate}T00:00:00`) : null;
                const busy = busyId === r.id;
                return (
                  <div key={r.id} className="fd-request-card">
                    <div className="fd-request-head">
                      <div>
                        <div className="fd-request-title">{r.title}</div>
                        <div className="fd-request-meta">
                          {typeLabel} · {r.senderName}
                          {r.senderEmail ? ` (${r.senderEmail})` : ''}
                          {created ? ` · ${formatDistanceToNow(created, { addSuffix: true })}` : ''}
                        </div>
                        <div className="fd-due-row">
                          {dueDate && <span className="fd-due-user">Due {format(dueDate, 'MMM d, yyyy')}</span>}
                          <label className="fd-due-founder-label">
                            {founderDueDate ? 'Founder due' : '+ Founder due date'}
                            <input
                              className="fd-due-input"
                              type="date"
                              value={r.founderDueDate || ''}
                              onChange={(e) => handleFounderDueDate(r.id, e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="fd-request-badges">
                        {r.twoWayStatus === 'requested' && (
                          <span className="fd-request-status fd-twoway-requested">Two-way requested</span>
                        )}
                        {r.twoWayStatus === 'accepted' && (
                          <span className="fd-request-status fd-twoway-accepted">Two-way chat</span>
                        )}
                        <span
                          className="fd-request-status"
                          style={{ color: priorityMeta.color, background: priorityMeta.bg, borderColor: priorityMeta.border }}
                        >
                          {priorityMeta.label}
                        </span>
                        <span
                          className="fd-request-status"
                          style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>

                    {r.description && <p className="fd-request-desc">{r.description}</p>}

                    <div className="fd-request-actions">
                      {REQUEST_STATUSES.filter(s => s.id !== r.status).map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className="fd-mini-btn"
                          disabled={busy}
                          onClick={() => handleStatus(r.id, s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="fd-mini-btn"
                        onClick={() => setChatRequestId(r.id)}
                      >
                        💬 Message
                      </button>
                      <button
                        type="button"
                        className="fd-mini-btn fd-mini-btn-danger"
                        disabled={busy}
                        onClick={() => handleDelete(r.id)}
                      >
                        Dismiss
                      </button>
                    </div>

                    <div className="fd-request-actions fd-request-priority-actions">
                      <span className="fd-request-priority-label">Priority:</span>
                      {REQUEST_PRIORITIES.filter(p => p.id !== (r.priority || 'medium')).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className="fd-mini-btn"
                          disabled={busy}
                          onClick={() => handlePriority(r.id, p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {chatRequest && (
        <RequestChatModal
          request={chatRequest}
          onClose={() => setChatRequestId(null)}
          onTwoWayChange={(id, status) => onChange(prev => (prev || []).map(r => (r.id === id ? { ...r, twoWayStatus: status } : r)))}
        />
      )}
    </section>
  );
}

export default function FounderDashboard() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');
  const [sort, setSort] = useState({ key: 'totalItems', dir: 'desc' });
  const [selectedUid, setSelectedUid] = useState(null);
  const [usersView, setUsersView] = useState('overview');

  const [requests, setRequests] = useState(null);
  const [requestsError, setRequestsError] = useState(null);
  const openRequestCount = useMemo(
    () => (requests || []).filter(r => r.status === 'new').length,
    [requests]
  );

  /* Chat Log — loaded lazily (not on mount) since it means reading every
     message in every public channel; only worth the cost once the founder
     actually opens the Chat Log tab or a user's detail page. */
  const [chatLog, setChatLog] = useState(null);
  const [chatLogError, setChatLogError] = useState(null);

  /* Journal Insights — also lazy-loaded, since it means reading every
     user's full journal-entries array (metadata only). */
  const [journalInsights, setJournalInsights] = useState(null);
  const [journalInsightsError, setJournalInsightsError] = useState(null);

  /* Prayer Insights — same lazy-load pattern, reading every user's
     full prayer-requests array (metadata only). */
  const [prayerInsights, setPrayerInsights] = useState(null);
  const [prayerInsightsError, setPrayerInsightsError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const stats = await loadFounderStats();
      setUsers(stats);
    } catch (e) {
      setError(e?.message || 'Failed to load users.');
      setUsers([]);
    }
  };

  const loadRequests = async () => {
    setRequestsError(null);
    try {
      const rows = await listFounderRequests();
      setRequests(rows);
    } catch (e) {
      setRequestsError(e?.message || 'Failed to load requests.');
      setRequests([]);
    }
  };

  const loadChatLog = async () => {
    setChatLogError(null);
    setChatLog(null);
    try {
      const log = await loadPublicChatLog();
      setChatLog(log);
    } catch (e) {
      setChatLogError(e?.message || 'Failed to load chat history.');
      setChatLog({ channels: [], messages: [] });
    }
  };

  const ensureChatLogLoaded = () => {
    if (chatLog === null && chatLogError === null) loadChatLog();
  };

  const loadJournalInsightsData = async () => {
    setJournalInsightsError(null);
    setJournalInsights(null);
    try {
      const rows = await loadJournalInsights((users || []).map(u => u.uid));
      setJournalInsights(rows);
    } catch (e) {
      setJournalInsightsError(e?.message || 'Failed to load journal insights.');
      setJournalInsights([]);
    }
  };

  const ensureJournalInsightsLoaded = () => {
    if (journalInsights === null && journalInsightsError === null) loadJournalInsightsData();
  };

  const loadPrayerInsightsData = async () => {
    setPrayerInsightsError(null);
    setPrayerInsights(null);
    try {
      const rows = await loadPrayerInsights((users || []).map(u => u.uid));
      setPrayerInsights(rows);
    } catch (e) {
      setPrayerInsightsError(e?.message || 'Failed to load prayer insights.');
      setPrayerInsights([]);
    }
  };

  const ensurePrayerInsightsLoaded = () => {
    if (prayerInsights === null && prayerInsightsError === null) loadPrayerInsightsData();
  };

  useEffect(() => { load(); loadRequests(); }, []);

  /* Enrich every user once with parsed dates + risk/power-user flags,
     computed against the whole (unfiltered) userbase so classification
     doesn't shift as search/segment filters change. */
  const enriched = useMemo(() => {
    if (!users) return [];
    const withDates = users.map(u => ({
      ...u,
      _createdAt: toDate(u.createdAt),
      _lastActiveAt: toDate(u.lastActiveAt),
    }));
    const totals = withDates.map(u => u.totalItems).sort((a, b) => b - a);
    const powerThreshold = totals.length ? totals[Math.max(0, Math.ceil(totals.length * 0.1) - 1)] : Infinity;

    return withDates.map(u => {
      const ageDays = u._createdAt ? differenceInCalendarDays(new Date(), u._createdAt) : 0;
      return {
        ...u,
        _isAtRisk: ageDays >= RISK_AGE_DAYS && u.totalItems <= RISK_MAX_ITEMS,
        _isPowerUser: u.totalItems > 0 && u.totalItems >= powerThreshold,
      };
    });
  }, [users]);

  const summary = useMemo(() => {
    if (!enriched.length && users === null) return null;
    if (!users) return null;
    const now = new Date();
    const weekAgo = subDays(now, 7);
    const monthAgo = subDays(now, 30);
    const totalItems = enriched.reduce((sum, u) => sum + u.totalItems, 0);
    const activeThisWeek = enriched.filter(u => u._lastActiveAt && isAfter(u._lastActiveAt, weekAgo)).length;
    const newThisMonth = enriched.filter(u => u._createdAt && isAfter(u._createdAt, monthAgo)).length;
    return {
      totalUsers: enriched.length,
      totalItems,
      activeThisWeek,
      newThisMonth,
    };
  }, [enriched, users]);

  const weeklySignups = useMemo(() => buildWeeklySignups(enriched), [enriched]);
  const maxWeekly = Math.max(1, ...weeklySignups.map(b => b.count));

  const segmentCounts = useMemo(() => {
    const now = new Date();
    const weekAgo = subDays(now, 7);
    const counts = { all: enriched.length, 'new-week': 0, 'inactive-30': 0, power: 0, 'at-risk': 0 };
    enriched.forEach(u => {
      if (u._createdAt && isAfter(u._createdAt, weekAgo)) counts['new-week'] += 1;
      if (!u._lastActiveAt || differenceInCalendarDays(now, u._lastActiveAt) >= 30) counts['inactive-30'] += 1;
      if (u._isPowerUser) counts.power += 1;
      if (u._isAtRisk) counts['at-risk'] += 1;
    });
    return counts;
  }, [enriched]);

  const sorted = useMemo(() => {
    const now = new Date();
    const weekAgo = subDays(now, 7);
    let filtered = enriched;
    if (segment === 'new-week') filtered = filtered.filter(u => u._createdAt && isAfter(u._createdAt, weekAgo));
    else if (segment === 'inactive-30') filtered = filtered.filter(u => !u._lastActiveAt || differenceInCalendarDays(now, u._lastActiveAt) >= 30);
    else if (segment === 'power') filtered = filtered.filter(u => u._isPowerUser);
    else if (segment === 'at-risk') filtered = filtered.filter(u => u._isAtRisk);

    const needle = query.trim().toLowerCase();
    if (needle) {
      filtered = filtered.filter(u =>
        (u.displayName || '').toLowerCase().includes(needle)
        || (u.email || '').toLowerCase().includes(needle));
    }

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av, bv;
      switch (sort.key) {
        case 'name':      av = (a.displayName || '').toLowerCase(); bv = (b.displayName || '').toLowerCase(); break;
        case 'createdAt': av = a._createdAt?.getTime() || 0; bv = b._createdAt?.getTime() || 0; break;
        case 'lastActive':av = a._lastActiveAt?.getTime() || 0; bv = b._lastActiveAt?.getTime() || 0; break;
        default:          av = a.totalItems; bv = b.totalItems;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [enriched, query, segment, sort]);

  const toggleSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'desc' });
  };

  const selectedUser = selectedUid ? enriched.find(u => u.uid === selectedUid) : null;

  const handleAccountDeleted = (uid) => {
    setUsers(prev => (prev || []).filter(u => u.uid !== uid));
    setSelectedUid(null);
  };

  return (
    <div className="fd-picture-frame">
    <div className="fd-root">
      <div className="fd-bloom fd-bloom-a" aria-hidden="true" />
      <div className="fd-bloom fd-bloom-b" aria-hidden="true" />
      <div className="fd-body">
        <header className="fd-header">
          <div>
            <h1 className="fd-title">Founder Dashboard</h1>
            <p className="fd-subtitle">Every registered account, at a glance.</p>
          </div>
          <button type="button" className="fd-refresh" onClick={load} disabled={users === null}>
            ⟳ Refresh
          </button>
        </header>

        <div className="fd-tabs">
          <button
            type="button"
            className={`fd-tab${activeTab === 'users' ? ' fd-tab-on' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            type="button"
            className={`fd-tab${activeTab === 'requests' ? ' fd-tab-on' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Requests
            {openRequestCount > 0 && <span className="fd-tab-badge">{openRequestCount}</span>}
          </button>
        </div>

        {activeTab === 'requests' && (
          <RequestsPanel
            requests={requests}
            error={requestsError}
            onRefresh={loadRequests}
            onChange={setRequests}
          />
        )}

        {activeTab === 'users' && selectedUser && (
          <UserDetailPage
            user={selectedUser}
            chatLog={chatLog}
            chatLogError={chatLogError}
            onLoadChatLog={loadChatLog}
            onBack={() => setSelectedUid(null)}
            onDeleted={handleAccountDeleted}
          />
        )}

        {activeTab === 'users' && !selectedUser && error && <div className="fd-error">⚠ {error}</div>}

        {activeTab === 'users' && !selectedUser && users === null && !error && (
          <div className="fd-loading">Loading users…</div>
        )}

        {activeTab === 'users' && !selectedUser && users && (
          <div className="fd-chips">
            {USER_VIEWS.map(v => (
              <button
                key={v.id}
                type="button"
                className={`fd-chip${usersView === v.id ? ' fd-chip-on' : ''}`}
                onClick={() => {
                  setUsersView(v.id);
                  if (v.id === 'chat') ensureChatLogLoaded();
                  if (v.id === 'journalEntries') ensureJournalInsightsLoaded();
                  if (v.id === 'prayers') ensurePrayerInsightsLoaded();
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'journalEntries' && (
          <JournalInsightsPanel
            insights={journalInsights}
            error={journalInsightsError}
            onRefresh={loadJournalInsightsData}
            users={enriched}
          />
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'prayers' && (
          <PrayerInsightsPanel
            insights={prayerInsights}
            error={prayerInsightsError}
            onRefresh={loadPrayerInsightsData}
            users={enriched}
            onSelectUser={(uid) => { setSelectedUid(uid); ensureChatLogLoaded(); }}
          />
        )}

        {activeTab === 'users' && !selectedUser && usersView !== 'overview' && usersView !== 'chat' && usersView !== 'journalEntries' && usersView !== 'prayers' && users && (
          <CategoryDashboard
            category={COUNTER_META.find(c => c.id === usersView)}
            users={enriched}
            onSelectUser={(uid) => { setSelectedUid(uid); ensureChatLogLoaded(); }}
          />
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'chat' && (
          <ChatLogPanel
            chatLog={chatLog}
            error={chatLogError}
            onRefresh={loadChatLog}
          />
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'overview' && summary && (
          <div className="fd-cards">
            <div className="fd-card">
              <div className="fd-card-value">{summary.totalUsers}</div>
              <div className="fd-card-label">Total Users</div>
            </div>
            <div className="fd-card">
              <div className="fd-card-value">{summary.totalItems}</div>
              <div className="fd-card-label">Total Content Items</div>
            </div>
            <div className="fd-card">
              <div className="fd-card-value">{summary.activeThisWeek}</div>
              <div className="fd-card-label">Active This Week</div>
            </div>
            <div className="fd-card">
              <div className="fd-card-value">{summary.newThisMonth}</div>
              <div className="fd-card-label">New This Month</div>
            </div>
          </div>
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'overview' && users && users.length > 0 && (
          <div className="fd-chart-card">
            <div className="fd-chart-title">Signups — last 12 weeks</div>
            <div className="fd-chart">
              {weeklySignups.map((b, i) => (
                <div key={i} className="fd-chart-col" title={`${format(b.start, 'MMM d')}: ${b.count} signup${b.count === 1 ? '' : 's'}`}>
                  <div className="fd-chart-bar-track">
                    <div className="fd-chart-bar" style={{ height: `${(b.count / maxWeekly) * 100}%` }} />
                  </div>
                  <div className="fd-chart-count">{b.count}</div>
                  <div className="fd-chart-label">{format(b.start, 'MMM d')}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && !selectedUser && usersView === 'overview' && users && (
          <>
            <div className="fd-chips">
              {SEGMENTS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`fd-chip${segment === s.id ? ' fd-chip-on' : ''}`}
                  onClick={() => setSegment(s.id)}
                >
                  {s.label} <span className="fd-chip-count">{segmentCounts[s.id] ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="fd-toolbar">
              <input
                className="fd-search"
                type="text"
                placeholder="Search by name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="fd-export"
                onClick={() => downloadCsv(sorted)}
                disabled={sorted.length === 0}
              >
                ⬇ Export CSV
              </button>
            </div>

            {sorted.length === 0 ? (
              <div className="fd-empty">No users match this view.</div>
            ) : (
              <div className="fd-table-wrap">
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th className="fd-th-sortable" onClick={() => toggleSort('name')}>
                        User <SortIcon active={sort.key === 'name'} dir={sort.dir} />
                      </th>
                      <th className="fd-th-sortable" onClick={() => toggleSort('createdAt')}>
                        Joined <SortIcon active={sort.key === 'createdAt'} dir={sort.dir} />
                      </th>
                      <th className="fd-th-sortable" onClick={() => toggleSort('lastActive')}>
                        Last Active <SortIcon active={sort.key === 'lastActive'} dir={sort.dir} />
                      </th>
                      {COUNTER_META.map(c => (
                        <th key={c.id} className="fd-th-count" title={c.label}>{c.label}</th>
                      ))}
                      <th className="fd-th-sortable fd-th-count" onClick={() => toggleSort('totalItems')}>
                        Total <SortIcon active={sort.key === 'totalItems'} dir={sort.dir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(u => (
                      <tr key={u.uid} className="fd-row-clickable" onClick={() => { setSelectedUid(u.uid); ensureChatLogLoaded(); }}>
                        <td>
                          <div className="fd-user-name">{u.displayName}</div>
                          <div className="fd-user-email">{u.email}</div>
                          {(u._isAtRisk || u._isPowerUser) && (
                            <div className="fd-row-badges">
                              {u._isAtRisk && <span className="fd-badge fd-badge-risk">⚠ At risk</span>}
                              {u._isPowerUser && <span className="fd-badge fd-badge-power">⭐ Power user</span>}
                            </div>
                          )}
                        </td>
                        <td className="fd-cell-date">
                          {u._createdAt ? format(u._createdAt, 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="fd-cell-date">
                          {u._lastActiveAt ? formatDistanceToNow(u._lastActiveAt, { addSuffix: true }) : '—'}
                        </td>
                        {COUNTER_META.map(c => (
                          <td key={c.id} className="fd-th-count">{u.counts[c.id] ?? 0}</td>
                        ))}
                        <td className="fd-th-count fd-cell-total">{u.totalItems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}
