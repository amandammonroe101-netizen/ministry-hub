import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useBibleStudies, useLifeStages, useLifeStageInfo, useFaithJourney, lifeStagePatchFor } from './womensListsConfig';
import LifeStagesPageSettings from './LifeStagesPageSettings';
import usePulseOnChange from './usePulseOnChange';
import { useMyConnections } from '../../lib/contactRequests';
import { requestInfoShare, useMyInfoShareRequests } from '../../lib/infoShareRequests';
import { getProfileByUid } from '../../lib/userProfile';
import { ensureDirectChannel } from '../../lib/directChat';
import { CustomAvatar } from '../friends/Avatar';
import { fileToResizedDataUrl } from '../../lib/imageResize';
/* Reuse the form primitives (.ys-section / .ys-field / .ys-inp / …)
   from the Youth roster, but the page shell + directory + detail
   panel are styled to match Friends' photo-card directory + bespoke
   topbar + slide-over pattern (.wa-* classes, see AllWomen.css). */
import '../youth/AllStudents.css';
import './AllWomen.css';

/* ─────────────────────────────────────────────────────────────
   Women's → All Women

   Directory of every woman in the ministry, styled like the
   Friends page: bespoke topbar with a profile avatar, a photo-card
   grid with search/sort/filter chips, and a right-side slide-over
   for viewing + editing one woman's full record.

   Storage: useUserStoreKey('womens:women', []) → Firestore.
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
const CAL_SOURCE_BDAY = 'women-birthday';
const CAL_COLOR_BDAY  = '#fb7185'; // rose — matches the Women's Ministry accent
const CAL_SOURCE_COMM = 'women-communication';
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
function nextPendingComm(woman) {
  const pending = (woman.communications || []).filter(c => c.scheduledDate && !c.done);
  if (!pending.length) return null;
  return [...pending].sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''))[0];
}

/* Card badge tone for an overdue / due-today follow-up. */
function commUrgency(woman) {
  const c = nextPendingComm(woman);
  if (!c) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (c.scheduledDate < today) return { tone: 'overdue', text: 'Follow-up late',  emoji: '⚡' };
  if (c.scheduledDate === today) return { tone: 'today',  text: 'Follow-up today', emoji: '⚡' };
  return null;
}

