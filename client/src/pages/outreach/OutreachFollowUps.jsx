import { useMemo, useState } from 'react';
import OutreachShell from './OutreachShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import OutreachMenuSettings from './OutreachMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import './OutreachFollowUps.css';

/* ─────────────────────────────────────────────────────────────
   Outreach → Follow-Ups

   Pipeline of contacts needing a check-in, visit, or invite. Each
   follow-up is assigned to a team member with a due date. Simplified
   pilot version of Women's New to Ministry kanban: fixed stages
   (not user-customizable) and no per-stage checklists — just cards
   you drag between columns, matching the reference implementation's
   native HTML5 drag-and-drop pattern.

   Storage: useUserStoreKey('outreach:follow-ups', []) → Firestore.
   ───────────────────────────────────────────────────────────── */

const ACCENT = 'var(--accent-blue, #60a5fa)';

const STAGES = [
  { id: 'new',       label: 'New',              icon: '🆕', hint: 'Just added to the pipeline' },
  { id: 'contacted', label: 'Contacted',         icon: '📞', hint: 'Reached out at least once' },
  { id: 'scheduled', label: 'Visit Scheduled',   icon: '📅', hint: 'A visit or invite is on the calendar' },
  { id: 'connected', label: 'Connected',         icon: '🌱', hint: 'Plugged into a next step' },
];

const makeId = () => 'ofu_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_ITEM = () => ({
  id:         makeId(),
  name:       '',
  assignedTo: '',
  dueDate:    '',
  note:       '',
  stage:      'new',
  createdAt:  Date.now(),
});

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OutreachFollowUps() {
  const [items, setItems, { loading }] = useUserStoreKey('outreach:follow-ups', []);
  const list = Array.isArray(items) ? items : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [dragOverStage, setDragOverStage] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null);

  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s.id] = []; });
    list.forEach(item => { (map[item.stage] || map.new).push(item); });
    return map;
  }, [list]);

  const addItem = () => {
    const item = DEFAULT_ITEM();
    setItems(prev => [...(Array.isArray(prev) ? prev : []), item]);
    setOpenId(item.id);
    setDraft(item);
  };

  const openCard = (item) => { setOpenId(item.id); setDraft(item); };
  const closeCard = () => { setOpenId(null); setDraft(null); };

  const saveDraft = () => {
    setItems(prev => (Array.isArray(prev) ? prev : []).map(it => it.id === draft.id ? draft : it));
    closeCard();
  };

  const removeItem = (id) => {
    if (!confirm('Remove this follow-up? This cannot be undone.')) return;
    setItems(prev => (Array.isArray(prev) ? prev : []).filter(it => it.id !== id));
    if (openId === id) closeCard();
  };

  const setStage = (id, stage) => {
    setItems(prev => (Array.isArray(prev) ? prev : []).map(it => it.id === id ? { ...it, stage } : it));
  };

  /* Native HTML5 DnD — cards are draggable, columns are drop targets. */
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleColDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleColDrop = (e, stageId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) setStage(id, stageId);
    setDragOverStage(null);
  };

  const set = (field) => (e) => setDraft(d => ({ ...d, [field]: e.target.value }));

  const totalActive = list.length - byStage.connected.length;

  return (
    <OutreachShell
      title="Follow-Ups"
      icon="📋"
      subtitle="Pipeline of contacts needing a check-in, visit, or invite — each assigned to a team member with a due date."
      actions={
        <button type="button" className="osh-btn primary" onClick={addItem}>
          ＋ Add follow-up
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="ofu-root" style={{ '--ofu-accent': ACCENT }}>
        <div className="ofu-shell">

          <p className="ofu-description">
            {totalActive} active in pipeline · {byStage.connected.length} connected
          </p>

          <section className="ofu-board">
            {loading && list.length === 0 ? (
              <div className="ofu-loading">Loading…</div>
            ) : (
              STAGES.map(stage => (
                <div
                  key={stage.id}
                  className={`ofu-col${dragOverStage === stage.id ? ' drag-over' : ''}`}
                  onDragOver={handleColDragOver}
                  onDragEnter={() => setDragOverStage(stage.id)}
                  onDragLeave={() => setDragOverStage(cur => (cur === stage.id ? null : cur))}
                  onDrop={(e) => handleColDrop(e, stage.id)}
                >
                  <header className="ofu-col-head">
                    <span className="ofu-col-icon" aria-hidden="true">{stage.icon}</span>
                    <span className="ofu-col-name">{stage.label}</span>
                    <span className="ofu-col-count">{byStage[stage.id].length}</span>
                  </header>
                  <p className="ofu-col-hint">{stage.hint}</p>
                  <div className="ofu-col-body">
                    {byStage[stage.id].length === 0 && (
                      <div className="ofu-col-empty">Drop here</div>
                    )}
                    {byStage[stage.id].map(item => (
                      <FollowUpCard
                        key={item.id}
                        item={item}
                        onOpen={() => openCard(item)}
                        onDragStart={(e) => handleDragStart(e, item.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

        </div>
      </div>

      {openId && draft && (
        <div className="ofu-modal-backdrop" onClick={closeCard}>
          <div className="ofu-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ofu-modal-head">
              <h2 className="ofu-modal-title">{draft.name || '(unnamed follow-up)'}</h2>
              <button type="button" className="ofu-modal-x" onClick={closeCard}>✕</button>
            </header>
            <div className="ofu-modal-body">
              <label className="ofu-field">
                <span className="ofu-field-lbl">Name</span>
                <input type="text" className="ofu-inp" value={draft.name} onChange={set('name')} />
              </label>
              <label className="ofu-field">
                <span className="ofu-field-lbl">Assigned to</span>
                <input type="text" className="ofu-inp" value={draft.assignedTo} onChange={set('assignedTo')} placeholder="Team member's name" />
              </label>
              <label className="ofu-field">
                <span className="ofu-field-lbl">Due date</span>
                <input type="date" className="ofu-inp" value={draft.dueDate} onChange={set('dueDate')} />
              </label>
              <label className="ofu-field">
                <span className="ofu-field-lbl">Stage</span>
                <select className="ofu-inp" value={draft.stage} onChange={set('stage')}>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                </select>
              </label>
              <label className="ofu-field ofu-field-wide">
                <span className="ofu-field-lbl">Note</span>
                <textarea className="ofu-inp ofu-textarea" value={draft.note} onChange={set('note')} />
              </label>
            </div>
            <footer className="ofu-modal-foot">
              <button type="button" className="ofu-btn ofu-btn-ghost" onClick={() => removeItem(draft.id)}>
                🗑 Delete
              </button>
              <button type="button" className="ofu-btn ofu-btn-primary" onClick={saveDraft}>
                Save
              </button>
            </footer>
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🤲 Customize Menu"
        pageSettings={<OutreachMenuSettings />}
      />
    </OutreachShell>
  );
}

function FollowUpCard({ item, onOpen, onDragStart }) {
  const overdue = item.dueDate && item.dueDate < todayISO() && item.stage !== 'connected';
  return (
    <div
      className={`ofu-card${overdue ? ' is-overdue' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
    >
      {overdue && <span className="ofu-card-overdue">⚡ Overdue</span>}
      <div className="ofu-card-name">{item.name || '(unnamed)'}</div>
      <div className="ofu-card-meta">
        {item.dueDate && <span className="ofu-card-chip">📅 {item.dueDate}</span>}
        {item.assignedTo && <span className="ofu-card-chip">🙋 {item.assignedTo}</span>}
      </div>
      {item.note && <div className="ofu-card-note">{item.note}</div>}
    </div>
  );
}
