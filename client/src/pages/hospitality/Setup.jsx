import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Operations → Setup & Decor

   Decor/setup crew (shared host directory, role="decor"), a
   seasonal theme plan, and an equipment/supply inventory (tables,
   linens, signage, seasonal decor bins…).

   Storage:
     themes:    useUserStoreKey('hospitality:decor-themes', [])
     equipment: useUserStoreKey('hospitality:decor-equipment', [])
     hosts:     useHosts() (read only, shared directory, role="decor")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function Setup() {
  const [hosts] = useHosts();
  const [themes, setThemes, { loading }] = useUserStoreKey('hospitality:decor-themes', []);
  const [equipment, setEquipment] = useUserStoreKey('hospitality:decor-equipment', []);
  const navigate = useNavigate();

  const decorHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('decor')), [hosts]);
  const themeList = Array.isArray(themes) ? themes : [];
  const equipmentList = Array.isArray(equipment) ? equipment : [];
  const lowStockCount = equipmentList.filter(e => e.count <= e.lowThreshold).length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [themeDraft, setThemeDraft] = useState({ title: '', season: '', notes: '' });
  const [equipmentDraft, setEquipmentDraft] = useState('');

  const addTheme = () => {
    if (!themeDraft.title.trim()) return;
    setThemes(prev => [...(prev || []), { id: makeId('th'), title: themeDraft.title.trim(), season: themeDraft.season.trim(), notes: themeDraft.notes.trim(), active: false }]);
    setThemeDraft({ title: '', season: '', notes: '' });
  };
  const setActiveTheme = (id) => setThemes(prev => (prev || []).map(t => ({ ...t, active: t.id === id })));
  const removeTheme = (id) => setThemes(prev => (prev || []).filter(t => t.id !== id));

  const addEquipment = () => {
    const name = equipmentDraft.trim();
    if (!name) return;
    setEquipment(prev => [...(prev || []), { id: makeId('eq'), name, count: 0, lowThreshold: 2 }]);
    setEquipmentDraft('');
  };
  const setEquipmentCount = (id, count) => setEquipment(prev => (prev || []).map(e => e.id === id ? { ...e, count } : e));
  const removeEquipment = (id) => setEquipment(prev => (prev || []).filter(e => e.id !== id));

  return (
    <HospitalityShell
      title="Setup & Decor"
      icon="🪑"
      subtitle="Room setup configurations (chairs, tables, signage) and seasonal / event decor — diagrams, supply lists, and tear-down assignments."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{decorHosts.length}</span><span className="ha-stat-lbl">Setup &amp; decor hosts</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{themeList.filter(t => t.active).length}</span><span className="ha-stat-lbl">Active theme</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{lowStockCount}</span><span className="ha-stat-lbl">Equipment low</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🎀 Setup &amp; decor crew</h3>
                <div className="ys-section-body">
                  {decorHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Setup &amp; Decor yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {decorHosts.map(h => (
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
                <h3 className="ys-section-title">🎨 Seasonal theme plan</h3>
                <div className="ys-section-body">
                  {themeList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No themes planned yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {themeList.map(t => (
                        <div key={t.id} className="ha-archive-section" style={{ padding: '10px 12px', border: t.active ? '1px solid rgba(251,146,60,0.5)' : undefined }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13 }}>{t.active ? '🟢 ' : ''}{t.title} {t.season && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>· {t.season}</span>}</b>
                            <button type="button" className="app-btn ghost" onClick={() => removeTheme(t.id)}>✕</button>
                          </div>
                          {t.notes && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{t.notes}</p>}
                          {!t.active && <button type="button" className="app-btn ghost" style={{ marginTop: 6 }} onClick={() => setActiveTheme(t.id)}>Set as active theme</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  <input type="text" className="ys-inp" placeholder="Theme title (e.g. 'Fall Harvest')" value={themeDraft.title} onChange={e => setThemeDraft(d => ({ ...d, title: e.target.value }))} />
                  <input type="text" className="ys-inp" placeholder="Season (e.g. Autumn, Christmas, Easter)" value={themeDraft.season} onChange={e => setThemeDraft(d => ({ ...d, season: e.target.value }))} />
                  <textarea className="ys-inp ys-textarea" rows={2} placeholder="Notes (color scheme, key pieces, where decor bins are stored…)" value={themeDraft.notes} onChange={e => setThemeDraft(d => ({ ...d, notes: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addTheme}>＋ Add theme</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📦 Equipment &amp; supply inventory</h3>
                <div className="ys-section-body">
                  {equipmentList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No equipment tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {equipmentList.map(e => (
                        <div key={e.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: e.count <= e.lowThreshold ? '#fdba74' : undefined }}>
                            {e.count <= e.lowThreshold ? '⚡ ' : ''}{e.name}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" min="0" className="ys-inp" value={e.count} onChange={ev => setEquipmentCount(e.id, Number(ev.target.value) || 0)} />
                            <button type="button" className="app-btn ghost" onClick={() => removeEquipment(e.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="Equipment (e.g. 'Folding tables', 'Table linens')" value={equipmentDraft} onChange={e => setEquipmentDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEquipment(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addEquipment}>＋ Add</button>
                  </div>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
