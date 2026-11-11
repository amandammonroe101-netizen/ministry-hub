import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMyConnections } from '../../lib/contactRequests';
import { getProfileByUid } from '../../lib/userProfile';
import { WOMENS_OVERVIEW } from './womensConfig';
import './NewToMinistry.css';

/* ─────────────────────────────────────────────────────────────
   Women's → New to Ministry

   A kanban-style welcome pipeline that filters the shared
   womens:women list down to anyone whose newStatus is set to one
   of: first-contact | connect-coffee | next-step
   Each column shows the women at that stage. Cards can be
   advanced / moved back / removed-from-pipeline (newStatus reset
   to '') or fully deleted.

   ＋ Add woman creates a new record in the shared women list
   with newStatus='first-contact' so she also shows up on the
   All Women directory right away.
   ───────────────────────────────────────────────────────────── */

const ACCENT = 'var(--wms-rose-deep, #c2426a)';

/* Starter stages — seed value only. The pipeline's stages are fully
   user-editable (add/delete from ⚙️ Page settings, not per-woman), so
   this is just what a brand-new user sees before customizing;
   see `stages`/`setStages` below (stored at 'womens:new-stages'). */
const DEFAULT_STAGES = [
  { id: 'first-contact', label: 'First Contact',  icon: '🆕', hint: 'Just met her / she just visited' },
  { id: 'connect-coffee', label: 'Connect Coffee', icon: '☕', hint: 'Getting-to-know-you coffee scheduled or done' },
  { id: 'next-step',     label: 'Next Step',       icon: '🌱', hint: 'Ready for a study, mentor, or event' },
];

/* Starter next-step options — seed value only, same pattern as
   DEFAULT_STAGES above. Fully user-editable from ⚙️ Page settings
   (stored at 'womens:next-steps'); "— None" is always available
   and isn't part of the stored list, so this array is allowed to
   be emptied out entirely by the user. */
const DEFAULT_NEXT_STEPS = [
  { id: 'study',  label: '📖 Bible study' },
  { id: 'mentor', label: '🤝 Mentor' },
  { id: 'event',  label: '📅 Event' },
];
const nextStepLabel = (id, nextSteps) => {
  if (!id) return '—';
  const found = (nextSteps || DEFAULT_NEXT_STEPS).find(s => s.id === id);
  return found ? found.label : '—';
};

/* A card is "stale" once it's sat in its current stage this long
   with no stage change — nudges a follow-up before she goes cold. */
const STALE_DAYS = 14;
const daysInStage = (woman) => {
  const entered = woman.newStageEnteredAt || woman.createdAt;
  if (!entered) return 0;
  return Math.floor((Date.now() - entered) / 86400000);
};

/* Per-stage onboarding checklist. The item list itself (what shows
   up for each stage) is a shared template, editable only from ⚙️
   Page settings — same "single shared list" pattern as stages and
   next-steps above. Each woman just tracks which of the current
   template's items she's checked off, stored as
   `newChecklist: { [stageId]: { [itemId]: true } } }` — a plain
   done-map, since the item text/order always comes live from the
   template (add/delete an item in Settings and it's reflected for
   everyone immediately). Seed ids are fixed (not regenerated) since
   they're shared keys, not per-woman ones. */
const DEFAULT_CHECKLIST_TEMPLATES = {
  'first-contact': [
    { id: 'ci_fc_1', label: 'Got her contact info' },
    { id: 'ci_fc_2', label: 'Sent a welcome text or email' },
    { id: 'ci_fc_3', label: 'Introduced her to a greeter' },
  ],
  'connect-coffee': [
    { id: 'ci_cc_1', label: 'Coffee date scheduled' },
    { id: 'ci_cc_2', label: 'Coffee happened' },
    { id: 'ci_cc_3', label: 'Learned her story / interests' },
  ],
  'next-step': [
    { id: 'ci_ns_1', label: 'Next step decided' },
    { id: 'ci_ns_2', label: 'Introduced to the study/mentor/event leader' },
    { id: 'ci_ns_3', label: 'Attended her first session' },
  ],
};
/* Old records may still have the previous array-of-{id,label,done}
   shape for a stage; treat that as "nothing checked yet" under the
   new template-driven model rather than crashing on it. */
const getDoneMap = (woman, stageId) => {
  const raw = (woman.newChecklist || {})[stageId];
  return (raw && !Array.isArray(raw)) ? raw : {};
};
const checklistProgress = (woman, checklistTemplates) => {
  const items = (checklistTemplates || DEFAULT_CHECKLIST_TEMPLATES)[woman.newStatus];
  if (!items || !items.length) return null;
  const doneMap = getDoneMap(woman, woman.newStatus);
  const done = items.filter(it => doneMap[it.id]).length;
  return { done, total: items.length };
};

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* Birthday → Calendar sync — same pattern as All Women's own sync
   (mirrored locally here rather than imported, so this page doesn't
   take on a dependency on AllWomen.jsx internals). Idempotent via
   source/source_id, exactly like there. */
