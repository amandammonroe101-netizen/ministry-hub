import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MensShell from './MensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import MensMenuSettings from './MensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useBibleStudies, useMentors, useAccountabilityGroups, makeListItem, useLifeStages, useLifeStageInfo, useFaithJourney, lifeStagePatchFor } from './mensListsConfig';
import MensLifeStagesPageSettings from './MensLifeStagesPageSettings';
import usePulseOnChange from '../womens/usePulseOnChange';
import { useMyConnections } from '../../lib/contactRequests';
import { getProfileByUid } from '../../lib/userProfile';
import { CustomAvatar } from '../friends/Avatar';
import { fileToResizedDataUrl } from '../../lib/imageResize';
/* Reuse the form primitives (.ys-section / .ys-field / .ys-inp / …)
   from the Youth roster, but the page shell + directory + detail
   panel are styled to match Friends' photo-card directory + bespoke
   topbar + slide-over pattern (.am-* classes, see AllMen.css). */
import '../youth/AllStudents.css';
import './AllMen.css';

/* ─────────────────────────────────────────────────────────────
   Men's → All Men

   Directory of every man in the ministry, styled like the
   Friends page: bespoke topbar with a profile avatar, a photo-card
   grid with search/sort/filter chips, and a right-side slide-over
   for viewing + editing one man's full record.

   Storage: useUserStoreKey('mens:men', []) → Firestore.
   ───────────────────────────────────────────────────────────── */

const COMM_TYPES = [
  { id: 'call',  label: 'Phone call',      icon: '📞' },
  { id: 'text',  label: 'Text / SMS',      icon: '💬' },
  { id: 'email', label: 'Email',           icon: '📧' },
  { id: 'visit', label: 'In-person visit', icon: '🏠' },
  { id: 'card',  label: 'Card / letter',   icon: '💌' },
  { id: 'other', label: 'Other',           icon: '📌' },
];
const commType  = (id) => COMM_TYPES.find(t => t.id === id) || COMM_TYPES[COMM_TYPES.length - 1];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* Birthday + scheduled-communication → Calendar sync. Two distinct
   sources/colors so the two kinds of reminder read differently on
   the shared Calendar. */
const CAL_SOURCE_BDAY = 'men-birthday';
const CAL_COLOR_BDAY  = '#fb7185'; // rose — the same universal "birthday" color Friends/AllWomen use
const CAL_SOURCE_COMM = 'men-communication';
const CAL_COLOR_COMM  = '#fbbf24'; // amber — reads as an action item, not a celebration

function nextAnniversaryISO(iso) {
  if (!iso) return '';
  /* Parse YYYY-MM-DD as LOCAL midnight, not UTC — avoids the
     off-by-one-day bug in negative-UTC timezones. */
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const month = Number(m[2]) - 1;
  const day   = Number(m[3]);
  const now = new Date();
  const t0  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next  = new Date(now.getFullYear(), month, day);
  if (next.getTime() < t0.getTime()) {
    next = new Date(now.getFullYear() + 1, month, day);
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

/* Days until the next birthday (0 = today), or null if unset. */
function daysToBirthday(iso) {
  const next = nextAnniversaryISO(iso);
  if (!next) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = next.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target - t0) / 86400000);
}

/* Earliest not-yet-done scheduled communication, or null. */
function nextPendingComm(man) {
  const pending = (man.communications || []).filter(c => c.scheduledDate && !c.done);
  if (!pending.length) return null;
  return [...pending].sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''))[0];
}

/* Card badge tone for an overdue / due-today follow-up. */
function commUrgency(man) {
  const c = nextPendingComm(man);
  if (!c) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (c.scheduledDate < today) return { tone: 'overdue', text: 'Follow-up late',  emoji: '⚡' };
  if (c.scheduledDate === today) return { tone: 'today',  text: 'Follow-up today', emoji: '⚡' };
  return null;
}

const DEFAULT_MAN = () => ({
  id:                     makeId('m'),
  name:                   '',
  photoUrl:               '',
  avatar:                 null,  // built avatar config (from a linked Contact), CustomAvatar-compatible
  lifeStage:              '',
  single:                 false,  // independent of lifeStage — checked men show on Life Stages' "Single" tab
  lifeStageGroup:         '',   // which of his stage's meeting groups he's in — label, set from Life Stages
  suggestedNextStage:     '',   // coordinator's hint that he may be transitioning stages — set from Life Stages
  faithJourney:           '',   // where he is in his walk with Christ — see useFaithJourney(); also settable from Life Stages roster
  prayerRequests:         [],   // [{ id, text, createdAt }] — bulleted, editable from here or the Life Stages roster
  age:                    '',
  birthday:               '',
  syncBirthdayToCalendar: false,
  phone:                  '',
  email:                  '',
  address:                '',
  bibleStudy:             '',
  mentor:                 '',
  mentee:                 '',
  accountabilityGroup:    '',
  active:                 true,
  joinedDate:             new Date().toISOString().slice(0, 10),
  lastContacted:          '',
  engagementTimeline:     [],   // [{ id, content, created_at }]
  careStatus:             '',   // '' | 'flagged'
  careNote:               '',
  communications:         [],   // [{ id, type, scheduledDate, note, done, createdAt, completedAt }]
  notes:                  '',
  createdAt:              Date.now(),
  /* Welcome-pipeline fields — set by the "New to Ministry" page.
     '' means he's not (or no longer) in that pipeline. */
  newStatus:          '',   // '' | 'first-contact' | 'connect-coffee' | 'next-step'
  newStageEnteredAt:  null,
  newChecklist:       {},   // { [stageId]: [{ id, label, done }] } — user-editable per stage
  nextStepSuggested:  '',   // '' | 'study' | 'mentor' | 'event'
  newAssignedTo:      '',
  newNotes:           '',
});

