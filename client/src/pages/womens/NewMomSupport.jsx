import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMentors, makeListItem } from './womensListsConfig';
import { CustomAvatar } from '../friends/Avatar';
/* Reuse the shared page shell (.wa-slide/.wa-comm-list/.wa-search-wrap…)
   from AllWomen.css, the .ys-* form primitives from the Youth roster,
   and the rose-gold embossed sidebar/panel/stat system (.wls-*) that
   Life Stages defines — same visual language, same pipeline-as-a-
   journey structure (a stage sidebar + a detail pane), just with
   postpartum stages instead of life stages. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './LifeStages.css';
import './NewMomSupport.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Care → New Mom Support

   One record per mom moving through pregnancy → postpartum. Each
   record can link to a woman in the shared 'womens:women' directory
   (for photo/contact info) and to a "mentor mom" drawn from the same
   shared name registry Mentorship Pairs uses ('womens:mentors') —
   two new moms with the same mentor mom just means two records
   pointing at the same name, no separate pairing object needed.

   Storage:
     moms (this page):    useUserStoreKey('womens:new-moms', [])
     women (read/write):  useUserStoreKey('womens:women', [])
     mentor names:        useMentors() — shared with Mentorship Pairs
                           and All Women's Mentor/Mentee picker.

   Check-ins follow the standard postpartum touchpoint schedule
   (2wk / 6wk / 3mo / 6mo from birth date). The next un-logged
   milestone is suggested automatically; the coordinator can accept
   it or hand-pick a different date, which — like Mentorship's
   check-ins — can sync to the shared Calendar.
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  expecting: {
    label: 'Expecting', short: 'Expecting', icon: '🤰',
    blurb: 'Awaiting baby’s arrival — pairing her with a mentor mom and getting ready for the welcome package.',
  },
  newborn: {
    label: 'Newborn (0–3mo)', short: 'Newborn', icon: '👶',
    blurb: 'The fourth trimester — welcome packages, meal trains, and the earliest postpartum check-ins.',
  },
  infant: {
    label: 'Infant (3–12mo)', short: 'Infant', icon: '🍼',
    blurb: 'Settling into a rhythm, with later check-ins and continued mentor mom support.',
  },
  graduated: {
    label: 'Graduated', short: 'Graduated', icon: '🎓',
    blurb: 'Moved on from active postpartum support — kept on record for continuity.',
  },
};
const STATUS_ORDER = ['expecting', 'newborn', 'infant', 'graduated'];

const ALL_META = { label: 'All moms', icon: '🤱', blurb: 'Every mom in the pipeline, across every stage.' };
const FLAG_META = {
  overdue: { label: 'Check-ins overdue', icon: '⚡', blurb: 'Moms whose next check-in date has already passed.' },
  package: { label: 'Packages pending', icon: '🎁', blurb: 'Moms still waiting on their welcome package.' },
};

const CHECKIN_MILESTONES = [
  { id: '2wk',    label: '2-week check-in',  days: 14 },
  { id: '6wk',    label: '6-week check-in',  days: 42 },
  { id: '3mo',    label: '3-month check-in', days: 90 },
  { id: '6mo',    label: '6-month check-in', days: 180 },
  { id: 'ad-hoc', label: 'Just checking in', days: null },
];
const milestoneLabel = (id) => (CHECKIN_MILESTONES.find(m => m.id === id) || {}).label || 'Check-in';

/* Whole-journey timeline, shown compact on cards and full in the
   detail header — due date and birth date bookend the fixed
   check-in schedule, "Graduated" caps it off. Distinct from
   CHECKIN_MILESTONES: this always has all 7 steps so the shape is
   the same for every mom regardless of how far along she is. */
const TIMELINE_STEPS = [
  { id: 'due',     label: 'Due' },
  { id: 'birth',   label: 'Birth' },
  { id: '2wk',     label: '2wk' },
  { id: '6wk',     label: '6wk' },
  { id: '3mo',     label: '3mo' },
  { id: '6mo',     label: '6mo' },
  { id: 'graduated', label: 'Grad' },
];
function timelineSteps(mom) {
  const loggedIds = new Set((mom.checkIns || []).map(c => c.milestone));
  const hasBirth = !!mom.birthDate;
  const isGraduated = (mom.status || 'expecting') === 'graduated';
  return TIMELINE_STEPS.map(step => {
    if (step.id === 'due') return { ...step, state: mom.dueDate ? 'done' : 'pending' };
    if (step.id === 'birth') return { ...step, state: hasBirth ? 'done' : 'pending' };
    if (step.id === 'graduated') return { ...step, state: isGraduated ? 'done' : 'pending' };
    if (!hasBirth) return { ...step, state: 'pending' };
    if (loggedIds.has(step.id)) return { ...step, state: 'done' };
    const meta = CHECKIN_MILESTONES.find(c => c.id === step.id);
    const dueDate = meta ? addDays(mom.birthDate, meta.days) : '';
    return { ...step, state: dueDate && dueDate < today() ? 'overdue' : 'upcoming' };
  });
}

