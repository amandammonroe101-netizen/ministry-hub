import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import {
  CLAUDE_API_KEY_STORAGE_KEY,
  INVOLVEMENT_BRIEFING_KEY,
  isBriefingFresh,
  generateInvolvementBriefing,
  friendlyErrorMessage,
} from '../../lib/involvementBriefing';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center/.wa-slide,
   .wa-card-grid/.wa-stats-bar/.wa-controls) from AllWomen.css and the
   .ys-* form primitives from the Youth roster — same pattern the rest
   of Women's follows (see Mentorship.jsx). */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './MyInvolvement.css';
import './BibleStudyBuilder.css';

/* ─────────────────────────────────────────────────────────────
   Women's → My Involvement

   Personal to the signed-in woman — NOT the ministry-wide rosters
   (those live under Discipleship / Mentorship Pairs / Bible Studies,
   which coordinators manage for everyone). This page is her own view
   of her mentors, mentees, studies/groups, and anything she leads or
   hosts. Kept as one flat entry list tagged by `kind` so adding a
   fifth or sixth category later (the user expects more to come to
   mind) is just one more entry in KINDS below — no new storage key,
   no new page.

   Storage: useUserStoreKey('womens:my-involvement', [])
   ───────────────────────────────────────────────────────────── */

const CADENCES = [
  { id: 'weekly',   label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly',  label: 'Monthly' },
  { id: 'one-time', label: 'One-time / seasonal' },
  { id: 'custom',   label: 'Custom / as needed' },
];
const cadenceLabel = (id) => (CADENCES.find(c => c.id === id) || CADENCES[1]).label;

const STATUS_META = {
  active:    { label: 'Active',    icon: '🟢' },
  paused:    { label: 'Paused',    icon: '⏸️' },
  completed: { label: 'Completed', icon: '✅' },
};
const STATUS_ORDER = ['active', 'paused', 'completed'];

const STUDY_ROLES   = ['Attending', 'Co-Leading', 'Leading'];
const LEADING_ROLES = ['Leading', 'Co-Leading', 'Hosting', 'Helping'];
const LEADING_TYPES = ['Conference', 'Retreat', 'Bible Study', 'Class', 'Event', 'Other'];

/* One config entry per tab. `fields` drives what the detail form
   shows and how it's labeled; `hasCheckIns` turns on the meeting log
   (useful for 1-on-1 relationships, not for events). */
const KINDS = [
  {
    id: 'mentor', label: 'My Mentors', icon: '🌳', accent: '#a78bfa',
    nameLabel: "Her name", nameHint: 'Who is investing in you',
    fields: ['focusArea', 'cadence', 'nextDate'],
    hasCheckIns: true,
    empty: { title: 'No mentors added yet', sub: "Add the people who are pouring into you — focus area, how often you meet, and your next check-in." },
  },
  {
    id: 'mentee', label: 'My Mentees', icon: '🌱', accent: '#2dd4bf',
    nameLabel: 'Her name', nameHint: 'Who you are investing in',
    fields: ['focusArea', 'cadence', 'nextDate'],
    hasCheckIns: true,
    empty: { title: 'No mentees added yet', sub: "Add the people you're discipling — same details, plus a place to log check-ins." },
  },
  {
    id: 'study', label: 'Studies & Groups', icon: '📖', accent: '#fbbf24',
    nameLabel: 'Study / group name', nameHint: "A Bible study, community group, or prayer group",
    fields: ['role:study', 'meetingDay', 'focusArea:topic', 'nextDate:meeting'],
    hasCheckIns: false,
    empty: { title: 'No studies or groups yet', sub: "Add the studies or groups you're part of — whether you attend or lead them." },
  },
  {
    id: 'leading', label: 'Leading & Hosting', icon: '🎤', accent: '#f472b6',
    nameLabel: 'Title', nameHint: 'Something you organize, lead, or host',
    fields: ['category', 'role:leading', 'recurring', 'nextDate:date'],
    hasCheckIns: false,
    empty: { title: 'Nothing here yet', sub: "Conferences you're organizing, a study you lead, a retreat you're hosting — anything where you're the one out front." },
  },
];
const kindConf = (id) => KINDS.find(k => k.id === id) || KINDS[0];

/* Two special, non-entry tabs bookend the flat KINDS list: an overview
   dashboard (default landing tab) and the Bible Study Builder, which
   has its own storage shape (studies + sessions, not flat entries). */
const DASHBOARD_TAB = { id: 'dashboard', label: 'Dashboard', icon: '📊', accent: '#38bdf8' };
const STUDIO_TAB = { id: 'bible-studio', label: 'Bible Study Builder', icon: '🎚️', accent: '#f59e0b' };
const ALL_TABS = [DASHBOARD_TAB, ...KINDS, STUDIO_TAB];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

/* Urgency grouping for the My Mentors and My Mentees tabs — buckets by
   how soon the next check-in is due (or by status), so the tab reads
   as "who do I need to reach out to" instead of a flat directory. */
const daysUntil = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
};
const URGENCY_GROUPS = [
  { id: 'overdue',   label: 'Overdue',       icon: '🔴' },
  { id: 'dueSoon',   label: 'Due this week', icon: '🟡' },
  { id: 'onTrack',   label: 'On track',      icon: '🟢' },
  { id: 'paused',    label: 'Paused',        icon: '⏸️' },
  { id: 'completed', label: 'Completed',     icon: '✅' },
];
const urgencyBucket = (e) => {
  const status = e.status || 'active';
  if (status === 'paused') return 'paused';
  if (status === 'completed') return 'completed';
  if (!e.nextDate) return 'onTrack';
  const days = daysUntil(e.nextDate);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'dueSoon';
  return 'onTrack';
};

/* Same bucket ids as URGENCY_GROUPS (so urgencyBucket/tone-* CSS can be
   reused as-is), just relabeled for one-time events/conferences instead
   of ongoing 1-on-1 relationships. Used by the Leading & Hosting tab. */
const EVENT_GROUPS = [
  { id: 'overdue',   label: 'Past due',  icon: '🔴' },
  { id: 'dueSoon',   label: 'This week', icon: '🟡' },
  { id: 'onTrack',   label: 'Upcoming',  icon: '🟢' },
  { id: 'paused',    label: 'On hold',   icon: '⏸️' },
  { id: 'completed', label: 'Completed', icon: '✅' },
];

/* Short countdown chip for a dated card ("in 3d", "Today", "5d ago") —
   gives the Leading & Hosting grid an at-a-glance sense of urgency
   without needing to open every card. */
const countdownLabel = (dateStr) => {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `in ${days}d`;
};
const countdownTone = (dateStr) => {
  const days = daysUntil(dateStr);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return 'upcoming';
};

/* Studies & Groups: role-first grouping (leading it vs. just being in
   it are different mental categories) plus a lightweight per-card
   urgency badge — same signal as the buckets above, shown inline on
   the card instead of as its own section header. */
const LEAD_STUDY_ROLES = ['Leading', 'Co-Leading'];
const STUDY_URGENCY = {
  overdue: { icon: '🔴', label: 'Overdue',   tone: 'overdue' },
  dueSoon: { icon: '🟡', label: 'This week', tone: 'dueSoon' },
  onTrack: { icon: '🟢', label: 'On track',  tone: 'onTrack' },
};
const studyUrgency = (entry) => {
  if ((entry.status || 'active') !== 'active' || !entry.nextDate) return null;
  const days = daysUntil(entry.nextDate);
  if (days < 0) return STUDY_URGENCY.overdue;
  if (days <= 7) return STUDY_URGENCY.dueSoon;
  return STUDY_URGENCY.onTrack;
};
const sortStudyEntries = (arr) => [...arr].sort((a, b) => {
  const aDone = (a.status || 'active') !== 'active';
  const bDone = (b.status || 'active') !== 'active';
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (!a.nextDate && !b.nextDate) return (b.createdAt || 0) - (a.createdAt || 0);
  if (!a.nextDate) return 1;
  if (!b.nextDate) return -1;
  return a.nextDate.localeCompare(b.nextDate);
});

