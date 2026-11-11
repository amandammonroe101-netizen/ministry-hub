import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Operations → Pre-Service Checklist

   A reusable checklist template run before every service — resets
   automatically once a service date changes so hosts always start
   from a clean list on Sunday morning.

   Storage:
     items:      useUserStoreKey('hospitality:pre-service-items', [DEFAULT_ITEMS])
     runState:   useUserStoreKey('hospitality:pre-service-run', { date: '', checked: [] })
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_ITEMS = [
  'Parking lot lights & signage checked',
  'Doors unlocked & propped',
  'Welcome desk stocked (FAQs, brochures, visitor cards)',
  'Coffee bar set up & brewing',
  'Sanctuary seating arranged',
  'Sound/AV team notified hosting is ready',
  'Communion elements prepped',
  'Restrooms checked & stocked',
].map(label => ({ id: makeId('ps'), label }));

export default function PreService() {
  const [items, setItems, { loading }] = useUserStoreKey('hospitality:pre-service-items', DEFAULT_ITEMS);
  const [runState, setRunState] = useUserStoreKey('hospitality:pre-service-run', { date: '', checked: [] });
  const navigate = useNavigate();

  const itemList = Array.isArray(items) ? items : [];
  const run = runState && typeof runState === 'object' ? runState : { date: '', checked: [] };
  const checkedIds = Array.isArray(run.checked) ? run.checked : [];
  const isFreshRun = run.date === today();
  const activeChecked = isFreshRun ? checkedIds : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [itemDraft, setItemDraft] = useState('');

  const doneCount = activeChecked.length;
  const percent = itemList.length ? Math.round((doneCount / itemList.length) * 100) : 0;

  const toggleItem = (id) => {
    const base = isFreshRun ? checkedIds : [];
    const next = base.includes(id) ? base.filter(x => x !== id) : [...base, id];
    setRunState({ date: today(), checked: next });
  };

  const resetRun = () => setRunState({ date: today(), checked: [] });

  const addItem = () => {
    const label = itemDraft.trim();
    if (!label) return;
    setItems(prev => [...(prev || []), { id: makeId('ps'), label }]);
    setItemDraft('');
  };
  const removeItem = (id) => setItems(prev => (prev || []).filter(i => i.id !== id));

  return (
    <HospitalityShell
      title="Pre-Service Checklist"
      icon="⏱"
      subtitle="Standardized pre-service walkthrough — restrooms stocked, lobby tidy, coffee brewing, signage in place, kids check-in ready. Sign-off per service."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{doneCount}/{itemList.length}</span><span className="ha-stat-lbl">Done today</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{percent}%</span><span className="ha-stat-lbl">Ready for service</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">✅ Today's checklist</h3>
                <div className="ys-section-body">
                  {itemList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No checklist items yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {itemList.map(i => {
                        const checked = activeChecked.includes(i.id);
                        return (
                          <div key={i.id} className="ha-list-row" style={{ cursor: 'default' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleItem(i.id)} />
                              <span style={{ fontSize: 13, textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.5 : 1 }}>{i.label}</span>
                            </label>
                            <button type="button" className="app-btn ghost" onClick={() => removeItem(i.id)}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={resetRun}>↺ Reset for next service</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">➕ Add checklist item</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="New checklist item…" value={itemDraft} onChange={e => setItemDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addItem}>＋ Add</button>
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🔗 Related stations</h3>
                <div className="ys-section-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/sunday/welcome-center')}>Welcome Center →</button>
                  <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/food/coffee')}>Coffee &amp; Snacks →</button>
                  <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/ops/setup')}>Setup &amp; Decor →</button>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
