import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import FaithJourneyPageSettings from './FaithJourneyPageSettings';
import { useUserStoreKey } from '../../lib/userStore';
import {
  ALL_AGES_STAGE, SINGLE_STAGE, useLifeStages, useFaithJourney, useLifeStageInfo, makeStageGroup, useBibleStudies,
  lifeStagePatchFor, makeChecklistItem, MEETING_DAYS, MEETING_TIMES, MEETING_FREQUENCIES, CONTACT_FREQUENCIES,
} from './womensListsConfig';
/* .ys-* form primitives (Youth roster) + .app-* shell classes
   (shared) — same reuse pattern as AllWomen.jsx. Everything else
   on this page (journey strip, dashboard, groups, roster) is
   purpose-built, prefix .wls-*, see LifeStages.css. */
import '../youth/AllStudents.css';
import './LifeStages.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Life Stages

   Not a directory clone — a sidebar + detail split built around
   the idea that life stages are a JOURNEY, not just a filter:

     1. Stage sidebar — a single arrow-connected vertical journey:
        "All Ages" first, then every configured life stage (built-in
        + custom, from useLifeStages()) in list order, all styled
        and connected identically — no stage gets special treatment.
        Adding or removing a stage from All Women's Page Settings
        changes this sidebar to match. Picking a stage sets the
        active stage for the detail pane beside it.
     2. Stage dashboard — stats, a point-leader, and care-focus
        notes for the active stage.
     3. Incoming transitions — anyone flagged elsewhere as possibly
        moving into the active stage, with one-click confirm.
     4. Meeting groups — a stage can run more than one group (e.g.
        two different Moms' groups); add/rename/remove here.
     5. Roster — filterable by group / needs-care, with inline
        group-assign and transition-flagging, deep-linking out to
        the full record on All Women.

   Storage:
     women (read/write): useUserStoreKey('womens:women', [])
     per-stage info:      useLifeStageInfo() → womens:life-stage-info
   ───────────────────────────────────────────────────────────── */

function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const norm = (s) => (s || '').trim().toLowerCase();

/* Meeting groups' Day/Time/How-often fields are dropdowns over the
   fixed lists shared with Bible Studies (see womensListsConfig.js) —
   a group created before these existed may carry a custom string
   that isn't in any of them; GroupEdit adds that value as a one-off
   extra <option> so it stays visible and selected instead of
   silently blanking out. */

export default function LifeStages() {
  const [women, setWomen] = useUserStoreKey('womens:women', []);
  const [stageInfo, setStageInfo] = useLifeStageInfo();
  const [leadersList] = useUserStoreKey('womens:leaders', []);
  const [bibleStudies] = useBibleStudies();
  /* Archived (unchecked "Currently in the ministry") women are hidden
     from every stage roster, count, and Incoming Transitions panel on
     this page — matches All Women's directory, which hides them too. */
  const list = (Array.isArray(women) ? women : []).filter(w => w.active !== false);
  const info = stageInfo && typeof stageInfo === 'object' ? stageInfo : {};
  const navigate = useNavigate();
  const lifeStages = useLifeStages();
  const faithJourney = useFaithJourney();
  const stages = Array.isArray(lifeStages.stages) ? lifeStages.stages : [];
  const bibleStudyList = Array.isArray(bibleStudies) ? bibleStudies : [];

  /* Group Leader dropdown draws from the Leaders page roster (plus
     a "Me" option, added inline in StageGroups) — same
     foreign-key-by-name-string convention as `leader` on Bible
     Studies/Prayer Groups, just sourced from a real name list
     instead of free text. */
  const groupLeaderOptions = useMemo(
    () => Array.from(new Set((Array.isArray(leadersList) ? leadersList : []).map(l => (l.name || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b)),
    [leadersList]
  );

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [activeStage, setActiveStage] = useState(ALL_AGES_STAGE);
  const [rosterFilter, setRosterFilter] = useState('all'); // 'all' | 'flagged' | 'no-group' | `group:<label>`

  const byStage = useMemo(() => {
    const map = {};
    for (const stage of stages) map[stage] = [];
    for (const w of list) {
      if (w.lifeStage && map[w.lifeStage]) map[w.lifeStage].push(w);
    }
    for (const stage of stages) map[stage].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return map;
  }, [list, stages]);

  const unassigned = useMemo(
    () => list.filter(w => !w.lifeStage || !stages.includes(w.lifeStage)),
    [list, stages]
  );

  /* SINGLE_STAGE is a pseudo-stage, not a real entry in `stages` — its
     roster is every woman with the `single` checkbox on, independent
     of whatever (if any) lifeStage she's actually progressing through.
     This one helper resolves "who's in this stage" for ALL_AGES_STAGE,
     SINGLE_STAGE, and every real stage alike, so the rest of the page
     never has to special-case them separately. */
  const womenForStage = (stage) => {
    if (stage === ALL_AGES_STAGE) return list;
    if (stage === SINGLE_STAGE) return list.filter(w => w.single);
    return byStage[stage] || [];
  };

  const womenNames = useMemo(
    () => Array.from(new Set(list.map(w => (w.name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [list]
  );

  const incomingCountFor = (stage) => list.filter(w => w.suggestedNextStage === stage && w.lifeStage !== stage).length;

  const stageStats = (stage) => {
    const w = womenForStage(stage);
    const total = w.length;
    const inStudy = w.filter(x => (x.bibleStudy || '').trim()).length;
    const noMentor = w.filter(x => !(x.mentor || '').trim()).length;
    const flagged = w.filter(x => x.careStatus === 'flagged').length;
    return { total, inStudy, noMentor, flagged };
  };

  const activeInfo = info[activeStage] || {};
  const activeGroups = Array.isArray(activeInfo.groups) ? activeInfo.groups : [];
  const activeLeaders = Array.isArray(activeInfo.leaders)
    ? activeInfo.leaders
    : (activeInfo.leader ? [activeInfo.leader] : []);
  const activeCarePoints = Array.isArray(activeInfo.carePoints)
    ? activeInfo.carePoints
    : (activeInfo.careFocus ? activeInfo.careFocus.split('\n').map(s => s.trim()).filter(Boolean) : []);
  const incoming = useMemo(
    () => list.filter(w => w.suggestedNextStage === activeStage && w.lifeStage !== activeStage),
    [list, activeStage]
  );

  const updateStageInfo = (stage, patch) => {
    setStageInfo(prev => {
      const base = prev && typeof prev === 'object' ? prev : {};
      return { ...base, [stage]: { ...(base[stage] || {}), ...patch } };
    });
  };

  /* Returns the new group's id so StageGroups can drop it straight
     into edit mode (matching a freshly added group is otherwise
     ambiguous — several could share blank fields). */
  const addGroup = () => {
    const group = makeStageGroup();
    updateStageInfo(activeStage, { groups: [...activeGroups, group] });
    return group.id;
  };

  /* Bible Study items and My Involvement → Bible Study Builder plans
     share one Firestore array (see womensListsConfig.js docs) —
     ministry studies carry a `label`, Builder plans carry a `title`.
     Deep-link with a query param so the destination page can select
     the exact record (mirrors AllWomen.jsx's ?woman= convention). */
  const openBibleStudy = (studyId) => {
    const study = bibleStudyList.find(s => s.id === studyId);
    if (!study) return;
    if ((study.label || '').trim()) {
      navigate(`/womens/bible-studies?study=${studyId}`);
    } else {
      navigate(`/womens/my-involvement?tab=bible-studio&plan=${studyId}`);
    }
  };

  const updateGroup = (id, patch) => {
    const current = activeGroups.find(g => g.id === id);
    const bibleStudyChanged = current && patch.bibleStudyId !== undefined && patch.bibleStudyId !== current.bibleStudyId;
    const linkedStudy = bibleStudyChanged && patch.bibleStudyId ? bibleStudyList.find(s => s.id === patch.bibleStudyId) : null;
    /* Linking a group to a ministry-run Bible Study (one with a
       `label`, as opposed to a woman's own Bible Study Builder plan)
       automates that study's own Day/Time/Location/How-often onto
       the group itself — the whole point of linking the two is that
       the group's schedule IS the study's schedule, so a leader
       shouldn't have to re-enter it a second time. Only fields the
       study actually has set are pulled over; anything already on
       the group is left alone otherwise. */
    const schedulePatch = (linkedStudy && (linkedStudy.label || '').trim())
      ? {
          ...(linkedStudy.day ? { day: linkedStudy.day } : {}),
          ...(linkedStudy.time ? { time: linkedStudy.time } : {}),
          ...(linkedStudy.location ? { location: linkedStudy.location } : {}),
          ...(linkedStudy.frequency ? { frequency: linkedStudy.frequency } : {}),
        }
      : {};
    const fullPatch = { ...patch, ...schedulePatch };
    updateStageInfo(activeStage, { groups: activeGroups.map(g => g.id === id ? { ...g, ...fullPatch } : g) });

    if (current && patch.label !== undefined && patch.label !== current.label) {
      setWomen(prev => (prev || []).map(w =>
        (w.lifeStage === activeStage && w.lifeStageGroup === current.label)
          ? { ...w, lifeStageGroup: patch.label }
          : w
      ));
    }

    /* Linking (or relinking) a group to a ministry Bible Study also
       cascades that study's label onto every woman CURRENTLY in the
       group, so her All Women record and the study's own roster stay
       in sync automatically — same idea as the label-rename cascade
       just above, and mirrors Bible Studies' own rename cascade (see
       BibleStudies.jsx's updateStudy). Unlinking (or swapping to a
       study with no label, i.e. a Bible Study Builder plan) clears
       her bibleStudy field ONLY if it still matches the group's OLD
       linked study, so a bibleStudy she set herself elsewhere is
       never silently wiped out. */
    if (bibleStudyChanged) {
      const groupLabel = (patch.label !== undefined ? patch.label : current.label) || '';
      if (groupLabel) {
        const newLabel = (linkedStudy && (linkedStudy.label || '').trim()) ? linkedStudy.label : '';
        const oldStudy = current.bibleStudyId ? bibleStudyList.find(s => s.id === current.bibleStudyId) : null;
        const oldLabel = (oldStudy && (oldStudy.label || '').trim()) ? oldStudy.label : '';
        setWomen(prev => (prev || []).map(w => {
          if (w.lifeStage !== activeStage || w.lifeStageGroup !== groupLabel) return w;
          if (newLabel) return { ...w, bibleStudy: newLabel };
          if (oldLabel && norm(w.bibleStudy) === norm(oldLabel)) return { ...w, bibleStudy: '' };
          return w;
        }));
      }
    }
  };

  const removeGroup = (id) => {
    const current = activeGroups.find(g => g.id === id);
    updateStageInfo(activeStage, { groups: activeGroups.filter(g => g.id !== id) });
    if (current) {
      setWomen(prev => (prev || []).map(w =>
        (w.lifeStage === activeStage && w.lifeStageGroup === current.label)
          ? { ...w, lifeStageGroup: '' }
          : w
      ));
    }
  };

  /* Assigning a woman to a meeting group also carries over the
     group's linked ministry Bible Study (if any) onto her own
     bibleStudy field — same automation as updateGroup's cascade
     above, just triggered from the roster side instead of the
     group-editing side. A group with no study linked leaves her
     existing bibleStudy field untouched (joining a plain group
     shouldn't erase an unrelated study she's already in). */
  const assignGroup = (id, label) => {
    const group = activeGroups.find(g => g.label === label);
    const linkedStudy = group?.bibleStudyId ? bibleStudyList.find(s => s.id === group.bibleStudyId) : null;
    const studyLabel = (linkedStudy && (linkedStudy.label || '').trim()) ? linkedStudy.label : null;
    setWomen(prev => (prev || []).map(w => w.id === id
      ? { ...w, lifeStageGroup: label, ...(studyLabel ? { bibleStudy: studyLabel } : {}) }
      : w));
  };
  const setSuggestion = (id, stage) => setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, suggestedNextStage: stage } : w));
  /* Every place that SETS a woman's lifeStage funnels through
     lifeStagePatchFor() (womensListsConfig.js) so the "Newly Married
     auto-unchecks Single" rule applies no matter which entry point
     changed it — this same helper is used by All Women's Life Stage
     select and the roster's "Move up" button below. */
  const confirmMove    = (id, stage) => setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, ...lifeStagePatchFor(stage), suggestedNextStage: '' } : w));
  const openWoman      = (id) => navigate(`/womens/all?woman=${id}`);
  /* Bumps a woman to the NEXT stage in `stages`' order (same list the
     sidebar/journey renders) — a single record shared by All Women and
     Life Stages, so the move shows up on both pages immediately with
     no separate sync step. No-ops past the last stage or off the list. */
  const moveUpStage = (id) => {
    const w = list.find(x => x.id === id);
    if (!w) return;
    const idx = stages.indexOf(w.lifeStage);
    if (idx === -1 || idx >= stages.length - 1) return;
    const nextStage = stages[idx + 1];
    setWomen(prev => (prev || []).map(x => x.id === id ? { ...x, ...lifeStagePatchFor(nextStage), suggestedNextStage: '' } : x));
  };
  const setFaithJourneyFor = (id, stage) => setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, faithJourney: stage } : w));
  const setNotesFor        = (id, notes) => setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, notes } : w));
  const addPrayerRequest = (id, text) => setWomen(prev => (prev || []).map(w => w.id === id
    ? { ...w, prayerRequests: [{ id: makeId('wp'), text, createdAt: new Date().toISOString() }, ...(Array.isArray(w.prayerRequests) ? w.prayerRequests : [])] }
    : w));
  const removePrayerRequest = (id, reqId) => setWomen(prev => (prev || []).map(w => w.id === id
    ? { ...w, prayerRequests: (Array.isArray(w.prayerRequests) ? w.prayerRequests : []).filter(p => p.id !== reqId) }
    : w));

  const roster = useMemo(() => {
    let out = womenForStage(activeStage);
    if (rosterFilter === 'flagged')       out = out.filter(w => w.careStatus === 'flagged');
    else if (rosterFilter === 'no-group') out = out.filter(w => !(w.lifeStageGroup || '').trim());
    else if (rosterFilter.startsWith('group:')) out = out.filter(w => w.lifeStageGroup === rosterFilter.slice(6));
    return out;
  }, [byStage, activeStage, rosterFilter, list]);

  return (
    <WomensShell
      title="Life Stages"
      icon="🌱"
      subtitle="Every woman's season, mapped as a journey — dashboards, meeting groups, and transitions for each stage."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root">
        {list.length === 0 ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">🌱</div>
            <div className="app-empty-title">No one to place on the journey yet</div>
            <div className="app-empty-sub">
              Add women in All Women and set a life stage — they'll show up here automatically.
            </div>
          </div>
        ) : (
          <>
            {unassigned.length > 0 && (
              <div className="wls-unassigned">
                <span className="wls-unassigned-hd">
                  ⚠️ {unassigned.length} {unassigned.length === 1 ? 'woman has' : 'women have'} no life stage set —
                </span>
                <div className="wls-unassigned-list">
                  {unassigned.map(w => (
                    <button key={w.id} type="button" className="wls-unassigned-chip" onClick={() => openWoman(w.id)}>
                      {w.name || '(no name)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="wls-split">
              <StageSidebar
                activeStage={activeStage}
                onSelect={setActiveStage}
                countFor={(s) => womenForStage(s).length}
                incomingCountFor={incomingCountFor}
                stages={stages}
                getStageMeta={lifeStages.getStageMeta}
              />

              <div className="wls-detail">
                <StageDashboard
                  stage={activeStage}
                  stats={stageStats(activeStage)}
                  leaders={activeLeaders}
                  carePoints={activeCarePoints}
                  onChangeLeaders={(arr) => updateStageInfo(activeStage, { leaders: arr })}
                  onChangeCarePoints={(arr) => updateStageInfo(activeStage, { carePoints: arr })}
                  onFilterFlagged={() => setRosterFilter(rosterFilter === 'flagged' ? 'all' : 'flagged')}
                  flaggedActive={rosterFilter === 'flagged'}
                  leaderNames={womenNames}
                  meName={avatarSourceName}
                  getStageMeta={lifeStages.getStageMeta}
                />

                {incoming.length > 0 && (
                  <IncomingTransitions
                    stage={activeStage}
                    women={incoming}
                    onConfirm={confirmMove}
                    onDismiss={(id) => setSuggestion(id, '')}
                    onOpen={openWoman}
                  />
                )}

                <StageGroups
                  groups={activeGroups}
                  countFor={(label) => womenForStage(activeStage).filter(w => w.lifeStageGroup === label).length}
                  onAdd={addGroup}
                  onChange={updateGroup}
                  onRemove={removeGroup}
                  leaderOptions={groupLeaderOptions}
                  meName={avatarSourceName}
                  bibleStudies={bibleStudyList}
                  onOpenBibleStudy={openBibleStudy}
                />

                <StageRoster
                  stage={activeStage}
                  women={roster}
                  total={womenForStage(activeStage).length}
                  groups={activeGroups}
                  filter={rosterFilter}
                  onFilter={setRosterFilter}
                  onAssignGroup={assignGroup}
                  onSetSuggestion={setSuggestion}
                  onOpen={openWoman}
                  stages={stages}
                  faithJourneyStages={faithJourney.stages}
                  getFaithJourneyMeta={faithJourney.getStageMeta}
                  onSetFaithJourney={setFaithJourneyFor}
                  onSetNotes={setNotesFor}
                  onAddPrayerRequest={addPrayerRequest}
                  onRemovePrayerRequest={removePrayerRequest}
                  onMoveUpStage={moveUpStage}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
        guideTabLabel="📋 Page Settings"
        guide={<FaithJourneyPageSettings faithJourney={faithJourney} />}
      />
    </WomensShell>
  );
}

/* ── 1. Stage sidebar — one flat arrow-journey list ───────────── */
function StageSidebar({ activeStage, onSelect, countFor, incomingCountFor, stages, getStageMeta }) {
  /* SINGLE_STAGE is pinned right after ALL_AGES_STAGE — both are
     overview-style pseudo-stages (not steps in the sequential
     journey), so no arrow connects them to each other or to the
     first real stage below. */
  const items = [ALL_AGES_STAGE, SINGLE_STAGE, ...stages];
  return (
    <nav className="wls-sidebar" aria-label="Life stages">
      <div className="wls-sidebar-list">
        {items.map((stage, i) => (
          <div key={stage} className="wls-sidebar-item">
            <StageNode
              stage={stage}
              active={stage === activeStage}
              count={countFor(stage)}
              incoming={(stage === ALL_AGES_STAGE || stage === SINGLE_STAGE) ? 0 : incomingCountFor(stage)}
              onClick={() => onSelect(stage)}
              vertical
              getStageMeta={getStageMeta}
            />
            {i === 1 ? (
              <span className="wls-sidebar-indent" aria-hidden="true" />
            ) : (
              i > 1 && i < items.length - 1 && <span className="wls-sidebar-arrow" aria-hidden="true">↓</span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

function StageNode({ stage, active, count, incoming, onClick, vertical, getStageMeta }) {
  const meta = getStageMeta(stage) || {};
  return (
    <button type="button" className={`wls-node${vertical ? ' vertical' : ''}${active ? ' on' : ''}`} onClick={onClick}>
      {incoming > 0 && <span className="wls-node-badge">+{incoming}</span>}
      <span className="wls-node-icon">{meta.icon || '🌸'}</span>
      <span className="wls-node-name">{stage}</span>
      <span className="wls-node-count">{count}</span>
    </button>
  );
}

/* ── 2. Stage dashboard — stats + leader + care focus ────────── */
function StageDashboard({ stage, stats, leaders, carePoints, onChangeLeaders, onChangeCarePoints, onFilterFlagged, flaggedActive, leaderNames, meName, getStageMeta }) {
  const meta = getStageMeta(stage) || {};
  return (
    <section className="wls-panel">
      <div className="wls-panel-hd">
        <span className="wls-panel-icon">{meta.icon || '🌸'}</span>
        <div>
          <h2 className="wls-panel-title">{stage}</h2>
          {meta.blurb && <div className="wls-panel-blurb">{meta.blurb}</div>}
        </div>
        <LeaderField leaders={leaders} onChange={onChangeLeaders} names={leaderNames} meName={meName} />
      </div>

      <div className="wls-stat-row">
        <div className="wls-stat"><span className="wls-stat-n">{stats.total}</span><span className="wls-stat-lbl">Women</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.inStudy}</span><span className="wls-stat-lbl">In a study</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.noMentor}</span><span className="wls-stat-lbl">No mentor</span></div>
        <button
          type="button"
          className={`wls-stat is-flag${flaggedActive ? ' on' : ''}${stats.flagged > 0 ? ' has-flag' : ''}`}
          onClick={onFilterFlagged}
          disabled={!stats.flagged}
        >
          <span className="wls-stat-n">{stats.flagged}</span><span className="wls-stat-lbl">Needs care</span>
        </button>
      </div>

      <CareFocusField points={carePoints} onChange={onChangeCarePoints} />
    </section>
  );
}

/* Point leader(s) — one or more clickable avatar chips. Double-click
   any chip (or elsewhere in the field) to enter editing mode, which
   reveals a "+ Add Leader" button; clicking outside the field closes
   editing mode again. Removing a leader is done from inside their own
   editor (🗑), not via a standing X on the chip. With zero leaders
   assigned, a dashed "+ Add leader" chip is always there (nothing
   else to double-click yet) — double-click it to add the first one.
   Each editor is the same search box over the names already in All
   Women (`names`), plus a pinned "Me" suggestion (`meName`) for
   one-click self-assignment. Still stores plain name strings — no
   separate people directory — but reads and edits like a real
   multi-assign. */
function LeaderField({ leaders, onChange, names, meName }) {
  const list = Array.isArray(leaders) ? leaders : (leaders ? [leaders] : []);
  const [fieldEditing, setFieldEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // null | number | 'new'
  const [draft, setDraft] = useState('');
  const wrapRef = useRef(null);

  /* Double-clicking anywhere in the field opens editing mode (× on
     each chip, "+ Add Leader" button); clicking outside closes it. */
  useEffect(() => {
    if (!fieldEditing) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFieldEditing(false);
        setEditingIndex(null);
        setDraft('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [fieldEditing]);

  function startEdit(index) {
    setFieldEditing(true);
    setDraft(index === 'new' ? '' : (list[index] || ''));
    setEditingIndex(index);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setDraft('');
  }

  function handleFieldDoubleClick(e) {
    if (e.target.closest('.wls-leader-chip')) return; // chip handles its own double-click
    setFieldEditing(true);
  }

  function commit(value) {
    const next = (value ?? draft).trim();
    if (editingIndex === 'new') {
      if (next) onChange([...list, next]);
    } else if (typeof editingIndex === 'number') {
      if (next) onChange(list.map((n, i) => (i === editingIndex ? next : n)));
      else onChange(list.filter((_, i) => i !== editingIndex));
    }
    cancelEdit();
  }

  function removeLeader(index) {
    onChange(list.filter((_, i) => i !== index));
  }

  function deleteEditing() {
    if (typeof editingIndex === 'number') removeLeader(editingIndex);
    cancelEdit();
  }

  const editingName = typeof editingIndex === 'number' ? (list[editingIndex] || '') : '';
  const q = draft.trim().toLowerCase();
  const nameList = Array.isArray(names) ? names : [];
  const taken = new Set(list.map(n => n.toLowerCase()).filter(n => n !== editingName.toLowerCase()));
  const matches = nameList
    .filter(n => !taken.has(n.toLowerCase()))
    .filter(n => n.toLowerCase() !== editingName.toLowerCase())
    .filter(n => !meName || n.toLowerCase() !== meName.toLowerCase())
    .filter(n => !q || n.toLowerCase().includes(q))
    .slice(0, 6);
  const showMe = !!meName && !taken.has(meName.toLowerCase()) && meName.toLowerCase() !== editingName.toLowerCase()
    && (!q || meName.toLowerCase().includes(q));

  return (
    <div className="wls-leader-field" ref={wrapRef} onDoubleClick={handleFieldDoubleClick}>
      <span>Point {list.length === 1 ? 'leader' : 'leaders'}</span>
      <div className="wls-leader-chips">
        {list.map((name, i) => (
          editingIndex === i ? (
            <LeaderSearchBox
              key={i}
              draft={draft}
              setDraft={setDraft}
              onCommit={commit}
              onCancel={cancelEdit}
              onDelete={deleteEditing}
              showMe={showMe}
              matches={matches}
              meName={meName}
            />
          ) : (
            <button
              key={i}
              type="button"
              className="wls-leader-chip"
              onDoubleClick={() => startEdit(i)}
              title="Double-click to edit"
            >
              <span className="wls-leader-avatar">{initialsFor(name)}</span>
              <span className="wls-leader-name">{name}</span>
            </button>
          )
        ))}

        {editingIndex === 'new' ? (
          <LeaderSearchBox
            draft={draft}
            setDraft={setDraft}
            onCommit={commit}
            onCancel={cancelEdit}
            showMe={showMe}
            matches={matches}
            meName={meName}
          />
        ) : list.length === 0 ? (
          <button type="button" className="wls-leader-chip empty" onDoubleClick={() => startEdit('new')} title="Double-click to add">
            + Add leader
          </button>
        ) : fieldEditing ? (
          <button type="button" className="wls-leader-chip empty" onClick={() => startEdit('new')} title="Add another leader">
            + Add Leader
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LeaderSearchBox({ draft, setDraft, onCommit, onCancel, onDelete, showMe, matches, meName }) {
  /* Committing on Enter unmounts this input (it swaps back to a plain
     chip), and browsers fire a native blur when a focused element is
     removed — which would otherwise re-trigger the onBlur commit a
     second time with a stale draft. This flag makes that follow-up
     blur a no-op. */
  const suppressBlurRef = useRef(false);
  return (
    <div className="wls-leader-search">
      <div className="wls-leader-search-row">
        <input
          type="text"
          className="ys-inp wls-leader-input"
          autoFocus
          placeholder="Search All Women, or type a name…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            if (suppressBlurRef.current) { suppressBlurRef.current = false; return; }
            onCommit();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); suppressBlurRef.current = true; onCommit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
        />
        {onDelete && (
          <button
            type="button"
            className="wls-leader-delete"
            title="Delete this leader"
            onMouseDown={e => e.preventDefault()}
            onClick={onDelete}
          >
            🗑
          </button>
        )}
      </div>
      {(showMe || matches.length > 0) && (
        <div className="wls-leader-suggest">
          {showMe && (
            <button
              type="button"
              className="wls-leader-suggest-item is-me"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onCommit(meName)}
            >
              🙋 Me <span className="wls-leader-suggest-sub">— {meName}</span>
            </button>
          )}
          {matches.map(n => (
            <button
              key={n}
              type="button"
              className="wls-leader-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onCommit(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Care focus — a short bullet list of notes for the active stage,
   same double-click-to-edit / click-outside-to-close pattern as
   Point leader(s) above: each point opens its own inline editor
   independently (editingIndex), so editing one point never blocks
   double-clicking into another. `fieldEditing` just gates whether
   the "+ Add point" control is visible — removing a point is done
   from inside its own editor (🗑), not via a standing X. */
function CareFocusField({ points, onChange }) {
  const list = Array.isArray(points) ? points : [];
  const [fieldEditing, setFieldEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // null | number | 'new'
  const [draft, setDraft] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!fieldEditing) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFieldEditing(false);
        setEditingIndex(null);
        setDraft('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [fieldEditing]);

  function startEdit(index) {
    setFieldEditing(true);
    setDraft(index === 'new' ? '' : (list[index] || ''));
    setEditingIndex(index);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setDraft('');
  }

  function handleFieldDoubleClick(e) {
    if (e.target.closest('.wls-care-point')) return; // point handles its own double-click
    setFieldEditing(true);
  }

  function commit(value) {
    const next = (value ?? draft).trim();
    if (editingIndex === 'new') {
      if (next) onChange([...list, next]);
    } else if (typeof editingIndex === 'number') {
      if (next) onChange(list.map((p, i) => (i === editingIndex ? next : p)));
      else onChange(list.filter((_, i) => i !== editingIndex));
    }
    cancelEdit();
  }

  function removePoint(i) {
    onChange(list.filter((_, idx) => idx !== i));
  }

  function deleteEditing() {
    if (typeof editingIndex === 'number') removePoint(editingIndex);
    cancelEdit();
  }

  return (
    <div className="ys-field wls-focus-field" ref={wrapRef} onDoubleClick={handleFieldDoubleClick}>
      <span className="ys-field-lbl">
        Care focus for this stage
      </span>

      {list.length === 0 && editingIndex !== 'new' ? (
        <div className="wls-empty-note" onDoubleClick={() => startEdit('new')}>
          Double-click to add care-focus notes for this stage.
        </div>
      ) : (
        <ul className="wls-care-list">
          {list.map((p, i) => (
            <li className="wls-care-point" key={i}>
              {editingIndex === i ? (
                <CarePointEditor draft={draft} setDraft={setDraft} onCommit={commit} onCancel={cancelEdit} onDelete={deleteEditing} />
              ) : (
                <span className="wls-care-point-text" onDoubleClick={() => startEdit(i)} title="Double-click to edit">
                  {p}
                </span>
              )}
            </li>
          ))}
          {editingIndex === 'new' && (
            <li className="wls-care-point">
              <CarePointEditor draft={draft} setDraft={setDraft} onCommit={commit} onCancel={cancelEdit} />
            </li>
          )}
        </ul>
      )}

      {fieldEditing && editingIndex !== 'new' && (
        <button type="button" className="wls-care-add" onClick={() => startEdit('new')}>+ Add point</button>
      )}
    </div>
  );
}

function CarePointEditor({ draft, setDraft, onCommit, onCancel, onDelete }) {
  /* Same blur-after-Enter guard as LeaderSearchBox — committing on
     Enter unmounts this input, and the resulting native blur would
     otherwise re-fire onCommit with a stale draft. */
  const suppressBlurRef = useRef(false);
  return (
    <div className="wls-care-row">
      <input
        type="text"
        className="ys-inp wls-care-input"
        autoFocus
        placeholder="What this season tends to need — sleep support, marriage prep, grief care…"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (suppressBlurRef.current) { suppressBlurRef.current = false; return; }
          onCommit();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); suppressBlurRef.current = true; onCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      {onDelete && (
        <button
          type="button"
          className="wls-leader-delete"
          title="Delete this point"
          onMouseDown={e => e.preventDefault()}
          onClick={onDelete}
        >🗑</button>
      )}
    </div>
  );
}

/* ── 3. Incoming transitions ──────────────────────────────────── */
function IncomingTransitions({ stage, women, onConfirm, onDismiss, onOpen }) {
  return (
    <section className="wls-panel wls-transitions">
      <h3 className="wls-panel-subtitle">🔁 May be moving into {stage}</h3>
      <ul className="wls-transition-list">
        {women.map(w => (
          <li key={w.id} className="wls-transition-row">
            <span className="wls-transition-name">{w.name || '(no name)'}</span>
            <span className="wls-transition-from">from {w.lifeStage || 'no stage'}</span>
            <span className="wls-transition-actions">
              <button type="button" className="wls-btn-confirm" onClick={() => onConfirm(w.id, stage)}>✓ Confirm move</button>
              <button type="button" className="wls-btn-ghost" onClick={() => onDismiss(w.id)}>Dismiss</button>
              <button type="button" className="wls-btn-ghost" onClick={() => onOpen(w.id)}>Open →</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 4. Meeting groups manager ───────────────────────────────── */
function StageGroups({ groups, countFor, onAdd, onChange, onRemove, leaderOptions, meName, bibleStudies, onOpenBibleStudy }) {
  const [editingId, setEditingId] = useState(null);

  const ministryStudies = useMemo(() => bibleStudies.filter(s => (s.label || '').trim()), [bibleStudies]);
  const builderPlans = useMemo(() => bibleStudies.filter(s => !(s.label || '').trim() && (s.title || '').trim()), [bibleStudies]);

  const handleAdd = () => {
    const id = onAdd();
    if (id) setEditingId(id);
  };

  const handleRemove = (id) => {
    onRemove(id);
    setEditingId(prev => (prev === id ? null : prev));
  };

  return (
    <section className="wls-panel">
      <div className="wls-panel-row">
        <h3 className="wls-panel-subtitle">Meeting groups</h3>
        <button type="button" className="ys-add-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleAdd}>＋ Add group</button>
      </div>
      {groups.length === 0 ? (
        <div className="wls-empty-note">No groups yet — this stage gathers as one big group, or hasn't been scheduled.</div>
      ) : (
        <div className="wls-group-grid">
          {groups.map(g => (
            <div key={g.id} className="wls-group-card">
              {editingId === g.id ? (
                <GroupEdit
                  group={g}
                  count={countFor(g.label)}
                  onChange={patch => onChange(g.id, patch)}
                  onRemove={() => handleRemove(g.id)}
                  onDone={() => setEditingId(null)}
                  leaderOptions={leaderOptions}
                  meName={meName}
                  ministryStudies={ministryStudies}
                  builderPlans={builderPlans}
                  onOpenBibleStudy={onOpenBibleStudy}
                />
              ) : (
                <GroupView
                  group={g}
                  count={countFor(g.label)}
                  onEdit={() => setEditingId(g.id)}
                  onChange={patch => onChange(g.id, patch)}
                  ministryStudies={ministryStudies}
                  builderPlans={builderPlans}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* Read-only summary for a meeting group, behind an "✎ Edit" button —
   same View/Edit split as RosterRow above, just scoped to one group
   card instead of one roster row. The prep checklist is the one
   exception to "read-only" — checking items off is a week-to-week
   task, not an editing task, so its checkboxes stay live here (see
   `onChange`) even though everything else in View is text. */
function GroupView({ group: g, count, onEdit, onChange, ministryStudies, builderPlans }) {
  const study = g.bibleStudyId
    ? [...ministryStudies, ...builderPlans].find(s => s.id === g.bibleStudyId)
    : null;
  const isBuilderPlan = !!study && !(study.label || '').trim();
  const scheduleLine = [g.day, g.time, g.location].filter(Boolean).join(' · ');
  const checklist = Array.isArray(g.checklist) ? g.checklist : [];

  const toggleItem = (itemId) => {
    onChange({ checklist: checklist.map(it => it.id === itemId ? { ...it, done: !it.done } : it) });
  };

  return (
    <div className="wls-group-view">
      <div className="wls-group-view-top">
        <span className="wls-group-view-name">{g.label || '(unnamed group)'}</span>
        <button type="button" className="wls-roster-edit-btn" onClick={onEdit}>✎ Edit</button>
      </div>
      <div className="wls-group-view-meta">{scheduleLine || 'No schedule set yet'}</div>
      {(g.startDate || g.frequency) && (
        <div className="wls-group-view-meta">
          {[g.startDate && `Started ${g.startDate}`, g.frequency].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="wls-group-view-meta">{g.leader ? `Led by ${g.leader}` : 'No leader set'}</div>
      <div className="wls-group-view-study">
        {study ? (
          <>📖 {study.label || study.title}{isBuilderPlan ? ' (Bible Study Builder plan)' : ''}</>
        ) : g.leaderDeveloping ? (
          '📝 Leader is developing a Bible Study'
        ) : (
          'No Bible Study set'
        )}
      </div>
      {(g.contactMode || g.contactFrequency) && (
        <div className="wls-group-view-meta">
          📞 Contacted {g.contactMode === 'individual' ? 'individually' : g.contactMode === 'whole' ? 'as a whole group' : ''}
          {g.contactFrequency ? ` · ${g.contactFrequency}` : ''}
        </div>
      )}

      {checklist.length > 0 && (
        <div className="wls-group-checklist">
          <span className="wls-group-checklist-title">Before this meeting starts</span>
          <ul className="wls-group-checklist-list">
            {checklist.map(item => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" checked={!!item.done} onChange={() => toggleItem(item.id)} />
                  <span className={item.done ? 'done' : ''}>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <span className="wls-group-count">{count} assigned</span>
    </div>
  );
}

/* Full editor for a meeting group — Day/Time are dropdowns (with a
   preserved extra option if the stored value predates the fixed
   list), Group leader is a dropdown over the Leaders page roster
   plus "Me", and Bible Study links into the SHARED
   `womens:bible-studies` list, which holds both ministry-run studies
   (Bible Studies page, `label`) and a woman's own plans from My
   Involvement → Bible Study Builder (`title`) — see
   womensListsConfig.js. Picking a study and checking "Leader is
   developing a Bible Study" are mutually exclusive. */
function GroupEdit({ group: g, count, onChange, onRemove, onDone, leaderOptions, meName, ministryStudies, builderPlans, onOpenBibleStudy }) {
  return (
    <>
      <div className="wls-group-row">
        <label className="wls-mini-field" style={{ flex: 1 }}>
          <span>Group name</span>
          <input
            type="text"
            className="ys-inp"
            placeholder="e.g. Tuesday Morning Moms"
            value={g.label}
            onChange={e => onChange({ label: e.target.value })}
          />
        </label>
        <button type="button" className="wls-group-del" onClick={onRemove} title="Remove group">✕</button>
      </div>
      <div className="wls-group-row three">
        <label className="wls-mini-field">
          <span>Day</span>
          <select className="ys-inp" value={g.day} onChange={e => onChange({ day: e.target.value })}>
            <option value="">—</option>
            {MEETING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            {g.day && !MEETING_DAYS.includes(g.day) && <option value={g.day}>{g.day}</option>}
          </select>
        </label>
        <label className="wls-mini-field">
          <span>Time</span>
          <select className="ys-inp" value={g.time} onChange={e => onChange({ time: e.target.value })}>
            <option value="">—</option>
            {MEETING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
            {g.time && !MEETING_TIMES.includes(g.time) && <option value={g.time}>{g.time}</option>}
          </select>
        </label>
        <label className="wls-mini-field">
          <span>Location</span>
          <input type="text" className="ys-inp" placeholder="e.g. Room 204" value={g.location} onChange={e => onChange({ location: e.target.value })} />
        </label>
      </div>
      <div className="wls-group-row three">
        <label className="wls-mini-field">
          <span>Start date</span>
          <input type="date" className="ys-inp" value={g.startDate || ''} onChange={e => onChange({ startDate: e.target.value })} />
        </label>
        <label className="wls-mini-field">
          <span>How often</span>
          <select className="ys-inp" value={g.frequency || ''} onChange={e => onChange({ frequency: e.target.value })}>
            <option value="">—</option>
            {MEETING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            {g.frequency && !MEETING_FREQUENCIES.includes(g.frequency) && <option value={g.frequency}>{g.frequency}</option>}
          </select>
        </label>
      </div>
      <div className="wls-group-row">
        <label className="wls-mini-field" style={{ flex: 1 }}>
          <span>Group leader</span>
          <select className="ys-inp" value={g.leader} onChange={e => onChange({ leader: e.target.value })}>
            <option value="">—</option>
            {meName && <option value={meName}>🙋 Me — {meName}</option>}
            {leaderOptions.filter(n => n !== meName).map(n => <option key={n} value={n}>{n}</option>)}
            {g.leader && g.leader !== meName && !leaderOptions.includes(g.leader) && <option value={g.leader}>{g.leader}</option>}
          </select>
        </label>
        <span className="wls-group-count">{count} assigned</span>
      </div>
      <div className="wls-group-row">
        <label className="wls-mini-field" style={{ flex: 1 }}>
          <span>Bible Study</span>
          <select
            className="ys-inp"
            value={g.bibleStudyId || ''}
            disabled={!!g.leaderDeveloping}
            onChange={e => onChange({ bibleStudyId: e.target.value, leaderDeveloping: false })}
          >
            <option value="">— none chosen —</option>
            {ministryStudies.length > 0 && (
              <optgroup label="Bible Studies">
                {ministryStudies.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            )}
            {builderPlans.length > 0 && (
              <optgroup label="My Bible Study Builder plans">
                {builderPlans.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        {g.bibleStudyId && (
          <button type="button" className="wls-roster-open" onClick={() => onOpenBibleStudy(g.bibleStudyId)}>Open →</button>
        )}
      </div>
      <label className="wls-group-check">
        <input
          type="checkbox"
          checked={!!g.leaderDeveloping}
          onChange={e => onChange({ leaderDeveloping: e.target.checked, bibleStudyId: e.target.checked ? '' : g.bibleStudyId })}
        />
        <span>Leader is developing a Bible Study (no set curriculum yet)</span>
      </label>

      <div className="wls-group-row">
        <label className="wls-mini-field">
          <span>Contact the group…</span>
          <select className="ys-inp" value={g.contactMode || ''} onChange={e => onChange({ contactMode: e.target.value })}>
            <option value="">—</option>
            <option value="whole">As a whole group</option>
            <option value="individual">Individually</option>
          </select>
        </label>
        <label className="wls-mini-field">
          <span>Contact frequency</span>
          <select className="ys-inp" value={g.contactFrequency || ''} onChange={e => onChange({ contactFrequency: e.target.value })}>
            <option value="">—</option>
            {CONTACT_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            {g.contactFrequency && !CONTACT_FREQUENCIES.includes(g.contactFrequency) && <option value={g.contactFrequency}>{g.contactFrequency}</option>}
          </select>
        </label>
      </div>

      <GroupChecklistEditor group={g} onChange={onChange} />

      <div className="wls-group-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="wls-roster-edit-btn" onClick={onDone}>✓ Done</button>
      </div>
    </>
  );
}

/* Pre-meeting-prep checklist — items are added/renamed/removed here
   in Edit mode, but checked off week-to-week in View mode (see
   GroupView's own `onChange` above) — editing the LIST and checking
   PROGRESS are different tasks done at different times, so they're
   split across the two modes rather than living in just one. */
function GroupChecklistEditor({ group: g, onChange }) {
  const [draft, setDraft] = useState('');
  const checklist = Array.isArray(g.checklist) ? g.checklist : [];

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange({ checklist: [...checklist, makeChecklistItem(label)] });
    setDraft('');
  };
  const remove = (id) => onChange({ checklist: checklist.filter(it => it.id !== id) });

  return (
    <div className="wls-mini-field">
      <span>Checklist — before this meeting starts</span>
      {checklist.length > 0 && (
        <ul className="wls-group-checklist-list edit">
          {checklist.map(item => (
            <li key={item.id}>
              <span>{item.label}</span>
              <button type="button" className="wls-leader-delete" title="Remove" onClick={() => remove(item.id)}>🗑</button>
            </li>
          ))}
        </ul>
      )}
      <div className="wls-roster-prayer-add">
        <input
          type="text"
          className="ys-inp"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Set up chairs, print handouts, confirm childcare…"
        />
        <button type="button" className="ys-add-btn" disabled={!draft.trim()} onClick={add}>＋</button>
      </div>
    </div>
  );
}

/* ── 5. Roster — filter + inline group/transition assignment ─── */
function StageRoster({
  stage, women, total, groups, filter, onFilter, onAssignGroup, onSetSuggestion, onOpen, stages,
  faithJourneyStages, getFaithJourneyMeta, onSetFaithJourney, onSetNotes, onAddPrayerRequest, onRemovePrayerRequest,
  onMoveUpStage,
}) {
  /* "All"/"No group" stay as chips (there are always exactly two),
     but individual groups render as a dropdown instead of an
     ever-growing row of chips — a stage can accumulate a lot of
     meeting groups over time, and a <select> stays compact no
     matter how many there are. */
  const isGroupFilter = filter.startsWith('group:');
  return (
    <section className="wls-panel">
      <div className="wls-panel-row">
        <h3 className="wls-panel-subtitle">Roster ({women.length}{women.length !== total ? ` of ${total}` : ''})</h3>
      </div>

      <div className="wls-roster-filters">
        <button type="button" className={`wls-filter-chip${filter === 'all' ? ' on' : ''}`} onClick={() => onFilter('all')}>All</button>
        <button type="button" className={`wls-filter-chip${filter === 'no-group' ? ' on' : ''}`} onClick={() => onFilter('no-group')}>No group</button>
        {groups.length > 0 && (
          <select
            className={`wls-roster-group-filter${isGroupFilter ? ' on' : ''}`}
            value={isGroupFilter ? filter.slice(6) : ''}
            onChange={e => onFilter(e.target.value ? `group:${e.target.value}` : 'all')}
          >
            <option value="">Filter by group…</option>
            {groups.map(g => (
              <option key={g.id} value={g.label}>{g.label || '(unnamed group)'}</option>
            ))}
          </select>
        )}
      </div>

      {women.length === 0 ? (
        <div className="wls-empty-note">No one matches this filter.</div>
      ) : (
        <ul className="wls-roster">
          {women.map(w => (
            <RosterRow
              key={w.id}
              woman={w}
              groups={groups}
              stages={stages}
              faithJourneyStages={faithJourneyStages}
              getFaithJourneyMeta={getFaithJourneyMeta}
              onAssignGroup={onAssignGroup}
              onSetSuggestion={onSetSuggestion}
              onSetFaithJourney={onSetFaithJourney}
              onSetNotes={onSetNotes}
              onAddPrayerRequest={onAddPrayerRequest}
              onRemovePrayerRequest={onRemovePrayerRequest}
              onOpen={onOpen}
              onMoveUpStage={onMoveUpStage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* One roster entry — View mode (default) shows a compact read-only
   summary (name, meta, group/faith-journey badges, notes preview,
   prayer requests) behind an "✎ Edit" button; Edit mode reveals the
   full set of inline controls (group / suggest-next-stage / faith
   journey selects, notes textarea, prayer-request bullet editor)
   behind a "✓ Done" button that returns to View. Mode is local to
   each row — switching one woman to Edit doesn't affect any other
   row in the list. */
function RosterRow({
  woman: w, groups, stages, faithJourneyStages, getFaithJourneyMeta,
  onAssignGroup, onSetSuggestion, onSetFaithJourney, onSetNotes,
  onAddPrayerRequest, onRemovePrayerRequest, onOpen, onMoveUpStage,
}) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [notesDraft, setNotesDraft] = useState(w.notes || '');
  const [prayerDraft, setPrayerDraft] = useState('');
  const prayerRequests = Array.isArray(w.prayerRequests) ? w.prayerRequests : [];

  const commitNotes = () => {
    if (notesDraft !== (w.notes || '')) onSetNotes(w.id, notesDraft);
  };

  const addPrayer = () => {
    const text = prayerDraft.trim();
    if (!text) return;
    onAddPrayerRequest(w.id, text);
    setPrayerDraft('');
  };

  /* "Move up Life Stage" bumps her to the NEXT stage in `stages`'
     order — hidden once she's on the last stage (or has no stage
     set yet) since there's nowhere further to move her. */
  const stageIdx = stages.indexOf(w.lifeStage);
  const nextStage = stageIdx > -1 && stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;

  return (
    <li className="wls-roster-row">
      <div className="wls-roster-top">
        <span className="wls-roster-name">{w.name || '(no name)'}</span>
        <span className="wls-roster-meta">
          {[w.bibleStudy, w.mentor && `Mentor: ${w.mentor}`].filter(Boolean).join(' · ') || '—'}
        </span>
        <span className="wls-roster-row-actions">
          {nextStage && (
            <button
              type="button"
              className="wls-roster-move-btn"
              onClick={() => onMoveUpStage(w.id)}
              title={`Move to ${nextStage}`}
            >
              ⬆ Move to {nextStage}
            </button>
          )}
          <button
            type="button"
            className="wls-roster-edit-btn"
            onClick={() => { setNotesDraft(w.notes || ''); setMode(mode === 'edit' ? 'view' : 'edit'); }}
          >
            {mode === 'edit' ? '✓ Done' : '✎ Edit'}
          </button>
          <button type="button" className="wls-roster-open" onClick={() => onOpen(w.id)}>Open →</button>
        </span>
      </div>

      {mode === 'view' ? (
        <div className="wls-roster-view">
          {(w.lifeStageGroup || w.faithJourney) && (
            <div className="wls-roster-badges">
              {w.lifeStageGroup && <span className="wls-roster-badge">👥 {w.lifeStageGroup}</span>}
              {w.faithJourney && (
                <span className="wls-roster-badge faith">
                  {getFaithJourneyMeta?.(w.faithJourney)?.icon || '✝️'} {w.faithJourney}
                </span>
              )}
            </div>
          )}
          {w.notes && <div className="wls-roster-notes-preview">{w.notes}</div>}
          {prayerRequests.length > 0 && (
            <ul className="wls-roster-prayer-list readonly">
              {prayerRequests.map(p => (
                <li key={p.id}>🙏 {p.text}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="wls-roster-edit">
          <div className="wls-roster-controls">
            <label>
              <span>Group</span>
              <select className="ys-inp" value={w.lifeStageGroup || ''} onChange={e => onAssignGroup(w.id, e.target.value)}>
                <option value="">—</option>
                {groups.map(g => <option key={g.id} value={g.label}>{g.label || '(unnamed group)'}</option>)}
              </select>
            </label>
            <label>
              <span>Suggest next stage</span>
              <select className="ys-inp" value={w.suggestedNextStage || ''} onChange={e => onSetSuggestion(w.id, e.target.value)}>
                <option value="">—</option>
                {stages.filter(s => s !== w.lifeStage).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              <span>Faith journey</span>
              <select className="ys-inp" value={w.faithJourney || ''} onChange={e => onSetFaithJourney(w.id, e.target.value)}>
                <option value="">—</option>
                {(faithJourneyStages || []).map(s => {
                  const short = getFaithJourneyMeta?.(s)?.short;
                  return <option key={s} value={s}>{s}{short ? ` (${short})` : ''}</option>;
                })}
              </select>
            </label>
          </div>

          <label className="wls-mini-field wls-roster-notes-field">
            <span>Notes</span>
            <textarea
              className="ys-inp wls-roster-notes-inp"
              rows={2}
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={commitNotes}
              placeholder="Anything worth remembering about her right now…"
            />
          </label>

          <div className="wls-mini-field">
            <span>Prayer requests</span>
            <div className="wls-roster-prayer-add">
              <input
                type="text"
                className="ys-inp"
                value={prayerDraft}
                onChange={e => setPrayerDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPrayer(); } }}
                placeholder="Healing, a decision, a family need…"
              />
              <button type="button" className="ys-add-btn" disabled={!prayerDraft.trim()} onClick={addPrayer}>＋</button>
            </div>
            {prayerRequests.length > 0 && (
              <ul className="wls-roster-prayer-list">
                {prayerRequests.map(p => (
                  <li key={p.id}>
                    <span>🙏 {p.text}</span>
                    <button type="button" className="wls-leader-delete" title="Remove" onClick={() => onRemovePrayerRequest(w.id, p.id)}>🗑</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
