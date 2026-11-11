import { useMemo, useState } from 'react';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import './Visitors.css';

/* ─────────────────────────────────────────────────────────────
   Youth → Visitors / First-Timers

   A kanban-style pipeline that filters the shared youth:students
   list down to people whose visitorStatus is set to one of:
     new | contacted | returned | connected
   Each column shows the people at that stage. Cards can be
   advanced / moved back / removed-from-pipeline (visitorStatus
   reset to '') or fully deleted.

   ＋ Add visitor creates a new record in the shared students
   list with visitorStatus='new' so it also shows up on the
   All Students page.
   ───────────────────────────────────────────────────────────── */

/* Matches the Youth Ministry students-group accent (see youthConfig.js). */
const ACCENT = '#b45309';

const STAGES = [
  { id: 'new',       label: 'New',         icon: '🆕', hint: 'Just visited for the first time' },
  { id: 'contacted', label: 'Contacted',   icon: '☎️', hint: 'Follow-up call or text sent'    },
  { id: 'returned',  label: 'Returned',    icon: '🔁', hint: 'Came back for a second visit'    },
  { id: 'connected', label: 'Connected',   icon: '🤝', hint: 'Plugged into a group / serving'  },
];

const DEFAULT_VISITOR = () => ({
  id:                'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
  name:              '',
  grade:             '',
  school:            '',
  birthday:          '',
  phone:             '',
  email:             '',
  parentName:        '',
  parentPhone:       '',
  parentEmail:       '',
  emergencyContact:  '',
  allergies:         '',
  notes:             '',
  joinedDate:        new Date().toISOString().slice(0, 10),
  salvationDate:     '',
  baptismDate:       '',
  visitorStatus:     'new',
  visitorAssignedTo: '',
  visitorNotes:      '',
  createdAt:         Date.now(),
});

