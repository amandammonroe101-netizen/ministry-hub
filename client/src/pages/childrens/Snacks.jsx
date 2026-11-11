import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Snacks & Supplies
   Two stores: snack rotation + supply inventory. */

const ACCENT = 'var(--accent-purple, #a78bfa)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_SNACK = () => ({
  id:        makeId('sn'),
  date:      new Date().toISOString().slice(0, 10),
  snack:     '',
  allergenSafe: true,
  byVolunteer:  '',
  notes:     '',
  createdAt: Date.now(),
});

const DEFAULT_SUPPLY = () => ({
  id:        makeId('su'),
  name:      '',
  qty:       0,
  reorderAt: 0,
  vendor:    '',
  notes:     '',
  createdAt: Date.now(),
});

export default function ChildrensSnacks() {
  const [snacks,   setSnacks]   = useUserStoreKey('childrens:snackRotation', []);
  const [supplies, setSupplies] = useUserStoreKey('childrens:supplies',       []);
  const sList = Array.isArray(snacks) ? snacks : [];
  const uList = Array.isArray(supplies) ? supplies : [];

  const [tab, setTab] = useState('snacks');
  const today = new Date().toISOString().slice(0, 10);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const lowStock = uList.filter(u => Number(u.qty || 0) <= Number(u.reorderAt || 0));

  const addSnack = () => setSnacks(prev => [DEFAULT_SNACK(), ...(prev || [])]);
  const updateSnack = (id, patch) => setSnacks(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSnack = (id) => { if (confirm('Remove this snack?')) setSnacks(prev => (prev || []).filter(s => s.id !== id)); };

  const addSupply = () => setSupplies(prev => [...(prev || []), DEFAULT_SUPPLY()]);
  const updateSupply = (id, patch) => setSupplies(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSupply = (id) => { if (confirm('Remove this supply?')) setSupplies(prev => (prev || []).filter(s => s.id !== id)); };

  const visibleSnacks = useMemo(() => [...sList].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [sList]);
  const visibleSupplies = useMemo(() => [...uList].sort((a, b) => {
    const aLow = Number(a.qty || 0) <= Number(a.reorderAt || 0);
    const bLow = Number(b.qty || 0) <= Number(b.reorderAt || 0);
    if (aLow !== bLow) return aLow ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  }), [uList]);

  return (
    <ChildrensShell
      groupLabel="Records" groupIcon="🗂"
      icon="🍎" title="Snacks & Supplies"
      accent={ACCENT}
      subtitle="Snack rotation + supply inventory with low-stock alerts."
      stats={[
        { n: sList.length, label: 'snack entries' },
        { n: uList.length, label: 'supply items' },
        { n: lowStock.length, label: 'low stock' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-chips">
        <button className={`yps-chip ${tab === 'snacks' ? 'on' : ''}`}  onClick={() => setTab('snacks')}>🍎 Snack rotation</button>
        <button className={`yps-chip ${tab === 'supplies' ? 'on' : ''}`} onClick={() => setTab('supplies')}>📦 Supplies {lowStock.length > 0 && <span className="yps-pill cm-bad">{lowStock.length}</span>}</button>
      </div>

      {tab === 'snacks' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="yps-add-btn" onClick={addSnack}>＋ Add snack date</button>
          </div>
          {visibleSnacks.length === 0 ? (
            <div className="cm-empty"><div className="cm-empty-icon">🍎</div><div className="cm-empty-title">No snacks logged</div><div className="cm-empty-sub">Track who brought what each week so the rotation stays fair.</div></div>
          ) : (
            <div className="cm-rows">
              {visibleSnacks.map(s => (
                <div key={s.id} className="cm-row" style={{ cursor: 'default', display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <input type="date" className="yps-input" value={s.date} onChange={e => updateSnack(s.id, { date: e.target.value })} />
                  <input className="yps-input" placeholder="What was served" value={s.snack} onChange={e => updateSnack(s.id, { snack: e.target.value })} />
                  <input className="yps-input" placeholder="Who brought it" value={s.byVolunteer} onChange={e => updateSnack(s.id, { byVolunteer: e.target.value })} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <label className="yps-chip" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={s.allergenSafe} onChange={e => updateSnack(s.id, { allergenSafe: e.target.checked })} style={{ marginRight: 4 }} />
                      Allergen-safe
                    </label>
                    <button className="yps-btn ghost" onClick={() => removeSnack(s.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'supplies' && (
        <>
          {lowStock.length > 0 && (
            <div style={{ background: 'color-mix(in srgb, #ef4444 12%, var(--bg-glass))', border: '0.5px solid color-mix(in srgb, #ef4444 40%, var(--border))', borderRadius: 'var(--radius-md)', padding: 10, fontSize: 'var(--fs-sm)', color: '#b91c1c', marginBottom: 8 }}>
              ⚠ <b>{lowStock.length} item{lowStock.length === 1 ? '' : 's'}</b> at or below reorder level: {lowStock.map(l => l.name).filter(Boolean).join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="yps-add-btn" onClick={addSupply}>＋ Add supply</button>
          </div>
          {visibleSupplies.length === 0 ? (
            <div className="cm-empty"><div className="cm-empty-icon">📦</div><div className="cm-empty-title">No supplies tracked</div><div className="cm-empty-sub">Add things like crayons, glue, paper plates — set a reorder level to get low-stock alerts.</div></div>
          ) : (
            <div className="cm-rows">
              {visibleSupplies.map(u => {
                const low = Number(u.qty || 0) <= Number(u.reorderAt || 0);
                return (
                  <div key={u.id} className="cm-row" style={{ cursor: 'default', display: 'grid', gridTemplateColumns: '1.4fr 80px 100px 1fr auto', gap: 8, alignItems: 'center', background: low ? 'color-mix(in srgb, #ef4444 6%, transparent)' : undefined }}>
                    <input className="yps-input" placeholder="Item name" value={u.name} onChange={e => updateSupply(u.id, { name: e.target.value })} />
                    <input type="number" min={0} className="yps-input" placeholder="Qty" value={u.qty} onChange={e => updateSupply(u.id, { qty: Number(e.target.value) || 0 })} />
                    <input type="number" min={0} className="yps-input" placeholder="Reorder at" value={u.reorderAt} onChange={e => updateSupply(u.id, { reorderAt: Number(e.target.value) || 0 })} />
                    <input className="yps-input" placeholder="Vendor / link" value={u.vendor} onChange={e => updateSupply(u.id, { vendor: e.target.value })} />
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {low && <span className="yps-pill cm-bad">Low</span>}
                      <button className="yps-btn ghost" onClick={() => removeSupply(u.id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
