import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useGuests, stageIndex } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → New Guests → First-Time Visitor Gifts

   Gift inventory + delivery tracking for first-time guests. Reads
   the SAME shared guest records as Follow-Up Pipeline / Welcome
   Center — marking a gift "delivered" here advances that guest's
   pipeline stage to 'gift' so the Follow-Up board reflects it
   immediately, no duplicate data entry.

   Storage:
     inventory: useUserStoreKey('hospitality:gift-inventory', [])
     guests:    useGuests() — shared with Welcome Center / Follow-Up Pipeline / Connect Events
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function Gifts() {
  const [inventory, setInventory, { loading }] = useUserStoreKey('hospitality:gift-inventory', []);
  const [guests, setGuests] = useGuests();
  const navigate = useNavigate();

  const inventoryList = Array.isArray(inventory) ? inventory : [];
  const guestList = Array.isArray(guests) ? guests : [];
  const pendingGuests = useMemo(() => guestList.filter(g => stageIndex(g.stage) < stageIndex('gift')), [guestList]);
  const giftedGuests = useMemo(() => guestList.filter(g => stageIndex(g.stage) >= stageIndex('gift')), [guestList]);
  const lowStockCount = inventoryList.filter(i => i.count <= i.lowThreshold).length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [itemDraft, setItemDraft] = useState('');

  const addItem = () => {
    const name = itemDraft.trim();
    if (!name) return;
    setInventory(prev => [...(prev || []), { id: makeId('gi'), name, count: 0, lowThreshold: 5 }]);
    setItemDraft('');
  };
  const setItemCount = (id, count) => setInventory(prev => (prev || []).map(i => i.id === id ? { ...i, count } : i));
  const removeItem = (id) => setInventory(prev => (prev || []).filter(i => i.id !== id));

  const markGifted = (guest) => {
    setGuests(prev => (prev || []).map(g => g.id === guest.id ? { ...g, stage: 'gift', giftDate: today() } : g));
    setInventory(prev => (prev || []).map((i, idx) => idx === 0 ? { ...i, count: Math.max(0, (i.count || 0) - 1) } : i));
  };

  return (
    <HospitalityShell
      title="First-Time Visitor Gifts"
      icon="🎁"
      subtitle="Gift-bag inventory and contents (mug, devotional, church info, kids welcome), distribution log, and reorder thresholds."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{pendingGuests.length}</span><span className="ha-stat-lbl">Awaiting gift</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{giftedGuests.length}</span><span className="ha-stat-lbl">Gifts delivered</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{lowStockCount}</span><span className="ha-stat-lbl">Items low</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🎁 Guests awaiting a gift</h3>
                <div className="ys-section-body">
                  {pendingGuests.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>Everyone's been gifted — nice work!</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pendingGuests.map(g => (
                        <div key={g.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{g.name}</span>
                            <span className="ha-list-row-meta">Visited {g.visitDate}</span>
                          </div>
                          <button type="button" className="app-btn primary" onClick={() => markGifted(g)}>✓ Mark gifted</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/guests/follow-up')}>Open Follow-Up Pipeline →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">✅ Recently gifted</h3>
                <div className="ys-section-body">
                  {giftedGuests.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No gifts delivered yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {giftedGuests.slice(0, 10).map(g => (
                        <div key={g.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{g.name}</span>
                            <span className="ha-list-row-meta">Gifted {g.giftDate || ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📦 Gift inventory</h3>
                <div className="ys-section-body">
                  {inventoryList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No gift items tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {inventoryList.map(i => (
                        <div key={i.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: i.count <= i.lowThreshold ? '#fdba74' : undefined }}>
                            {i.count <= i.lowThreshold ? '⚡ ' : ''}{i.name}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" min="0" className="ys-inp" value={i.count} onChange={e => setItemCount(i.id, Number(e.target.value) || 0)} />
                            <button type="button" className="app-btn ghost" onClick={() => removeItem(i.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="Gift item (e.g. 'Coffee mug', 'Welcome bag')" value={itemDraft} onChange={e => setItemDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addItem}>＋ Add</button>
                  </div>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
