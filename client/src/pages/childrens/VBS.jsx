import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → VBS & Special Events
   Storage: childrens:specialEvents — array of { id, name, kind,
   startDate, endDate, theme, dailySchedule, decorList, tshirts,
   registrations, notes }. */

const ACCENT = 'var(--accent-amber, #fbbf24)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const KINDS = ['VBS', 'Camp', 'Family Night', 'Holiday Party', 'Outreach', 'Other'];

const DEFAULT_EVENT = () => ({
  id:            makeId('ev'),
  name:          '',
  kind:          'VBS',
  startDate:     new Date().toISOString().slice(0, 10),
  endDate:       '',
  theme:         '',
  dailySchedule: '',
  decorList:     '',
  tshirts:       { ordered: 0, design: '', vendor: '', sizes: '' },
  registrations: [],            // [{ id, kidId?, kidName, ageBand, tshirtSize, notes }]
  notes:         '',
  active:        true,
  createdAt:     Date.now(),
});

export default function ChildrensVBS() {
  const [events, setEvents, { loading }] = useUserStoreKey('childrens:specialEvents', []);
  const [kids]                            = useUserStoreKey('childrens:kids', []);
  const list    = Array.isArray(events) ? events : [];
  const kidList = Array.isArray(kids) ? kids : [];

  const [filter, setFilter] = useState('upcoming');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => list
    .filter(e => filter === 'upcoming' ? (e.endDate || e.startDate || '') >= today
              : filter === 'past'      ? (e.endDate || e.startDate || '') <  today
              : true)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  , [list, filter, today]);

  const add = () => {
    const e = DEFAULT_EVENT();
    setEvents(prev => [e, ...(prev || [])]);
    setOpenId(e.id);
  };
  const update = (id, patch) =>
    setEvents(prev => (prev || []).map(e => e.id === id ? { ...e, ...patch } : e));
  const remove = (id) => {
    if (!confirm('Delete this event?')) return;
    setEvents(prev => (prev || []).filter(e => e.id !== id));
    if (openId === id) setOpenId(null);
  };
  const addReg = (eventId) => {
    const event = list.find(e => e.id === eventId);
    if (!event) return;
    const reg = { id: makeId('reg'), kidId: '', kidName: '', ageBand: '', tshirtSize: 'YM', notes: '' };
    update(eventId, { registrations: [...(event.registrations || []), reg] });
  };
  const patchReg = (eventId, regId, patch) => {
    const event = list.find(e => e.id === eventId);
    update(eventId, { registrations: (event.registrations || []).map(r => r.id === regId ? { ...r, ...patch } : r) });
  };
  const removeReg = (eventId, regId) => {
    const event = list.find(e => e.id === eventId);
    update(eventId, { registrations: (event.registrations || []).filter(r => r.id !== regId) });
  };

  const open = openId ? list.find(e => e.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Programs" groupIcon="📅"
      icon="🎪" title="VBS & Special Events"
      accent={ACCENT}
      subtitle="Vacation Bible School + one-off special events with registration, daily schedule, decor list, and t-shirt counts."
      actions={<button className="yps-add-btn" onClick={add}>＋ New event</button>}
      stats={[
        { n: list.filter(e => (e.endDate || e.startDate || '') >= today).length, label: 'upcoming' },
        { n: list.reduce((n, e) => n + (e.registrations?.length || 0), 0), label: 'total registrations' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-chips">
        <button className={`yps-chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button className={`yps-chip ${filter === 'past' ? 'on' : ''}`}     onClick={() => setFilter('past')}>Past</button>
        <button className={`yps-chip ${filter === 'all' ? 'on' : ''}`}      onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🎪</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🎪</div><div className="cm-empty-title">No special events yet</div><div className="cm-empty-sub">Tap "＋ New event" to start planning your next VBS or family night.</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(e => (
            <article key={e.id} className="cm-card" onClick={() => setOpenId(e.id)}>
              <div className="cm-card-hd">
                <h3 className="cm-card-title">{e.name || 'Untitled event'}</h3>
                <span className="yps-pill">{e.kind}</span>
              </div>
              <div className="cm-card-sub">📅 {e.startDate}{e.endDate && e.endDate !== e.startDate ? ` → ${e.endDate}` : ''}</div>
              {e.theme && <div className="cm-card-sub">🎨 {e.theme}</div>}
              <div className="cm-card-meta">
                <span className="yps-pill">{(e.registrations || []).length} registered</span>
                {e.tshirts?.ordered > 0 && <span className="yps-pill">👕 {e.tshirts.ordered}</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.name || 'New event'}</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Name" full><input className="yps-input" value={open.name} onChange={e => update(open.id, { name: e.target.value })} /></Field>
              <Field label="Kind">
                <select className="yps-select" value={open.kind} onChange={e => update(open.id, { kind: e.target.value })}>
                  {KINDS.map(k => <option key={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="Theme"><input className="yps-input" value={open.theme} onChange={e => update(open.id, { theme: e.target.value })} placeholder="e.g. Stellar — Shine Jesus' Light" /></Field>
              <Field label="Start"><input type="date" className="yps-input" value={open.startDate} onChange={e => update(open.id, { startDate: e.target.value })} /></Field>
              <Field label="End"><input type="date" className="yps-input" value={open.endDate} onChange={e => update(open.id, { endDate: e.target.value })} /></Field>
              <Field label="Daily schedule" full>
                <textarea className="yps-textarea" rows={5} value={open.dailySchedule} onChange={e => update(open.id, { dailySchedule: e.target.value })} placeholder="9:00 — opening assembly\n9:30 — rotations begin..." />
              </Field>
              <Field label="Decor list" full>
                <textarea className="yps-textarea" rows={3} value={open.decorList} onChange={e => update(open.id, { decorList: e.target.value })} />
              </Field>

              <div className="cm-field full">
                <span className="cm-field-label">T-shirts</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 6 }}>
                  <input className="yps-input" type="number" min={0} placeholder="Ordered" value={open.tshirts?.ordered || 0} onChange={e => update(open.id, { tshirts: { ...open.tshirts, ordered: Number(e.target.value) || 0 } })} />
                  <input className="yps-input" placeholder="Vendor" value={open.tshirts?.vendor || ''} onChange={e => update(open.id, { tshirts: { ...open.tshirts, vendor: e.target.value } })} />
                  <input className="yps-input" placeholder="Design notes" value={open.tshirts?.design || ''} onChange={e => update(open.id, { tshirts: { ...open.tshirts, design: e.target.value } })} />
                  <input className="yps-input" placeholder="Size breakdown e.g. YS:8 YM:10..." value={open.tshirts?.sizes || ''} onChange={e => update(open.id, { tshirts: { ...open.tshirts, sizes: e.target.value } })} />
                </div>
              </div>

              <div className="cm-field full">
                <span className="cm-field-label">Registrations ({(open.registrations || []).length})</span>
                <button className="yps-btn" onClick={() => addReg(open.id)} style={{ width: 'fit-content' }}>＋ Add registration</button>
                {(open.registrations || []).length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {open.registrations.map(r => (
                      <li key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 80px 1fr auto', gap: 4, alignItems: 'center' }}>
                        <select className="yps-select" value={r.kidId} onChange={e => {
                          const k = kidList.find(x => x.id === e.target.value);
                          patchReg(open.id, r.id, { kidId: e.target.value, kidName: k?.name || r.kidName, ageBand: k?.ageBand || r.ageBand });
                        }}>
                          <option value="">— Custom name</option>
                          {kidList.map(k => <option key={k.id} value={k.id}>{k.name} ({k.ageBand})</option>)}
                        </select>
                        <input className="yps-input" placeholder="Name" value={r.kidName} onChange={e => patchReg(open.id, r.id, { kidName: e.target.value })} />
                        <input className="yps-input" placeholder="Size" value={r.tshirtSize} onChange={e => patchReg(open.id, r.id, { tshirtSize: e.target.value })} />
                        <input className="yps-input" placeholder="Notes" value={r.notes} onChange={e => patchReg(open.id, r.id, { notes: e.target.value })} />
                        <button className="yps-btn ghost" onClick={() => removeReg(open.id, r.id)}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Field label="Notes" full><textarea className="yps-textarea" rows={3} value={open.notes} onChange={e => update(open.id, { notes: e.target.value })} /></Field>
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