/* Single-select directory filter chips. */
const BASE_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'no-mentor', label: '🧭 No mentor' },
  { id: 'in-study',  label: '📖 In a study' },
  { id: 'no-study',  label: '📭 No study' },
  { id: 'inactive',  label: '💤 Inactive' },
];
export default function AllMen() {
  const [men, setMen, { loading }] = useUserStoreKey('mens:men', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [studies, setStudies] = useBibleStudies();
  const [mentors, setMentors] = useMentors();
  const [accountabilityGroups, setAccountabilityGroups] = useAccountabilityGroups();
  const lifeStages = useLifeStages();
  const faithJourney = useFaithJourney();
  const [stageInfo] = useLifeStageInfo();
  const list = Array.isArray(men) ? men : [];
  const [searchParams, setSearchParams] = useSearchParams();

  /* Flattens Life Stages' per-stage "Meeting groups" (see LifeStages.jsx
     — stored per stage name under useLifeStageInfo()) into one list, each
     tagged with the stage it belongs to. Lets the "Groups" section below
     resolve a man's `lifeStageGroup` label into full group details
     (stage, day, time, location) without re-deriving that storage shape
     here — this is a read-only mirror, all editing still happens on the
     Life Stages page. */
  const allStageGroups = useMemo(() => {
    const info = stageInfo && typeof stageInfo === 'object' ? stageInfo : {};
    const out = [];
    for (const stage of Object.keys(info)) {
      const groups = Array.isArray(info[stage]?.groups) ? info[stage].groups : [];
      for (const g of groups) out.push({ ...g, stage });
    }
    return out;
  }, [stageInfo]);

  const FILTERS = useMemo(
    () => [...BASE_FILTERS, ...lifeStages.stages.map(s => ({ id: `stage:${s}`, label: s }))],
    [lifeStages.stages]
  );

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* ── Calendar sync helpers ──────────────────────────────── */
  const syncBirthdayCalendarFor = (man) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const sourceId = `${man.id}__bday`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE_BDAY && e.source_id === sourceId));
      if (!man.syncBirthdayToCalendar || !man.birthday) return others;
      const date = nextAnniversaryISO(man.birthday);
      if (!date) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_bday_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       `🎂 ${man.name || 'Man'}'s birthday`,
        description: man.birthday ? `Born ${man.birthday}.` : '',
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_BDAY,
        category:    'mens',
        source:      CAL_SOURCE_BDAY,
        source_id:   sourceId,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeBirthdayCalendarFor = (manId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_BDAY && (e.source_id || '').startsWith(`${manId}__`))
    ));
  };

  /* Rebuilds every PENDING (not-done) scheduled communication as a
     Calendar reminder. Idempotent — safe to call on every update. */
  const syncCommunicationsCalendarFor = (man) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const others = evList.filter(e => !(e.source === CAL_SOURCE_COMM && (e.source_id || '').startsWith(`${man.id}__comm__`)));
      const pending = (man.communications || []).filter(c => c.scheduledDate && !c.done);
      const fresh = pending.map(c => {
        const t = commType(c.type);
        return {
          id: 'ce_' + Date.now().toString(36) + '_comm_' + Math.random().toString(36).slice(2, 6),
          created_at:  new Date().toISOString(),
          title:       `${t.icon} ${t.label} — ${man.name || 'Follow up'}`,
          description: c.note || '',
          event_date:  c.scheduledDate,
          end_date:    '',
          event_time:  '',
          color:       CAL_COLOR_COMM,
          category:    'mens',
          source:      CAL_SOURCE_COMM,
          source_id:   `${man.id}__comm__${c.id}`,
          reminder_offset: 'none',
          reminder_time:   '',
          reminder_note:   '',
        };
      });
      return [...fresh, ...others];
    });
  };
  const removeCommunicationsCalendarFor = (manId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_COMM && (e.source_id || '').startsWith(`${manId}__comm__`))
    ));
  };

  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' — for the slide-over
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'stage' | 'joined'
  const [filter, setFilter] = useState('all');

  /* Cross-page deep link: ?man=ID auto-selects that man
     (e.g. from the Life Stages page). ?edit=1 opens him straight
     into the edit form instead of the view panel — used by New to
     Ministry when a freshly-added man doesn't match anyone in
     All Men or Contacts, so the rest of his profile can be
     filled in here right away. */
  useEffect(() => {
    if (list.length === 0) return;
    const manId = searchParams.get('man');
    if (!manId) return;
    const m = list.find(x => x.id === manId);
    if (m) { setSelectedId(m.id); setMode(searchParams.get('edit') === '1' ? 'edit' : 'view'); }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  /* Cross-page deep link: ?q=TEXT preloads the search box — used by
     Bible Studies' "Manage roster in All Men" link so it lands
     pre-filtered to that study's name. */
  useEffect(() => {
    const q = searchParams.get('q');
    if (!q) return;
    setQuery(q);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Derived: filtered + sorted list shown in the card grid. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(m =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.bibleStudy || '').toLowerCase().includes(q) ||
          (m.mentor || '').toLowerCase().includes(q) ||
          (m.accountabilityGroup || '').toLowerCase().includes(q) ||
          (m.lifeStage || '').toLowerCase().includes(q))
      : list;
    /* Unchecking "Currently in the ministry" archives him — he drops out
       of the directory everywhere except the explicit "Inactive" chip,
       which is also how he gets found again to re-activate him. */
    if (filter !== 'inactive') out = out.filter(m => m.active !== false);
    if (filter === 'no-mentor')      out = out.filter(m => !(m.mentor || '').trim());
    else if (filter === 'in-study')  out = out.filter(m => (m.bibleStudy || '').trim());
    else if (filter === 'no-study')  out = out.filter(m => !(m.bibleStudy || '').trim());
    else if (filter === 'inactive')  out = out.filter(m => m.active === false);
    else if (filter.startsWith('stage:')) out = out.filter(m => m.lifeStage === filter.slice(6));
    out = [...out];
    if (sortBy === 'name')   out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'stage')  out.sort((a, b) => lifeStages.stages.indexOf(a.lifeStage || '') - lifeStages.stages.indexOf(b.lifeStage || ''));
    if (sortBy === 'joined') out.sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    return out;
  }, [list, query, sortBy, filter, lifeStages.stages]);

  const selected = useMemo(
    () => list.find(m => m.id === selectedId) || null,
    [list, selectedId]
  );

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

  /* ── Actions ────────────────────────────────────────────── */
  const addMan = () => {
    const m = DEFAULT_MAN();
    setMen(prev => [...(prev || []), m]);
    setSelectedId(m.id);
    setMode('edit');
  };

  const updateMan = (id, patch) => {
    /* Pure setter — no side effects in the updater itself (StrictMode
       runs updaters twice in dev). The calendar syncs run AFTER the
       setter is queued, using the current closure of `list` merged
       with the patch to compute what the record will look like. */
    setMen(prev => (prev || []).map(m => m.id === id ? { ...m, ...patch } : m));
    const current = list.find(m => m.id === id);
    if (current) {
      const merged = { ...current, ...patch };
      syncBirthdayCalendarFor(merged);
      syncCommunicationsCalendarFor(merged);
    }
  };

  const removeMan = (id) => {
    setMen(prev => (prev || []).filter(m => m.id !== id));
    removeBirthdayCalendarFor(id);
    removeCommunicationsCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  /* Quick stats for the header bar — active (non-archived) men only. */
  const stats = useMemo(() => {
    const activeList = list.filter(m => m.active !== false);
    return {
      total:      activeList.length,
      inStudy:    activeList.filter(m => (m.bibleStudy || '').trim()).length,
      unassigned: activeList.filter(m => !(m.mentor || '').trim()).length,
    };
  }, [list]);

  const totalPulse = usePulseOnChange(stats.total);
  const inStudyPulse = usePulseOnChange(stats.inStudy);
  const unassignedPulse = usePulseOnChange(stats.unassigned);

  return (
    <MensShell
      title="All Men"
      icon="🧑‍🤝‍🧑"
      subtitle="Directory of every man in the ministry — life stage, Bible study, mentor pairing, and engagement, all in one place."
      actions={
        <button type="button" className="mns-btn primary" onClick={addMan}>
          ✦ Add man
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="am-root">
      {loading && list.length === 0 ? (
        <div className="am-directory-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="am-empty app-empty">
          <div className="app-empty-icon">🧑‍🤝‍🧑</div>
          <div className="app-empty-title">Your Men's directory</div>
          <div className="app-empty-sub">
            Add the men in your ministry — track life stage, Bible study,
            mentor pairing, and engagement over time.
          </div>
          <button type="button" className="app-btn primary" onClick={addMan}>
            ✦ Add your first man
          </button>
        </div>
      ) : (
        <div className="am-directory">
          <div className="am-stats-bar">
            <div className="am-stat">
              <span className={`am-stat-n${totalPulse ? ' is-pulsing' : ''}`}>{stats.total}</span>
              <span className="am-stat-lbl">Total</span>
            </div>
            <div className="am-stat">
              <span className={`am-stat-n${inStudyPulse ? ' is-pulsing' : ''}`}>{stats.inStudy}</span>
              <span className="am-stat-lbl">In a Bible study</span>
            </div>
            <div className="am-stat is-warn">
              <span className={`am-stat-n${unassignedPulse ? ' is-pulsing' : ''}`}>{stats.unassigned}</span>
              <span className="am-stat-lbl">No mentor</span>
            </div>
          </div>

          <div className="am-controls">
            <div className="am-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by name, study, mentor, life stage…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="am-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
            <div className="am-sort-wrap">
              <label className="am-sort-lbl">Sort</label>
              <select
                className="am-sort-sel"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="name">Name (A–Z)</option>
                <option value="stage">Life stage</option>
                <option value="joined">Recently joined</option>
              </select>
            </div>
          </div>

          <div className="am-filter-row">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                className={`am-filter-chip ${filter === f.id ? 'on' : ''}`}
                onClick={() => setFilter(f.id)}
              >{f.label}</button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="am-directory-empty">
              {query ? `No one matches "${query}".` : 'No one matches this filter.'}
            </div>
          ) : (
            <div className="am-card-grid">
              {visible.map((m, i) => (
                <ManCard key={m.id} man={m} index={i} onClick={() => { setSelectedId(m.id); setMode('view'); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail slide-over (right side), matching Friends' pattern. */}
      {selected && (
        <>
          <div className="am-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="am-slide" role="dialog" aria-label={selected.name || 'Man'}>
            <button
              className="am-slide-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="am-slide-body">
              {mode === 'view' ? (
                <ManView
                  man={selected}
                  allStageGroups={allStageGroups}
                  onEdit={() => setMode('edit')}
                />
              ) : (
                <ManForm
                  key={selected.id}
                  man={selected}
                  lifeStages={lifeStages}
                  faithJourney={faithJourney}
                  allStageGroups={allStageGroups}
                  studies={Array.isArray(studies) ? studies : []}
                  onCreateStudy={(label) => setStudies(prev => [...(prev || []), makeListItem(label)])}
                  mentors={Array.isArray(mentors) ? mentors : []}
                  onCreateMentor={(label) => setMentors(prev => [...(prev || []), makeListItem(label)])}
                  accountabilityGroups={Array.isArray(accountabilityGroups) ? accountabilityGroups : []}
                  onCreateAccountabilityGroup={(label) => setAccountabilityGroups(prev => [...(prev || []), makeListItem(label)])}
                  onChange={(patch) => updateMan(selected.id, patch)}
                  onDelete={() => removeMan(selected.id)}
                  onDone={() => setMode('view')}
                />
              )}
            </div>
          </aside>
        </>
      )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🧭 Customize Menu"
        pageSettings={<MensMenuSettings />}
        guideTabLabel="📋 Page Settings"
        guide={<MensLifeStagesPageSettings lifeStages={lifeStages} />}
      />
    </MensShell>
  );
}

/* ── Directory card (photo-first, matches Friends' FriendCard) ─ */
function ManCard({ man, index, onClick }) {
  const bday = daysToBirthday(man.birthday);
  const urgency = commUrgency(man);

  let badge = null;
  if (urgency) badge = urgency;
  else if (bday === 0) badge = { tone: 'bday', text: 'Birthday!', emoji: '🎂' };
  else if (bday !== null && bday <= 7) badge = { tone: 'bday', text: `🎂 ${bday}d`, emoji: '🎂' };

  const noMentor = !(man.mentor || '').trim();

  return (
    <button type="button" className="am-fc" style={{ '--i': index }} onClick={onClick}>
      <span className={`am-fc-stripe tone-${badge?.tone || 'neutral'}`} />
      {badge && (
        <span className={`am-fc-badge tone-${badge.tone}`}>{badge.emoji} {badge.text}</span>
      )}

      <AvatarThumb url={man.photoUrl} avatar={man.avatar} name={man.name} size={56} />

      <div className="am-fc-name">{man.name || '(no name)'}</div>

      <div className="am-fc-meta">
        {man.lifeStage && <span>{man.lifeStage}</span>}
        {man.lifeStage && man.bibleStudy && <span>·</span>}
        {man.bibleStudy && <span>{man.bibleStudy}</span>}
      </div>

      {!man.active && <div className="am-fc-status inactive">Inactive</div>}
      {man.active && noMentor && <div className="am-fc-status">🧭 No mentor</div>}

      <div className="am-fc-foot">
        <span className="am-fc-foot-lbl">Last contact</span>
        <span className="am-fc-foot-val">{man.lastContacted || 'Never'}</span>
      </div>
    </button>
  );
}

/* ── Read-only detail view (opened on card click) ──────────── */
export function ManView({ man, allStageGroups, onEdit }) {
  const comms = Array.isArray(man.communications) ? man.communications : [];
  const pending = [...comms].filter(c => !c.done).sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  const timeline = Array.isArray(man.engagementTimeline) ? man.engagementTimeline : [];

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarThumb url={man.photoUrl} avatar={man.avatar} name={man.name} size={44} />
          <div>
            <h2 className="ys-form-title">{man.name || '(unnamed)'}</h2>
            {(man.lifeStage || !man.active) && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>
                {man.lifeStage}
                {man.lifeStage && man.lifeStageGroup && ` (${man.lifeStageGroup})`}
                {man.lifeStage && !man.active && ' · '}
                {!man.active && 'Inactive'}
              </div>
            )}
            {man.faithJourney && (
              <div style={{ fontSize: 12, color: '#c4b5fd', marginTop: 2 }}>
                ✝️ {man.faithJourney}
              </div>
            )}
            {man.suggestedNextStage && (
              <div style={{ fontSize: 11, color: '#fdba74', marginTop: 2 }}>
                🔁 Suggested to move to {man.suggestedNextStage} — see Life Stages
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="app-btn primary"
          style={{ padding: '7px 14px', fontSize: 12 }}
          onClick={onEdit}
        >
          ✎ Edit
        </button>
      </div>

      {man.careStatus === 'flagged' && (
        <Section title="Pastoral care">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fdba74' }}>⚠️ Needs extra care</div>
          {man.careNote && <div style={{ fontSize: 13, marginTop: 4, color: 'rgba(255,255,255,.75)' }}>{man.careNote}</div>}
        </Section>
      )}

      {(man.phone || man.email || man.address) && (
        <Section title="Contact">
          <ViewRow label="Phone" value={man.phone} />
          <ViewRow label="Email" value={man.email} />
          <ViewRow label="Address" value={man.address} />
        </Section>
      )}

      <Section title="Key dates">
        <ViewRow label="Age" value={man.age} />
        <ViewRow label="Birthday" value={man.birthday} />
        <ViewRow label="Joined" value={man.joinedDate} />
        <ViewRow label="Last contacted" value={man.lastContacted || 'Never'} />
      </Section>

      {man.lifeStageGroup && (
        <Section title="Groups">
          <GroupsField man={man} allStageGroups={allStageGroups} />
        </Section>
      )}

      {(man.bibleStudy || man.mentor || man.mentee || man.accountabilityGroup) && (
        <Section title="Discipleship">
          <ViewRow label="Bible study" value={man.bibleStudy} />
          <ViewRow label="Mentor" value={man.mentor} />
          <ViewRow label="Mentee" value={man.mentee} />
          <ViewRow label="Accountability group" value={man.accountabilityGroup} />
        </Section>
      )}

      {pending.length > 0 && (
        <Section title="Upcoming follow-ups">
          <ul className="am-comm-list">
            {pending.map(c => (
              <li key={c.id} className="am-comm-row">
                <span className="am-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
                <span className="am-comm-body">
                  <span className="am-comm-date">{c.scheduledDate}</span>
                  <span className="am-comm-note">{c.note || commType(c.type).label}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title="Engagement history">
          <ul className="am-timeline">
            {timeline.map(e => (
              <li key={e.id} className="am-timeline-row">
                <span className="am-timeline-dot" aria-hidden="true" />
                <span className="am-timeline-body">
                  <span className="am-timeline-date">{new Date(e.created_at).toLocaleDateString()}</span>
                  <span className="am-timeline-content">{e.content}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {Array.isArray(man.prayerRequests) && man.prayerRequests.length > 0 && (
        <Section title="Accountability log">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {man.prayerRequests.map(p => (
              <li key={p.id} style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.5 }}>{p.text}</li>
            ))}
          </ul>
        </Section>
      )}

      {man.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {man.notes}
          </div>
        </Section>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="am-view-row">
      <span className="am-view-lbl">{label}</span>
      <span className="am-view-val">{value}</span>
    </div>
  );
}

/* ── Detail / edit form for one man ────────────────────────── */
function ManForm({ man, lifeStages, faithJourney, allStageGroups, studies, onCreateStudy, mentors, onCreateMentor, accountabilityGroups, onCreateAccountabilityGroup, onChange, onDelete, onDone }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };
  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 480, quality: 0.85 });
      onChange({ photoUrl: dataUrl });
    } catch (err) {
      setPhotoError(err?.message || 'Could not add that photo.');
    }
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarThumb url={man.photoUrl} avatar={man.avatar} name={man.name} size={44} />
          <h2 className="ys-form-title">{man.name || '(unnamed)'}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="app-btn ghost"
            style={{ padding: '7px 12px', fontSize: 12 }}
            onClick={onDone}
            title="Back to view"
          >
            ✓ Done
          </button>
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
      </div>

      <Section title="Basics">
        <Row>
          <Field label="Name">
            <NameContactField man={man} onChange={onChange} />
          </Field>
          <Field label="Age">
            <input
              type="number"
              className="ys-inp"
              min="0"
              value={man.age ?? ''}
              onChange={set('age')}
              placeholder="e.g. 34"
            />
          </Field>
        </Row>
        <Field label="Photo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label
              style={{ cursor: 'pointer', display: 'inline-flex', position: 'relative' }}
              title="Click to upload a photo — it becomes his profile picture automatically"
            >
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoChosen} />
              <AvatarThumb url={man.photoUrl} avatar={man.avatar} name={man.name} size={44} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--mns-ink-soft, rgba(255,255,255,0.6))' }}>
                Click the photo to upload one.
              </span>
              {man.photoUrl && (
                <button
                  type="button"
                  className="app-btn ghost"
                  style={{ padding: '3px 9px', fontSize: 11, alignSelf: 'flex-start' }}
                  onClick={() => onChange({ photoUrl: '' })}
                >
                  Remove photo
                </button>
              )}
              {photoError && <span style={{ fontSize: 11, color: '#dc2626' }}>{photoError}</span>}
            </div>
          </div>
        </Field>
        <Row>
          <Field label="Birthday">
            <input type="date" className="ys-inp" value={man.birthday || ''} onChange={set('birthday')} />
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 9px', marginTop: 4,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, fontSize: 12,
                cursor: man.birthday ? 'pointer' : 'not-allowed',
                opacity: man.birthday ? 1 : 0.55,
                color: man.syncBirthdayToCalendar ? 'var(--ys-accent)' : 'var(--mns-ink-soft, rgba(255,255,255,0.6))',
              }}
              title={man.birthday ? 'Add this birthday as a yearly Calendar event' : 'Pick a birthday first'}
            >
              <input
                type="checkbox"
                checked={!!man.syncBirthdayToCalendar}
                disabled={!man.birthday}
                onChange={set('syncBirthdayToCalendar')}
                style={{ accentColor: 'var(--ys-accent)' }}
              />
              <span>📆 Sync birthday to Calendar</span>
            </label>
          </Field>
          <Field label="Joined">
            <input type="date" className="ys-inp" value={man.joinedDate || ''} onChange={set('joinedDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!man.active} onChange={set('active')} />
              <span>Currently in the ministry</span>
            </label>
          </Field>
        </Row>
      </Section>

      <Section title="Life Stage">
        <Field label="Life stage">
          <select className="ys-inp" value={man.lifeStage || ''} onChange={e => onChange(lifeStagePatchFor(e.target.value))}>
            <option value="">—</option>
            {lifeStages.stages.map(s => {
              const short = lifeStages.getStageMeta(s)?.short;
              return (
                <option key={s} value={s}>
                  {s}{short ? ` (${short})` : ''}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="Single">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!man.single} onChange={set('single')} />
            <span>Single — show him on the Life Stages "Single" tab</span>
          </label>
        </Field>
      </Section>

      <Section title="Faith Journey">
        <Field label="Faith journey">
          <select className="ys-inp" value={man.faithJourney || ''} onChange={set('faithJourney')}>
            <option value="">—</option>
            {faithJourney.stages.map(s => {
              const short = faithJourney.getStageMeta(s)?.short;
              return (
                <option key={s} value={s}>
                  {s}{short ? ` (${short})` : ''}
                </option>
              );
            })}
          </select>
        </Field>
      </Section>

      <Section title="Groups">
        <GroupsField man={man} allStageGroups={allStageGroups} />
      </Section>

      <Section title="Contact">
        <Row>
          <Field label="Phone">
            <input type="tel" className="ys-inp" value={man.phone || ''} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <input type="email" className="ys-inp" value={man.email || ''} onChange={set('email')} />
          </Field>
        </Row>
        <Field label="Address">
          <input type="text" className="ys-inp" value={man.address || ''} onChange={set('address')} />
        </Field>
      </Section>

      <Section title="Discipleship">
        <Field label="Current Bible study">
          <LabelPicker
            value={man.bibleStudy}
            options={studies}
            placeholder="New study name"
            onPick={(label) => onChange({ bibleStudy: label })}
            onCreate={onCreateStudy}
          />
        </Field>
        <Row>
          <Field label="Mentor">
            <LabelPicker
              value={man.mentor}
              options={mentors}
              placeholder="Mentor's name"
              onPick={(label) => onChange({ mentor: label })}
              onCreate={onCreateMentor}
            />
          </Field>
          <Field label="Mentee">
            <LabelPicker
              value={man.mentee}
              options={mentors}
              placeholder="Mentee's name"
              onPick={(label) => onChange({ mentee: label })}
              onCreate={onCreateMentor}
            />
          </Field>
        </Row>
        <Field label="Accountability group">
          <LabelPicker
            value={man.accountabilityGroup}
            options={accountabilityGroups}
            placeholder="New group name"
            onPick={(label) => onChange({ accountabilityGroup: label })}
            onCreate={onCreateAccountabilityGroup}
          />
        </Field>
        <div style={{ fontSize: 12, color: 'var(--mns-ink-soft, rgba(255,255,255,0.6))', fontStyle: 'italic' }}>
          These lists are shared across Men's Ministry — Bible Studies and Accountability Groups read the same data these pickers write to.
        </div>
      </Section>

      <CommunicationsSection man={man} onChange={onChange} />

      <EngagementSection man={man} onChange={onChange} />

      <Section title="Pastoral care">
        <Field label="Care status">
          <select
            className="ys-inp"
            value={man.careStatus || ''}
            onChange={set('careStatus')}
            title="Flag men going through a hard season — kept private to this record"
          >
            <option value="">Normal</option>
            <option value="flagged">⚠️ Needs extra care</option>
          </select>
        </Field>
        {man.careStatus === 'flagged' && (
          <Field label="Private note (only visible here)">
            <textarea
              className="ys-inp ys-textarea"
              rows={2}
              value={man.careNote || ''}
              onChange={set('careNote')}
              placeholder="Context for follow-up — grief, illness, crisis…"
            />
          </Field>
        )}
      </Section>

      <AccountabilityLogSection man={man} onChange={onChange} />

      <Section title="Notes">
        <Field label="General notes">
          <textarea className="ys-inp ys-textarea" rows={3} value={man.notes || ''} onChange={set('notes')} />
        </Field>
      </Section>
    </form>
  );
}

/* ── Accountability log — bulleted, add/remove ─────────────── */
function AccountabilityLogSection({ man, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(man.prayerRequests) ? man.prayerRequests : [];

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange({ prayerRequests: [{ id: makeId('mp'), text, createdAt: new Date().toISOString() }, ...list] });
    setDraft('');
  };
  const remove = (id) => onChange({ prayerRequests: list.filter(p => p.id !== id) });

  return (
    <Section title="Accountability log">
      <Field label="Add an entry">
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="ys-inp"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="A struggle he's confessing, a step of growth, a prayer for strength…"
          />
          <button
            type="button"
            className="ys-add-btn"
            style={{ padding: '7px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
            disabled={!draft.trim()}
            onClick={add}
          >
            ＋ Add
          </button>
        </div>
      </Field>

      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--mns-ink-soft, rgba(255,255,255,0.6))', padding: '4px 0' }}>No entries yet.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map(p => (
            <li
              key={p.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '7px 9px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, fontSize: 13,
              }}
            >
              <span aria-hidden="true" style={{ lineHeight: '18px' }}>🛡</span>
              <span style={{ flex: 1, lineHeight: 1.5 }}>{p.text}</span>
              <button
                type="button"
                className="am-comm-del"
                onClick={() => remove(p.id)}
                title="Remove"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* Read-only — reflects whichever Life Stages "Meeting group" this
   man is currently assigned to (set from the Life Stages page, not
   here), resolved against `allStageGroups` for the group's stage/day/
   time/location. Updates automatically whenever that assignment
   changes, since it's just filtering the same `man`/stage-info data
   already synced from Firestore — nothing local to edit or save. */
function GroupsField({ man, allStageGroups }) {
  const label = (man.lifeStageGroup || '').trim();
  const groups = Array.isArray(allStageGroups) ? allStageGroups : [];
  const matches = label ? groups.filter(g => (g.label || '').trim() === label) : [];

  if (!matches.length) {
    return (
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
        Not in a Life Stages meeting group yet — assign one from the Life Stages page.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {matches.map(g => (
        <div
          key={g.id}
          style={{ padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>{g.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {g.stage}</span></div>
          {(g.day || g.time || g.location) && (
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {[g.day, g.time, g.location].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Synced automatically from Life Stages — change it there.</div>
    </div>
  );
}

/* ── Name field with "From your Contacts" typeahead ──────────
   Selecting a match autofills their avatar/photo (and email, if
   they've made it visible) from their public profile — mirrors the
   Friends page's Add Friend name suggestions. */
function NameContactField({ man, onChange }) {
  const { connections } = useMyConnections();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const nameMatches = useMemo(() => {
    const q = (man.name || '').trim().toLowerCase();
    if (!q || !connections?.length) return [];
    return connections.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [man.name, connections]);

  const pickContact = async (contact) => {
    setSuggestOpen(false);
    setFilling(true);
    try {
      const profile = await getProfileByUid(contact.uid);
      const patch = { name: profile?.displayName || contact.name || man.name };
      if (profile?.avatar) patch.avatar = profile.avatar;
      else if (profile?.logo) patch.photoUrl = profile.logo;
      if (profile?.emailVisible !== false && profile?.email) patch.email = profile.email;
      onChange(patch);
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="am-name-suggest-wrap">
      <input
        type="text"
        className="ys-inp"
        value={man.name || ''}
        onChange={e => { onChange({ name: e.target.value }); setSuggestOpen(true); }}
        onFocus={() => setSuggestOpen(true)}
        onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
        autoComplete="off"
      />
      {suggestOpen && nameMatches.length > 0 && (
        <div className="am-name-suggest">
          <div className="am-name-suggest-hd">From your Contacts</div>
          {nameMatches.map(c => (
            <button
              type="button"
              key={c.uid}
              className="am-name-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickContact(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {filling && <div className="am-name-suggest-status">Filling from contact…</div>}
    </div>
  );
}

/* ── Scheduled communication tracker ───────────────────────── */
function CommunicationsSection({ man, onChange }) {
  const [type, setType] = useState('call');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const list = Array.isArray(man.communications) ? man.communications : [];
  const pending = [...list].filter(c => !c.done).sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  const history = [...list].filter(c => c.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const schedule = () => {
    if (!date) return;
    const entry = { id: makeId('mc'), type, scheduledDate: date, note: note.trim(), done: false, createdAt: new Date().toISOString() };
    onChange({ communications: [entry, ...list] });
    setDate(''); setNote('');
  };

  const markDone = (id) => {
    const today = new Date().toISOString().slice(0, 10);
    const c = list.find(x => x.id === id);
    const next = list.map(x => x.id === id ? { ...x, done: true, completedAt: today } : x);
    const timelineEntry = c ? {
      id:         makeId('mt'),
      content:    `${commType(c.type).icon} ${commType(c.type).label}${c.note ? ': ' + c.note : ''}`,
      created_at: new Date().toISOString(),
    } : null;
    onChange({
      communications: next,
      lastContacted:  today,
      engagementTimeline: timelineEntry
        ? [timelineEntry, ...(Array.isArray(man.engagementTimeline) ? man.engagementTimeline : [])]
        : man.engagementTimeline,
    });
  };

  const removeComm = (id) => onChange({ communications: list.filter(x => x.id !== id) });

  return (
    <Section title="Communication">
      <div style={{ fontSize: 12, color: 'var(--mns-ink-soft, rgba(255,255,255,0.6))', fontStyle: 'italic', marginBottom: 2 }}>
        Scheduled follow-ups sync to the Calendar automatically. Marking one done logs it to his engagement history below and updates "last contacted."
      </div>
      <Row>
        <Field label="Type">
          <select className="ys-inp" value={type} onChange={e => setType(e.target.value)}>
            {COMM_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="ys-inp" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </Row>
      <Field label="Note">
        <input type="text" className="ys-inp" value={note} onChange={e => setNote(e.target.value)} placeholder="What to follow up about…" />
      </Field>
      <button
        type="button"
        className="ys-add-btn"
        style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }}
        disabled={!date}
        onClick={schedule}
      >
        ＋ Schedule
      </button>

      {pending.length > 0 && (
        <ul className="am-comm-list">
          {pending.map(c => (
            <li key={c.id} className="am-comm-row">
              <span className="am-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
              <span className="am-comm-body">
                <span className="am-comm-date">{c.scheduledDate}</span>
                <span className="am-comm-note">{c.note || commType(c.type).label}</span>
              </span>
              <button type="button" className="am-comm-done" onClick={() => markDone(c.id)}>✓ Done</button>
              <button type="button" className="am-comm-del" onClick={() => removeComm(c.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="am-comm-history">
          <summary>{history.length} completed</summary>
          <ul className="am-comm-list">
            {history.map(c => (
              <li key={c.id} className="am-comm-row done">
                <span className="am-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
                <span className="am-comm-body">
                  <span className="am-comm-date">{c.completedAt}</span>
                  <span className="am-comm-note">{c.note || commType(c.type).label}</span>
                </span>
                <button type="button" className="am-comm-del" onClick={() => removeComm(c.id)}>✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

/* ── Engagement history timeline ───────────────────────────── */
function EngagementSection({ man, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(man.engagementTimeline) ? man.engagementTimeline : [];

  const add = () => {
    const content = draft.trim();
    if (!content) return;
    onChange({ engagementTimeline: [{ id: makeId('mt'), content, created_at: new Date().toISOString() }, ...list] });
    setDraft('');
  };
  const remove = (id) => onChange({ engagementTimeline: list.filter(e => e.id !== id) });

  return (
    <Section title="Engagement history">
      <Field label="Last contacted">
        <input type="date" className="ys-inp" value={man.lastContacted || ''} onChange={e => onChange({ lastContacted: e.target.value })} />
      </Field>
      <Field label="Add a timeline entry">
        <textarea
          className="ys-inp ys-textarea"
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Attended the men's retreat, joined the Tuesday study…"
        />
      </Field>
      <button
        type="button"
        className="ys-add-btn"
        style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }}
        disabled={!draft.trim()}
        onClick={add}
      >
        ＋ Add entry
      </button>

      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--mns-ink-soft, rgba(255,255,255,0.6))', padding: '4px 0' }}>No entries yet.</div>
      ) : (
        <ul className="am-timeline">
          {list.map(e => (
            <li key={e.id} className="am-timeline-row">
              <span className="am-timeline-dot" aria-hidden="true" />
              <span className="am-timeline-body">
                <span className="am-timeline-date">{new Date(e.created_at).toLocaleDateString()}</span>
                <span className="am-timeline-content">{e.content}</span>
              </span>
              <button type="button" className="am-timeline-del" onClick={() => remove(e.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Shared name/label picker with inline "+ Add new…" ─────── */
function LabelPicker({ value, options, onPick, onCreate, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const known = new Set((options || []).map(o => o.label));
  const isOrphan = !!value && !known.has(value);

  const commit = () => {
    const label = draft.trim();
    if (!label) { setAdding(false); return; }
    const existing = (options || []).find(o => o.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      onPick(existing.label);
    } else {
      onCreate(label);
      onPick(label);
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
      value={value || ''}
      onChange={e => {
        if (e.target.value === '__add__') { setAdding(true); return; }
        onPick(e.target.value);
      }}
    >
      <option value="">—</option>
      {(options || []).map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
      {isOrphan && <option value={value}>{value} (removed)</option>}
      <option value="__add__">＋ Add new…</option>
    </select>
  );
}

/* ── Photo (real photo → built avatar → initials fallback) ──── */
function AvatarThumb({ url, avatar, name, size = 34 }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  if (avatar) {
    return (
      <span style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'inline-block' }}>
        <CustomAvatar avatar={avatar} />
      </span>
    );
  }
  return (
    <span
      className="ys-row-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--am-accent, #c9603f), #8a4a30)' }}
    >
      {initials}
    </span>
  );
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
