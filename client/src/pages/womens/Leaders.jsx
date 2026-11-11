import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMentors, useBibleStudies, usePrayerGroups, makeListItem } from './womensListsConfig';
import { WOMENS_GROUPS } from './womensConfig';
import { CustomAvatar } from '../friends/Avatar';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center/.wa-slide,
   .wa-card-grid/.wa-stats-bar/.wa-controls/.wa-comm-list…) from
   AllWomen.css and the .ys-* form primitives from the Youth roster —
   same pattern Mentorship/Bible Studies/Prayer Groups already follow. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Leaders.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Leaders

   Roster of ministry leaders and coordinators, grouped by area of
   focus (the same six groups as the nav sidebar: Members /
   Discipleship / Events / Care / Team / Records) — but instead of
   every area's roster sitting expanded on the page, the landing
   view is a compact grid of area tiles (icon, leader count, gap/
   overdue badges, small avatar stack). Clicking a tile drills into
   that area's full roster — leaders, open roles, "+ Add leader"/
   "+ Add gap" — in the slide-over, and clicking a leader card there
   drills one level further into that leader's full detail (with a
   "← Back to {area}" link back up to the roster). A leader without
   a recognized area lands in a trailing "Unassigned" tile instead
   of being dropped. Role, availability, and a per-leader
   training/onboarding checklist live on the detail slide-over.

   "Currently leading" is never entered by hand here — it's read
   live off Bible Studies and Prayer Groups by matching each
   study/group's `leader` name against this leader's name, so the
   two lists can never drift apart.

   "Open roles" is a small manual gap-tracker: role titles that
   still need someone, with a one-click "Fill role" that starts a
   new leader record pre-filled with that title + area. Adding a gap
   from within an area section pre-fills that area automatically.

   Storage:
     leaders (this page):  useUserStoreKey('womens:leaders', [])
     open roles:            useUserStoreKey('womens:leader-open-roles', [])
     women (read/link):     useUserStoreKey('womens:women', [])
     name registry:         useMentors() — the same shared
                             'womens:mentors' list used by
                             Mentorship's picker (per its own docs,
                             it's a general "people worth
                             remembering the spelling of" list, not
                             a mentor-only concept).
     bible studies (read):  useBibleStudies()
     prayer groups (read):  usePrayerGroups()
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  active:      { label: 'Active',      icon: '🟢' },
  training:    { label: 'In Training', icon: '🎓' },
  'on-leave':  { label: 'On Leave',    icon: '⏸️' },
};
const STATUS_ORDER = ['active', 'training', 'on-leave'];
const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  ...STATUS_ORDER.map(id => ({ id, label: STATUS_META[id].label })),
  { id: 'overdue', label: '⚡ Training overdue' },
];

const UNASSIGNED_AREA = { key: '', label: 'Unassigned', icon: '🗂️' };

const DEFAULT_TRAINING_LABELS = ['Background check', 'Child safety training', 'Ministry orientation'];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const norm = (s) => (s || '').trim().toLowerCase();

const makeTrainingItem = (label) => ({ id: makeId('tr'), label, done: false, dueDate: '' });

const DEFAULT_LEADER = () => ({
  id:           makeId('ld'),
  name:         '',
  womanId:      null,
  role:         '',
  areaKey:      '',
  status:       'active',
  availability: '',
  startDate:    today(),
  training:     DEFAULT_TRAINING_LABELS.map(makeTrainingItem),
  notes:        '',
  createdAt:    Date.now(),
});

const isTrainingOverdue = (leader) =>
  (Array.isArray(leader.training) ? leader.training : []).some(t => !t.done && t.dueDate && t.dueDate < today());

/* What this leader is currently leading, read live off Bible
   Studies + Prayer Groups by name match — see file header. */
function leadingFor(name, bibleStudies, prayerGroups) {
  const n = norm(name);
  if (!n) return [];
  const out = [];
  (bibleStudies || []).forEach(s => { if (norm(s.leader) === n && (s.label || '').trim()) out.push({ icon: '📖', label: s.label, target: '/womens/bible-studies' }); });
  (prayerGroups || []).forEach(g => { if (norm(g.leader) === n && (g.label || '').trim()) out.push({ icon: '🙏', label: g.label, target: '/womens/prayer-groups' }); });
  return out;
}

