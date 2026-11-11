import React, { useState, useMemo, useRef, useEffect } from 'react';
import { format, parseISO, isToday, subDays } from 'date-fns';
import { calendarService } from '../../services/calendarService';
import {
  useJournalDashboardSettings, useJournalGoals, isOnVacation,
} from '../../lib/journalPageSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMemoryVerses } from '../../lib/memoryVersesStore';

// ─── helpers ────────────────────────────────────────────────
/* Robust word count — strips HTML tags & non-breaking spaces, then
   collapses whitespace. Returns 0 only when there's truly no content. */
const wordCount = (text) => {
  if (!text) return 0;
  const clean = String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
};

/* Entry-based "streak" stats. Per user request, the streak is about
   ENTRIES, not consecutive days:
     - total        = total entries written
     - mostInOneDay = max entries written on a single calendar day
     - last7        = entries in the last 7 days
   This replaces the old day-streak logic. */
const getEntryStats = (entries) => {
  if (!entries.length) return { total: 0, mostInOneDay: 0, last7: 0 };
  const perDay = {};
  let last7 = 0;
  const sevenAgo = subDays(new Date(), 6);
  entries.forEach(e => {
    try {
      const d = parseISO(e.created_at);
      const key = format(d, 'yyyy-MM-dd');
      perDay[key] = (perDay[key] || 0) + 1;
      if (d >= sevenAgo) last7++;
    } catch {}
  });
  const mostInOneDay = Math.max(0, ...Object.values(perDay));
  return { total: entries.length, mostInOneDay, last7 };
};

const get30DayHeatmap = (entries) => {
  const map = {};
  entries.forEach(e => {
    try {
      const day = format(parseISO(e.created_at), 'yyyy-MM-dd');
      if (!map[day]) map[day] = { count: 0 };
      map[day].count++;
    } catch {}
  });
  return map;
};

const STOP_WORDS = new Set([
  'the','and','a','to','of','in','is','it','that','was','for','on','are','with',
  'as','i','his','they','be','at','one','have','this','from','or','had','by',
  'not','but','what','all','were','we','when','your','can','said','there',
  'use','an','each','which','she','do','how','their','if','will','up','other',
  'about','out','many','then','them','these','so','some','her','would','make',
  'like','him','into','time','has','look','two','more','go','no','way','could',
  'my','than','first','been','its','who','now','did','get','come','made',
  'may','you','me','he','just','am','our','us','lord','god','also','very',
  'back','after','day','feel','felt','know','think','want','need','really',
  'even','still','little','down','again','see','went','through','over','help'
]);

const buildWordCloud = (entries) => {
  const freq = {};
  entries.forEach(e => {
    const words = (e.content + ' ' + e.title).toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    words.forEach(w => { freq[w] = (freq[w]||0)+1; });
  });
  return Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,40)
    .map(([word, count]) => ({ word, count }));
};

const getScriptureCoverage = (entries) => {
  const books = {};
  const TESTAMENT = {
    OT: ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
      '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
      'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
      'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
      'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi'],
    NT: ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians',
      'Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians',
      '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter',
      '1 John','2 John','3 John','Jude','Revelation']
  };
  entries.forEach(e => {
    const refs = [];
    try { const v = JSON.parse(e.verses||'[]'); v.forEach(r => refs.push(r.ref)); } catch {}
    if (e.scripture) refs.push(e.scripture);
    refs.forEach(ref => {
      for (const [t, list] of Object.entries(TESTAMENT)) {
        for (const book of list) {
          if (ref.toLowerCase().includes(book.toLowerCase())) {
            if (!books[book]) books[book] = { count: 0, testament: t };
            books[book].count++;
            break;
          }
        }
      }
    });
  });
  return books;
};

const getOnThisDay = (entries) => {
  const today = new Date();
  return entries.filter(e => {
    try {
      const d = parseISO(e.created_at);
      return d.getMonth() === today.getMonth() &&
             d.getDate()  === today.getDate() &&
             d.getFullYear() !== today.getFullYear();
    } catch { return false; }
  }).sort((a,b) => parseISO(b.created_at) - parseISO(a.created_at));
};

/* (getSpiritualSeason removed — Spiritual Themes card was retired
   from the dashboard per user request.) */

// ─── Memory Verse Component ─────────────────────────────────
const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/* Return YYYY-MM-DD for the next occurrence of the given day name,
   starting from today. If today is that day, today wins. */
function nextOccurrenceISO(dayName, baseDate = new Date()) {
  const target = DAY_INDEX[dayName] ?? 0;
  const cur = baseDate.getDay();
  const offset = (target - cur + 7) % 7;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offset);
  // Local YYYY-MM-DD (avoid UTC drift).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/* Build review dates from a schedule.
   - day:        weekday name (Sunday..Saturday)
   - frequency:  'weekly' | 'biweekly' | 'monthly'
   - weeks:      total span in weeks (1..52)
   Returns YYYY-MM-DD strings starting at the next occurrence of the
   chosen weekday, stepping by 7 / 14 / 28 days until the span ends. */