const DUE_SOON_CHECKIN_DAYS = 7;
const DUE_SOON_BIRTH_DAYS = 14;
function daysUntil(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return Infinity;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((dt - now) / 86400000);
}

const CAL_SOURCE_CHECKIN = 'women-newmom-checkin';
const CAL_COLOR_CHECKIN  = '#f472b6'; // pink — matches Care group accent

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso, days) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/* Earliest un-logged milestone (2wk → 6wk → 3mo → 6mo) counting
   from birth date. Returns null once all four are logged or there's
   no birth date yet — the coordinator sets check-ins by hand for
   expecting moms. */
function suggestCheckIn(mom) {
  if (!mom.birthDate) return null;
  const logged = new Set((mom.checkIns || []).map(c => c.milestone));
  const fixed = CHECKIN_MILESTONES.filter(m => m.days != null);
  for (const m of fixed) {
    if (!logged.has(m.id)) return { milestone: m.id, label: m.label, date: addDays(mom.birthDate, m.days) };
  }
  return null;
}

const DEFAULT_MOM = () => ({
  id:               makeId('nm'),
  name:             '',
  womanId:          null,
  babyName:         '',
  babyGender:       '', // boy | girl | unknown
  dueDate:          '',
  birthDate:        '',
  status:           'expecting',
  mentorMomName:    '',
  mentorMomWomanId: null,
  welcomeDelivered: false,
  welcomeDate:      '',
  mealTrainActive:  false,
  mealTrainNotes:   '',
  prayerNotes:      '',
  nextCheckIn:      '',
  syncCheckInToCalendar: true,
  checkIns:         [], // [{ id, milestone, date, notes, createdAt }]
  notes:            '',
  createdAt:        Date.now(),
});

