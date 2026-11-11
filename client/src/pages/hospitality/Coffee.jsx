import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Food & Refreshments → Coffee & Snacks

   Coffee-bar host rotation, a supply inventory (coffee, creamer,
   snacks…), and a recurring shopping list for the next run.

   Storage:
     supplies:     useUserStoreKey('hospitality:coffee-supplies', [])
     shoppingList: useUserStoreKey('hospitality:coffee-shopping-list', [])
     rotation:     useUserStoreKey('hospitality:coffee-rotation', [])
     hosts:        useHosts() (read only, shared directory, role="coffee")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function Coffee() {
  const [hosts] = useHosts();
  const [supplies, setSupplies, { loading }] = useUserStoreKey('hospitality:coffee-supplies', []);
  const [shoppingList, setShoppingList] = useUserStoreKey('hospitality:coffee-shopping-list', []);
  const [rotation, setRotation] = useUserStoreKey('hospitality:coffee-rotation', []);
  const navigate = useNavigate();

  const coffeeHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('coffee')), [hosts]);
  const supplyList = Array.isArray(supplies) ? supplies : [];
  const shoppingItems = Array.isArray(shoppingList) ? shoppingList : [];
  const rotationList = Array.isArray(rotation) ? rotation : [];
  const lowStockCount = supplyList.filter(s => s.count <= s.lowThreshold).length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [supplyDraft, setSupplyDraft] = useState('');
  const [shoppingDraft, setShoppingDraft] = useState('');
  const [rotationDraft, setRotationDraft] = useState({ service: '', names: '' });

  const addSupply = () => {
    const name = supplyDraft.trim();
    if (!name) return;
    setSupplies(prev => [...(prev || []), { id: makeId('cs'), name, count: 0, lowThreshold: 3 }]);
    setSupplyDraft('');
  };
  const setSupplyCount = (id, count) => setSupplies(prev => (prev || []).map(s => s.id === id ? { ...s, count } : s));
  const removeSupply = (id) => setSupplies(prev => (prev || []).filter(s => s.id !== id));
  const sendLowToShoppingList = () => {
    const lowItems = supplyList.filter(s => s.count <= s.lowThreshold).map(s => ({ id: makeId('sl'), label: s.name, done: false }));
    if (lowItems.length === 0) return;
    setShoppingList(prev => [...(prev || []), ...lowItems]);
  };

  const addShoppingItem = () => {
    const label = shoppingDraft.trim();
    if (!label) return;
    setShoppingList(prev => [...(prev || []), { id: makeId('sl'), label, done: false }]);
    setShoppingDraft('');
  };
  const toggleShoppingItem = (id) => setShoppingList(prev => (prev || []).map(s => s.id === id ? { ...s, done: !s.done } : s));
  const removeShoppingItem = (id) => setShoppingList(prev => (prev || []).filter(s => s.id !== id));
  const clearCheckedShopping = () => setShoppingList(prev => (prev || []).filter(s => !s.done));

  const addRotation = () => {
    if (!rotationDraft.service.trim()) return;
    setRotation(prev => [...(prev || []), { id: makeId('cr'), service: rotationDraft.service.trim(), names: rotationDraft.names.trim() }]);
    setRotationDraft({ service: '', names: '' });
  };
  const removeRotation = (id) => setRotation(prev => (prev || []).filter(r => r.id !== id));

  return (
    <HospitalityShell
      title="Coffee & Snacks"
      icon="☕"
      subtitle="Weekly coffee bar and snack table — supplies, brewing schedule, allergen-aware options, and host rotation."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{coffeeHosts.length}</span><span className="ha-stat-lbl">Coffee hosts</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{lowStockCount}</span><span className="ha-stat-lbl">Supplies low</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{shoppingItems.filter(s => !s.done).length}</span><span className="ha-stat-lbl">Shopping list items</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">☕ Coffee bar hosts</h3>
                <div className="ys-section-body">
                  {coffeeHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Coffee Host yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {coffeeHosts.map(h => (
                        <div key={h.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <span className="ha-list-row-title">{h.name || 'Unnamed host'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/all')}>Manage on All Hosts →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🔁 Weekly rotation</h3>
                <div className="ys-section-body">
                  {rotationList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No rotation scheduled yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {rotationList.map(r => (
                        <div key={r.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{r.service}</span>
                            {r.names && <span className="ha-list-row-sub">{r.names}</span>}
                          </div>
                          <button type="button" className="app-btn ghost" onClick={() => removeRotation(r.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Service (e.g. 9:00 AM)" value={rotationDraft.service} onChange={e => setRotationDraft(d => ({ ...d, service: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Names on rotation" value={rotationDraft.names} onChange={e => setRotationDraft(d => ({ ...d, names: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRotation(); } }} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addRotation}>＋ Add to rotation</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📦 Supply inventory</h3>
                <div className="ys-section-body">
                  {supplyList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No supplies tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {supplyList.map(s => (
                        <div key={s.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: s.count <= s.lowThreshold ? '#fdba74' : undefined }}>
                            {s.count <= s.lowThreshold ? '⚡ ' : ''}{s.name}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" min="0" className="ys-inp" value={s.count} onChange={e => setSupplyCount(s.id, Number(e.target.value) || 0)} />
                            <button type="button" className="app-btn ghost" onClick={() => removeSupply(s.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="Supply (e.g. 'Ground coffee', 'Creamer')" value={supplyDraft} onChange={e => setSupplyDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSupply(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addSupply}>＋ Add</button>
                  </div>
                  {lowStockCount > 0 && (
                    <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={sendLowToShoppingList}>⚡ Send low items to shopping list →</button>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🛒 Shopping list</h3>
                <div className="ys-section-body">
                  {shoppingItems.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>Nothing on the shopping list.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {shoppingItems.map(s => (
                        <div key={s.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <input type="checkbox" checked={!!s.done} onChange={() => toggleShoppingItem(s.id)} />
                            <span style={{ fontSize: 13, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.5 : 1 }}>{s.label}</span>
                          </label>
                          <button type="button" className="app-btn ghost" onClick={() => removeShoppingItem(s.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="Add item…" value={shoppingDraft} onChange={e => setShoppingDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addShoppingItem(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addShoppingItem}>＋ Add</button>
                  </div>
                  {shoppingItems.some(s => s.done) && (
                    <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={clearCheckedShopping}>Clear checked items</button>
                  )}
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
