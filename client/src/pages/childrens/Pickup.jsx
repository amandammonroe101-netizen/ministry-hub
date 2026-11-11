import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Pickup Authorization
   Per-kid list of authorized adults. Stored ON the kid object as
   `pickupAdults[]` so it travels with the rest of the record. */

const ACCENT = 'var(--accent-rose, #fb7185)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function ChildrensPickup() {
  const [kids, setKids] = useUserStoreKey('childrens:kids', []);
  const list = Array.isArray(kids) ? kids : [];

  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(k => k.active)
      .filter(k => !q ||
        (k.name || '').toLowerCase().includes(q) ||
        (k.parentName || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query]);

  const open = openId ? list.find(k => k.id === openId) : null;

  const update = (id, patch) =>
    setKids(prev => (prev || []).map(k => k.id === id ? { ...k, ...patch } : k));

  const addAdult = (kid) => {
    const adult = { id: makeId('pa'), name: '', phone: '', relationship: '' };
    update(kid.id, { pickupAdults: [...(kid.pickupAdults || []), adult] });
  };
  const patchAdult = (kid, adultId, patch) =>
    update(kid.id, {
      pickupAdults: (kid.pickupAdults || []).map(a => a.id === adultId ? { ...a, ...patch } : a),
    });
  const removeAdult = (kid, adultId) =>
    update(kid.id, { pickupAdults: (kid.pickupAdults || []).filter(a => a.id !== adultId) });

  return (
    <ChildrensShell
      groupLabel="Check-In & Safety" groupIcon="🛡"
      icon="👨‍👩‍👧" title="Pickup Authorization"
      accent={ACCENT}
      subtitle="Each kid has a list of adults who can pick them up. The parent always counts; add grandparents, godparents, after-school caregivers, etc."
      stats={[
        { n: visible.length, label: 'active kids' },
        { n: list.reduce((n, k) => n + (k.pickupAdults?.length || 0), 0), label: 'authorized adults' },
        { n: list.filter(k => k.active && (k.pickupAdults?.length || 0) === 0).length, label: 'kids with no extra adults' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input
          className="yps-input"
          placeholder="Search a kid or parent…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">👨‍👩‍👧</div><div className="cm-empty-title">No kids yet</div><div className="cm-empty-sub">Add some on the All Kids page.</div></div>
      ) : (
        <div className="cm-rows">
          {visible.map(k => (
            <button
              key={k.id}
              className="cm-row"
              onClick={() => setOpenId(k.id === openId ? null : k.id)}
            >
              <span className="cm-row-name">{k.name}</span>
              <span className="yps-pill">{k.ageBand}</span>
              <span className="cm-row-sub" style={{ marginLeft: 'auto' }}>
                {k.parentName ? `👨‍👩‍👧 ${k.parentName}` : '👨‍👩‍👧 (no parent)'}
                {' · '}
                {(k.pickupAdults?.length || 0) === 0
                  ? <span className="yps-pill cm-bad">No extra adults</span>
                  : <span className="yps-pill cm-good">+{k.pickupAdults.length} adult{k.pickupAdults.length === 1 ? '' : 's'}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.name}'s authorized adults</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div style={{ padding: 16 }}>
              <div className="cm-card" style={{ marginBottom: 12, cursor: 'default' }}>
                <div className="cm-card-hd">
                  <h3 className="cm-card-title">👨‍👩‍👧 Primary parent</h3>
                  <span className="yps-pill cm-good">Always authorized</span>
                </div>
                <div className="cm-card-sub">
                  {open.parentName || '(no parent name)'}{open.parentPhone ? ` · ${open.parentPhone}` : ''}
                </div>
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>
                Other authorized adults ({open.pickupAdults?.length || 0})
              </h3>
              {(open.pickupAdults || []).length === 0 ? (
                <div className="cm-empty" style={{ padding: 18 }}>
                  <div className="cm-empty-title" style={{ fontSize: 14 }}>No other adults yet</div>
                  <div className="cm-empty-sub">Add grandparents, caregivers, or carpool friends below.</div>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {open.pickupAdults.map(a => (
                    <li key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr auto', gap: 8, alignItems: 'center' }}>
                      <input className="yps-input" placeholder="Full name" value={a.name} onChange={e => patchAdult(open, a.id, { name: e.target.value })} />
                      <input className="yps-input" type="tel" placeholder="Phone" value={a.phone} onChange={e => patchAdult(open, a.id, { phone: e.target.value })} />
                      <input className="yps-input" placeholder="Relationship" value={a.relationship} onChange={e => patchAdult(open, a.id, { relationship: e.target.value })} />
                      <button className="yps-btn ghost" onClick={() => removeAdult(open, a.id)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <button className="yps-btn" style={{ marginTop: 10 }} onClick={() => addAdult(open)}>＋ Add adult</button>
            </div>
            <footer className="cm-modal-ft">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Changes save automatically.
              </span>
              <button className="yps-add-btn" onClick={() => setOpenId(null)}>Done</button>
            </footer>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