export default function NewMomSupport() {
  const [moms, setMoms, { loading }] = useUserStoreKey('womens:new-moms', []);
  const [women, setWomen] = useUserStoreKey('womens:women', []);
  const [mentors, setMentors] = useMentors();
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(moms) ? moms : [];
  const womenList = Array.isArray(women) ? women : [];
  const mentorsList = Array.isArray(mentors) ? mentors : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const findWoman = (id) => womenList.find(w => w.id === id) || null;

  /* ── Calendar sync for a mom's next check-in ───────────────── */
  const syncCheckInCalendarFor = (mom) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const others = evList.filter(e => !(e.source === CAL_SOURCE_CHECKIN && e.source_id === mom.id));
      if (!mom.syncCheckInToCalendar || mom.status === 'graduated' || !mom.nextCheckIn) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_nm_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       `🤱 Check-in: ${mom.name || 'New mom'}`,
        description: mom.babyName ? `Baby: ${mom.babyName}` : '',
        event_date:  mom.nextCheckIn,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_CHECKIN,
        category:    'womens',
        source:      CAL_SOURCE_CHECKIN,
        source_id:   mom.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeCheckInCalendarFor = (momId) => {
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE_CHECKIN && e.source_id === momId)));
  };

  /* Keeps the linked woman's own `mentor` field pointed at her
     mentor mom, mirroring the sync Mentorship Pairs does. */
  const applyPersonLink = (merged, previous) => {
    if (!merged.womanId && !previous?.womanId) return;
    setWomen(prev => {
      let l = Array.isArray(prev) ? [...prev] : [];
      if (previous?.womanId && previous.womanId !== merged.womanId) {
        l = l.map(w => (w.id === previous.womanId && w.mentor === previous.mentorMomName) ? { ...w, mentor: '' } : w);
      }
      if (merged.womanId) {
        l = l.map(w => w.id === merged.womanId ? { ...w, mentor: merged.mentorMomName || '' } : w);
      }
      return l;
    });
  };

  /* ── Actions ────────────────────────────────────────────────── */
  const addMom = () => {
    const m = DEFAULT_MOM();
    setMoms(prev => [...(prev || []), m]);
    setSelectedId(m.id);
  };

  const updateMom = (id, patch) => {
    const current = list.find(m => m.id === id);
    setMoms(prev => (prev || []).map(m => m.id === id ? { ...m, ...patch } : m));
    if (current) {
      const merged = { ...current, ...patch };
      applyPersonLink(merged, current);
      syncCheckInCalendarFor(merged);
    }
  };

  const logCheckIn = (id, { milestone, date, notes }) => {
    if (!date) return;
    const current = list.find(m => m.id === id);
    if (!current) return;
    const entry = { id: makeId('ci'), milestone: milestone || 'ad-hoc', date, notes: (notes || '').trim(), createdAt: new Date().toISOString() };
    const checkIns = [entry, ...(Array.isArray(current.checkIns) ? current.checkIns : [])];
    const suggestion = suggestCheckIn({ ...current, checkIns });
    updateMom(id, { checkIns, nextCheckIn: suggestion ? suggestion.date : '' });
  };

  const removeCheckIn = (id, checkInId) => {
    const current = list.find(m => m.id === id);
    if (!current) return;
    updateMom(id, { checkIns: (current.checkIns || []).filter(c => c.id !== checkInId) });
  };

  const removeMom = (id) => {
    const current = list.find(m => m.id === id);
    setMoms(prev => (prev || []).filter(m => m.id !== id));
    if (current) {
      applyPersonLink({ womanId: null, mentorMomName: '' }, current);
      removeCheckInCalendarFor(id);
    }
    if (selectedId === id) setSelectedId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);
  const openPrayerRequest = () => navigate('/prayers?new=1');

  const selected = useMemo(() => list.find(m => m.id === selectedId) || null, [list, selectedId]);

  /* Lock body scroll + Esc-to-close while the slide-over is open. */
  useEffect(() => {
    if (!selected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  const isOverdue = (m) => m.status !== 'graduated' && !!m.nextCheckIn && m.nextCheckIn < today();
  const isDueSoonCheckIn = (m) => m.status !== 'graduated' && !!m.nextCheckIn && m.nextCheckIn >= today() && daysUntil(m.nextCheckIn) <= DUE_SOON_CHECKIN_DAYS;
  const isPackagePending = (m) => !m.welcomeDelivered;
  const isDueDateSoon = (m) => (m.status || 'expecting') === 'expecting' && !!m.dueDate && daysUntil(m.dueDate) >= 0 && daysUntil(m.dueDate) <= DUE_SOON_BIRTH_DAYS;

  /* Urgency rank used to sort the roster: overdue first, then due
     soon, then anyone else with a check-in on the books, then
     everyone else — each tier sorted by date/name within itself. */
  const urgencyRank = (m) => (isOverdue(m) ? 0 : isDueSoonCheckIn(m) ? 1 : m.nextCheckIn ? 2 : 3);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(m =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.babyName || '').toLowerCase().includes(q) ||
          (m.mentorMomName || '').toLowerCase().includes(q))
      : list;
    if (filter === 'overdue') out = out.filter(isOverdue);
    else if (filter === 'package') out = out.filter(isPackagePending);
    else if (filter !== 'all') out = out.filter(m => (m.status || 'expecting') === filter);
    return [...out].sort((a, b) => {
      const ra = urgencyRank(a), rb = urgencyRank(b);
      if (ra !== rb) return ra - rb;
      if (ra <= 2 && a.nextCheckIn !== b.nextCheckIn) return (a.nextCheckIn || '') < (b.nextCheckIn || '') ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query, filter]);

  const stats = useMemo(() => ({
    total:   list.length,
    active:  list.filter(m => (m.status || 'expecting') !== 'graduated').length,
    overdue: list.filter(isOverdue).length,
    pending: list.filter(isPackagePending).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list]);

  /* ── "Needs attention" banner — anyone overdue, due soon, still
     waiting on a package, or due to deliver soon, across all stages. */
  const attention = useMemo(() => ({
    overdue:  list.filter(isOverdue),
    dueSoon:  list.filter(isDueSoonCheckIn),
    packages: list.filter(m => isPackagePending(m) && (m.status || 'expecting') !== 'graduated'),
    duesSoon: list.filter(isDueDateSoon),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list]);

  /* ── Mentor matching list ───────────────────────────────────── */
  const activeMentorNames = useMemo(
    () => new Set(list.filter(m => (m.status || 'expecting') !== 'graduated').map(m => (m.mentorMomName || '').toLowerCase()).filter(Boolean)),
    [list]
  );
  const momsWaiting = useMemo(
    () => list.filter(m => (m.status || 'expecting') !== 'graduated' && !(m.mentorMomName || '').trim()),
    [list]
  );
  const mentorsAvailable = useMemo(
    () => mentorsList.filter(mn => (mn.label || '').trim() && !activeMentorNames.has(mn.label.toLowerCase())),
    [mentorsList, activeMentorNames]
  );

  const assignMentor = (momId, name) => {
    updateMom(momId, { mentorMomName: name, mentorMomWomanId: null });
  };

  return (
    <WomensShell
      title="New Mom Support"
      icon="🤱"
      subtitle="Welcome packages, postpartum check-ins, baby-step playdates, and mentor mom pairings."
      actions={
        <button type="button" className="wms-btn primary" onClick={addMom}>
          ✦ New mom
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root nm-root">
        {loading && list.length === 0 ? (
          <div className="wa-directory-empty" style={{ flex: 1 }}>Loading…</div>
        ) : list.length === 0 ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">🤱</div>
            <div className="app-empty-title">No moms in the pipeline yet</div>
            <div className="app-empty-sub">
              Track expecting and postpartum moms — welcome packages, mentor mom
              pairings, and check-ins all live on her record here.
            </div>
            <button type="button" className="app-btn primary" onClick={addMom}>
              ✦ Add your first mom
            </button>
          </div>
        ) : (
          <>
            <AttentionStrip attention={attention} onOpen={setSelectedId} />

            <div className="wls-split">
              <MomStageSidebar
                active={filter}
                onSelect={setFilter}
                countFor={(id) => id === 'all' ? list.length : list.filter(m => (m.status || 'expecting') === id).length}
              />

              <div className="wls-detail">
                <MomsDashboard
                  meta={filter === 'overdue' || filter === 'package' ? FLAG_META[filter] : (filter === 'all' ? ALL_META : STATUS_META[filter])}
                  stats={stats}
                  filter={filter}
                  onSetFilter={setFilter}
                />

                <MentorMatchList
                  waiting={momsWaiting}
                  mentors={mentorsAvailable}
                  onAssign={assignMentor}
                />

                <section className="wls-panel">
                  <div className="wls-panel-row">
                    <h3 className="wls-panel-subtitle">Moms ({visible.length}{visible.length !== list.length ? ` of ${list.length}` : ''})</h3>
                  </div>

                  <div className="wa-controls">
                    <div className="wa-search-wrap">
                      <span>🔍</span>
                      <input
                        type="text"
                        placeholder="Search by mom, baby, or mentor mom…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                      />
                      {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
                    </div>
                  </div>

                  {visible.length === 0 ? (
                    <div className="wls-empty-note">
                      {query ? `No moms match "${query}".` : 'No moms match this filter.'}
                    </div>
                  ) : (
                    <ul className="wls-roster">
                      {visible.map(m => (
                        <MomRosterRow
                          key={m.id}
                          mom={m}
                          woman={findWoman(m.womanId)}
                          overdue={isOverdue(m)}
                          packagePending={isPackagePending(m)}
                          onOpen={() => setSelectedId(m.id)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label="New mom record">
            <button
              className="wa-slide-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              <MomDetail
                mom={selected}
                women={womenList}
                mentors={mentorsList}
                onCreateMentor={(label) => setMentors(prev => [...(prev || []), makeListItem(label)])}
                onChange={(patch) => updateMom(selected.id, patch)}
                onLogCheckIn={(entry) => logCheckIn(selected.id, entry)}
                onRemoveCheckIn={(checkInId) => removeCheckIn(selected.id, checkInId)}
                onDelete={() => removeMom(selected.id)}
                onOpenWoman={openWoman}
                onOpenPrayer={openPrayerRequest}
              />
            </div>
          </aside>
        </>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}

/* ── 1. Stage sidebar — reuses Life Stages' journey-node pattern,
   just for the postpartum pipeline (All → Expecting → Newborn →
   Infant → Graduated) instead of life stages. ─────────────────── */
function MomStageSidebar({ active, onSelect, countFor }) {
  const items = ['all', ...STATUS_ORDER];
  return (
    <nav className="wls-sidebar" aria-label="Mom stages">
      <div className="wls-sidebar-list">
        {items.map((id, i) => {
          const meta = id === 'all' ? ALL_META : STATUS_META[id];
          return (
            <div key={id} className="wls-sidebar-item">
              <button
                type="button"
                className={`wls-node vertical${active === id ? ' on' : ''}`}
                onClick={() => onSelect(id)}
              >
                <span className="wls-node-icon">{meta.icon}</span>
                <span className="wls-node-name">{meta.short || meta.label}</span>
                <span className="wls-node-count">{countFor(id)}</span>
              </button>
              {i < items.length - 1 && <span className="wls-sidebar-arrow" aria-hidden="true">↓</span>}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/* ── 2. Dashboard — heading for whichever stage/flag is active, plus
   the stat row. Overdue/Packages are flag-style stat toggles (same
   click-to-filter, pulse-while-flagged pattern as Life Stages' Needs
   care stat), not separate sidebar nodes, since they cut across
   stages rather than being a stage themselves. ───────────────────── */
function MomsDashboard({ meta, stats, filter, onSetFilter }) {
  return (
    <section className="wls-panel">
      <div className="wls-panel-hd">
        <span className="wls-panel-icon">{meta.icon}</span>
        <div>
          <h2 className="wls-panel-title">{meta.label}</h2>
          {meta.blurb && <div className="wls-panel-blurb">{meta.blurb}</div>}
        </div>
      </div>

      <div className="wls-stat-row nm-stat-row">
        <div className="wls-stat">
          <span className="wls-stat-n">{stats.total}</span>
          <span className="wls-stat-lbl">Moms</span>
        </div>
        <div className="wls-stat">
          <span className="wls-stat-n">{stats.active}</span>
          <span className="wls-stat-lbl">Active</span>
        </div>
        <button
          type="button"
          className={`wls-stat is-flag${filter === 'overdue' ? ' on' : ''}${stats.overdue > 0 ? ' has-flag' : ''}`}
          disabled={!stats.overdue}
          onClick={() => onSetFilter(filter === 'overdue' ? 'all' : 'overdue')}
        >
          <span className="wls-stat-n">{stats.overdue}</span>
          <span className="wls-stat-lbl">Check-ins overdue</span>
        </button>
        <button
          type="button"
          className={`wls-stat is-flag${filter === 'package' ? ' on' : ''}${stats.pending > 0 ? ' has-flag' : ''}`}
          disabled={!stats.pending}
          onClick={() => onSetFilter(filter === 'package' ? 'all' : 'package')}
        >
          <span className="wls-stat-n">{stats.pending}</span>
          <span className="wls-stat-lbl">Packages pending</span>
        </button>
      </div>
    </section>
  );
}

/* ── 3. Needs-attention banners — page-wide, above the split, same
   flat "unassigned" bar Life Stages uses for its own cross-cutting
   callout (icon + count text, then a row of chips), one bar per
   reason instead of Life Stages' single case. ────────────────────── */
function AttentionStrip({ attention, onOpen }) {
  const groups = [
    { key: 'overdue',  icon: '⚡', label: 'check-in{s} overdue',        items: attention.overdue,  tone: 'overdue' },
    { key: 'dueSoon',  icon: '⏰', label: 'check-in{s} due this week',  items: attention.dueSoon,  tone: 'soon' },
    { key: 'packages', icon: '🎁', label: 'package{s} not yet delivered', items: attention.packages, tone: 'pending' },
    { key: 'duesSoon', icon: '🤰', label: 'due date{s} coming up',      items: attention.duesSoon, tone: 'soon' },
  ].filter(g => g.items.length > 0);
  if (!groups.length) return null;

  return (
    <>
      {groups.map(g => (
        <div key={g.key} className="wls-unassigned">
          <span className="wls-unassigned-hd">
            {g.icon} {g.items.length} {g.label.replace('{s}', g.items.length === 1 ? '' : 's')} —
          </span>
          <div className="wls-unassigned-list">
            {g.items.map(m => (
              <button
                key={m.id}
                type="button"
                className={`wls-unassigned-chip nm-attn-chip tone-${g.tone}`}
                onClick={() => onOpen(m.id)}
              >{m.name || '(no name)'}</button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── 4. Mentor matching list — styled after Life Stages' Incoming
   transitions panel (a panel of rows, each with a name and an
   inline action) instead of the earlier two-column board, so
   pairing reads as "one row per mom, assign from a dropdown" the
   same way Life Stages assigns a roster row's group. ───────────── */
function MentorMatchList({ waiting, mentors, onAssign }) {
  if (!waiting.length) return null;

  return (
    <section className="wls-panel wls-transitions">
      <h3 className="wls-panel-subtitle">🧭 Waiting for a mentor mom</h3>
      <ul className="wls-transition-list">
        {waiting.map(m => (
          <li key={m.id} className="wls-transition-row">
            <span className="wls-transition-name">{m.name || '(no name)'}</span>
            <span className="wls-transition-from">no mentor mom yet</span>
            <span className="wls-transition-actions">
              {mentors.length === 0 ? (
                <span className="nm-hint" style={{ margin: 0 }}>No unpaired mentor moms on file.</span>
              ) : (
                <select
                  className="ys-inp"
                  value=""
                  onChange={e => e.target.value && onAssign(m.id, e.target.value)}
                >
                  <option value="">Assign mentor mom…</option>
                  {mentors.map(mn => <option key={mn.id} value={mn.label}>{mn.label}</option>)}
                </select>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Roster row — same shape as Life Stages' wls-roster-row (top
   line: avatar + name + meta + Open button), with the compact
   whole-journey timeline as a second line, since that's the one
   piece Life Stages has no equivalent for. ────────────────────── */
function MomRosterRow({ mom, woman, overdue, packagePending, onOpen }) {
  const status = mom.status || 'expecting';
  const meta = STATUS_META[status] || STATUS_META.expecting;
  const metaText = [
    `${meta.icon} ${meta.label}`,
    mom.babyName && `👶 ${mom.babyName}`,
    mom.mentorMomName && `🤝 ${mom.mentorMomName}`,
    packagePending ? '🎁 package pending' : '🎁 delivered',
    overdue && '⚡ check-in overdue',
    mom.nextCheckIn && `Next check-in: ${mom.nextCheckIn}`,
  ].filter(Boolean).join(' · ');

  return (
    <li className="wls-roster-row">
      <div className="wls-roster-top">
        <AvatarDot url={woman?.photoUrl} avatar={woman?.avatar} name={mom.name} />
        <span className="wls-roster-name">{mom.name || '(no name)'}</span>
        <span className="wls-roster-meta">{metaText}</span>
        <button type="button" className="wls-roster-open" onClick={onOpen}>Open →</button>
      </div>
      <MomTimeline mom={mom} compact />
    </li>
  );
}

/* ── Whole-journey timeline (Due → Birth → 2wk → 6wk → 3mo → 6mo →
   Graduated), reused compact on cards and full-size in the detail
   header — this is the piece Life Stages has no equivalent for,
   since its stages aren't dated the way postpartum care is. ──── */
function MomTimeline({ mom, compact }) {
  const steps = timelineSteps(mom);
  return (
    <div className={`nm-timeline${compact ? ' compact' : ''}`}>
      {steps.map((s, i) => (
        <div key={s.id} className="nm-timeline-step">
          {i > 0 && <span className={`nm-timeline-line state-${s.state}`} />}
          <span className={`nm-timeline-dot state-${s.state}`} title={s.label} />
          {!compact && <span className="nm-timeline-lbl">{s.label}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Detail / edit slide-over (always editable, matches Mentorship's
   PairDetail pattern — no separate view/edit toggle) ──────────── */
function MomDetail({ mom, women, mentors, onCreateMentor, onChange, onLogCheckIn, onRemoveCheckIn, onDelete, onOpenWoman, onOpenPrayer }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const checkIns = Array.isArray(mom.checkIns) ? mom.checkIns : [];
  const linkedWoman = women.find(w => w.id === mom.womanId);
  const suggestion = useMemo(() => suggestCheckIn(mom), [mom]);

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const setWelcomeDelivered = (e) => {
    const delivered = e.target.checked;
    onChange({ welcomeDelivered: delivered, welcomeDate: delivered ? (mom.welcomeDate || today()) : mom.welcomeDate });
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="nm-detail-icon">{STATUS_META[mom.status || 'expecting'].icon}</span>
          <h2 className="ys-form-title">{mom.name || 'New mom'}</h2>
        </div>
        <button
          type="button"
          className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete' : '🗑 Delete'}
        </button>
      </div>

      <MomTimeline mom={mom} />

      <Section title="Mom & baby">
        <Field label="Mom's name">
          <PersonPicker
            name={mom.name}
            women={women}
            mentors={mentors}
            onCreateMentor={onCreateMentor}
            placeholder="Her name"
            onPick={(name, womanId) => onChange({ name, womanId })}
          />
          {linkedWoman && (
            <button type="button" className="nm-open-woman nm-accent-text" onClick={() => onOpenWoman(linkedWoman.id)}>
              Open her profile →
            </button>
          )}
        </Field>
        <Row>
          <Field label="Baby's name">
            <input type="text" className="ys-inp" value={mom.babyName || ''} onChange={set('babyName')} placeholder="Optional" />
          </Field>
          <Field label="Baby">
            <select className="ys-inp" value={mom.babyGender || ''} onChange={set('babyGender')}>
              <option value="">—</option>
              <option value="boy">Boy</option>
              <option value="girl">Girl</option>
              <option value="unknown">Not yet known</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Due date">
            <input type="date" className="ys-inp" value={mom.dueDate || ''} onChange={set('dueDate')} />
          </Field>
          <Field label="Birth date">
            <input type="date" className="ys-inp" value={mom.birthDate || ''} onChange={set('birthDate')} />
          </Field>
        </Row>
        <Field label="Stage">
          <select className="ys-inp" value={mom.status || 'expecting'} onChange={set('status')}>
            {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Mentor mom">
        <Field label="Paired with">
          <PersonPicker
            name={mom.mentorMomName}
            women={women}
            mentors={mentors}
            onCreateMentor={onCreateMentor}
            placeholder="Mentor mom's name"
            onPick={(name, womanId) => onChange({ mentorMomName: name, mentorMomWomanId: womanId })}
          />
        </Field>
        <div className="nm-hint">
          Drawn from the same shared name list as Mentorship Pairs — pick an
          existing mentor or add a new name.
        </div>
      </Section>

      <Section title="Welcome package">
        <label className="nm-check-row">
          <input type="checkbox" checked={!!mom.welcomeDelivered} onChange={setWelcomeDelivered} style={{ accentColor: 'var(--ys-accent)' }} />
          <span>🎁 Welcome package delivered</span>
        </label>
        {mom.welcomeDelivered && (
          <Field label="Delivered on">
            <input type="date" className="ys-inp" value={mom.welcomeDate || ''} onChange={set('welcomeDate')} />
          </Field>
        )}
      </Section>

      <Section title="Meal train / care">
        <label className="nm-check-row">
          <input type="checkbox" checked={!!mom.mealTrainActive} onChange={set('mealTrainActive')} style={{ accentColor: 'var(--ys-accent)' }} />
          <span>🍲 Meal train currently active</span>
        </label>
        <Field label="Notes">
          <input
            type="text"
            className="ys-inp"
            value={mom.mealTrainNotes || ''}
            onChange={set('mealTrainNotes')}
            placeholder="Allergies, coordinator, sign-up link…"
          />
        </Field>
      </Section>

      <Section title="Check-ins">
        {suggestion && (
          <div className="nm-suggest">
            <span>Suggested next: <strong>{suggestion.label}</strong> on {suggestion.date}</span>
            <button
              type="button"
              className="nm-suggest-btn nm-accent-solid"
              onClick={() => onChange({ nextCheckIn: suggestion.date })}
            >Use this date</button>
          </div>
        )}
        <Field label="Next check-in">
          <input type="date" className="ys-inp" value={mom.nextCheckIn || ''} onChange={set('nextCheckIn')} />
          <label
            className={`nm-sync-row${mom.syncCheckInToCalendar ? ' active' : ''}${!mom.nextCheckIn ? ' disabled' : ''}`}
            title={mom.nextCheckIn ? 'Add this check-in as a Calendar reminder' : 'Pick a date first'}
          >
            <input
              type="checkbox"
              checked={!!mom.syncCheckInToCalendar}
              disabled={!mom.nextCheckIn}
              onChange={set('syncCheckInToCalendar')}
              style={{ accentColor: 'var(--ys-accent)' }}
            />
            <span className="nm-sync-label">📆 Sync to Calendar</span>
          </label>
        </Field>
        <CheckInLog checkIns={checkIns} onLog={onLogCheckIn} onRemove={onRemoveCheckIn} />
      </Section>

      <Section title="Prayer requests">
        <textarea
          className="ys-inp ys-textarea"
          rows={2}
          placeholder="What to pray for — recovery, adjustment, sleep, marriage…"
          value={mom.prayerNotes || ''}
          onChange={set('prayerNotes')}
        />
        <button type="button" className="nm-open-woman nm-accent-text" onClick={onOpenPrayer}>
          Start a prayer request in Prayers →
        </button>
      </Section>

      <Section title="Notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="Coordinator notes — how she's doing, concerns, wins…"
          value={mom.notes || ''}
          onChange={set('notes')}
        />
      </Section>
    </form>
  );
}

/* ── Check-in log ───────────────────────────────────────────── */
function CheckInLog({ checkIns, onLog, onRemove }) {
  const [milestone, setMilestone] = useState('ad-hoc');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  const log = () => {
    if (!date) return;
    onLog({ milestone, date, notes });
    setDate(today());
    setNotes('');
  };

  return (
    <>
      <Row>
        <Field label="Type">
          <select className="ys-inp" value={milestone} onChange={e => setMilestone(e.target.value)}>
            {CHECKIN_MILESTONES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="ys-inp" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </Row>
      <Field label="Notes">
        <input
          type="text"
          className="ys-inp"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How she's doing, what came up…"
        />
      </Field>
      <button
        type="button"
        className="ys-add-btn"
        style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }}
        disabled={!date}
        onClick={log}
      >
        ＋ Log check-in
      </button>

      {checkIns.length === 0 ? (
        <div className="wls-empty-note">No check-ins logged yet.</div>
      ) : (
        <ul className="wa-comm-list">
          {checkIns.map(c => (
            <li key={c.id} className="wa-comm-row">
              <span className="wa-comm-icon" aria-hidden="true">🤱</span>
              <span className="wa-comm-body">
                <span className="wa-comm-date">{c.date} — {milestoneLabel(c.milestone)}</span>
                <span className="wa-comm-note">{c.notes || 'Checked in'}</span>
              </span>
              <button type="button" className="wa-comm-del" onClick={() => onRemove(c.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Name picker sourced from All Women (linked) + the shared
   mentors list (unlinked fallback), with inline "+ Add new…" ──── */
function PersonPicker({ name, women, mentors, onPick, onCreateMentor, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const womenOptions = (women || [])
    .filter(w => (w.name || '').trim())
    .map(w => ({ id: w.id, name: w.name, linked: true }));
  const womenNamesLower = new Set(womenOptions.map(o => o.name.toLowerCase()));
  const mentorOnlyOptions = (mentors || [])
    .filter(m => (m.label || '').trim() && !womenNamesLower.has(m.label.toLowerCase()))
    .map(m => ({ id: m.id, name: m.label, linked: false }));
  const options = [...womenOptions, ...mentorOnlyOptions].sort((a, b) => a.name.localeCompare(b.name));
  const isOrphan = !!name && !options.some(o => o.name.toLowerCase() === name.toLowerCase());

  const commit = () => {
    const val = draft.trim();
    if (!val) { setAdding(false); return; }
    const existing = options.find(o => o.name.toLowerCase() === val.toLowerCase());
    if (existing) {
      onPick(existing.name, existing.linked ? existing.id : null);
    } else {
      onCreateMentor(val);
      onPick(val, null);
    }
    setAdding(false);
    setDraft('');
  };

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          className="ys-inp"
          autoFocus
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setAdding(false); setDraft(''); }
          }}
        />
        <button type="button" className="ys-add-btn" style={{ padding: '7px 10px', fontSize: 12 }} onClick={commit}>Add</button>
      </div>
    );
  }

  return (
    <select
      className="ys-inp"
      value={name || ''}
      onChange={e => {
        if (e.target.value === '__add__') { setAdding(true); return; }
        const opt = options.find(o => o.name === e.target.value);
        onPick(e.target.value, opt && opt.linked ? opt.id : null);
      }}
    >
      <option value="">—</option>
      {options.map(o => (
        <option key={`${o.linked ? 'w' : 'm'}-${o.id}`} value={o.name}>
          {o.name}{o.linked ? '' : ' (not in directory)'}
        </option>
      ))}
      {isOrphan && <option value={name}>{name} (custom)</option>}
      <option value="__add__">＋ Add new name…</option>
    </select>
  );
}

/* ── Small avatar bubble (real photo → built avatar → initials) ── */
function AvatarDot({ url, avatar, name }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className="nm-avatar-dot" />;
  }
  if (avatar) {
    return (
      <span className="nm-avatar-dot" style={{ overflow: 'hidden', display: 'inline-block' }}>
        <CustomAvatar avatar={avatar} />
      </span>
    );
  }
  return <span className="nm-avatar-dot nm-avatar-fallback" aria-hidden="true">{initials}</span>;
}

function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
