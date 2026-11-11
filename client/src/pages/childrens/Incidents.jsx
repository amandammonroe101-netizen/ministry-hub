import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Incident Reports
   Storage: childrens:incidents — log of injuries, behavior
   incidents, diaper changes, etc. Each entry { id, kidId, kidName,
   date, time, kind, description, witness, parentNotifiedAt,
   acknowledged, acknowledgedAt }. */

const ACCENT = 'var(--accent-rose, #fb7185)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const KINDS = [
  { id: 'injury',   label: '🩹 Injury',    tone: 'cm-bad'  },
  { id: 'behavior', label: '⚠ Behavior',   tone: 'cm-warn' },
  { id: 'diaper',   label: '🍼 Diaper',    tone: 'cm-info' },
  { id: 'medical',  label: '💊 Medical',   tone: 'cm-bad'  },
  { id: 'other',    label: '📝 Other',     tone: ''        },
];
const kindDef = (id) => KINDS.find(k => k.id === id) || KINDS[KINDS.length - 1];

const DEFAULT_INCIDENT = (kidId, kidName) => ({
  id:             makeId('inc'),
  kidId,
  kidName,
  date:           new Date().toISOString().slice(0, 10),
  time:           new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
  kind:           'injury',
  description:    '',
  witness:        '',
  parentNotifiedAt: '',
  acknowledged:   false,
  acknowledgedAt: '',
  createdAt:      Date.now(),
});

