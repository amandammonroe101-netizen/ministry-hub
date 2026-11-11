import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, isToday,
  addDays, addYears, isBefore, differenceInDays, startOfDay,
} from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import { calendarService } from '../../services/calendarService';
import { friendsService }  from '../../services/friendsService';
import { prayerService }   from '../../services/prayerService';
import { useUserStoreKey } from '../../lib/userStore';
import { NAV_VISIBILITY_STORAGE_KEY, isCategoryVisible } from '../settings/navVisibilityConfig';
import { usePendingScheduleRequests } from '../../lib/scheduleRequests';
import { useDueReminders, useDismissReminder, reminderLabel } from '../../lib/reminders';
import { db } from '../../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import calendarGuideDocxUrl from '../../assets/calendar-how-to-guide.docx?url';
import './Calendar.css';

/* ─────────────────────────────────────────────────────────────
   Event types — each has a color, emoji, label, and source.
   ───────────────────────────────────────────────────────────── */
/* Ministry color palette. Each Ministry section in the sidebar
   maps to ONE color, and every page under it shares that color so
   the calendar grid visually unifies by ministry. The emoji per
   page is still distinct so individual pages remain identifiable. */
const MINISTRY_COLOR = {
  youth:    '#fb7185', // rose
  children: '#fbbf24', // amber  (matches childrensConfig.CHILDRENS_ACCENT)
  worship:  '#818cf8', // indigo
  web:      '#0ea5e9', // sky
  personal: '#22c55e', // green
  friends:  '#f472b6', // pink
  womens:   '#e11d48', // rose-red — matches Women's Ministry accent
  other:    '#a78bfa', // violet
  planner:  '#f59e0b', // amber-orange — matches Day Planner accent
  hospitality: '#a8502e', // terracotta — matches Hospitality Ministry's coffeehouse accent
};

const EVENT_TYPES = {
  custom:           { label: 'Custom event',        emoji: '⭐', color: MINISTRY_COLOR.other },
  /* Friends */
  birthday:         { label: 'Birthday',            emoji: '🎂', color: MINISTRY_COLOR.friends },
  reach_out:        { label: 'Reach-out due',       emoji: '⚡', color: MINISTRY_COLOR.friends },
  friend_event:     { label: 'Friend event',        emoji: '📅', color: MINISTRY_COLOR.friends },
  /* Personal */
  prayer:           { label: 'Daily prayer',        emoji: '🙏', color: MINISTRY_COLOR.personal },
  /* Synced from Page Settings → Reminders → Sync to Calendar on the
     Prayers page. Without an entry here, events created with
     source='prayer-reminder' would fall through to the generic
     'custom' bucket and read as orphans on the calendar grid. */
  prayer_reminder:  { label: 'Prayer reminder',     emoji: '🙏', color: MINISTRY_COLOR.personal },
  journal:          { label: 'Journal entry',       emoji: '📖', color: MINISTRY_COLOR.personal },
  journal_reminder: { label: 'Journal reminder',    emoji: '🔔', color: MINISTRY_COLOR.personal },
  memory_verse:     { label: 'Memory verse review', emoji: '📝', color: MINISTRY_COLOR.personal },
  /* Worship Ministry (was Band/Music + Admin, now unified) */
  meeting:          { label: 'Meeting',             emoji: '🗣', color: MINISTRY_COLOR.worship },
  service:          { label: 'Service (Band/Team)', emoji: '🗓', color: MINISTRY_COLOR.worship },
  recording_session:{ label: 'Recording session',   emoji: '🎙', color: MINISTRY_COLOR.worship },
  /* Web Ministry (was Website + Blog, now unified) */
  page_review:      { label: 'Page review due',     emoji: '📋', color: MINISTRY_COLOR.web },
  form_review:      { label: 'Form review due',     emoji: '📥', color: MINISTRY_COLOR.web },
  tech_renewal:     { label: 'Tech renewal',        emoji: '🔔', color: MINISTRY_COLOR.web },
  hosting_alert:    { label: 'Hosting / domain',    emoji: '🌐', color: MINISTRY_COLOR.web },
  blog_idea:        { label: 'Blog idea (target)',  emoji: '💡', color: MINISTRY_COLOR.web },
  blog_post:        { label: 'Blog post',           emoji: '📰', color: MINISTRY_COLOR.web },
  blog_series:      { label: 'Blog series',         emoji: '🏷', color: MINISTRY_COLOR.web },
  /* Youth Ministry — every page shares the rose ministry color */
  youth_weekly_night: { label: 'Weekly Nights',    emoji: '🌙', color: MINISTRY_COLOR.youth },
  youth_trip:         { label: 'Trips & Retreats', emoji: '🧳', color: MINISTRY_COLOR.youth },
  youth_outreach:     { label: 'Outreach',         emoji: '🤝', color: MINISTRY_COLOR.youth },
  youth_bible_study:  { label: 'Bible Studies',    emoji: '📚', color: MINISTRY_COLOR.youth },
  youth_lesson:       { label: 'Lessons & Series', emoji: '✍️', color: MINISTRY_COLOR.youth },
  youth_leader:       { label: 'Leaders',          emoji: '🧑‍🏫', color: MINISTRY_COLOR.youth },
  /* Children's Ministry — every page shares the amber ministry color */
  children_kid:       { label: 'Kid birthdays',    emoji: '🎂', color: MINISTRY_COLOR.children },
  children_sunday:    { label: 'Sunday Mornings',  emoji: '☀', color: MINISTRY_COLOR.children },
  children_midweek:   { label: 'Midweek / Clubs',  emoji: '🌙', color: MINISTRY_COLOR.children },
  children_special:   { label: 'VBS & Special Events', emoji: '🎪', color: MINISTRY_COLOR.children },
  /* Women's Ministry — every page shares the rose-red ministry color */
  women_birthday:      { label: 'Birthdays',        emoji: '🎂', color: MINISTRY_COLOR.womens },
  women_communication: { label: 'Follow-ups',       emoji: '💌', color: MINISTRY_COLOR.womens },
  /* Brunches & Teas — a pending invite to a directory woman, popped
     onto the calendar on the day she was invited. Stays on the grid
     (as an actionable card, see DayEventCard) until Accepted/Declined
     from here, which writes the RSVP back to womens:brunches and
     removes this popup. */
  women_invite:        { label: 'Gathering invite',  emoji: '💌', color: MINISTRY_COLOR.womens },
  /* Day Planner — a single per-day "Day Is Planned" marker the user
     pushes from the /day-planner page via Sync. Individual blocks are
     NOT put on the calendar; only this one marker per planned day. */
  day_planned:        { label: 'Day Is Planned',    emoji: '🗓', color: MINISTRY_COLOR.planner },
  /* Hospitality Ministry — synced from a host's Care & follow-up
     section on the All Hosts page (opt-in per host, see
     syncBirthdayToCalendar in AllHosts.jsx). */
  hospitality_birthday: { label: 'Host birthdays', emoji: '🎂', color: MINISTRY_COLOR.hospitality },
};

/* Calendar-events with one of these `source` strings get bucketed
   into their corresponding filter type. Events without a matching
   source fall through to the generic 'custom' bucket. */
const SOURCE_TO_TYPE = {
  'youth-weekly-night': 'youth_weekly_night',
  'youth-trip':         'youth_trip',
  'youth-outreach':     'youth_outreach',
  'youth-bible-study':  'youth_bible_study',
  'youth-lesson':       'youth_lesson',
  'youth-leader':       'youth_leader',
  'children-kid':       'children_kid',
  'children-sunday':    'children_sunday',
  'children-midweek':   'children_midweek',
  'children-special':   'children_special',
  'women-birthday':      'women_birthday',
  'women-communication': 'women_communication',
  'women-brunch-invite': 'women_invite',
  'memory-verse':       'memory_verse',
  'journal-reminder':   'journal_reminder',
  'journal-entry':      'journal',
  /* Prayer-page reminder sync — see PrayerPageSettings.commitReminders.
     Without this entry the events get bucketed as 'custom' and never
     show up under the Prayers filter group. */
  'prayer-reminder':    'prayer_reminder',
  'hospitality-birthday': 'hospitality_birthday',
};

/* Sidebar grouping — each group is a NAMED MINISTRY (not a category)
   with a master toggle and a shared color theme. The pages under each
   ministry are always visible (no collapse). Adjacent older categories
   that belonged to the same ministry are merged: Worship Ministry rolls
   up Band/Music + Admin; Web Ministry rolls up Website + Blog. */