export default function Leaders() {
  const [leaders, setLeaders, { loading }] = useUserStoreKey('womens:leaders', []);
  const [openRoles, setOpenRoles] = useUserStoreKey('womens:leader-open-roles', []);
  const [women] = useUserStoreKey('womens:women', []);
  const [names, setNames] = useMentors();
  const [bibleStudies] = useBibleStudies();
  const [prayerGroups] = usePrayerGroups();
  const navigate = useNavigate();

  const list = Array.isArray(leaders) ? leaders : [];
  const openRolesList = Array.isArray(openRoles) ? openRoles : [];
  const womenList = Array.isArray(women) ? women : [];
  const namesList = Array.isArray(names) ? names : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  /* Which area's roster is open in the drill-in slide-over — null
     means the overview tiles are showing. '' is a valid value (the
     trailing "Unassigned" tile), so this is deliberately distinct
     from null rather than falsy-checked. */
  const [selectedAreaKey, setSelectedAreaKey] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const findWoman = (id) => womenList.find(w => w.id === id) || null;

  const addLeader = () => {
    const l = DEFAULT_LEADER();
    setLeaders(prev => [...(prev || []), l]);
    setSelectedId(l.id);
  };

  /* Same as addLeader, but pre-fills the area — used by each area
     section's own "+ Add leader" button so a leader started from
     inside "Discipleship" lands there without an extra click. */
  const addLeaderInArea = (areaKey) => {
    const l = DEFAULT_LEADER();
    l.areaKey = areaKey;
    setLeaders(prev => [...(prev || []), l]);
    setSelectedId(l.id);
  };

  const fillOpenRole = (role) => {
    const l = DEFAULT_LEADER();
    l.role = role.title;
    l.areaKey = role.areaKey || '';
    setLeaders(prev => [...(prev || []), l]);
    setOpenRoles(prev => (prev || []).filter(r => r.id !== role.id));
    setSelectedId(l.id);
  };

  const addOpenRole = (role) => setOpenRoles(prev => [...(prev || []), role]);
  const removeOpenRole = (id) => setOpenRoles(prev => (prev || []).filter(r => r.id !== id));

  const updateLeader = (id, patch) => setLeaders(prev => (prev || []).map(l => l.id === id ? { ...l, ...patch } : l));
  const removeLeader = (id) => {
    setLeaders(prev => (prev || []).filter(l => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  /* Close everything — the ✕ button and Esc both fully exit the
     slide-over (whether it's showing an area roster, a leader's
     detail reached directly, or a leader's detail reached by
     drilling into an area first). The in-panel "← Back to {area}"
     link is the only thing that pops just one level. */
  const closeAll = () => { setSelectedId(null); setSelectedAreaKey(null); };

  const selected = useMemo(() => list.find(l => l.id === selectedId) || null, [list, selectedId]);

  /* Lock body scroll + Esc-to-close while either slide-over view is open. */
  useEffect(() => {
    if (!selected && selectedAreaKey === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedAreaKey]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(l => (l.name || '').toLowerCase().includes(q) || (l.role || '').toLowerCase().includes(q))
      : list;
    if (statusFilter === 'overdue') out = out.filter(isTrainingOverdue);
    else if (statusFilter !== 'all') out = out.filter(l => (l.status || 'active') === statusFilter);
    return [...out].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query, statusFilter]);

  const stats = useMemo(() => ({
    total:   list.length,
    active:  list.filter(l => (l.status || 'active') === 'active').length,
    open:    openRolesList.length,
    overdue: list.filter(isTrainingOverdue).length,
  }), [list, openRolesList]);

  const filtering = !!query.trim() || statusFilter !== 'all';

  /* Bucket the (already search/status-filtered) leaders and the
     (always-unfiltered — gaps aren't a "who" to search/status-filter)
     open roles by area, so each AreaTile/AreaRoster below gets just
     its own slice. Anything without a recognized areaKey falls through to
     the trailing "Unassigned" bucket instead of vanishing. */
  const leadersByArea = useMemo(() => {
    const byArea = {};
    WOMENS_GROUPS.forEach(g => { byArea[g.key] = []; });
    const unassigned = [];
    visible.forEach(l => {
      if (l.areaKey && byArea[l.areaKey]) byArea[l.areaKey].push(l);
      else unassigned.push(l);
    });
    return { byArea, unassigned };
  }, [visible]);

  const openRolesByArea = useMemo(() => {
    const byArea = {};
    WOMENS_GROUPS.forEach(g => { byArea[g.key] = []; });
    const unassigned = [];
    openRolesList.forEach(r => {
      if (r.areaKey && byArea[r.areaKey]) byArea[r.areaKey].push(r);
      else unassigned.push(r);
    });
    return { byArea, unassigned };
  }, [openRolesList]);

  return (
    <WomensShell
      title="Leaders"
      icon="🧑‍🏫"
      subtitle="Ministry leaders and coordinators — role, area of focus, availability, and training status."
      actions={
        <button type="button" className="wms-btn primary" onClick={addLeader}>
          ✦ New leader
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root ld-root">
      {loading && list.length === 0 ? (
        <div className="wa-directory-empty" style={{ flex: 1 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">🧑‍🏫</div>
          <div className="app-empty-title">No leaders added yet</div>
          <div className="app-empty-sub">
            Track every coordinator and volunteer leader — role, area of
            focus, availability, and training status. Bible study and
            prayer group leaders show up automatically once their names
            match here.
          </div>
          <button type="button" className="app-btn primary" onClick={addLeader}>
            ✦ Add your first leader
          </button>
        </div>
      ) : (
        <div className="wa-directory">
          <div className="wa-stats-bar">
            <div className="wa-stat">
              <span className="wa-stat-n">{stats.total}</span>
              <span className="wa-stat-lbl">Leaders</span>
            </div>
            <div className="wa-stat">
              <span className="wa-stat-n">{stats.active}</span>
              <span className="wa-stat-lbl">Active</span>
            </div>
            <div className={stats.open > 0 ? 'wa-stat is-warn' : 'wa-stat'}>
              <span className="wa-stat-n">{stats.open}</span>
              <span className="wa-stat-lbl">Open roles</span>
            </div>
            <div className={stats.overdue > 0 ? 'wa-stat is-warn' : 'wa-stat'}>
              <span className="wa-stat-n">{stats.overdue}</span>
              <span className="wa-stat-lbl">Training overdue</span>
            </div>
          </div>

          <div className="wa-controls">
            <div className="wa-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by name or role…"
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
                className={`wa-filter-chip ${statusFilter === f.id ? 'on' : ''}`}
                onClick={() => setStatusFilter(f.id)}
              >{f.label}</button>
            ))}
          </div>

          <div className="ld-area-tiles">
            {WOMENS_GROUPS.map(area => (
              <AreaTile
                key={area.key}
                area={area}
                leaders={leadersByArea.byArea[area.key] || []}
                openRoles={openRolesByArea.byArea[area.key] || []}
                onClick={() => setSelectedAreaKey(area.key)}
              />
            ))}
            {(leadersByArea.unassigned.length > 0 || openRolesByArea.unassigned.length > 0) && (
              <AreaTile
                area={UNASSIGNED_AREA}
                leaders={leadersByArea.unassigned}
                openRoles={openRolesByArea.unassigned}
                onClick={() => setSelectedAreaKey('')}
              />
            )}
          </div>
        </div>
      )}

      {(selected || selectedAreaKey !== null) && (
        <>
          <div className="wa-slide-overlay" onClick={closeAll} />
          <aside className="wa-slide" role="dialog" aria-label={selected ? 'Leader' : 'Area roster'}>
            <button
              className="wa-slide-close"
              onClick={closeAll}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              {selected ? (
                <LeaderDetail
                  leader={selected}
                  women={womenList}
                  names={namesList}
                  leading={leadingFor(selected.name, bibleStudies, prayerGroups)}
                  onCreateName={(label) => setNames(prev => [...(prev || []), makeListItem(label)])}
                  onChange={(patch) => updateLeader(selected.id, patch)}
                  onDelete={() => removeLeader(selected.id)}
                  onOpenWoman={openWoman}
                  onNavTag={(target) => navigate(target)}
                  onBack={selectedAreaKey !== null ? () => setSelectedId(null) : null}
                  backLabel={selectedAreaKey !== null ? (selectedAreaKey === '' ? UNASSIGNED_AREA.label : (WOMENS_GROUPS.find(g => g.key === selectedAreaKey)?.label || '')) : null}
                />
              ) : (
                <AreaRoster
                  area={selectedAreaKey === '' ? UNASSIGNED_AREA : (WOMENS_GROUPS.find(g => g.key === selectedAreaKey) || UNASSIGNED_AREA)}
                  leaders={selectedAreaKey === '' ? leadersByArea.unassigned : (leadersByArea.byArea[selectedAreaKey] || [])}
                  openRoles={selectedAreaKey === '' ? openRolesByArea.unassigned : (openRolesByArea.byArea[selectedAreaKey] || [])}
                  filtering={filtering}
                  findWoman={findWoman}
                  bibleStudies={bibleStudies}
                  prayerGroups={prayerGroups}
                  onCardClick={setSelectedId}
                  onNavTag={(target) => navigate(target)}
                  onAddOpenRole={addOpenRole}
                  onRemoveOpenRole={removeOpenRole}
                  onFillOpenRole={fillOpenRole}
                  onAddLeader={addLeaderInArea}
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
      />
    </WomensShell>
  );
}

/* ── Area tile — compact landing-view summary for one ministry
   area ────────────────────────────────────────────────────────
   The dashboard-first entry point: instead of every area's full
   roster sitting expanded on the page (a lot of scrolling once a
   couple areas fill up), each of the six nav areas — plus a
   trailing "Unassigned" tile when it's non-empty — gets a compact
   card showing just the leader count and any gaps/overdue training
   at a glance. Clicking a tile drills into that area's full roster
   in the slide-over (see AreaRoster below). */
function AreaTile({ area, leaders, openRoles, onClick }) {
  const overdueCount = leaders.filter(isTrainingOverdue).length;
  const preview = leaders.slice(0, 4);

  return (
    <button type="button" className="ld-area-tile" onClick={onClick}>
      <div className="ld-area-tile-hd">
        <span className="ld-area-tile-icon">{area.icon}</span>
        <span className="ld-area-tile-label">{area.label}</span>
      </div>

      {preview.length > 0 ? (
        <div className="ld-area-tile-stack">
          {preview.map(l => (
            <span key={l.id} className="ld-area-tile-avatar" title={l.name || 'Unnamed leader'}>
              <AvatarDot url={null} avatar={null} name={l.name} />
            </span>
          ))}
          {leaders.length > preview.length && (
            <span className="ld-area-tile-avatar ld-area-tile-more">+{leaders.length - preview.length}</span>
          )}
        </div>
      ) : (
        <div className="ld-area-tile-empty">No leaders yet</div>
      )}

      <div className="ld-area-tile-meta">
        <span className="ld-area-tile-count">{leaders.length} leader{leaders.length === 1 ? '' : 's'}</span>
        {openRoles.length > 0 && <span className="ld-pill ld-area-gap">🧩 {openRoles.length} open</span>}
        {overdueCount > 0 && <span className="ld-pill status-overdue">⚡ {overdueCount}</span>}
      </div>
    </button>
  );
}

/* ── Area roster — one ministry area's full leaders + gaps,
   shown in the drill-in slide-over after clicking its tile above.
   Same content the always-expanded panel used to show inline; now
   it only renders once you've asked for that specific area. */
function AreaRoster({ area, leaders, openRoles, filtering, findWoman, bibleStudies, prayerGroups, onCardClick, onNavTag, onAddOpenRole, onRemoveOpenRole, onFillOpenRole, onAddLeader }) {
  const [draftRole, setDraftRole] = useState('');
  const isEmpty = leaders.length === 0 && openRoles.length === 0;

  const addRole = () => {
    const t = draftRole.trim();
    if (!t) return;
    onAddOpenRole({ id: makeId('or'), title: t, areaKey: area.key, notes: '', createdAt: Date.now() });
    setDraftRole('');
  };

  return (
    <div className="ld-roster">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ld-detail-icon">{area.icon}</span>
          <h2 className="ys-form-title">{area.label}</h2>
        </div>
        <button type="button" className="ld-area-add" onClick={() => onAddLeader(area.key)}>+ Add leader</button>
      </div>
      <div className="ld-roster-count">
        {leaders.length} leader{leaders.length === 1 ? '' : 's'}
        {openRoles.length > 0 ? ` · ${openRoles.length} open role${openRoles.length === 1 ? '' : 's'}` : ''}
      </div>

      {isEmpty ? (
        <div className="ld-area-empty">
          {filtering ? 'No leaders match this filter here.' : 'No leaders yet in this area.'}
        </div>
      ) : (
        <>
          {leaders.length > 0 && (
            <div className="ld-card-grid">
              {leaders.map(l => (
                <LeaderCard
                  key={l.id}
                  leader={l}
                  woman={findWoman(l.womanId)}
                  leading={leadingFor(l.name, bibleStudies, prayerGroups)}
                  overdue={isTrainingOverdue(l)}
                  onClick={() => onCardClick(l.id)}
                  onNavTag={onNavTag}
                />
              ))}
            </div>
          )}

          {openRoles.length > 0 && (
            <div className="ld-openroles-list">
              {openRoles.map(r => (
                <div key={r.id} className="ld-openrole-row">
                  <span className="ld-openrole-title">{r.title}</span>
                  <div className="ld-openrole-actions">
                    <button type="button" className="ld-openrole-fill" onClick={() => onFillOpenRole(r)}>Fill role →</button>
                    <button type="button" className="ld-openrole-del" onClick={() => onRemoveOpenRole(r.id)} aria-label="Remove open role">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="ld-openrole-add">
        <input
          type="text"
          className="ys-inp"
          value={draftRole}
          onChange={e => setDraftRole(e.target.value)}
          placeholder={`Add an open role in ${area.label}…`}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
        />
        <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addRole}>
          ＋ Add gap
        </button>
      </div>
    </div>
  );
}

/* ── Directory card ─────────────────────────────────────────── */
function LeaderCard({ leader, woman, leading, overdue, onClick, onNavTag }) {
  const status = leader.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;

  return (
    <button type="button" className="ld-card" onClick={onClick}>
      <span className={`ld-card-stripe ${overdue ? 'tone-overdue' : `tone-${status}`}`} />
      {overdue && <span className="ld-card-badge tone-overdue">⚡ Training overdue</span>}

      <div className="ld-card-top">
        <AvatarDot url={woman?.photoUrl} avatar={woman?.avatar} name={leader.name} />
        <div className="ld-card-id">
          <span className="ld-card-name">{leader.name || 'Unnamed leader'}</span>
          <span className="ld-card-role">{leader.role || 'No role set'}</span>
        </div>
      </div>

      <div className="ld-card-pills">
        <span className={`ld-pill status-${status}`}>{meta.icon} {meta.label}</span>
      </div>

      {leader.availability && <div className="ld-card-avail">🕒 {leader.availability}</div>}

      {leading.length > 0 && (
        <div className="ld-card-leading">
          {leading.slice(0, 2).map((t, i) => (
            <span
              key={i}
              className="ld-leading-tag"
              onClick={(e) => { e.stopPropagation(); onNavTag(t.target); }}
              title="Open this page"
            >{t.icon} {t.label}</span>
          ))}
          {leading.length > 2 && <span className="ld-leading-more">+{leading.length - 2} more</span>}
        </div>
      )}
    </button>
  );
}

/* ── Detail / edit slide-over (always editable, matches
   Mentorship's PairDetail pattern) ─────────────────────────── */
function LeaderDetail({ leader, women, names, leading, onCreateName, onChange, onDelete, onOpenWoman, onNavTag, onBack, backLabel }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const linkedWoman = women.find(w => w.id === leader.womanId);

  const set = (field) => (e) => {
    const val = e?.target ? e.target.value : e;
    onChange({ [field]: val });
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      {onBack && (
        <button type="button" className="ld-back-btn" onClick={onBack}>
          ← Back to {backLabel || 'area'}
        </button>
      )}
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ld-detail-icon">🧑‍🏫</span>
          <h2 className="ys-form-title">{leader.name || 'New leader'}</h2>
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

      <Section title="Who">
        <Field label="Name">
          <NamePicker
            name={leader.name}
            women={women}
            names={names}
            onCreateName={onCreateName}
            placeholder="Leader's name"
            onPick={(name, womanId) => onChange({ name, womanId })}
          />
          {linkedWoman && (
            <button type="button" className="ld-open-woman" onClick={() => onOpenWoman(linkedWoman.id)}>
              Open her profile →
            </button>
          )}
        </Field>
      </Section>

      <Section title="Role">
        <Field label="Role title">
          <input
            type="text"
            className="ys-inp"
            value={leader.role || ''}
            onChange={set('role')}
            placeholder="e.g. Retreats Coordinator, Bible Study Leader…"
          />
        </Field>
        <Row>
          <Field label="Area of focus">
            <select className="ys-inp" value={leader.areaKey || ''} onChange={set('areaKey')}>
              <option value="">—</option>
              {WOMENS_GROUPS.map(g => <option key={g.key} value={g.key}>{g.icon} {g.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="ys-inp" value={leader.status || 'active'} onChange={set('status')}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Availability">
            <input
              type="text"
              className="ys-inp"
              value={leader.availability || ''}
              onChange={set('availability')}
              placeholder="e.g. Weekday mornings, Sunday evenings…"
            />
          </Field>
          <Field label="Started leading">
            <input type="date" className="ys-inp" value={leader.startDate || ''} onChange={set('startDate')} />
          </Field>
        </Row>
      </Section>

      {leading.length > 0 && (
        <Section title="Currently leading">
          <div className="ld-leading-list">
            {leading.map((t, i) => (
              <button
                key={i}
                type="button"
                className="ld-leading-row"
                onClick={() => onNavTag(t.target)}
              >{t.icon} {t.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--wms-ink-faint, rgba(61,23,40,0.52))', fontStyle: 'italic' }}>
            Pulled automatically from Bible Studies and Prayer Groups by
            matching the leader name above — edit it on that group's page.
          </div>
        </Section>
      )}

      <TrainingChecklist items={leader.training} onChange={(training) => onChange({ training })} />

      <Section title="Notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="Coordinator notes — strengths, growth areas, next steps…"
          value={leader.notes || ''}
          onChange={set('notes')}
        />
      </Section>
    </form>
  );
}

/* ── Training / onboarding checklist ────────────────────────── */
function TrainingChecklist({ items, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(items) ? items : [];
  const done = list.filter(t => t.done).length;

  const toggle = (id) => onChange(list.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const setDue = (id, dueDate) => onChange(list.map(t => t.id === id ? { ...t, dueDate } : t));
  const remove = (id) => onChange(list.filter(t => t.id !== id));
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange([...list, makeTrainingItem(label)]);
    setDraft('');
  };

  return (
    <Section title={`Training & checklist (${done}/${list.length})`}>
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--wms-ink-faint, rgba(61,23,40,0.52))', fontStyle: 'italic' }}>
          No checklist items yet.
        </div>
      ) : (
        <ul className="ld-training-list">
          {list.map(t => {
            const overdue = !t.done && t.dueDate && t.dueDate < today();
            return (
              <li key={t.id} className={`ld-training-row${overdue ? ' is-overdue' : ''}`}>
                <label className="ld-training-check">
                  <input type="checkbox" checked={!!t.done} onChange={() => toggle(t.id)} />
                  <span className={t.done ? 'is-done' : ''}>{t.label}</span>
                </label>
                <input
                  type="date"
                  className="ys-inp ld-training-date"
                  value={t.dueDate || ''}
                  onChange={e => setDue(t.id, e.target.value)}
                />
                <button type="button" className="ld-training-del" onClick={() => remove(t.id)} aria-label="Remove item">✕</button>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          type="text"
          className="ys-inp"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add checklist item…"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={add}>
          ＋ Add
        </button>
      </div>
    </Section>
  );
}

/* ── Name picker sourced from All Women (linked) + the shared
   names list (unlinked fallback), with inline "+ Add new…" ──── */
function NamePicker({ name, women, names, onPick, onCreateName, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const womenOptions = (women || [])
    .filter(w => (w.name || '').trim())
    .map(w => ({ id: w.id, name: w.name, linked: true }));
  const womenNamesLower = new Set(womenOptions.map(o => o.name.toLowerCase()));
  const nameOnlyOptions = (names || [])
    .filter(m => (m.label || '').trim() && !womenNamesLower.has(m.label.toLowerCase()))
    .map(m => ({ id: m.id, name: m.label, linked: false }));
  const options = [...womenOptions, ...nameOnlyOptions].sort((a, b) => a.name.localeCompare(b.name));
  const isOrphan = !!name && !options.some(o => o.name.toLowerCase() === name.toLowerCase());

  const commit = () => {
    const val = draft.trim();
    if (!val) { setAdding(false); return; }
    const existing = options.find(o => o.name.toLowerCase() === val.toLowerCase());
    if (existing) {
      onPick(existing.name, existing.linked ? existing.id : null);
    } else {
      onCreateName(val);
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
    return <img src={url} alt="" onError={() => setBroken(true)} className="ld-avatar-dot" />;
  }
  if (avatar) {
    return (
      <span className="ld-avatar-dot" style={{ overflow: 'hidden', display: 'inline-block' }}>
        <CustomAvatar avatar={avatar} />
      </span>
    );
  }
  return <span className="ld-avatar-dot ld-avatar-fallback" aria-hidden="true">{initials}</span>;
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
