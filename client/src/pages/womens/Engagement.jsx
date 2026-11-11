import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useBibleStudies, usePrayerGroups, useLifeStages } from './womensListsConfig';
import { retreatService } from '../../services/retreatService';
import { conferenceService } from '../../services/conferenceService';
import { mealTrainService } from '../../services/mealTrainService';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-stats-bar/.wa-controls/.wa-filter-row/.wa-slide/.wa-timeline…)
   from AllWomen.css — same pattern every other Women's page follows. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Engagement.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Engagement & Attendance

   A read-only rollup, not another data-entry page. Every OTHER
   Women's page already logs its own participation — Bible study
   session attendance, mentorship meetings, meal-train deliveries,
   support-group rosters, crisis follow-ups, event RSVPs — but none
   of them answer "who is falling through the cracks?" This page
   reads all of it, merges it per woman into one engagement score +
   touchpoint timeline, and stops there. To edit anything, jump to
   its source page (Bible Studies, Mentorship, All Women, …) — this
   page just surfaces where to look.

   Score = recency (when did she last show up anywhere) + breadth
   (how many distinct ministry touchpoints she's connected to).
   Buckets: Engaged / Steady / Fading / At-Risk. Inactive women
   (women.active === false) are shown separately and don't skew the
   ministry-health numbers.

   Reads (no writes):
     womens:women             — directory + built-in engagementTimeline/communications
     womens:bible-studies     — session-level attendance
     womens:prayer-groups     — membership + who shared a request
     womens:mentorship-pairs  — mentor/mentee links + logged meetings
     womens:new-moms          — care check-ins
     womens:support-groups    — roster membership
     womens:crisis-cases      — open care cases + follow-ups
     womens:brunches          — RSVP'd invites (womanId-linked)
     womens:fellowship        — gathering attendeeIds
     womens-conferences / womens-retreats / womens-meal-trains
       (Firestore services, same as their own pages) — attendee /
       volunteer touchpoints. Retreats link by name only (no
       womanId field there yet), everything else links by id.
   ───────────────────────────────────────────────────────────── */

const norm = (s) => (s || '').trim().toLowerCase();
const todayISO = () => new Date().toISOString().slice(0, 10);

function toDate(v) {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysAgo(date) {
  if (!date) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
  return Math.round((t0 - d0) / 86400000);
}
function fmtRelative(days) {
  if (days == null) return 'No activity logged';
  if (days < 0) return 'Upcoming';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)}+ years ago`;
}
function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const BUCKET_META = {
  engaged:  { label: 'Engaged',   icon: '🌟', color: '#4ade80' },
  steady:   { label: 'Steady',    icon: '🙂', color: '#60a5fa' },
  fading:   { label: 'Fading',    icon: '🌥️', color: '#fbbf24' },
  'at-risk': { label: 'At-Risk',  icon: '⚠️', color: '#f87171' },
  inactive: { label: 'Inactive',  icon: '💤', color: 'rgba(255,255,255,.4)' },
};
function bucketFor(active, score) {
  if (active === false) return 'inactive';
  if (score >= 70) return 'engaged';
  if (score >= 45) return 'steady';
  if (score >= 20) return 'fading';
  return 'at-risk';
}

/* Recency carries more weight than breadth — a woman deep in three
   ministries six months ago reads as MORE at-risk than one who just
   showed up to one thing last week. */
function recencyScore(days) {
  if (days == null || days < 0) return 0;
  if (days <= 14) return 55;
  if (days <= 30) return 45;
  if (days <= 45) return 35;
  if (days <= 60) return 25;
  if (days <= 90) return 12;
  return 0;
}
function breadthScore(count) {
  return Math.min(count, 5) * 9; // 5+ distinct channels = full 45
}

/* Merge every source into per-woman channels (distinct ministry
   connections, for breadth) + touchpoints (dated events, for the
   timeline + "last touch" recency). */
function buildEngagement(woman, ctx) {
  const wName = norm(woman.name);
  const channels = [];
  const touchpoints = [];
  const addTP = (date, icon, label, source) => {
    const d = toDate(date);
    if (d) touchpoints.push({ date: d, icon, label, source });
  };

  if (woman.lastContacted) addTP(woman.lastContacted, '📞', 'Marked as contacted', 'Profile');
  for (const e of woman.engagementTimeline || []) addTP(e.created_at, '📝', e.content || 'Engagement note', 'Profile');
  for (const c of woman.communications || []) {
    if (c.done && c.completedAt) addTP(c.completedAt, '💌', 'Communication sent', 'Profile');
  }

  const study = ctx.studies.find(s => s.label && norm(s.label) === norm(woman.bibleStudy));
  let studyAttendancePct = null;
  if (study) {
    const sessions = Array.isArray(study.sessions) ? study.sessions : [];
    channels.push({ key: 'study', icon: '📖', label: `Bible study — ${study.label}`, detail: study.leader ? `Led by ${study.leader}` : '' });
    if (sessions.length) {
      const attended = sessions.filter(s => s.attendance && s.attendance[woman.id]).length;
      studyAttendancePct = Math.round((attended / sessions.length) * 100);
      for (const s of sessions) {
        if (s.attendance && s.attendance[woman.id]) addTP(s.date, '📖', s.topic ? `Attended: ${s.topic}` : 'Attended Bible study', study.label);
      }
    }
  }

  const pg = ctx.prayerGroups.find(g => g.label && norm(g.label) === norm(woman.prayerGroup));
  if (pg) {
    channels.push({ key: 'prayerGroup', icon: '🙏', label: `Prayer group — ${pg.label}`, detail: pg.leader ? `Led by ${pg.leader}` : '' });
    for (const r of pg.requests || []) {
      if (norm(r.requestedBy) === wName) addTP(r.date, '🙏', 'Shared a prayer request', pg.label);
    }
  }

  for (const p of ctx.pairs) {
    const asMentor = p.mentorWomanId === woman.id;
    const asMentee = p.menteeWomanId === woman.id;
    if (!asMentor && !asMentee) continue;
    channels.push({
      key: 'mentorship',
      icon: '🤝',
      label: asMentor ? `Mentoring ${p.menteeName || 'someone'}` : `Mentored by ${p.mentorName || 'someone'}`,
      detail: p.status ? p.status[0].toUpperCase() + p.status.slice(1) : '',
    });
    for (const m of p.meetings || []) addTP(m.date, '🤝', 'Mentorship check-in', asMentor ? `Mentoring ${p.menteeName || ''}` : `Mentored by ${p.mentorName || ''}`);
  }

  const mom = ctx.newMoms.find(m => m.womanId === woman.id);
  if (mom) {
    channels.push({ key: 'newMom', icon: '🤱', label: 'New Mom Support', detail: mom.status ? mom.status[0].toUpperCase() + mom.status.slice(1) : '' });
    if (mom.welcomeDelivered && mom.welcomeDate) addTP(mom.welcomeDate, '🤱', 'Welcome package delivered', 'New Mom Support');
    for (const c of mom.checkIns || []) addTP(c.date, '🤱', `Check-in (${c.milestone || 'ad-hoc'})`, 'New Mom Support');
  }

  for (const g of ctx.supportGroups) {
    if ((g.roster || []).some(m => m.womanId === woman.id)) {
      channels.push({ key: 'supportGroup', icon: '🫂', label: `Support group — ${g.label}`, detail: g.facilitator ? `Facilitated by ${g.facilitator}` : '' });
    }
  }

  const crisisCase = ctx.crisisCases.find(c => c.womanId === woman.id && c.status !== 'closed');
  if (crisisCase) {
    channels.push({ key: 'crisis', icon: '🆘', label: 'In active care (Crisis & Counseling)', detail: crisisCase.status ? crisisCase.status.replace('-', ' ') : '' });
    if (crisisCase.intakeDate) addTP(crisisCase.intakeDate, '🆘', 'Care intake', 'Crisis & Counseling');
    for (const f of crisisCase.followUps || []) addTP(f.date, '🆘', 'Care follow-up', 'Crisis & Counseling');
  }

  let eventTouch = false;
  for (const ev of ctx.brunches) {
    const inv = (ev.invites || []).find(i => i.womanId === woman.id);
    if (inv && inv.rsvp === 'yes') { eventTouch = true; addTP(ev.date, '🍽', `Brunch: ${ev.title || 'Untitled'}`, 'Brunches & Teas'); }
  }
  for (const g of ctx.fellowshipGatherings) {
    if ((g.attendeeIds || []).includes(woman.id)) { eventTouch = true; addTP(g.date, '🎨', `Fellowship: ${g.title || 'Untitled'}`, 'Fellowship & Crafts'); }
  }
  for (const c of ctx.conferences) {
    if ((c.attendees || []).some(a => a.womanId === woman.id)) { eventTouch = true; addTP(c.startDate, '🎤', `Conference: ${c.name || 'Untitled'}`, 'Conferences'); }
  }
  for (const r of ctx.retreats) {
    if ((r.attendees || []).some(a => norm(a.name) === wName && wName)) { eventTouch = true; addTP(r.startDate, '🏞', `Retreat: ${r.name || 'Untitled'}`, 'Retreats'); }
  }
  if (eventTouch) channels.push({ key: 'events', icon: '📅', label: 'Attended a ministry event', detail: '' });

  let volTouch = false;
  for (const t of ctx.mealTrains) {
    const vol = (t.volunteers || []).find(v => v.womanId === woman.id);
    if (!vol) continue;
    for (const s of t.schedule || []) {
      if (s.volunteerId === vol.id && s.status === 'delivered') { volTouch = true; addTP(s.date, '🍲', 'Delivered a meal', t.recipientName || 'Meal Train'); }
    }
  }
  if (volTouch) channels.push({ key: 'volunteering', icon: '🍲', label: 'Meal train volunteer', detail: '' });

  touchpoints.sort((a, b) => b.date - a.date);
  const lastTouch = touchpoints[0]?.date || null;
  const days = daysAgo(lastTouch);
  const breadth = new Set(channels.map(c => c.key)).size;
  const score = Math.min(100, recencyScore(days) + breadthScore(breadth));
  const bucket = bucketFor(woman.active, score);

  return { channels, touchpoints, lastTouch, daysSince: days, breadth, score, bucket, studyAttendancePct, careFlag: !!crisisCase || woman.careStatus === 'flagged' };
}

const FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'engaged',  label: '🌟 Engaged' },
  { id: 'steady',   label: '🙂 Steady' },
  { id: 'fading',   label: '🌥️ Fading' },
  { id: 'at-risk',  label: '⚠️ At-Risk' },
  { id: 'care',     label: '🆘 In active care' },
  { id: 'no-touch', label: '❔ No activity logged' },
  { id: 'inactive', label: '💤 Inactive' },
];

const SORTS = [
  { id: 'needs',   label: 'Needs attention first' },
  { id: 'engaged', label: 'Most engaged first' },
  { id: 'name',    label: 'Name (A–Z)' },
  { id: 'stage',   label: 'Life stage' },
];

/* "Roll call" bucket order per sort — worst-first for "needs
   attention", best-first for "most engaged". Inactive women always
   read last since they're excluded from the ministry-health numbers. */
const LEDGER_GROUP_ORDER = {
  needs:   ['at-risk', 'fading', 'steady', 'engaged', 'inactive'],
  engaged: ['engaged', 'steady', 'fading', 'at-risk', 'inactive'],
};

export default function Engagement() {
  const navigate = useNavigate();
  const [women, , { loading }] = useUserStoreKey('womens:women', []);
  const [studies] = useBibleStudies();
  const [prayerGroups] = usePrayerGroups();
  const lifeStages = useLifeStages();
  const [pairs] = useUserStoreKey('womens:mentorship-pairs', []);
  const [newMoms] = useUserStoreKey('womens:new-moms', []);
  const [supportGroups] = useUserStoreKey('womens:support-groups', []);
  const [crisisCases] = useUserStoreKey('womens:crisis-cases', []);
  const [brunches] = useUserStoreKey('womens:brunches', []);
  const [fellowshipData] = useUserStoreKey('womens:fellowship', { gatherings: [] });

  const [retreats, setRetreats] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [mealTrains, setMealTrains] = useState([]);

  useEffect(() => {
    let alive = true;
    retreatService.getAll().then(res => { if (alive) setRetreats(Array.isArray(res?.data?.data) ? res.data.data : []); }).catch(() => {});
    conferenceService.getAll().then(res => { if (alive) setConferences(Array.isArray(res?.data?.data) ? res.data.data : []); }).catch(() => {});
    mealTrainService.getAll().then(res => { if (alive) setMealTrains(Array.isArray(res?.data?.data) ? res.data.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('needs');
  const [selectedId, setSelectedId] = useState(null);

  const list = Array.isArray(women) ? women : [];

  const ctx = useMemo(() => ({
    studies: Array.isArray(studies) ? studies : [],
    prayerGroups: Array.isArray(prayerGroups) ? prayerGroups : [],
    pairs: Array.isArray(pairs) ? pairs : [],
    newMoms: Array.isArray(newMoms) ? newMoms : [],
    supportGroups: Array.isArray(supportGroups) ? supportGroups : [],
    crisisCases: Array.isArray(crisisCases) ? crisisCases : [],
    brunches: Array.isArray(brunches) ? brunches : [],
    fellowshipGatherings: Array.isArray(fellowshipData?.gatherings) ? fellowshipData.gatherings : [],
    conferences, retreats, mealTrains,
  }), [studies, prayerGroups, pairs, newMoms, supportGroups, crisisCases, brunches, fellowshipData, conferences, retreats, mealTrains]);

  const rows = useMemo(() => list.map(w => ({ woman: w, eng: buildEngagement(w, ctx) })), [list, ctx]);

  /* Counts shown on each filter tab — always reflect the full roster,
     independent of the currently-selected filter (so switching tabs
     doesn't make the numbers jump around) and independent of search
     (search narrows the roster view, not what each tab means). */
  const filterCounts = useMemo(() => {
    const counts = { all: rows.length, engaged: 0, steady: 0, fading: 0, 'at-risk': 0, inactive: 0, care: 0, 'no-touch': 0 };
    for (const r of rows) {
      counts[r.eng.bucket] = (counts[r.eng.bucket] || 0) + 1;
      if (r.eng.careFlag) counts.care++;
      if (r.eng.lastTouch == null) counts['no-touch']++;
    }
    return counts;
  }, [rows]);

  const stageBreakdown = useMemo(() => {
    return lifeStages.stages.map(stage => {
      const inStage = rows.filter(r => r.woman.active !== false && r.woman.lifeStage === stage);
      const avg = inStage.length ? Math.round(inStage.reduce((n, r) => n + r.eng.score, 0) / inStage.length) : null;
      return { stage, count: inStage.length, avg };
    }).filter(s => s.count > 0);
  }, [rows, lifeStages.stages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter(r =>
        (r.woman.name || '').toLowerCase().includes(q) ||
        (r.woman.lifeStage || '').toLowerCase().includes(q) ||
        (r.woman.bibleStudy || '').toLowerCase().includes(q));
    }
    if (filter === 'care') out = out.filter(r => r.eng.careFlag);
    else if (filter === 'no-touch') out = out.filter(r => r.eng.lastTouch == null);
    else if (filter !== 'all') out = out.filter(r => r.eng.bucket === filter);

    const sorted = [...out];
    if (sortBy === 'needs') sorted.sort((a, b) => a.eng.score - b.eng.score);
    else if (sortBy === 'engaged') sorted.sort((a, b) => b.eng.score - a.eng.score);
    else if (sortBy === 'name') sorted.sort((a, b) => (a.woman.name || '').localeCompare(b.woman.name || ''));
    else if (sortBy === 'stage') sorted.sort((a, b) => (a.woman.lifeStage || '').localeCompare(b.woman.lifeStage || ''));
    return sorted;
  }, [rows, query, filter, sortBy]);

  const selected = useMemo(() => rows.find(r => r.woman.id === selectedId) || null, [rows, selectedId]);

  /* "Roll call" grouping — only meaningful when the roster isn't
     already isolated to one bucket by a filter, and only for the two
     sorts that are score-driven (name/stage sorts read better flat). */
  const groupedVisible = useMemo(() => {
    const order = LEDGER_GROUP_ORDER[sortBy];
    if (!order || filter !== 'all') return null;
    const byBucket = new Map();
    for (const r of visible) {
      const arr = byBucket.get(r.eng.bucket) || [];
      arr.push(r);
      byBucket.set(r.eng.bucket, arr);
    }
    return order
      .map(bucket => ({ bucket, rows: byBucket.get(bucket) || [] }))
      .filter(g => g.rows.length > 0);
  }, [visible, sortBy, filter]);

  return (
    <WomensShell
      title="Engagement & Attendance"
      icon="📊"
      subtitle="Trends across studies, events, and care — who is engaging, who has gone quiet, and where to invest next."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root eng-page">
      {loading && list.length === 0 ? (
        <div className="wa-directory-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">📊</div>
          <div className="app-empty-title">Nothing to track yet</div>
          <div className="app-empty-sub">
            Add women to the directory first — this page fills in on its own from
            Bible study attendance, events, mentorship, and care as you log them.
          </div>
          <button type="button" className="app-btn primary" onClick={() => navigate('/womens/all')}>
            Go to All Women →
          </button>
        </div>
      ) : (
        <div className="wa-directory">
          {stageBreakdown.length > 1 && <StageBreakdown rows={stageBreakdown} />}

          <div className="wa-controls">
            <div className="wa-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by name, life stage, Bible study…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
            <div className="wa-sort-wrap">
              <label className="wa-sort-lbl">Sort</label>
              <select className="wa-sort-sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
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
              >
                {f.label}
                <span className="eng-filter-count">{filterCounts[f.id] || 0}</span>
              </button>
            ))}
          </div>

          <div className="eng-split">
            <div className="eng-split-list">
              {visible.length === 0 ? (
                <div className="wa-directory-empty">
                  {query ? `No one matches "${query}".` : 'No one matches this filter.'}
                </div>
              ) : groupedVisible ? (
                <div className="eng-roster">
                  {groupedVisible.map(g => (
                    <div key={g.bucket} className="eng-ledger-group">
                      <div className="eng-ledger-divider" style={{ '--eng-ring': BUCKET_META[g.bucket].color }}>
                        <span className="eng-ledger-divider-icon">{BUCKET_META[g.bucket].icon}</span>
                        <span className="eng-ledger-divider-lbl">{BUCKET_META[g.bucket].label}</span>
                        <span className="eng-ledger-divider-count">{g.rows.length}</span>
                      </div>
                      {g.rows.map(r => (
                        <RosterRow
                          key={r.woman.id}
                          row={r}
                          selected={r.woman.id === selectedId}
                          onClick={() => setSelectedId(id => id === r.woman.id ? null : r.woman.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="eng-roster">
                  {visible.map(r => (
                    <RosterRow
                      key={r.woman.id}
                      row={r}
                      selected={r.woman.id === selectedId}
                      onClick={() => setSelectedId(id => id === r.woman.id ? null : r.woman.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className="eng-split-detail" aria-label={selected ? (selected.woman.name || 'Woman') : 'Engagement detail'}>
              {selected ? (
                <>
                  <div className="eng-detail-topbar">
                    <span className="eng-detail-topbar-lbl">Engagement detail</span>
                    <button type="button" className="eng-detail-close" onClick={() => setSelectedId(null)} aria-label="Close" title="Deselect">✕</button>
                  </div>
                  <DetailPanel
                    row={selected}
                    onOpenProfile={() => navigate(`/womens/all?woman=${selected.woman.id}`)}
                  />
                </>
              ) : (
                <div className="eng-detail-empty">
                  <div className="eng-detail-empty-icon">📊</div>
                  <div>Select someone from the roster to see their full engagement history.</div>
                </div>
              )}
            </aside>
          </div>
        </div>
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

function StageBreakdown({ rows }) {
  return (
    <div className="eng-stages">
      <div className="eng-stages-title">Engagement by life stage — where to invest next</div>
      <div className="eng-stage-list">
        {rows.map(s => (
          <div key={s.stage} className="eng-stage-row">
            <span className="eng-stage-lbl">{s.stage}</span>
            <div className="eng-stage-track">
              <div className="eng-stage-fill" style={{ width: `${s.avg}%`, background: scoreColor(s.avg) }} />
            </div>
            <span className="eng-stage-val">{s.avg}</span>
            <span className="eng-stage-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function scoreColor(score) {
  if (score >= 70) return BUCKET_META.engaged.color;
  if (score >= 45) return BUCKET_META.steady.color;
  if (score >= 20) return BUCKET_META.fading.color;
  return BUCKET_META['at-risk'].color;
}

function RosterRow({ row, selected, onClick }) {
  const { woman, eng } = row;
  const meta = BUCKET_META[eng.bucket];
  const initials = (woman.name || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const shownChannels = eng.channels.slice(0, 4);
  const extra = eng.channels.length - shownChannels.length;

  return (
    <button type="button" className={`eng-row${selected ? ' selected' : ''}`} onClick={onClick} style={{ '--eng-ring': meta.color }}>
      <span className="eng-row-avatar">{initials}</span>
      <span className="eng-row-main">
        <span className="eng-row-top">
          <span className="eng-row-name">{woman.name || '(no name)'}</span>
          {woman.lifeStage && <span className="eng-row-stage">{woman.lifeStage}</span>}
        </span>
        <span className="eng-row-meta">
          <span className="eng-row-touch">{fmtRelative(eng.daysSince)}</span>
          {eng.channels.length > 0 && (
            <span className="eng-row-channels">
              {shownChannels.map(c => <span key={c.key} className="eng-chip" title={c.label}>{c.icon}</span>)}
              {extra > 0 && <span className="eng-chip eng-chip-more">+{extra}</span>}
            </span>
          )}
        </span>
      </span>
      <span className="eng-row-score">
        <span className="eng-bucket-pill" style={{ color: meta.color, borderColor: meta.color }}>{meta.icon} {meta.label}</span>
        <span className="eng-score-n">{eng.score}</span>
      </span>
    </button>
  );
}

function ScoreRing({ score, color }) {
  return (
    <div className="eng-ring" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(196,19,60,0.12) 0deg)` }}>
      <div className="eng-ring-inner">
        <span className="eng-ring-n">{score}</span>
        <span className="eng-ring-lbl">/ 100</span>
      </div>
    </div>
  );
}

