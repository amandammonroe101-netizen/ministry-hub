import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import {
  useBibleStudies, makeListItem, useLifeStageInfo,
  MEETING_DAYS, MEETING_TIMES, MEETING_FREQUENCIES,
} from './womensListsConfig';
/* Rose-gold pass: this page now mirrors Life Stages' / Support Groups'
   actual shape — a status sidebar + detail dashboard, not a photo-
   directory grid — so it shares LifeStages.css's .wls-* panel/sidebar/
   roster system directly (same embossed rose-gold surfaces, same
   cursive headings) plus the .ys-* form primitives from the Youth
   roster. Only the study card + tab-specific bits below are their
   own classes, prefix .wbs-* */
import '../youth/AllStudents.css';
import './LifeStages.css';
import './BibleStudies.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Bible Studies

   Status plays the same role here that a life STAGE plays on
   that page, and that a group TYPE plays on Support Groups: a
   status sidebar on the left (All / Active / Upcoming / On Break /
   Completed), a stats dashboard for whichever one is selected, a
   search-filtered card grid of the studies in it, and — when a
   card is clicked — a detail panel beside it (not a full-page
   drill-in) with four tabs:
     Overview  — meeting info, dates, cap, childcare, description
     Sessions  — one entry per week: date/topic, discussion
                 questions, leader notes, and a per-session
                 attendance checklist against the live roster
     Roster    — same roster, with each woman's attendance
                 fraction across logged sessions
     Materials — resource links (homework/PDFs) + free-form notes
                 for cost/logistics

   Roster is mostly derived, not a separate list: it's built from
   the shared 'womens:women' directory by matching each woman's
   `bibleStudy` field (a label, not an id — see womensListsConfig.js)
   against this study's title, UNION'd with anyone whose Life Stages
   `lifeStageGroup` is a Meeting Group linked to this study via
   `bibleStudyId` (see LifeStages.jsx) — joining that Meeting Group
   automatically sets her bibleStudy field too, so the two stay in
   sync, but the union is a safety net for data that predates the
   link. Women who land on the roster ONLY through a linked group
   (not a direct bibleStudy match) are flagged `_viaGroup` so the
   Roster tab can show "via {group}" instead of a Remove button —
   removing her really belongs on Life Stages. The Roster tab also
   supports adding a woman directly (search + add), which just sets
   her bibleStudy field to this study's label.

   Renaming a study cascades the label onto every woman currently
   assigned to it, so the roster count never silently goes stale;
   deleting a study does NOT touch women's records, so her profile
   stays legible either way.

   Storage: 'womens:bible-studies' (this page + the study picker on
   All Women both read/write the same key — see womensListsConfig.js).
   Sessions and materials live inline on each study record, not a
   separate key — they only ever make sense in that study's context.
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  active:    { label: 'Active',    icon: '🟢', blurb: 'Meeting now, on the current schedule.' },
  upcoming:  { label: 'Upcoming',  icon: '🕓', blurb: 'Set to start soon — still filling in details.' },
  break:     { label: 'On Break',  icon: '⏸️', blurb: 'Paused for now, picking back up later.' },
  completed: { label: 'Completed', icon: '✅', blurb: 'Finished studies, kept here for reference.' },
};
const STATUS_ORDER = ['active', 'upcoming', 'break', 'completed'];
const ALL_META = { label: 'All Studies', icon: '📚', blurb: 'Every Bible study group, across every status.' };
const SIDEBAR_ORDER = ['all', ...STATUS_ORDER];
const metaFor = (status) => (status === 'all' ? ALL_META : (STATUS_META[status] || STATUS_META.active));

const TABS = [
  { key: 'overview',  label: 'Overview',  icon: 'ℹ️' },
  { key: 'sessions',  label: 'Sessions',  icon: '📅' },
  { key: 'roster',    label: 'Roster',    icon: '👥' },
  { key: 'materials', label: 'Materials', icon: '📦' },
];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_STUDY = (status) => ({
  ...makeListItem(''),
  leader:        '',
  status:        status || 'active',
  day:           '',
  time:          '',
  location:      '',
  frequency:     '',
  book:          '',
  description:   '',
  startDate:     '',
  endDate:       '',
  cap:           '',
  childcare:     false,
  sessions:      [],   // [{ id, date, topic, questions, notes, attendance: { [womanId]: true } }]
  materials:     [],   // [{ id, title, url }]
  materialsNotes: '',
});

const norm = (s) => (s || '').trim().toLowerCase();