const FILTER_GROUPS = [
  {
    id: 'youth',
    label: 'Youth Ministry',
    icon: '🧑‍🤝‍🧑',
    color: MINISTRY_COLOR.youth,
    keys: ['youth_weekly_night', 'youth_trip', 'youth_outreach', 'youth_bible_study', 'youth_lesson', 'youth_leader'],
  },
  {
    id: 'children',
    label: "Children's Ministry",
    icon: '🧸',
    color: MINISTRY_COLOR.children,
    keys: ['children_kid', 'children_sunday', 'children_midweek', 'children_special'],
  },
  {
    id: 'womens',
    label: "Women's Ministry",
    icon: '🌸',
    color: MINISTRY_COLOR.womens,
    keys: ['women_birthday', 'women_communication', 'women_invite'],
  },
  {
    id: 'worship',
    label: 'Worship Ministry',
    icon: '🎵',
    color: MINISTRY_COLOR.worship,
    keys: ['service', 'recording_session', 'meeting'],
  },
  {
    id: 'web',
    label: 'Web Ministry',
    icon: '🌐',
    color: MINISTRY_COLOR.web,
    keys: ['page_review', 'form_review', 'tech_renewal', 'hosting_alert', 'blog_idea', 'blog_post', 'blog_series'],
  },
  {
    /* Dedicated group for every Journal-page item — journal entries
       (legacy events from the old auto-sync integration), reminders
       the user explicitly synced, and memory-verse review days. */
    id: 'journal',
    label: 'Journal',
    icon: '📖',
    color: MINISTRY_COLOR.personal,
    keys: ['journal', 'journal_reminder', 'memory_verse'],
  },
  {
    /* Dedicated group for Prayers-page items — the per-day "daily
       prayer" indicator AND user-synced prayer reminders from
       Page Settings → Reminders → Sync to Calendar. */
    id: 'prayers',
    label: 'Prayers',
    icon: '🙏',
    color: MINISTRY_COLOR.personal,
    /* 'prayer' (everyday daily-prayer marker) retired — daily prayers
       live in the Prayers Dashboard's Today's Focus, not the calendar.
       Only user-synced prayer reminders remain. */
    keys: ['prayer_reminder'],
  },
  {
    /* Day Planner — time blocks the user scheduled + the per-day
       summary the planner pushes for any day with a plan. */
    id: 'planner',
    label: 'Day Planner',
    icon: '🗓',
    color: MINISTRY_COLOR.planner,
    keys: ['day_planned'],
  },
  {
    id: 'friends',
    label: 'Friends',
    icon: '👋',
    color: MINISTRY_COLOR.friends,
    keys: ['birthday', 'reach_out', 'friend_event'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality Ministry',
    icon: '🤗',
    color: MINISTRY_COLOR.hospitality,
    keys: ['hospitality_birthday'],
  },
  {
    id: 'other',
    label: 'Other',
    icon: '⭐',
    color: MINISTRY_COLOR.other,
    keys: ['custom'],
  },
];

/* Maps each sidebar filter group to the Settings → Visible Categories
   ids that govern it. A group only appears when at least one of its
   categories is enabled in Settings. The merged 'web' group spans two
   nav categories (Website + Blog), so it shows if either is on. Groups
   with no entry here (e.g. 'other' for custom events) are always shown. */
const GROUP_TO_NAV_CATEGORIES = {
  youth:    ['youth'],
  children: ['childrens'],
  womens:   ['womens'],
  worship:  ['worship'],
  web:      ['website', 'blog'],
  journal:  ['journal'],
  prayers:  ['prayers'],
  planner:  ['day-planner'],
  friends:  ['friends'],
  hospitality: ['hospitality'],
};

/* Per-kind icons for the three hosting dates so each shows distinctly. */
const HOSTING_KIND_EMOJI = {
  domain:  '🔗',
  hosting: '🖥',
  ssl:     '🔒',
};

/* Review-frequency → interval in days for Page Audit. */
const REVIEW_FREQUENCY_DAYS = {
  monthly:  30,
  quarterly: 90,
  biannual: 180,
  yearly:   365,
};

/* Icon for each meeting type (matches the Meetings page chip icons). */
const MEETING_TYPE_EMOJI = {
  team:        '🎵',
  planning:    '📋',
  'one-on-one':'👥',
  vision:      '🎯',
  rehearsal:   '🎼',
  other:       '🗣',
};

/* Generic localStorage JSON-array reader. */
const loadJsonArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};

const loadMeetingsFromStorage  = () => loadJsonArray('admin:meetings');
const loadServicesFromStorage  = () => loadJsonArray('band:schedule');
const loadRecSchedFromStorage  = () => loadJsonArray('recording:schedule');
const loadPageAuditFromStorage = () => loadJsonArray('web:page-audit');
const loadFormsFromStorage     = () => loadJsonArray('web:forms');
const loadTechStackFromStorage = () => loadJsonArray('web:tech-stack');
const loadBlogIdeasFromStorage  = () => loadJsonArray('blog:ideas');
const loadBlogPostsFromStorage  = () => loadJsonArray('blog:posts');
const loadBlogSeriesFromStorage = () => loadJsonArray('blog:series');

/* Hosting & Domain stores a SINGLE object (not an array). */
const loadHostingFromStorage = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('web:hosting') || 'null');
    return (raw && typeof raw === 'object') ? raw : null;
  } catch { return null; }
};

/* Compute the next-review date for a Page Audit entry. Returns 'YYYY-MM-DD'
   or null if the entry has no review schedule. */
const computePageReviewDate = (page) => {
  if (!page) return null;
  const freq = page.reviewFrequency;
  if (!freq || freq === 'never') return null;
  const days = REVIEW_FREQUENCY_DAYS[freq];
  if (!days) return null;
  const base = page.lastReviewed
    ? new Date(page.lastReviewed + 'T00:00:00')
    : page.createdAt
      ? new Date(page.createdAt)
      : new Date();
  if (isNaN(base.getTime())) return null;
  const due = new Date(base);
  due.setDate(due.getDate() + days);
  return format(due, 'yyyy-MM-dd');
};