function buildScheduleDates({ day, frequency, weeks }) {
  const startISO = nextOccurrenceISO(day);
  const stepDays = frequency === 'biweekly' ? 14
                 : frequency === 'monthly'  ? 28
                 : 7;
  const totalWeeks = Math.max(1, Math.min(52, Number(weeks) || 12));
  const totalDays  = totalWeeks * 7;
  const [y, m, d]  = startISO.split('-').map(n => parseInt(n, 10));
  const base = new Date(y, m - 1, d);
  const out = [];
  for (let offset = 0; offset <= totalDays; offset += stepDays) {
    const cur = new Date(base);
    cur.setDate(base.getDate() + offset);
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

/* Default section-level schedule. Stored at the localStorage key
   `mh_memory_verse_schedule` and applied to whatever the current
   verse is at any given time. */
const DEFAULT_SCHEDULE = {
  enabled:   false,
  day:       'Sunday',
  frequency: 'weekly',  // 'weekly' | 'biweekly' | 'monthly'
  weeks:     12,
  eventIds:  [],
};

function MemoryVerse() {
  /* Each verse on disk:
     {
       id, ref, text, numbered:[{n, t}], addedAt,
       active:bool, archived:bool
     }
     The old `day`, `syncCalendar`, `eventIds` per-verse fields are
     deprecated — the schedule is now section-level (see DEFAULT_SCHEDULE).
     We tolerate the legacy shape on read so old data still renders. */
  /* Shared memory-verses store — both this dashboard component and
     the Page Settings → Archived / Memorized tabs read + write the
     same array. The hook auto-syncs both consumers via a custom
     'mh-verses-updated' window event so a change in one place flows
     to the other immediately. */
  const [verses, save] = useMemoryVerses();

  /* Memory Verse Advanced settings (live). Controls whether the
     "Mark memorized" button + Memorized archive are shown. */
  /* Track memorization + Spaced repetition are always on (no user
     opt-in). The Mark memorized button + Memorized archive +
     Schedule reviews popup all render unconditionally on the
     current verse card. */
  /* Calendar filter state — we auto-enable the memory_verse filter
     when SR fires so the user can actually see the scheduled review
     events. Otherwise the events are invisible behind a hidden filter
     by default. */
  const [, setCalFilters] = useUserStoreKey('calendar-filters', {});

  /* Calendar sync state lives in Page Settings → Pick New Verse,
     not on the dashboard. The dashboard MemoryVerse component is
     purely UI for managing verses (add, archive, delete, set
     current, mark memorized). Calendar events are managed solely
     by Page Settings to avoid double-management and racing sweeps. */

  const [showAdd, setShowAdd]               = useState(false);
  const [newRef, setNewRef]                 = useState('');
  /* newText is populated only from the auto-fetch — there's no
     manual textarea anymore. */
  const [newText, setNewText]               = useState('');
  const [newNumbered, setNewNumbered]       = useState([]);   // [{n, t}]
  /* Archived + Memorized lists used to live here as inline
     collapse sections — they were moved to Page Settings so the
     dashboard stays focused on the current verse. The `showArchive`
     and `showMemorized` toggles are no longer needed. */
  /* Inline "Schedule reviews" popup state. Holds a sorted ascending
     array of selected day-offsets from today. `null` means closed. */
  const [srPopup, setSrPopup] = useState(null);
  // { selected: number[], error: '' }
  const [fetchLoading, setFetchLoading]     = useState(false);
  /* Surfaces a network/lookup failure so the user knows the verse text
     couldn't be fetched (offline / blocked API) rather than the field
     just silently staying blank. They can still save the reference. */
  const [fetchError, setFetchError]         = useState('');
  /* Current verse card starts COLLAPSED on every page load. Click
     the toggle in the card header to expand. */
  const [currentCollapsed, setCurrentCollapsed] = useState(true);
  const debounceRef = useRef(null);

  /* "Current" = the active, non-archived verse. */
  const current = verses.find(v => v.active && !v.archived) || null;

  /* Fetch verse via bible-api. Returns { text, numbered:[{n,t}] }. */
  const fetchVerse = async (ref) => {
    if (!ref.trim()) return { text: '', numbered: [] };
    try {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`);
      const d = await res.json();
      if (d.error) return { text: '', numbered: [] };
      const vs = Array.isArray(d.verses) ? d.verses : [];
      if (!vs.length) {
        // bible-api occasionally returns only the joined `text`.
        return { text: (d.text || '').trim(), numbered: [] };
      }
      const numbered = vs.map(v => ({
        n: v.verse,
        t: (v.text || '').replace(/\n/g, ' ').trim(),
      }));
      const text = numbered.map(v => `${v.n}. ${v.t}`).join(' ');
      return { text, numbered };
    } catch {
      return { text: '', numbered: [] };
    }
  };

  /* Debounced auto-fetch — mirrors the entry-form behaviour. */
  const handleRefChange = (val) => {
    setNewRef(val);
    setFetchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setFetchLoading(false);
      setNewText('');
      setNewNumbered([]);
      return;
    }
    if (!/\d/.test(val)) return;
    setFetchLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { text, numbered } = await fetchVerse(val);
      setNewText(text);
      setNewNumbered(numbered);
      setFetchLoading(false);
      /* Got a reference that looks complete but no text came back —
         almost always a connectivity / API issue. Tell the user. */
      if (!text && !numbered.length) {
        setFetchError("Couldn't load the verse text — check your internet connection. You can still save the reference and add the wording later.");
      }
    }, 900);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  /* Resolve numbered list for display. Falls back to a single-row
     [{n:'', t:text}] when the API only gave us joined text. */
  const numberedForDisplay = (v) => {
    if (v?.numbered && v.numbered.length) return v.numbered;
    if (v?.text) return [{ n: '', t: v.text }];
    return [];
  };

  /* Section-level event generator. Wipes EVERY existing event with
     `source === 'memory-verse'` (not just the ones our schedule
     remembers — this catches orphans from earlier code paths and
     from previous current-verse references) and recreates fresh.
     Pass `next` to apply a not-yet-saved schedule (e.g. mid-edit).
     When `next.enabled` is false OR there's no current verse, we
     just wipe and bail. */
  /* Calendar event management lives entirely in Page Settings →
     Pick New Verse. The dashboard intentionally does NOT touch
     `source: 'memory-verse'` calendar events — that prevents the
     dashboard's mount-time reconcile from wiping events the user
     just set up from Page Settings. */

  const handleAdd = async () => {
    if (!newRef.trim()) return;
    setFetchLoading(true);
    let text = newText.trim();
    let numbered = newNumbered;
    if (!text) {
      const res = await fetchVerse(newRef);
      text = res.text;
      numbered = res.numbered;
    }
    setFetchLoading(false);

    const id = `mv_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const ref = newRef.trim();

    /* Make this new verse the only active one. The PREVIOUS active
       verse keeps its data but flips inactive — and if it had SR
       events, those get swept now since it's no longer the focus. */
    const previousActive = verses.find(v => v.active && !v.archived) || null;
    if (previousActive) await clearSrForVerse(previousActive);

    const updated = verses.map(v => v.id === previousActive?.id
      ? { ...v, active: false, srEventIds: [] }
      : { ...v, active: false }
    );

    /* If SR is on, schedule reviews for the new verse right away —
       this is the "before marked memorized" trigger the user asked
       for. */
    const newVerse = {
      id, ref, text, numbered,
      addedAt: now,
      active: true, archived: false,
      memorized: false, memorizedAt: null,
      srEventIds: [],
    };
    /* SR reviews are NOT auto-scheduled — the user opens the
       "🗓 Schedule reviews" popup beneath the verse and picks
       custom days, then confirms. */
    updated.unshift(newVerse);
    save(updated);

    setNewRef(''); setNewText(''); setNewNumbered([]); setFetchError('');
    setShowAdd(false); setCurrentCollapsed(false);
  };

  const handleDelete = async (verse) => {
    if (!verse) return;
    if (!window.confirm(`Delete memory verse "${verse.ref}"? This cannot be undone.`)) return;
    /* Sweep this verse's Spaced Repetition events too. */
    await clearSrForVerse(verse);
    save(verses.filter(v => v.id !== verse.id));
  };

  const handleArchive = async (verse) => {
    if (!verse) return;
    /* Archiving stops the SR cycle — no more reviews for archived verses. */
    await clearSrForVerse(verse);
    save(verses.map(v => v.id === verse.id
      ? { ...v, active: false, archived: true, srEventIds: [] }
      : v
    ));
  };

  /* handleSetCurrent moved to Page Settings → Archived sub-tab.
     The dashboard no longer surfaces an in-place "Set current"
     control because the archive list itself was removed. */

  /* Mark / unmark a verse as memorized.
     Marking ON also moves the verse into the Archive (so it appears
     in BOTH the Memorized list and the Archive list) and clears its
     active-verse status + any SR events — once memorized, no more
     active reviews are needed.
     Marking OFF leaves the verse archived (user can manually un-archive
     via Set current). It just drops the memorized flag/date. */
  const toggleMemorized = async (verse) => {
    const turningOn = !verse.memorized;
    if (turningOn) {
      /* Sweep any active SR events — memorized verses don't need
         scheduled reviews on the calendar. */
      await clearSrForVerse(verse);
    }
    save(verses.map(v => v.id === verse.id
      ? {
          ...v,
          memorized:   turningOn,
          memorizedAt: turningOn ? new Date().toISOString() : null,
          /* When turning ON, also archive + clear active/SR. When
             turning OFF, leave archive state untouched. */
          ...(turningOn ? { active: false, archived: true, srEventIds: [] } : {}),
        }
      : v
    ));
  };

  /* Compute the ACTUAL number of days from today until the next
     Pick-New-Verse reminder lands on the calendar — based on both
     the user's chosen weekday AND today's weekday.

     Examples:
       weekly + Sunday, today=Friday  → next PNV = 2 days
       weekly + Sunday, today=Sunday  → next PNV = 7 days (today's
                                       event already passed for this cycle)
       biweekly + Sunday, today=Sunday → next PNV = 14 days
       monthly + Sunday, today=Sunday  → next PNV = 28 days
       monthly + Sunday, today=Wednesday → next PNV = 4 days
                                       (weekday-only — the first
                                       upcoming Sunday of the schedule)

     When no schedule is set, returns 30 (generous default).  */
  const FULL_INDEX = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  /* Find the Nth weekday of a given month — mirrors the helper in
     Journal.jsx's PageSettingsTab. */
  const nthWeekdayOfMonth = (year, monthIdx, weekday, which) => {
    if (which === 'last') {
      const last = new Date(year, monthIdx + 1, 0);
      const diff = (last.getDay() - weekday + 7) % 7;
      return new Date(year, monthIdx, last.getDate() - diff);
    }
    const first = new Date(year, monthIdx, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    const day = 1 + offset + (which - 1) * 7;
    const test = new Date(year, monthIdx, day);
    if (test.getMonth() !== monthIdx) return null;
    return test;
  };

  const daysUntilNextPickNewVerse = () => {
    try {
      const raw = JSON.parse(localStorage.getItem('mh_memory_verse_schedule') || 'null');
      if (!raw || !raw.enabled) return 30;
      const targetDay = FULL_INDEX[raw.day] ?? 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      /* Monthly: walk forward month by month until we find the first
         Nth-weekday >= today. */
      if (raw.frequency === 'monthly') {
        const which = raw.monthlyWeek === 'last' ? 'last'
                    : Math.max(1, Math.min(4, parseInt(raw.monthlyWeek, 10) || 1));
        let y = today.getFullYear();
        let m = today.getMonth();
        for (let i = 0; i < 24; i++) {
          const d = nthWeekdayOfMonth(y, m, targetDay, which);
          if (d) {
            d.setHours(0, 0, 0, 0);
            if (d > today) {
              return Math.round((d - today) / 86400000);
            }
          }
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }
        return 30;
      }

      /* Weekly + biweekly. */
      const stepDays = raw.frequency === 'biweekly' ? 14 : 7;
      const offsetToTarget = (targetDay - today.getDay() + 7) % 7;
      return offsetToTarget === 0 ? stepDays : offsetToTarget;
    } catch { return 30; }
  };
  const daysUntilNext = daysUntilNextPickNewVerse();
  /* Max review offset is one day BEFORE the next Pick-New-Verse
     reminder lands so SR never overlaps it. */
  const maxReviewOffset = Math.max(0, daysUntilNext - 1);

  /* Build the calendar cells for the popup. Each cell represents one
     calendar day from today through the day of the next Pick-New-Verse
     reminder. Cells before today are padding so the grid aligns to
     proper weekday columns (Sun..Sat). */
  const buildSrCells = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    /* Padding before today so the first column on the row matches
       the actual weekday. */
    const todayDow = today.getDay();
    for (let i = 0; i < todayDow; i++) cells.push({ kind: 'pad' });

    for (let off = 0; off <= daysUntilNext; off++) {
      const d = new Date(today);
      d.setDate(today.getDate() + off);
      let kind;
      if (off === 0) kind = 'today';
      else if (off === daysUntilNext) kind = 'pnv';
      else kind = 'available';
      cells.push({
        kind,
        offset: off,
        date: d,
        dayOfMonth: d.getDate(),
      });
    }
    return cells;
  };

  /* Create the SR review events for a verse using user-supplied
     intervals. Returns the new event-id array. Auto-enables the
     Calendar's memory_verse filter so the events are immediately
     visible. */
  const scheduleSrForVerse = async (verse, intervals) => {
    if (!verse || !Array.isArray(intervals) || !intervals.length) return [];
    const now = new Date();
    const dates = intervals.map(off => {
      const d = new Date(now);
      d.setDate(d.getDate() + off);
      const y  = d.getFullYear();
      const m  = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    });
    try {
      const events = dates.map(date => ({
        title:       `📖 Review: ${verse.ref}`,
        description: '',
        event_date:  date,
        event_time:  '',
        color:       '#22c55e',
        category:    'general',
        source:      'memory-verse',
        source_id:   `sr-${verse.id}`,
      }));
      const res = await calendarService.bulkCreate(events);
      const created = res?.data?.data || [];
      const ids = created.map(e => e.id);
      if (ids.length) {
        setCalFilters(prev => ({ ...(prev || {}), memory_verse: true }));
      }
      return ids;
    } catch {
      return [];
    }
  };

  /* Delete all SR events tracked on a verse. */
  const clearSrForVerse = async (verse) => {
    if (!Array.isArray(verse?.srEventIds) || !verse.srEventIds.length) return;
    try { await calendarService.bulkDelete(verse.srEventIds); } catch { /* noop */ }
  };

  /* Open the SR popup with no days pre-selected — the user picks
     them on the calendar grid. */
  const openSrPopup = () => {
    setSrPopup({ selected: [], error: '' });
  };

  /* Toggle one day-offset on/off in the popup. */
  const toggleSrDay = (offset) => {
    setSrPopup(p => {
      if (!p) return p;
      const s = new Set(p.selected);
      if (s.has(offset)) s.delete(offset);
      else s.add(offset);
      return {
        ...p,
        selected: [...s].sort((a, b) => a - b),
        error: '',
      };
    });
  };

  /* Confirm the popup — schedule SR events for the picked offsets.
     The calendar grid only allows clicking valid days, so we don't
     need extra validation here beyond "at least one selected". */
  const confirmSrPopup = async () => {
    if (!current || !srPopup) return;
    if (maxReviewOffset <= 0) {
      setSrPopup(p => p && ({
        ...p,
        error: 'No room for reviews — your next Pick New Verse reminder is today or tomorrow.',
      }));
      return;
    }
    if (!srPopup.selected.length) {
      setSrPopup(p => p && ({ ...p, error: 'Pick at least one day on the calendar.' }));
      return;
    }
    if ((current.srEventIds || []).length) await clearSrForVerse(current);
    const ids = await scheduleSrForVerse(current, srPopup.selected);
    save(verses.map(v => v.id === current.id ? { ...v, srEventIds: ids } : v));
    setSrPopup(null);
  };

  /* Stop SR on the current verse (no popup needed). */
  const stopSrOnCurrent = async () => {
    if (!current) return;
    await clearSrForVerse(current);
    save(verses.map(v => v.id === current.id ? { ...v, srEventIds: [] } : v));
    setSrPopup(null);
  };

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  /* Memorized list lives in Page Settings → Memorized sub-tab. The
     dashboard no longer renders it inline. */

  return (
    <div className="jd-card">
      <div className="jd-card-hd">
        <span className="jd-card-icon">📝</span>
        <span className="jd-card-title">Memory Verse</span>
        <button className="jd-small-btn" onClick={()=>setShowAdd(v=>!v)}>
          {showAdd ? 'Cancel' : '+ Set verse'}
        </button>
      </div>

      {showAdd && (
        <div className="jd-mv-form">
          <div className="jd-mv-ref-row">
            <input
              className="jd-inp"
              placeholder="Reference (e.g. Philippians 4:13)"
              value={newRef}
              onChange={e => handleRefChange(e.target.value)}
            />
            {fetchLoading && (
              <div className="jd-mv-spinner" aria-label="Loading verse">
                <div className="jd-mv-dot"/><div className="jd-mv-dot"/><div className="jd-mv-dot"/>
              </div>
            )}
          </div>

          {/* Numbered preview (the only display of fetched text). */}
          {newNumbered.length > 0 && (
            <div className="jd-mv-preview">
              {newNumbered.map((v, i) => (
                <div key={i} className="jd-mv-preview-line">
                  <span className="jd-mv-vnum">{v.n}</span>
                  <span className="jd-mv-vtxt">{v.t}</span>
                </div>
              ))}
            </div>
          )}

          {/* Visible failure notice — replaces the old silent blank. */}
          {fetchError && !fetchLoading && (
            <div className="jd-mv-error" role="alert">{fetchError}</div>
          )}

          <div className="jd-mv-form-row" style={{justifyContent:'flex-end'}}>
            <button className="jd-add-btn" onClick={handleAdd} disabled={fetchLoading||!newRef.trim()}>
              {fetchLoading ? '…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {current ? (
        <div className="jd-mv-current">
          <div className="jd-mv-current-hd">
            <div className="jd-mv-ref">{current.ref}</div>
            <button
              className="jd-mv-collapse"
              onClick={() => setCurrentCollapsed(c => !c)}
              title={currentCollapsed ? 'Expand verse' : 'Collapse verse'}
            >
              {currentCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
          </div>

          {!currentCollapsed && (
            <>
              <div className="jd-mv-verses">
                {numberedForDisplay(current).map((v, i) => (
                  <div key={i} className="jd-mv-verse-line">
                    {v.n !== '' && <span className="jd-mv-vnum">{v.n}</span>}
                    <span className="jd-mv-vtxt">{v.t}</span>
                  </div>
                ))}
              </div>

              <div className="jd-mv-meta">
                Added {format(parseISO(current.addedAt),'MMM d, yyyy')}
              </div>

              {/* SR confirmation pill — shows whenever SR is on for
                  the current verse (regardless of memorized state). */}
              {(current.srEventIds || []).length > 0 && (
                <div className="jd-mv-sr-pill">
                  🗓 {(current.srEventIds || []).length} review reminders scheduled on Calendar
                </div>
              )}

              {/* Inline Schedule-reviews popup. Pops beneath the
                  verse when the user clicks the button below. Shows
                  a calendar grid where the user clicks days to
                  toggle selection. */}
              {srPopup && (() => {
                const cells = buildSrCells();
                const nextPnv = new Date();
                nextPnv.setDate(nextPnv.getDate() + daysUntilNext);
                const pnvLabel = format(nextPnv, 'EEE, MMM d');
                const selectedSet = new Set(srPopup.selected);
                return (
                  <div className="jd-mv-sr-popup">
                    <div className="jd-mv-sr-popup-hd">
                      🗓 Schedule SR Reviews
                      <button
                        type="button"
                        className="jd-mv-sr-popup-close"
                        onClick={() => setSrPopup(null)}
                        aria-label="Close"
                      >✕</button>
                    </div>
                    <div className="jd-mv-sr-popup-sub">
                      {maxReviewOffset <= 0 ? (
                        <>Your next Pick New Verse reminder is <b>today or tomorrow</b> — no days available to schedule.</>
                      ) : (
                        <>Tap any open day to add a review. Next Pick New Verse: <b>{pnvLabel}</b>.</>
                      )}
                    </div>

                    {/* Weekday header */}
                    <div className="jd-mv-sr-cal-head">
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <div key={i} className="jd-mv-sr-cal-head-cell">{d}</div>
                      ))}
                    </div>

                    {/* Day grid */}
                    <div className="jd-mv-sr-cal-grid">
                      {cells.map((c, i) => {
                        if (c.kind === 'pad') {
                          return <div key={`p-${i}`} className="jd-mv-sr-cell pad"/>;
                        }
                        const isSelected = selectedSet.has(c.offset);
                        const isClickable = c.kind === 'available';
                        return (
                          <button
                            key={c.offset}
                            type="button"
                            className={`jd-mv-sr-cell ${c.kind} ${isSelected ? 'selected' : ''}`}
                            onClick={() => isClickable && toggleSrDay(c.offset)}
                            disabled={!isClickable}
                            aria-label={
                              c.kind === 'today' ? 'Today'
                              : c.kind === 'pnv' ? `Pick New Verse on ${format(c.date, 'EEE, MMM d')}`
                              : `Day +${c.offset}, ${format(c.date, 'EEE, MMM d')}`
                            }
                          >
                            <div className="jd-mv-sr-cell-num">{c.dayOfMonth}</div>
                            {c.kind === 'today' && <div className="jd-mv-sr-cell-tag">Today</div>}
                            {c.kind === 'pnv' && <div className="jd-mv-sr-cell-tag pnv">PNV</div>}
                            {isSelected && <div className="jd-mv-sr-cell-check">✓</div>}
                          </button>
                        );
                      })}
                    </div>

                    {srPopup.error && (
                      <div className="jd-mv-sr-popup-err">{srPopup.error}</div>
                    )}

                    <div className="jd-mv-sr-popup-ft">
                      <span className="jd-mv-sr-popup-count">
                        {srPopup.selected.length} day{srPopup.selected.length === 1 ? '' : 's'} selected
                      </span>
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          type="button"
                          className="jd-mv-sr-popup-cancel"
                          onClick={() => setSrPopup(null)}
                        >Cancel</button>
                        <button
                          type="button"
                          className="jd-mv-sr-popup-save"
                          onClick={confirmSrPopup}
                          disabled={maxReviewOffset <= 0}
                        >✓ Schedule</button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="jd-mv-actions">
                <button
                  className={`jd-mv-memorize-btn ${current.memorized ? 'on' : ''}`}
                  onClick={() => toggleMemorized(current)}
                  title={current.memorized ? 'Unmark as memorized' : 'Mark as memorized'}
                >{current.memorized ? '✓ Memorized' : '◯ Mark memorized'}</button>
                <button
                  className={`jd-mv-sr-btn ${(current.srEventIds || []).length ? 'on' : ''}`}
                  onClick={() => {
                    if ((current.srEventIds || []).length) stopSrOnCurrent();
                    else openSrPopup();
                  }}
                  title={(current.srEventIds || []).length
                    ? 'Stop the SR review schedule for this verse'
                    : 'Schedule SR review reminders for this verse'}
                >{(current.srEventIds || []).length
                  ? '✕ Stop reviews'
                  : '🗓 Schedule reviews'}</button>
                <button
                  className="jd-mv-archive-btn"
                  onClick={() => handleArchive(current)}
                  title="Move to archive (keeps the verse, clears its calendar reminders)"
                >📦 Archive</button>
                <button
                  className="jd-mv-delete-btn"
                  onClick={() => handleDelete(current)}
                  title="Delete this verse permanently"
                >🗑 Delete</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="jd-mv-empty">No verse set yet. Add one above to begin memorizing.</div>
      )}

      {/* Calendar sync UI moved to Page Settings → Pick New Verse. */}

      {/* Archived + Memorized lists used to live here as inline
          collapsible sections. They were moved to Page Settings →
          Archived / Memorized sub-tabs so the dashboard stays focused
          on the current verse. Access past verses via
          Profile → Page Settings. */}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────
export default function JournalDashboard({ entries, onOpenNew, onOpenView }) {
  const [cloudExpanded, setCloudExpanded] = useState(false);

  /* Live Page Settings — used to hide individual dashboard cards
     and to render goal progress + vacation badges. */
  const [dashSettings] = useJournalDashboardSettings();
  const [goals]        = useJournalGoals();
  const visible = dashSettings?.visible || {};
  const isCardOn = (id) => visible[id] !== false; // default true if missing

  const heatmap   = useMemo(() => get30DayHeatmap(entries), [entries]);
  const stats     = useMemo(() => getEntryStats(entries), [entries]);
  const wordCloud = useMemo(() => buildWordCloud(entries), [entries]);
  const coverage  = useMemo(() => getScriptureCoverage(entries), [entries]);
  const onThisDay = useMemo(() => getOnThisDay(entries), [entries]);

  /* Goal progress: entries written today vs daily goal, and entries
     this week vs weekly goal. Vacation mode just disables the
     progress visual + nudges (the count itself is still accurate). */
  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }, []);
  const onVacation = useMemo(() => isOnVacation(goals, todayISO), [goals, todayISO]);
  /* Dashboard prompt — picks a fresh random prompt on each page load
     (was previously a stable "today's prompt" rotation based on day
     of month). The pool is intentionally a different curated subset
     from the entry-form pool to keep things visually varied. */
  const prompt = useMemo(() => {
    const PROMPTS = [
      "What is God speaking to you about today?",
      "Where did you see God's hand in your life this week?",
      "What are you grateful for right now, even in difficulty?",
      "What is one area where you need to trust God more?",
      "Who has God placed on your heart to pray for?",
      "What scripture has been standing out to you lately?",
      "What burden are you ready to lay down today?",
      "Where is the Spirit asking you to slow down?",
      "What did God provide this week that surprised you?",
      "What honest question do you want to bring to God right now?",
      "Whose name keeps coming to mind when you pray?",
      "What would obedience look like for you this week?",
    ];
    return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  }, []);

  // Entry length data — last 20 entries reversed chronologically
  const lengthData = useMemo(() =>
    entries.slice(0,20).reverse().map(e => ({
      date: e.created_at,
      words: wordCount(e.content),
      title: e.title,
    }))
  , [entries]);

  const maxWords  = Math.max(...lengthData.map(d=>d.words), 1);
  const maxCloud  = wordCloud[0]?.count || 1;
  const today     = new Date();
  const totalEntries = entries.length;
  const writtenToday = entries.filter(e => {
    try { return isToday(parseISO(e.created_at)); } catch { return false; }
  }).length;

  // 30-day grid
  const days30 = Array.from({length:30},(_,i)=>subDays(today,29-i));

  // Unique OT/NT books
  const covEntries = Object.entries(coverage);
  const otBooks = covEntries.filter(([,v])=>v.testament==='OT');
  const ntBooks = covEntries.filter(([,v])=>v.testament==='NT');

  if (entries.length === 0) return (
    <div className="j-dashboard">
      <div className="j-dash-glow" aria-hidden="true"/>
      <div className="jd-card" style={{textAlign:'center',padding:'40px 24px'}}>
        <div style={{fontSize:48,marginBottom:12,opacity:.5}}>📖</div>
        <div className="jd-empty-title">Begin your prayer journal</div>
        <div className="jd-empty-sub">Your dashboard will fill with writing patterns, themes, and spiritual insights as you write.</div>

        <div className="j-start-steps">
          <div className="j-start-title">Instructions</div>
          <ol className="j-start-list">
            <li><b>Tap “New Entry”</b> in the top-right and write what’s on your heart.</li>
            <li><b>Add a scripture</b> if one’s standing out — verses load automatically.</li>
            <li><b>Lock</b> any sensitive entries with a code from the entry editor.</li>
          </ol>
        </div>

        <button className="j-dash-write-btn" onClick={onOpenNew} style={{marginTop:16}}>✦ Write your first entry</button>
        <div className="j-empty-verse" style={{marginTop:20}}>
          "Do not be anxious about anything, but in every situation,<br/>
          by prayer and petition, present your requests to God."<br/>
          <span>— Philippians 4:6</span>
        </div>
      </div>
      <MemoryVerse />
    </div>
  );

  return (
    <div className="j-dashboard">
      <div className="j-dash-glow" aria-hidden="true"/>

      {/* ── TODAY'S PROMPT ── */}
      {isCardOn('todaysPrompt') && (
      <div className="jd-prompt-card">
        <div className="jd-prompt-lbl">✨ Today's Reflection Prompt</div>
        <div className="jd-prompt-text">"{prompt}"</div>
        <button className="j-dash-write-btn" onClick={onOpenNew}>✦ Write Today's Entry</button>
      </div>
      )}

      {/* ── GOAL PROGRESS (always-on, driven by Page Settings → Goals) ── */}
      {(goals.dailyGoal > 0 || goals.weeklyGoal > 0) && (
        <div className="jd-card jd-goals-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">🎯</span>
            <span className="jd-card-title">Goals</span>
            {onVacation && <span className="jd-vacation-pill">🏖 On vacation</span>}
          </div>
          {goals.dailyGoal > 0 && (
            <GoalRow
              label="Today"
              value={writtenToday}
              target={goals.dailyGoal}
              color="#fcd34d"
              dimmed={onVacation}
            />
          )}
          {goals.weeklyGoal > 0 && (
            <GoalRow
              label="This week"
              value={stats.last7}
              target={goals.weeklyGoal}
              color="#a78bfa"
              dimmed={onVacation}
            />
          )}
        </div>
      )}

      {/* ── ENTRY STATS ROW (entries, not days) ── */}
      {isCardOn('statsRow') && (
      <div className="jd-stats-row">
        <div className="jd-stat-card jd-streak">
          <div className="jd-streak-nums">
            <div>
              <div className="jd-streak-n" style={{color:'#f59e0b'}}>{stats.total}</div>
              <div className="jd-streak-lbl">Entries written</div>
            </div>
            <div className="jd-streak-sep">·</div>
            <div>
              <div className="jd-streak-n" style={{color:'#fcd34d'}}>{stats.last7}</div>
              <div className="jd-streak-lbl">Last 7 days</div>
            </div>
          </div>
          <div className="jd-streak-sub">
            {stats.total === 0
              ? 'Write your first entry to get started'
              : stats.mostInOneDay > 1
              ? `📝 Best day: ${stats.mostInOneDay} entries`
              : '📝 Keep adding entries to build your record'}
          </div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n">{totalEntries}</div>
          <div className="jd-stat-lbl">Total Entries</div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n" style={{color:'#fcd34d'}}>{writtenToday}</div>
          <div className="jd-stat-lbl">Written Today</div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n" style={{color:'#6ee7b7'}}>{covEntries.length}</div>
          <div className="jd-stat-lbl">Books Referenced</div>
        </div>
      </div>
      )}

      {/* ── WRITING RHYTHM ── */}
      {isCardOn('heatmap') && (
      <div className="jd-card">
        <div className="jd-card-hd">
          <span className="jd-card-icon">📅</span>
          <span className="jd-card-title">Writing Rhythm</span>
          <span className="jd-card-sub">Last 30 days</span>
        </div>
        <div className="jd-heatmap">
          {days30.map((day, i) => {
            const key   = format(day, 'yyyy-MM-dd');
            const data  = heatmap[key];
            const count = data?.count || 0;
            const color = count === 0
              ? 'rgba(255,255,255,.06)'
              : 'rgba(140,100,255,.85)';
            return (
              <div
                key={i}
                className="jd-heat-cell"
                title={`${format(day,'MMM d')} · ${count} entr${count!==1?'ies':'y'}`}
                style={{
                  background: color,
                  opacity: count > 0 ? Math.min(1, 0.4 + count * 0.3) : 1,
                }}
              />
            );
          })}
        </div>
        <div className="jd-heatmap-legend">
          <span className="jd-heat-lbl">30 days ago</span>
          <div style={{display:'flex',gap:3,alignItems:'center'}}>
            <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>Less</span>
            {[0,.15,.35,.6,.85].map((o,i)=>
              <div key={i} style={{width:10,height:10,borderRadius:2,background:`rgba(140,100,255,${o||.06})`}}/>
            )}
            <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>More</span>
          </div>
          <span className="jd-heat-lbl">Today</span>
        </div>
      </div>
      )}

      {/* ── ENTRY LENGTH OVER TIME ── */}
      {isCardOn('entryLength') && lengthData.length > 1 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">📏</span>
            <span className="jd-card-title">Entry Length Over Time</span>
            <span className="jd-card-sub">Words per entry</span>
          </div>
          <div className="jd-length-chart">
            {lengthData.map((d,i) => (
              <div key={i} className="jd-length-col"
                title={`${d.title}\n${format(parseISO(d.date),'MMM d')} · ${d.words} words`}>
                <div className="jd-length-bar-wrap">
                  <div className="jd-length-bar"
                    style={{
                      height: `${Math.max(4, Math.round((d.words/maxWords)*100))}%`,
                      background: '#8b5cf6',
                    }}/>
                </div>
                <div className="jd-length-lbl">{format(parseISO(d.date),'M/d')}</div>
              </div>
            ))}
          </div>
          <div className="jd-length-legend">
            <span>Hover a bar for entry details</span>
            <span>Max: {Math.max(...lengthData.map(d=>d.words))} words</span>
          </div>
        </div>
      )}

      {/* ── WORD CLOUD / THEMES ── */}
      {isCardOn('wordCloud') && wordCloud.length > 0 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">💬</span>
            <span className="jd-card-title">Themes & Words</span>
            <span className="jd-card-sub">Most common across all entries</span>
            <button className="jd-small-btn" onClick={()=>setCloudExpanded(v=>!v)}>
              {cloudExpanded ? 'Less' : 'More'}
            </button>
          </div>
          <div className="jd-word-cloud">
            {(cloudExpanded ? wordCloud : wordCloud.slice(0,20)).map(({word,count},i) => {
              const size = 10 + Math.round((count/maxCloud)*16);
              const opacity = 0.4 + (count/maxCloud)*0.6;
              const colors = ['#c4b5fd','#7dd3fc','#6ee7b7','#fcd34d','#f9a8d4','#fb923c'];
              return (
                <span key={i} className="jd-word"
                  style={{ fontSize:size, opacity, color: colors[i%colors.length] }}
                  title={`"${word}" · ${count} time${count!==1?'s':''}`}>
                  {word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SCRIPTURE COVERAGE ── */}
      {isCardOn('scriptureCoverage') && covEntries.length > 0 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">📜</span>
            <span className="jd-card-title">Scripture Coverage</span>
            <span className="jd-card-sub">{otBooks.length} OT · {ntBooks.length} NT books</span>
          </div>
          {[['Old Testament', otBooks], ['New Testament', ntBooks]].map(([label, books]) =>
            books.length > 0 ? (
              <div key={label} className="jd-coverage-section">
                <div className="jd-coverage-lbl">{label}</div>
                <div className="jd-coverage-books">
                  {books.sort((a,b)=>b[1].count-a[1].count).map(([book, data]) => (
                    <div key={book} className="jd-book-chip"
                      style={{ opacity: Math.min(1, 0.5 + data.count*0.15) }}
                      title={`${book} · ${data.count} reference${data.count!==1?'s':''}`}>
                      {book.length > 8 ? book.split(' ').map(w=>w[0]).join('') : book}
                      <span className="jd-book-count">{data.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* ── ON THIS DAY ── */}
      {isCardOn('onThisDay') && onThisDay.length > 0 && (
        <div className="jd-card jd-on-this-day">
          <div className="jd-card-hd">
            <span className="jd-card-icon">🕰</span>
            <span className="jd-card-title">On This Day</span>
            <span className="jd-card-sub">{format(today,'MMMM d')} in past years</span>
          </div>
          {onThisDay.map(e => {
            const yr = parseISO(e.created_at).getFullYear();
            const ago = today.getFullYear() - yr;
            return (
              <div key={e.id} className="jd-otd-item" onClick={()=>onOpenView(e)}>
                <div className="jd-otd-year">{yr}<span>{ago}yr ago</span></div>
                <div className="jd-otd-body">
                  <div className="jd-otd-title">{e.title}</div>
                  <div className="jd-otd-snippet">{(e.content||'').slice(0,100)}{e.content?.length>100?'…':''}</div>
                </div>
                <button className="jd-otd-read">Read →</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MEMORY VERSE ── */}
      {isCardOn('memoryVerse') && <MemoryVerse />}

    </div>
  );
}

/* Goal progress bar — small two-row card row showing how close the
   user is to their daily / weekly entry goal. Dims while on
   vacation so progress feels paused rather than missed. */
function GoalRow({ label, value, target, color, dimmed }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const done = value >= target;
  return (
    <div className={`jd-goal-row ${dimmed ? 'dim' : ''}`}>
      <div className="jd-goal-hd">
        <span className="jd-goal-lbl">{label}</span>
        <span className="jd-goal-val">
          <b style={{ color: done ? '#6ee7b7' : color }}>{value}</b>
          <span style={{ opacity:.45 }}>/{target}</span>
          {done && <span className="jd-goal-check"> ✓</span>}
        </span>
      </div>
      <div className="jd-goal-track">
        <div
          className="jd-goal-fill"
          style={{ width: `${pct}%`, background: done ? '#6ee7b7' : color }}
        />
      </div>
    </div>
  );
}
