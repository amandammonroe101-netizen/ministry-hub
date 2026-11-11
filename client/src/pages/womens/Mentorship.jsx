import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMentors, makeListItem } from './womensListsConfig';
import { CustomAvatar } from '../friends/Avatar';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-card-grid/.wa-stats-bar/.wa-controls…) from AllWomen.css and the
   .ys-* form primitives from the Youth roster — same pattern Retreats
   follows, including its rose-gold "embossed" visual theme and
   card-catalog → dedicated tabbed drill-in page structure. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Mentorship.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Mentorship Pairs

   Titus 2 mentor / mentee matches. Each pair links two people —
   preferably two records from the shared 'womens:women' directory,
   so a pairing here stays in sync with each woman's own `mentor` /
   `mentee` field on All Women. A person not yet in the Women
   directory can still be typed in directly; she's added to the
   shared 'womens:mentors' name list (see womensListsConfig.js) but
   has no linked record to sync.

   Level 1: card catalog — mentor/mentee, focus area, cadence,
   status, check-in count (same rose-gold catalog pattern as
   Retreats' RetreatCard).

   Level 2: clicking a card drills into a dedicated in-page view
   (same pattern as Retreats' RetreatView) with three tabs:
     Overview   — mentor/mentee pickers (with All Women sync),
                  focus area, cadence, dates, next check-in
     Check-ins  — meeting log (date + notes)
     Notes      — coordinator notes

   Storage:
     pairs (this page):  useUserStoreKey('womens:mentorship-pairs', [])
     women (read/write):  useUserStoreKey('womens:women', [])
     mentors name list:   useMentors() — shared with All Women's
                           Mentor/Mentee picker fields.

   Meeting cadence drives a "next check-in" date, which is kept in
   sync with the shared Calendar (like All Women's communications)
   and drives the overdue badge on each pair's card.
   ───────────────────────────────────────────────────────────── */

const CADENCES = [
  { id: 'weekly',   label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly',  label: 'Monthly' },
  { id: 'custom',   label: 'Custom / as needed' },
];
const cadenceLabel = (id) => (CADENCES.find(c => c.id === id) || CADENCES[1]).label;

const STATUS_META = {
  active:    { label: 'Active',    icon: '🟢' },
  paused:    { label: 'Paused',    icon: '⏸️' },
  completed: { label: 'Completed', icon: '✅' },
};
const STATUS_ORDER = ['active', 'paused', 'completed'];
const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  ...STATUS_ORDER.map(id => ({ id, label: STATUS_META[id].label })),
  { id: 'overdue', label: '⚡ Overdue' },
];

const TABS = [
  { key: 'overview', label: 'Overview',  icon: 'ℹ️' },
  { key: 'checkins', label: 'Check-ins', icon: '🤝' },
  { key: 'notes',    label: 'Notes',     icon: '📝' },
];

const CAL_SOURCE_CHECKIN = 'women-mentorship-checkin';
const CAL_COLOR_CHECKIN  = '#a78bfa'; // purple — matches Discipleship group accent

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

/* Push a YYYY-MM-DD date forward by cadence. 'custom' cadence is
   left untouched — the coordinator sets the next date by hand. */
function advanceByCadence(iso, cadenceId) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (cadenceId === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (cadenceId === 'biweekly') dt.setDate(dt.getDate() + 14);
  else if (cadenceId === 'monthly') dt.setMonth(dt.getMonth() + 1);
  else return iso;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const DEFAULT_PAIR = () => ({
  id:               makeId('mp'),
  mentorName:       '',
  mentorWomanId:    null,
  menteeName:       '',
  menteeWomanId:    null,
  focusArea:        '',
  cadence:          'biweekly',
  status:           'active',
  startDate:        today(),
  endDate:          '',
  nextCheckIn:      '',
  syncCheckInToCalendar: true,
  meetings:         [],   // [{ id, date, notes, createdAt }]
  notes:            '',
  createdAt:        Date.now(),
});

export default function Mentorship() {
  const [pairs, setPairs, { loading }] = useUserStoreKey('womens:mentorship-pairs', []);
  const [women, setWomen] = useUserStoreKey('womens:women', []);
  const [mentors, setMentors] = useMentors();
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(pairs) ? pairs : [];
  const womenList = Array.isArray(women) ? women : [];
  const mentorsList = Array.isArray(mentors) ? mentors : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const findWoman = (id) => womenList.find(w => w.id === id) || null;

  /* ── Calendar sync for a pair's next check-in ──────────────── */
  const syncCheckInCalendarFor = (pair) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const others = evList.filter(e => !(e.source === CAL_SOURCE_CHECKIN && e.source_id === pair.id));
      if (!pair.syncCheckInToCalendar || pair.status !== 'active' || !pair.nextCheckIn) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_mp_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       `🤝 Check-in: ${pair.mentorName || 'Mentor'} & ${pair.menteeName || 'Mentee'}`,
        description: pair.focusArea ? `Focus: ${pair.focusArea}` : '',
        event_date:  pair.nextCheckIn,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_CHECKIN,
        category:    'womens',
        source:      CAL_SOURCE_CHECKIN,
        source_id:   pair.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeCheckInCalendarFor = (pairId) => {
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE_CHECKIN && e.source_id === pairId)));
  };

  /* Keeps each linked woman's `mentor`/`mentee` field pointed at
     her current partner in this pair, and clears the OLD partner's
     field when a person is swapped out — so All Women never shows
     a stale pairing. */
  const applyPersonLinks = (merged, previous) => {
    setWomen(prev => {
      let l = Array.isArray(prev) ? [...prev] : [];
      if (previous) {
        if (previous.mentorWomanId && previous.mentorWomanId !== merged.mentorWomanId) {
          l = l.map(w => (w.id === previous.mentorWomanId && w.mentee === previous.menteeName) ? { ...w, mentee: '' } : w);
        }
        if (previous.menteeWomanId && previous.menteeWomanId !== merged.menteeWomanId) {
          l = l.map(w => (w.id === previous.menteeWomanId && w.mentor === previous.mentorName) ? { ...w, mentor: '' } : w);
        }
      }
      if (merged.mentorWomanId) {
        l = l.map(w => w.id === merged.mentorWomanId ? { ...w, mentee: merged.menteeName || '' } : w);
      }
      if (merged.menteeWomanId) {
        l = l.map(w => w.id === merged.menteeWomanId ? { ...w, mentor: merged.mentorName || '' } : w);
      }
      return l;
    });
  };

  /* ── Actions ────────────────────────────────────────────────── */
  const addPair = () => {
    const p = DEFAULT_PAIR();
    setPairs(prev => [...(prev || []), p]);
    setOpenId(p.id);
  };

  /* Used by the "Needs a match" waiting-list chips to start a new
     pair with one side already filled in. */
  const startPairFor = (role, name, womanId) => {
    const p = DEFAULT_PAIR();
    if (role === 'mentor') { p.mentorName = name; p.mentorWomanId = womanId || null; }
    else { p.menteeName = name; p.menteeWomanId = womanId || null; }
    setPairs(prev => [...(prev || []), p]);
    setOpenId(p.id);
  };

  const updatePair = (id, patch) => {
    const current = list.find(p => p.id === id);
    setPairs(prev => (prev || []).map(p => p.id === id ? { ...p, ...patch } : p));
    if (current) {
      const merged = { ...current, ...patch };
      applyPersonLinks(merged, current);
      syncCheckInCalendarFor(merged);
    }
  };

  const logMeeting = (id, { date, notes }) => {
    if (!date) return;
    const current = list.find(p => p.id === id);
    if (!current) return;
    const entry = { id: makeId('mm'), date, notes: (notes || '').trim(), createdAt: new Date().toISOString() };
    const meetings = [entry, ...(Array.isArray(current.meetings) ? current.meetings : [])];
    const nextCheckIn = current.cadence === 'custom' ? current.nextCheckIn : advanceByCadence(date, current.cadence);
    updatePair(id, { meetings, nextCheckIn });
  };

  const removeMeeting = (id, meetingId) => {
    const current = list.find(p => p.id === id);
    if (!current) return;
    updatePair(id, { meetings: (current.meetings || []).filter(m => m.id !== meetingId) });
  };

  const removePair = (id) => {
    const current = list.find(p => p.id === id);
    setPairs(prev => (prev || []).filter(p => p.id !== id));
    if (current) {
      applyPersonLinks({ mentorWomanId: null, menteeWomanId: null, mentorName: '', menteeName: '' }, current);
      removeCheckInCalendarFor(id);
    }
    if (openId === id) setOpenId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  const openPair = useMemo(() => list.find(p => p.id === openId) || null, [list, openId]);

  const isOverdue = (p) => p.status === 'active' && !!p.nextCheckIn && p.nextCheckIn < today();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(p =>
          (p.mentorName || '').toLowerCase().includes(q) ||
          (p.menteeName || '').toLowerCase().includes(q) ||
          (p.focusArea || '').toLowerCase().includes(q))
      : list;
    if (filter === 'overdue') out = out.filter(isOverdue);
    else if (filter !== 'all') out = out.filter(p => (p.status || 'active') === filter);
    return [...out].sort((a, b) => (a.mentorName || '').localeCompare(b.mentorName || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query, filter]);

  const stats = useMemo(() => ({
    total:   list.length,
    active:  list.filter(p => (p.status || 'active') === 'active').length,
    overdue: list.filter(isOverdue).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list]);

  /* ── "Needs a match" waiting list ──────────────────────────── */
  const activeMentorNames = useMemo(
    () => new Set(list.filter(p => p.status === 'active').map(p => (p.mentorName || '').toLowerCase()).filter(Boolean)),
    [list]
  );
  const menteesWaiting = useMemo(
    () => womenList.filter(w => w.active !== false && !(w.mentor || '').trim()),
    [womenList]
  );
  const mentorsAvailable = useMemo(
    () => mentorsList.filter(m => (m.label || '').trim() && !activeMentorNames.has(m.label.toLowerCase())),
    [mentorsList, activeMentorNames]
  );

  return (
    <WomensShell
      title="Mentorship Pairs"
      icon="🤝"
      subtitle="Titus 2 mentor / mentee matches — pairings, meeting cadence, focus area, and check-in notes from the coordinator."
      actions={
        !loading && (
          <button type="button" className="wms-btn primary" onClick={addPair}>
            ✦ New pair
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="mp-root">
      {loading && list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🤝</div>
              <div className="app-empty-title">Loading pairs…</div>
            </div>
          ) : list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🤝</div>
              <div className="app-empty-title">No mentorship pairs yet</div>
              <div className="app-empty-sub">
                Match a mentor with a mentee — meeting cadence, focus area, and
                check-in notes all live on the pair, and stay in sync with each
                woman's own record on All Women.
              </div>
              <button type="button" className="app-btn primary" onClick={addPair}>
                ✦ Create your first pair
              </button>
            </div>
          ) : (
            <div className="wa-directory">
              <section className="mp-panel">
                <h3 className="mp-panel-subtitle">At a glance</h3>
                <div className="wa-stats-bar">
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.total}</span>
                    <span className="wa-stat-lbl">Pairs</span>
                  </div>
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.active}</span>
                    <span className="wa-stat-lbl">Active</span>
                  </div>
                  <div className={stats.overdue > 0 ? 'wa-stat is-warn' : 'wa-stat'}>
                    <span className="wa-stat-n">{stats.overdue}</span>
                    <span className="wa-stat-lbl">Check-ins overdue</span>
                  </div>
                </div>
              </section>

              {(menteesWaiting.length > 0 || mentorsAvailable.length > 0) && (
                <section className="mp-panel">
                  <h3 className="mp-panel-subtitle">🧭 Needs a match</h3>
                  {menteesWaiting.length > 0 && (
                    <div className="mp-waiting-group">
                      <div className="mp-waiting-lbl">{menteesWaiting.length} waiting for a mentor</div>
                      <div className="mp-waiting-chips">
                        {menteesWaiting.map(w => (
                          <button
                            key={w.id}
                            type="button"
                            className="mp-waiting-chip"
                            title="Start a pair with her as the mentee"
                            onClick={() => startPairFor('mentee', w.name, w.id)}
                          >{w.name || '(no name)'}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {mentorsAvailable.length > 0 && (
                    <div className="mp-waiting-group">
                      <div className="mp-waiting-lbl">{mentorsAvailable.length} mentor{mentorsAvailable.length === 1 ? '' : 's'} not currently paired</div>
                      <div className="mp-waiting-chips">
                        {mentorsAvailable.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            className="mp-waiting-chip mentor"
                            title="Start a pair with her as the mentor"
                            onClick={() => startPairFor('mentor', m.label)}
                          >{m.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="mp-panel">
                <div className="mp-panel-row">
                  <h3 className="mp-panel-subtitle">All pairs ({visible.length}{visible.length !== list.length ? ` of ${list.length}` : ''})</h3>
                </div>

                <div className="wa-controls">
                  <div className="wa-search-wrap">
                    <span>🔍</span>
                    <input
                      type="text"
                      placeholder="Search by mentor, mentee, focus area…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />
                    {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
                  </div>
                </div>

                <div className="wa-filter-row">
                  {STATUS_FILTERS.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`wa-filter-chip ${filter === f.id ? 'on' : ''}`}
                      onClick={() => setFilter(f.id)}
                    >{f.label}</button>
                  ))}
                </div>

                {visible.length === 0 ? (
                  <div className="wa-directory-empty">
                    {query ? `No pairs match "${query}".` : 'No pairs match this filter.'}
                  </div>
                ) : (
                  <div className="wa-card-grid mp-card-grid">
                    {visible.map(p => (
                      <PairCard
                        key={p.id}
                        pair={p}
                        mentorWoman={findWoman(p.mentorWomanId)}
                        menteeWoman={findWoman(p.menteeWomanId)}
                        overdue={isOverdue(p)}
                        selected={selectedId === p.id}
                        onClick={() => setSelectedId(prev => prev === p.id ? null : p.id)}
                        onDoubleClick={() => setOpenId(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

      {openPair && (
        <PairModal
          pair={openPair}
          women={womenList}
          mentors={mentorsList}
          onCreateMentor={(label) => setMentors(prev => [...(prev || []), makeListItem(label)])}
          onChange={(patch) => updatePair(openPair.id, patch)}
          onLogMeeting={(entry) => logMeeting(openPair.id, entry)}
          onRemoveMeeting={(meetingId) => removeMeeting(openPair.id, meetingId)}
          onDelete={() => removePair(openPair.id)}
          onOpenWoman={openWoman}
          onClose={() => setOpenId(null)}
        />
      )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}

/* ── Directory card. Single click just selects/highlights the
   card; double click opens the pair in the read-only view modal
   (with an Edit toggle) — see PairModal below. ────────────────── */
function PairCard({ pair, mentorWoman, menteeWoman, overdue, selected, onClick, onDoubleClick }) {
  const status = pair.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const meetingCount = Array.isArray(pair.meetings) ? pair.meetings.length : 0;

  return (
    <button
      type="button"
      className={`mp-card${selected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Double-click to view"
    >
      <span className={`mp-card-stripe ${overdue ? 'tone-overdue' : `tone-${status}`}`} />
      {overdue && <span className="mp-card-badge tone-overdue">⚡ Overdue</span>}

      <div className="mp-card-people">
        <PersonMini name={pair.mentorName} woman={mentorWoman} role="Mentor" />
        <span className="mp-card-link" aria-hidden="true">↔</span>
        <PersonMini name={pair.menteeName} woman={menteeWoman} role="Mentee" />
      </div>

      {pair.focusArea && <div className="mp-card-focus">🎯 {pair.focusArea}</div>}

      <div className="mp-card-pills">
        <span className="mp-pill">{cadenceLabel(pair.cadence)}</span>
        <span className={`mp-pill status-${status}`}>{meta.icon} {meta.label}</span>
      </div>

      <div className="mp-card-foot">
        <span>{meetingCount} check-in{meetingCount === 1 ? '' : 's'} logged</span>
        <span>{pair.nextCheckIn ? `Next: ${pair.nextCheckIn}` : 'No check-in set'}</span>
      </div>
    </button>
  );
}

function PersonMini({ name, woman, role }) {
  return (
    <div className="mp-person">
      <AvatarDot url={woman?.photoUrl} avatar={woman?.avatar} name={name} />
      <span className="mp-person-name">{name || `No ${role.toLowerCase()} set`}</span>
    </div>
  );
}

/* ── Level 2: pair quick-view modal, opened by double-clicking a
   card. Opens in read-only "View" mode with an Edit toggle — the
   Overview tab swaps between a read-only summary and the editable
   form in place (same view/edit toggle pattern as Friends.jsx's
   slide-over); Check-ins and Notes stay interactive either way. ── */
function PairModal({ pair, women, mentors, onCreateMentor, onChange, onLogMeeting, onRemoveMeeting, onDelete, onOpenWoman, onClose }) {
  const [tab, setTab] = useState('overview');
  const [mode, setMode] = useState(() => (pair.mentorName || pair.menteeName) ? 'view' : 'edit');
  const [confirmDel, setConfirmDel] = useState(false);
  const meetings = Array.isArray(pair.meetings) ? pair.meetings : [];
  const mentorWoman = women.find(w => w.id === pair.mentorWomanId);
  const menteeWoman = women.find(w => w.id === pair.menteeWomanId);
  const status = pair.status || 'active';

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const setStatus = (e) => {
    const status = e.target.value;
    const patch = { status };
    if (status === 'completed' && !pair.endDate) patch.endDate = today();
    onChange(patch);
  };

  const overdue = status === 'active' && !!pair.nextCheckIn && pair.nextCheckIn < today();
  const daysUntil = pair.nextCheckIn
    ? Math.round((new Date(pair.nextCheckIn) - new Date(today())) / 86400000)
    : null;
  const dayTier = daysUntil == null ? 'none' : daysUntil < 0 ? 'bad' : daysUntil <= 3 ? 'warn' : 'good';
  const daysPaired = pair.startDate
    ? Math.max(0, Math.round((new Date(today()) - new Date(pair.startDate)) / 86400000))
    : null;

  return (
    <>
      <div className="mp-modal-overlay" onClick={onClose} />
      <div className="mp-modal" role="dialog" aria-label="Mentorship pair">
        <button type="button" className="mp-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="mp-view">

      <div className="mp-view-head">
        <span className="mp-view-icon">🤝</span>
        <span className="mp-view-title">{pair.mentorName || 'Mentor'} &amp; {pair.menteeName || 'Mentee'}</span>
        <select className="ys-inp mp-view-status-sel" value={status} onChange={setStatus}>
          {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
        </select>
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

      <div className="mp-view-meta">
        {pair.focusArea && <span className="mp-chip">🎯 {pair.focusArea}</span>}
        <span className="mp-chip">🔁 {cadenceLabel(pair.cadence)}</span>
        {pair.nextCheckIn && <span className={overdue ? 'mp-chip is-over' : 'mp-chip'}>📆 Next: {pair.nextCheckIn}</span>}
      </div>

      <div className="mp-dash-row">
        <div className="mp-dash-stat">
          <span className="mp-dash-n">{meetings.length}</span>
          <span className="mp-dash-lbl">Check-ins logged</span>
        </div>
        <div className="mp-dash-stat">
          <span className="mp-dash-n">{daysPaired == null ? '—' : daysPaired}</span>
          <span className="mp-dash-lbl">Days paired</span>
        </div>
        <div className={`mp-dash-stat is-days tier-${dayTier}`}>
          <span className="mp-dash-n">{daysUntil == null ? '—' : Math.abs(daysUntil)}</span>
          <span className="mp-dash-lbl">{daysUntil == null ? 'No check-in set' : daysUntil < 0 ? 'Days overdue' : 'Days until check-in'}</span>
        </div>
      </div>

      <nav className="mp-tabs" role="tablist" aria-label="Mentorship pair views">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`mp-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'checkins' && meetings.length > 0 && <span className="mp-tab-badge">{meetings.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="mp-mode-row">
          <div className="mp-mode-toggle">
            <button
              type="button"
              className={`mp-mode-btn ${mode === 'view' ? 'on' : ''}`}
              onClick={() => setMode('view')}
            >👁 View</button>
            <button
              type="button"
              className={`mp-mode-btn ${mode === 'edit' ? 'on' : ''}`}
              onClick={() => setMode('edit')}
            >✎ Edit</button>
          </div>
        </div>
      )}

      <div className="mp-view-body">
        {tab === 'overview' && (
          mode === 'edit' ? (
            <OverviewTab
              pair={pair}
              women={women}
              mentors={mentors}
              mentorWoman={mentorWoman}
              menteeWoman={menteeWoman}
              onCreateMentor={onCreateMentor}
              onChange={onChange}
              onOpenWoman={onOpenWoman}
              set={set}
            />
          ) : (
            <OverviewReadOnly
              pair={pair}
              mentorWoman={mentorWoman}
              menteeWoman={menteeWoman}
              onOpenWoman={onOpenWoman}
            />
          )
        )}
        {tab === 'checkins' && (
          <CheckInSection meetings={meetings} onLog={onLogMeeting} onRemove={onRemoveMeeting} />
        )}
        {tab === 'notes' && (
          <Section title="Notes">
            <textarea
              className="ys-inp ys-textarea"
              rows={6}
              placeholder="Coordinator notes — how the pairing is going, prayer requests, concerns…"
              value={pair.notes || ''}
              onChange={set('notes')}
            />
          </Section>
        )}
      </div>
        </div>
      </div>
    </>
  );
}

/* ── Overview: read-only summary (default "View" mode) ─────────── */
function OverviewReadOnly({ pair, mentorWoman, menteeWoman, onOpenWoman }) {
  return (
    <>
      <Section title="People">
        <div className="mp-ro-grid">
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Mentor</span>
            <span className="mp-ro-val">{pair.mentorName || 'No mentor set'}</span>
            {mentorWoman && (
              <button type="button" className="mp-open-woman" onClick={() => onOpenWoman(mentorWoman.id)}>
                Open her profile →
              </button>
            )}
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Mentee</span>
            <span className="mp-ro-val">{pair.menteeName || 'No mentee set'}</span>
            {menteeWoman && (
              <button type="button" className="mp-open-woman" onClick={() => onOpenWoman(menteeWoman.id)}>
                Open her profile →
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Plan">
        <div className="mp-ro-grid">
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Focus area</span>
            <span className="mp-ro-val">{pair.focusArea || '—'}</span>
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Meeting cadence</span>
            <span className="mp-ro-val">{cadenceLabel(pair.cadence)}</span>
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Start date</span>
            <span className="mp-ro-val">{pair.startDate || '—'}</span>
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">End date</span>
            <span className="mp-ro-val">{pair.endDate || '—'}</span>
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Next check-in</span>
            <span className="mp-ro-val">{pair.nextCheckIn || '—'}</span>
          </div>
          <div className="mp-ro-row">
            <span className="mp-ro-lbl">Synced to Calendar</span>
            <span className="mp-ro-val">{pair.syncCheckInToCalendar ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ── Overview: editable form ("Edit" mode) ──────────────────────── */
function OverviewTab({ pair, women, mentors, mentorWoman, menteeWoman, onCreateMentor, onChange, onOpenWoman, set }) {
  return (
    <>
      <Section title="People">
        <Field label="Mentor">
          <PersonPicker
            name={pair.mentorName}
            women={women}
            mentors={mentors}
            onCreateMentor={onCreateMentor}
            placeholder="Mentor's name"
            onPick={(name, womanId) => onChange({ mentorName: name, mentorWomanId: womanId })}
          />
          {mentorWoman && (
            <button type="button" className="mp-open-woman" onClick={() => onOpenWoman(mentorWoman.id)}>
              Open her profile →
            </button>
          )}
        </Field>
        <Field label="Mentee">
          <PersonPicker
            name={pair.menteeName}
            women={women}
            mentors={mentors}
            onCreateMentor={onCreateMentor}
            placeholder="Mentee's name"
            onPick={(name, womanId) => onChange({ menteeName: name, menteeWomanId: womanId })}
          />
          {menteeWoman && (
            <button type="button" className="mp-open-woman" onClick={() => onOpenWoman(menteeWoman.id)}>
              Open her profile →
            </button>
          )}
        </Field>
        <div className="mp-hint">
          Picking someone from the Women directory keeps her `mentor`/`mentee`
          field on All Women in sync with this pair automatically.
        </div>
      </Section>

      <Section title="Plan">
        <Field label="Focus area">
          <input
            type="text"
            className="ys-inp"
            value={pair.focusArea || ''}
            onChange={set('focusArea')}
            placeholder="e.g. New believer discipleship, marriage, motherhood…"
          />
        </Field>
        <Row>
          <Field label="Meeting cadence">
            <select className="ys-inp" value={pair.cadence || 'biweekly'} onChange={set('cadence')}>
              {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={pair.startDate || ''} onChange={set('startDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="End date">
            <input type="date" className="ys-inp" value={pair.endDate || ''} onChange={set('endDate')} />
          </Field>
          <Field label="Next check-in">
            <input type="date" className="ys-inp" value={pair.nextCheckIn || ''} onChange={set('nextCheckIn')} />
          </Field>
        </Row>
        <label className={`mp-sync-row${!pair.nextCheckIn ? ' is-disabled' : ''}`} title={pair.nextCheckIn ? 'Add this check-in as a Calendar reminder' : 'Pick a date first'}>
          <input
            type="checkbox"
            checked={!!pair.syncCheckInToCalendar}
            disabled={!pair.nextCheckIn}
            onChange={set('syncCheckInToCalendar')}
          />
          <span>📆 Sync next check-in to Calendar</span>
        </label>
      </Section>
    </>
  );
}

/* ── Check-in / meeting log ─────────────────────────────────── */
function CheckInSection({ meetings, onLog, onRemove }) {
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  const log = () => {
    if (!date) return;
    onLog({ date, notes });
    setDate(today());
    setNotes('');
  };

  return (
    <Section title={`Check-in log (${meetings.length})`}>
      <Row>
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
          placeholder="What did you talk about, pray for, work on…"
        />
      </Field>
      <button
        type="button"
        className="app-btn ghost mp-add-btn"
        disabled={!date}
        onClick={log}
      >
        ＋ Log check-in
      </button>

      {meetings.length === 0 ? (
        <div className="mp-empty-hint">No check-ins logged yet.</div>
      ) : (
        <ul className="wa-comm-list">
          {meetings.map(m => (
            <li key={m.id} className="wa-comm-row">
              <span className="wa-comm-icon" aria-hidden="true">🤝</span>
              <span className="wa-comm-body">
                <span className="wa-comm-date">{m.date}</span>
                <span className="wa-comm-note">{m.notes || 'Met'}</span>
              </span>
              <button type="button" className="wa-comm-del" onClick={() => onRemove(m.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
        <button type="button" className="app-btn ghost mp-add-btn" onClick={commit}>Add</button>
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
    return <img src={url} alt="" onError={() => setBroken(true)} className="mp-avatar-dot" />;
  }
  if (avatar) {
    return (
      <span className="mp-avatar-dot" style={{ overflow: 'hidden', display: 'inline-block' }}>
        <CustomAvatar avatar={avatar} />
      </span>
    );
  }
  return <span className="mp-avatar-dot mp-avatar-fallback" aria-hidden="true">{initials}</span>;
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