const DEFAULT_WOMAN = () => ({
  id:                     makeId('w'),
  name:                   '',
  contactUid:             '',   // linked My Contacts uid, if her name matched a connection
  contactEmailHidden:     false, // that connection's email/phone is hidden from the directory
  contactPhoneHidden:     false, // — unlocks the "Request info" flow instead of leaving it blank
  infoRequestId:          '',   // outstanding/resolved infoShareRequests doc id, if any
  photoUrl:               '',
  avatar:                 null,  // built avatar config (from a linked Contact), CustomAvatar-compatible
  lifeStage:              '',
  single:                 false,  // independent of lifeStage — checked women show on Life Stages' "Single" tab
  lifeStageGroup:         '',   // which of her stage's meeting groups she's in — label, set from Life Stages
  suggestedNextStage:     '',   // coordinator's hint that she may be transitioning stages — set from Life Stages
  faithJourney:           '',   // where she is in her walk with Christ — see useFaithJourney(); also settable from Life Stages roster
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
  prayerGroup:            '',
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
     '' means she's not (or no longer) in that pipeline. */
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
export default function AllWomen() {
  const [women, setWomen, { loading }] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [studies] = useBibleStudies();
  const lifeStages = useLifeStages();
  const faithJourney = useFaithJourney();
  const [stageInfo] = useLifeStageInfo();
  const list = Array.isArray(women) ? women : [];
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* Flattens Life Stages' per-stage "Meeting groups" (see LifeStages.jsx
     — stored per stage name under useLifeStageInfo()) into one list, each
     tagged with the stage it belongs to. Lets the "Groups & Discipleship"
     section below resolve a woman's `lifeStageGroup` label into full group
     details (stage, day, time, location) without re-deriving that storage
     shape here — this is a read-only mirror, all editing still happens on
     the Life Stages page. */
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

  const { user, profile, avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* ── Calendar sync helpers ──────────────────────────────── */
  const syncBirthdayCalendarFor = (woman) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const sourceId = `${woman.id}__bday`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE_BDAY && e.source_id === sourceId));
      if (!woman.syncBirthdayToCalendar || !woman.birthday) return others;
      const date = nextAnniversaryISO(woman.birthday);
      if (!date) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_bday_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       `🎂 ${woman.name || 'Woman'}'s birthday`,
        description: woman.birthday ? `Born ${woman.birthday}.` : '',
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_BDAY,
        category:    'womens',
        source:      CAL_SOURCE_BDAY,
        source_id:   sourceId,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeBirthdayCalendarFor = (womanId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_BDAY && (e.source_id || '').startsWith(`${womanId}__`))
    ));
  };

  /* Rebuilds every PENDING (not-done) scheduled communication as a
     Calendar reminder. Idempotent — safe to call on every update. */
  const syncCommunicationsCalendarFor = (woman) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const others = evList.filter(e => !(e.source === CAL_SOURCE_COMM && (e.source_id || '').startsWith(`${woman.id}__comm__`)));
      const pending = (woman.communications || []).filter(c => c.scheduledDate && !c.done);
      const fresh = pending.map(c => {
        const t = commType(c.type);
        return {
          id: 'ce_' + Date.now().toString(36) + '_comm_' + Math.random().toString(36).slice(2, 6),
          created_at:  new Date().toISOString(),
          title:       `${t.icon} ${t.label} — ${woman.name || 'Follow up'}`,
          description: c.note || '',
          event_date:  c.scheduledDate,
          end_date:    '',
          event_time:  '',
          color:       CAL_COLOR_COMM,
          category:    'womens',
          source:      CAL_SOURCE_COMM,
          source_id:   `${woman.id}__comm__${c.id}`,
          reminder_offset: 'none',
          reminder_time:   '',
          reminder_note:   '',
        };
      });
      return [...fresh, ...others];
    });
  };
  const removeCommunicationsCalendarFor = (womanId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_COMM && (e.source_id || '').startsWith(`${womanId}__comm__`))
    ));
  };

  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' — for the slide-over
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'stage' | 'joined'
  const [filter, setFilter] = useState('all');

  /* Cross-page deep link: ?woman=ID auto-selects that woman
     (e.g. from the Life Stages page). ?edit=1 opens her straight
     into the edit form instead of the view panel — used by New to
     Ministry when a freshly-added woman doesn't match anyone in
     All Women or Contacts, so the rest of her profile can be
     filled in here right away. */
  useEffect(() => {
    if (list.length === 0) return;
    const womanId = searchParams.get('woman');
    if (!womanId) return;
    const w = list.find(x => x.id === womanId);
    if (w) { setSelectedId(w.id); setMode(searchParams.get('edit') === '1' ? 'edit' : 'view'); }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  /* Cross-page deep link: ?q=TEXT preloads the search box — used by
     Bible Studies' "Manage roster in All Women" link so it lands
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
      ? list.filter(w =>
          (w.name || '').toLowerCase().includes(q) ||
          (w.bibleStudy || '').toLowerCase().includes(q) ||
          (w.mentor || '').toLowerCase().includes(q) ||
          (w.prayerGroup || '').toLowerCase().includes(q) ||
          (w.lifeStage || '').toLowerCase().includes(q))
      : list;
    /* Unchecking "Currently in the ministry" archives her — she drops out
       of the directory everywhere except the explicit "Inactive" chip,
       which is also how she gets found again to re-activate her. */
    if (filter !== 'inactive') out = out.filter(w => w.active !== false);
    if (filter === 'no-mentor')      out = out.filter(w => !(w.mentor || '').trim());
    else if (filter === 'in-study')  out = out.filter(w => (w.bibleStudy || '').trim());
    else if (filter === 'no-study')  out = out.filter(w => !(w.bibleStudy || '').trim());
    else if (filter === 'inactive')  out = out.filter(w => w.active === false);
    else if (filter.startsWith('stage:')) out = out.filter(w => w.lifeStage === filter.slice(6));
    out = [...out];
    if (sortBy === 'name')   out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'stage')  out.sort((a, b) => lifeStages.stages.indexOf(a.lifeStage || '') - lifeStages.stages.indexOf(b.lifeStage || ''));
    if (sortBy === 'joined') out.sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    return out;
  }, [list, query, sortBy, filter, lifeStages.stages]);

  const selected = useMemo(
    () => list.find(w => w.id === selectedId) || null,
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
  const addWoman = () => {
    const w = DEFAULT_WOMAN();
    setWomen(prev => [...(prev || []), w]);
    setSelectedId(w.id);
    setMode('edit');
  };

  const updateWoman = (id, patch) => {
    /* Pure setter — no side effects in the updater itself (StrictMode
       runs updaters twice in dev). The calendar syncs run AFTER the
       setter is queued, using the current closure of `list` merged
       with the patch to compute what the record will look like. */
    setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, ...patch } : w));
    const current = list.find(w => w.id === id);
    if (current) {
      const merged = { ...current, ...patch };
      syncBirthdayCalendarFor(merged);
      syncCommunicationsCalendarFor(merged);
    }
  };

  const removeWoman = (id) => {
    setWomen(prev => (prev || []).filter(w => w.id !== id));
    removeBirthdayCalendarFor(id);
    removeCommunicationsCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  /* Opens (or creates) an immediately-usable private chat with a woman
     linked to a Contacts connection — no invite/accept step, since
     they're already a mutual connection. See lib/directChat.js. */
  const startChat = async (woman) => {
    if (!woman?.contactUid || !user?.uid) return;
    const channelId = await ensureDirectChannel({
      myUid:     user.uid,
      myName:    profile?.displayName || user.displayName || 'Member',
      otherUid:  woman.contactUid,
      otherName: woman.name,
    });
    navigate('/chat', { state: { openChannelId: channelId } });
  };

  /* When a member accepts one of our contact-info requests, backfill
     the shared phone/email straight onto the woman that request was
     made for (matched by infoRequestId) — even if she has phone/email
     hidden in her own profile, since accepting is an explicit,
     one-time consented share (see lib/infoShareRequests.js). */
  const { requests: infoRequests } = useMyInfoShareRequests();
  useEffect(() => {
    if (!user?.uid || !infoRequests.length || !list.length) return;
    const accepted = infoRequests.filter(r => r.status === 'accepted' && r.senderUid === user.uid);
    if (!accepted.length) return;
    list.forEach(w => {
      if (!w.infoRequestId) return;
      const match = accepted.find(r => r.id === w.infoRequestId);
      if (!match) return;
      const patch = {};
      if (!w.phone && match.sharedPhone) patch.phone = match.sharedPhone;
      if (!w.email && match.sharedEmail) patch.email = match.sharedEmail;
      if (Object.keys(patch).length === 0) return;
      updateWoman(w.id, patch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoRequests, list, user]);

  /* Quick stats for the header bar — active (non-archived) women only. */
  const stats = useMemo(() => {
    const activeList = list.filter(w => w.active !== false);
    return {
      total:      activeList.length,
      inStudy:    activeList.filter(w => (w.bibleStudy || '').trim()).length,
      unassigned: activeList.filter(w => !(w.mentor || '').trim()).length,
    };
  }, [list]);

  const totalPulse = usePulseOnChange(stats.total);
  const inStudyPulse = usePulseOnChange(stats.inStudy);
  const unassignedPulse = usePulseOnChange(stats.unassigned);

  return (
    <WomensShell
      title="All Women"
      icon="🧑‍🤝‍🧑"
      subtitle="Directory of every woman in the ministry — life stage, Bible study, mentor pairing, and engagement, all in one place."
      actions={
        <button type="button" className="wms-btn primary" onClick={addWoman}>
          ✦ Add woman
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root">
      {loading && list.length === 0 ? (
        <div className="wa-directory-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">🧑‍🤝‍🧑</div>
          <div className="app-empty-title">Your Women's directory</div>
          <div className="app-empty-sub">
            Add the women in your ministry — track life stage, Bible study,
            mentor pairing, and engagement over time.
          </div>
          <button type="button" className="app-btn primary" onClick={addWoman}>
            ✦ Add your first woman
          </button>
        </div>
      ) : (
        <div className="wa-directory">
          <div className="wa-stats-bar">
            <div className="wa-stat">
              <span className={`wa-stat-n${totalPulse ? ' is-pulsing' : ''}`}>{stats.total}</span>
              <span className="wa-stat-lbl">Total</span>
            </div>
            <div className="wa-stat">
              <span className={`wa-stat-n${inStudyPulse ? ' is-pulsing' : ''}`}>{stats.inStudy}</span>
              <span className="wa-stat-lbl">In a Bible study</span>
            </div>
            <div className="wa-stat is-warn">
              <span className={`wa-stat-n${unassignedPulse ? ' is-pulsing' : ''}`}>{stats.unassigned}</span>
              <span className="wa-stat-lbl">No mentor</span>
            </div>
          </div>

          <div className="wa-controls">
            <div className="wa-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by name, study, mentor, life stage…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
            <div className="wa-sort-wrap">
              <label className="wa-sort-lbl">Sort</label>
              <select
                className="wa-sort-sel"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="name">Name (A–Z)</option>
                <option value="stage">Life stage</option>
                <option value="joined">Recently joined</option>
              </select>
            </div>
          </div>

          <div className="wa-filter-row">
            {FILTERS.map(f => (
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
              {query ? `No one matches "${query}".` : 'No one matches this filter.'}
            </div>
          ) : (
            <div className="wa-card-grid">
              {visible.map((w, i) => (
                <WomanCard key={w.id} woman={w} index={i} onClick={() => { setSelectedId(w.id); setMode('view'); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail slide-over (right side), matching Friends' pattern. */}
      {selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label={selected.name || 'Woman'}>
            <button
              className="wa-slide-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              {mode === 'view' ? (
                <WomanView
                  woman={selected}
                  allStageGroups={allStageGroups}
                  studies={Array.isArray(studies) ? studies : []}
                  onEdit={() => setMode('edit')}
                  onChat={() => startChat(selected)}
                />
              ) : (
                <WomanForm
                  key={selected.id}
                  woman={selected}
                  women={list}
                  profile={profile}
                  lifeStages={lifeStages}
                  faithJourney={faithJourney}
                  allStageGroups={allStageGroups}
                  studies={Array.isArray(studies) ? studies : []}
                  onChange={(patch) => updateWoman(selected.id, patch)}
                  onDelete={() => removeWoman(selected.id)}
                  onChat={() => startChat(selected)}
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
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
        guideTabLabel="📋 Page Settings"
        guide={<LifeStagesPageSettings lifeStages={lifeStages} />}
      />
    </WomensShell>
  );
}

/* ── Directory card (photo-first, matches Friends' FriendCard) ─ */
function WomanCard({ woman, index, onClick }) {
  const bday = daysToBirthday(woman.birthday);
  const urgency = commUrgency(woman);

  let badge = null;
  if (urgency) badge = urgency;
  else if (bday === 0) badge = { tone: 'bday', text: 'Birthday!', emoji: '🎂' };
  else if (bday !== null && bday <= 7) badge = { tone: 'bday', text: `🎂 ${bday}d`, emoji: '🎂' };

  const noMentor = !(woman.mentor || '').trim();

  return (
    <button type="button" className="wa-fc" style={{ '--i': index }} onClick={onClick}>
      <span className={`wa-fc-stripe tone-${badge?.tone || 'neutral'}`} />
      {badge && (
        <span className={`wa-fc-badge tone-${badge.tone}`}>{badge.emoji} {badge.text}</span>
      )}

      <AvatarThumb url={woman.photoUrl} avatar={woman.avatar} name={woman.name} size={56} />

      <div className="wa-fc-name">{woman.name || '(no name)'}</div>

      <div className="wa-fc-meta">
        {woman.lifeStage && <span>{woman.lifeStage}</span>}
        {woman.lifeStage && woman.bibleStudy && <span>·</span>}
        {woman.bibleStudy && <span>{woman.bibleStudy}</span>}
      </div>

      {!woman.active && <div className="wa-fc-status inactive">Inactive</div>}
      {woman.active && noMentor && <div className="wa-fc-status">🧭 No mentor</div>}

      <div className="wa-fc-foot">
        <span className="wa-fc-foot-lbl">Last contact</span>
        <span className="wa-fc-foot-val">{woman.lastContacted || 'Never'}</span>
      </div>
    </button>
  );
}

/* ── Read-only detail view (opened on card click) ──────────── */
export function WomanView({ woman, allStageGroups, studies, onEdit, onChat }) {
  const comms = Array.isArray(woman.communications) ? woman.communications : [];
  const pending = [...comms].filter(c => !c.done).sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  const timeline = Array.isArray(woman.engagementTimeline) ? woman.engagementTimeline : [];
  const [chatBusy, setChatBusy] = useState(false);

  const handleChat = async () => {
    setChatBusy(true);
    try {
      await onChat?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[womens] could not start chat:', err);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarThumb url={woman.photoUrl} avatar={woman.avatar} name={woman.name} size={44} />
          <div>
            <h2 className="ys-form-title">{woman.name || '(unnamed)'}</h2>
            {(woman.lifeStage || !woman.active) && (
              <div style={{ fontSize: 12, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))', marginTop: 2 }}>
                {woman.lifeStage}
                {woman.lifeStage && woman.lifeStageGroup && ` (${woman.lifeStageGroup})`}
                {woman.lifeStage && !woman.active && ' · '}
                {!woman.active && 'Inactive'}
              </div>
            )}
            {woman.faithJourney && (
              <div style={{ fontSize: 12, color: 'var(--wms-ink, #3d1728)', marginTop: 2 }}>
                ✝️ {woman.faithJourney}
              </div>
            )}
            {woman.suggestedNextStage && (
              <div style={{ fontSize: 11, color: '#fdba74', marginTop: 2 }}>
                🔁 Suggested to move to {woman.suggestedNextStage} — see Life Stages
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

      {woman.contactUid && (
        <button type="button" className="wa-chat-btn" onClick={handleChat} disabled={chatBusy}>
          {chatBusy ? 'Opening chat…' : `💬 Chat with ${woman.name || 'her'}`}
        </button>
      )}

      {woman.careStatus === 'flagged' && (
        <Section title="Pastoral care">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fdba74' }}>⚠️ Needs extra care</div>
          {woman.careNote && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))' }}>{woman.careNote}</div>}
        </Section>
      )}

      {(woman.phone || woman.email || woman.address) && (
        <Section title="Contact">
          <ViewRow label="Phone" value={woman.phone} />
          <ViewRow label="Email" value={woman.email} />
          <ViewRow label="Address" value={woman.address} />
        </Section>
      )}

      {(woman.age || woman.birthday || woman.joinedDate || woman.lastContacted) && (
        <Section title="Key dates">
          <ViewRow label="Age" value={woman.age} />
          <ViewRow label="Birthday" value={woman.birthday} />
          <ViewRow label="Joined" value={woman.joinedDate} />
          <ViewRow label="Last contacted" value={woman.lastContacted || 'Never'} />
        </Section>
      )}

      <Section title="Groups & Discipleship">
        <GroupsAndDiscipleshipField woman={woman} allStageGroups={allStageGroups} studies={studies} />
      </Section>

      {pending.length > 0 && (
        <Section title="Upcoming follow-ups">
          <ul className="wa-comm-list">
            {pending.map(c => (
              <li key={c.id} className="wa-comm-row">
                <span className="wa-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
                <span className="wa-comm-body">
                  <span className="wa-comm-date">{c.scheduledDate}</span>
                  <span className="wa-comm-note">{c.note || commType(c.type).label}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title="Engagement history">
          <ul className="wa-timeline">
            {timeline.map(e => (
              <li key={e.id} className="wa-timeline-row">
                <span className="wa-timeline-dot" aria-hidden="true" />
                <span className="wa-timeline-body">
                  <span className="wa-timeline-date">{new Date(e.created_at).toLocaleDateString()}</span>
                  <span className="wa-timeline-content">{e.content}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {Array.isArray(woman.prayerRequests) && woman.prayerRequests.length > 0 && (
        <Section title="Prayer requests">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {woman.prayerRequests.map(p => (
              <li key={p.id} style={{ fontSize: 13, color: 'var(--wms-ink, #3d1728)', lineHeight: 1.5 }}>{p.text}</li>
            ))}
          </ul>
        </Section>
      )}

      {woman.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: 'var(--wms-ink, #3d1728)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {woman.notes}
          </div>
        </Section>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="wa-view-row">
      <span className="wa-view-lbl">{label}</span>
      <span className="wa-view-val">{value}</span>
    </div>
  );
}

/* ── Detail / edit form for one woman ──────────────────────── */
function WomanForm({ woman, women, profile, lifeStages, faithJourney, allStageGroups, studies, onChange, onDelete, onChat, onDone }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
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

  const handleChat = async () => {
    setChatBusy(true);
    try {
      await onChat?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[womens] could not start chat:', err);
    } finally {
      setChatBusy(false);
    }
  };

  /* ── Request-info flow — ask the linked Contacts connection to
     share their phone/email when it's hidden from the directory.
     Consent-based: nothing is shared until she accepts (see
     lib/infoShareRequests.js and AllWomen()'s auto-apply effect). */
  const { requests: infoRequests } = useMyInfoShareRequests();
  const sentInfoRequest = useMemo(() => {
    if (!woman.infoRequestId) return null;
    return infoRequests.find(r => r.id === woman.infoRequestId) || null;
  }, [infoRequests, woman.infoRequestId]);
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [infoRequestError, setInfoRequestError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const needsEmail = Boolean(woman.contactUid) && woman.contactEmailHidden && !woman.email;
  const needsPhone = Boolean(woman.contactUid) && woman.contactPhoneHidden && !woman.phone;

  const handleRequestInfo = async () => {
    if (!woman.contactUid || (!needsEmail && !needsPhone)) return;
    setRequestingInfo(true);
    setInfoRequestError('');
    try {
      const requestId = await requestInfoShare(
        profile,
        { uid: woman.contactUid, displayName: woman.name },
        {
          wantEmail: needsEmail,
          wantPhone: needsPhone,
          context: `Women's Ministry — ${woman.name || 'woman'}`,
          message: requestMessage.trim(),
        }
      );
      onChange({ infoRequestId: requestId });
      setRequestMessage('');
    } catch (err) {
      setInfoRequestError(err?.message || 'Could not send request.');
    } finally {
      setRequestingInfo(false);
    }
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarThumb url={woman.photoUrl} avatar={woman.avatar} name={woman.name} size={44} />
          <h2 className="ys-form-title">{woman.name || '(unnamed)'}</h2>
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
            <NameContactField woman={woman} women={women} onChange={onChange} />
          </Field>
          <Field label="Age">
            <input
              type="number"
              className="ys-inp"
              min="0"
              value={woman.age ?? ''}
              onChange={set('age')}
              placeholder="e.g. 34"
            />
          </Field>
        </Row>
        {woman.contactUid && (
          <button type="button" className="wa-chat-btn" onClick={handleChat} disabled={chatBusy}>
            {chatBusy ? 'Opening chat…' : `💬 Chat with ${woman.name || 'her'}`}
          </button>
        )}
        <Field label="Photo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label
              style={{ cursor: 'pointer', display: 'inline-flex', position: 'relative' }}
              title="Click to upload a photo — it becomes her profile picture automatically"
            >
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoChosen} />
              <AvatarThumb url={woman.photoUrl} avatar={woman.avatar} name={woman.name} size={44} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))' }}>
                Click the photo to upload one.
              </span>
              {woman.photoUrl && (
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
            <input type="date" className="ys-inp" value={woman.birthday || ''} onChange={set('birthday')} />
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 9px', marginTop: 4,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, fontSize: 12,
                cursor: woman.birthday ? 'pointer' : 'not-allowed',
                opacity: woman.birthday ? 1 : 0.55,
                color: woman.syncBirthdayToCalendar ? 'var(--ys-accent)' : 'var(--wms-ink-soft, rgba(61,23,40,0.74))',
              }}
              title={woman.birthday ? 'Add this birthday as a yearly Calendar event' : 'Pick a birthday first'}
            >
              <input
                type="checkbox"
                checked={!!woman.syncBirthdayToCalendar}
                disabled={!woman.birthday}
                onChange={set('syncBirthdayToCalendar')}
                style={{ accentColor: 'var(--ys-accent)' }}
              />
              <span>📆 Sync birthday to Calendar</span>
            </label>
          </Field>
          <Field label="Joined">
            <input type="date" className="ys-inp" value={woman.joinedDate || ''} onChange={set('joinedDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!woman.active} onChange={set('active')} />
              <span>Currently in the ministry</span>
            </label>
          </Field>
        </Row>
      </Section>

      <Section title="Life Stage">
        <Field label="Life stage">
          <select className="ys-inp" value={woman.lifeStage || ''} onChange={e => onChange(lifeStagePatchFor(e.target.value))}>
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
            <input type="checkbox" checked={!!woman.single} onChange={set('single')} />
            <span>Single — show her on the Life Stages "Single" tab</span>
          </label>
        </Field>
      </Section>

      <Section title="Faith Journey">
        <Field label="Faith journey">
          <select className="ys-inp" value={woman.faithJourney || ''} onChange={set('faithJourney')}>
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

      <Section title="Groups & Discipleship">
        <GroupsAndDiscipleshipField woman={woman} allStageGroups={allStageGroups} studies={studies} />
      </Section>

      <Section title="Contact">
        <Row>
          <Field label="Phone">
            <input type="tel" className="ys-inp" value={woman.phone || ''} onChange={set('phone')} placeholder={needsPhone ? 'Hidden from directory' : ''} />
          </Field>
          <Field label="Email">
            <input type="email" className="ys-inp" value={woman.email || ''} onChange={set('email')} placeholder={needsEmail ? 'Hidden from directory' : ''} />
          </Field>
        </Row>
        <Field label="Address">
          <input type="text" className="ys-inp" value={woman.address || ''} onChange={set('address')} />
        </Field>

        {(needsEmail || needsPhone) && !sentInfoRequest && (
          <div className="wa-info-request">
            <span className="wa-info-request-text">
              🔒 {woman.name || 'She'} keeps {needsEmail && needsPhone ? 'her email and phone' : needsEmail ? 'her email' : 'her phone number'} private.
            </span>
            <input
              type="text"
              className="ys-inp wa-info-request-msg"
              placeholder="Optional message to include with the request…"
              value={requestMessage}
              onChange={e => setRequestMessage(e.target.value)}
            />
            <button type="button" className="app-btn ghost wa-info-request-btn" disabled={requestingInfo} onClick={handleRequestInfo}>
              {requestingInfo ? 'Sending…' : 'Request information'}
            </button>
            {infoRequestError && <span className="wa-info-request-error">{infoRequestError}</span>}
          </div>
        )}
        {sentInfoRequest && sentInfoRequest.status === 'pending' && (needsEmail || needsPhone) && (
          <div className="wa-info-request pending">
            <span className="wa-info-request-text">🔒 Waiting for {woman.name || 'her'} to accept your info request…</span>
          </div>
        )}
        {sentInfoRequest && sentInfoRequest.status === 'declined' && (needsEmail || needsPhone) && (
          <div className="wa-info-request declined">
            <span className="wa-info-request-text">{woman.name || 'She'} declined to share that info.</span>
          </div>
        )}
      </Section>

      <CommunicationsSection woman={woman} onChange={onChange} />

      <EngagementSection woman={woman} onChange={onChange} />

      <Section title="Pastoral care">
        <Field label="Care status">
          <select
            className="ys-inp"
            value={woman.careStatus || ''}
            onChange={set('careStatus')}
            title="Flag women going through a hard season — kept private to this record"
          >
            <option value="">Normal</option>
            <option value="flagged">⚠️ Needs extra care</option>
          </select>
        </Field>
        {woman.careStatus === 'flagged' && (
          <Field label="Private note (only visible here)">
            <textarea
              className="ys-inp ys-textarea"
              rows={2}
              value={woman.careNote || ''}
              onChange={set('careNote')}
              placeholder="Context for follow-up — grief, illness, crisis…"
            />
          </Field>
        )}
      </Section>

      <PrayerRequestsSection woman={woman} onChange={onChange} />

      <Section title="Notes">
        <Field label="General notes">
          <textarea className="ys-inp ys-textarea" rows={3} value={woman.notes || ''} onChange={set('notes')} />
        </Field>
      </Section>
    </form>
  );
}

/* ── Prayer requests — bulleted, add/remove ────────────────── */
function PrayerRequestsSection({ woman, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(woman.prayerRequests) ? woman.prayerRequests : [];

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange({ prayerRequests: [{ id: makeId('wp'), text, createdAt: new Date().toISOString() }, ...list] });
    setDraft('');
  };
  const remove = (id) => onChange({ prayerRequests: list.filter(p => p.id !== id) });

  return (
    <Section title="Prayer requests">
      <Field label="Add a prayer request">
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="ys-inp"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Healing for her mother, wisdom for a job decision…"
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
        <div style={{ fontSize: 13, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))', padding: '4px 0' }}>No prayer requests yet.</div>
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
              <span aria-hidden="true" style={{ lineHeight: '18px' }}>🙏</span>
              <span style={{ flex: 1, lineHeight: 1.5 }}>{p.text}</span>
              <button
                type="button"
                className="wa-comm-del"
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

/* Read-only — merges what used to be two separate sections ("Groups"
   and "Discipleship") into one, since every field here is actually set
   from somewhere else and was never meant to be edited on this page:
     - Bible study    → Bible Studies page (`bibleStudy` label)
     - Life Group     → Life Stages page (`lifeStageGroup` label)
     - Mentor/Mentee  → Mentorship page (keeps both women's records in sync)
     - Prayer group   → Prayer Groups page (`prayerGroup` label)
   Bible Study and Life Group are always separate items UNLESS her Life
   Stages Meeting Group is linked to her Bible Study via `bibleStudyId`
   (see LifeStages.jsx's updateGroup), in which case the Life Group is
   the top-level item and the Bible study renders indented under it
   instead of as its own item, since it's really "the same gathering"
   from two angles — and the group's leader line falls back to the
   study's own leader when the group hasn't set one of its own. Groups
   not linked to this woman's current study (e.g. data that predates
   the link) still show as their own top-level item. Everything here
   just reads `woman`/`allStageGroups`/`studies` — nothing local to
   edit or save. */
function GroupsAndDiscipleshipField({ woman, allStageGroups, studies }) {
  const studyLabel = (woman.bibleStudy || '').trim();
  const groupLabel = (woman.lifeStageGroup || '').trim();
  const mentor = (woman.mentor || '').trim();
  const mentee = (woman.mentee || '').trim();
  const prayerGroup = (woman.prayerGroup || '').trim();
  const studyList = Array.isArray(studies) ? studies : [];
  const groups = Array.isArray(allStageGroups) ? allStageGroups : [];

  const study = studyLabel
    ? studyList.find(s => (s.label || '').trim().toLowerCase() === studyLabel.toLowerCase())
    : null;
  const groupMatches = groupLabel
    ? groups.filter(g => (g.label || '').trim().toLowerCase() === groupLabel.toLowerCase())
    : [];
  const linkedGroups = study ? groupMatches.filter(g => g.bibleStudyId === study.id) : [];
  const unlinkedGroups = groupMatches.filter(g => !linkedGroups.includes(g));

  const hasAny = studyLabel || groupMatches.length > 0 || mentor || mentee || prayerGroup;
  if (!hasAny) {
    return (
      <div style={{ fontSize: 12, color: 'var(--wms-ink-faint, rgba(61,23,40,0.52))', lineHeight: 1.5 }}>
        Not in a Bible study, Life Stages group, mentorship pairing, or prayer group yet.
      </div>
    );
  }

  const cardStyle = { padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'var(--wms-ink, #3d1728)' };
  const metaStyle = { fontSize: 11.5, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))', marginTop: 2 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {studyLabel && linkedGroups.length === 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>📚 {studyLabel}</div>
          {study && (study.leader || study.day || study.time || study.location) && (
            <div style={metaStyle}>
              {[study.leader ? `👩‍🏫 ${study.leader}` : '', [study.day, study.time, study.location].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}

      {linkedGroups.map(g => (
        <div key={g.id} style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>👥 {g.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {g.stage}</span></div>
          {(g.leader || study.leader) && (
            <div style={metaStyle}>Leader: {g.leader || study.leader}</div>
          )}
          {(g.day || g.time || g.location) && (
            <div style={metaStyle}>{[g.day, g.time, g.location].filter(Boolean).join(' · ')}</div>
          )}

          <div style={{ marginTop: 8, marginLeft: 14, paddingLeft: 10, borderLeft: '2px solid rgba(196,19,60,0.25)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>📚 {studyLabel}</div>
            {study && (study.leader || study.day || study.time || study.location) && (
              <div style={metaStyle}>
                {[study.leader ? `👩‍🏫 ${study.leader}` : '', [study.day, study.time, study.location].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
      ))}

      {unlinkedGroups.map(g => (
        <div key={g.id} style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>👥 {g.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {g.stage}</span></div>
          {g.leader && <div style={metaStyle}>Leader: {g.leader}</div>}
          {(g.day || g.time || g.location) && (
            <div style={metaStyle}>{[g.day, g.time, g.location].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      ))}

      {(mentor || mentee || prayerGroup) && (
        <div style={cardStyle}>
          <ViewRow label="Mentor" value={mentor} />
          <ViewRow label="Mentee" value={mentee} />
          <ViewRow label="Prayer group" value={prayerGroup} />
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--wms-ink-faint, rgba(61,23,40,0.52))' }}>
        Synced automatically from Bible Studies, Life Stages, Mentorship, and Prayer Groups — change it there.
      </div>
    </div>
  );
}

/* ── Name field with "From your Contacts" typeahead ──────────
   Selecting a match autofills their avatar/photo (and email, if
   they've made it visible) from their public profile — mirrors the
   Friends page's Add Friend name suggestions. */
function NameContactField({ woman, women, onChange }) {
  const { connections } = useMyConnections();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  /* A connection already linked to a DIFFERENT woman in the directory
     shouldn't be offered again — picking it here would just create a
     duplicate entry for the same person. */
  const usedUids = useMemo(
    () => new Set((women || []).filter(w => w.id !== woman.id && w.contactUid).map(w => w.contactUid)),
    [women, woman.id]
  );

  const nameMatches = useMemo(() => {
    const q = (woman.name || '').trim().toLowerCase();
    if (!q || !connections?.length) return [];
    return connections
      .filter(c => (c.name || '').toLowerCase().includes(q) && !usedUids.has(c.uid))
      .slice(0, 6);
  }, [woman.name, connections, usedUids]);

  const pickContact = async (contact) => {
    setSuggestOpen(false);
    setFilling(true);
    try {
      const profile = await getProfileByUid(contact.uid);
      const patch = {
        name: profile?.displayName || contact.name || woman.name,
        contactUid: contact.uid,
        contactEmailHidden: profile?.emailVisible === false,
        contactPhoneHidden: profile?.phoneVisible === false,
        infoRequestId: '',
      };
      if (profile?.avatar) patch.avatar = profile.avatar;
      else if (profile?.logo) patch.photoUrl = profile.logo;
      if (profile?.emailVisible !== false && profile?.email) patch.email = profile.email;
      if (profile?.phoneVisible !== false && profile?.phone) patch.phone = profile.phone;
      onChange(patch);
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="wa-name-suggest-wrap">
      <input
        type="text"
        className="ys-inp"
        value={woman.name || ''}
        onChange={e => { onChange({ name: e.target.value, contactUid: '' }); setSuggestOpen(true); }}
        onFocus={() => setSuggestOpen(true)}
        onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
        autoComplete="off"
      />
      {woman.contactUid && <span className="wa-linked-pill">🔗 Linked to Contacts</span>}
      {suggestOpen && nameMatches.length > 0 && (
        <div className="wa-name-suggest">
          <div className="wa-name-suggest-hd">From your Contacts</div>
          {nameMatches.map(c => (
            <button
              type="button"
              key={c.uid}
              className="wa-name-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickContact(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {filling && <div className="wa-name-suggest-status">Filling from contact…</div>}
    </div>
  );
}

/* ── Scheduled communication tracker ───────────────────────── */
function CommunicationsSection({ woman, onChange }) {
  const [type, setType] = useState('call');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const list = Array.isArray(woman.communications) ? woman.communications : [];
  const pending = [...list].filter(c => !c.done).sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  const history = [...list].filter(c => c.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const schedule = () => {
    if (!date) return;
    const entry = { id: makeId('wc'), type, scheduledDate: date, note: note.trim(), done: false, createdAt: new Date().toISOString() };
    onChange({ communications: [entry, ...list] });
    setDate(''); setNote('');
  };

  const markDone = (id) => {
    const today = new Date().toISOString().slice(0, 10);
    const c = list.find(x => x.id === id);
    const next = list.map(x => x.id === id ? { ...x, done: true, completedAt: today } : x);
    const timelineEntry = c ? {
      id:         makeId('wt'),
      content:    `${commType(c.type).icon} ${commType(c.type).label}${c.note ? ': ' + c.note : ''}`,
      created_at: new Date().toISOString(),
    } : null;
    onChange({
      communications: next,
      lastContacted:  today,
      engagementTimeline: timelineEntry
        ? [timelineEntry, ...(Array.isArray(woman.engagementTimeline) ? woman.engagementTimeline : [])]
        : woman.engagementTimeline,
    });
  };

  const removeComm = (id) => onChange({ communications: list.filter(x => x.id !== id) });

  return (
    <Section title="Communication">
      <div style={{ fontSize: 12, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))', fontStyle: 'italic', marginBottom: 2 }}>
        Scheduled follow-ups sync to the Calendar automatically. Marking one done logs it to her engagement history below and updates "last contacted."
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
        <ul className="wa-comm-list">
          {pending.map(c => (
            <li key={c.id} className="wa-comm-row">
              <span className="wa-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
              <span className="wa-comm-body">
                <span className="wa-comm-date">{c.scheduledDate}</span>
                <span className="wa-comm-note">{c.note || commType(c.type).label}</span>
              </span>
              <button type="button" className="wa-comm-done" onClick={() => markDone(c.id)}>✓ Done</button>
              <button type="button" className="wa-comm-del" onClick={() => removeComm(c.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="wa-comm-history">
          <summary>{history.length} completed</summary>
          <ul className="wa-comm-list">
            {history.map(c => (
              <li key={c.id} className="wa-comm-row done">
                <span className="wa-comm-icon" aria-hidden="true">{commType(c.type).icon}</span>
                <span className="wa-comm-body">
                  <span className="wa-comm-date">{c.completedAt}</span>
                  <span className="wa-comm-note">{c.note || commType(c.type).label}</span>
                </span>
                <button type="button" className="wa-comm-del" onClick={() => removeComm(c.id)}>✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

/* ── Engagement history timeline ───────────────────────────── */
function EngagementSection({ woman, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(woman.engagementTimeline) ? woman.engagementTimeline : [];

  const add = () => {
    const content = draft.trim();
    if (!content) return;
    onChange({ engagementTimeline: [{ id: makeId('wt'), content, created_at: new Date().toISOString() }, ...list] });
    setDraft('');
  };
  const remove = (id) => onChange({ engagementTimeline: list.filter(e => e.id !== id) });

  return (
    <Section title="Engagement history">
      <Field label="Last contacted">
        <input type="date" className="ys-inp" value={woman.lastContacted || ''} onChange={e => onChange({ lastContacted: e.target.value })} />
      </Field>
      <Field label="Add a timeline entry">
        <textarea
          className="ys-inp ys-textarea"
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Attended the spring retreat, joined the Tuesday study…"
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
        <div style={{ fontSize: 13, color: 'var(--wms-ink-soft, rgba(61,23,40,0.74))', padding: '4px 0' }}>No entries yet.</div>
      ) : (
        <ul className="wa-timeline">
          {list.map(e => (
            <li key={e.id} className="wa-timeline-row">
              <span className="wa-timeline-dot" aria-hidden="true" />
              <span className="wa-timeline-body">
                <span className="wa-timeline-date">{new Date(e.created_at).toLocaleDateString()}</span>
                <span className="wa-timeline-content">{e.content}</span>
              </span>
              <button type="button" className="wa-timeline-del" onClick={() => remove(e.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--wa-accent, #fb7185), #f9a8d4)' }}
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