const CAL_SOURCE_BDAY = 'women-birthday';
const CAL_COLOR_BDAY  = '#fb7185'; // rose — matches the Women's Ministry accent
function nextAnniversaryISO(iso) {
  if (!iso) return '';
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

/* Preset emoji choices offered when adding a new pipeline stage —
   picked by the user in ⚙️ Page settings instead of a hardcoded ⭐. */
const STAGE_ICON_CHOICES = ['🆕', '☕', '🌱', '📖', '🤝', '📅', '🎯', '💬', '🏠', '✨', '🎓', '⭐'];

const DEFAULT_WOMAN = () => ({
  id:                     makeId('w'),
  name:                   '',
  photoUrl:               '',
  avatar:                 null,
  lifeStage:              '',
  birthday:               '',
  syncBirthdayToCalendar: false,
  phone:                  '',
  email:                  '',
  address:                '',
  bibleStudy:             '',
  mentor:                 '',
  mentee:                 '',
  active:                 true,
  joinedDate:             new Date().toISOString().slice(0, 10),
  lastContacted:          '',
  engagementTimeline:     [],
  careStatus:             '',
  careNote:               '',
  communications:         [],
  notes:                  '',
  createdAt:              Date.now(),
  newStatus:              'first-contact',
  newStageEnteredAt:      Date.now(),
  newChecklist:           {},
  nextStepSuggested:      '',
  newAssignedTo:          '',
  newNotes:               '',
});

export default function NewToMinistry() {
  const navigate = useNavigate();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [women, setWomen, { loading }] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(women) ? women : [];
  /* Pipeline stages are fully user-editable — add/delete only from
     ⚙️ Page settings (see WomensNewPageSettings below). Falls back to
     the starter three stages until customized. */
  const [stagesRaw, setStages] = useUserStoreKey('womens:new-stages', DEFAULT_STAGES);
  const stages = Array.isArray(stagesRaw) && stagesRaw.length ? stagesRaw : DEFAULT_STAGES;
  /* Suggested-next-step options are likewise fully user-editable —
     add/delete only from ⚙️ Page settings. Unlike stages, it's fine
     for this list to be emptied entirely — "— None" is always
     available as a built-in fallback option. */
  const [nextStepsRaw, setNextSteps] = useUserStoreKey('womens:next-steps', DEFAULT_NEXT_STEPS);
  const nextSteps = Array.isArray(nextStepsRaw) ? nextStepsRaw : DEFAULT_NEXT_STEPS;
  /* Per-stage checklist item templates — also editable only from ⚙️
     Page settings (see DEFAULT_CHECKLIST_TEMPLATES above). */
  const [checklistTemplatesRaw, setChecklistTemplates] = useUserStoreKey('womens:checklist-templates', DEFAULT_CHECKLIST_TEMPLATES);
  const checklistTemplates = (checklistTemplatesRaw && typeof checklistTemplatesRaw === 'object' && !Array.isArray(checklistTemplatesRaw))
    ? checklistTemplatesRaw
    : DEFAULT_CHECKLIST_TEMPLATES;

  const [showProfile, setShowProfile] = useState(false);
  const [editingId, setEditingId] = useState(null);
  /* 'view' opens a read-only summary first (double-click a card);
     'edit' opens straight into the editable form (＋ Add woman, or
     clicking Edit from the view). */
  const [modalMode, setModalMode] = useState('view');
  const [dragOverStage, setDragOverStage] = useState(null);
  /* Tracks the fresh record from "＋ Add woman" until it's either
     linked to an existing All Women match, filled from a Contact,
     or saved as a genuinely brand-new person (see handleModalClose
     below, tier 3 of the Name field). */
  const [newlyAddedId, setNewlyAddedId] = useState(null);
  const [contactLinkedIds, setContactLinkedIds] = useState(() => new Set());

  /* Women in the pipeline = anyone with a new-status set. */
  const inPipeline = useMemo(
    () => list.filter(w => stages.some(st => st.id === w.newStatus)),
    [list, stages]
  );
  const editing = useMemo(
    () => list.find(w => w.id === editingId) || null,
    [list, editingId]
  );

  /* Group pipeline women by stage. */
  const byStage = useMemo(() => {
    const map = {};
    stages.forEach(st => { map[st.id] = []; });
    inPipeline.forEach(w => { if (map[w.newStatus]) map[w.newStatus].push(w); });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    });
    return map;
  }, [inPipeline, stages]);

  /* ── Calendar sync (birthday only — mirrors AllWomen.jsx) ──── */
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

  /* ── Actions ────────────────────────────────────────────── */
  const addWoman = () => {
    const w = DEFAULT_WOMAN();
    setWomen(prev => [...(prev || []), w]);
    setEditingId(w.id);
    setModalMode('edit');
    setNewlyAddedId(w.id);
  };
  /* Double-clicking a card opens the read-only view first; Edit
     inside it switches to the full form. */
  const openWoman = (id) => {
    setEditingId(id);
    setModalMode('view');
  };
  const updateWoman = (id, patch) => {
    setWomen(prev => (prev || []).map(w => w.id === id ? { ...w, ...patch } : w));
    const current = list.find(w => w.id === id);
    if (current) syncBirthdayCalendarFor({ ...current, ...patch });
  };
  /* Moves a woman to an arbitrary stage (drag-drop or the modal's
     Stage dropdown) — always stamps newStageEnteredAt so the
     stale-in-stage badge resets. No-op if she's already there. */
  const setStage = (id, stageId) => {
    const cur = list.find(w => w.id === id);
    if (!cur || cur.newStatus === stageId) return;
    updateWoman(id, { newStatus: stageId, newStageEnteredAt: Date.now() });
  };
  const removeFromPipeline = (id) => updateWoman(id, { newStatus: '', newStageEnteredAt: null });
  const deleteWoman = (id) => {
    setWomen(prev => (prev || []).filter(w => w.id !== id));
    removeBirthdayCalendarFor(id);
    if (editingId === id) setEditingId(null);
  };
  /* Graduate (view-mode button, shown once the current stage's
     checklist is fully checked): advances her to the next stage, or
     — if she's on the LAST stage — finalizes her record (stamps
     today as her last-contacted date, matching what a completed
     welcome pipeline should leave behind on her All Women record)
     and clears her pipeline status so her card drops off this
     board entirely. Same shared record either way — All Women
     already reflects it live since it's the same list. */
  const graduateWoman = (id) => {
    const cur = list.find(w => w.id === id);
    if (!cur) return;
    const stageIdx = stages.findIndex(s => s.id === cur.newStatus);
    if (stageIdx === -1) return;
    if (stageIdx === stages.length - 1) {
      updateWoman(id, {
        newStatus:         '',
        newStageEnteredAt: null,
        lastContacted:     new Date().toISOString().slice(0, 10),
      });
      if (editingId === id) setEditingId(null);
    } else {
      const next = stages[stageIdx + 1];
      updateWoman(id, { newStatus: next.id, newStageEnteredAt: Date.now() });
    }
  };
  /* Name field, tier 1: typing a match against the All Women
     directory and picking one "links" to her instead of keeping a
     separate duplicate — the freshly-created draft's pipeline fields
     are merged onto her existing record, and the draft is removed. */
  const linkToExisting = (draftId, existingId) => {
    if (!draftId || !existingId || draftId === existingId) return;
    setWomen(prev => {
      const arr = prev || [];
      const draft = arr.find(w => w.id === draftId);
      const target = arr.find(w => w.id === existingId);
      if (!draft || !target) return arr;
      const merged = {
        ...target,
        newStatus:         draft.newStatus || target.newStatus || 'first-contact',
        newStageEnteredAt: draft.newStageEnteredAt || target.newStageEnteredAt || Date.now(),
        newChecklist:      Object.keys(draft.newChecklist || {}).length ? draft.newChecklist : target.newChecklist,
        nextStepSuggested: draft.nextStepSuggested || target.nextStepSuggested,
        newAssignedTo:     draft.newAssignedTo || target.newAssignedTo,
        newNotes:          draft.newNotes || target.newNotes,
      };
      return arr.filter(w => w.id !== draftId).map(w => (w.id === existingId ? merged : w));
    });
    setEditingId(existingId);
    setNewlyAddedId(null);
    setContactLinkedIds(prev => { const n = new Set(prev); n.delete(draftId); return n; });
  };
  /* Name field, tier 3: closing the modal on a fresh, still-unlinked
     draft (no All Women match, no Contacts match) hands her off to
     All Women's edit form so the rest of her profile can be filled
     in there — same shared record, just a different page. */
  const handleModalClose = () => {
    const id = editingId;
    const isFreshUnlinked = id && id === newlyAddedId && !contactLinkedIds.has(id);
    setEditingId(null);
    if (isFreshUnlinked) {
      setNewlyAddedId(null);
      navigate(`/womens/all?woman=${id}&edit=1`);
    }
  };

  /* Stage field, add/delete — available only from ⚙️ Page settings
     (WomensNewPageSettings), not per-woman. Stages are a shared list
     (they define the kanban columns), so deleting one that still
     has women in it drops them out of the pipeline (newStatus '')
     without touching their All Women record — with a heads-up
     since that affects more than just the woman being edited. */
  const addStage = (label, icon) => {
    const trimmed = (label || '').trim();
    if (!trimmed) return;
    const newStage = { id: makeId('stage'), label: trimmed, icon: icon || '⭐', hint: '' };
    setStages(prev => [...(Array.isArray(prev) && prev.length ? prev : DEFAULT_STAGES), newStage]);
  };
  /* Drag-to-reorder in ⚙️ Page settings — reordering the shared
     stages array also reorders the kanban columns, since the board
     renders straight off `stages`. */
  const reorderStages = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setStages(prev => {
      const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_STAGES;
      const arr = [...base];
      if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return base;
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      return arr;
    });
  };
  const deleteStage = (stageId) => {
    if (stages.length <= 1) return;
    const occupants = list.filter(w => w.newStatus === stageId).length;
    if (occupants > 0) {
      const noun = occupants === 1 ? 'woman is' : 'women are';
      const ok = confirm(`${occupants} ${noun} currently in this stage — deleting it will remove ${occupants === 1 ? 'her' : 'them'} from the pipeline (she'll stay in All Women). Delete this stage?`);
      if (!ok) return;
    }
    setStages(prev => (Array.isArray(prev) && prev.length ? prev : DEFAULT_STAGES).filter(s => s.id !== stageId));
    if (occupants > 0) {
      setWomen(prev => (prev || []).map(w => (w.newStatus === stageId ? { ...w, newStatus: '', newStageEnteredAt: null } : w)));
    }
    // Drop that stage's checklist template too — nothing left to show it for.
    setChecklistTemplates(prev => {
      const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : DEFAULT_CHECKLIST_TEMPLATES;
      if (!(stageId in base)) return base;
      const { [stageId]: _drop, ...rest } = base;
      return rest;
    });
  };

  /* Suggested-next-step field, add/delete — same shared-list pattern
     as stages above, but no "last one left" guard since "— None" is
     always available regardless of what's in the stored list. */
  const addNextStep = (label) => {
    const trimmed = (label || '').trim();
    if (!trimmed) return;
    const newStep = { id: makeId('step'), label: trimmed };
    setNextSteps(prev => [...(Array.isArray(prev) ? prev : DEFAULT_NEXT_STEPS), newStep]);
  };
  const deleteNextStep = (stepId) => {
    const occupants = list.filter(w => w.nextStepSuggested === stepId).length;
    if (occupants > 0) {
      const noun = occupants === 1 ? 'woman has' : 'women have';
      const ok = confirm(`${occupants} ${noun} this suggested next step set — deleting it will clear that field for ${occupants === 1 ? 'her' : 'them'}. Delete this option?`);
      if (!ok) return;
    }
    setNextSteps(prev => (Array.isArray(prev) ? prev : DEFAULT_NEXT_STEPS).filter(s => s.id !== stepId));
    if (occupants > 0) {
      setWomen(prev => (prev || []).map(w => (w.nextStepSuggested === stepId ? { ...w, nextStepSuggested: '' } : w)));
    }
  };

  /* Per-stage checklist item templates, add/delete — shared list per
     stage, editable only from ⚙️ Page settings. Deleting an item that
     women have already checked off clears that checkmark, so it's
     confirm-gated the same way stage/next-step deletion is. */
  const addChecklistItem = (stageId, label) => {
    const trimmed = (label || '').trim();
    if (!trimmed || !stageId) return;
    const item = { id: makeId('ci'), label: trimmed };
    setChecklistTemplates(prev => {
      const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : DEFAULT_CHECKLIST_TEMPLATES;
      return { ...base, [stageId]: [...(base[stageId] || []), item] };
    });
  };
  const deleteChecklistItem = (stageId, itemId) => {
    const occupants = list.filter(w => !!getDoneMap(w, stageId)[itemId]).length;
    if (occupants > 0) {
      const noun = occupants === 1 ? 'woman has' : 'women have';
      const ok = confirm(`${occupants} ${noun} checked this item off — deleting it will remove that checkmark. Delete this checklist item?`);
      if (!ok) return;
    }
    setChecklistTemplates(prev => {
      const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : DEFAULT_CHECKLIST_TEMPLATES;
      return { ...base, [stageId]: (base[stageId] || []).filter(it => it.id !== itemId) };
    });
  };

  /* ── Drag-and-drop between columns ─────────────────────────
     Native HTML5 DnD — cards are draggable, columns are drop
     targets. This (plus the Stage dropdown inside the edit modal)
     is now the only way to move a woman between stages. */
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleColDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleColDrop = (e, stageId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) setStage(id, stageId);
    setDragOverStage(null);
  };

  /* The last stage in the list is treated as the "ready" column for
     the header stat — works for the default 3-stage set and stays
     sensible after custom stages are added/removed. */
  const readyStage = stages[stages.length - 1];
  const readyCount = byStage[readyStage?.id]?.length || 0;
  const totalActive = inPipeline.length - readyCount;

  return (
    <WomensShell
      title="New to Ministry"
      icon="✨"
      subtitle="Welcome pipeline for women new to the ministry — first contact, connect coffee, suggested next step (study / mentor / event)."
      actions={
        <button type="button" className="wms-btn primary" onClick={addWoman}>
          ＋ Add woman
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wn-root" style={{ '--wn-accent': ACCENT }}>
        <div className="wn-shell">

          <p className="wn-description">
            {totalActive} active in pipeline · {readyCount} in "{readyStage?.label || 'final stage'}" ·
            all entries also appear on the All Women directory.
          </p>

          {/* Kanban board */}
          <section className="wn-board">
            {loading && list.length === 0 ? (
              <div className="wn-loading">Loading…</div>
            ) : (
              stages.map(stage => (
                <div
                  className={`wn-col${dragOverStage === stage.id ? ' drag-over' : ''}`}
                  key={stage.id}
                  onDragOver={handleColDragOver}
                  onDragEnter={() => setDragOverStage(stage.id)}
                  onDragLeave={() => setDragOverStage(cur => (cur === stage.id ? null : cur))}
                  onDrop={(e) => handleColDrop(e, stage.id)}
                >
                  <header className="wn-col-head">
                    <span className="wn-col-icon" aria-hidden="true">{stage.icon}</span>
                    <span className="wn-col-name">{stage.label}</span>
                    <span className="wn-col-count">{byStage[stage.id]?.length || 0}</span>
                  </header>
                  <p className="wn-col-hint">{stage.hint}</p>
                  <div className="wn-col-body">
                    {(byStage[stage.id] || []).length === 0 ? (
                      <div className="wn-col-empty">Drop here</div>
                    ) : (
                      byStage[stage.id].map(w => (
                        <WomanCard
                          key={w.id}
                          woman={w}
                          nextSteps={nextSteps}
                          checklistTemplates={checklistTemplates}
                          onOpen={() => openWoman(w.id)}
                          onRemove={() => removeFromPipeline(w.id)}
                          onDragStart={(e) => handleDragStart(e, w.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </section>

          {!loading && totalActive === 0 && readyCount === 0 && (
            <div className="wn-onboard">
              <h2 className="wn-onboard-title">No one in your welcome pipeline yet</h2>
              <p className="wn-onboard-copy">
                Click <b>＋ Add woman</b> above to log a first contact. New women land in
                the <b>{stages[0]?.label || 'first'}</b> column — move them along by dragging
                between columns, or use the Stage dropdown in her edit form. Open your
                profile avatar's <b>📋 Page Settings</b> tab to add or remove columns to
                match how your ministry works.
              </p>
            </div>
          )}

        </div>

        {/* Edit modal */}
        {editing && (
          <EditModal
            woman={editing}
            allWomen={list}
            stages={stages}
            nextSteps={nextSteps}
            checklistTemplates={checklistTemplates}
            mode={modalMode}
            onEditMode={() => setModalMode('edit')}
            onChange={(patch) => updateWoman(editing.id, patch)}
            onClose={handleModalClose}
            onDelete={() => deleteWoman(editing.id)}
            onLinkExisting={(existingId) => linkToExisting(editing.id, existingId)}
            onContactMatch={() => setContactLinkedIds(prev => new Set(prev).add(editing.id))}
            onGraduate={() => graduateWoman(editing.id)}
          />
        )}

        {/* Page settings now live only under the profile avatar's
           "📋 Page Settings" tab — the only place stages, suggested
           next steps, and per-stage checklist items can be added,
           reordered, or deleted. The per-woman form only ever picks
           from these shared lists. Customize Menu (sidebar visibility,
           shared across every Women's page — see WomensMenuSettings)
           sits above it in the same tab. */}
        <ProfileModal
          open={showProfile}
          onClose={() => setShowProfile(false)}
          pageTabLabel="📋 Page Settings"
          pageSettings={
            <>
              <WomensMenuSettings />
              <div className="wn-settings-divider" />
              <WomensNewPageSettings
                stages={stages}
                nextSteps={nextSteps}
                checklistTemplates={checklistTemplates}
                onAddStage={addStage}
                onDeleteStage={deleteStage}
                onReorderStages={reorderStages}
                onAddNextStep={addNextStep}
                onDeleteNextStep={deleteNextStep}
                onAddChecklistItem={addChecklistItem}
                onDeleteChecklistItem={deleteChecklistItem}
              />
            </>
          }
        />
      </div>
    </WomensShell>
  );
}

/* ── Woman card in a column ────────────────────────────────── */
function WomanCard({ woman, nextSteps, checklistTemplates, onOpen, onRemove, onDragStart }) {
  const days = daysInStage(woman);
  const stale = days >= STALE_DAYS;
  const progress = checklistProgress(woman, checklistTemplates);

  return (
    <article
      className={`wn-card${stale ? ' is-stale' : ''}`}
      draggable
      onDragStart={onDragStart}
      title={stale ? `In this stage for ${days} days — might need a nudge` : undefined}
    >
      {stale && <span className="wn-card-stale">⏰ {days}d</span>}
      <div
        className="wn-card-main"
        role="button"
        tabIndex={0}
        onDoubleClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
        title="Double-click to view"
      >
        <div className="wn-card-name">{woman.name || '(unnamed)'}</div>
        <div className="wn-card-meta">
          {woman.joinedDate && (
            <span className="wn-card-chip">📅 {woman.joinedDate}</span>
          )}
          {woman.nextStepSuggested && (
            <span className="wn-card-chip">{nextStepLabel(woman.nextStepSuggested, nextSteps)}</span>
          )}
          {woman.newAssignedTo && (
            <span className="wn-card-chip">🙋 {woman.newAssignedTo}</span>
          )}
          {progress && (
            <span className={`wn-card-chip${progress.done === progress.total ? ' is-done' : ''}`}>
              ✓ {progress.done}/{progress.total}
            </span>
          )}
        </div>
        {woman.newNotes && (
          <div className="wn-card-notes">{woman.newNotes}</div>
        )}
      </div>
      <footer className="wn-card-actions">
        <button
          type="button"
          className="wn-act wn-act-rm"
          onClick={onRemove}
          title="Remove from pipeline (keeps in All Women)"
        >✕ Remove from pipeline</button>
      </footer>
    </article>
  );
}

/* ── Edit modal (welcome-pipeline fields for one woman) ─────
   Mode-aware wrapper: opens to a read-only summary (WomanQuickView)
   first when reached via double-click, with an Edit button to drop
   into the full form (EditFields); ＋ Add woman skips straight to
   the form since there's nothing to view yet. Checklist checkboxes
   are toggleable in both modes — checking one off isn't "editing"
   in the structural sense, so it doesn't require the Edit button. */
function EditModal({ woman, allWomen, stages, nextSteps, checklistTemplates, mode, onEditMode, onChange, onClose, onDelete, onLinkExisting, onContactMatch, onGraduate }) {
  return (
    <div className="wn-modal-backdrop" onClick={onClose}>
      <div className="wn-modal" onClick={e => e.stopPropagation()}>
        <header className="wn-modal-head">
          <h2 className="wn-modal-title">{woman.name || '(unnamed woman)'}</h2>
          <button type="button" className="wn-modal-x" onClick={onClose}>✕</button>
        </header>

        {mode === 'view' ? (
          <WomanQuickView
            woman={woman}
            stages={stages}
            nextSteps={nextSteps}
            checklistTemplates={checklistTemplates}
            onChange={onChange}
            onEdit={onEditMode}
            onGraduate={onGraduate}
          />
        ) : (
          <EditFields
            woman={woman}
            allWomen={allWomen}
            stages={stages}
            nextSteps={nextSteps}
            checklistTemplates={checklistTemplates}
            onChange={onChange}
            onClose={onClose}
            onDelete={onDelete}
            onLinkExisting={onLinkExisting}
            onContactMatch={onContactMatch}
          />
        )}
      </div>
    </div>
  );
}

/* ── Read-only summary shown first when a card is opened ─────
   Everything here is display-only text EXCEPT the checklist, whose
   checkboxes stay live — see ChecklistBlock below. */
function WomanQuickView({ woman, stages, nextSteps, checklistTemplates, onChange, onEdit, onGraduate }) {
  const days = daysInStage(woman);
  const stageIdx = stages.findIndex(s => s.id === woman.newStatus);
  const stageLabel = stages[stageIdx]?.label || '—';

  /* Graduate button — appears once every checklist item for her
     current stage is checked off. Advances to the next stage, or
     (on the last stage) finalizes her into All Women and drops her
     off this board — see graduateWoman() in the parent. */
  const items = (checklistTemplates || {})[woman.newStatus] || [];
  const doneMap = getDoneMap(woman, woman.newStatus);
  const canGraduate = stageIdx !== -1 && items.length > 0 && items.every(it => doneMap[it.id]);
  const isLastStage = stageIdx === stages.length - 1;

  return (
    <>
      <div className="wn-modal-body wn-view-body">
        <ViewRow label="Stage" value={woman.newStatus ? `${stageLabel} · ${days}d in stage` : '—'} />
        <ViewRow label="First contact" value={woman.joinedDate || '—'} />
        <ViewRow label="Phone" value={woman.phone || '—'} />
        <ViewRow label="Email" value={woman.email || '—'} />
        <ViewRow label="Suggested next step" value={nextStepLabel(woman.nextStepSuggested, nextSteps)} />
        <ViewRow label="Assigned to" value={woman.newAssignedTo || '—'} />

        <ChecklistBlock woman={woman} stages={stages} checklistTemplates={checklistTemplates} onChange={onChange} />

        {woman.newNotes && (
          <div className="wn-view-row">
            <span className="wn-view-lbl">Follow-up notes</span>
            <p className="wn-view-notes">{woman.newNotes}</p>
          </div>
        )}
      </div>

      <footer className="wn-modal-foot wn-modal-foot-view">
        {canGraduate && (
          <button
            type="button"
            className="wn-graduate-btn"
            onClick={onGraduate}
            title={isLastStage ? 'Finalize into All Women and remove from this pipeline' : 'Advance to the next stage'}
          >
            🎓 {isLastStage ? 'Graduate — Finish pipeline' : 'Graduate to next stage'}
          </button>
        )}
        <button type="button" className="wn-done-btn" onClick={onEdit}>✎ Edit</button>
      </footer>
    </>
  );
}

function ViewRow({ label, value }) {
  return (
    <div className="wn-view-row">
      <span className="wn-view-lbl">{label}</span>
      <span className="wn-view-val">{value}</span>
    </div>
  );
}

/* ── Full editable form ──────────────────────────────────────── */
function EditFields({ woman, allWomen, stages, nextSteps, checklistTemplates, onChange, onClose, onDelete, onLinkExisting, onContactMatch }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });
  const pickStage = (e) => {
    const val = e.target.value;
    if (val === (woman.newStatus || '')) return;
    onChange({ newStatus: val, newStageEnteredAt: Date.now() });
  };
  return (
    <>
      <div className="wn-modal-body">
        <Row>
          <Field label="Name">
            <NameField
              woman={woman}
              allWomen={allWomen}
              onChange={onChange}
              onLinkExisting={onLinkExisting}
              onContactMatch={onContactMatch}
            />
          </Field>
          <Field label="First contact">
            <input type="date" className="wn-inp" value={woman.joinedDate || ''} onChange={set('joinedDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Phone">
            <input type="tel" className="wn-inp" value={woman.phone || ''} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <input type="email" className="wn-inp" value={woman.email || ''} onChange={set('email')} />
          </Field>
        </Row>

        <Row>
          <Field label="Birthday">
            <input type="date" className="wn-inp" value={woman.birthday || ''} onChange={set('birthday')} />
          </Field>
          <Field label="Sync to Calendar">
            <label
              className="wn-cal-sync"
              title={woman.birthday ? 'Add this birthday as a yearly Calendar event' : 'Pick a birthday first'}
            >
              <input
                type="checkbox"
                checked={!!woman.syncBirthdayToCalendar}
                disabled={!woman.birthday}
                onChange={set('syncBirthdayToCalendar')}
              />
              <span>📆 Sync birthday to Calendar</span>
            </label>
          </Field>
        </Row>

        {/* Stage / next-step OPTIONS are managed only from ⚙️ Page
           settings — this form just picks from the shared list. */}
        <Field label="Stage">
          <select className="wn-inp" value={woman.newStatus || ''} onChange={pickStage}>
            {stages.map(st => (
              <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Suggested next step">
          <select className="wn-inp" value={woman.nextStepSuggested || ''} onChange={set('nextStepSuggested')}>
            <option value="">— None</option>
            {nextSteps.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Assigned to">
          <input type="text" className="wn-inp" value={woman.newAssignedTo || ''} onChange={set('newAssignedTo')} placeholder="Who's following up with her" />
        </Field>

        <ChecklistBlock woman={woman} stages={stages} checklistTemplates={checklistTemplates} onChange={onChange} />

        <Field label="Follow-up notes">
          <textarea
            className="wn-inp wn-textarea"
            rows={4}
            value={woman.newNotes || ''}
            onChange={set('newNotes')}
          />
        </Field>
      </div>

      <footer className="wn-modal-foot">
        <button
          type="button"
          className={`wn-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); onClose(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete permanently' : '🗑 Delete'}
        </button>
        <button type="button" className="wn-done-btn" onClick={onClose}>Done</button>
      </footer>
    </>
  );
}

/* ── Onboarding checklist for whichever stage she's in now ───
   Items themselves come live from the shared per-stage template
   (see DEFAULT_CHECKLIST_TEMPLATES / ⚙️ Page settings) — this just
   renders checkboxes for checking them off, identically whether
   she's being viewed or edited. No add/delete here anymore. */
function ChecklistBlock({ woman, stages, checklistTemplates, onChange }) {
  const stageId = woman.newStatus;
  if (!stageId) return null;
  const items = (checklistTemplates || {})[stageId] || [];
  if (!items.length) return null;

  const doneMap = getDoneMap(woman, stageId);
  const toggle = (itemId) => {
    const stored = woman.newChecklist || {};
    onChange({ newChecklist: { ...stored, [stageId]: { ...doneMap, [itemId]: !doneMap[itemId] } } });
  };
  const stageLabel = stages.find(s => s.id === stageId)?.label || 'Stage';
  const done = items.filter(it => doneMap[it.id]).length;

  return (
    <div className="wn-field">
      <span className="wn-field-lbl">{stageLabel} checklist ({done}/{items.length})</span>
      <ul className="wn-checklist">
        {items.map(it => (
          <li key={it.id} className="wn-checklist-item">
            <label>
              <input type="checkbox" checked={!!doneMap[it.id]} onChange={() => toggle(it.id)} />
              <span className={doneMap[it.id] ? 'is-done' : ''}>{it.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Page settings content — rendered inside the shared profile
   avatar's "📋 Page Settings" tab (see ProfileModal's `pageSettings`
   prop above). No modal chrome of its own — ProfileModal supplies
   the backdrop/tabs/close button; this is just the inner body.
   The only place stages, suggested next steps, and per-stage
   checklist items get added, reordered, or deleted. */
function WomensNewPageSettings({ stages, nextSteps, checklistTemplates, onAddStage, onDeleteStage, onReorderStages, onAddNextStep, onDeleteNextStep, onAddChecklistItem, onDeleteChecklistItem }) {
  return (
    <div className="wn-settings-body">
      <div className="wn-field">
        <span className="wn-field-lbl">Pipeline stages</span>
        <p className="wn-settings-hint">Drag ⠿ to reorder — this also reorders the kanban columns. Pick an icon before adding a new stage.</p>
        <StageSettingsList
          items={stages}
          onAdd={onAddStage}
          onDelete={onDeleteStage}
          onReorder={onReorderStages}
          deleteDisabled={() => stages.length <= 1}
          deleteDisabledTitle="Can't delete the only stage"
        />
      </div>

      <div className="wn-field">
        <span className="wn-field-lbl">Suggested next steps</span>
        <SettingsList
          items={nextSteps}
          onAdd={onAddNextStep}
          onDelete={onDeleteNextStep}
          placeholder="Add a next-step option…"
        />
      </div>

      <div className="wn-field">
        <span className="wn-field-lbl">Per-stage checklist items</span>
        <div className="wn-settings-stages">
          {stages.map(st => (
            <div className="wn-settings-substage" key={st.id}>
              <span className="wn-settings-substage-lbl">{st.icon} {st.label}</span>
              <SettingsList
                items={checklistTemplates[st.id] || []}
                onAdd={(label) => onAddChecklistItem(st.id, label)}
                onDelete={(itemId) => onDeleteChecklistItem(st.id, itemId)}
                placeholder={`Add a ${st.label} checklist item…`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Stage-specific list editor: same fused-pill visual language as
   SettingsList below, plus native HTML5 drag-and-drop reordering
   (each pill is draggable; dropping onto another pill moves it to
   that position — mirrors the kanban card drag-drop already used
   on the board) and an icon picker for the "add a stage" row. */
function StageSettingsList({ items, onAdd, onDelete, onReorder, deleteDisabled, deleteDisabledTitle }) {
  const [draft, setDraft] = useState('');
  const [icon, setIcon] = useState(STAGE_ICON_CHOICES[0]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onAdd?.(label, icon);
    setDraft('');
  };

  return (
    <div>
      <div className="wn-stage-picker">
        {items.map((it, idx) => {
          const disabled = deleteDisabled?.(it) || false;
          return (
            <span
              className={`wn-stage-pill wn-stage-pill-drag${dragIdx === idx ? ' is-dragging' : ''}${overIdx === idx ? ' is-drag-over' : ''}`}
              key={it.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx(cur => (cur === idx ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx) onReorder?.(dragIdx, idx);
                setDragIdx(null); setOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            >
              <span className="wn-stage-pill-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
              <span className="wn-stage-pill-static">{it.icon ? `${it.icon} ` : ''}{it.label}</span>
              <button
                type="button"
                className="wn-stage-pill-rm"
                onClick={() => onDelete?.(it.id)}
                disabled={disabled}
                title={disabled ? deleteDisabledTitle : 'Delete'}
              >✕</button>
            </span>
          );
        })}
        {items.length === 0 && (
          <span className="wn-settings-empty">None yet — add one below.</span>
        )}
      </div>
      <div className="wn-icon-picker">
        {STAGE_ICON_CHOICES.map(ic => (
          <button
            key={ic}
            type="button"
            className={`wn-icon-choice${icon === ic ? ' selected' : ''}`}
            onClick={() => setIcon(ic)}
            title={`Use ${ic} for the next stage you add`}
          >{ic}</button>
        ))}
      </div>
      <div className="wn-add-row">
        <input
          type="text"
          className="wn-inp"
          placeholder="Add a stage…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="wn-add-row-btn" onClick={add}>＋</button>
      </div>
    </div>
  );
}

/* Generic add/delete pill list — reused for stages, next steps, and
   each stage's checklist-item template in Page settings above. */
function SettingsList({ items, onAdd, onDelete, placeholder, deleteDisabled, deleteDisabledTitle }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onAdd?.(label);
    setDraft('');
  };
  return (
    <div>
      <div className="wn-stage-picker">
        {items.map(it => {
          const disabled = deleteDisabled?.(it) || false;
          return (
            <span className="wn-stage-pill" key={it.id}>
              <span className="wn-stage-pill-static">{it.icon ? `${it.icon} ` : ''}{it.label}</span>
              <button
                type="button"
                className="wn-stage-pill-rm"
                onClick={() => onDelete?.(it.id)}
                disabled={disabled}
                title={disabled ? deleteDisabledTitle : 'Delete'}
              >✕</button>
            </span>
          );
        })}
        {items.length === 0 && (
          <span className="wn-settings-empty">None yet — add one below.</span>
        )}
      </div>
      <div className="wn-add-row">
        <input
          type="text"
          className="wn-inp"
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="wn-add-row-btn" onClick={add}>＋</button>
      </div>
    </div>
  );
}

/* ── Name field — smart lookup, Contacts-first ───────────────
   1) Search My Contacts (the Contacts page's connection list) as
      she types — this is the primary source now; picking a match
      autofills her avatar/photo/email from that connection's
      profile.
   2) Only if nothing matches there, fall back to the All Women
      directory so an existing (non-Contact) record can still be
      linked instead of creating a duplicate person (see
      linkToExisting).
   3) If neither matches, she's genuinely new — closing the modal
      hands off to All Women's edit form (see handleModalClose) so
      the rest of her profile can be filled in there. */
function NameField({ woman, allWomen, onChange, onLinkExisting, onContactMatch }) {
  const { connections } = useMyConnections();
  const [open, setOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const q = (woman.name || '').trim().toLowerCase();

  const contactMatches = useMemo(() => {
    if (!q || !connections?.length) return [];
    return connections.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [q, connections]);

  const womenMatches = useMemo(() => {
    if (!q || contactMatches.length) return [];
    return (allWomen || [])
      .filter(w => w.id !== woman.id && (w.name || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [q, allWomen, woman.id, contactMatches.length]);

  const pickContact = async (contact) => {
    setOpen(false);
    setFilling(true);
    try {
      const profile = await getProfileByUid(contact.uid);
      const patch = { name: profile?.displayName || contact.name || woman.name };
      if (profile?.avatar) patch.avatar = profile.avatar;
      else if (profile?.logo) patch.photoUrl = profile.logo;
      if (profile?.emailVisible !== false && profile?.email) patch.email = profile.email;
      onChange(patch);
      onContactMatch?.();
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="wn-name-wrap">
      <input
        type="text"
        className="wn-inp"
        value={woman.name || ''}
        onChange={e => { onChange({ name: e.target.value }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && contactMatches.length > 0 && (
        <div className="wn-name-suggest">
          <div className="wn-name-suggest-hd">From your Contacts</div>
          {contactMatches.map(c => (
            <button
              type="button"
              key={c.uid}
              className="wn-name-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickContact(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {open && contactMatches.length === 0 && womenMatches.length > 0 && (
        <div className="wn-name-suggest">
          <div className="wn-name-suggest-hd">Link to existing — All Women</div>
          {womenMatches.map(w => (
            <button
              type="button"
              key={w.id}
              className="wn-name-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onLinkExisting?.(w.id)}
            >
              {w.name}{w.lifeStage ? ` · ${w.lifeStage}` : ''}
            </button>
          ))}
        </div>
      )}
      {filling && <div className="wn-name-suggest-status">Filling from contact…</div>}
    </div>
  );
}

function Row({ children })  { return <div className="wn-row-fields">{children}</div>; }
function Field({ label, children }) {
  return (
    <label className="wn-field">
      <span className="wn-field-lbl">{label}</span>
      {children}
    </label>
  );
}