export default function BibleStudies() {
  const [studies, setStudies] = useBibleStudies();
  const [women, setWomen] = useUserStoreKey('womens:women', []);
  const [lifeStageInfo] = useLifeStageInfo();
  const list = Array.isArray(studies) ? studies : [];
  const womenList = Array.isArray(women) ? women : [];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [activeStatus, setActiveStatus] = useState('active');
  const [selectedId, setSelectedId] = useState(null);
  /* View/Edit mode for the currently-selected study's detail panel —
     lifted up here (rather than local state inside StudyDetailPanel)
     so double-clicking a study card can jump STRAIGHT into edit mode
     in one action (select + edit), not just select-then-edit. Resets
     to 'view' whenever a different study is selected. */
  const [detailMode, setDetailMode] = useState('view'); // 'view' | 'edit'
  const [query, setQuery] = useState('');

  /* Flattens Life Stages' per-stage Meeting Groups (see
     LifeStages.jsx — stored per stage name under useLifeStageInfo())
     into one flat list, purely to find which groups are linked to a
     given study via `bibleStudyId` — see rosterFor() below. This is
     a read-only mirror; all group editing still happens on Life
     Stages, same convention as AllWomen.jsx's own allStageGroups. */
  const allGroups = useMemo(() => {
    const info = lifeStageInfo && typeof lifeStageInfo === 'object' ? lifeStageInfo : {};
    const out = [];
    for (const stage of Object.keys(info)) {
      const groups = Array.isArray(info[stage]?.groups) ? info[stage].groups : [];
      out.push(...groups);
    }
    return out;
  }, [lifeStageInfo]);

  /* Cross-page deep link: ?study=ID auto-selects that study (e.g.
     from Life Stages' Meeting Groups "Open →" button). Jumps the
     status filter to "all" so the study is guaranteed to be visible
     regardless of its actual status. */
  useEffect(() => {
    if (list.length === 0) return;
    const studyId = searchParams.get('study');
    if (!studyId) return;
    const s = list.find(x => x.id === studyId);
    if (s) { setSelectedId(s.id); setActiveStatus('all'); }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const rosterFor = (study) => {
    const label = norm(study.label);
    /* Meeting groups (Life Stages) linked to this exact study via
       bibleStudyId count as roster sources too — see the doc block
       at the top of this file. */
    const linkedGroupLabels = new Map();
    for (const g of allGroups) {
      if (g.bibleStudyId === study.id && (g.label || '').trim()) linkedGroupLabels.set(norm(g.label), g.label);
    }
    if (!label && linkedGroupLabels.size === 0) return [];
    return womenList
      .filter(w => (label && norm(w.bibleStudy) === label) || linkedGroupLabels.has(norm(w.lifeStageGroup)))
      .map(w => {
        const direct = label && norm(w.bibleStudy) === label;
        const viaGroup = !direct && linkedGroupLabels.has(norm(w.lifeStageGroup)) ? linkedGroupLabels.get(norm(w.lifeStageGroup)) : null;
        return viaGroup ? { ...w, _viaGroup: viaGroup } : w;
      });
  };

  /* Manual roster add/remove — both just set/clear a woman's
     bibleStudy field directly (same field All Women's own Bible
     Study picker writes), so this is one more entry point into the
     exact same foreign-key-by-label data, not a parallel roster
     list. Removing someone who's on the roster ONLY via a linked
     Meeting Group isn't offered here (see RosterTab's `_viaGroup`
     check) — that membership belongs to Life Stages. */
  const addToRoster = (studyId, womanId) => {
    const study = list.find(s => s.id === studyId);
    if (!study || !(study.label || '').trim()) return;
    setWomen(prev => (prev || []).map(w => w.id === womanId ? { ...w, bibleStudy: study.label } : w));
  };
  const removeFromRoster = (womanId) => {
    setWomen(prev => (prev || []).map(w => w.id === womanId ? { ...w, bibleStudy: '' } : w));
  };

  const byStatus = useMemo(() => {
    const map = {};
    for (const s of STATUS_ORDER) map[s] = [];
    for (const s of list) {
      const status = s.status && map[s.status] ? s.status : 'active';
      map[status].push(s);
    }
    for (const s of STATUS_ORDER) map[s].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return map;
  }, [list]);

  const visibleStudies = useMemo(() => {
    let out = activeStatus === 'all' ? list : (byStatus[activeStatus] || []);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(s =>
        (s.label || '').toLowerCase().includes(q) ||
        (s.leader || '').toLowerCase().includes(q) ||
        (s.day || '').toLowerCase().includes(q) ||
        (s.book || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [list, byStatus, activeStatus, query]);

  const selected = useMemo(() => list.find(s => s.id === selectedId) || null, [list, selectedId]);

  const statusStats = (status) => {
    const source = status === 'all' ? list : (byStatus[status] || []);
    const total = source.length;
    const women = source.reduce((sum, s) => sum + rosterFor(s).length, 0);
    const noLeader = source.filter(s => !(s.leader || '').trim()).length;
    const noSessions = source.filter(s => !(Array.isArray(s.sessions) && s.sessions.length)).length;
    return { total, women, noLeader, noSessions };
  };

  const addStudy = (status) => {
    const s = DEFAULT_STUDY(status && status !== 'all' ? status : 'active');
    setStudies(prev => [...(prev || []), s]);
    setSelectedId(s.id);
    setActiveStatus(s.status);
    setDetailMode('edit'); // brand new study has nothing to view yet — open straight into the form
  };

  const updateStudy = (id, patch) => {
    const current = list.find(s => s.id === id);
    setStudies(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
    /* Renaming a study cascades the new label onto every woman
       whose bibleStudy currently matches the OLD label, so All
       Women and this page's roster count never drift apart. */
    if (current && patch.label !== undefined) {
      const oldLabel = (current.label || '').trim();
      const newLabel = (patch.label || '').trim();
      if (oldLabel && oldLabel !== newLabel) {
        setWomen(prev => (prev || []).map(w =>
          norm(w.bibleStudy) === norm(oldLabel) ? { ...w, bibleStudy: newLabel } : w
        ));
      }
    }
  };

  const removeStudy = (id) => {
    setStudies(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);
  const openRosterSearch = (label) => navigate(`/womens/all?q=${encodeURIComponent(label)}`);

  const selectStatus = (status) => {
    setActiveStatus(status);
    setSelectedId(null);
  };

  /* Single click selects/deselects a study and always opens it in
     read-only View mode; double-click selects it AND jumps straight
     into Edit mode in one action — the two entry points the task
     asked for ("view mode for everything, with an edit button when
     you double-click one"). */
  const selectStudy = (id) => {
    setSelectedId(prev => (prev === id ? null : id));
    setDetailMode('view');
  };
  const editStudy = (id) => {
    setSelectedId(id);
    setDetailMode('edit');
  };

  return (
    <WomensShell
      title="Bible Studies"
      icon="📚"
      subtitle="Bible study groups by status — leader, meeting day, current book/series, and roster. Select a study for sessions, attendance, and materials."
      actions={
        <button type="button" className="wms-btn primary" onClick={() => addStudy(activeStatus)}>
          ✦ New study
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root">
        {list.length === 0 ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">📚</div>
            <div className="app-empty-title">No Bible studies yet</div>
            <div className="app-empty-sub">
              Add each study group — leader, meeting day, current book — and
              women assigned to it in All Women will show up here automatically.
            </div>
            <button type="button" className="app-btn primary" onClick={() => addStudy('active')}>
              ✦ Add your first study
            </button>
          </div>
        ) : (
          <div className="wls-split">
            <StatusSidebar
              activeStatus={activeStatus}
              onSelect={selectStatus}
              countFor={(s) => s === 'all' ? list.length : (byStatus[s] || []).length}
            />

            <div className="wls-detail">
              <StatusDashboard status={activeStatus} stats={statusStats(activeStatus)} />

              <StudiesPanel
                studies={visibleStudies}
                selectedId={selectedId}
                onSelect={selectStudy}
                onEdit={editStudy}
                onAdd={() => addStudy(activeStatus)}
                rosterCountFor={(s) => rosterFor(s).length}
                query={query}
                onQueryChange={setQuery}
              />

              {selected && (
                <StudyDetailPanel
                  study={selected}
                  roster={rosterFor(selected)}
                  onChange={(patch) => updateStudy(selected.id, patch)}
                  onDelete={() => removeStudy(selected.id)}
                  onClose={() => setSelectedId(null)}
                  onOpenWoman={openWoman}
                  onOpenRoster={openRosterSearch}
                  mode={detailMode}
                  onSetMode={setDetailMode}
                  allWomen={womenList}
                  onAddToRoster={(womanId) => addToRoster(selected.id, womanId)}
                  onRemoveFromRoster={removeFromRoster}
                />
              )}
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

/* ── 1. Status sidebar — flat list, no sequence connectors ─────── */
function StatusSidebar({ activeStatus, onSelect, countFor }) {
  return (
    <nav className="wls-sidebar" aria-label="Bible study status">
      <div className="wls-sidebar-list">
        {SIDEBAR_ORDER.map(status => (
          <div key={status} className="wls-sidebar-item">
            <StatusNode
              status={status}
              active={status === activeStatus}
              count={countFor(status)}
              onClick={() => onSelect(status)}
            />
          </div>
        ))}
      </div>
    </nav>
  );
}

function StatusNode({ status, active, count, onClick }) {
  const meta = metaFor(status);
  return (
    <button type="button" className={`wls-node vertical${active ? ' on' : ''}`} onClick={onClick}>
      <span className="wls-node-icon">{meta.icon}</span>
      <span className="wls-node-name">{meta.label}</span>
      <span className="wls-node-count">{count}</span>
    </button>
  );
}

/* ── 2. Status dashboard — stats for the active status ─────────── */
function StatusDashboard({ status, stats }) {
  const meta = metaFor(status);
  return (
    <section className="wls-panel">
      <div className="wls-panel-hd">
        <span className="wls-panel-icon">{meta.icon}</span>
        <div>
          <h2 className="wls-panel-title">{meta.label}</h2>
          {meta.blurb && <div className="wls-panel-blurb">{meta.blurb}</div>}
        </div>
      </div>

      <div className="wls-stat-row wbs-stat-row">
        <div className="wls-stat"><span className="wls-stat-n">{stats.total}</span><span className="wls-stat-lbl">Studies</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.women}</span><span className="wls-stat-lbl">Women in a study</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.noLeader}</span><span className="wls-stat-lbl">No leader</span></div>
        <div className={`wls-stat is-days tier-${stats.noSessions > 0 ? 'warn' : 'good'}`}>
          <span className="wls-stat-n">{stats.noSessions}</span><span className="wls-stat-lbl">No sessions logged</span>
        </div>
      </div>
    </section>
  );
}

/* ── 3. Studies panel — search + grid + add ─────────────────────── */
function StudiesPanel({ studies, selectedId, onSelect, onEdit, onAdd, rosterCountFor, query, onQueryChange }) {
  return (
    <section className="wls-panel">
      <div className="wls-panel-row">
        <h3 className="wls-panel-subtitle">Studies</h3>
        <button type="button" className="ys-add-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onAdd}>＋ Add study</button>
      </div>

      <div className="wbs-search">
        <span aria-hidden="true">🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search by title, leader, day, book…"
        />
        {query && <button type="button" className="wbs-search-clear" onClick={() => onQueryChange('')} aria-label="Clear search">✕</button>}
      </div>

      {studies.length === 0 ? (
        <div className="wls-empty-note">{query ? `No studies match "${query}".` : 'No studies with this status yet.'}</div>
      ) : (
        <div className="wls-group-grid">
          {studies.map(s => (
            <StudyCard
              key={s.id}
              study={s}
              active={s.id === selectedId}
              rosterCount={rosterCountFor(s)}
              onClick={() => onSelect(s.id)}
              onDoubleClick={() => onEdit(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* Single click opens the study in read-only View mode; double-click
   jumps straight into Edit mode — "view mode for everything, with an
   edit button when you double-click one." */
function StudyCard({ study, active, rosterCount, onClick, onDoubleClick }) {
  const status = study.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const overCap = study.cap && rosterCount > Number(study.cap);

  return (
    <button
      type="button"
      className={`wbs-study-card${active ? ' on' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click to view, double-click to edit"
    >
      <div className="wbs-study-card-top">
        <span className="wbs-study-card-title">{study.label || '(untitled study)'}</span>
        <span className={`wbs-badge status-${status}`}>{meta.icon} {meta.label}</span>
      </div>
      {study.leader && <div className="wbs-study-card-line">👩‍🏫 {study.leader}</div>}
      {(study.day || study.time) && (
        <div className="wbs-study-card-line">📅 {[study.day, study.time].filter(Boolean).join(' · ')}</div>
      )}
      {study.location && <div className="wbs-study-card-line">📍 {study.location}</div>}
      {study.book && <div className="wbs-study-card-book">📖 {study.book}</div>}
      <div className="wbs-study-card-foot">
        <span className={overCap ? 'wbs-study-card-roster is-over' : 'wbs-study-card-roster'}>
          {rosterCount} {rosterCount === 1 ? 'woman' : 'women'}{study.cap ? ` / ${study.cap}` : ''}
        </span>
        {study.childcare && <span className="wbs-study-card-chip">🍼 Childcare</span>}
      </div>
    </button>
  );
}

/* ── 4. Study detail panel — tabs beside the grid, not a new page ─
   Every tab (Overview, Sessions, Materials) renders read-only in
   View mode (the default) and switches, ALL AT ONCE, into the fully
   editable form in Edit mode — one mode for the whole panel, not
   per-tab, so switching to edit a schedule field doesn't leave the
   Sessions tab half-editable. Roster is the one exception: adding/
   removing a woman is a roster-membership action, not a "study
   record" edit, so it stays interactive in both modes (mirrors how
   Life Stages' GroupView keeps its prep checklist live even though
   the rest of the group card is read-only). */
function StudyDetailPanel({
  study, roster, onChange, onDelete, onClose, onOpenWoman, onOpenRoster,
  mode, onSetMode, allWomen, onAddToRoster, onRemoveFromRoster,
}) {
  const [tab, setTab] = useState('overview');
  const [confirmDel, setConfirmDel] = useState(false);
  const sessions = Array.isArray(study.sessions) ? study.sessions : [];
  const materials = Array.isArray(study.materials) ? study.materials : [];
  const isView = mode !== 'edit';

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const statusMeta = STATUS_META[study.status || 'active'] || STATUS_META.active;

  /* Double-clicking anywhere in the read-only body (outside the
     Roster tab, which has its own always-live controls) switches
     straight into Edit mode — same "view mode with edit-on-double-
     click" convention as Life Stages' LeaderField/CareFocusField. */
  const handleBodyDoubleClick = () => {
    if (isView && tab !== 'roster') onSetMode('edit');
  };

  return (
    <section className="wls-panel wbs-detail-panel">
      <div className="wbs-view-head" onDoubleClick={handleBodyDoubleClick}>
        <span className="wbs-view-icon">📖</span>
        {isView ? (
          <span className="wbs-view-title-text">{study.label || '(untitled study)'}</span>
        ) : (
          <input
            type="text"
            className="ys-inp wbs-title-inp wbs-view-title-inp"
            value={study.label || ''}
            onChange={set('label')}
            placeholder="Study title"
            autoFocus
          />
        )}
        {isView ? (
          <span className={`wbs-badge status-${study.status || 'active'}`}>{statusMeta.icon} {statusMeta.label}</span>
        ) : (
          <select className="ys-inp wbs-view-status-sel" value={study.status || 'active'} onChange={set('status')}>
            {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
          </select>
        )}
        <button
          type="button"
          className="wbs-edit-btn"
          onClick={() => onSetMode(isView ? 'edit' : 'view')}
        >
          {isView ? '✎ Edit' : '✓ Done'}
        </button>
        {!isView && (
          <button
            type="button"
            className={`wbs-del-btn${confirmDel ? ' armed' : ''}`}
            onClick={() => {
              if (confirmDel) { onDelete(); return; }
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3500);
            }}
          >
            {confirmDel ? 'Click again to delete' : '🗑 Delete'}
          </button>
        )}
        <button type="button" className="wls-group-del" onClick={onClose} title="Close" aria-label="Close">✕</button>
      </div>

      <div className="wbs-view-meta">
        {study.leader && <span className="wbs-chip">👩‍🏫 {study.leader}</span>}
        {(study.day || study.time) && <span className="wbs-chip">📅 {[study.day, study.time].filter(Boolean).join(' · ')}</span>}
        {study.location && <span className="wbs-chip">📍 {study.location}</span>}
        {study.frequency && <span className="wbs-chip">🔁 {study.frequency}</span>}
        <span className="wbs-chip">{roster.length} {roster.length === 1 ? 'woman' : 'women'}{study.cap ? ` / ${study.cap}` : ''}</span>
        {study.childcare && <span className="wbs-chip">🍼 Childcare</span>}
      </div>

      <nav className="wbs-tabs" role="tablist" aria-label="Study views">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`wbs-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'sessions' && sessions.length > 0 && <span className="wbs-tab-badge">{sessions.length}</span>}
            {t.key === 'roster' && roster.length > 0 && <span className="wbs-tab-badge">{roster.length}</span>}
          </button>
        ))}
      </nav>

      <div className="wbs-view-body" onDoubleClick={handleBodyDoubleClick}>
        {tab === 'overview' && (isView
          ? <OverviewView study={study} />
          : <OverviewTab study={study} set={set} />)}
        {tab === 'sessions' && (isView
          ? <SessionsView sessions={sessions} roster={roster} />
          : <SessionsTab study={study} sessions={sessions} roster={roster} onChange={onChange} />)}
        {tab === 'roster' && (
          <RosterTab
            roster={roster}
            sessions={sessions}
            label={study.label}
            onOpenWoman={onOpenWoman}
            onOpenRoster={onOpenRoster}
            allWomen={allWomen}
            onAdd={onAddToRoster}
            onRemove={onRemoveFromRoster}
          />
        )}
        {tab === 'materials' && (isView
          ? <MaterialsView study={study} materials={materials} />
          : <MaterialsTab study={study} materials={materials} onChange={onChange} set={set} />)}
      </div>
    </section>
  );
}

/* Day/Time/How-often are dropdowns over the fixed lists shared with
   Life Stages' meeting groups (see womensListsConfig.js) — a study
   created before these existed may carry a custom string that isn't
   in any of them, preserved here as a one-off extra <option> so it
   stays visible and selected instead of silently blanking out. Same
   fixed lists mean a study's own schedule lines up exactly with a
   Meeting Group's, which matters once the two are linked (see
   LifeStages.jsx's updateGroup — linking a group to this study
   cascades these very fields onto the group automatically). */
function OverviewTab({ study, set }) {
  return (
    <>
      <Section title="Meeting details">
        <Row>
          <Field label="Day">
            <select className="ys-inp" value={study.day || ''} onChange={set('day')}>
              <option value="">—</option>
              {MEETING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              {study.day && !MEETING_DAYS.includes(study.day) && <option value={study.day}>{study.day}</option>}
            </select>
          </Field>
          <Field label="Time">
            <select className="ys-inp" value={study.time || ''} onChange={set('time')}>
              <option value="">—</option>
              {MEETING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              {study.time && !MEETING_TIMES.includes(study.time) && <option value={study.time}>{study.time}</option>}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="How often">
            <select className="ys-inp" value={study.frequency || ''} onChange={set('frequency')}>
              <option value="">—</option>
              {MEETING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              {study.frequency && !MEETING_FREQUENCIES.includes(study.frequency) && <option value={study.frequency}>{study.frequency}</option>}
            </select>
          </Field>
          <Field label="Location">
            <input type="text" className="ys-inp" value={study.location || ''} onChange={set('location')} placeholder="e.g. Fellowship Hall" />
          </Field>
        </Row>
        <Field label="Current book / series">
          <input type="text" className="ys-inp" value={study.book || ''} onChange={set('book')} placeholder="e.g. Philippians: A Fresh Perspective" />
        </Field>
        <Row>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={study.startDate || ''} onChange={set('startDate')} />
          </Field>
          <Field label="End date">
            <input type="date" className="ys-inp" value={study.endDate || ''} onChange={set('endDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Sign-up cap">
            <input type="number" min="0" className="ys-inp" value={study.cap || ''} onChange={set('cap')} placeholder="No limit" />
          </Field>
          <Field label="Childcare">
            <label className="wbs-check">
              <input type="checkbox" checked={!!study.childcare} onChange={set('childcare')} />
              <span>Provided</span>
            </label>
          </Field>
        </Row>
      </Section>

      <Section title="Description">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="What this study is about, who it's for…"
          value={study.description || ''}
          onChange={set('description')}
        />
      </Section>
    </>
  );
}

/* Read-only mirror of OverviewTab, shown in View mode — same rows,
   same order, plain text instead of inputs. */
function OverviewView({ study }) {
  return (
    <>
      <Section title="Meeting details">
        <div className="wbs-view-grid">
          <ViewItem label="Day" value={study.day} />
          <ViewItem label="Time" value={study.time} />
          <ViewItem label="How often" value={study.frequency} />
          <ViewItem label="Location" value={study.location} />
          <ViewItem label="Current book / series" value={study.book} />
          <ViewItem label="Start date" value={study.startDate} />
          <ViewItem label="End date" value={study.endDate} />
          <ViewItem label="Sign-up cap" value={study.cap} />
          <ViewItem label="Childcare" value={study.childcare ? 'Provided' : 'Not provided'} />
        </div>
      </Section>

      <Section title="Description">
        <div className="wbs-view-text">{study.description || '—'}</div>
      </Section>
    </>
  );
}

function ViewItem({ label, value, block }) {
  return (
    <div className={`wbs-view-item${block ? ' block' : ''}`}>
      <span className="wbs-view-item-lbl">{label}</span>
      <span className="wbs-view-item-val">{value || '—'}</span>
    </div>
  );
}

/* Sessions sort newest/most-upcoming first so the current week
   naturally lands at the top; the top session starts expanded. */
function SessionsTab({ study, sessions, roster, onChange }) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [sessions]
  );
  const [expandedId, setExpandedId] = useState(sorted[0]?.id || null);
  const [confirmDelId, setConfirmDelId] = useState(null);

  const addSession = () => {
    const s = { id: makeId('sess'), date: todayISO(), topic: '', questions: '', notes: '', attendance: {} };
    onChange({ sessions: [...sessions, s] });
    setExpandedId(s.id);
  };
  const updateSession = (id, patch) => {
    onChange({ sessions: sessions.map(s => s.id === id ? { ...s, ...patch } : s) });
  };
  const removeSession = (id) => {
    onChange({ sessions: sessions.filter(s => s.id !== id) });
    if (expandedId === id) setExpandedId(null);
  };
  const toggleAttendance = (session, womanId) => {
    const att = { ...(session.attendance || {}) };
    if (att[womanId]) delete att[womanId]; else att[womanId] = true;
    updateSession(session.id, { attendance: att });
  };

  return (
    <Section title="Sessions">
      <button type="button" className="ys-add-btn wbs-session-add" onClick={addSession}>
        ＋ Add session
      </button>

      {sorted.length === 0 ? (
        <div className="wls-empty-note">
          No sessions logged yet — add one for each week to track attendance and discussion notes.
        </div>
      ) : (
        <div className="wbs-session-list">
          {sorted.map(session => {
            const open = expandedId === session.id;
            const attendedCount = Object.values(session.attendance || {}).filter(Boolean).length;
            const armed = confirmDelId === session.id;
            return (
              <div key={session.id} className={`wbs-session${open ? ' open' : ''}`}>
                <button
                  type="button"
                  className="wbs-session-head"
                  onClick={() => setExpandedId(open ? null : session.id)}
                >
                  <span className="wbs-session-date">{session.date || 'No date'}</span>
                  <span className="wbs-session-topic">{session.topic || '(untitled session)'}</span>
                  <span className="wbs-session-summary">
                    {roster.length > 0 ? `${attendedCount}/${roster.length} attended` : ''}
                  </span>
                  <span className="wbs-session-chevron">▶</span>
                </button>
                {open && (
                  <div className="wbs-session-body">
                    <Row>
                      <Field label="Date">
                        <input type="date" className="ys-inp" value={session.date || ''} onChange={e => updateSession(session.id, { date: e.target.value })} />
                      </Field>
                      <Field label="Topic / chapter">
                        <input type="text" className="ys-inp" value={session.topic || ''} onChange={e => updateSession(session.id, { topic: e.target.value })} placeholder="e.g. Chapter 3 — Joy in Suffering" />
                      </Field>
                    </Row>
                    <Field label="Discussion questions">
                      <textarea
                        className="ys-inp ys-textarea"
                        rows={3}
                        placeholder="Questions for the group this week…"
                        value={session.questions || ''}
                        onChange={e => updateSession(session.id, { questions: e.target.value })}
                      />
                    </Field>
                    <Field label="Leader notes">
                      <textarea
                        className="ys-inp ys-textarea"
                        rows={3}
                        placeholder="How the discussion went, prayer requests, follow-ups…"
                        value={session.notes || ''}
                        onChange={e => updateSession(session.id, { notes: e.target.value })}
                      />
                    </Field>

                    <Field label={`Attendance${roster.length ? ` (${attendedCount}/${roster.length})` : ''}`}>
                      {roster.length === 0 ? (
                        <div className="wls-empty-note">
                          Add women to this study on All Women to take attendance.
                        </div>
                      ) : (
                        <div className="wbs-attend-list">
                          {roster.map(w => {
                            const present = !!(session.attendance || {})[w.id];
                            return (
                              <label key={w.id} className={`wbs-attend-row${present ? ' on' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={present}
                                  onChange={() => toggleAttendance(session, w.id)}
                                />
                                <span className="wbs-attend-name">{w.name || '(no name)'}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </Field>

                    <div className="wbs-session-del-row">
                      <button
                        type="button"
                        className={`wbs-del-btn${armed ? ' armed' : ''}`}
                        onClick={() => {
                          if (armed) { removeSession(session.id); return; }
                          setConfirmDelId(session.id);
                          setTimeout(() => setConfirmDelId(prev => prev === session.id ? null : prev), 3500);
                        }}
                      >
                        {armed ? 'Click again to delete' : '🗑 Delete session'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* Read-only mirror of SessionsTab, shown in View mode — same
   expand/collapse per session (still fine to browse read-only), but
   no add/delete/edit controls and attendance renders as plain
   checkmarks instead of live checkboxes. */
function SessionsView({ sessions, roster }) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [sessions]
  );
  const [expandedId, setExpandedId] = useState(sorted[0]?.id || null);

  return (
    <Section title="Sessions">
      {sorted.length === 0 ? (
        <div className="wls-empty-note">No sessions logged yet.</div>
      ) : (
        <div className="wbs-session-list">
          {sorted.map(session => {
            const open = expandedId === session.id;
            const attendedCount = Object.values(session.attendance || {}).filter(Boolean).length;
            return (
              <div key={session.id} className={`wbs-session${open ? ' open' : ''}`}>
                <button
                  type="button"
                  className="wbs-session-head"
                  onClick={() => setExpandedId(open ? null : session.id)}
                >
                  <span className="wbs-session-date">{session.date || 'No date'}</span>
                  <span className="wbs-session-topic">{session.topic || '(untitled session)'}</span>
                  <span className="wbs-session-summary">
                    {roster.length > 0 ? `${attendedCount}/${roster.length} attended` : ''}
                  </span>
                  <span className="wbs-session-chevron">▶</span>
                </button>
                {open && (
                  <div className="wbs-session-body">
                    {session.questions && <ViewItem label="Discussion questions" value={session.questions} block />}
                    {session.notes && <ViewItem label="Leader notes" value={session.notes} block />}
                    {roster.length > 0 && (
                      <div className="wbs-view-item block">
                        <span className="wbs-view-item-lbl">{`Attendance (${attendedCount}/${roster.length})`}</span>
                        <div className="wbs-attend-list">
                          {roster.map(w => {
                            const present = !!(session.attendance || {})[w.id];
                            return (
                              <span key={w.id} className={`wbs-attend-row readonly${present ? ' on' : ''}`}>
                                <span className="wbs-attend-name">{present ? '✓' : '—'} {w.name || '(no name)'}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function RosterTab({ roster, sessions, label, onOpenWoman, onOpenRoster, allWomen, onAdd, onRemove }) {
  const totalSessions = sessions.length;
  const [query, setQuery] = useState('');
  const rosterIds = useMemo(() => new Set(roster.map(w => w.id)), [roster]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return (Array.isArray(allWomen) ? allWomen : [])
      .filter(w => !rosterIds.has(w.id) && (w.name || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [q, allWomen, rosterIds]);
  const addWoman = (womanId) => {
    onAdd(womanId);
    setQuery('');
  };

  return (
    <Section title={`Roster (${roster.length})`}>
      {/* Manual add — searches every woman NOT already on this
         roster; picking one sets her bibleStudy field to this
         study's label, same as the automatic paths (direct field
         match, or a linked Meeting Group), just triggered by hand. */}
      <div className="wbs-roster-add">
        <input
          type="text"
          className="ys-inp"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="＋ Add a woman by name…"
        />
        {matches.length > 0 && (
          <div className="wbs-roster-add-suggest">
            {matches.map(w => (
              <button key={w.id} type="button" onClick={() => addWoman(w.id)}>
                ＋ {w.name || '(no name)'}
              </button>
            ))}
          </div>
        )}
      </div>

      {roster.length === 0 ? (
        <div className="wls-empty-note">
          No one signed up yet. Add her above, assign her to a Meeting Group linked to
          this study in Life Stages, or set her Bible study to this title on All Women.
        </div>
      ) : (
        <ul className="wls-roster">
          {roster.map(w => {
            const attended = totalSessions > 0
              ? sessions.filter(s => !!(s.attendance || {})[w.id]).length
              : 0;
            return (
              <li key={w.id} className="wls-roster-row">
                <div className="wls-roster-top">
                  <span className="wls-roster-name">{w.name || '(no name)'}</span>
                  <span className="wls-roster-meta">
                    {w.lifeStage || '—'}
                    {totalSessions > 0 && <span className="wbs-roster-frac"> · {attended}/{totalSessions} sessions</span>}
                    {w._viaGroup && <span className="wbs-roster-via"> · via {w._viaGroup}</span>}
                  </span>
                  <span className="wls-roster-row-actions">
                    {w._viaGroup ? (
                      <span className="wbs-roster-via-badge" title="Assigned through her Meeting Group on Life Stages — manage there">👥 via group</span>
                    ) : (
                      <button type="button" className="wbs-material-del" title="Remove from roster" onClick={() => onRemove(w.id)}>✕</button>
                    )}
                    <button type="button" className="wls-roster-open" onClick={() => onOpenWoman(w.id)}>Open →</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {label && (
        <button
          type="button"
          className="wls-btn-ghost"
          style={{ alignSelf: 'flex-start', padding: '7px 12px', fontSize: 12 }}
          onClick={() => onOpenRoster(label)}
        >
          Manage roster in All Women →
        </button>
      )}
    </Section>
  );
}

function MaterialsTab({ study, materials, onChange, set }) {
  const addMaterial = () => {
    onChange({ materials: [...materials, { id: makeId('mat'), title: '', url: '' }] });
  };
  const updateMaterial = (id, patch) => {
    onChange({ materials: materials.map(m => m.id === id ? { ...m, ...patch } : m) });
  };
  const removeMaterial = (id) => {
    onChange({ materials: materials.filter(m => m.id !== id) });
  };

  return (
    <>
      <Section title="Book / curriculum">
        <div className="wbs-materials-book">
          {study.book || 'Not set — add it from the Overview tab.'}
        </div>
      </Section>

      <Section title="Resource links">
        {materials.length === 0 ? (
          <div className="wls-empty-note">
            No links yet — add homework sheets, video links, or PDFs for the group.
          </div>
        ) : (
          <div className="wbs-material-list">
            {materials.map(m => (
              <div key={m.id} className="wbs-material-row">
                <input
                  type="text"
                  className="ys-inp"
                  placeholder="Title (e.g. Week 3 handout)"
                  value={m.title || ''}
                  onChange={e => updateMaterial(m.id, { title: e.target.value })}
                />
                <input
                  type="url"
                  className="ys-inp"
                  placeholder="https://…"
                  value={m.url || ''}
                  onChange={e => updateMaterial(m.id, { url: e.target.value })}
                />
                {m.url && <a className="wbs-material-link" href={m.url} target="_blank" rel="noreferrer" title="Open link">↗</a>}
                <button type="button" className="wbs-material-del" onClick={() => removeMaterial(m.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="ys-add-btn" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={addMaterial}>
          ＋ Add resource link
        </button>
      </Section>

      <Section title="Cost & logistics notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="Book cost, where to buy, homework expectations, supply list…"
          value={study.materialsNotes || ''}
          onChange={set('materialsNotes')}
        />
      </Section>
    </>
  );
}

/* Read-only mirror of MaterialsTab, shown in View mode — resource
   links render as plain clickable links instead of editable rows,
   no add/remove controls. */
function MaterialsView({ study, materials }) {
  return (
    <>
      <Section title="Book / curriculum">
        <div className="wbs-materials-book">{study.book || 'Not set.'}</div>
      </Section>

      <Section title="Resource links">
        {materials.length === 0 ? (
          <div className="wls-empty-note">No links yet.</div>
        ) : (
          <ul className="wbs-material-view-list">
            {materials.map(m => (
              <li key={m.id}>
                {m.url
                  ? <a href={m.url} target="_blank" rel="noreferrer">{m.title || m.url}</a>
                  : (m.title || '(untitled)')}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cost & logistics notes">
        <div className="wbs-view-text">{study.materialsNotes || '—'}</div>
      </Section>
    </>
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