export default function ChildrensIncidents() {
  const [kids]               = useUserStoreKey('childrens:kids', []);
  const [incidents, setIncidents, { loading }] = useUserStoreKey('childrens:incidents', []);
  const kidList = Array.isArray(kids) ? kids : [];
  const list    = Array.isArray(incidents) ? incidents : [];

  const [kindFilter, setKindFilter] = useState('all');
  const [showAckd, setShowAckd] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKidId, setNewKidId] = useState('');

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => list
    .filter(i => kindFilter === 'all' ? true : i.kind === kindFilter)
    .filter(i => showAckd ? true : !i.acknowledged)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  , [list, kindFilter, showAckd]);

  const open = openId ? list.find(i => i.id === openId) : null;

  const start = () => {
    if (!newKidId) { alert('Pick a kid first.'); return; }
    const k = kidList.find(x => x.id === newKidId);
    if (!k) return;
    const entry = DEFAULT_INCIDENT(k.id, k.name);
    setIncidents(prev => [entry, ...(prev || [])]);
    setOpenId(entry.id);
    setAddOpen(false);
    setNewKidId('');
  };
  const update = (id, patch) =>
    setIncidents(prev => (prev || []).map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id) => {
    if (!confirm('Remove this incident? This permanently deletes the record.')) return;
    setIncidents(prev => (prev || []).filter(i => i.id !== id));
    if (openId === id) setOpenId(null);
  };
  const acknowledge = (id) => update(id, { acknowledged: true, acknowledgedAt: new Date().toISOString() });

  const unackd = list.filter(i => !i.acknowledged).length;

  return (
    <ChildrensShell
      groupLabel="Check-In & Safety" groupIcon="🛡"
      icon="🚨" title="Incident Reports"
      accent={ACCENT}
      subtitle="Log injuries, behavior incidents, and diaper changes. Mark acknowledged once you've notified the parent."
      actions={<button className="yps-add-btn" onClick={() => setAddOpen(true)}>＋ Log incident</button>}
      stats={[
        { n: list.length, label: 'all-time incidents' },
        { n: unackd, label: 'unacknowledged' },
        { n: list.filter(i => i.date === new Date().toISOString().slice(0, 10)).length, label: 'today' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-chips">
        <button className={`yps-chip ${kindFilter === 'all' ? 'on' : ''}`} onClick={() => setKindFilter('all')}>All kinds</button>
        {KINDS.map(k => (
          <button key={k.id} className={`yps-chip ${kindFilter === k.id ? 'on' : ''}`} onClick={() => setKindFilter(k.id)}>{k.label}</button>
        ))}
        <label className="yps-chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={showAckd} onChange={e => setShowAckd(e.target.checked)} style={{ marginRight: 6 }} />
          Show acknowledged
        </label>
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🚨</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty">
          <div className="cm-empty-icon">🚨</div>
          <div className="cm-empty-title">{list.length === 0 ? 'No incidents yet' : 'Nothing matches this filter'}</div>
          <div className="cm-empty-sub">Hopefully it stays that way! Tap <b>＋ Log incident</b> to record one.</div>
        </div>
      ) : (
        <div className="cm-rows">
          {visible.map(i => {
            const def = kindDef(i.kind);
            return (
              <button key={i.id} className="cm-row" onClick={() => setOpenId(i.id)} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span className={`yps-pill ${def.tone}`}>{def.label}</span>
                  <span className="cm-row-name">{i.kidName || '(unknown kid)'}</span>
                  <span className="cm-row-sub">{i.date} {i.time}</span>
                  {i.acknowledged
                    ? <span className="yps-pill cm-good" style={{ marginLeft: 'auto' }}>✓ Ack'd</span>
                    : <span className="yps-pill cm-warn" style={{ marginLeft: 'auto' }}>⏳ Open</span>}
                </div>
                {i.description && (
                  <div className="cm-row-sub" style={{ width: '100%', whiteSpace: 'pre-wrap' }}>{i.description.slice(0, 240)}{i.description.length > 240 ? '…' : ''}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {addOpen && (
        <div className="cm-modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="cm-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd"><h2>New incident — pick a kid</h2><button className="yps-btn ghost" onClick={() => setAddOpen(false)}>✕</button></header>
            <div style={{ padding: 16 }}>
              <select className="yps-select" value={newKidId} onChange={e => setNewKidId(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Pick a kid</option>
                {kidList.filter(k => k.active).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map(k => <option key={k.id} value={k.id}>{k.name} · {k.ageBand}</option>)}
              </select>
            </div>
            <footer className="cm-modal-ft">
              <button className="yps-btn ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="yps-add-btn" disabled={!newKidId} onClick={start}>Start logging</button>
            </footer>
          </div>
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.kidName} — incident report</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Date"><input type="date" className="yps-input" value={open.date} onChange={e => update(open.id, { date: e.target.value })} /></Field>
              <Field label="Time"><input type="time" className="yps-input" value={open.time} onChange={e => update(open.id, { time: e.target.value })} /></Field>
              <Field label="Kind" full>
                <select className="yps-select" value={open.kind} onChange={e => update(open.id, { kind: e.target.value })}>
                  {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="What happened?" full>
                <textarea className="yps-textarea" rows={5} value={open.description} onChange={e => update(open.id, { description: e.target.value })} placeholder="Describe what happened, where, and any action taken…" />
              </Field>
              <Field label="Witness" full>
                <input className="yps-input" value={open.witness} onChange={e => update(open.id, { witness: e.target.value })} placeholder="Other volunteer present" />
              </Field>
              <Field label="Parent notified at">
                <input type="datetime-local" className="yps-input" value={open.parentNotifiedAt} onChange={e => update(open.id, { parentNotifiedAt: e.target.value })} />
              </Field>
              <Field label="Acknowledged">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <input type="checkbox" checked={open.acknowledged} onChange={e => {
                    if (e.target.checked) acknowledge(open.id);
                    else update(open.id, { acknowledged: false, acknowledgedAt: '' });
                  }} />
                  <span>{open.acknowledged ? `✓ Ack'd ${open.acknowledgedAt ? new Date(open.acknowledgedAt).toLocaleString() : ''}` : 'Not yet'}</span>
                </label>
              </Field>
            </div>
            <footer className="cm-modal-ft">
              <button className="yps-btn danger" onClick={() => remove(open.id)}>🗑 Delete</button>
              <button className="yps-add-btn" onClick={() => setOpenId(null)}>Done</button>
            </footer>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`cm-field ${full ? 'full' : ''}`}>
      <span className="cm-field-label">{label}</span>
      {children}
    </label>
  );
}
