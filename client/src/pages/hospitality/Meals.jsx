import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Food & Refreshments → Member/Community Meals

   Meal-train coordination for members going through illness, a
   new baby, loss, or surgery — plus recurring potluck planning
   with dish sign-ups and allergy/dietary notes.

   Storage:
     trains:   useUserStoreKey('hospitality:meal-trains', [])
     potlucks: useUserStoreKey('hospitality:potlucks', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function Meals() {
  const [trains, setTrains, { loading }] = useUserStoreKey('hospitality:meal-trains', []);
  const [potlucks, setPotlucks] = useUserStoreKey('hospitality:potlucks', []);
  const navigate = useNavigate();

  const trainList = Array.isArray(trains) ? trains : [];
  const potluckList = Array.isArray(potlucks) ? potlucks : [];
  const activeTrains = trainList.filter(t => t.status !== 'closed');

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [trainDraft, setTrainDraft] = useState({ recipient: '', reason: '', notes: '' });
  const [selectedTrainId, setSelectedTrainId] = useState(null);
  const [slotDraft, setSlotDraft] = useState({ date: '', provider: '', meal: '' });
  const [potluckDraft, setPotluckDraft] = useState({ title: '', date: '' });
  const [selectedPotluckId, setSelectedPotluckId] = useState(null);
  const [dishDraft, setDishDraft] = useState({ dish: '', provider: '' });

  const selectedTrain = trainList.find(t => t.id === selectedTrainId) || null;
  const selectedPotluck = potluckList.find(p => p.id === selectedPotluckId) || null;

  const addTrain = () => {
    if (!trainDraft.recipient.trim()) return;
    setTrains(prev => [{ id: makeId('mt'), recipient: trainDraft.recipient.trim(), reason: trainDraft.reason.trim(), notes: trainDraft.notes.trim(), status: 'active', slots: [], createdAt: Date.now() }, ...(prev || [])]);
    setTrainDraft({ recipient: '', reason: '', notes: '' });
  };
  const closeTrain = (id) => setTrains(prev => (prev || []).map(t => t.id === id ? { ...t, status: 'closed' } : t));
  const removeTrain = (id) => {
    setTrains(prev => (prev || []).filter(t => t.id !== id));
    if (selectedTrainId === id) setSelectedTrainId(null);
  };

  const addSlot = () => {
    if (!selectedTrain || !slotDraft.date || !slotDraft.provider.trim()) return;
    setTrains(prev => prev.map(t => t.id === selectedTrain.id ? { ...t, slots: [...(t.slots || []), { id: makeId('sl'), date: slotDraft.date, provider: slotDraft.provider.trim(), meal: slotDraft.meal.trim() }] } : t));
    setSlotDraft({ date: '', provider: '', meal: '' });
  };
  const removeSlot = (slotId) => setTrains(prev => prev.map(t => t.id === selectedTrainId ? { ...t, slots: (t.slots || []).filter(s => s.id !== slotId) } : t));

  const addPotluck = () => {
    if (!potluckDraft.title.trim()) return;
    setPotlucks(prev => [{ id: makeId('pl'), title: potluckDraft.title.trim(), date: potluckDraft.date, dishes: [] }, ...(prev || [])]);
    setPotluckDraft({ title: '', date: '' });
  };
  const removePotluck = (id) => {
    setPotlucks(prev => (prev || []).filter(p => p.id !== id));
    if (selectedPotluckId === id) setSelectedPotluckId(null);
  };
  const addDish = () => {
    if (!selectedPotluck || !dishDraft.dish.trim()) return;
    setPotlucks(prev => prev.map(p => p.id === selectedPotluck.id ? { ...p, dishes: [...(p.dishes || []), { id: makeId('ds'), dish: dishDraft.dish.trim(), provider: dishDraft.provider.trim(), allergens: '' }] } : p));
    setDishDraft({ dish: '', provider: '' });
  };
  const setDishAllergens = (dishId, allergens) => setPotlucks(prev => prev.map(p => p.id === selectedPotluckId ? { ...p, dishes: p.dishes.map(d => d.id === dishId ? { ...d, allergens } : d) } : p));
  const removeDish = (dishId) => setPotlucks(prev => prev.map(p => p.id === selectedPotluckId ? { ...p, dishes: p.dishes.filter(d => d.id !== dishId) } : p));

  return (
    <HospitalityShell
      title="Member / Community Meals"
      icon="🍽"
      subtitle="Recurring community meals (potlucks, fellowship lunches, all-church dinners) — menu, sign-ups, dietary accommodations, and cleanup crew."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{activeTrains.length}</span><span className="ha-stat-lbl">Active meal trains</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{trainList.reduce((sum, t) => sum + (t.slots || []).length, 0)}</span><span className="ha-stat-lbl">Meals scheduled</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{potluckList.length}</span><span className="ha-stat-lbl">Potlucks planned</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🍲 Start a meal train</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Recipient / family name" value={trainDraft.recipient} onChange={e => setTrainDraft(d => ({ ...d, recipient: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Reason (e.g. new baby, surgery, loss)" value={trainDraft.reason} onChange={e => setTrainDraft(d => ({ ...d, reason: e.target.value }))} />
                  </div>
                  <input type="text" className="ys-inp" placeholder="Notes (dietary needs, delivery window, drop-off instructions…)" value={trainDraft.notes} onChange={e => setTrainDraft(d => ({ ...d, notes: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addTrain}>＋ Start meal train</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🚚 Meal trains</h3>
                <div className="ys-section-body">
                  {trainList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No meal trains yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {trainList.map(t => (
                        <div key={t.id} className="ha-list-row" style={{ cursor: 'pointer', opacity: t.status === 'closed' ? 0.5 : 1 }} onClick={() => setSelectedTrainId(t.id)}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{t.recipient}{t.status === 'closed' ? ' (closed)' : ''}</span>
                            <span className="ha-list-row-meta">{t.reason || 'No reason given'} · {(t.slots || []).length} meals scheduled</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removeTrain(t.id); }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🥘 Potluck planning</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Potluck title" value={potluckDraft.title} onChange={e => setPotluckDraft(d => ({ ...d, title: e.target.value }))} />
                    <input type="date" className="ys-inp" value={potluckDraft.date} onChange={e => setPotluckDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addPotluck}>＋ Plan potluck</button>
                  {potluckList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {potluckList.map(p => (
                        <div key={p.id} className="ha-list-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedPotluckId(p.id)}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{p.title}</span>
                            <span className="ha-list-row-meta">{p.date || 'No date set'} · {(p.dishes || []).length} dishes signed up</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removePotluck(p.id); }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🔗 Catering &amp; event food</h3>
                <div className="ys-section-body">
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Planning food for a wedding, funeral repast, or large church event? Use Event Catering instead.</div>
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/food/catering')}>Open Event Catering →</button>
                </div>
              </section>
            </div>
          )}

          {selectedTrain && (
            <div className="ha-slide-overlay" onClick={() => setSelectedTrainId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedTrainId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selectedTrain.recipient}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selectedTrain.reason || 'No reason given'}</div>
                  {selectedTrain.notes && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{selectedTrain.notes}</p>}

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Meal sign-ups</div>
                    {(selectedTrain.slots || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No meals scheduled yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {selectedTrain.slots.map(s => (
                          <div key={s.id} className="ha-list-row" style={{ cursor: 'default' }}>
                            <div className="ha-list-row-body">
                              <span className="ha-list-row-title">{s.date}</span>
                              <span className="ha-list-row-sub">{s.provider}{s.meal ? ` — ${s.meal}` : ''}</span>
                            </div>
                            <button type="button" className="app-btn ghost" onClick={() => removeSlot(s.id)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ys-row-fields" style={{ marginTop: 8 }}>
                      <input type="date" className="ys-inp" value={slotDraft.date} onChange={e => setSlotDraft(d => ({ ...d, date: e.target.value }))} />
                      <input type="text" className="ys-inp" placeholder="Provider name" value={slotDraft.provider} onChange={e => setSlotDraft(d => ({ ...d, provider: e.target.value }))} />
                    </div>
                    <input type="text" className="ys-inp" placeholder="Meal (optional)" value={slotDraft.meal} onChange={e => setSlotDraft(d => ({ ...d, meal: e.target.value }))} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content', marginTop: 6 }} onClick={addSlot}>＋ Sign up</button>
                  </div>

                  {selectedTrain.status !== 'closed' && (
                    <button type="button" className="app-btn ghost" style={{ width: 'fit-content', marginTop: 16 }} onClick={() => closeTrain(selectedTrain.id)}>Close meal train</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedPotluck && (
            <div className="ha-slide-overlay" onClick={() => setSelectedPotluckId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedPotluckId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selectedPotluck.title}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selectedPotluck.date || 'No date set'}</div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Dish sign-ups &amp; allergy notes</div>
                    {(selectedPotluck.dishes || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No dishes signed up yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedPotluck.dishes.map(d => (
                          <div key={d.id} className="ha-archive-section" style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <b style={{ fontSize: 13 }}>{d.dish}</b>
                              <button type="button" className="app-btn ghost" onClick={() => removeDish(d.id)}>✕</button>
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{d.provider}</div>
                            <input type="text" className="ys-inp" style={{ marginTop: 4 }} placeholder="Allergens (nuts, dairy, gluten…)" value={d.allergens || ''} onChange={e => setDishAllergens(d.id, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ys-row-fields" style={{ marginTop: 8 }}>
                      <input type="text" className="ys-inp" placeholder="Dish" value={dishDraft.dish} onChange={e => setDishDraft(d => ({ ...d, dish: e.target.value }))} />
                      <input type="text" className="ys-inp" placeholder="Bringing" value={dishDraft.provider} onChange={e => setDishDraft(d => ({ ...d, provider: e.target.value }))} />
                    </div>
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content', marginTop: 6 }} onClick={addDish}>＋ Sign up dish</button>
                  </div>
                </div>
              </div>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