const DEFAULT_ENTRY = (kind) => ({
  id:         makeId('mi'),
  kind,
  name:       '',
  role:       kind === 'study' ? 'Attending' : kind === 'leading' ? 'Leading' : '',
  category:   '',
  focusArea:  '',
  cadence:    'biweekly',
  meetingDay: '',
  recurring:  false,
  nextDate:   '',
  status:     'active',
  notes:      '',
  meetings:   [],
  createdAt:  Date.now(),
});

export default function MyInvolvement() {
  const [entries, setEntries, { loading }] = useUserStoreKey('womens:my-involvement', []);
  const list = Array.isArray(entries) ? entries : [];
  const [bibleStudies, setBibleStudies] = useUserStoreKey('womens:bible-studies', []);
  const [searchParams, setSearchParams] = useSearchParams();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' — for the detail slide-over
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [studioTargetId, setStudioTargetId] = useState(null);
  const isEntryTab = KINDS.some(k => k.id === tab);

  /* Cross-page deep link: ?tab=bible-studio&plan=ID jumps straight to
     the Bible Study Builder tab and selects that plan (e.g. from Life
     Stages' Meeting Groups "Open →" button). */
  useEffect(() => {
    const targetTab = searchParams.get('tab');
    if (!targetTab) return;
    setTab(targetTab);
    const planId = searchParams.get('plan');
    if (planId) setStudioTargetId(planId);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conf = kindConf(tab);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(e => e.kind === tab)
      .filter(e => statusFilter === 'all' || (e.status || 'active') === statusFilter)
      .filter(e => !q || (e.name || '').toLowerCase().includes(q) || (e.focusArea || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [list, tab, query, statusFilter]);
  const selected = useMemo(() => list.find(e => e.id === selectedId) || null, [list, selectedId]);

  // Reset search/filter when switching tabs so a stale query doesn't hide
  // everything in the newly selected section.
  useEffect(() => { setQuery(''); setStatusFilter('all'); }, [tab]);

  const counts = useMemo(() => {
    const c = {};
    KINDS.forEach(k => { c[k.id] = list.filter(e => e.kind === k.id).length; });
    // Only count a woman's OWN Builder plans (no `label`) — ministry-run
    // studies share this array but carry a `label` and belong on the
    // Bible Studies page's count instead.
    c['bible-studio'] = (Array.isArray(bibleStudies) ? bibleStudies : []).filter(s => !(s.label || '').trim()).length;
    return c;
  }, [list, bibleStudies]);

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

  const addEntry = () => {
    const e = DEFAULT_ENTRY(tab);
    setEntries(prev => [...(prev || []), e]);
    setSelectedId(e.id);
    setMode('edit'); // a brand-new blank entry has nothing to "view" yet
  };

  const openEntry = (id) => {
    setSelectedId(id);
    setMode('view');
  };

  const openEntryEdit = (id) => {
    setSelectedId(id);
    setMode('edit');
  };

  const updateEntry = (id, patch) => {
    setEntries(prev => (prev || []).map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const removeEntry = (id) => {
    setEntries(prev => (prev || []).filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const logMeeting = (id, { date, notes }) => {
    if (!date) return;
    const current = list.find(e => e.id === id);
    if (!current) return;
    const entry = { id: makeId('mm'), date, notes: (notes || '').trim(), createdAt: new Date().toISOString() };
    updateEntry(id, { meetings: [entry, ...(Array.isArray(current.meetings) ? current.meetings : [])] });
  };
  const removeMeeting = (id, meetingId) => {
    const current = list.find(e => e.id === id);
    if (!current) return;
    updateEntry(id, { meetings: (current.meetings || []).filter(m => m.id !== meetingId) });
  };

  return (
    <WomensShell
      title="My Involvement"
      icon="💗"
      subtitle="Your own place in the ministry — mentors and mentees, the studies and groups you're part of, and anything you lead or host."
      actions={
        isEntryTab ? (
          <button type="button" className="wms-btn primary" onClick={addEntry}>
            ✦ Add {conf.label.replace(/^My /, '').replace(/s$/, '')}
          </button>
        ) : null
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="mi-root">
        <div className="mi-tabs" role="tablist" aria-label="My Involvement sections">
          {ALL_TABS.map(k => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={tab === k.id}
              className={`mi-tab ${tab === k.id ? 'on' : ''}`}
              style={tab === k.id ? { '--mi-accent': k.accent } : undefined}
              onClick={() => setTab(k.id)}
            >
              <span>{k.icon}</span> {k.label}
              {counts[k.id] > 0 && <span className="mi-tab-count">{counts[k.id]}</span>}
            </button>
          ))}
        </div>

        {tab === 'dashboard' ? (
          <Dashboard list={list} counts={counts} bibleStudies={bibleStudies} onJumpTab={setTab} />
        ) : tab === 'bible-studio' ? (
          <BibleStudyBuilder studies={bibleStudies} setStudies={setBibleStudies} targetId={studioTargetId} onTargetHandled={() => setStudioTargetId(null)} />
        ) : (
          <>
            {counts[tab] > 0 && (
              <div className="mi-controls">
                <div className="mi-search-wrap">
                  <span aria-hidden="true">🔍</span>
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={`Search by name${conf.fields.some(f => f.startsWith('focusArea')) ? ' or focus area' : ''}…`}
                  />
                  {query && (
                    <button type="button" className="mi-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
                  )}
                </div>
                <div className="mi-filter-row">
                  {['all', ...STATUS_ORDER].map(id => (
                    <button
                      key={id}
                      type="button"
                      className={`mi-filter-chip${statusFilter === id ? ' on' : ''}`}
                      onClick={() => setStatusFilter(id)}
                    >
                      {id === 'all' ? 'All' : `${STATUS_META[id].icon} ${STATUS_META[id].label}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && list.length === 0 ? (
              <div className="wa-directory-empty" style={{ flex: 1 }}>Loading…</div>
            ) : counts[tab] === 0 ? (
              <div className="wa-empty app-empty">
                <div className="app-empty-icon">{conf.icon}</div>
                <div className="app-empty-title">{conf.empty.title}</div>
                <div className="app-empty-sub">{conf.empty.sub}</div>
                <button type="button" className="app-btn primary" onClick={addEntry}>
                  ✦ Add your first one
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="wa-directory-empty" style={{ flex: 1 }}>
                No matches for this search or filter.
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="mi-filter-chip" onClick={() => { setQuery(''); setStatusFilter('all'); }}>
                    Clear filters
                  </button>
                </div>
              </div>
            ) : conf.hasCheckIns ? (
              <UrgencyList
                entries={visible}
                conf={conf}
                onOpen={openEntry}
                onQuickCheckIn={logMeeting}
              />
            ) : tab === 'study' ? (
              <StudyGroupSections entries={visible} conf={conf} onOpen={openEntry} onEdit={openEntryEdit} />
            ) : tab === 'leading' ? (
              <LeadingSections entries={visible} conf={conf} onOpen={openEntry} onEdit={openEntryEdit} />
            ) : (
              <div className="mi-card-grid">
                {visible.map(e => (
                  <EntryCard key={e.id} entry={e} conf={conf} onClick={() => openEntry(e.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isEntryTab && selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label={kindConf(selected.kind).label}>
            <button
              className="wa-slide-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              {mode === 'view' ? (
                <EntryView
                  entry={selected}
                  conf={kindConf(selected.kind)}
                  onEdit={() => setMode('edit')}
                />
              ) : (
                <EntryDetail
                  entry={selected}
                  conf={kindConf(selected.kind)}
                  onChange={(patch) => updateEntry(selected.id, patch)}
                  onLogMeeting={(m) => logMeeting(selected.id, m)}
                  onRemoveMeeting={(mid) => removeMeeting(selected.id, mid)}
                  onDelete={() => removeEntry(selected.id)}
                  onDone={() => setMode('view')}
                />
              )}
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

/* ── Dashboard tab ───────────────────────────────────────────── */
function Dashboard({ list, counts, bibleStudies, onJumpTab }) {
  const [apiKey] = useUserStoreKey(CLAUDE_API_KEY_STORAGE_KEY, '');
  const [cached, setCached] = useUserStoreKey(INVOLVEMENT_BRIEFING_KEY, null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const fresh = isBriefingFresh(cached);
  // Only this woman's own Builder plans (no `label`) — ministry-run
  // studies share this array but belong to the Bible Studies page.
  const studiesCount = (Array.isArray(bibleStudies) ? bibleStudies : []).filter(s => !(s.label || '').trim()).length;

  const upcoming = useMemo(() => {
    return (list || [])
      .filter(e => e.nextDate && (e.status || 'active') !== 'completed')
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .slice(0, 6);
  }, [list]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateInvolvementBriefing({ apiKey, entries: list, bibleStudies });
      setCached(result);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mi-dash">
      <div className="mi-dash-stats">
        <StatCard icon="🌳" label="Mentors" value={counts.mentor || 0} accent="#a78bfa" onClick={() => onJumpTab('mentor')} />
        <StatCard icon="🌱" label="Mentees" value={counts.mentee || 0} accent="#2dd4bf" onClick={() => onJumpTab('mentee')} />
        <StatCard icon="📖" label="Studies & groups" value={counts.study || 0} accent="#fbbf24" onClick={() => onJumpTab('study')} />
        <StatCard icon="🎤" label="Leading & hosting" value={counts.leading || 0} accent="#f472b6" onClick={() => onJumpTab('leading')} />
        <StatCard icon="🎚️" label="Bible studies" value={studiesCount} accent="#f59e0b" onClick={() => onJumpTab('bible-studio')} />
      </div>

      <div className="mi-dash-grid">
        <section className="mi-dash-card mi-dash-briefing">
          <div className="mi-dash-card-head">
            <h3>✦ Your AI briefing</h3>
            <button
              type="button"
              className="mi-dash-refresh"
              onClick={generate}
              disabled={generating || !apiKey}
            >
              {generating ? 'Thinking…' : fresh ? 'Refresh' : 'Generate'}
            </button>
          </div>
          {!apiKey ? (
            <p className="mi-dash-empty-note">
              Add a Claude API key in <Link to="/settings">Settings</Link> to turn this on.
            </p>
          ) : error ? (
            <p className="mi-dash-error">{error}</p>
          ) : generating ? (
            <p className="mi-dash-loading">Reading through your involvement…</p>
          ) : cached?.text ? (
            <p className="mi-dash-briefing-text">{cached.text}</p>
          ) : (
            <p className="mi-dash-empty-note">Generate a short daily summary of where you stand today.</p>
          )}
        </section>

        <section className="mi-dash-card">
          <div className="mi-dash-card-head"><h3>🗓 Coming up</h3></div>
          {upcoming.length === 0 ? (
            <p className="mi-dash-empty-note">Nothing on the calendar yet.</p>
          ) : (
            <ul className="mi-dash-upcoming">
              {upcoming.map(e => (
                <li key={e.id}>
                  <span className="mi-dash-up-icon">{kindConf(e.kind).icon}</span>
                  <span className="mi-dash-up-name">{e.name || '(unnamed)'}</span>
                  <span className="mi-dash-up-date">{e.nextDate}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent, onClick }) {
  return (
    <button type="button" className="mi-stat-card" style={{ '--mi-accent': accent }} onClick={onClick}>
      <span className="mi-stat-icon">{icon}</span>
      <span className="mi-stat-value">{value}</span>
      <span className="mi-stat-label">{label}</span>
    </button>
  );
}

/* ── Bible Study Builder tab ──────────────────────────────────── */
const STUDY_STATUS = ['draft', 'active', 'completed'];
const STUDY_STATUS_META = {
  draft:     { label: 'Draft',     icon: '✏️' },
  active:    { label: 'Active',    icon: '🟢' },
  completed: { label: 'Completed', icon: '✅' },
};

const makeStudy = () => ({
  id: makeId('bs'),
  title: '',
  theme: '',
  status: 'draft',
  sessions: [],
  prep: {},
  createdAt: Date.now(),
});
const makeSession = (n) => ({
  id: makeId('bss'),
  title: `Session ${n}`,
  scripture: '',
  questions: '',
  notes: '',
});

/* Leader prep checklist — everything a leader typically sorts out
   before a series starts, grouped the way she'd actually think
   through it. Lives at the study level (not per-session) since it's
   done once for the whole series. `type: 'check'` fields drive the
   prep progress bar; text/select/date/textarea fields are for-the-
   record only and don't count toward it. */
const PREP_GROUPS = [
  {
    id: 'planning', title: 'Planning & structure',
    fields: [
      { key: 'meetingDay',    label: 'Meeting day',      type: 'text',   placeholder: 'e.g. Tuesdays' },
      { key: 'meetingTime',   label: 'Meeting time',     type: 'text',   placeholder: 'e.g. 7:00pm' },
      { key: 'format',        label: 'Format',           type: 'select', options: ['In-person', 'Virtual', 'Hybrid'] },
      { key: 'weeks',         label: '# of weeks',       type: 'text',   placeholder: 'e.g. 8' },
      { key: 'startDate',     label: 'Start date',       type: 'date' },
      { key: 'endDate',       label: 'End date',         type: 'date' },
      { key: 'maxGroupSize',  label: 'Max group size',   type: 'text',   placeholder: 'e.g. 12' },
      { key: 'coLeader',      label: 'Co-leader',        type: 'text',   placeholder: 'Name' },
      { key: 'coldRead',      label: 'Read through the whole study first', type: 'check' },
    ],
  },
  {
    id: 'materials', title: 'Materials & logistics',
    fields: [
      { key: 'booksOrdered',       label: 'Books / workbooks ordered', type: 'check' },
      { key: 'supplyList',         label: 'Supply list ready (Bibles, journals, pens)', type: 'check' },
      { key: 'roomBooked',         label: 'Room / space booked', type: 'check' },
      { key: 'childcareArranged',  label: 'Childcare arranged', type: 'check' },
      { key: 'snacksPlanned',      label: 'Snacks / drinks planned', type: 'check' },
      { key: 'budgetSet',          label: 'Budget set', type: 'check' },
    ],
  },
  {
    id: 'recruitment', title: 'Recruitment & communication',
    fields: [
      { key: 'inviteSent',           label: 'Invite / sign-up sent', type: 'check' },
      { key: 'contactList',          label: 'Contact list built', type: 'check' },
      { key: 'recapMethod',          label: 'How absentees get recaps', type: 'text', placeholder: 'e.g. group text after each session' },
      { key: 'welcomeMessageSent',   label: 'Welcome message sent', type: 'check' },
    ],
  },
  {
    id: 'culture', title: 'Group culture & expectations',
    fields: [
      { key: 'groundRules',          label: 'Ground rules set', type: 'check' },
      { key: 'prayerRequestMethod',  label: 'Prayer request method', type: 'text', placeholder: 'e.g. spoken aloud, cards, group chat' },
      { key: 'icebreakerPlanned',    label: 'Icebreaker planned for week 1', type: 'check' },
      { key: 'hostRotation',         label: 'Host rotation planned', type: 'check' },
    ],
  },
  {
    id: 'leader', title: "Leader's personal prep",
    fields: [
      { key: 'prayedForGroup',         label: 'Prayed over the group by name', type: 'check' },
      { key: 'introMaterialReviewed',  label: 'Worked through intro / overview material', type: 'check' },
      { key: 'personalExpectations',   label: 'Personal hopes & expectations', type: 'textarea', placeholder: 'What do you hope God will do this season…' },
    ],
  },
];
const PREP_CHECK_KEYS = PREP_GROUPS.flatMap(g => g.fields.filter(f => f.type === 'check').map(f => f.key));
const prepProgress = (prep) => {
  const p = prep || {};
  const done = PREP_CHECK_KEYS.filter(k => p[k]).length;
  const total = PREP_CHECK_KEYS.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};

/* A session counts as "built" once it has scripture, questions, and
   notes — drives the progress bars on both the track list and stage. */
const sessionComplete = (session) =>
  Boolean((session.scripture || '').trim() && (session.questions || '').trim() && (session.notes || '').trim());
const studyProgress = (study) => {
  const sessions = Array.isArray(study.sessions) ? study.sessions : [];
  const total = sessions.length;
  const done = sessions.filter(sessionComplete).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};

function BibleStudyBuilder({ studies, setStudies, targetId, onTargetHandled }) {
  /* This tab only manages a woman's OWN plans (identified by a
     `title`, no `label`) — ministry-run studies from the Bible
     Studies page share this same Firestore array but carry a
     `label` instead, and are managed over there. Filtering here
     keeps them from bleeding into "Your studies" as confusing
     "Untitled study" entries (see womensListsConfig.js docs). */
  const list = (Array.isArray(studies) ? studies : []).filter(s => !(s.label || '').trim());
  const [selectedId, setSelectedId] = useState(list[0]?.id || null);
  const selected = list.find(s => s.id === selectedId) || null;
  const sessions = selected?.sessions || [];

  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id || null);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  /* Cross-page deep link: a target plan id passed down from
     MyInvolvement (from a ?plan=ID URL) selects that specific
     Builder plan once it's found in the list. */
  useEffect(() => {
    if (!targetId) return;
    if (!list.some(s => s.id === targetId)) return;
    setSelectedId(targetId);
    onTargetHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, list]);

  /* Jumping to a different study resets the outline selection back to
     its first session, in view mode. */
  useEffect(() => {
    setSelectedSessionId(selected?.sessions?.[0]?.id || null);
    setIsEditingSession(false);
  }, [selected?.id]);

  const addStudy = () => {
    const s = makeStudy();
    setStudies(prev => [...(prev || []), s]);
    setSelectedId(s.id);
  };
  const updateStudy = (id, patch) => {
    setStudies(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const deleteStudy = (id) => {
    setStudies(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addSession = () => {
    if (!selected) return;
    const current = Array.isArray(selected.sessions) ? selected.sessions : [];
    const session = makeSession(current.length + 1);
    updateStudy(selected.id, { sessions: [...current, session] });
    setSelectedSessionId(session.id);
    setIsEditingSession(true);
  };
  const updateSession = (sessionId, patch) => {
    if (!selected) return;
    const next = (selected.sessions || []).map(sess => sess.id === sessionId ? { ...sess, ...patch } : sess);
    updateStudy(selected.id, { sessions: next });
  };
  const removeSession = (sessionId) => {
    if (!selected) return;
    const next = (selected.sessions || []).filter(sess => sess.id !== sessionId);
    updateStudy(selected.id, { sessions: next });
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(next[0]?.id || null);
      setIsEditingSession(false);
    }
  };
  const moveSession = (fromIndex, toIndex) => {
    if (!selected || fromIndex === toIndex) return;
    const next = [...(selected.sessions || [])];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateStudy(selected.id, { sessions: next });
  };

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || null;
  const selectedSessionIndex = sessions.findIndex(s => s.id === selectedSessionId);
  const progress = selected ? studyProgress(selected) : null;

  return (
    <div className="bsb-root">
      <aside className="bsb-console">
        <div className="bsb-console-head">
          <span className="bsb-console-title">Your studies</span>
          <button type="button" className="bsb-new-btn" onClick={addStudy}>＋ New</button>
        </div>

        {list.length === 0 ? (
          <div className="bsb-console-empty">
            No studies yet — start writing your first one.
          </div>
        ) : (
          <ul className="bsb-track-list">
            {list.map(s => {
              const meta = STUDY_STATUS_META[s.status] || STUDY_STATUS_META.draft;
              const sProgress = studyProgress(s);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`bsb-track${selectedId === s.id ? ' on' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="bsb-track-led" aria-hidden="true" />
                    <span className="bsb-track-body">
                      <span className="bsb-track-title">{s.title || 'Untitled study'}</span>
                      <span className="bsb-track-sub">{sProgress.total} session{sProgress.total === 1 ? '' : 's'} · {meta.icon} {meta.label}</span>
                      {sProgress.total > 0 && (
                        <span className="bsb-track-progress" aria-hidden="true">
                          <span className="bsb-track-progress-fill" style={{ width: `${sProgress.pct}%` }} />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {!selected ? (
        <div className="bsb-empty-stage">
          <div className="bsb-empty-stage-icon">🎚️</div>
          <div className="bsb-empty-stage-title">Nothing queued up</div>
          <div className="bsb-empty-stage-sub">Create a study to start building sessions — scripture, questions, and teaching notes.</div>
          <button type="button" className="bsb-new-btn" onClick={addStudy}>＋ New study</button>
        </div>
      ) : (
        <div className="bsb-stage">
          <div className="bsb-stage-head">
            <input
              type="text"
              className="bsb-title-input"
              value={selected.title}
              onChange={e => updateStudy(selected.id, { title: e.target.value })}
              placeholder="Study title…"
            />
            <div className="bsb-stage-controls">
              <select
                className="bsb-status-select"
                value={selected.status || 'draft'}
                onChange={e => updateStudy(selected.id, { status: e.target.value })}
              >
                {STUDY_STATUS.map(id => (
                  <option key={id} value={id}>{STUDY_STATUS_META[id].icon} {STUDY_STATUS_META[id].label}</option>
                ))}
              </select>
              <button type="button" className="bsb-del-btn" onClick={() => deleteStudy(selected.id)}>🗑</button>
            </div>
          </div>

          <input
            type="text"
            className="bsb-theme-input"
            value={selected.theme || ''}
            onChange={e => updateStudy(selected.id, { theme: e.target.value })}
            placeholder="Theme / series — e.g. Book of James, Walking in Freedom…"
          />

          <SeriesPrep
            prep={selected.prep}
            onChange={(patch) => updateStudy(selected.id, { prep: { ...(selected.prep || {}), ...patch } })}
          />

          {progress && progress.total > 0 && (
            <div className="bsb-progress">
              <span className="bsb-progress-track">
                <span className="bsb-progress-fill" style={{ width: `${progress.pct}%` }} />
              </span>
              <span className="bsb-progress-label">{progress.done} of {progress.total} sessions built</span>
            </div>
          )}

          <div className="bsb-sessions-head">
            <span className="bsb-control-lbl">Sessions ({sessions.length})</span>
            <button type="button" className="bsb-add-session-btn" onClick={addSession}>＋ Add session</button>
          </div>

          {sessions.length === 0 ? (
            <div className="bsb-console-empty">No sessions yet — add your first one.</div>
          ) : (
            <div className="bsb-workspace">
              <SessionOutline
                sessions={sessions}
                selectedId={selectedSessionId}
                dragIndex={dragIndex}
                onDragIndexChange={setDragIndex}
                onSelect={(id) => { setSelectedSessionId(id); setIsEditingSession(false); }}
                onReorder={moveSession}
              />
              <SessionDetail
                session={selectedSession}
                index={selectedSessionIndex}
                editing={isEditingSession}
                onToggleEdit={() => setIsEditingSession(v => !v)}
                onChange={(patch) => selectedSession && updateSession(selectedSession.id, patch)}
                onRemove={() => selectedSession && removeSession(selectedSession.id)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Collapsible "before the series starts" checklist — sits above the
   session outline since it's filled out once for the whole study, not
   per session. Kept separate from the sessions progress bar (its own
   mini progress in the header) so "prep done" and "sessions built"
   don't get blended into one confusing number. */
function SeriesPrep({ prep, onChange }) {
  const [open, setOpen] = useState(false);
  const p = prep || {};
  const { done, total, pct } = prepProgress(p);

  return (
    <div className={`bsb-prep${open ? ' open' : ''}`}>
      <button type="button" className="bsb-prep-head" onClick={() => setOpen(o => !o)}>
        <span className="bsb-prep-head-icon" aria-hidden="true">📋</span>
        <span className="bsb-prep-head-title">Series prep</span>
        <span className="bsb-prep-mini-track" aria-hidden="true">
          <span className="bsb-prep-mini-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="bsb-prep-count">{done}/{total}</span>
        <span className="bsb-prep-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="bsb-prep-body">
          {PREP_GROUPS.map(g => (
            <PrepGroup key={g.id} title={g.title} fields={g.fields} prep={p} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrepGroup({ title, fields, prep, onChange }) {
  return (
    <div className="bsb-prep-group">
      <div className="bsb-prep-group-title">{title}</div>
      <div className="bsb-prep-group-fields">
        {fields.map(f => {
          if (f.type === 'check') {
            return (
              <label key={f.key} className="bsb-check">
                <input
                  type="checkbox"
                  checked={!!prep[f.key]}
                  onChange={e => onChange({ [f.key]: e.target.checked })}
                />
                <span>{f.label}</span>
              </label>
            );
          }
          if (f.type === 'select') {
            return (
              <label key={f.key} className="bsb-field bsb-prep-field">
                <span className="bsb-field-lbl">{f.label}</span>
                <select
                  className="bsb-inp"
                  value={prep[f.key] || ''}
                  onChange={e => onChange({ [f.key]: e.target.value })}
                >
                  <option value="">—</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            );
          }
          if (f.type === 'textarea') {
            return (
              <label key={f.key} className="bsb-field bsb-prep-field bsb-prep-field-wide">
                <span className="bsb-field-lbl">{f.label}</span>
                <textarea
                  className="bsb-inp bsb-textarea"
                  rows={3}
                  value={prep[f.key] || ''}
                  onChange={e => onChange({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              </label>
            );
          }
          return (
            <label key={f.key} className="bsb-field bsb-prep-field">
              <span className="bsb-field-lbl">{f.label}</span>
              <input
                type={f.type === 'date' ? 'date' : 'text'}
                className="bsb-inp"
                value={prep[f.key] || ''}
                onChange={e => onChange({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* Left half of the split stage — a reorderable outline of session
   titles (native HTML5 drag-and-drop, no extra dependency) with a
   status dot showing which sessions are fully built. */
function SessionOutline({ sessions, selectedId, dragIndex, onDragIndexChange, onSelect, onReorder }) {
  return (
    <ul className="bsb-outline">
      {sessions.map((sess, i) => {
        const complete = sessionComplete(sess);
        return (
          <li
            key={sess.id}
            className={`bsb-outline-row${dragIndex === i ? ' dragging' : ''}`}
            draggable
            onDragStart={() => onDragIndexChange(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              onDragIndexChange(null);
            }}
            onDragEnd={() => onDragIndexChange(null)}
          >
            <button
              type="button"
              className={`bsb-outline-item${selectedId === sess.id ? ' on' : ''}`}
              onClick={() => onSelect(sess.id)}
            >
              <span className="bsb-outline-handle" aria-hidden="true">⠿</span>
              <span className="bsb-outline-num">{i + 1}</span>
              <span className="bsb-outline-title">{sess.title || `Session ${i + 1}`}</span>
              <span className={`bsb-outline-dot${complete ? ' done' : ''}`} title={complete ? 'Built' : 'Needs content'} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* Right half of the split stage — the selected session, read-only by
   default with an Edit button, so scanning a study doesn't mean every
   field is an open text box. */
function SessionDetail({ session, index, editing, onToggleEdit, onChange, onRemove }) {
  if (!session) {
    return (
      <div className="bsb-detail-empty">
        <div className="bsb-empty-stage-icon">📝</div>
        <div className="bsb-empty-stage-sub">Select a session from the outline to view or edit it.</div>
      </div>
    );
  }

  const questionLines = (session.questions || '').split('\n').map(q => q.trim()).filter(Boolean);

  return (
    <div className="bsb-detail">
      <div className="bsb-detail-head">
        <span className="bsb-session-num">{index + 1}</span>
        {editing ? (
          <input
            type="text"
            className="bsb-session-title-input"
            value={session.title}
            onChange={e => onChange({ title: e.target.value })}
            placeholder={`Session ${index + 1}`}
          />
        ) : (
          <h3 className="bsb-detail-title">{session.title || `Session ${index + 1}`}</h3>
        )}
        <div className="bsb-detail-actions">
          <button type="button" className="bsb-edit-toggle" onClick={onToggleEdit}>
            {editing ? '✓ Done' : '✎ Edit'}
          </button>
          <button type="button" className="bsb-remove-session-btn" onClick={onRemove}>🗑</button>
        </div>
      </div>

      {editing ? (
        <div className="bsb-session-body">
          <label className="bsb-field">
            <span className="bsb-field-lbl">Scripture</span>
            <input
              type="text"
              className="bsb-inp"
              value={session.scripture || ''}
              onChange={e => onChange({ scripture: e.target.value })}
              placeholder="e.g. James 1:2-8"
            />
          </label>
          <label className="bsb-field">
            <span className="bsb-field-lbl">Discussion questions</span>
            <textarea
              className="bsb-inp bsb-textarea"
              rows={5}
              value={session.questions || ''}
              onChange={e => onChange({ questions: e.target.value })}
              placeholder="One per line…"
            />
          </label>
          <label className="bsb-field">
            <span className="bsb-field-lbl">Teaching notes</span>
            <textarea
              className="bsb-inp bsb-textarea"
              rows={5}
              value={session.notes || ''}
              onChange={e => onChange({ notes: e.target.value })}
              placeholder="Key points, illustrations, application…"
            />
          </label>
        </div>
      ) : (
        <div className="bsb-view-body">
          <div className="bsb-view-block">
            <span className="bsb-field-lbl">Scripture</span>
            {session.scripture ? (
              <span className="bsb-view-scripture">{session.scripture}</span>
            ) : (
              <span className="bsb-view-empty">Not set yet</span>
            )}
          </div>
          <div className="bsb-view-block">
            <span className="bsb-field-lbl">Discussion questions</span>
            {questionLines.length ? (
              <ul className="bsb-view-list">
                {questionLines.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            ) : (
              <span className="bsb-view-empty">No questions yet</span>
            )}
          </div>
          <div className="bsb-view-block">
            <span className="bsb-field-lbl">Teaching notes</span>
            {session.notes ? (
              <p className="bsb-view-notes">{session.notes}</p>
            ) : (
              <span className="bsb-view-empty">No notes yet</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mentors & mentees: urgency-grouped list ───────────────────
   Buckets entries by how soon their next check-in is due (instead of
   a flat grid) and lets a check-in be logged inline on the card, so
   the tab doubles as an action list, not just a directory. Used for
   both the My Mentors and My Mentees tabs — anything with hasCheckIns. */
function UrgencyList({ entries, conf, onOpen, onQuickCheckIn }) {
  const groups = useMemo(() => {
    const buckets = {};
    URGENCY_GROUPS.forEach(g => { buckets[g.id] = []; });
    entries.forEach(e => { buckets[urgencyBucket(e)].push(e); });
    Object.values(buckets).forEach(arr => arr.sort((a, b) => {
      if (!a.nextDate && !b.nextDate) return (b.createdAt || 0) - (a.createdAt || 0);
      if (!a.nextDate) return 1;
      if (!b.nextDate) return -1;
      return a.nextDate.localeCompare(b.nextDate);
    }));
    return buckets;
  }, [entries]);

  return (
    <div className="mi-checkin-groups">
      {URGENCY_GROUPS.map(g => {
        const items = groups[g.id];
        if (!items.length) return null;
        return (
          <section key={g.id} className={`mi-urgency-group tone-${g.id}`}>
            <div className="mi-urgency-head">
              <span className="mi-urgency-icon" aria-hidden="true">{g.icon}</span>
              <span className="mi-urgency-label">{g.label}</span>
              <span className="mi-urgency-count">{items.length}</span>
            </div>
            <div className="mi-card-grid">
              {items.map(e => (
                <UrgencyCard
                  key={e.id}
                  entry={e}
                  conf={conf}
                  onOpen={() => onOpen(e.id)}
                  onQuickCheckIn={(m) => onQuickCheckIn(e.id, m)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* Most recent check-in date, regardless of logging order (a past date
   can be backfilled after a more recent one). */
const lastContactDate = (meetings) => {
  if (!Array.isArray(meetings) || meetings.length === 0) return null;
  return meetings.reduce((latest, m) => (m.date && m.date > latest ? m.date : latest), meetings[0].date || null);
};

function UrgencyCard({ entry, conf, onOpen, onQuickCheckIn }) {
  const status = entry.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const meetings = Array.isArray(entry.meetings) ? entry.meetings : [];
  const lastContact = lastContactDate(meetings);
  const [showQuick, setShowQuick] = useState(false);
  const [qDate, setQDate] = useState(today());
  const [qNotes, setQNotes] = useState('');

  const submitQuick = () => {
    if (!qDate) return;
    onQuickCheckIn({ date: qDate, notes: qNotes });
    setQDate(today());
    setQNotes('');
    setShowQuick(false);
  };

  return (
    <div className="mi-card" style={{ '--mi-accent': conf.accent }}>
      <span className={`mi-card-stripe tone-${status}`} />

      <button type="button" className="mi-card-open" onClick={onOpen}>
        <div className="mi-card-top">
          <span className="mi-card-icon" aria-hidden="true">{conf.icon}</span>
          <span className="mi-card-name">{entry.name || `(unnamed ${conf.nameLabel.toLowerCase()})`}</span>
        </div>

        {entry.focusArea && <div className="mi-card-focus">🎯 {entry.focusArea}</div>}

        <div className="mi-card-pills">
          <span className="mi-pill">{cadenceLabel(entry.cadence)}</span>
          <span className={`mi-pill status-${status}`}>{meta.icon} {meta.label}</span>
        </div>

        <div className="mi-card-foot">
          <span>{meetings.length} check-in{meetings.length === 1 ? '' : 's'} logged</span>
          <span className="mi-card-foot-dates">
            {lastContact && <span className="mi-card-last">Last: {lastContact}</span>}
            {entry.nextDate && <span>Next: {entry.nextDate}</span>}
          </span>
        </div>
      </button>

      {showQuick ? (
        <div className="mi-quick-checkin">
          <input
            type="date"
            className="mi-quick-date"
            value={qDate}
            onChange={e => setQDate(e.target.value)}
          />
          <input
            type="text"
            className="mi-quick-note"
            value={qNotes}
            onChange={e => setQNotes(e.target.value)}
            placeholder="What did you talk about, pray for, work on…"
          />
          <div className="mi-quick-actions">
            <button type="button" className="mi-quick-cancel" onClick={() => setShowQuick(false)}>Cancel</button>
            <button type="button" className="mi-quick-save" disabled={!qDate} onClick={submitQuick}>✓ Log check-in</button>
          </div>
        </div>
      ) : (
        <button type="button" className="mi-quick-toggle" onClick={() => setShowQuick(true)}>
          🤝 Log check-in
        </button>
      )}
    </div>
  );
}

/* ── Directory card ─────────────────────────────────────────── */
function EntryCard({ entry, conf, onClick }) {
  const status = entry.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const meetingCount = Array.isArray(entry.meetings) ? entry.meetings.length : 0;

  return (
    <button type="button" className="mi-card" onClick={onClick} style={{ '--mi-accent': conf.accent }}>
      <span className={`mi-card-stripe tone-${status}`} />

      <div className="mi-card-top">
        <span className="mi-card-icon" aria-hidden="true">{conf.icon}</span>
        <span className="mi-card-name">{entry.name || `(unnamed ${conf.nameLabel.toLowerCase()})`}</span>
      </div>

      {(entry.category || entry.role) && (
        <div className="mi-card-sub">
          {[entry.category, entry.role].filter(Boolean).join(' · ')}
        </div>
      )}
      {entry.focusArea && <div className="mi-card-focus">🎯 {entry.focusArea}</div>}
      {entry.meetingDay && <div className="mi-card-focus">🗓 {entry.meetingDay}</div>}

      <div className="mi-card-pills">
        {conf.hasCheckIns && <span className="mi-pill">{cadenceLabel(entry.cadence)}</span>}
        <span className={`mi-pill status-${status}`}>{meta.icon} {meta.label}</span>
      </div>

      <div className="mi-card-foot">
        <span>{conf.hasCheckIns ? `${meetingCount} check-in${meetingCount === 1 ? '' : 's'} logged` : ' '}</span>
        <span>{entry.nextDate ? `Next: ${entry.nextDate}` : ''}</span>
      </div>
    </button>
  );
}

/* ── Studies & Groups: role-grouped layout ─────────────────────
   Splits the flat list into "Leading & Co-Leading" and "Attending"
   sections (leading it is a different job than attending it), sorts
   each by how soon the next meeting is, and renders every card in
   read-only view mode with its own Edit button — browsing the tab
   never drops you into an open text box. */
function StudyGroupSections({ entries, conf, onOpen, onEdit }) {
  const leading = useMemo(
    () => sortStudyEntries(entries.filter(e => LEAD_STUDY_ROLES.includes(e.role))),
    [entries]
  );
  const attending = useMemo(
    () => sortStudyEntries(entries.filter(e => !LEAD_STUDY_ROLES.includes(e.role))),
    [entries]
  );

  return (
    <div className="mi-checkin-groups">
      {leading.length > 0 && (
        <section className="mi-urgency-group">
          <div className="mi-urgency-head">
            <span className="mi-urgency-icon" aria-hidden="true">🎤</span>
            <span className="mi-urgency-label">Leading &amp; Co-Leading</span>
            <span className="mi-urgency-count">{leading.length}</span>
          </div>
          <div className="mi-card-grid">
            {leading.map(e => (
              <StudyGroupCard key={e.id} entry={e} conf={conf} onOpen={() => onOpen(e.id)} onEdit={() => onEdit(e.id)} />
            ))}
          </div>
        </section>
      )}
      {attending.length > 0 && (
        <section className="mi-urgency-group">
          <div className="mi-urgency-head">
            <span className="mi-urgency-icon" aria-hidden="true">🙋</span>
            <span className="mi-urgency-label">Attending</span>
            <span className="mi-urgency-count">{attending.length}</span>
          </div>
          <div className="mi-card-grid">
            {attending.map(e => (
              <StudyGroupCard key={e.id} entry={e} conf={conf} onOpen={() => onOpen(e.id)} onEdit={() => onEdit(e.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* Read-only card for a single study/group — clicking the body opens
   the full view-mode detail (notes, etc.); the footer Edit button
   jumps straight into edit mode. Leading/co-leading entries get a
   quick link out to the ministry-wide Bible Studies roster, since
   that's where attendance for a study she runs actually lives. */
function StudyGroupCard({ entry, conf, onOpen, onEdit }) {
  const status = entry.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const urgency = studyUrgency(entry);
  const isLeading = LEAD_STUDY_ROLES.includes(entry.role);

  return (
    <div className="mi-card" style={{ '--mi-accent': conf.accent }}>
      <span className={`mi-card-stripe tone-${status}`} />

      <button type="button" className="mi-card-open" onClick={onOpen}>
        <div className="mi-card-top">
          <span className="mi-card-icon" aria-hidden="true">{conf.icon}</span>
          <span className="mi-card-name">{entry.name || `(unnamed ${conf.nameLabel.toLowerCase()})`}</span>
        </div>

        {entry.role && <div className="mi-card-sub">{entry.role}</div>}
        {entry.meetingDay && <div className="mi-card-focus">🗓 {entry.meetingDay}</div>}
        {entry.focusArea && <div className="mi-card-focus">📖 {entry.focusArea}</div>}

        <div className="mi-card-pills">
          <span className={`mi-pill status-${status}`}>{meta.icon} {meta.label}</span>
          {urgency && <span className={`mi-pill urgency-${urgency.tone}`}>{urgency.icon} {urgency.label}</span>}
        </div>

        <div className="mi-card-foot">
          <span>{entry.nextDate ? `Next: ${entry.nextDate}` : 'No date set'}</span>
          {isLeading && (
            <Link to="/womens/bible-studies" className="mi-card-roster-link" onClick={e => e.stopPropagation()}>
              Ministry roster →
            </Link>
          )}
        </div>
      </button>

      <button type="button" className="mi-quick-toggle" onClick={onEdit}>
        ✎ Edit
      </button>
    </div>
  );
}

/* ── Leading & Hosting: recurring vs. one-time, timeline-grouped ──
   A weekly class she leads and a one-off retreat aren't the same kind
   of commitment, so recurring entries get pulled into their own
   section up top. Everything else — conferences, retreats, one-time
   events — buckets by how soon it's coming up (same urgencyBucket
   logic as the check-in tabs), with a countdown chip on each card and
   an Edit button so browsing never opens a text box by accident. */
function LeadingSections({ entries, conf, onOpen, onEdit }) {
  const recurring = useMemo(() => [...entries.filter(e => e.recurring)].sort((a, b) => {
    const aDone = (a.status || 'active') !== 'active';
    const bDone = (b.status || 'active') !== 'active';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  }), [entries]);

  const oneTime = useMemo(() => entries.filter(e => !e.recurring), [entries]);

  const groups = useMemo(() => {
    const buckets = {};
    EVENT_GROUPS.forEach(g => { buckets[g.id] = []; });
    oneTime.forEach(e => { buckets[urgencyBucket(e)].push(e); });
    Object.values(buckets).forEach(arr => arr.sort((a, b) => {
      if (!a.nextDate && !b.nextDate) return (b.createdAt || 0) - (a.createdAt || 0);
      if (!a.nextDate) return 1;
      if (!b.nextDate) return -1;
      return a.nextDate.localeCompare(b.nextDate);
    }));
    return buckets;
  }, [oneTime]);

  return (
    <div className="mi-checkin-groups">
      {recurring.length > 0 && (
        <section className="mi-urgency-group">
          <div className="mi-urgency-head">
            <span className="mi-urgency-icon" aria-hidden="true">🔁</span>
            <span className="mi-urgency-label">Recurring commitments</span>
            <span className="mi-urgency-count">{recurring.length}</span>
          </div>
          <div className="mi-card-grid">
            {recurring.map(e => (
              <LeadingCard key={e.id} entry={e} conf={conf} onOpen={() => onOpen(e.id)} onEdit={() => onEdit(e.id)} />
            ))}
          </div>
        </section>
      )}

      {EVENT_GROUPS.map(g => {
        const items = groups[g.id];
        if (!items.length) return null;
        return (
          <section key={g.id} className={`mi-urgency-group tone-${g.id}`}>
            <div className="mi-urgency-head">
              <span className="mi-urgency-icon" aria-hidden="true">{g.icon}</span>
              <span className="mi-urgency-label">{g.label}</span>
              <span className="mi-urgency-count">{items.length}</span>
            </div>
            <div className="mi-card-grid">
              {items.map(e => (
                <LeadingCard key={e.id} entry={e} conf={conf} onOpen={() => onOpen(e.id)} onEdit={() => onEdit(e.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LeadingCard({ entry, conf, onOpen, onEdit }) {
  const status = entry.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;

  return (
    <div className="mi-card" style={{ '--mi-accent': conf.accent }}>
      <span className={`mi-card-stripe tone-${status}`} />

      <button type="button" className="mi-card-open" onClick={onOpen}>
        <div className="mi-card-top">
          <span className="mi-card-icon" aria-hidden="true">{conf.icon}</span>
          <span className="mi-card-name">{entry.name || `(unnamed ${conf.nameLabel.toLowerCase()})`}</span>
        </div>

        {(entry.category || entry.role) && (
          <div className="mi-card-sub">{[entry.category, entry.role].filter(Boolean).join(' · ')}</div>
        )}

        <div className="mi-card-pills">
          <span className={`mi-pill status-${status}`}>{meta.icon} {meta.label}</span>
          {entry.recurring && <span className="mi-pill mi-pill-recurring">🔁 Recurring</span>}
        </div>

        <div className="mi-card-foot">
          <span>{entry.nextDate ? `${entry.recurring ? 'Next' : 'Date'}: ${entry.nextDate}` : 'No date set'}</span>
          {entry.nextDate && (
            <span className={`mi-countdown tone-${countdownTone(entry.nextDate)}`}>{countdownLabel(entry.nextDate)}</span>
          )}
        </div>
      </button>

      <button type="button" className="mi-quick-toggle" onClick={onEdit}>
        ✎ Edit
      </button>
    </div>
  );
}

/* Shared by EntryView and EntryDetail so field labels ("Focus area" vs
   "Current book / topic", "Next check-in" vs "Next meeting") stay in
   sync between the two modes. */
const fieldLabelFor = (conf, key, fallback) => {
  const f = conf.fields.find(f => f === key || f.startsWith(key + ':'));
  if (!f) return fallback;
  const suffix = f.split(':')[1];
  if (key === 'focusArea') return suffix === 'topic' ? 'Current book / topic' : 'Focus area';
  if (key === 'nextDate')  return suffix === 'meeting' ? 'Next meeting' : suffix === 'date' ? 'Date' : 'Next check-in';
  return fallback;
};
const hasFieldFor = (conf, key) => conf.fields.some(f => f === key || f.startsWith(key + ':'));

/* ── Detail slide-over: read-only view ──────────────────────────
   Opened by default when a card is clicked, so scanning someone's
   info doesn't drop you straight into an open text box — matches the
   view-first pattern used by the Bible Study Builder's SessionDetail. */
function EntryView({ entry, conf, onEdit }) {
  const status = entry.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const meetings = Array.isArray(entry.meetings) ? entry.meetings : [];

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mi-detail-icon">{conf.icon}</span>
          <h2 className="ys-form-title">{entry.name || conf.nameLabel}</h2>
        </div>
        <button type="button" className="app-btn primary" onClick={onEdit}>✎ Edit</button>
      </div>

      <Section title="Details">
        <ViewRow label="Status" value={`${meta.icon} ${meta.label}`} />
        {hasFieldFor(conf, 'category') && <ViewRow label="Type" value={entry.category} />}
        {(hasFieldFor(conf, 'role:study') || hasFieldFor(conf, 'role:leading')) && (
          <ViewRow label="Your role" value={entry.role} />
        )}
        {hasFieldFor(conf, 'recurring') && (
          <ViewRow label="Frequency" value={entry.recurring ? 'Recurring commitment' : 'One-time event'} />
        )}
        {hasFieldFor(conf, 'meetingDay') && <ViewRow label="Meeting day & time" value={entry.meetingDay} />}
        {hasFieldFor(conf, 'focusArea') && (
          <ViewRow label={fieldLabelFor(conf, 'focusArea', 'Focus area')} value={entry.focusArea} />
        )}
        {conf.hasCheckIns && <ViewRow label="Meeting cadence" value={cadenceLabel(entry.cadence)} />}
        {hasFieldFor(conf, 'nextDate') && (
          <ViewRow label={fieldLabelFor(conf, 'nextDate', 'Next check-in')} value={entry.nextDate} />
        )}
      </Section>

      {conf.hasCheckIns && (
        <Section title={`Check-in log (${meetings.length})`}>
          {meetings.length === 0 ? (
            <div className="mi-view-empty">No check-ins logged yet.</div>
          ) : (
            <ul className="wa-comm-list">
              {meetings.map(m => (
                <li key={m.id} className="wa-comm-row">
                  <span className="wa-comm-icon" aria-hidden="true">🤝</span>
                  <span className="wa-comm-body">
                    <span className="wa-comm-date">{m.date}</span>
                    <span className="wa-comm-note">{m.notes || 'Met'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Notes">
        {entry.notes ? (
          <p className="mi-view-notes">{entry.notes}</p>
        ) : (
          <div className="mi-view-empty">Nothing noted yet.</div>
        )}
      </Section>
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="mi-view-row">
      <span className="mi-view-lbl">{label}</span>
      <span className="mi-view-val">{value}</span>
    </div>
  );
}

/* ── Detail / edit slide-over ─────────────────────────────────── */
function EntryDetail({ entry, conf, onChange, onLogMeeting, onRemoveMeeting, onDelete, onDone }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const meetings = Array.isArray(entry.meetings) ? entry.meetings : [];

  const set = (field) => (e) => {
    const val = e?.target ? e.target.value : e;
    onChange({ [field]: val });
  };

  const setStatus = (e) => {
    const status = e.target.value;
    onChange({ status });
  };

  const hasField = (key) => hasFieldFor(conf, key);
  const fieldLabel = (key, fallback) => fieldLabelFor(conf, key, fallback);

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mi-detail-icon">{conf.icon}</span>
          <h2 className="ys-form-title">{entry.name || conf.nameLabel}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="app-btn ghost" onClick={onDone}>✓ Done</button>
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

      <Section title="Details">
        <Field label={conf.nameLabel}>
          <input
            type="text"
            className="ys-inp"
            value={entry.name || ''}
            onChange={set('name')}
            placeholder={conf.nameHint}
          />
        </Field>

        {hasField('category') && (
          <Field label="Type">
            <input
              type="text"
              className="ys-inp"
              list="mi-leading-types"
              value={entry.category || ''}
              onChange={set('category')}
              placeholder="e.g. Conference, Retreat, Class, Event…"
            />
            <datalist id="mi-leading-types">
              {LEADING_TYPES.map(t => <option key={t} value={t} />)}
            </datalist>
          </Field>
        )}

        {hasField('role:study') && (
          <Field label="Your role">
            <select className="ys-inp" value={entry.role || 'Attending'} onChange={set('role')}>
              {STUDY_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}
        {hasField('role:leading') && (
          <Field label="Your role">
            <select className="ys-inp" value={entry.role || 'Leading'} onChange={set('role')}>
              {LEADING_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}

        {hasField('recurring') && (
          <Field label="Frequency">
            <select
              className="ys-inp"
              value={entry.recurring ? 'recurring' : 'one-time'}
              onChange={e => onChange({ recurring: e.target.value === 'recurring' })}
            >
              <option value="one-time">One-time event</option>
              <option value="recurring">Recurring commitment</option>
            </select>
          </Field>
        )}

        {hasField('meetingDay') && (
          <Field label="Meeting day & time">
            <input
              type="text"
              className="ys-inp"
              value={entry.meetingDay || ''}
              onChange={set('meetingDay')}
              placeholder="e.g. Tuesdays, 7:00pm"
            />
          </Field>
        )}

        {hasField('focusArea') && (
          <Field label={fieldLabel('focusArea', 'Focus area')}>
            <input
              type="text"
              className="ys-inp"
              value={entry.focusArea || ''}
              onChange={set('focusArea')}
              placeholder={conf.id === 'study' ? 'e.g. Book of James, Love & Respect…' : 'e.g. New believer discipleship, marriage, motherhood…'}
            />
          </Field>
        )}

        <Row>
          {conf.hasCheckIns && (
            <Field label="Meeting cadence">
              <select className="ys-inp" value={entry.cadence || 'biweekly'} onChange={set('cadence')}>
                {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Status">
            <select className="ys-inp" value={entry.status || 'active'} onChange={setStatus}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
        </Row>

        {hasField('nextDate') && (
          <Field label={fieldLabel('nextDate', 'Next check-in')}>
            <input type="date" className="ys-inp" value={entry.nextDate || ''} onChange={set('nextDate')} />
          </Field>
        )}
      </Section>

      {conf.hasCheckIns && (
        <CheckInSection meetings={meetings} onLog={onLogMeeting} onRemove={onRemoveMeeting} />
      )}

      <Section title="Notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="Anything worth remembering — prayer requests, progress, ideas for next time…"
          value={entry.notes || ''}
          onChange={set('notes')}
        />
      </Section>
    </form>
  );
}

/* ── Check-in / meeting log (mentors + mentees only) ────────── */
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
        className="ys-add-btn"
        style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }}
        disabled={!date}
        onClick={log}
      >
        ＋ Log check-in
      </button>

      {meetings.length === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: 4 }}>
          No check-ins logged yet.
        </div>
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
