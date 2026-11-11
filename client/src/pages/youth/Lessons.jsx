import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import NavRail from '../../components/layout/NavRail';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Lessons.css';

/* Youth → Lessons & Series
   Storage:
     youth:lessons — flat library of lesson objects (each lesson lives once)
     youth:series  — series objects with lessonIds[] referencing the library
   Scheduled lessons push to calendar-events (source: 'youth-lesson').

   Lessons are many-to-many: a single lesson can be attached to multiple
   series. Attaching/detaching only changes a series' lessonIds — the
   lesson itself stays in the library until explicitly deleted. */

const ACCENT = '#a16207';
const CAL_SOURCE = 'youth-lesson';
const GENERIC_COLOR = '#9f1239';

const AUDIENCES = [
  { key: '',        label: 'Any audience' },
  { key: 'MS',      label: 'Middle School' },
  { key: 'HS',      label: 'High School' },
  { key: 'Mixed',   label: 'Mixed (MS + HS)' },
  { key: 'College', label: 'College / YA' },
  { key: 'Other',   label: 'Other' },
];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_SERIES = () => ({
  id: makeId('sr'),
  title: '',
  theme: '',
  description: '',
  color: GENERIC_COLOR,
  audience: '',
  tags: [],
  archived: false,
  lessonIds: [],
  createdAt: Date.now(),
});
const DEFAULT_LESSON = () => ({
  id: makeId('ls'),
  title: '',
  bigIdea: '',
  audience: '',            // '' / MS / HS / Mixed / College / Other
  scripturePassages: [],   // [{ id, reference, text, verses }]
  outline: '',
  discussion: ['', '', ''],
  mediaLinks: [],          // [{ id, url, label }]
  linkedGames: [],         // [{ id, gameId, position: 'before' | 'after' }]
  leaderNotes: '',
  schedules: [],           // [{ id, date, time, syncToCalendar }]
  teachings: [],
});

/* Time picker option arrays. */
const HOUR_OPTIONS   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTE_OPTIONS = ['00','05','10','15','20','25','30','35','40','45','50','55'];

function parseTime(s) {
  if (!s) return { hh: '', mm: '00', ap: 'AM' };
  const m = String(s).trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return { hh: '', mm: '00', ap: 'AM' };
  return { hh: m[1] || '', mm: m[2] || '00', ap: m[3] || 'AM' };
}
const formatTime = ({ hh, mm, ap }) => hh ? `${hh}:${mm || '00'} ${ap || 'AM'}` : '';

/** Make a URL safe to drop into href — prefixes https:// if the
 *  user typed a bare domain. Keeps mailto: + http(s):// as-is. */
