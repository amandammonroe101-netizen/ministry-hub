import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import {
  useTrainees, useHosts, ROLES, roleMeta,
  DEFAULT_TRAINING_LABELS, makeTrainingItem, today,
} from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → In Training

   Onboarding pipeline for new hospitality volunteers — shadow
   shifts logged, a hospitality-standards checklist, and a target
   signoff date. "Promote to host" creates the real record on the
   shared host directory (All Hosts) once training is complete, so
   a trainee's identity only ever lives in one place going forward.

   Storage: useTrainees() — hospitality:trainees
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_TRAINEE = () => ({
  id:            makeId('tn'),
  name:          '',
  roleKey:       '',
  shadowShifts:  0,
  training:      DEFAULT_TRAINING_LABELS.map(makeTrainingItem),
  targetDate:    '',
  status:        'training',
  hostId:        null,
  notes:         '',
  createdAt:     Date.now(),
});

export default function InTraining() {
  const [trainees, setTrainees, { loading }] = useTrainees();
  const [, setHosts] = useHosts();
  const navigate = useNavigate();

  const list = Array.isArray(trainees) ? trainees : [];
  const active = useMemo(() => list.filter(t => t.status !== 'promoted'), [list]);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const addTrainee = () => {
    const t = DEFAULT_TRAINEE();
    setTrainees(prev => [...(prev || []), t]);
    setSelectedId(t.id);
  };
  const updateTrainee = (id, patch) => setTrainees(prev => (prev || []).map(t => t.id === id ? { ...t, ...patch } : t));
  const removeTrainee = (id) => {
    setTrainees(prev => (prev || []).filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const promote = (trainee) => {
    const host = {
      id: makeId('host'),
      name: trainee.name,
      photoUrl: '',
      roles: trainee.roleKey ? [trainee.roleKey] : [],
      primaryRole: trainee.roleKey || '',
      status: 'active',
      servicePreference: '',
      phone: '', email: '',
      availability: '',
      joinedDate: today(),
      notes: `Promoted from training on ${today()}.`,
      createdAt: Date.now(),
    };
    setHosts(prev => [...(prev || []), host]);
    updateTrainee(trainee.id, { status: 'promoted', hostId: host.id });
  };

  const selected = useMemo(() => list.find(t => t.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
  }, [selected]);

  const stats = useMemo(() => ({
    total:   active.length,
    ready:   active.filter(t => checklistDone(t)).length,
    overdue: active.filter(t => t.targetDate && t.targetDate < today() && !checklistDone(t)).length,
  }), [active]);

  return (
    <HospitalityShell
      title="In Training"
      icon="✨"
      subtitle="Trainees in onboarding — current role, shadow shifts logged, hospitality-standards checklist, and target signoff date."
      actions={
        <button type="button" className="hms-btn primary" onClick={addTrainee}>✦ New trainee</button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : active.length === 0 ? (
            <div className="ha-empty app-empty">
              <div className="app-empty-icon">✨</div>
              <div className="app-empty-title">No trainees right now</div>
              <div className="app-empty-sub">Add anyone onboarding into a hospitality position — track shadow shifts and the standards checklist here.</div>
              <button type="button" className="app-btn primary" onClick={addTrainee}>✦ Add your first trainee</button>
            </div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{stats.total}</span><span className="ha-stat-lbl">In training</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{stats.ready}</span><span className="ha-stat-lbl">Ready to promote</span></div>
                <div className={stats.overdue > 0 ? 'ha-stat is-warn' : 'ha-stat'}><span className="ha-stat-n">{stats.overdue}</span><span className="ha-stat-lbl">Past target date</span></div>
              </div>

              <div className="ha-card-grid">
                {active.map(t => {
                  const role = roleMeta(t.roleKey);
                  const done = checklistDone(t);
                  const overdue = t.targetDate && t.targetDate < today() && !done;
                  return (
                    <button key={t.id} type="button" className="ha-fc" onClick={() => setSelectedId(t.id)}>
                      <span className="ha-fc-stripe" />
                      {overdue && <span className="ha-fc-badge">⚡ Overdue</span>}
                      <span className="ha-fc-name">{t.name || 'Unnamed trainee'}</span>
                      <span className="ha-fc-meta">{role ? `${role.icon} ${role.label}` : 'No role picked'}</span>
                      <span className="ha-fc-status">{t.shadowShifts || 0} shadow shift{(t.shadowShifts || 0) === 1 ? '' : 's'}</span>
                      {done && <span className="ha-pill" style={{ '--pill-c': '#6ee7b7' }}>✓ Checklist complete</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

      {selected && (
        <>
          <div className="ha-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="ha-slide" role="dialog" aria-label="Trainee">
            <button className="ha-slide-close" onClick={() => setSelectedId(null)} aria-label="Close" title="Close (Esc)">✕</button>
            <div className="ha-slide-body">
              <TraineeDetail
                trainee={selected}
                onChange={(patch) => updateTrainee(selected.id, patch)}
                onDelete={() => removeTrainee(selected.id)}
                onPromote={() => promote(selected)}
                onOpenHost={() => navigate('/hospitality/all')}
              />
            </div>
          </aside>
        </>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}

function checklistDone(t) {
  const items = Array.isArray(t.training) ? t.training : [];
  return items.length > 0 && items.every(i => i.done);
}

function TraineeDetail({ trainee, onChange, onDelete, onPromote, onOpenHost }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [draft, setDraft] = useState('');
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });
  const items = Array.isArray(trainee.training) ? trainee.training : [];
  const done = items.filter(i => i.done).length;
  const isPromoted = trainee.status === 'promoted';

  const toggle = (id) => onChange({ training: items.map(i => i.id === id ? { ...i, done: !i.done } : i) });
  const setDue = (id, dueDate) => onChange({ training: items.map(i => i.id === id ? { ...i, dueDate } : i) });
  const removeItem = (id) => onChange({ training: items.filter(i => i.id !== id) });
  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    onChange({ training: [...items, makeTrainingItem(label)] });
    setDraft('');
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <h2 className="ys-form-title">{trainee.name || 'New trainee'}</h2>
        <button
          type="button"
          className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => { if (confirmDel) { onDelete(); return; } setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); }}
        >{confirmDel ? 'Click again to delete' : '🗑 Delete'}</button>
      </div>

      {isPromoted && (
        <div style={{ padding: 10, borderRadius: 10, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', fontSize: 13 }}>
          ✓ Promoted to full host.{' '}
          <button type="button" className="app-btn ghost" style={{ marginLeft: 6 }} onClick={onOpenHost}>Open on All Hosts →</button>
        </div>
      )}

      <section className="ys-section">
        <h3 className="ys-section-title">Who</h3>
        <div className="ys-section-body">
          <label className="ys-field"><span className="ys-field-lbl">Name</span>
            <input type="text" className="ys-inp" value={trainee.name || ''} onChange={set('name')} disabled={isPromoted} />
          </label>
          <div className="ys-row-fields">
            <label className="ys-field"><span className="ys-field-lbl">Training for role</span>
              <select className="ys-inp" value={trainee.roleKey || ''} onChange={set('roleKey')} disabled={isPromoted}>
                <option value="">—</option>
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
              </select>
            </label>
            <label className="ys-field"><span className="ys-field-lbl">Target signoff date</span>
              <input type="date" className="ys-inp" value={trainee.targetDate || ''} onChange={set('targetDate')} disabled={isPromoted} />
            </label>
          </div>
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Shadow shifts</h3>
        <div className="ys-section-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{trainee.shadowShifts || 0}</span>
            <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} disabled={isPromoted}
              onClick={() => onChange({ shadowShifts: (trainee.shadowShifts || 0) + 1 })}>＋ Log a shift</button>
            {(trainee.shadowShifts || 0) > 0 && !isPromoted && (
              <button type="button" className="app-btn ghost" onClick={() => onChange({ shadowShifts: Math.max(0, (trainee.shadowShifts || 0) - 1) })}>− Undo</button>
            )}
          </div>
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Standards checklist ({done}/{items.length})</h3>
        <div className="ys-section-body">
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No checklist items yet.</div>
          ) : (
            <ul className="ld-training-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map(t => (
                <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <input type="checkbox" checked={!!t.done} onChange={() => toggle(t.id)} disabled={isPromoted} />
                    <span style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1 }}>{t.label}</span>
                  </label>
                  <input type="date" className="ys-inp" style={{ width: 140 }} value={t.dueDate || ''} onChange={e => setDue(t.id, e.target.value)} disabled={isPromoted} />
                  {!isPromoted && <button type="button" className="ld-training-del app-btn ghost" onClick={() => removeItem(t.id)} aria-label="Remove item">✕</button>}
                </li>
              ))}
            </ul>
          )}
          {!isPromoted && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input type="text" className="ys-inp" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add checklist item…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
              <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addItem}>＋ Add</button>
            </div>
          )}
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Notes</h3>
        <div className="ys-section-body">
          <textarea className="ys-inp ys-textarea" rows={3} value={trainee.notes || ''} onChange={set('notes')} disabled={isPromoted} />
        </div>
      </section>

      {!isPromoted && (
        <button type="button" className="app-btn primary" disabled={!checklistDone(trainee) || !trainee.name?.trim()} onClick={onPromote}>
          🎓 Promote to full host
        </button>
      )}
    </form>
  );
}
