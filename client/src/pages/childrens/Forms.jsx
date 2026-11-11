import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Registration Forms
   Storage: childrens:forms — form templates with per-kid status. */

const ACCENT = 'var(--accent-purple, #a78bfa)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const TYPES = ['Registration', 'Photo release', 'Medical release', 'Pickup authorization', 'Special-event permission', 'Other'];

const DEFAULT_FORM = () => ({
  id:           makeId('f'),
  title:        '',
  type:         'Registration',
  dueDate:      '',
  instructions: '',
  status:       {},                  // { kidId: 'signed' | 'pending' | 'missing' }
  createdAt:    Date.now(),
});

export default function ChildrensForms() {
  const [forms, setForms, { loading }] = useUserStoreKey('childrens:forms', []);
  const [kids] = useUserStoreKey('childrens:kids', []);
  const list = Array.isArray(forms) ? forms : [];
  const kidList = Array.isArray(kids) ? kids : [];

  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const add = () => {
    const f = DEFAULT_FORM();
    setForms(prev => [...(prev || []), f]);
    setOpenId(f.id);
  };
  const update = (id, patch) =>
    setForms(prev => (prev || []).map(f => f.id === id ? { ...f, ...patch } : f));
  const remove = (id) => {
    if (!confirm('Delete this form?')) return;
    setForms(prev => (prev || []).filter(f => f.id !== id));
    if (openId === id) setOpenId(null);
  };
  const setStatus = (formId, kidId, status) => {
    const f = list.find(f => f.id === formId);
    if (!f) return;
    update(formId, { status: { ...f.status, [kidId]: status } });
  };

  const open = openId ? list.find(f => f.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Records" groupIcon="🗂"
      icon="📝" title="Registration Forms"
      accent={ACCENT}
      subtitle="Per-kid signed/pending/missing tracker for registration, photo release, etc."
      actions={<button className="yps-add-btn" onClick={add}>＋ New form</button>}
      stats={[
        { n: list.length, label: 'forms' },
        { n: list.reduce((a, f) => a + Object.values(f.status || {}).filter(s => s === 'signed').length, 0), label: 'signed total' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📝</div><div className="cm-empty-title">Loading…</div></div>
      ) : list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📝</div><div className="cm-empty-title">No forms yet</div><div className="cm-empty-sub">Set up your first.</div></div>
      ) : (
        <div className="cm-grid">
          {list.map(f => {
            const counts = {
              signed:  Object.values(f.status || {}).filter(s => s === 'signed').length,
              pending: Object.values(f.status || {}).filter(s => s === 'pending').length,
              missing: kidList.length - Object.values(f.status || {}).filter(s => s === 'signed' || s === 'pending').length,
            };
            return (
              <article key={f.id} className="cm-card" onClick={() => setOpenId(f.id)}>
                <div className="cm-card-hd">
                  <h3 className="cm-card-title">{f.title || 'Untitled form'}</h3>
                  <span className="yps-pill">{f.type}</span>
                </div>
                {f.dueDate && <div className="cm-card-sub">📅 Due {f.dueDate}</div>}
                <div className="cm-card-meta">
                  <span className="yps-pill cm-good">✓ {counts.signed} signed</span>
                  <span className="yps-pill cm-warn">⏳ {counts.pending} pending</span>
                  <span className="yps-pill cm-bad">✗ {Math.max(0, counts.missing)} missing</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd"><h2>{open.title || 'New form'}</h2><button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button></header>
            <div className="cm-modal-body">
              <Field label="Title" full><input className="yps-input" value={open.title} onChange={e => update(open.id, { title: e.target.value })} /></Field>
              <Field label="Type"><select className="yps-select" value={open.type} onChange={e => update(open.id, { type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Due date"><input type="date" className="yps-input" value={open.dueDate} onChange={e => update(open.id, { dueDate: e.target.value })} /></Field>
              <Field label="Instructions" full><textarea className="yps-textarea" rows={3} value={open.instructions} onChange={e => update(open.id, { instructions: e.target.value })} /></Field>

              <div className="cm-field full">
                <span className="cm-field-label">Per-kid tracker</span>
                {kidList.length === 0 ? (
                  <div className="cm-card-sub">Add kids on All Kids first.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                    {kidList.filter(k => k.active).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(k => {
                      const st = open.status?.[k.id] || 'missing';
                      return (
                        <li key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                          <span style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>{k.name} <span className="cm-card-sub">· {k.ageBand}</span></span>
                          {['signed', 'pending', 'missing'].map(opt => (
                            <button
                              key={opt}
                              className={`yps-chip ${st === opt ? 'on' : ''} ${opt === 'signed' ? 'cm-good' : opt === 'pending' ? 'cm-warn' : 'cm-bad'}`}
                              onClick={() => setStatus(open.id, k.id, opt)}
                            >{opt}</button>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
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