function normalizeUrl(u) {
  const t = (u || '').trim();
  if (!t) return '';
  if (/^(https?:)?\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  return `https://${t}`;
}

function normalizeLesson(l) {
  if (!l) return l;
  const next = { ...l };
  if (!Array.isArray(next.teachings)) {
    next.teachings = [];
    if (l.taught) {
      next.teachings.push({
        id: makeId('th'),
        date: l.taughtDate || '',
        teacher: '', location: '', attendance: 0, rating: 0, debrief: '',
      });
    }
  }
  if (typeof next.audience !== 'string') next.audience = '';
  if (!Array.isArray(next.linkedGames)) next.linkedGames = [];
  if (!Array.isArray(next.discussion)) next.discussion = ['', '', ''];
  /* Migrate legacy single `scripture` string → passages array. */
  if (!Array.isArray(next.scripturePassages)) {
    next.scripturePassages = next.scripture
      ? [{ id: makeId('sp'), reference: String(next.scripture), text: '' }]
      : [];
  }
  /* Migrate legacy single `scheduledDate` + `syncToCalendar` →
     schedules array. Each schedule keeps its own date / time /
     sync flag so a lesson can be taught on multiple Sundays. */
  if (!Array.isArray(next.schedules)) {
    next.schedules = l.scheduledDate
      ? [{
          id: makeId('sch'),
          date: l.scheduledDate,
          time: '',
          syncToCalendar: !!l.syncToCalendar,
        }]
      : [];
  }
  /* Migrate legacy single `media` URL → mediaLinks array. */
  if (!Array.isArray(next.mediaLinks)) {
    next.mediaLinks = l.media
      ? [{ id: makeId('ml'), url: String(l.media), label: '' }]
      : [];
  }
  return next;
}

/** Fetch scripture from bible-api.com (free, no key needed, WEB
 *  translation). Returns `{ text, verses }` — the verses array
 *  preserves chapter + verse numbers so the renderer can show
 *  proper inline numbering, like a real Bible. Null on failure. */
async function fetchScripture(reference) {
  const ref = (reference || '').trim();
  if (!ref) return null;
  try {
    const slug = encodeURIComponent(ref.toLowerCase().replace(/\s+/g, '+'));
    const r = await fetch(`https://bible-api.com/${slug}`);
    if (!r.ok) return null;
    const data = await r.json();
    const verses = (data.verses || []).map(v => ({
      chapter: v.chapter,
      number:  v.verse,
      text:    (v.text || '').trim(),
    }));
    const text = (data.text || '').trim();
    if (!text && verses.length === 0) return null;
    return { text, verses };
  } catch {
    return null;
  }
}
function normalizeSeries(s) {
  if (!s) return s;
  return {
    ...s,
    audience:  typeof s.audience === 'string' ? s.audience : '',
    tags:      Array.isArray(s.tags) ? s.tags : [],
    lessonIds: Array.isArray(s.lessonIds) ? s.lessonIds : [],
  };
}

/** Reconcile legacy nested-lessons shape with the new lessons-library
 *  shape on every read. Lessons embedded under a series get hoisted
 *  into the library and replaced with their ids. Already-migrated
 *  series + the existing lessons store pass through untouched. */
function migrate(seriesRaw, lessonsRaw) {
  const existingLessons = (Array.isArray(lessonsRaw) ? lessonsRaw : []).map(normalizeLesson);
  const byId = new Map(existingLessons.map(l => [l.id, l]));

  const series = (Array.isArray(seriesRaw) ? seriesRaw : []).map(s => {
    /* Already on new shape — strip any stale `lessons` field if present. */
    if (Array.isArray(s.lessonIds) && !Array.isArray(s.lessons)) {
      return normalizeSeries(s);
    }
    /* Hoist embedded lessons into the library, build lessonIds. */
    const ids = [];
    (s.lessons || []).forEach(l => {
      const lesson = normalizeLesson(l);
      if (!byId.has(lesson.id)) byId.set(lesson.id, lesson);
      ids.push(lesson.id);
    });
    /* eslint-disable-next-line no-unused-vars */
    const { lessons: _drop, ...rest } = s;
    return normalizeSeries({ ...rest, lessonIds: ids });
  });

  return { series, lessons: [...byId.values()] };
}

const daysAgo = (iso) => {
  if (!iso) return null;
  try { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
  catch { return null; }
};

export default function Lessons() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [seriesRaw,  setSeries,  { loading: sl }] = useUserStoreKey('youth:series',  []);
  const [lessonsRaw, setLessons, { loading: ll }] = useUserStoreKey('youth:lessons', []);
  const [games] = useUserStoreKey('youth:games', []);
  const [calendarEvents, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const gameList = useMemo(() => Array.isArray(games) ? games : [], [games]);
  const navigate = useNavigate();

  /* Normalized view: lessons live in `lessons`, series have lessonIds. */
  const { series: seriesList, lessons: lessonLib } = useMemo(
    () => migrate(seriesRaw, lessonsRaw),
    [seriesRaw, lessonsRaw]
  );

  /* Persist the migrated shape one time when legacy nested data is detected.
     After the writeback, the next read no longer triggers `needsWriteback`,
     so the effect exits cleanly without an infinite loop. */
  useEffect(() => {
    if (!Array.isArray(seriesRaw)) return;
    const needsWriteback = seriesRaw.some(s => Array.isArray(s.lessons));
    if (!needsWriteback) return;
    setSeries(seriesList);
    setLessons(lessonLib);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesRaw, lessonsRaw]);

  const lessonById = useMemo(() => {
    const m = new Map();
    for (const l of lessonLib) m.set(l.id, l);
    return m;
  }, [lessonLib]);

  /* Reverse-index: lessonId → [seriesId, seriesId…] for "Appears in" pills. */
  const seriesByLesson = useMemo(() => {
    const m = new Map();
    for (const s of seriesList) {
      for (const lid of (s.lessonIds || [])) {
        if (!m.has(lid)) m.set(lid, []);
        m.get(lid).push(s.id);
      }
    }
    return m;
  }, [seriesList]);

  const [view, setView] = useState('series');         // 'series' | 'lessons'
  const [openSeriesId,  setOpenSeriesId]  = useState(null);
  const [openLessonId,  setOpenLessonId]  = useState(null);
  const [showAttachFor, setShowAttachFor] = useState(null);   // seriesId for Attach picker
  const [statusFilter,   setStatusFilter]   = useState('active');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [tagFilter,      setTagFilter]      = useState('');
  const [query, setQuery] = useState('');

  const allTags = useMemo(() => {
    const set = new Set();
    seriesList.forEach(s => (s.tags || []).forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [seriesList]);

  /* ── Calendar sync ──────────────────────────────────────────
     Per-schedule events keyed by source_id = `${lessonId}__${scheduleId}`.
     The "rebuild" strategy (drop everything for this lesson, write
     the new set) avoids stale events when schedules are added,
     removed, or unsynced. Legacy `source_id === lessonId` events
     also get cleaned up on first touch. */
  const syncLessonCalendarEvents = (lesson, color) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const lessonPrefix = `${lesson.id}__`;

      /* Drop everything that belongs to this lesson — legacy or new. */
      const others = evList.filter(e => {
        if (e.source !== CAL_SOURCE) return true;
        const sid = e.source_id || '';
        return sid !== lesson.id && !sid.startsWith(lessonPrefix);
      });

      /* Build the desired event list from synced schedules with a date. */
      const desired = (lesson.schedules || [])
        .filter(s => s.syncToCalendar && s.date)
        .map((s, i) => ({
          id: 'ce_' + Date.now().toString(36) + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
          created_at: new Date().toISOString(),
          title:           lesson.title || 'Lesson',
          description:     [lesson.bigIdea, lesson.scripturePassages?.[0]?.reference].filter(Boolean).join(' — '),
          event_date:      s.date,
          end_date:        '',
          event_time:      s.time || '',
          color:           color || GENERIC_COLOR,
          category:        'youth',
          source:          CAL_SOURCE,
          source_id:       lessonPrefix + s.id,
          reminder_offset: 'none',
          reminder_time:   '',
          reminder_note:   '',
        }));

      return [...desired, ...others];
    });
  };

  /** Remove every calendar event tied to this lesson (any schedule
   *  + legacy single-event format). Called when the lesson itself
   *  is deleted. */
  const removeCalendarFor = (lessonId) =>
    setCalendarEvents(prev => (prev || []).filter(e => {
      if (e.source !== CAL_SOURCE) return true;
      const sid = e.source_id || '';
      return sid !== lessonId && !sid.startsWith(`${lessonId}__`);
    }));

  /** Color used when a synced lesson pushes to the Calendar: first
   *  attached series' color, or the generic Youth color if unfiled. */
  const colorForLesson = (lessonId) => {
    const sids = seriesByLesson.get(lessonId) || [];
    return seriesList.find(s => s.id === sids[0])?.color || GENERIC_COLOR;
  };

  /* ── Mutations ─────────────────────────────────────────────── */
  const addSeries = () => {
    const s = DEFAULT_SERIES();
    setSeries(prev => [s, ...(prev || [])].map(normalizeSeries));
    setOpenSeriesId(s.id);
  };
  const updateSeries = (id, patch) =>
    setSeries(prev => (prev || []).map(s => s.id === id ? { ...normalizeSeries(s), ...patch } : s));
  const removeSeries = (id) => {
    if (!confirm('Delete this series? Lessons stay in your library.')) return;
    setSeries(prev => (prev || []).filter(s => s.id !== id));
    if (openSeriesId === id) { setOpenSeriesId(null); setOpenLessonId(null); }
  };

  const reorderLessonsIn = (seriesId, newIds) => {
    setSeries(prev => (prev || []).map(s => s.id === seriesId
      ? { ...normalizeSeries(s), lessonIds: newIds }
      : s));
  };

  /* Create a brand-new lesson AND attach it to a series in one step. */
  const addLessonToSeries = (seriesId) => {
    const newLesson = DEFAULT_LESSON();
    setLessons(prev => [...(prev || []), newLesson]);
    setSeries(prev => (prev || []).map(s => s.id === seriesId
      ? { ...normalizeSeries(s), lessonIds: [...(s.lessonIds || []), newLesson.id] }
      : s));
    setOpenLessonId(newLesson.id);
  };

  /* Create an unfiled lesson (no series attached). */
  const addUnfiledLesson = () => {
    const newLesson = DEFAULT_LESSON();
    setLessons(prev => [...(prev || []), newLesson]);
    setOpenLessonId(newLesson.id);
  };

  const attachLessonsToSeries = (seriesId, ids) => {
    setSeries(prev => (prev || []).map(s => {
      if (s.id !== seriesId) return s;
      const existing = new Set(s.lessonIds || []);
      const next = [...(s.lessonIds || [])];
      ids.forEach(id => { if (!existing.has(id)) { next.push(id); existing.add(id); } });
      return { ...normalizeSeries(s), lessonIds: next };
    }));
  };

  const detachLessonFromSeries = (seriesId, lessonId) => {
    setSeries(prev => (prev || []).map(s => s.id === seriesId
      ? { ...normalizeSeries(s), lessonIds: (s.lessonIds || []).filter(id => id !== lessonId) }
      : s));
  };

  /** Sync a lesson's series memberships from the lesson side —
   *  pass the exact set of series ids the lesson should belong to.
   *  Walks every series and adds/removes the lesson id accordingly. */
  const setLessonSeriesMemberships = (lessonId, seriesIdsSet) => {
    const want = new Set(seriesIdsSet);
    setSeries(prev => (prev || []).map(s => {
      const has = (s.lessonIds || []).includes(lessonId);
      const should = want.has(s.id);
      if (has === should) return s;
      const ids = should
        ? [...(s.lessonIds || []), lessonId]
        : (s.lessonIds || []).filter(id => id !== lessonId);
      return { ...normalizeSeries(s), lessonIds: ids };
    }));
  };

  /** Create a new series with a single starter title and return its id —
   *  used by the inline "+ New series" option in the lesson page picker. */
  const createSeriesQuick = (title) => {
    const s = { ...DEFAULT_SERIES(), title: title || 'New series' };
    setSeries(prev => [s, ...(prev || [])].map(normalizeSeries));
    return s.id;
  };

  const updateLesson = (lessonId, patch) => {
    setLessons(prev => {
      const next = (prev || []).map(l => l.id === lessonId ? { ...l, ...patch } : l);
      const updated = next.find(l => l.id === lessonId);
      if (updated) syncLessonCalendarEvents(updated, colorForLesson(lessonId));
      return next;
    });
  };

  const duplicateLesson = (lessonId) => {
    const src = lessonById.get(lessonId);
    if (!src) return null;
    const copy = {
      ...src,
      id: makeId('ls'),
      title: (src.title || 'Lesson') + ' (copy)',
      teachings: [],
      /* Reset scheduling on a duplicate — the copy gets a fresh
         set of dates rather than re-syncing the original's events. */
      schedules: [],
    };
    setLessons(prev => [...(prev || []), copy]);
    return copy.id;
  };

  /* Permanently delete a lesson and unlink it from every series. */
  const deleteLessonPermanently = (lessonId) => {
    if (!confirm('Delete this lesson permanently? It will be removed from every series that uses it.')) return;
    setLessons(prev => (prev || []).filter(l => l.id !== lessonId));
    setSeries(prev => (prev || []).map(s => ({
      ...normalizeSeries(s),
      lessonIds: (s.lessonIds || []).filter(id => id !== lessonId),
    })));
    removeCalendarFor(lessonId);
    if (openLessonId === lessonId) setOpenLessonId(null);
  };

  /* ── Filter logic, reused by both views ────────────────────── */
  const matchesQuery = (lesson, q) => {
    if (!q) return true;
    const hay = [
      lesson.title, lesson.bigIdea, lesson.scripture, lesson.outline, lesson.leaderNotes,
      ...(lesson.discussion || []),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  };

  const visibleSeries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return seriesList.filter(s => {
      if (statusFilter === 'active'   && s.archived) return false;
      if (statusFilter === 'archived' && !s.archived) return false;
      if (audienceFilter && s.audience !== audienceFilter) return false;
      if (tagFilter && !(s.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      const seriesHay = [s.title, s.theme, s.description, ...(s.tags || [])].join(' ').toLowerCase();
      if (seriesHay.includes(q)) return true;
      /* Match if any attached lesson matches too. */
      return (s.lessonIds || []).some(id => {
        const l = lessonById.get(id);
        return l ? matchesQuery(l, q) : false;
      });
    });
  }, [seriesList, statusFilter, audienceFilter, tagFilter, query, lessonById]);

  const visibleLessons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lessonLib.filter(l => {
      if (!matchesQuery(l, q)) return false;
      /* For audience/tag/status filters in All-Lessons view, fall back
         to the series this lesson is attached to where the lesson itself
         doesn't have an opinion. */
      const sids = seriesByLesson.get(l.id) || [];
      const attachedSeries = sids.map(sid => seriesList.find(s => s.id === sid)).filter(Boolean);

      /* Status — based on the attached series. Unfiled lessons are
         treated as Active so they don't vanish unless explicitly
         filtered to Archived. */
      if (statusFilter === 'archived') {
        if (attachedSeries.length === 0) return false;
        if (!attachedSeries.every(s => s.archived)) return false;
      } else if (statusFilter === 'active') {
        if (attachedSeries.length > 0 && !attachedSeries.some(s => !s.archived)) return false;
      }

      /* Audience — prefer the lesson's own audience, fall back to any
         attached series' audience for legacy lessons that never had
         the field set. */
      if (audienceFilter) {
        const lessonAud = l.audience || '';
        const seriesAuds = attachedSeries.map(s => s.audience).filter(Boolean);
        const candidates = lessonAud ? [lessonAud] : seriesAuds;
        if (!candidates.includes(audienceFilter)) return false;
      }

      /* Tags live on the series, not the lesson. */
      if (tagFilter) {
        if (!attachedSeries.some(s => (s.tags || []).includes(tagFilter))) return false;
      }

      return true;
    });
  }, [lessonLib, query, statusFilter, audienceFilter, tagFilter, seriesByLesson, seriesList]);

  const openSeries = openSeriesId ? seriesList.find(s => s.id === openSeriesId) : null;
  const openLesson = openLessonId ? lessonById.get(openLessonId) : null;

  /* ── Stats ─────────────────────────────────────────────────── */
  const totalLessons = lessonLib.length;
  const totalTaught  = lessonLib.filter(l => (l.teachings || []).length > 0).length;

  /* When a lesson is open, the lesson page takes over the full
     viewport (with its own NavRail). The series page / library
     grid all sit behind it; closing the lesson pops you back to
     whatever state was underneath. */
  if (openLessonId && openLesson) {
    return (
      <>
        <LessonPage
          lesson={openLesson}
          attachedSeries={(seriesByLesson.get(openLesson.id) || []).map(sid => seriesList.find(s => s.id === sid)).filter(Boolean)}
          allSeries={seriesList}
          allGames={gameList}
          onChange={(p) => updateLesson(openLesson.id, p)}
          onClose={() => setOpenLessonId(null)}
          onDelete={() => deleteLessonPermanently(openLesson.id)}
          onDuplicate={() => {
            const newId = duplicateLesson(openLesson.id);
            if (newId) setOpenLessonId(newId);
          }}
          onSetSeriesMemberships={(ids) => setLessonSeriesMemberships(openLesson.id, ids)}
          onCreateSeries={createSeriesQuick}
          onOpenGame={(gameId) => navigate(`/youth/games?open=${encodeURIComponent(gameId)}`)}
        />
        {showAttachFor && <AttachPickerWrapper {...{ seriesList, lessonLib, seriesByLesson, showAttachFor, attachLessonsToSeries, setShowAttachFor }} />}
      </>
    );
  }

  /* Likewise, when a series is open (and no lesson is on top), the
     series builder takes the full viewport in the same document
     style — view/edit modes, drag-and-drop lessons, attach picker. */
  if (openSeriesId && openSeries) {
    return (
      <>
        <SeriesPage
          series={openSeries}
          allTags={allTags}
          lessonsInSeries={(openSeries.lessonIds || []).map(id => lessonById.get(id)).filter(Boolean)}
          onChange={(p) => updateSeries(openSeries.id, p)}
          onDelete={() => removeSeries(openSeries.id)}
          onClose={() => { setOpenSeriesId(null); setOpenLessonId(null); }}
          onAddLesson={() => addLessonToSeries(openSeries.id)}
          onAttachClick={() => setShowAttachFor(openSeries.id)}
          onOpenLesson={setOpenLessonId}
          onDetachLesson={(lid) => detachLessonFromSeries(openSeries.id, lid)}
          onReorder={(newIds) => reorderLessonsIn(openSeries.id, newIds)}
        />
        {showAttachFor && <AttachPickerWrapper {...{ seriesList, lessonLib, seriesByLesson, showAttachFor, attachLessonsToSeries, setShowAttachFor }} />}
      </>
    );
  }

  return (
    <YouthShell
      groupLabel="Teaching" groupIcon="📖"
      icon="📚" title="Lessons & Series"
      accent={ACCENT}
      subtitle="A many-to-many library — one lesson, attach it to as many series as you like. Drag to reorder within a series."
      actions={
        <>
          {view === 'series'  && <button className="yps-add-btn" onClick={addSeries}>＋ New series</button>}
          {view === 'lessons' && <button className="yps-add-btn" onClick={addUnfiledLesson}>＋ New lesson</button>}
        </>
      }
      stats={[
        { n: seriesList.filter(s => !s.archived).length, label: 'active series' },
        { n: totalLessons, label: 'lessons in library' },
        { n: totalTaught,  label: 'taught at least once' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {/* View toggle */}
      <div className="ylsn-view-toggle">
        <button className={`yps-chip ${view === 'series'  ? 'on' : ''}`} onClick={() => setView('series')}>📚 Series view</button>
        <button className={`yps-chip ${view === 'lessons' ? 'on' : ''}`} onClick={() => setView('lessons')}>📖 All Lessons</button>
      </div>

      {/* Toolbar — shared across both views */}
      <div className="ylsn-toolbar">
        <input
          className="yps-input ylsn-search"
          placeholder="🔍 Search titles, scripture, big idea, leader notes, questions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="ylsn-chip-row">
          <button className={`yps-chip ${statusFilter === 'active'   ? 'on' : ''}`} onClick={() => setStatusFilter('active')}>📖 Active</button>
          <button className={`yps-chip ${statusFilter === 'archived' ? 'on' : ''}`} onClick={() => setStatusFilter('archived')}>📦 Archived</button>
          <button className={`yps-chip ${statusFilter === 'all'      ? 'on' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
        </div>

        <div className="ylsn-chip-row">
          <span className="ylsn-chip-label">Audience:</span>
          {AUDIENCES.map(a => (
            <button
              key={a.key || 'any'}
              className={`yps-chip ${audienceFilter === a.key ? 'on' : ''}`}
              onClick={() => setAudienceFilter(a.key)}
            >{a.label}</button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="ylsn-chip-row">
            <span className="ylsn-chip-label">Tags:</span>
            <button
              className={`yps-chip ${tagFilter === '' ? 'on' : ''}`}
              onClick={() => setTagFilter('')}
            >All tags</button>
            {allTags.map(t => (
              <button
                key={t}
                className={`yps-chip ${tagFilter === t ? 'on' : ''}`}
                onClick={() => setTagFilter(t)}
              >#{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Series view ─────────────────────────────────────── */}
      {view === 'series' && (
        (sl && seriesList.length === 0) ? (
          <div className="yps-empty"><div className="yps-empty-icon">📚</div><div className="yps-empty-title">Loading…</div></div>
        ) : visibleSeries.length === 0 ? (
          <div className="yps-empty">
            <div className="yps-empty-icon">📚</div>
            <div className="yps-empty-title">
              {seriesList.length === 0 ? 'No series yet' : 'No matches for those filters'}
            </div>
            <div className="yps-empty-sub">
              {seriesList.length === 0
                ? 'Tap "＋ New series" to start building.'
                : 'Try clearing a filter or broadening your search.'}
            </div>
          </div>
        ) : (
          <div className="ylsn-grid">
            {visibleSeries.map(s => (
              <SeriesCard
                key={s.id}
                series={s}
                lessons={(s.lessonIds || []).map(id => lessonById.get(id)).filter(Boolean)}
                onOpen={() => setOpenSeriesId(s.id)}
              />
            ))}
          </div>
        )
      )}

      {/* ── All Lessons view ────────────────────────────────── */}
      {view === 'lessons' && (
        (ll && lessonLib.length === 0) ? (
          <div className="yps-empty"><div className="yps-empty-icon">📖</div><div className="yps-empty-title">Loading…</div></div>
        ) : visibleLessons.length === 0 ? (
          <div className="yps-empty">
            <div className="yps-empty-icon">📖</div>
            <div className="yps-empty-title">
              {lessonLib.length === 0 ? 'No lessons yet' : 'No lessons match those filters'}
            </div>
            <div className="yps-empty-sub">
              {lessonLib.length === 0
                ? 'Tap "＋ New lesson" to start your teaching library.'
                : 'Try clearing a filter or broadening your search.'}
            </div>
          </div>
        ) : (
          <div className="ylsn-lib-grid">
            {visibleLessons.map(l => (
              <LessonLibraryCard
                key={l.id}
                lesson={l}
                series={(seriesByLesson.get(l.id) || []).map(sid => seriesList.find(s => s.id === sid)).filter(Boolean)}
                onOpen={() => setOpenLessonId(l.id)}
              />
            ))}
          </div>
        )
      )}

      {/* The Series page + Lesson page are full-window renders
          handled by the early-returns above — nothing else to
          mount inside YouthShell. The AttachPicker is rendered
          alongside those branches, not here. */}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

/* ─────────────────────────────────────────────────────────────
   Series card — driven by lookups from the library
   ───────────────────────────────────────────────────────────── */
function SeriesCard({ series, lessons, onOpen }) {
  const total = lessons.length;
  const taught = lessons.filter(l => (l.teachings || []).length > 0).length;
  const pct = total ? Math.round((taught / total) * 100) : 0;
  const scheduledNext = lessons
    /* Pick the next scheduled date across every lesson — flatten
       all schedules first since lessons can have multiple. */
    .flatMap(l => (l.schedules || []).filter(s => s.date).map(s => ({ lesson: l, schedule: s })))
    .sort((a, b) => a.schedule.date.localeCompare(b.schedule.date))[0];
  const lastTaughtDate = lessons
    .flatMap(l => (l.teachings || []).map(t => t.date))
    .filter(Boolean)
    .sort()
    .pop();
  const lastDays = daysAgo(lastTaughtDate);
  const audienceLabel = AUDIENCES.find(a => a.key === series.audience)?.label;

  return (
    <article
      className="ylsn-card"
      style={{ '--series-color': series.color || GENERIC_COLOR }}
      onClick={onOpen}
    >
      <div className="ylsn-card-cover" aria-hidden="true" />
      <div className="ylsn-card-body">
        <header className="ylsn-card-hd">
          <h3>{series.title || 'Untitled series'}</h3>
          {series.archived && <span className="yps-pill">archived</span>}
        </header>
        {series.theme && <div className="ylsn-card-theme">{series.theme}</div>}

        <div className="ylsn-card-progress" title={`${taught} of ${total} taught`}>
          <div className="ylsn-card-progress-track">
            <div className="ylsn-card-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="ylsn-card-progress-n">{taught}/{total}</span>
        </div>

        <div className="ylsn-card-stats">
          {audienceLabel && series.audience && <span className="yps-pill accent">{audienceLabel}</span>}
          {(series.tags || []).slice(0, 4).map(t => (
            <span key={t} className="yps-pill">#{t}</span>
          ))}
          {(series.tags || []).length > 4 && <span className="yps-pill">+{series.tags.length - 4}</span>}
        </div>

        <div className="ylsn-card-foot">
          {scheduledNext && <span>📅 Next: {scheduledNext.lesson.title || 'Lesson'} · {scheduledNext.schedule.date}</span>}
          {lastDays != null && (
            <span>✓ Last taught {lastDays === 0 ? 'today' : `${lastDays}d ago`}</span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Lesson library card — flat All-Lessons view item
   ───────────────────────────────────────────────────────────── */
function LessonLibraryCard({ lesson, series, onOpen }) {
  const taught = (lesson.teachings || []).length;
  const lastTaught = (lesson.teachings || []).map(t => t.date).filter(Boolean).sort().pop();
  const lastDays = daysAgo(lastTaught);
  const audienceLabel = AUDIENCES.find(a => a.key === lesson.audience)?.label;

  return (
    <article className="ylsn-lib-card" onDoubleClick={onOpen} title="Double-click to open">
      <header className="ylsn-lib-card-hd">
        <h3>{lesson.title || 'Untitled lesson'}</h3>
        {taught > 0 && <span className="ylsn-lib-card-taught">✓ taught {taught}×</span>}
      </header>
      {lesson.bigIdea   && <div className="ylsn-lib-card-idea">💡 {lesson.bigIdea}</div>}
      {lesson.scripture && <div className="ylsn-lib-card-scripture">📖 {lesson.scripture}</div>}

      <div className="ylsn-lib-card-series">
        {audienceLabel && lesson.audience && (
          <span className="yps-pill accent">{audienceLabel}</span>
        )}
        {series.length === 0 ? (
          <span className="yps-pill ylsn-lib-card-unfiled">🪴 Unfiled</span>
        ) : series.slice(0, 3).map(s => (
          <span
            key={s.id}
            className="yps-pill ylsn-lib-card-series-pill"
            style={{ '--series-color': s.color || GENERIC_COLOR }}
          >{s.title || 'Series'}</span>
        ))}
        {series.length > 3 && <span className="yps-pill">+{series.length - 3}</span>}
      </div>

      <div className="ylsn-lib-card-foot">
        {(lesson.schedules || []).filter(s => s.date).slice(0, 2).map(s => (
          <span key={s.id} className="ylsn-lesson-sched">📅 {s.date}{s.time && ` · ${s.time}`}</span>
        ))}
        {lastDays != null && (
          <span className="ylsn-lesson-taught-meta">
            Last taught {lastDays === 0 ? 'today' : `${lastDays}d ago`}
          </span>
        )}
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Series Page — FULL-WINDOW document-style editor that mirrors
   the LessonPage layout. View mode is read-only; Edit mode shows
   the form fields. Drag-and-drop lesson reorder lives in both
   modes since it's lightweight to enable.
   ───────────────────────────────────────────────────────────── */
function SeriesPage({
  series, allTags, lessonsInSeries,
  onChange, onDelete, onClose,
  onAddLesson, onAttachClick, onOpenLesson, onDetachLesson, onReorder,
}) {
  const [mode, setMode] = useState('view');

  const taughtCount = lessonsInSeries.filter(l => (l.teachings || []).length > 0).length;
  const pct = lessonsInSeries.length ? Math.round((taughtCount / lessonsInSeries.length) * 100) : 0;
  const audienceLabel = AUDIENCES.find(a => a.key === series.audience)?.label;

  /* Drag-and-drop reorder state — used inside the lessons list
     regardless of view/edit mode so reorder always works. */
  const [draggedId, setDraggedId] = useState(null);
  const [overId,    setOverId]    = useState(null);
  const handleDrop = (targetId) => {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setOverId(null); return; }
    const ids = [...(series.lessonIds || [])];
    const from = ids.indexOf(draggedId);
    const to   = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedId);
    onReorder(ids);
    setDraggedId(null); setOverId(null);
  };

  /* Esc closes the page. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* --yps-accent is the rose CTA color so the Done/Edit button
     stays visible. --series-color is the series-specific accent
     used for the cover bar + progress fill. */
  const rootStyle = {
    '--yps-accent': ACCENT,
    '--series-color': series.color || GENERIC_COLOR,
  };

  /* Build the drag-and-drop lesson list — used by both modes.
     `singleClickOpen` swaps the open-trigger to a single click (used
     by view mode so reading a series feels like browsing a TOC). */
  const renderLessonList = ({ allowDrag, allowDetach, singleClickOpen }) => (
    <ol className="ylsn-lesson-list">
      {lessonsInSeries.map((l, i) => {
        const teachings = l.teachings || [];
        const lastTaught = teachings.map(t => t.date).filter(Boolean).sort().pop();
        const lastDays = daysAgo(lastTaught);
        return (
          <li
            key={l.id}
            className={`ylsn-lesson-row ${teachings.length > 0 ? 'taught' : ''} ${overId === l.id ? 'drag-over' : ''} ${draggedId === l.id ? 'dragging' : ''}`}
            draggable={allowDrag}
            onDragStart={allowDrag ? () => setDraggedId(l.id) : undefined}
            onDragOver={allowDrag ? (e) => { e.preventDefault(); if (l.id !== overId) setOverId(l.id); } : undefined}
            onDragLeave={allowDrag ? () => { if (overId === l.id) setOverId(null); } : undefined}
            onDrop={allowDrag ? () => handleDrop(l.id) : undefined}
            onDragEnd={allowDrag ? () => { setDraggedId(null); setOverId(null); } : undefined}
          >
            {allowDrag && <span className="ylsn-lesson-drag" aria-hidden="true" title="Drag to reorder">⋮⋮</span>}
            <span className="ylsn-lesson-num">{i + 1}</span>
            <button
              className="ylsn-lesson-main"
              onClick={singleClickOpen ? () => onOpenLesson(l.id) : undefined}
              onDoubleClick={!singleClickOpen ? () => onOpenLesson(l.id) : undefined}
              title={singleClickOpen ? 'Click to open' : 'Double-click to open'}
            >
              <div className="ylsn-lesson-title">{l.title || 'Untitled lesson'}</div>
              {l.bigIdea && <div className="ylsn-lesson-idea">💡 {l.bigIdea}</div>}
              {(l.scripturePassages || [])[0]?.reference && (
                <div className="ylsn-lesson-scripture">📖 {l.scripturePassages[0].reference}</div>
              )}
              <div className="ylsn-lesson-meta">
                {(l.schedules || []).filter(s => s.date).slice(0, 2).map(s => (
                  <span key={s.id} className="ylsn-lesson-sched">📅 {s.date}{s.time && ` · ${s.time}`}</span>
                ))}
                {teachings.length > 0 && (
                  <span className="ylsn-lesson-taught-meta">
                    ✓ taught {teachings.length}×{lastDays != null && ` · ${lastDays === 0 ? 'today' : `${lastDays}d ago`}`}
                  </span>
                )}
              </div>
            </button>
            {allowDetach && (
              <button
                className="yps-btn ghost"
                onClick={() => onDetachLesson(l.id)}
                title="Detach from this series (lesson stays in the library)"
              >Detach</button>
            )}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="ylsn-page-root" style={rootStyle}>
      <NavRail />
      <main className="ylsn-page-main">
        <header className="ylsn-page-topbar">
          <button className="ylsn-page-back" onClick={onClose} title="Back to Lessons & Series">
            ← Back to library
          </button>
          <div className="ylsn-page-crumb">
            <span className="ylsn-page-mode-badge">{mode === 'view' ? '👁 Viewing' : '✎ Editing'}</span>
            <span className="ylsn-page-crumb-sep">·</span>
            <span>📚 Series</span>
          </div>
          <div className="ylsn-page-topbar-actions">
            {/* No Word/Duplicate yet for series — leave space for future. */}
          </div>
        </header>

        <article className="ylsn-page-paper">
          {/* Cover strip in the series color across the top of the paper */}
          <div className="ylsn-page-series-cover" aria-hidden="true" />

          {mode === 'view' ? (
            <div className="ylsn-page-view">
              <h1 className="ylsn-page-title-static">
                {series.title || <span className="ylsn-page-muted">Untitled series</span>}
              </h1>

              <div className="ylsn-page-series-meta">
                {audienceLabel && series.audience && (
                  <span className="yps-pill accent" style={{ '--yps-accent': 'var(--series-color)' }}>
                    {audienceLabel}
                  </span>
                )}
                {(series.tags || []).map(t => (
                  <span key={t} className="yps-pill">#{t}</span>
                ))}
                {series.archived && <span className="yps-pill">archived</span>}
              </div>

              {series.theme && (
                <div className="ylsn-page-series-theme">{series.theme}</div>
              )}

              {series.description && (
                <div className="ylsn-page-bigidea-static">{series.description}</div>
              )}

              {lessonsInSeries.length > 0 && (
                <div className="ylsn-series-progress" style={{ '--series-color': series.color || GENERIC_COLOR }}>
                  <div className="ylsn-series-progress-track">
                    <div className="ylsn-series-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span>{taughtCount} of {lessonsInSeries.length} lessons taught · {pct}%</span>
                </div>
              )}

              <section className="ylsn-page-section-static">
                <header className="ylsn-page-section-hd">
                  <h2 className="ylsn-page-section-title">Lessons ({lessonsInSeries.length})</h2>
                </header>
                {lessonsInSeries.length === 0 ? (
                  <div className="ylsn-page-empty">
                    No lessons attached yet. Click <b>✎ Edit series</b> below to add some.
                  </div>
                ) : (
                  renderLessonList({ allowDrag: false, allowDetach: false, singleClickOpen: true })
                )}
              </section>
            </div>
          ) : (
            <>
              <input
                className="ylsn-page-title"
                value={series.title}
                onChange={e => onChange({ title: e.target.value })}
                placeholder="Untitled series"
                aria-label="Series title"
              />

              <div className="ylsn-page-series-edit-grid">
                <label className="ylsn-page-field">
                  <span className="ylsn-page-field-label">Theme</span>
                  <input
                    className="ylsn-page-input"
                    value={series.theme}
                    onChange={e => onChange({ theme: e.target.value })}
                    placeholder="e.g. Identity & calling"
                  />
                </label>
                <label className="ylsn-page-field">
                  <span className="ylsn-page-field-label">Color</span>
                  <input
                    type="color"
                    className="ylsn-page-color-swatch"
                    value={series.color}
                    onChange={e => onChange({ color: e.target.value })}
                  />
                </label>
                <label className="ylsn-page-field">
                  <span className="ylsn-page-field-label">Audience</span>
                  <select
                    className="ylsn-page-select"
                    value={series.audience}
                    onChange={e => onChange({ audience: e.target.value })}
                  >
                    {AUDIENCES.map(a => <option key={a.key || 'any'} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
                <label className="ylsn-page-field">
                  <span className="ylsn-page-field-label">Archived</span>
                  <label className="ylsn-toggle ylsn-page-toggle">
                    <input
                      type="checkbox"
                      checked={series.archived}
                      onChange={e => onChange({ archived: e.target.checked })}
                    />
                    <span>Hide from active list</span>
                  </label>
                </label>
              </div>

              <label className="ylsn-page-field">
                <span className="ylsn-page-field-label">Tags</span>
                <TagEditor
                  value={series.tags}
                  onChange={(tags) => onChange({ tags })}
                  suggestions={allTags}
                />
              </label>

              <label className="ylsn-page-field">
                <span className="ylsn-page-field-label">Description</span>
                <textarea
                  className="ylsn-page-textarea"
                  rows={4}
                  value={series.description}
                  onChange={e => onChange({ description: e.target.value })}
                  placeholder="What is this series about? Who is it for?"
                />
              </label>

              {lessonsInSeries.length > 0 && (
                <div className="ylsn-series-progress" style={{ '--series-color': series.color || GENERIC_COLOR }}>
                  <div className="ylsn-series-progress-track">
                    <div className="ylsn-series-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span>{taughtCount} of {lessonsInSeries.length} lessons taught · {pct}%</span>
                </div>
              )}

              <section className="ylsn-page-section">
                <header className="ylsn-page-section-hd">
                  <h2 className="ylsn-page-section-title">Lessons ({lessonsInSeries.length})</h2>
                  <div className="ylsn-section-hd-actions">
                    <button className="yps-btn" onClick={onAttachClick}>📎 Attach from library</button>
                    <button className="yps-btn" onClick={onAddLesson}>＋ New lesson</button>
                  </div>
                </header>
                {lessonsInSeries.length === 0 ? (
                  <div className="yps-muted ylsn-page-section-empty">
                    No lessons attached yet. Add a new one, or attach existing lessons from your library.
                  </div>
                ) : (
                  renderLessonList({ allowDrag: true, allowDetach: true, singleClickOpen: false })
                )}
              </section>
            </>
          )}

          <footer className="ylsn-page-foot">
            <button className="yps-btn danger" onClick={onDelete}>🗑 Delete series</button>
            <div className="ylsn-page-foot-right">
              {mode === 'view' ? (
                <>
                  <button className="yps-btn" onClick={onClose}>Close</button>
                  <button className="yps-add-btn" onClick={() => setMode('edit')}>✎ Edit series</button>
                </>
              ) : (
                <>
                  <button className="yps-btn" onClick={onClose}>Close</button>
                  <button className="yps-add-btn" onClick={() => setMode('view')}>✓ Done editing</button>
                </>
              )}
            </div>
          </footer>
        </article>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Attach picker — multi-select from the library
   ───────────────────────────────────────────────────────────── */
/* Lightweight wrapper that resolves the target series for the
   AttachPicker and wires its callbacks — extracted so the
   early-return branches (Lesson page / Series page) can render
   the picker without duplicating the resolver logic. */
function AttachPickerWrapper({ seriesList, lessonLib, seriesByLesson, showAttachFor, attachLessonsToSeries, setShowAttachFor }) {
  const target = seriesList.find(s => s.id === showAttachFor);
  if (!target) return null;
  return (
    <AttachPicker
      allLessons={lessonLib}
      attachedIds={target.lessonIds || []}
      seriesByLesson={seriesByLesson}
      onAttach={(ids) => attachLessonsToSeries(showAttachFor, ids)}
      onClose={() => setShowAttachFor(null)}
    />
  );
}

function AttachPicker({ allLessons, attachedIds, seriesByLesson, onAttach, onClose }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const attached = useMemo(() => new Set(attachedIds), [attachedIds]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allLessons;
    return allLessons.filter(l => {
      const hay = [l.title, l.bigIdea, l.scripture, l.outline, l.leaderNotes,
        ...(l.discussion || [])].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [allLessons, q]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (selected.size === 0) return;
    onAttach([...selected]);
    onClose();
  };

  return (
    <div className="ylsn-modal-backdrop" onClick={onClose} style={{ zIndex: 95 }}>
      <div className="ylsn-modal ylsn-picker" onClick={e => e.stopPropagation()}>
        <header className="ylsn-modal-hd">
          <div className="ylsn-modal-hd-main">
            <div className="ylsn-modal-crumb">Attach from library</div>
            <h2>Pick lessons to add</h2>
          </div>
          <button className="yps-btn ghost" onClick={onClose}>✕</button>
        </header>

        <div className="ylsn-picker-toolbar">
          <input
            className="yps-input"
            placeholder="🔍 Search lessons…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          <span className="ylsn-picker-count">
            {selected.size} selected
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="yps-muted ylsn-section-empty">No lessons match your search.</div>
        ) : (
          <ul className="ylsn-picker-list">
            {visible.map(l => {
              const inSeries = attached.has(l.id);
              const useCount = (seriesByLesson.get(l.id) || []).length;
              return (
                <li
                  key={l.id}
                  className={`ylsn-picker-row ${inSeries ? 'already' : ''} ${selected.has(l.id) ? 'on' : ''}`}
                  onClick={() => { if (!inSeries) toggle(l.id); }}
                  title={inSeries ? 'Already attached to this series' : ''}
                >
                  <input
                    type="checkbox"
                    checked={inSeries || selected.has(l.id)}
                    disabled={inSeries}
                    onChange={() => toggle(l.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="ylsn-picker-info">
                    <div className="ylsn-picker-title">{l.title || 'Untitled lesson'}</div>
                    {l.bigIdea && <div className="ylsn-picker-idea">💡 {l.bigIdea}</div>}
                    <div className="ylsn-picker-meta">
                      {l.scripture && <span>📖 {l.scripture}</span>}
                      {useCount > 0 && <span>Used in {useCount} series</span>}
                      {inSeries && <span className="yps-pill">already attached</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="ylsn-modal-ft">
          <button className="yps-btn ghost" onClick={onClose}>Cancel</button>
          <button className="yps-add-btn" onClick={submit} disabled={selected.size === 0}>
            Attach {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* Shared passage body renderer — verse numbers when available,
   falls back to plain text for legacy / manually-pasted passages. */
function PassageBody({ passage }) {
  if (Array.isArray(passage.verses) && passage.verses.length > 0) {
    return (
      <blockquote className="ylsn-page-passage-text">
        {passage.verses.map((v, i) => (
          <span key={`${v.chapter}-${v.number}-${i}`} className="ylsn-page-verse">
            <sup className="ylsn-page-verse-num">{v.number}</sup>
            <span className="ylsn-page-verse-text">{v.text}</span>
            {i < passage.verses.length - 1 && ' '}
          </span>
        ))}
      </blockquote>
    );
  }
  if (passage.text) {
    return <blockquote className="ylsn-page-passage-text">{passage.text}</blockquote>;
  }
  return (
    <div className="ylsn-page-passage-empty">
      <em>(No verse text yet — go to Edit mode, type a reference, and press Enter to fetch it.)</em>
    </div>
  );
}

/* Three-select time picker (Hours / Minutes / AM-PM). Same shape
   the rest of the Youth pages use, so the stored time string
   ("7:00 PM") slots into anything that consumes lesson.schedules. */
function TimePicker({ value, onChange }) {
  const p = parseTime(value);
  const setPart = (patch) => onChange(formatTime({ ...p, ...patch }));
  return (
    <div className="ylsn-tp">
      <select className="ylsn-tp-sel ylsn-tp-hh" value={p.hh} onChange={e => setPart({ hh: e.target.value })} aria-label="Hour">
        <option value="">—</option>
        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="ylsn-tp-sep">:</span>
      <select className="ylsn-tp-sel ylsn-tp-mm" value={p.mm} onChange={e => setPart({ mm: e.target.value })} aria-label="Minute">
        {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="ylsn-tp-sel ylsn-tp-ap" value={p.ap} onChange={e => setPart({ ap: e.target.value })} aria-label="AM/PM">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Lesson Page — the FULL-WINDOW document-style editor.

   Replaces the old stacked modal. Renders its own NavRail so the
   user keeps their main navigation, then opens an A4-style "paper"
   surface centered in the main area with generous margins, large
   typography, and inline editing. Includes the new inline series
   picker so series memberships are managed from the lesson side.
   ───────────────────────────────────────────────────────────── */
function LessonPage({
  lesson, attachedSeries, allSeries, allGames,
  onChange, onClose, onDelete, onDuplicate,
  onSetSeriesMemberships, onCreateSeries, onOpenGame,
}) {
  /* Default to view mode on open — like opening a non-editable Word doc.
     The user explicitly clicks "Edit" at the bottom to make changes. */
  const [mode, setMode] = useState('view');

  /* Local set of passage ids that are currently collapsed. View
     preference only — doesn't persist to Firestore. Defaults to
     all collapsed when there are 2+ passages so the page reads
     like a table of contents; new fetches auto-expand the row. */
  const [collapsedPassages, setCollapsedPassages] = useState(new Set());
  const togglePassage = (id) => {
    setCollapsedPassages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const collapseAll = () => {
    setCollapsedPassages(new Set((lesson.scripturePassages || []).map(p => p.id)));
  };
  const expandAll = () => setCollapsedPassages(new Set());

  const passages    = lesson.scripturePassages || [];
  const schedules   = lesson.schedules         || [];
  const mediaLinks  = lesson.mediaLinks        || [];
  const linkedGames = lesson.linkedGames       || [];

  /* Linked games — multi-pick from the Games catalog with a per-row
     Before/After position toggle so the leader knows whether the
     game runs before the teaching or after. */
  const addLinkedGame = (gameId) => {
    if (!gameId) return;
    if (linkedGames.some(lg => lg.gameId === gameId)) return; // dedupe
    onChange({
      linkedGames: [...linkedGames, { id: makeId('lg'), gameId, position: 'before' }],
    });
  };
  const setLinkedGamePosition = (id, position) => {
    onChange({ linkedGames: linkedGames.map(lg => lg.id === id ? { ...lg, position } : lg) });
  };
  const removeLinkedGame = (id) => {
    onChange({ linkedGames: linkedGames.filter(lg => lg.id !== id) });
  };

  const setQ = (idx, val) => {
    const next = [...lesson.discussion]; next[idx] = val;
    onChange({ discussion: next });
  };
  const addQ    = () => onChange({ discussion: [...lesson.discussion, ''] });
  const removeQ = (idx) => onChange({ discussion: lesson.discussion.filter((_, i) => i !== idx) });

  /* Scripture passages — add / patch / remove. Text is read-only;
     populated only by the Enter-key fetch from bible-api.com.
     Supports verse ranges ("John 1:1-3") and full chapters ("John 1"). */
  const addPassage = () => {
    onChange({ scripturePassages: [...passages, { id: makeId('sp'), reference: '', text: '' }] });
  };
  const patchPassage = (id, patch) => {
    onChange({ scripturePassages: passages.map(p => p.id === id ? { ...p, ...patch } : p) });
  };
  const removePassage = (id) => {
    onChange({ scripturePassages: passages.filter(p => p.id !== id) });
  };
  const fetchPassage = async (id) => {
    const p = passages.find(x => x.id === id);
    if (!p?.reference?.trim()) return;
    const result = await fetchScripture(p.reference);
    if (result) {
      patchPassage(id, { text: result.text, verses: result.verses });
      /* Auto-expand on successful fetch so the user sees the verses
         even if they had this row collapsed. */
      setCollapsedPassages(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      alert('Could not look up that reference. Try a different format like "John 3:16", "John 1:1-3", or "John 1".');
    }
  };

  /* Schedules — date + time picker + per-row Sync to Calendar. */
  const addSchedule = () => {
    onChange({
      schedules: [...schedules, { id: makeId('sch'), date: '', time: '', syncToCalendar: false }],
    });
  };
  const patchSchedule = (id, patch) => {
    onChange({ schedules: schedules.map(s => s.id === id ? { ...s, ...patch } : s) });
  };
  const removeSchedule = (id) => {
    onChange({ schedules: schedules.filter(s => s.id !== id) });
  };

  /* Media links — multi-URL with optional label. */
  const addMediaLink = () => {
    onChange({ mediaLinks: [...mediaLinks, { id: makeId('ml'), url: '', label: '' }] });
  };
  const patchMediaLink = (id, patch) => {
    onChange({ mediaLinks: mediaLinks.map(m => m.id === id ? { ...m, ...patch } : m) });
  };
  const removeMediaLink = (id) => {
    onChange({ mediaLinks: mediaLinks.filter(m => m.id !== id) });
  };

  const addTeaching = () => {
    onChange({
      teachings: [
        ...(lesson.teachings || []),
        { id: makeId('th'), date: new Date().toISOString().slice(0, 10), teacher: '', location: '', attendance: 0, rating: 0, debrief: '' },
      ],
    });
  };
  const setTeaching = (id, patch) =>
    onChange({ teachings: (lesson.teachings || []).map(t => t.id === id ? { ...t, ...patch } : t) });
  const removeTeaching = (id) =>
    onChange({ teachings: (lesson.teachings || []).filter(t => t.id !== id) });

  /* Series picker state — opens an inline dropdown over the page. */
  const attachedIds = useMemo(() => attachedSeries.map(s => s.id), [attachedSeries]);

  /* Esc to close the page, matches modal muscle memory. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* --yps-accent inline so the rose-tinted Done button is actually
     visible (LessonPage doesn't wrap in YouthShell which normally
     supplies this variable). */
  const rootStyle = { '--yps-accent': ACCENT };

  return (
    <div className="ylsn-page-root" style={rootStyle}>
      <NavRail />
      <main className="ylsn-page-main">

        {/* Slim top bar inside the main area */}
        <header className="ylsn-page-topbar">
          <button className="ylsn-page-back" onClick={onClose} title="Back to Lessons & Series">
            ← Back to library
          </button>
          <div className="ylsn-page-crumb">
            <span className="ylsn-page-mode-badge">{mode === 'view' ? '👁 Viewing' : '✎ Editing'}</span>
            <span className="ylsn-page-crumb-sep">·</span>
            {attachedSeries.length === 0
              ? <span>🪴 Unfiled lesson</span>
              : <span>📚 {attachedSeries.map(s => s.title || 'Series').join(' · ')}</span>}
          </div>
          <div className="ylsn-page-topbar-actions">
            <button
              className="yps-btn"
              onClick={() => downloadLessonAsWord(lesson, attachedSeries[0])}
              disabled={!lesson.title && !lesson.bigIdea && passages.length === 0}
              title="Download as Microsoft Word document"
            >📥 Word</button>
            <button className="yps-btn" onClick={onDuplicate} title="Duplicate this lesson">📋 Duplicate</button>
          </div>
        </header>

        {/* The paper */}
        <article className="ylsn-page-paper">
          {mode === 'view' ? (
            <LessonViewMode
              lesson={lesson}
              attachedSeries={attachedSeries}
              allGames={allGames}
              onOpenGame={onOpenGame}
              collapsedPassages={collapsedPassages}
              togglePassage={togglePassage}
              collapseAll={collapseAll}
              expandAll={expandAll}
            />
          ) : (
            <LessonEditMode
              lesson={lesson}
              attachedSeries={attachedSeries}
              allSeries={allSeries}
              attachedIds={attachedIds}
              allGames={allGames}
              linkedGames={linkedGames}
              passages={passages}
              schedules={schedules}
              mediaLinks={mediaLinks}
              onChange={onChange}
              onSetSeriesMemberships={onSetSeriesMemberships}
              onCreateSeries={onCreateSeries}
              addLinkedGame={addLinkedGame}
              setLinkedGamePosition={setLinkedGamePosition}
              removeLinkedGame={removeLinkedGame}
              setQ={setQ} addQ={addQ} removeQ={removeQ}
              addPassage={addPassage}
              patchPassage={patchPassage}
              removePassage={removePassage}
              fetchPassage={fetchPassage}
              collapsedPassages={collapsedPassages}
              togglePassage={togglePassage}
              collapseAll={collapseAll}
              expandAll={expandAll}
              addSchedule={addSchedule}
              patchSchedule={patchSchedule}
              removeSchedule={removeSchedule}
              addMediaLink={addMediaLink}
              patchMediaLink={patchMediaLink}
              removeMediaLink={removeMediaLink}
              addTeaching={addTeaching}
              setTeaching={setTeaching}
              removeTeaching={removeTeaching}
            />
          )}

          {/* Bottom action bar — always visible, primary CTA flips
              between Edit (in view) and Done editing (in edit). */}
          <footer className="ylsn-page-foot">
            <button className="yps-btn danger" onClick={onDelete}>🗑 Delete permanently</button>
            <div className="ylsn-page-foot-right">
              {mode === 'view' ? (
                <>
                  <button className="yps-btn" onClick={onClose}>Close</button>
                  <button className="yps-add-btn" onClick={() => setMode('edit')}>✎ Edit lesson</button>
                </>
              ) : (
                <>
                  <button className="yps-btn" onClick={onClose}>Close</button>
                  <button className="yps-add-btn" onClick={() => setMode('view')}>✓ Done editing</button>
                </>
              )}
            </div>
          </footer>
        </article>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   View mode — read-only document presentation.
   Hides empty sections so the page reads like a clean handout.
   ───────────────────────────────────────────────────────────── */
function LessonViewMode({ lesson, attachedSeries, allGames, onOpenGame, collapsedPassages, togglePassage, collapseAll, expandAll }) {
  const passages   = (lesson.scripturePassages || []).filter(p => p.reference || p.text);
  const questions  = (lesson.discussion || []).filter(Boolean);
  const teachings  = lesson.teachings || [];
  const schedules  = (lesson.schedules  || []).filter(s => s.date);
  const mediaLinks = (lesson.mediaLinks || []).filter(m => m.url);
  /* Resolve linked-game ids → actual game objects (skip any that
     have been deleted from the catalog since they were linked). */
  const gamesById = useMemo(() => {
    const m = new Map();
    for (const g of (allGames || [])) m.set(g.id, g);
    return m;
  }, [allGames]);
  const linkedGames = (lesson.linkedGames || [])
    .map(lg => ({ ...lg, game: gamesById.get(lg.gameId) }))
    .filter(lg => lg.game);
  const beforeGames = linkedGames.filter(lg => lg.position !== 'after');
  const afterGames  = linkedGames.filter(lg => lg.position === 'after');
  const audienceLabel = AUDIENCES.find(a => a.key === lesson.audience)?.label;
  const hasAnything =
    lesson.title || lesson.bigIdea || passages.length || lesson.outline ||
    questions.length || lesson.leaderNotes || mediaLinks.length || schedules.length ||
    teachings.length || linkedGames.length || lesson.audience;

  return (
    <div className="ylsn-page-view">
      <h1 className="ylsn-page-title-static">
        {lesson.title || <span className="ylsn-page-muted">Untitled lesson</span>}
      </h1>

      {attachedSeries.length > 0 && (
        <div className="ylsn-page-series-row ylsn-page-series-row-view">
          <span className="ylsn-page-series-label">Series</span>
          <div className="ylsn-page-series-chips">
            {attachedSeries.map(s => (
              <span
                key={s.id}
                className="ylsn-page-series-chip"
                style={{ '--series-color': s.color || GENERIC_COLOR }}
              >{s.title || 'Series'}</span>
            ))}
          </div>
        </div>
      )}

      {audienceLabel && lesson.audience && (
        <div className="ylsn-page-audience-row">
          <span className="ylsn-page-series-label">Audience</span>
          <span className="yps-pill accent">{audienceLabel}</span>
        </div>
      )}

      {beforeGames.length > 0 && (
        <section className="ylsn-page-section-static ylsn-page-linkedgames">
          <h2 className="ylsn-page-section-title">🎲 Games & icebreakers — before the lesson</h2>
          <ul className="ylsn-page-linkedgames-list">
            {beforeGames.map(lg => (
              <li key={lg.id}>
                <button
                  type="button"
                  className="ylsn-page-linkedgame-btn"
                  onClick={() => onOpenGame && onOpenGame(lg.game.id)}
                  title="Open this game"
                >
                  <span className="ylsn-page-linkedgame-name">🎲 {lg.game.name || 'Untitled game'}</span>
                  <span className="ylsn-page-linkedgame-meta">
                    {lg.game.type && <span className="yps-pill">{lg.game.type}</span>}
                    {lg.game.duration && <span className="yps-pill">{lg.game.duration}m</span>}
                    {lg.game.energy && <span className={`yps-pill yg-energy yg-energy-${String(lg.game.energy).toLowerCase()}`}>{lg.game.energy}</span>}
                  </span>
                  <span className="ylsn-page-linkedgame-open">↗</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lesson.bigIdea && (
        <div className="ylsn-page-bigidea-static">
          {lesson.bigIdea}
        </div>
      )}

      {passages.length > 0 && (
        <section className="ylsn-page-section-static">
          <header className="ylsn-page-section-hd">
            <h2 className="ylsn-page-section-title">📖 Scripture</h2>
            {passages.length > 1 && (
              <div className="ylsn-page-passage-tools">
                <button className="yps-btn ghost" onClick={collapseAll}>Collapse all</button>
                <button className="yps-btn ghost" onClick={expandAll}>Expand all</button>
              </div>
            )}
          </header>
          <div className="ylsn-page-passages">
            {passages.map(p => {
              const isCollapsed = collapsedPassages.has(p.id);
              return (
                <div key={p.id} className="ylsn-page-passage">
                  <button
                    type="button"
                    className="ylsn-page-passage-ref-btn"
                    onClick={() => togglePassage(p.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="ylsn-page-passage-chevron">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="ylsn-page-passage-ref">{p.reference || '—'}</span>
                  </button>
                  {!isCollapsed && <PassageBody passage={p} />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {lesson.outline && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">Outline</h2>
          <div className="ylsn-page-text-static">{lesson.outline}</div>
        </section>
      )}

      {questions.length > 0 && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">Discussion questions</h2>
          <ol className="ylsn-page-qlist-static">
            {questions.map((q, i) => (
              <li key={i}><span className="ylsn-page-qnum-static">{i + 1}.</span> {q}</li>
            ))}
          </ol>
        </section>
      )}

      {lesson.leaderNotes && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">Leader notes</h2>
          <div className="ylsn-page-text-static ylsn-page-leader-notes-static">{lesson.leaderNotes}</div>
        </section>
      )}

      {mediaLinks.length > 0 && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">🔗 Media</h2>
          <div className="ylsn-page-medialinks-static">
            {mediaLinks.map(m => (
              <a
                key={m.id}
                className="ylsn-page-medialink-static"
                href={normalizeUrl(m.url)}
                target="_blank"
                rel="noreferrer"
                title={m.url}
              >
                <span className="ylsn-page-medialink-static-icon">🔗</span>
                <span className="ylsn-page-medialink-static-label">{m.label || m.url}</span>
                <span className="ylsn-page-medialink-static-open">↗</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {schedules.length > 0 && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">📅 Scheduled dates</h2>
          <ul className="ylsn-page-schedules-static">
            {schedules.map(s => (
              <li key={s.id} className="ylsn-page-schedule-static">
                <span className="ylsn-page-schedule-static-date">📅 {s.date}</span>
                {s.time && <span className="ylsn-page-schedule-static-time">· {s.time}</span>}
                {s.syncToCalendar && <span className="yps-pill accent">✓ Synced to Calendar</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {afterGames.length > 0 && (
        <section className="ylsn-page-section-static ylsn-page-linkedgames">
          <h2 className="ylsn-page-section-title">🎲 Games & icebreakers — after the lesson</h2>
          <ul className="ylsn-page-linkedgames-list">
            {afterGames.map(lg => (
              <li key={lg.id}>
                <button
                  type="button"
                  className="ylsn-page-linkedgame-btn"
                  onClick={() => onOpenGame && onOpenGame(lg.game.id)}
                  title="Open this game"
                >
                  <span className="ylsn-page-linkedgame-name">🎲 {lg.game.name || 'Untitled game'}</span>
                  <span className="ylsn-page-linkedgame-meta">
                    {lg.game.type && <span className="yps-pill">{lg.game.type}</span>}
                    {lg.game.duration && <span className="yps-pill">{lg.game.duration}m</span>}
                    {lg.game.energy && <span className={`yps-pill yg-energy yg-energy-${String(lg.game.energy).toLowerCase()}`}>{lg.game.energy}</span>}
                  </span>
                  <span className="ylsn-page-linkedgame-open">↗</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teachings.length > 0 && (
        <section className="ylsn-page-section-static">
          <h2 className="ylsn-page-section-title">📖 Taught log ({teachings.length})</h2>
          <ul className="ylsn-page-teaching-static-list">
            {teachings.map(t => (
              <li key={t.id} className="ylsn-page-teaching-static">
                <div className="ylsn-page-teaching-static-hd">
                  <strong>{t.date || '—'}</strong>
                  {t.teacher  && <span> · {t.teacher}</span>}
                  {t.location && <span> · {t.location}</span>}
                  {Number(t.attendance) > 0 && <span> · {t.attendance} attended</span>}
                  {Number(t.rating) > 0 && <span> · {'★'.repeat(t.rating)}</span>}
                </div>
                {t.debrief && <div className="ylsn-page-teaching-static-debrief">{t.debrief}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasAnything && (
        <div className="ylsn-page-empty">
          This lesson is empty. Click <b>✎ Edit lesson</b> at the bottom to start building.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Edit mode — the form fields. Same content as before, just
   extracted so view/edit can swap cleanly.
   ───────────────────────────────────────────────────────────── */
function LessonEditMode({
  lesson, attachedSeries, allSeries, attachedIds,
  allGames, linkedGames,
  passages, schedules, mediaLinks,
  onChange, onSetSeriesMemberships, onCreateSeries,
  addLinkedGame, setLinkedGamePosition, removeLinkedGame,
  setQ, addQ, removeQ,
  addPassage, patchPassage, removePassage, fetchPassage,
  collapsedPassages, togglePassage, collapseAll, expandAll,
  addSchedule, patchSchedule, removeSchedule,
  addMediaLink, patchMediaLink, removeMediaLink,
  addTeaching, setTeaching, removeTeaching,
}) {
  return (
    <>
      <input
        className="ylsn-page-title"
        value={lesson.title}
        onChange={e => onChange({ title: e.target.value })}
        placeholder="Untitled lesson"
        aria-label="Lesson title"
      />

      <SeriesRow
        attachedSeries={attachedSeries}
        allSeries={allSeries}
        attachedIds={attachedIds}
        onSetMemberships={onSetSeriesMemberships}
        onCreateSeries={onCreateSeries}
      />

      <label className="ylsn-page-field ylsn-page-audience-edit">
        <span className="ylsn-page-field-label">Audience</span>
        <select
          className="ylsn-page-select"
          value={lesson.audience || ''}
          onChange={e => onChange({ audience: e.target.value })}
        >
          {AUDIENCES.map(a => (
            <option key={a.key || 'any'} value={a.key}>{a.label}</option>
          ))}
        </select>
      </label>

      <label className="ylsn-page-bigidea-wrap">
        <span className="ylsn-page-field-label">Big idea</span>
        <textarea
          className="ylsn-page-bigidea"
          rows={2}
          value={lesson.bigIdea}
          onChange={e => onChange({ bigIdea: e.target.value })}
          placeholder="One sentence — the takeaway"
        />
      </label>

      {/* Scripture passages — Enter on the reference fetches the
          verse text (with verse numbers). The body is read-only and
          collapsible per passage. */}
      <section className="ylsn-page-section">
        <header className="ylsn-page-section-hd">
          <h2 className="ylsn-page-section-title">📖 Scripture</h2>
          <div className="ylsn-page-passage-tools">
            {passages.length > 1 && (
              <>
                <button className="yps-btn ghost" onClick={collapseAll}>Collapse all</button>
                <button className="yps-btn ghost" onClick={expandAll}>Expand all</button>
              </>
            )}
            <button className="yps-btn" onClick={addPassage}>＋ Add scripture</button>
          </div>
        </header>
        {passages.length === 0 ? (
          <div className="yps-muted ylsn-page-section-empty">
            No scriptures yet. Add a reference and press <b>Enter</b> to auto-fetch.
            Supports single verses (<em>John 3:16</em>), ranges (<em>John 1:1-3</em>),
            and whole chapters (<em>John 1</em>). Verse numbers come back with the text.
          </div>
        ) : (
          <ul className="ylsn-page-passages-edit">
            {passages.map(p => {
              const isCollapsed = collapsedPassages.has(p.id);
              return (
                <li key={p.id} className="ylsn-page-passage-edit">
                  <div className="ylsn-page-passage-row">
                    <button
                      type="button"
                      className="ylsn-page-passage-toggle"
                      onClick={() => togglePassage(p.id)}
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                      aria-expanded={!isCollapsed}
                    >{isCollapsed ? '▸' : '▾'}</button>
                    <input
                      className="ylsn-page-input ylsn-page-passage-ref-input"
                      value={p.reference}
                      onChange={e => patchPassage(p.id, { reference: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchPassage(p.id); } }}
                      placeholder="e.g. John 1:1-3 or John 1 — press Enter to fetch"
                    />
                    <button
                      type="button"
                      className="yps-btn ghost"
                      onClick={() => removePassage(p.id)}
                      title="Remove this passage"
                    >✕</button>
                  </div>
                  {/* Read-only verse body — collapsible. Only the reference above is editable. */}
                  {!isCollapsed && (
                    <div className="ylsn-page-passage-edit-body" aria-label="Verse text">
                      <PassageBody passage={p} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Games & icebreakers — multi-pick from the Games catalog with
          a per-row Before/After toggle. Live-search dropdown to keep
          long catalogs scannable, dedupe so the same game can't be
          attached twice. Clicking the chip in View mode jumps to that
          game on the Games page. */}
      <LinkedGamesPicker
        allGames={allGames || []}
        linkedGames={linkedGames || []}
        onAdd={addLinkedGame}
        onSetPosition={setLinkedGamePosition}
        onRemove={removeLinkedGame}
      />

      {/* Media links — multiple URLs, optional label, opens on click. */}
      <section className="ylsn-page-section">
        <header className="ylsn-page-section-hd">
          <h2 className="ylsn-page-section-title">🔗 Media links</h2>
          <button className="yps-btn" onClick={addMediaLink}>＋ Add link</button>
        </header>
        {mediaLinks.length === 0 ? (
          <div className="yps-muted ylsn-page-section-empty">
            No links yet. Add slide decks, videos, images — anything online.
          </div>
        ) : (
          <ul className="ylsn-page-medialinks-edit">
            {mediaLinks.map(m => (
              <li key={m.id} className="ylsn-page-medialink-row">
                <input
                  className="ylsn-page-input ylsn-page-medialink-url"
                  value={m.url}
                  onChange={e => patchMediaLink(m.id, { url: e.target.value })}
                  placeholder="URL — slides, video, image, doc…"
                />
                <input
                  className="ylsn-page-input ylsn-page-medialink-label"
                  value={m.label}
                  onChange={e => patchMediaLink(m.id, { label: e.target.value })}
                  placeholder="Label (optional)"
                />
                <button
                  type="button"
                  className="yps-btn ghost"
                  onClick={() => removeMediaLink(m.id)}
                  title="Remove this link"
                >✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="ylsn-page-field">
        <span className="ylsn-page-field-label">Outline</span>
        <textarea
          className="ylsn-page-textarea"
          rows={10}
          value={lesson.outline}
          onChange={e => onChange({ outline: e.target.value })}
          placeholder="Intro → main points → close…"
        />
      </label>

      <section className="ylsn-page-section">
        <header className="ylsn-page-section-hd">
          <h2 className="ylsn-page-section-title">Discussion questions</h2>
          <button className="yps-btn" onClick={addQ}>＋ Add question</button>
        </header>
        <ol className="ylsn-page-qlist">
          {lesson.discussion.map((q, i) => (
            <li key={i} className="ylsn-page-qrow">
              <span className="ylsn-page-qnum">{i + 1}.</span>
              <input
                className="ylsn-page-input ylsn-page-qinput"
                value={q}
                onChange={e => setQ(i, e.target.value)}
                placeholder="Your question…"
              />
              <button className="yps-btn ghost" onClick={() => removeQ(i)} title="Remove question">✕</button>
            </li>
          ))}
        </ol>
      </section>

      <label className="ylsn-page-field">
        <span className="ylsn-page-field-label">Leader notes</span>
        <textarea
          className="ylsn-page-textarea ylsn-page-textarea-muted"
          rows={5}
          value={lesson.leaderNotes}
          onChange={e => onChange({ leaderNotes: e.target.value })}
          placeholder="Watch-outs, illustrations, prayer focus…"
        />
      </label>

      {/* Scheduled dates — each date gets its own time picker + per-row
          Sync to Calendar toggle so a lesson can be on multiple dates
          and only some sync. */}
      <section className="ylsn-page-section">
        <header className="ylsn-page-section-hd">
          <h2 className="ylsn-page-section-title">📅 Scheduled dates</h2>
          <button className="yps-btn" onClick={addSchedule}>＋ Add date</button>
        </header>
        {schedules.length === 0 ? (
          <div className="yps-muted ylsn-page-section-empty">
            No dates yet. Add a date + time and tick Sync to push it to your Calendar.
          </div>
        ) : (
          <ul className="ylsn-page-schedules-edit">
            {schedules.map(s => (
              <li key={s.id} className="ylsn-page-schedule-row">
                <input
                  type="date"
                  className="ylsn-page-input ylsn-page-schedule-date"
                  value={s.date}
                  onChange={e => patchSchedule(s.id, { date: e.target.value })}
                />
                <TimePicker
                  value={s.time}
                  onChange={(t) => patchSchedule(s.id, { time: t })}
                />
                <label
                  className="ylsn-page-schedule-sync"
                  title={s.date ? 'Push this date to the Calendar' : 'Pick a date first'}
                >
                  <input
                    type="checkbox"
                    checked={!!s.syncToCalendar}
                    disabled={!s.date}
                    onChange={e => patchSchedule(s.id, { syncToCalendar: e.target.checked })}
                  />
                  <span>📆 Sync</span>
                </label>
                <button
                  type="button"
                  className="yps-btn ghost"
                  onClick={() => removeSchedule(s.id)}
                  title="Remove this date"
                >✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ylsn-page-section">
        <header className="ylsn-page-section-hd">
          <h2 className="ylsn-page-section-title">
            📖 Taught log {(lesson.teachings || []).length > 0 && <span className="ylsn-page-section-count">({lesson.teachings.length})</span>}
          </h2>
          <button className="yps-btn" onClick={addTeaching}>＋ Log a teaching</button>
        </header>
        {(lesson.teachings || []).length === 0 ? (
          <div className="yps-muted ylsn-page-section-empty">
            No teaching log yet. After you teach this lesson, click "＋ Log a teaching" to
            record the date, teacher, attendance, and notes for next time.
          </div>
        ) : (
          <ul className="ylsn-teaching-list">
            {lesson.teachings.map(t => (
              <li key={t.id} className="ylsn-teaching-row">
                <div className="ylsn-teaching-grid">
                  <label className="ylsn-page-field"><span className="ylsn-page-field-label">Date</span><input type="date" className="ylsn-page-input" value={t.date} onChange={e => setTeaching(t.id, { date: e.target.value })} /></label>
                  <label className="ylsn-page-field"><span className="ylsn-page-field-label">Teacher</span><input className="ylsn-page-input" value={t.teacher} onChange={e => setTeaching(t.id, { teacher: e.target.value })} placeholder="Who taught" /></label>
                  <label className="ylsn-page-field"><span className="ylsn-page-field-label">Location</span><input className="ylsn-page-input" value={t.location} onChange={e => setTeaching(t.id, { location: e.target.value })} placeholder="Campus / room" /></label>
                  <label className="ylsn-page-field"><span className="ylsn-page-field-label">Attendance</span><input type="number" className="ylsn-page-input" value={t.attendance} min={0} onChange={e => setTeaching(t.id, { attendance: Math.max(0, Number(e.target.value)) })} /></label>
                  <label className="ylsn-page-field"><span className="ylsn-page-field-label">Rating</span><RatingStars value={t.rating} onChange={(r) => setTeaching(t.id, { rating: r })} /></label>
                  <label className="ylsn-page-field full"><span className="ylsn-page-field-label">Debrief / notes for next time</span><textarea className="ylsn-page-textarea" rows={2} value={t.debrief} onChange={e => setTeaching(t.id, { debrief: e.target.value })} placeholder="What worked, what to change, follow-up actions…" /></label>
                </div>
                <button className="yps-btn danger" onClick={() => removeTeaching(t.id)}>🗑 Remove this entry</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Series row + inline picker — used inside LessonPage so series
   memberships can be managed from the lesson side.
   ───────────────────────────────────────────────────────────── */
function SeriesRow({ attachedSeries, allSeries, attachedIds, onSetMemberships, onCreateSeries }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const [draft, setDraft] = useState(() => new Set(attachedIds));
  const [newSeriesTitle, setNewSeriesTitle] = useState('');

  /* Reset the draft when the page's actual attached ids change
     (e.g. after a commit, or after creating a new series inline). */
  useEffect(() => { setDraft(new Set(attachedIds)); }, [attachedIds.join('|')]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* Click outside to close — same UX as the room-occupant picker. */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggleSeries = (id) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const commit = () => {
    onSetMemberships([...draft]);
    setOpen(false);
  };

  const removeOne = (id) => {
    /* Detach a single series immediately (no picker open). */
    const next = new Set(attachedIds);
    next.delete(id);
    onSetMemberships([...next]);
  };

  const createNew = () => {
    const t = newSeriesTitle.trim();
    if (!t) return;
    const id = onCreateSeries(t);
    if (id) {
      const next = new Set(draft);
      next.add(id);
      setDraft(next);
      setNewSeriesTitle('');
    }
  };

  return (
    <div className="ylsn-page-series-row" ref={wrapRef}>
      <span className="ylsn-page-series-label">Series</span>
      <div className="ylsn-page-series-chips">
        {attachedSeries.length === 0 ? (
          <span className="yps-muted ylsn-page-series-empty">🪴 Unfiled — attach to one or more series →</span>
        ) : attachedSeries.map(s => (
          <span
            key={s.id}
            className="ylsn-page-series-chip"
            style={{ '--series-color': s.color || GENERIC_COLOR }}
          >
            {s.title || 'Series'}
            <button
              type="button"
              className="ylsn-page-series-chip-x"
              onClick={() => removeOne(s.id)}
              title="Remove from this series"
            >✕</button>
          </span>
        ))}
        <button
          type="button"
          className="ylsn-page-series-add-btn"
          onClick={() => setOpen(o => !o)}
        >＋ {attachedSeries.length === 0 ? 'Attach to series' : 'Add to another series'}</button>
      </div>

      {open && (
        <div className="ylsn-page-series-menu">
          <div className="ylsn-page-series-menu-hd">Pick the series this lesson belongs to</div>
          {allSeries.length === 0 ? (
            <div className="yps-muted ylsn-page-series-menu-empty">
              No series yet — create one below.
            </div>
          ) : (
            <ul className="ylsn-page-series-menu-list">
              {allSeries.map(s => {
                const checked = draft.has(s.id);
                return (
                  <li key={s.id}>
                    <label className={`ylsn-page-series-menu-opt ${checked ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSeries(s.id)}
                      />
                      <span
                        className="ylsn-page-series-menu-dot"
                        style={{ background: s.color || GENERIC_COLOR }}
                        aria-hidden="true"
                      />
                      <span className="ylsn-page-series-menu-name">{s.title || 'Untitled series'}</span>
                      {s.audience && <span className="yps-pill">{s.audience}</span>}
                      {s.archived && <span className="yps-pill">archived</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="ylsn-page-series-menu-create">
            <input
              className="yps-input"
              placeholder="Or create a new series…"
              value={newSeriesTitle}
              onChange={e => setNewSeriesTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNew(); } }}
            />
            <button
              type="button"
              className="yps-btn"
              onClick={createNew}
              disabled={!newSeriesTitle.trim()}
            >＋ Create</button>
          </div>

          <footer className="ylsn-page-series-menu-ft">
            <button type="button" className="yps-btn ghost" onClick={() => { setDraft(new Set(attachedIds)); setOpen(false); }}>Cancel</button>
            <button type="button" className="yps-add-btn" onClick={commit}>Save</button>
          </footer>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Linked Games picker — multi-pick from the Games catalog with a
   per-row Before/After toggle. Live-filter dropdown + dedupe so the
   same game can't be linked twice. Empty-state guides the user back
   to the Games page if their catalog is empty.
   ───────────────────────────────────────────────────────────── */
function LinkedGamesPicker({ allGames, linkedGames, onAdd, onSetPosition, onRemove }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const linkedIds = useMemo(() => new Set((linkedGames || []).map(lg => lg.gameId)), [linkedGames]);
  const gamesById = useMemo(() => {
    const m = new Map();
    for (const g of (allGames || [])) m.set(g.id, g);
    return m;
  }, [allGames]);

  /* Click-outside closes the picker. */
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const visiblePicks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (allGames || []).filter(g => {
      if (linkedIds.has(g.id)) return false;
      if (!q) return true;
      const hay = [g.name, g.type, g.supplies, g.instructions, g.notes].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allGames, query, linkedIds]);

  return (
    <section className="ylsn-page-section ylsn-page-linkedgames-edit" ref={wrapRef}>
      <header className="ylsn-page-section-hd">
        <h2 className="ylsn-page-section-title">🎲 Games & icebreakers</h2>
        <button
          type="button"
          className="yps-btn"
          onClick={() => setPickerOpen(o => !o)}
        >＋ Attach from catalog</button>
      </header>

      {(linkedGames || []).length === 0 ? (
        <div className="yps-muted ylsn-page-section-empty">
          No games attached yet. Pick from your catalog to plan an icebreaker
          before the teaching, or an energy burner after.
        </div>
      ) : (
        <ul className="ylsn-page-linkedgames-edit-list">
          {linkedGames.map(lg => {
            const g = gamesById.get(lg.gameId);
            if (!g) {
              return (
                <li key={lg.id} className="ylsn-page-linkedgame-edit ylsn-page-linkedgame-missing">
                  <span className="ylsn-page-linkedgame-name">⚠️ Game no longer in catalog</span>
                  <button type="button" className="yps-btn ghost" onClick={() => onRemove(lg.id)}>✕</button>
                </li>
              );
            }
            return (
              <li key={lg.id} className="ylsn-page-linkedgame-edit">
                <div className="ylsn-page-linkedgame-info">
                  <span className="ylsn-page-linkedgame-name">🎲 {g.name || 'Untitled game'}</span>
                  <span className="ylsn-page-linkedgame-meta">
                    {g.type && <span className="yps-pill">{g.type}</span>}
                    {g.duration && <span className="yps-pill">{g.duration}m</span>}
                    {g.energy && <span className={`yps-pill yg-energy yg-energy-${String(g.energy).toLowerCase()}`}>{g.energy}</span>}
                  </span>
                </div>
                <div className="ylsn-page-linkedgame-toggle" role="radiogroup" aria-label="Position">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={lg.position !== 'after'}
                    className={`yps-chip ${lg.position !== 'after' ? 'on' : ''}`}
                    onClick={() => onSetPosition(lg.id, 'before')}
                  >Before</button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={lg.position === 'after'}
                    className={`yps-chip ${lg.position === 'after' ? 'on' : ''}`}
                    onClick={() => onSetPosition(lg.id, 'after')}
                  >After</button>
                </div>
                <button
                  type="button"
                  className="yps-btn ghost"
                  onClick={() => onRemove(lg.id)}
                  title="Detach this game"
                >✕</button>
              </li>
            );
          })}
        </ul>
      )}

      {pickerOpen && (
        <div className="ylsn-page-linkedgames-picker">
          <div className="ylsn-page-linkedgames-picker-hd">
            <input
              autoFocus
              className="yps-input"
              placeholder="🔍 Search your games catalog…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button type="button" className="yps-btn ghost" onClick={() => setPickerOpen(false)}>✕</button>
          </div>
          {(allGames || []).length === 0 ? (
            <div className="yps-muted ylsn-page-section-empty">
              Your games catalog is empty. Head to <b>Youth → Games & Icebreakers</b> to add some, then come back.
            </div>
          ) : visiblePicks.length === 0 ? (
            <div className="yps-muted ylsn-page-section-empty">
              {linkedIds.size === (allGames || []).length
                ? 'Every game in your catalog is already attached.'
                : 'No matches — try a different search.'}
            </div>
          ) : (
            <ul className="ylsn-page-linkedgames-picker-list">
              {visiblePicks.map(g => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="ylsn-page-linkedgames-picker-row"
                    onClick={() => { onAdd(g.id); setQuery(''); }}
                  >
                    <span className="ylsn-page-linkedgame-name">🎲 {g.name || 'Untitled game'}</span>
                    <span className="ylsn-page-linkedgame-meta">
                      {g.type && <span className="yps-pill">{g.type}</span>}
                      {g.duration && <span className="yps-pill">{g.duration}m</span>}
                      {g.energy && <span className={`yps-pill yg-energy yg-energy-${String(g.energy).toLowerCase()}`}>{g.energy}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tag editor + Rating + Word download (unchanged from before)
   ───────────────────────────────────────────────────────────── */
function TagEditor({ value, onChange, suggestions }) {
  const [input, setInput] = useState('');
  const tags = value || [];
  const addTag = (raw) => {
    const t = (raw || input).trim().replace(/^#/, '').toLowerCase();
    if (!t) return;
    if (tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  };
  const removeTag = (t) => onChange(tags.filter(x => x !== t));
  const filteredSuggestions = (suggestions || [])
    .filter(s => !tags.includes(s) && (!input || s.includes(input.toLowerCase())))
    .slice(0, 8);

  return (
    <div className="ylsn-tag-editor">
      <div className="ylsn-tag-chips">
        {tags.map(t => (
          <span key={t} className="ylsn-tag-chip">
            #{t}
            <button type="button" onClick={() => removeTag(t)} title="Remove tag">✕</button>
          </span>
        ))}
        <input
          className="ylsn-tag-input"
          placeholder={tags.length === 0 ? 'Add tags — identity, anxiety, prayer…' : 'Add another…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
            else if (e.key === 'Backspace' && !input && tags.length) { removeTag(tags[tags.length - 1]); }
          }}
        />
      </div>
      {filteredSuggestions.length > 0 && (
        <div className="ylsn-tag-suggest">
          {filteredSuggestions.map(s => (
            <button key={s} type="button" className="yps-chip" onClick={() => addTag(s)}>#{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingStars({ value, onChange }) {
  const v = Number(value) || 0;
  return (
    <div className="ylsn-rating">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          className={`ylsn-rating-star ${n <= v ? 'on' : ''}`}
          onClick={() => onChange(v === n ? 0 : n)}
          title={`${n}/5`}
        >★</button>
      ))}
    </div>
  );
}

function downloadLessonAsWord(lesson, series) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const seriesHeader = series?.title
    ? `<div style="font-size:11pt;color:#777;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:4px;">${esc(series.title)}</div>`
    : '';
  const bigIdea = lesson.bigIdea
    ? `<div style="font-size:13pt;font-style:italic;color:#444;margin:10px 0 14px;padding-left:14px;border-left:3px solid #888;">💡 ${esc(lesson.bigIdea)}</div>`
    : '';

  /* Scripture passages — each reference is an <h3> so Word's
     outline / navigation pane lets the reader collapse them
     individually. Inline verse numbers render as <sup>, falling
     back to plain text for passages without structured verses. */
  const passages = (lesson.scripturePassages || []).filter(p => p.reference || p.text || (p.verses && p.verses.length));
  const passageInnerHtml = (p) => {
    if (Array.isArray(p.verses) && p.verses.length > 0) {
      return p.verses.map(v => `<sup style="font-weight:700;color:#888;font-size:8pt;margin-right:2px;">${v.number}</sup>${esc(v.text)}`).join(' ');
    }
    if (p.text) return esc(p.text);
    return '<em style="color:#888;">(no verse text — open in app + press Enter on the reference to fetch.)</em>';
  };
  const scriptureBlock = passages.length === 0 ? '' : `
    <h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Scripture</h2>
    ${passages.map(p => `
      <h3 style="font-family:Calibri,sans-serif;font-size:12pt;color:#222;margin:12px 0 4px;">📖 ${esc(p.reference || '—')}</h3>
      <blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #ccc;font-size:11pt;color:#333;white-space:normal;line-height:1.6;">
        ${passageInnerHtml(p)}
      </blockquote>
    `).join('')}
  `;
  /* Schedules list — each row is its own date+time. */
  const schedules = (lesson.schedules || []).filter(s => s.date);
  const scheduled = schedules.length === 0 ? '' : `
    <p style="font-size:10pt;color:#666;margin:6px 0;"><b>📅 Scheduled:</b>
      ${schedules.map(s => `${esc(s.date)}${s.time ? ' · ' + esc(s.time) : ''}${s.syncToCalendar ? ' (synced)' : ''}`).join(' &nbsp;·&nbsp; ')}
    </p>`;

  /* Media links — each rendered as a clickable hyperlink. */
  const mediaLinks = (lesson.mediaLinks || []).filter(m => m.url);
  const mediaBlock = mediaLinks.length === 0 ? '' : `
    <h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Media</h2>
    <ul style="font-size:11pt;padding-left:22px;">
      ${mediaLinks.map(m => {
        const href = (m.url.match(/^(https?:)?\/\//i) || m.url.match(/^mailto:/i)) ? m.url : `https://${m.url}`;
        return `<li style="margin-bottom:4px;"><a href="${esc(href)}" style="color:#1f6feb;">🔗 ${esc(m.label || m.url)}</a></li>`;
      }).join('')}
    </ul>`;
  const outline = lesson.outline
    ? `<h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Outline</h2>
       <p style="font-size:11pt;white-space:pre-wrap;">${esc(lesson.outline)}</p>`
    : '';
  const questions = (lesson.discussion || []).filter(Boolean);
  const questionsHtml = questions.length
    ? `<h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Discussion Questions</h2>
       <ol style="font-size:11pt;padding-left:24px;">
         ${questions.map(q => `<li style="margin-bottom:6px;">${esc(q)}</li>`).join('')}
       </ol>`
    : '';
  const leaderNotes = lesson.leaderNotes
    ? `<h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Leader Notes</h2>
       <p style="font-size:11pt;white-space:pre-wrap;color:#444;">${esc(lesson.leaderNotes)}</p>`
    : '';
  const teachings = lesson.teachings || [];
  const teachingsHtml = teachings.length
    ? `<h2 style="font-family:Calibri,sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:20px;">Taught Log</h2>
       <table style="width:100%;border-collapse:collapse;font-size:10pt;">
         <thead><tr style="background:#f3f3f3;">
           <th style="text-align:left;padding:6px;border:1px solid #ccc;width:90px;">Date</th>
           <th style="text-align:left;padding:6px;border:1px solid #ccc;">Teacher</th>
           <th style="text-align:left;padding:6px;border:1px solid #ccc;">Location</th>
           <th style="text-align:left;padding:6px;border:1px solid #ccc;width:60px;">Att.</th>
           <th style="text-align:left;padding:6px;border:1px solid #ccc;width:60px;">Rating</th>
           <th style="text-align:left;padding:6px;border:1px solid #ccc;">Debrief</th>
         </tr></thead>
         <tbody>
           ${teachings.map(t => `
             <tr>
               <td style="padding:6px;border:1px solid #ccc;">${esc(t.date)}</td>
               <td style="padding:6px;border:1px solid #ccc;">${esc(t.teacher)}</td>
               <td style="padding:6px;border:1px solid #ccc;">${esc(t.location)}</td>
               <td style="padding:6px;border:1px solid #ccc;">${esc(t.attendance || '')}</td>
               <td style="padding:6px;border:1px solid #ccc;">${'★'.repeat(t.rating || 0)}</td>
               <td style="padding:6px;border:1px solid #ccc;">${esc(t.debrief)}</td>
             </tr>
           `).join('')}
         </tbody>
       </table>`
    : '';
  const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="Microsoft Word 15" />
  <meta name="Originator" content="Microsoft Word 15" />
  <title>${esc(lesson.title || 'Lesson')}</title>
  <style>
    @page { size: Letter; margin: 0.75in; }
    body  { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #222; }
  </style>
</head>
<body>
  ${seriesHeader}
  <h1 style="margin:0 0 6px;font-family:Calibri,sans-serif;font-size:24pt;color:#1a1a1a;">${esc(lesson.title || 'Untitled lesson')}</h1>
  ${scheduled}
  ${bigIdea}
  ${scriptureBlock}
  ${outline}
  ${questionsHtml}
  ${leaderNotes}
  ${mediaBlock}
  ${teachingsHtml}
</body>
</html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = slugify(lesson.title || 'lesson') + '.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slugify(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lesson';
}

function Field({ label, children, full }) {
  return (
    <label className={`ylsn-field ${full ? 'full' : ''}`}>
      <span className="ylsn-field-label">{label}</span>
      {children}
    </label>
  );
}