export default function Visitors() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [students, setStudents, { loading }] = useUserStoreKey('youth:students', []);
  const list = Array.isArray(students) ? students : [];

  const [editingId, setEditingId] = useState(null);

  /* People in the pipeline = anyone with a visitor status set. */
  const inPipeline = useMemo(
    () => list.filter(s => STAGES.some(st => st.id === s.visitorStatus)),
    [list]
  );
  const editing = useMemo(
    () => list.find(s => s.id === editingId) || null,
    [list, editingId]
  );

  /* Group pipeline people by stage. */
  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach(st => { map[st.id] = []; });
    inPipeline.forEach(s => { if (map[s.visitorStatus]) map[s.visitorStatus].push(s); });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    });
    return map;
  }, [inPipeline]);

  /* ── Actions ────────────────────────────────────────────── */
  const addVisitor = () => {
    const v = DEFAULT_VISITOR();
    setStudents(prev => [...(prev || []), v]);
    setEditingId(v.id);
  };
  const updateVisitor = (id, patch) => {
    setStudents(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const advanceStage = (id, dir) => {
    const cur = list.find(s => s.id === id);
    if (!cur) return;
    const idx = STAGES.findIndex(st => st.id === cur.visitorStatus);
    const nextIdx = Math.max(0, Math.min(STAGES.length - 1, idx + dir));
    updateVisitor(id, { visitorStatus: STAGES[nextIdx].id });
  };
  const removeFromPipeline = (id) => updateVisitor(id, { visitorStatus: '' });
  const deletePerson = (id) => {
    setStudents(prev => (prev || []).filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const totalActive = inPipeline.length - (byStage.connected?.length || 0);

  return (
    <YouthShell
      groupLabel="Students" groupIcon="👥"
      icon="👋" title="Visitors / First-Timers"
      accent={ACCENT}
      actions={
        <button type="button" className="yv-add-btn" onClick={addVisitor}>
          ＋ Add visitor
        </button>
      }
      stats={[
        { n: totalActive, label: 'active in pipeline' },
        { n: byStage.connected?.length || 0, label: 'connected' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yv-shell">

        {/* Kanban board */}
        <section className="yv-board">
          {loading && list.length === 0 ? (
            <div className="yv-loading">Loading…</div>
          ) : (
            STAGES.map(stage => (
              <div className="yv-col" key={stage.id}>
                <header className="yv-col-head">
                  <span className="yv-col-icon" aria-hidden="true">{stage.icon}</span>
                  <span className="yv-col-name">{stage.label}</span>
                  <span className="yv-col-count">{byStage[stage.id]?.length || 0}</span>
                </header>
                <p className="yv-col-hint">{stage.hint}</p>
                <div className="yv-col-body">
                  {(byStage[stage.id] || []).length === 0 ? (
                    <div className="yv-col-empty">—</div>
                  ) : (
                    byStage[stage.id].map(v => (
                      <VisitorCard
                        key={v.id}
                        visitor={v}
                        isFirstStage={stage.id === STAGES[0].id}
                        isLastStage={stage.id === STAGES[STAGES.length - 1].id}
                        onEdit={() => setEditingId(v.id)}
                        onBack={() => advanceStage(v.id, -1)}
                        onForward={() => advanceStage(v.id, +1)}
                        onRemove={() => removeFromPipeline(v.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        {!loading && totalActive === 0 && (byStage.connected?.length || 0) === 0 && (
          <div className="yv-onboard">
            <h2 className="yv-onboard-title">No visitors in your pipeline yet</h2>
            <p className="yv-onboard-copy">
              Click <b>＋ Add visitor</b> above to log a first-timer. New visitors land in
              the <b>New</b> column — move them along as you call, see them return, and
              plug them into a Bible study.
            </p>
          </div>
        )}

      </div>

      {/* Edit modal */}
      {editing && (
        <EditModal
          visitor={editing}
          onChange={(patch) => updateVisitor(editing.id, patch)}
          onClose={() => setEditingId(null)}
          onDelete={() => deletePerson(editing.id)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

/* ── Visitor card in a column ──────────────────────────────── */
function VisitorCard({ visitor, isFirstStage, isLastStage, onEdit, onBack, onForward, onRemove }) {
  return (
    <article className="yv-card">
      <button type="button" className="yv-card-main" onClick={onEdit}>
        <div className="yv-card-name">{visitor.name || '(unnamed)'}</div>
        <div className="yv-card-meta">
          {visitor.joinedDate && (
            <span className="yv-card-chip">📅 {visitor.joinedDate}</span>
          )}
          {visitor.grade && (
            <span className="yv-card-chip">🎓 {visitor.grade}</span>
          )}
          {visitor.visitorAssignedTo && (
            <span className="yv-card-chip">🙋 {visitor.visitorAssignedTo}</span>
          )}
        </div>
        {visitor.visitorNotes && (
          <div className="yv-card-notes">{visitor.visitorNotes}</div>
        )}
      </button>
      <footer className="yv-card-actions">
        <button
          type="button"
          className="yv-act"
          onClick={onBack}
          disabled={isFirstStage}
          title="Move back a stage"
        >←</button>
        <button
          type="button"
          className="yv-act yv-act-rm"
          onClick={onRemove}
          title="Remove from pipeline (keeps in All Students)"
        >✕</button>
        <button
          type="button"
          className="yv-act"
          onClick={onForward}
          disabled={isLastStage}
          title="Advance to next stage"
        >→</button>
      </footer>
    </article>
  );
}

/* ── Edit modal (full visitor record) ──────────────────────── */
function EditModal({ visitor, onChange, onClose, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });
  return (
    <div className="yv-modal-backdrop" onClick={onClose}>
      <div className="yv-modal" onClick={e => e.stopPropagation()}>
        <header className="yv-modal-head">
          <h2 className="yv-modal-title">{visitor.name || '(unnamed visitor)'}</h2>
          <button type="button" className="yv-modal-x" onClick={onClose}>✕</button>
        </header>

        <div className="yv-modal-body">
          <Row>
            <Field label="Name">
              <input type="text" className="yv-inp" value={visitor.name || ''} onChange={set('name')} />
            </Field>
            <Field label="First visit">
              <input type="date" className="yv-inp" value={visitor.joinedDate || ''} onChange={set('joinedDate')} />
            </Field>
          </Row>
          <Row>
            <Field label="Grade">
              <input type="text" className="yv-inp" value={visitor.grade || ''} onChange={set('grade')} placeholder="9th / 10th / 11th / 12th" />
            </Field>
            <Field label="School">
              <input type="text" className="yv-inp" value={visitor.school || ''} onChange={set('school')} />
            </Field>
          </Row>
          <Row>
            <Field label="Phone">
              <input type="tel" className="yv-inp" value={visitor.phone || ''} onChange={set('phone')} />
            </Field>
            <Field label="Parent phone">
              <input type="tel" className="yv-inp" value={visitor.parentPhone || ''} onChange={set('parentPhone')} />
            </Field>
          </Row>
          <Row>
            <Field label="Stage">
              <select className="yv-inp" value={visitor.visitorStatus || 'new'} onChange={set('visitorStatus')}>
                {STAGES.map(st => (
                  <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to">
              <input type="text" className="yv-inp" value={visitor.visitorAssignedTo || ''} onChange={set('visitorAssignedTo')} placeholder="Host or leader" />
            </Field>
          </Row>
          <Field label="Follow-up notes">
            <textarea
              className="yv-inp yv-textarea"
              rows={4}
              value={visitor.visitorNotes || ''}
              onChange={set('visitorNotes')}
            />
          </Field>
        </div>

        <footer className="yv-modal-foot">
          <button
            type="button"
            className={`yv-del-btn${confirmDel ? ' armed' : ''}`}
            onClick={() => {
              if (confirmDel) { onDelete(); onClose(); return; }
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3500);
            }}
          >
            {confirmDel ? 'Click again to delete permanently' : '🗑 Delete'}
          </button>
          <button type="button" className="yv-done-btn" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

function Row({ children })  { return <div className="yv-row-fields">{children}</div>; }
function Field({ label, children }) {
  return (
    <label className="yv-field">
      <span className="yv-field-lbl">{label}</span>
      {children}
    </label>
  );
}