const COLOR_OPTIONS = ['#a78bfa','#f472b6','#fbbf24','#60a5fa','#2dd4bf','#fb7185','#6ee7b7','#fcd34d'];

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const EMPTY_FORM = {
  title: '', description: '', event_date: '', event_time: '', color: '#a78bfa',
};

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Calendar() {
  const navigate = useNavigate();
  const [cursor, setCursor]                       = useState(new Date());
  const [view, setView]                           = useState('month'); // month | week
  const [selectedDate, setSelectedDate]           = useState(new Date());
  const [showForm, setShowForm]                   = useState(false);
  const [form, setForm]                           = useState(EMPTY_FORM);
  const [showProfile, setShowProfile]             = useState(false);
  const { avatarSourceName, initials }            = useProfileTopbar();

  /* customEvents is the array at `calendar-events` in Firestore.
     Live-subscribed via useUserStoreKey so that ANY page pushing
     events (Lessons schedules, Leader renewals, Kid birthdays,
     etc.) shows up on the grid without a manual refetch. The old
     calendarService.getAll() one-time read missed late writes —
     this fixes that. */
  const [customEventsRaw] = useUserStoreKey('calendar-events', []);
  const customEvents = Array.isArray(customEventsRaw) ? customEventsRaw : [];
  /* Brunches & Teas invite popups (source 'women-brunch-invite') write
     their Accept/Decline decision straight back to this doc. */
  const [, setBrunchGatherings] = useUserStoreKey('womens:brunches', []);
  const [friends, setFriends]           = useState([]);
  const [prayers, setPrayers]           = useState([]);
  /* `journal` state was used to render a "N journal entries"
     indicator per day on the calendar. That feature is gone, so
     the state was removed too. */
  /* `reminders` state previously powered the auto-rendered journal
     reminders block. That block was removed — sync-to-calendar is
     opt-in via Page Settings, and synced reminders flow through
     customEvents. State + fetch dropped. */
  /* `habits` state + fetch removed — the Habits page is gone. */
  /* All four lists below now live in Firestore. */
  const [meetings]    = useUserStoreKey('admin:meetings',      []);
  const [recSessions] = useUserStoreKey('recording:schedule',  []);
  /* Migrated to Firestore via useUserStoreKey — live-synced per user. */
  const [services]    = useUserStoreKey('band:schedule',    []);
  const [pageAudit]   = useUserStoreKey('web:page-audit',   []);
  const [siteForms]   = useUserStoreKey('web:forms',        []);
  const [techStack]   = useUserStoreKey('web:tech-stack',   []);
  const [hostingDoc]  = useUserStoreKey('web:hosting',      null);
  /* Blog data now lives in Firestore (per-user, live-synced via onSnapshot). */
  const [blogIdeas]  = useUserStoreKey('blog:ideas',  []);
  const [blogPosts]  = useUserStoreKey('blog:posts',  []);
  const [blogSeries] = useUserStoreKey('blog:series', []);
  const [error, setError]               = useState(null);
  const [loading, setLoading]           = useState(true);

  /* Every filter starts OFF on first visit so the calendar opens
     visually clean. From there, the user's choices are remembered:
     useUserStoreKey persists the filters map to Firestore on every
     change and rehydrates it on the next mount. */
  const DEFAULT_FILTERS = {
    custom: false, birthday: false, reach_out: false, prayer: false, journal: false,
    friend_event: false, journal_reminder: false, memory_verse: false,
    /* Default ON so newly-synced prayer reminders from
       PrayerPageSettings show up immediately without the user having
       to hunt for a hidden filter. */
    prayer_reminder: true,
    meeting: false, service: false, recording_session: false,
    page_review: false, form_review: false, tech_renewal: false, hosting_alert: false,
    blog_idea: false, blog_post: false, blog_series: false,
    youth_weekly_night: false, youth_trip: false, youth_outreach: false,
    youth_bible_study: false, youth_lesson: false, youth_leader: false,
    children_kid: false, children_sunday: false,
    children_midweek: false, children_special: false,
    women_birthday: false, women_communication: false,
    /* Default ON — a pending gathering invite is actionable and
       time-sensitive, so it shouldn't hide behind a filter toggle. */
    women_invite: true,
    hospitality_birthday: false,
    /* Day Planner — the per-day "Day Is Planned" marker. On by default
       so a freshly-synced day shows its marker without hunting for a
       hidden filter. */
    day_planned: true,
  };
  const [filtersRaw, setFilters] = useUserStoreKey('calendar-filters', DEFAULT_FILTERS);
  /* Merge any new keys we add later on top of the user's saved set,
     so adding a new event type in the future doesn't crash older
     persisted filter docs that don't know about it. */
  const filters = { ...DEFAULT_FILTERS, ...(filtersRaw || {}) };

  /* Per-group collapse state. Every sidebar group starts COLLAPSED
     so the sidebar opens compact — the user expands the groups they
     want to see. Keyed by group.id; missing = closed. */
  const [groupOpen, setGroupOpen] = useState({});
  const toggleGroupOpen = (id) =>
    setGroupOpen(prev => ({ ...prev, [id]: !prev[id] }));

  /* Hide filter groups whose category is unchecked in Settings, so the
     sidebar mirrors the user's chosen sidebar categories. */
  const [navVisibilityRaw] = useUserStoreKey(NAV_VISIBILITY_STORAGE_KEY, {});
  const visibleFilterGroups = useMemo(() => {
    const nav = navVisibilityRaw || {};
    return FILTER_GROUPS.filter(group => {
      const cats = GROUP_TO_NAV_CATEGORIES[group.id];
      if (!cats) return true;
      return cats.some(catId => isCategoryVisible(nav, catId));
    });
  }, [navVisibilityRaw]);

  /* Listen for localStorage changes (other tabs) + window focus (same tab,
     navigation back from a page that just modified data). */
  useEffect(() => {
    /* Every external data source now streams via Firestore — nothing left
       to poll from localStorage. This effect is a no-op kept as a safety
       net in case a future page persists a non-migrated key. */
    const refresh = () => {};
    const watchedKeys = [];
    const onStorage = (e) => {
      if (!e.key) { refresh(); return; }
      if (watchedKeys.includes(e.key)) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const [leftCollapsed, setLeftCollapsed]   = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  /* Pending recording-session requests for the current user.
     Drives the bell icon in the topbar (red dot when count > 0)
     and the dropdown panel that shows each request. */
  const scheduleRequests = usePendingScheduleRequests();
  /* Due reminders are computed off the same calendar-events doc
     that the page already reads; the hook re-evaluates once a
     minute so reminders surface at the right time without a
     manual refresh. */
  const dueReminders     = useDueReminders();
  const dismissReminder  = useDismissReminder();
  const totalNotifs      = scheduleRequests.length + dueReminders.length;
  const [showNotifs, setShowNotifs] = useState(false);

  /* Dismiss a request — deletes it from /scheduleRequests (the
     Firestore rule already allows either side to delete). The
     subscription automatically drops it from `scheduleRequests`. */
  const dismissRequest = async (req) => {
    if (!req?.id || !db) return;
    try { await deleteDoc(doc(db, 'scheduleRequests', req.id)); }
    catch (e) { /* eslint-disable-next-line no-console */
      console.warn('[calendar] dismiss request failed:', e?.code || e?.message || e);
    }
  };

  /* "Accept" — does three things:
     1. Imports the session into the recipient's local recording
        schedule (Scheduling Rec. page).
     2. Creates a matching custom Calendar event so it shows up on
        the calendar grid the recipient is already looking at.
     3. Deletes the /scheduleRequests doc so the bell clears. */
  const acceptRequest = async (req) => {
    if (!req?.session) return;
    const s = req.session;
    /* 1) Import into the local Scheduling Rec. list (localStorage). */
    try {
      const raw = localStorage.getItem('recording:schedule');
      const list = raw ? JSON.parse(raw) : [];
      const newId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const imported = {
        ...s,
        id: newId,
        importedFromRequestId: req.id,
        importedFromUid:       req.senderUid,
        importedFromName:      req.senderName,
        status: 'scheduled',
      };
      localStorage.setItem('recording:schedule', JSON.stringify([imported, ...list]));
    } catch { /* best-effort */ }

    /* 2) Add to the calendar as a custom event so the date is
          visible on the grid. We tag it as a "rec" / amber-coloured
          event and include who it's with + the project so the
          calendar tooltip explains the context at a glance. */
    try {
      const titleBits = ['🎚', s.name || 'Recording session'];
      if (req.senderName) titleBits.push(`with ${req.senderName}`);
      const descBits = [];
      if (s.startTime)    descBits.push(`Start: ${s.startTime}`);
      if (s.duration)     descBits.push(`Duration: ${s.duration} min`);
      if (s.projectName)  descBits.push(`Project: ${s.projectName}`);
      if (s.notes)        descBits.push(s.notes);
      await calendarService.create({
        title:       titleBits.join(' '),
        description: descBits.join('\n'),
        event_date:  s.date || todayISO(),
        event_time:  s.startTime || '',
        color:       '#fb923c', // amber — distinct from default purple
      });
      /* The live useUserStoreKey subscription picks up the new
         event automatically — no manual refetch needed. */
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[calendar] could not add accepted session to calendar:', e?.message || e);
    }

    /* 3) Drop the request from /scheduleRequests so the bell clears. */
    await dismissRequest(req);
  };

  /* ── load data ───────────────────────────────────────────── */
  /* calendar-events is now live-subscribed (see customEventsRaw
     above) so it's no longer fetched here. fetchAll() still pulls
     the other one-shot lists (friends / prayers / journal entries /
     reminders / habits) once at mount. */
  useEffect(() => { fetchAll(); }, []);

  /* Live-subscribe to journal-reminders just so the mount sweep
     below can tell tracked vs. orphan journal-reminder events.
     Destructure `loading` so the sweep waits for Firestore to
     actually return — otherwise the default [] would convince us
     there are no synced reminders and we'd wipe legit events. */
  const [journalRemindersRaw, , { loading: journalRemindersLoading }]
    = useUserStoreKey('journal-reminders', []);

  /* Mount-time cleanup of journal-related calendar orphans:
       1) Legacy `source: 'journal-entry'` events from the deprecated
          auto-sync integration. We never create these anymore.
       2) `source: 'journal-reminder'` events not tracked by any
          currently-synced reminder's eventIds. Handles deleted
          reminders, toggled-off sync, and stragglers from earlier
          code paths.
     Mirrors the Journal page sweep so the cleanup happens whichever
     page the user visits first. Depends on the reminders subscription
     being warm so we know what's tracked. */
  const didSweepLegacyJournalRef = useRef(false);
  useEffect(() => {
    if (didSweepLegacyJournalRef.current) return;
    if (journalRemindersLoading) return;
    if (!Array.isArray(journalRemindersRaw)) return;
    didSweepLegacyJournalRef.current = true;
    (async () => {
      try {
        const all = (await calendarService.getAll())?.data?.data || [];

        const entryIds = all
          .filter(ev => ev.source === 'journal-entry')
          .map(ev => ev.id);

        const tracked = new Set();
        (journalRemindersRaw || []).forEach(r => {
          if (!r?.syncCalendar) return;
          (r.eventIds || []).forEach(id => tracked.add(id));
        });
        const orphanReminderIds = all
          .filter(ev => ev.source === 'journal-reminder' && !tracked.has(ev.id))
          .map(ev => ev.id);

        const toDelete = [...entryIds, ...orphanReminderIds];
        if (toDelete.length) await calendarService.bulkDelete(toDelete);
      } catch { /* noop */ }
    })();
  }, [journalRemindersRaw, journalRemindersLoading]);

  /* Same idea for prayer-reminder sync. The Prayers page materializes
     up to (7 days × 52 weeks) calendar events when "Sync to Calendar"
     is on, and tears them down by tracked eventIds. But schedule
     changes, a toggled-off sync, or older code paths can leave
     `source: 'prayer-reminder'` events behind — the "excess prayer
     reminders" cluttering the grid. Sweep them on mount: keep only the
     events the currently-enabled sync still tracks, delete the rest.
     prayer-reminders is a single settings object (not an array), so we
     read it directly and only treat its eventIds as tracked while sync
     is actually on. */
  const [prayerRemindersRaw, , { loading: prayerRemindersLoading }]
    = useUserStoreKey('prayer-reminders', null);
  const didSweepPrayerRef = useRef(false);
  useEffect(() => {
    if (didSweepPrayerRef.current) return;
    if (prayerRemindersLoading) return;
    didSweepPrayerRef.current = true;
    (async () => {
      try {
        const all = (await calendarService.getAll())?.data?.data || [];
        const tracked = new Set();
        const r = prayerRemindersRaw;
        if (r?.enabled && r?.syncCalendar) {
          (r.eventIds || []).forEach(id => tracked.add(id));
        }
        const orphanIds = all
          .filter(ev => ev.source === 'prayer-reminder' && !tracked.has(ev.id))
          .map(ev => ev.id);
        if (orphanIds.length) await calendarService.bulkDelete(orphanIds);
      } catch { /* noop */ }
    })();
  }, [prayerRemindersRaw, prayerRemindersLoading]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      /* journalService.getAll() + journalReminderService.getAll()
         were previously used to surface "N journal entries" and
         auto-rendered reminder events on the calendar. Both features
         were removed — journal entries don't auto-populate, and
         reminders are opt-in via Page Settings → Sync to Calendar
         (which flows through customEvents). */
      const [fr, pr] = await Promise.all([
        friendsService.getFriends(),
        prayerService.getAll(),
      ]);
      setFriends(fr.data.data);
      setPrayers(pr.data.data);
    } catch { setError('Could not load calendar data.'); }
    finally { setLoading(false); }
  };

  /* Days the user has pushed a plan for from the Day Planner. The
     "Sync" button writes one Calendar event per time block
     (source 'day-planner'); we mark any day that has at least one
     such block "Day Is Planned" on the grid. Computed straight from
     customEvents so it's independent of the Day Planner filters. */
  const plannedDays = useMemo(() => {
    const s = new Set();
    if (!filters.day_planned) return s;   // honor the Day Planner filter
    customEvents.forEach(e => {
      if (
        e.source === 'day-planner' &&
        String(e.source_id || '').startsWith('planned-') &&
        e.event_date
      ) s.add(e.event_date);
    });
    return s;
  }, [customEvents, filters.day_planned]);

  /* ── build aggregated events for a date range ────────────── */
  const eventsByDay = useMemo(() => {
    // map "YYYY-MM-DD" -> [{ id, type, title, color, emoji, ... }]
    const map = {};
    const push = (key, ev) => {
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    };

    // 1. Custom events — including auto-pushed events from youth pages.
    //    Each event is dispatched to a type based on its `source` so
    //    the sidebar can toggle each ministry source independently.
    //    Events without a recognized source fall through to 'custom'.
    customEvents.forEach(e => {
      /* Day Planner events never render as individual chips on the
         grid — a synced day is shown by the "Day Is Planned" pill
         instead (see plannedDays). Skip them here entirely. */
      if (e.source === 'day-planner') return;
      const type = SOURCE_TO_TYPE[e.source] || 'custom';
      if (!filters[type]) return;
      const typeDef = EVENT_TYPES[type] || EVENT_TYPES.custom;
      /* For auto-pushed events (source is recognized) we ALWAYS use
         the ministry color so every Worship/Youth/Web page visually
         unifies on the grid — even if the source page pushed its
         own stored color. Manual custom events still honor the
         user-picked color so the New Event form stays meaningful. */
      const color = type === 'custom' ? (e.color || typeDef.color) : typeDef.color;
      const base = {
        type,
        title: e.title,
        description: e.description,
        color,
        emoji: typeDef.emoji,
        time: e.event_time,
        sourceId: e.id,
        /* Preserve the underlying source + date so DayEventCard
           can show a back-link for events that came from a
           specific feature (e.g. Day Planner). */
        source: e.source || '',
        eventDate: e.event_date,
        endDate:   e.end_date || '',
      };

      /* Single-day event (no end date, or end equals start). */
      if (!e.end_date || e.end_date === e.event_date) {
        push(e.event_date, { id: `c-${e.id}`, ...base });
        return;
      }

      /* Multi-day event — expand to every day in [event_date, end_date]
         and tag each instance with span metadata so the grid can
         render a continuous bar with arrow on the actual end day. */
      let startD, endD;
      try { startD = parseISO(e.event_date); endD = parseISO(e.end_date); }
      catch { push(e.event_date, { id: `c-${e.id}`, ...base }); return; }
      if (!startD || !endD || endD < startD) {
        push(e.event_date, { id: `c-${e.id}`, ...base });
        return;
      }

      let cursorD = startD;
      while (cursorD <= endD) {
        const key = format(cursorD, 'yyyy-MM-dd');
        const dow = cursorD.getDay();        // 0 = Sun, 6 = Sat
        const isActualStart = key === e.event_date;
        const isActualEnd   = key === e.end_date;
        push(key, {
          id: `c-${e.id}-${key}`,
          ...base,
          span: {
            isActualStart,
            isActualEnd,
            isSegmentStart: isActualStart || dow === 0,
            isSegmentEnd:   isActualEnd   || dow === 6,
          },
        });
        cursorD = addDays(cursorD, 1);
      }
    });

    // 2. Friend birthdays (this year + next year).
    //    GATED PER FRIEND: only friends with `sync_birthday` show
    //    up — the user must explicitly opt in on the friend's card.
    if (filters.birthday) {
      const year = cursor.getFullYear();
      friends.forEach(f => {
        if (!f.birthday || !f.sync_birthday) return;
        try {
          const bday = parseISO(f.birthday);
          [year, year + 1].forEach(y => {
            const key = format(new Date(y, bday.getMonth(), bday.getDate()), 'yyyy-MM-dd');
            push(key, {
              id: `b-${f.id}-${y}`,
              type: 'birthday',
              title: `${f.name}'s birthday`,
              color: EVENT_TYPES.birthday.color,
              emoji: EVENT_TYPES.birthday.emoji,
              sourceId: f.id,
            });
          });
        } catch {}
      });
    }

    // 3. Reach-out due dates (compute for visible month range).
    //    GATED PER FRIEND by `sync_reach_out`. Falls back to the
    //    `communication_frequency` interval when no specific
    //    weekdays are set, so a "monthly check-in" friend still
    //    surfaces on the right cadence.
    if (filters.reach_out) {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      friends.forEach(f => {
        if (!f.sync_reach_out) return;
        const days = (f.reach_out_days || []).map(d => DAY_INDEX[d]).filter(n => n !== undefined);

        if (days.length > 0) {
          // Specific weekdays — mark every matching day in the month.
          eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
            if (days.includes(d.getDay())) {
              const key = format(d, 'yyyy-MM-dd');
              push(key, {
                id: `r-${f.id}-${key}`,
                type: 'reach_out',
                title: `Check in with ${f.name}`,
                color: EVENT_TYPES.reach_out.color,
                emoji: EVENT_TYPES.reach_out.emoji,
                sourceId: f.id,
              });
            }
          });
        } else {
          // Interval-based cadence. Walk forward from last_contacted
          // (or today) and mark the next-due dates in the visible
          // month range.
          const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
          const step = FREQ_DAYS[f.communication_frequency] ?? 7;
          let cur = f.last_contacted
            ? parseISO(f.last_contacted.includes('T') ? f.last_contacted : f.last_contacted.replace(' ', 'T'))
            : new Date();
          // Advance to first occurrence on/after monthStart.
          while (cur < monthStart) cur = addDays(cur, step);
          while (cur <= monthEnd) {
            const key = format(cur, 'yyyy-MM-dd');
            push(key, {
              id: `r-${f.id}-${key}`,
              type: 'reach_out',
              title: `Check in with ${f.name}`,
              color: EVENT_TYPES.reach_out.color,
              emoji: EVENT_TYPES.reach_out.emoji,
              sourceId: f.id,
            });
            cur = addDays(cur, step);
          }
        }
      });
    }

    // 3b. Friend events (one-off dated items the user added on
    //     a friend's card). Each event has its own opt-in flag
    //     (`event.sync_calendar`) — only checked ones surface here.
    if (filters.friend_event) {
      friends.forEach(f => {
        (f.events || []).forEach(ev => {
          if (!ev.sync_calendar || !ev.event_date) return;
          const key = ev.event_date.slice(0, 10);
          push(key, {
            id: `fe-${f.id}-${ev.id}`,
            type: 'friend_event',
            title: `${ev.title || 'Event'} — ${f.name}`,
            color: EVENT_TYPES.friend_event.color,
            emoji: EVENT_TYPES.friend_event.emoji,
            sourceId: f.id,
          });
        });
      });
    }

    // 4. Daily prayers — intentionally NOT surfaced on the calendar.
    //    Checking "Include in my daily prayer list" on a prayer used
    //    to paint a "N daily prayers" marker on every single day, which
    //    cluttered the grid. Daily prayers now live only in the Prayers
    //    Dashboard → Today's Focus. Prayer *reminders* the user
    //    explicitly synced (source='prayer-reminder') still appear via
    //    the customEvents path.

    // 5. Journal entries — intentionally NOT surfaced on the
    //    calendar. The previous "N journal entries" indicator was
    //    removed per user request: writing in the journal should
    //    not auto-populate calendar items. Only journal reminders
    //    that the user explicitly chose to sync still appear.

    // 6. Journal reminders — intentionally NOT auto-rendered from
    //    the journal-reminders kv. Reminders only appear on the
    //    calendar when the user explicitly checks "Sync to Calendar"
    //    in Page Settings — those flow in via the customEvents path
    //    with source: 'journal-reminder' and get bucketed by the
    //    SOURCE_TO_TYPE dispatch above. Pulling from the reminders
    //    list directly would bypass that opt-in.

    // 7. Habits — page removed. No-op.

    // 8. Meetings (from admin:meetings localStorage)
    if (filters.meeting && meetings.length > 0) {
      meetings.forEach(m => {
        if (!m?.date) return;
        if (m.status === 'cancelled') return; // skip cancelled meetings
        const typeEmoji = MEETING_TYPE_EMOJI[m.type] || EVENT_TYPES.meeting.emoji;
        const meta = [];
        if (m.location)               meta.push(`📍 ${m.location}`);
        if (m.attendees?.length)      meta.push(`${m.attendees.length} attendee${m.attendees.length === 1 ? '' : 's'}`);
        if (m.agenda?.length)         meta.push(`${m.agenda.length} agenda item${m.agenda.length === 1 ? '' : 's'}`);
        if (m.duration)               meta.push(`${m.duration} min`);
        push(m.date, {
          id: `mtg-${m.id}`,
          type: 'meeting',
          title: m.title || 'Untitled meeting',
          description: m.generalNotes || '',
          color: EVENT_TYPES.meeting.color,
          emoji: typeEmoji,
          time: m.startTime || '',
          meta: meta.length > 0 ? meta : null,
          sourceId: m.id,
        });
      });
    }

    // 9. Services (from band:schedule — Scheduling page in Band/Team)
    if (filters.service && services.length > 0) {
      services.forEach(s => {
        if (!s?.date) return;
        const assignmentCount = s.assignments
          ? Object.values(s.assignments).filter(v => v).length
          : 0;
        const meta = [];
        if (s.startTime)        meta.push(`🕐 ${s.startTime}`);
        if (assignmentCount)    meta.push(`${assignmentCount} role${assignmentCount === 1 ? '' : 's'} filled`);
        if (s.notes)            meta.push(s.notes.length > 60 ? s.notes.slice(0, 60) + '…' : s.notes);
        push(s.date, {
          id: `svc-${s.id}`,
          type: 'service',
          title: s.name || 'Service',
          description: s.notes || '',
          color: EVENT_TYPES.service.color,
          emoji: EVENT_TYPES.service.emoji,
          time: s.startTime || '',
          meta: meta.length > 0 ? meta : null,
          sourceId: s.id,
        });
      });
    }

    // 10. Recording sessions (from recording:schedule — Scheduling Rec. page)
    if (filters.recording_session && recSessions.length > 0) {
      recSessions.forEach(r => {
        if (!r?.date) return;
        if (r.status === 'cancelled') return;
        const meta = [];
        if (r.location)         meta.push(`📍 ${r.location}`);
        if (r.songTitle)        meta.push(`🎵 ${r.songTitle}`);
        if (r.duration)         meta.push(`${r.duration} min`);
        if (r.startTime)        meta.push(`🕐 ${r.startTime}`);
        push(r.date, {
          id: `rec-${r.id}`,
          type: 'recording_session',
          title: r.name || 'Recording session',
          description: r.notes || '',
          color: EVENT_TYPES.recording_session.color,
          emoji: EVENT_TYPES.recording_session.emoji,
          time: r.startTime || '',
          meta: meta.length > 0 ? meta : null,
          sourceId: r.id,
        });
      });
    }

    // 11. Page Audit — review-due dates (from web:page-audit)
    if (filters.page_review && pageAudit.length > 0) {
      pageAudit.forEach(p => {
        if (!p) return;
        if (p.status === 'archived') return; // skip archived pages
        const dueDate = computePageReviewDate(p);
        if (!dueDate) return;
        const meta = [];
        if (p.url)    meta.push(`🔗 ${p.url}`);
        if (p.owner)  meta.push(`👤 ${p.owner}`);
        if (p.reviewFrequency) meta.push(`every ${p.reviewFrequency}`);
        push(dueDate, {
          id: `pa-${p.id}`,
          type: 'page_review',
          title: `Review: ${p.name || 'Untitled page'}`,
          description: p.notes || '',
          color: EVENT_TYPES.page_review.color,
          emoji: EVENT_TYPES.page_review.emoji,
          time: '',
          meta: meta.length > 0 ? meta : null,
          sourceId: p.id,
        });
      });
    }

    // 12. Forms Tracker — review-due dates (from web:forms)
    if (filters.form_review && siteForms.length > 0) {
      siteForms.forEach(f => {
        if (!f?.reviewDueDate) return;
        if (f.status === 'deprecated') return;
        const meta = [];
        if (f.pageUrl)             meta.push(`🔗 ${f.pageUrl}`);
        if (f.type)                meta.push(f.type);
        if (f.recipients?.length)  meta.push(`${f.recipients.length} recipient${f.recipients.length === 1 ? '' : 's'}`);
        push(f.reviewDueDate, {
          id: `fr-${f.id}`,
          type: 'form_review',
          title: `Review form: ${f.name || 'Untitled form'}`,
          description: f.notes || '',
          color: EVENT_TYPES.form_review.color,
          emoji: EVENT_TYPES.form_review.emoji,
          time: '',
          meta: meta.length > 0 ? meta : null,
          sourceId: f.id,
        });
      });
    }

    // 13a. Hosting & Domain — three top-level dates from web:hosting
    if (filters.hosting_alert && hostingDoc) {
      const pushHostingAlert = (kind, date, label, extraMeta) => {
        if (!date) return;
        const meta = [];
        if (label.detail) meta.push(label.detail);
        if (extraMeta)    meta.push(...extraMeta);
        push(date, {
          id: `hd-${kind}`,
          type: 'hosting_alert',
          title: label.title,
          description: hostingDoc.generalNotes || '',
          color: EVENT_TYPES.hosting_alert.color,
          emoji: HOSTING_KIND_EMOJI[kind] || EVENT_TYPES.hosting_alert.emoji,
          time: '',
          meta: meta.length > 0 ? meta : null,
          sourceId: kind,            // 'domain' | 'hosting' | 'ssl' — drives section deep-link
          sourceKind: kind,
        });
      };

      // Domain expiry
      pushHostingAlert(
        'domain',
        hostingDoc.domainExpiryDate,
        {
          title: hostingDoc.domainName
            ? `Domain expires: ${hostingDoc.domainName}`
            : 'Domain expires',
          detail: hostingDoc.domainRegistrar ? `🏢 ${hostingDoc.domainRegistrar}` : '',
        },
        hostingDoc.domainAutoRenew ? ['🔁 auto-renew on'] : ['⚠ no auto-renew']
      );

      // Hosting renewal
      pushHostingAlert(
        'hosting',
        hostingDoc.hostingRenewalDate,
        {
          title: hostingDoc.hostingProvider
            ? `Hosting renewal: ${hostingDoc.hostingProvider}`
            : 'Hosting renewal',
          detail: hostingDoc.hostingPlan ? `📦 ${hostingDoc.hostingPlan}` : '',
        },
        hostingDoc.hostingCost
          ? [`$${hostingDoc.hostingCost}/${hostingDoc.hostingCostPeriod || 'mo'}`]
          : null
      );

      // SSL expiry
      pushHostingAlert(
        'ssl',
        hostingDoc.sslExpiryDate,
        {
          title: 'SSL certificate expires',
          detail: hostingDoc.sslProvider ? `🔐 ${hostingDoc.sslProvider}` : '',
        },
        hostingDoc.sslAutoRenew ? ['🔁 auto-renew on'] : ['⚠ no auto-renew']
      );
    }

    // 13. Tech Stack — renewal dates (from web:tech-stack)
    if (filters.tech_renewal && techStack.length > 0) {
      techStack.forEach(t => {
        if (!t?.renewalDate) return;
        if (t.status === 'retired') return; // skip retired services
        const meta = [];
        if (t.vendor)        meta.push(`🏢 ${t.vendor}`);
        if (t.cost && t.costPeriod && t.costPeriod !== 'free') {
          meta.push(`$${t.cost}/${t.costPeriod === 'one-time' ? 'once' : t.costPeriod}`);
        }
        if (t.importance === 'critical') meta.push('⚠ critical');
        push(t.renewalDate, {
          id: `tr-${t.id}`,
          type: 'tech_renewal',
          title: `Renewal: ${t.name || 'Untitled'}`,
          description: t.notes || '',
          color: EVENT_TYPES.tech_renewal.color,
          emoji: EVENT_TYPES.tech_renewal.emoji,
          time: '',
          meta: meta.length > 0 ? meta : null,
          sourceId: t.id,
        });
      });
    }

    // 14. Blog Ideas — only those with addToCalendar + targetDate (from blog:ideas)
    if (filters.blog_idea && blogIdeas.length > 0) {
      blogIdeas.forEach(i => {
        if (!i?.addToCalendar || !i?.targetDate) return;
        const meta = [];
        if (i.assignedTo) meta.push(`👤 ${i.assignedTo}`);
        if (i.category)   meta.push(`🏷 ${i.category}`);
        if (i.priority && i.priority !== 'medium') meta.push(`${i.priority} priority`);
        push(i.targetDate, {
          id: `bidea-${i.id}`,
          type: 'blog_idea',
          title: `Blog: ${i.title || 'Untitled idea'}`,
          description: i.description || '',
          color: EVENT_TYPES.blog_idea.color,
          emoji: EVENT_TYPES.blog_idea.emoji,
          time: '',
          meta: meta.length > 0 ? meta : null,
          sourceId: i.id,
        });
      });
    }

    // 15. Blog Posts — every post with a publishDate set (from blog:posts).
    //     This covers scheduled posts, archived/published posts, and any
    //     draft that has a target publish date. We use a status-specific
    //     emoji so scheduled vs. archived reads at a glance.
    if (filters.blog_post && blogPosts.length > 0) {
      blogPosts.forEach(p => {
        if (!p?.publishDate) return;
        const status = p.status || 'draft';
        const statusEmoji =
          status === 'scheduled' ? '📅' :
          status === 'archived'  ? '✅' :
          status === 'published' ? '✅' :
                                   '📝'; // draft fallback
        const meta = [];
        if (p.author)   meta.push(`👤 ${p.author}`);
        if (p.category) meta.push(`🏷 ${p.category}`);
        meta.push(status.charAt(0).toUpperCase() + status.slice(1));
        push(p.publishDate, {
          id: `bpost-${p.id}`,
          type: 'blog_post',
          title: `Post: ${p.title || 'Untitled post'}`,
          description: p.excerpt || '',
          color: EVENT_TYPES.blog_post.color,
          emoji: statusEmoji,
          time: '',
          meta,
          sourceId: p.id,
        });
      });
    }

    // 16. Blog Series — start and end dates that the user explicitly
    //     toggled on with the "Add to Calendar" checkboxes on the Series
    //     form. We emit at most two events per series (one per date).
    if (filters.blog_series && blogSeries.length > 0) {
      blogSeries.forEach(s => {
        if (!s) return;
        const baseMeta = [];
        if (s.status)            baseMeta.push(s.status);
        if (s.postIds?.length)   baseMeta.push(`${s.postIds.length} post${s.postIds.length === 1 ? '' : 's'}`);

        if (s.addStartToCalendar && s.startDate) {
          push(s.startDate, {
            id: `bser-start-${s.id}`,
            type: 'blog_series',
            title: `Series start: ${s.name || 'Untitled series'}`,
            description: s.description || s.notes || '',
            color: EVENT_TYPES.blog_series.color,
            emoji: '▶',
            time: '',
            meta: ['Start', ...baseMeta],
            sourceId: s.id,
          });
        }
        if (s.addEndToCalendar && s.endDate) {
          push(s.endDate, {
            id: `bser-end-${s.id}`,
            type: 'blog_series',
            title: `Series end: ${s.name || 'Untitled series'}`,
            description: s.description || s.notes || '',
            color: EVENT_TYPES.blog_series.color,
            emoji: '⏹',
            time: '',
            meta: ['End', ...baseMeta],
            sourceId: s.id,
          });
        }
      });
    }

    return map;
  }, [customEvents, friends, prayers,
      meetings, services, recSessions, pageAudit, siteForms, techStack, hostingDoc,
      blogIdeas, blogPosts, blogSeries, filters, cursor]);

  /* ── derived for current view ────────────────────────────── */
  const gridDays = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(cursor));
      const end   = endOfWeek(endOfMonth(cursor));
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfWeek(cursor);
      const end   = endOfWeek(cursor);
      return eachDayOfInterval({ start, end });
    }
  }, [cursor, view]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDay[format(selectedDate, 'yyyy-MM-dd')] || [];
  }, [eventsByDay, selectedDate]);

  /* ── handlers ────────────────────────────────────────────── */
  const handleNewEvent = (date) => {
    const dateStr = date ? format(date, 'yyyy-MM-dd') : todayISO();
    setForm({ ...EMPTY_FORM, event_date: dateStr });
    setShowForm(true);
  };

  const handleSaveEvent = async () => {
    if (!form.title.trim() || !form.event_date) return;
    try {
      await calendarService.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      /* Live subscription updates customEvents automatically. */
    } catch { setError('Failed to save event.'); }
  };

  const handleDeleteCustom = async (id) => {
    if (!confirm('Delete this event?')) return;
    try {
      await calendarService.delete(id);
      /* Live subscription removes it from customEvents automatically. */
    } catch { setError('Failed to delete.'); }
  };

  const handleDayClick = (day) => {
    setSelectedDate(day);
  };

  /* Accept/Decline a Brunches & Teas gathering invite straight from
     its calendar popup. `ev.source_id` is `${gatheringId}__${inviteId}`
     (see BrunchesAndTeas.jsx pushInviteCalendarFor). Writes the RSVP
     back onto womens:brunches, then removes this popup — once a
     decision is made there's nothing left to act on. */
  const handleInviteDecision = (ev, rsvp) => {
    const [gatheringId, inviteId] = String(ev.source_id || '').split('__');
    if (!gatheringId || !inviteId) return;
    setBrunchGatherings(prev => (Array.isArray(prev) ? prev : []).map(g => {
      if (g.id !== gatheringId) return g;
      const invites = Array.isArray(g.invites) ? g.invites : [];
      return { ...g, invites: invites.map(i => i.id === inviteId ? { ...i, rsvp } : i) };
    }));
    calendarService.delete(ev.sourceId).catch(() => {});
  };

  const handleEventLink = (ev) => {
    switch (ev.type) {
      case 'journal':
      case 'journal_reminder':
      case 'memory_verse':
        navigate('/journal');
        break;
      case 'prayer':
        navigate('/prayers');
        break;
      case 'birthday':
      case 'reach_out':
      case 'friend_event':
        navigate(ev.sourceId ? `/friends?friend=${ev.sourceId}` : '/friends');
        break;
      case 'day_planned':
        navigate(ev.eventDate ? `/day-planner?date=${ev.eventDate}` : '/day-planner');
        break;
      case 'meeting':
        navigate(ev.sourceId ? `/worship/admin/meetings?id=${ev.sourceId}` : '/worship/admin/meetings');
        break;
      case 'service':
        navigate(ev.sourceId ? `/worship/team/scheduling?id=${ev.sourceId}` : '/worship/team/scheduling');
        break;
      case 'recording_session':
        navigate(ev.sourceId ? `/worship/production/scheduling-rec?id=${ev.sourceId}` : '/worship/production/scheduling-rec');
        break;
      case 'page_review':
        navigate(ev.sourceId ? `/site-pages?id=${ev.sourceId}` : '/site-pages');
        break;
      case 'form_review':
        navigate(ev.sourceId ? `/site-forms?id=${ev.sourceId}` : '/site-forms');
        break;
      case 'tech_renewal':
        navigate(ev.sourceId ? `/site-tech-stack?id=${ev.sourceId}` : '/site-tech-stack');
        break;
      case 'hosting_alert':
        // sourceId carries the section kind: 'domain' | 'hosting' | 'ssl'
        navigate(ev.sourceId ? `/hosting?section=${ev.sourceId}` : '/hosting');
        break;
      case 'blog_idea':
        navigate(ev.sourceId ? `/blog-ideas?id=${ev.sourceId}` : '/blog-ideas');
        break;
      case 'blog_post':
        navigate(ev.sourceId ? `/blog-posts?id=${ev.sourceId}` : '/blog-posts');
        break;
      case 'blog_series':
        navigate(ev.sourceId ? `/blog-series?series=${ev.sourceId}` : '/blog-series');
        break;
      /* ── Youth Ministry deep links — each source maps to its
            owning page. The source_id on the event uses a per-page
            convention (e.g. `${lessonId}__${scheduleId}` for Lessons,
            `${leaderId}__bg` for Leaders) — we navigate to the page
            and let the page handle any param parsing it wants. */
      case 'youth_weekly_night': navigate('/youth/weekly-nights'); break;
      case 'youth_trip':         navigate('/youth/trips'); break;
      case 'youth_outreach':     navigate('/youth/outreach'); break;
      case 'youth_bible_study':  navigate('/youth/bible-studies'); break;
      case 'youth_lesson':       navigate('/youth/lessons'); break;
      case 'youth_leader':       navigate('/youth/leaders'); break;
      /* Children's Ministry — same pattern as the Youth pages. */
      case 'children_kid':       navigate('/childrens/kids'); break;
      case 'children_sunday':    navigate('/childrens/sunday'); break;
      case 'children_midweek':   navigate('/childrens/midweek'); break;
      case 'children_special':   navigate('/childrens/vbs'); break;
      default:
        break;
    }
  };

  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }));

  /** Master toggle on a ministry: if any of its pages are on, hide
   *  them all; otherwise show them all. Mirrors the three-state UX
   *  of "select all" checkboxes in mail clients. */
  const toggleGroup = (group) => {
    setFilters(f => {
      const anyOn = group.keys.some(k => f[k]);
      const next = { ...f };
      group.keys.forEach(k => { next[k] = !anyOn; });
      return next;
    });
  };

  /** Group filter state: 'all' | 'some' | 'none'. Drives the
   *  master-toggle checkbox visual + aria-checked value. */
  const groupState = (group) => {
    const on  = group.keys.filter(k => filters[k]).length;
    if (on === group.keys.length) return 'all';
    if (on === 0)                  return 'none';
    return 'some';
  };

  const leftW  = leftCollapsed  ? '48px' : '240px';
  const rightW = rightCollapsed ? '48px' : '280px';

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="cal-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <PageTourHost pageId="calendar" />

      {/* TOPBAR */}
      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag calendar">Calendar</span>
        </div>
        <div className="app-tb-actions">
          <button className="app-btn ghost" onClick={() => { setCursor(new Date()); setSelectedDate(new Date()); }}>
            Today
          </button>
          <button className="app-btn ghost icon-only" onClick={() => setCursor(c => subMonths(c, 1))} title="Previous month">‹</button>
          <button className="app-btn ghost icon-only" onClick={() => setCursor(c => addMonths(c, 1))} title="Next month">›</button>

          <button className="app-btn primary" data-tour="tour-primary-action" onClick={() => handleNewEvent(selectedDate)}>✦ New Event</button>

          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      <div className="cal-body" style={{ gridTemplateColumns: `minmax(0, ${leftW}) minmax(0, 1fr) minmax(0, ${rightW})` }}>
        <NavRail />

        {/* LEFT: filters + mini summary */}
        <aside className={`cal-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">Filters</span>}
          </div>
          {!leftCollapsed && (
            <div className="cal-left-scroll">
              <div className="cal-section">
                <div className="cal-section-title">View</div>
                <div className="cal-view-toggle">
                  <button
                    className={`cal-view-btn ${view === 'month' ? 'on' : ''}`}
                    onClick={() => setView('month')}
                  >Month</button>
                  <button
                    className={`cal-view-btn ${view === 'week' ? 'on' : ''}`}
                    onClick={() => setView('week')}
                  >Week</button>
                </div>
              </div>

              <div className="cal-section">
                <div className="cal-section-title">Show</div>
                <div className="cal-section-hint">Each ministry has its own color; toggle a whole ministry or just one page.</div>
                {visibleFilterGroups.map(group => {
                  const state = groupState(group);
                  const isOpen = !!groupOpen[group.id];
                  return (
                    <div
                      key={group.id}
                      className={`cal-filter-group cal-filter-group-${state} ${isOpen ? 'open' : 'closed'}`}
                      style={{ '--group-color': group.color }}
                    >
                      <div className="cal-filter-group-hd">
                        <label className="cal-filter-group-master">
                          <input
                            type="checkbox"
                            checked={state === 'all'}
                            ref={el => { if (el) el.indeterminate = state === 'some'; }}
                            onChange={() => toggleGroup(group)}
                            aria-label={`Toggle all ${group.label} filters`}
                          />
                          <span className="cal-filter-group-icon">{group.icon}</span>
                          <span className="cal-filter-group-label">{group.label}</span>
                          <span className="cal-filter-group-count">
                            {group.keys.filter(k => filters[k]).length}/{group.keys.length}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="cal-filter-group-chevron"
                          onClick={() => toggleGroupOpen(group.id)}
                          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.label}`}
                          aria-expanded={isOpen}
                        >▾</button>
                      </div>
                      {isOpen && (
                        <div className="cal-filter-group-body">
                          {group.keys.map(key => {
                            const t = EVENT_TYPES[key];
                            if (!t) return null;
                            return (
                              <label key={key} className="cal-filter">
                                <input
                                  type="checkbox"
                                  checked={!!filters[key]}
                                  onChange={() => toggleFilter(key)}
                                />
                                <span className="cal-filter-dot" style={{ background: t.color }} />
                                <span className="cal-filter-label">{t.emoji} {t.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="cal-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}
            </div>
          )}
        </aside>

        {/* CENTER: month grid (or week strip) */}
        <main className="cal-center">
          {showForm ? (
            <NewEventForm
              form={form}
              setForm={setForm}
              onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              onSave={handleSaveEvent}
            />
          ) : (
            <CalendarGrid
              cursor={cursor}
              view={view}
              gridDays={gridDays}
              eventsByDay={eventsByDay}
              plannedDays={plannedDays}
              selectedDate={selectedDate}
              onDayClick={handleDayClick}
              onDoubleClick={(day) => handleNewEvent(day)}
              loading={loading}
            />
          )}
        </main>

        {/* RIGHT: selected day details */}
        <aside className={`cal-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">
              {selectedDate ? format(selectedDate, 'EEE, MMM d') : 'Day'}
            </span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>
          {!rightCollapsed && (
            <div className="cal-right-scroll">
              {selectedDate && (
                <>
                  <button
                    className="app-btn primary cal-add-day-btn"
                    onClick={() => handleNewEvent(selectedDate)}
                  >+ Add event on this day</button>
                  {selectedDayEvents.length === 0 ? (
                    <div className="cal-day-empty">No events on this day yet.</div>
                  ) : (
                    <div className="cal-day-events">
                      {selectedDayEvents.map(ev => (
                        <DayEventCard
                          key={ev.id}
                          ev={ev}
                          onOpen={() => handleEventLink(ev)}
                          onDelete={ev.type === 'custom' ? () => handleDeleteCustom(ev.sourceId) : null}
                          onOpenDayPlanner={
                            ev.source === 'day-planner' && ev.eventDate
                              ? () => navigate(`/day-planner?date=${ev.eventDate}`)
                              : null
                          }
                          onAcceptInvite={ev.type === 'women_invite' ? () => handleInviteDecision(ev, 'yes') : null}
                          onDeclineInvite={ev.type === 'women_invite' ? () => handleInviteDecision(ev, 'no') : null}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<CalendarPageSettings />}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Calendar Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab. Calendar doesn't have bespoke
   settings yet (filters live in the left sidebar), but it follows
   the same sub-tab pill pattern as Friends/Prayers so the "How to
   Use" guide has a real home and future settings can slot in
   beside it without restructuring anything. */
function CalendarPageSettings() {
  const [activeSub, setActiveSub] = useState('general');
  const SUB_TABS = [
    { id: 'general', label: '⚙', name: 'General' },
    { id: 'howto',   label: '❓', name: 'How to Use' },
  ];

  return (
    <div className="cal-ps-root">
      <div className="pm-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`pm-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="pm-ps-subtab-icon">{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {activeSub === 'general' && (
        <div className="pm-body" style={{ alignItems:'center', textAlign:'center', padding:'28px 22px' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⚙</div>
          <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.85)', marginBottom:4 }}>
            No Calendar-specific settings here yet.
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', maxWidth:340, lineHeight:1.55 }}>
            Which ministries and event types show on your grid is controlled by the "Show"
            filters in the left sidebar, not here.
          </div>
        </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ───────── */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="cal-ps-howto-header">
          <div className="pm-ps-section-title">❓ How to Use the Calendar Page</div>
          <a
            className="cal-ps-howto-download"
            href={calendarGuideDocxUrl}
            download="Calendar - How to Use.docx"
          >
            ⬇ Download as Word doc
          </a>
        </div>

        <div className="cal-ps-howto-feedback">
          <span className="cal-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="cal-ps-howto-intro">
          A full walkthrough of everything on this page — navigating the grid, adding your own
          events, filtering what's shown, and understanding what syncs in automatically from
          other pages. Skim the headers below or read start to finish.
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🧭 Navigating the Grid</div>
          <ul className="cal-ps-howto-list">
            <li>Switch between <b>Month</b> and <b>Week</b> view in the left sidebar under "View."</li>
            <li><b>Today</b>, <b>‹</b>, and <b>›</b> in the topbar move you around; the header shows
              the month (or week) you're looking at.</li>
            <li>Click a day to select it — its details open in the right sidebar. Double-click a
              day to add a new event on it.</li>
          </ul>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">✦ Adding an Event</div>
          <div className="cal-ps-howto-p">
            Click <b>✦ New Event</b> in the topbar, double-click a day, or click
            <b> + Add event on this day</b> in the right sidebar once a day is selected. Fill in a
            title and date (both required), and optionally a description, time, and one of 8
            preset colors, then <b>✓ Save Event</b>.
          </div>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🗑 Editing & Deleting</div>
          <div className="cal-ps-howto-p">
            Events you created yourself (marked ⭐) show a 🗑 delete button in the right sidebar —
            deleting asks for confirmation first. There's no inline editing; delete and re-add if
            something needs to change. Events synced in from another page (see below) can't be
            edited or deleted here at all — go to the page that created them instead.
          </div>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🎨 Color-Coding & Filters</div>
          <div className="cal-ps-howto-p">
            Every event type has its own emoji and color, grouped by ministry in the left sidebar
            (Youth, Children's, Worship, Web, Journal, Prayers, Day Planner, Friends, and your own
            Other/custom events). Each group has a master checkbox — click it to toggle every item
            in that group on or off at once — or expand the group to flip individual types
            on/off. Most filters start off so your calendar opens clean; Prayer reminders and
            "Day Is Planned" start on.
          </div>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🔗 What Syncs In Automatically</div>
          <div className="cal-ps-howto-p">
            A lot of what shows up here is pushed in from other pages rather than added by hand.
            These are read-only — click the <b>🔗 Open</b> button on an event's card to jump to the
            page that owns it:
          </div>
          <ul className="cal-ps-howto-list">
            <li><b>Friends</b> — birthdays, reach-out due dates, and custom friend events, each
              opt-in per friend (toggled on the Friends page).</li>
            <li><b>Prayers</b> — prayer reminders you've opted into via Prayers → Page Settings →
              Reminders → "Sync to Calendar."</li>
            <li><b>Journal</b> — journal reminders and memory-verse review dates, opted in the
              same way from Journal → Page Settings → Reminders.</li>
            <li><b>Worship, Youth, Children's, and Web ministry pages</b> — meetings, services,
              recording sessions, review/renewal due dates, and blog dates sync automatically
              from their source pages.</li>
            <li><b>Day Planner</b> — instead of one chip per time block, a synced day shows a
              single "✓ Day Is Planned" pill; click its <b>📋 Day Planner</b> button to open that
              day.</li>
          </ul>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🔔 Reminders & Notifications</div>
          <div className="cal-ps-howto-p">
            The bell in the topbar combines due reminders with any pending recording-session
            requests sent to you — accept a request to import the session and add it to your
            calendar, or dismiss it to ignore.
          </div>
        </div>

        <div className="cal-ps-howto-block">
          <div className="cal-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="cal-ps-howto-list">
            <li><b>✓ Save Event</b> stays disabled until both Title and Date are filled in.</li>
            <li>Don't see a ministry's filter group? It's hidden because that category is turned
              off in Settings → Visible Categories — turn it on there first.</li>
            <li>An event you expected to sync isn't showing? Double-check its sync toggle on the
              source page (e.g. a friend's "sync_birthday" or "sync_reach_out"), then confirm the
              matching filter is checked here.</li>
            <li>There's no search box on this page — use the filters and Month/Week navigation to
              find what you're looking for.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */
function CalendarGrid({ cursor, view, gridDays, eventsByDay, plannedDays, selectedDate, onDayClick, onDoubleClick, loading }) {
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div className="cal-grid-wrap">
      <header className="cal-month-hd">
        <div className="cal-month-title">
          {format(cursor, view === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
        </div>
        <div className="cal-tab-hint">
          Click a day to see what’s on it · double-click to add an event.
        </div>
      </header>

      <div className="cal-weekday-row">
        {WEEKDAYS.map(d => <div key={d} className="cal-weekday">{d}</div>)}
      </div>

      <div className={`cal-grid ${view === 'week' ? 'week' : 'month'}`}>
        {loading && <div className="cal-loading">Loading…</div>}
        {gridDays.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const events = eventsByDay[key] || [];
          const isOff = view === 'month' && !isSameMonth(day, cursor);
          const isSel = selectedDate && isSameDay(day, selectedDate);
          return (
            <div
              key={key}
              className={`cal-day ${isOff ? 'off' : ''} ${isToday(day) ? 'today' : ''} ${isSel ? 'sel' : ''}`}
              onClick={() => onDayClick(day)}
              onDoubleClick={() => onDoubleClick(day)}
            >
              <div className="cal-day-num">{format(day, 'd')}</div>
              {plannedDays.has(key) && (
                <div className="cal-day-planned" title="You've planned this day in the Day Planner">
                  ✓ Day Is Planned
                </div>
              )}
              <div className="cal-day-events-mini">
                {events.slice(0, 3).map(ev => ev.span
                  ? <MultiDayBar key={ev.id} ev={ev} />
                  : (
                    <div
                      key={ev.id}
                      className="cal-event-chip"
                      style={{ background: `${ev.color}22`, color: ev.color, borderColor: `${ev.color}55` }}
                      title={ev.title}
                    >
                      <span className="cal-event-chip-emoji">{ev.emoji}</span>
                      <span className="cal-event-chip-title">{ev.title}</span>
                    </div>
                  )
                )}
                {events.length > 3 && (
                  <div className="cal-event-more">+{events.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Single bar segment for a multi-day event inside one day cell.
   Position metadata on `ev.span` decides:
     • where the bar is rounded (segment start / end),
     • whether negative horizontal margins extend across grid gaps,
     • whether title/emoji repeat (only at the start of each week segment),
     • whether the arrow cap renders (only on the actual event end day). */
function MultiDayBar({ ev }) {
  const s = ev.span || {};
  const bg          = `${ev.color}26`;
  const borderColor = `${ev.color}66`;
  const style = {
    background: bg,
    color: ev.color,
    /* Inter-cell-content distance = 8px (cell-pad) + 6px (gap) + 8px
       (next cell-pad) = 22px. Half is 11px — each side's bar extends
       that far so the two halves meet seamlessly in the gap. */
    marginLeft:  s.isSegmentStart ? 0 : '-11px',
    marginRight: s.isSegmentEnd   ? 0 : '-11px',
    borderTopLeftRadius:     s.isSegmentStart ? 6 : 0,
    borderBottomLeftRadius:  s.isSegmentStart ? 6 : 0,
    borderTopRightRadius:    s.isSegmentEnd   ? 6 : 0,
    borderBottomRightRadius: s.isSegmentEnd   ? 6 : 0,
    borderLeft:  s.isSegmentStart ? `0.5px solid ${borderColor}` : 'none',
    borderRight: s.isSegmentEnd   ? `0.5px solid ${borderColor}` : 'none',
    borderTop:    `0.5px solid ${borderColor}`,
    borderBottom: `0.5px solid ${borderColor}`,
  };
  return (
    <div
      className={`cal-event-bar ${s.isSegmentStart ? 'seg-start' : ''} ${s.isSegmentEnd ? 'seg-end' : ''} ${s.isActualEnd ? 'is-end' : ''}`}
      style={style}
      title={ev.title}
    >
      {s.isSegmentStart && (
        <>
          <span className="cal-event-bar-emoji">{ev.emoji}</span>
          <span className="cal-event-bar-title">{ev.title}</span>
        </>
      )}
      {s.isActualEnd && <span className="cal-event-bar-cap" aria-hidden="true">▶</span>}
    </div>
  );
}

function DayEventCard({ ev, onOpen, onDelete, onOpenDayPlanner, onAcceptInvite, onDeclineInvite }) {
  const isInvite = ev.type === 'women_invite';
  return (
    <article
      className="cal-day-event"
      style={{ borderColor: `${ev.color}55`, background: `${ev.color}10` }}
    >
      <div className="cal-day-event-hd">
        <span className="cal-day-event-emoji" style={{ color: ev.color }}>{ev.emoji}</span>
        <span className="cal-day-event-title">{ev.title}</span>
        {ev.time && <span className="cal-day-event-time">{ev.time}</span>}
      </div>
      {ev.description && <div className="cal-day-event-desc">{ev.description}</div>}
      {ev.meta && ev.meta.length > 0 && (
        <ul className="cal-day-event-meta">
          {ev.meta.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
      <div className="cal-day-event-actions">
        {isInvite ? (
          <>
            <button className="app-btn primary" onClick={onAcceptInvite}>✅ Accept</button>
            <button className="app-btn ghost" onClick={onDeclineInvite}>✖ Decline</button>
          </>
        ) : (
          <>
            {ev.type !== 'custom' && (
              <button className="app-btn ghost" onClick={onOpen}>🔗 Open</button>
            )}
            {/* Day-Planner back-link — only shown for events that came
                from a synced Day Planner block. Lets you jump straight
                from a calendar event to its planner day. */}
            {onOpenDayPlanner && (
              <button className="app-btn primary" onClick={onOpenDayPlanner}>📋 Day Planner</button>
            )}
          </>
        )}
        {onDelete && (
          <button className="app-btn ghost" onClick={onDelete} title="Delete">🗑</button>
        )}
      </div>
    </article>
  );
}

function NewEventForm({ form, setForm, onCancel, onSave }) {
  return (
    <div className="cal-form">
      <header className="cal-form-hd">
        <div className="cal-form-title">✦ New Event</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel">✕</button>
      </header>

      <div className="cal-form-body">
        <div className="cal-form-section">
          <label className="cal-form-lbl">Title *</label>
          <input
            className="cal-inp"
            placeholder="What is this event?"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="cal-form-section">
          <label className="cal-form-lbl">Description (optional)</label>
          <textarea
            className="cal-ta"
            rows={2}
            placeholder="Notes about this event..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="cal-form-row">
          <div className="cal-form-section">
            <label className="cal-form-lbl">Date *</label>
            <input
              className="cal-inp"
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
            />
          </div>
          <div className="cal-form-section">
            <label className="cal-form-lbl">Time (optional)</label>
            <input
              className="cal-inp"
              type="time"
              value={form.event_time}
              onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
            />
          </div>
        </div>

        <div className="cal-form-section">
          <label className="cal-form-lbl">Color</label>
          <div className="cal-color-row">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                className={`cal-color-dot ${form.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="cal-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={!form.title.trim() || !form.event_date}
        >✓ Save Event</button>
      </footer>
    </div>
  );
}