function DetailPanel({ row, onOpenProfile }) {
  const { woman, eng } = row;
  const meta = BUCKET_META[eng.bucket];
  return (
    <>
      <div className="eng-detail-head">
        <ScoreRing score={eng.score} color={meta.color} />
        <div className="eng-detail-head-text">
          <h2 className="eng-detail-name">{woman.name || '(no name)'}</h2>
          {woman.lifeStage && <div className="eng-detail-stage">{woman.lifeStage}</div>}
          <span className="eng-bucket-pill" style={{ color: meta.color, borderColor: meta.color }}>{meta.icon} {meta.label}</span>
        </div>
      </div>

      <div className="wa-view-row">
        <span className="wa-view-lbl">Last touch</span>
        <span className="wa-view-val">{fmtRelative(eng.daysSince)}{eng.lastTouch ? ` · ${fmtDate(eng.lastTouch)}` : ''}</span>
      </div>
      <div className="wa-view-row">
        <span className="wa-view-lbl">Ministry connections</span>
        <span className="wa-view-val">{eng.breadth}</span>
      </div>
      {eng.studyAttendancePct != null && (
        <div className="wa-view-row">
          <span className="wa-view-lbl">Bible study attendance</span>
          <span className="wa-view-val">{eng.studyAttendancePct}%</span>
        </div>
      )}
      {woman.careStatus === 'flagged' && (
        <div className="wa-view-row">
          <span className="wa-view-lbl">Pastoral care</span>
          <span className="wa-view-val">🚩 Flagged{woman.careNote ? ` — ${woman.careNote}` : ''}</span>
        </div>
      )}

      <button type="button" className="app-btn eng-profile-btn" onClick={onOpenProfile}>
        Open full profile →
      </button>

      <section className="ys-section">
        <h3 className="ys-section-title">Where she's connected</h3>
        <div className="ys-section-body">
          {eng.channels.length === 0 ? (
            <div className="eng-empty-note">No standing connections logged yet — a Bible study, prayer group, mentorship pairing, or care touchpoint will show up here.</div>
          ) : (
            <ul className="eng-channel-list">
              {eng.channels.map((c, i) => (
                <li key={c.key + i} className="eng-channel-row">
                  <span className="eng-channel-icon">{c.icon}</span>
                  <span className="eng-channel-text">
                    <span className="eng-channel-label">{c.label}</span>
                    {c.detail && <span className="eng-channel-detail">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Touchpoint history</h3>
        <div className="ys-section-body">
          {eng.touchpoints.length === 0 ? (
            <div className="eng-empty-note">Nothing logged yet.</div>
          ) : (
            <ul className="wa-timeline">
              {eng.touchpoints.slice(0, 25).map((t, i) => (
                <li key={i} className="wa-timeline-row">
                  <span className="wa-timeline-dot" />
                  <span className="wa-timeline-body">
                    <span className="wa-timeline-date">{fmtDate(t.date)} · {t.source}</span>
                    <span className="wa-timeline-content">{t.icon} {t.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
