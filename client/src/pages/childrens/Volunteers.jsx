import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Volunteers
   Storage: childrens:volunteers. Lighter than Youth Leaders but
   carries the fields the Children's BG-check page reads. */

const ACCENT = 'var(--accent-green, #6ee7b7)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const ROLES = ['Lead Teacher', 'Helper', 'Nursery Worker', 'Floater', 'Check-In Greeter', 'Music', 'Snack', 'Other'];
const ROOMS = ['Nursery (0-2)', 'Toddler (2-3)', 'Preschool (3-5)', 'K-2nd', '3rd-5th', 'Any'];
const BG_STATUSES = [
  { id: 'cleared', label: '✅ Cleared',   tone: 'cm-good' },
  { id: 'pending', label: '⏳ Pending',   tone: 'cm-warn' },
  { id: 'expired', label: '⚠ Expired',    tone: 'cm-bad'  },
  { id: 'missing', label: '❌ Missing',   tone: 'cm-bad'  },
];

const DEFAULT_VOLUNTEER = () => ({
  id:           makeId('v'),
  name:         '',
  role:         'Helper',
  roomPref:     'Any',
  phone:        '',
  email:        '',
  bgStatus:     'missing',
  bgExpires:    '',
  trainingDone: false,
  notes:        '',
  active:       true,
  createdAt:    Date.now(),
});

export default function ChildrensVolunteers() {
  const [vols, setVols, { loading }] = useUserStoreKey('childrens:volunteers', []);
  const list = Array.isArray(vols) ? vols : [];

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(v => filter === 'all' ? true : filter === 'active' ? v.active : !v.active)
      .filter(v => !q || (v.name || '').toLowerCase().includes(q) || (v.role || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, filter]);

  const add = () => {
    const v = DEFAULT_VOLUNTEER();
    setVols(prev => [...(prev || []), v]);
    setOpenId(v.id);
  };
  const update = (id, patch) =>
    setVols(prev => (prev || []).map(v => v.id === id ? { ...v, ...patch } : v));
  const remove = (id) => {
    if (!confirm('Remove this volunteer?')) return;
    setVols(prev => (prev || []).filter(v => v.id !== id));
    if (openId === id) setOpenId(null);
  };

  const open = openId ? list.find(v => v.id === openId) : null;
  const stats = useMemo(() => ({
    active: list.filter(v => v.active).length,
    cleared: list.filter(v => v.bgStatus === 'cleared').length,
    notReady: list.filter(v => v.active && v.bgStatus !== 'cleared').length,
  }), [list]);

  return (
    <ChildrensShell
      groupLabel="Team" groupIcon="🙋"
      icon="🧑‍🏫" title="Volunteers"
      accent={ACCENT}
      subtitle="Volunteer roster with role, room preference, BG status, and contact info."
      actions={<button className="yps-add-btn" onClick={add}>＋ Add volunteer</button>}
      stats={[
        { n: stats.active, label: 'active' },
        { n: stats.cleared, label: 'BG cleared' },
        { n: stats.notReady, label: 'need attention' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input className="yps-input" placeholder="Search by name or role…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="cm-chips">
          <button className={`yps-chip ${filter === 'active' ? 'on' : ''}`}   onClick={() => setFilter('active')}>Active</button>
          <button className={`yps-chip ${filter === 'inactive' ? 'on' : ''}`} onClick={() => setFilter('inactive')}>Inactive</button>
          <button className={`yps-chip ${filter === 'all' ? 'on' : ''}`}      onClick={() => setFilter('all')}>All</button>
        </div>
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🧑‍🏫</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🧑‍🏫</div><div className="cm-empty-title">No volunteers</div><div className="cm-empty-sub">Add your first volunteer.</div></div>
      ) : (
        <div className="cm-rows">
          {visible.map(v => {
            const bg = BG_STATUSES.find(s => s.id === v.bgStatus) || BG_STATUSES[3];
            const phoneHref = v.phone ? `tel:${v.phone.replace(/[^\d+]/g, '')}` : null;
            const emailHref = v.email ? `mailto:${v.email.trim()}` : null;
            return (
              <button key={v.id} className="cm-row" onClick={() => setOpenId(v.id)}>
                <span className="cm-row-name">{v.name || '(unnamed)'}</span>
                <span className="yps-pill">{v.role}</span>
                <span className="yps-pill">{v.roomPref}</span>
                <span className={`yps-pill ${bg.tone}`}>{bg.label}</span>
                <span className="cm-row-sub" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {phoneHref && <a href={phoneHref} onClick={e => e.stopPropagation()} style={{ color: 'var(--yps-accent)', textDecoration: 'none' }}>📞</a>}
                  {emailHref && <a href={emailHref} onClick={e => e.stopPropagation()} style={{ color: 'var(--yps-accent)', textDecoration: 'none' }}>✉</a>}
                  {!v.active && <span className="yps-pill">paused</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd"><h2>{open.name || 'New volunteer'}</h2><button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button></header>
            <div className="cm-modal-body">
              <Field label="Name" full><input className="yps-input" value={open.name} onChange={e => update(open.id, { name: e.target.value })} /></Field>
              <Field label="Role"><select className="yps-select" value={open.role} onChange={e => update(open.id, { role: e.target.value })}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Room preference"><select className="yps-select" value={open.roomPref} onChange={e => update(open.id, { roomPref: e.target.value })}>{ROOMS.map(r => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Phone"><input className="yps-input" type="tel" value={open.phone} onChange={e => update(open.id, { phone: e.target.value })} /></Field>
              <Field label="Email"><input className="yps-input" type="email" value={open.email} onChange={e => update(open.id, { email: e.target.value })} /></Field>
              <Field label="Background check status"><select className="yps-select" value={open.bgStatus} onChange={e => update(open.id, { bgStatus: e.target.value })}>{BG_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
              <Field label="BG expires"><input type="date" className="yps-input" value={open.bgExpires} onChange={e => update(open.id, { bgExpires: e.target.value })} /></Field>
              <Field label="Training complete">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <input type="checkbox" checked={open.trainingDone} onChange={e => update(open.id, { trainingDone: e.target.checked })} />
                  <span>Completed Safe-from-Harm training</span>
                </label>
              </Field>
              <Field label="Active">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <input type="checkbox" checked={open.active} onChange={e => update(open.id, { active: e.target.checked })} />
                  <span>Currently serving</span>
                </label>
              </Field>
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
