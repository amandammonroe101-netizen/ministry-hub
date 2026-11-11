import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Special Events → Funerals

   Funeral/memorial hosting checklist per family — family-care
   contact, service time, repast (reception meal) coordination,
   and quick links to Event Catering and Setup & Decor.

   Storage:
     funerals: useUserStoreKey('hospitality:funerals', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_TASKS = [
  'Family-care contact assigned',
  'Overflow/extra parking arranged',
  'Guest book / memorial table set up',
  'Repast (reception meal) arranged',
  'Flowers & photo display staged',
  'Cleanup crew assigned',
];

export default function Funerals() {
  const [funerals, setFunerals, { loading }] = useUserStoreKey('hospitality:funerals', []);
  const navigate = useNavigate();

  const funeralList = Array.isArray(funerals) ? funerals : [];
  const upcomingCount = funeralList.filter(f => f.status !== 'complete').length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [draft, setDraft] = useState({ family: '', date: '', contact: '' });
  const [selectedId, setSelectedId] = useState(null);

  const selected = funeralList.find(f => f.id === selectedId) || null;

  const addFuneral = () => {
    if (!draft.family.trim()) return;
    setFunerals(prev => [{ id: makeId('fn'), family: draft.family.trim(), date: draft.date, contact: draft.contact.trim(), status: 'planning', notes: '', tasks: DEFAULT_TASKS.map(label => ({ id: makeId('tk'), label, done: false })) }, ...(prev || [])]);
    setDraft({ family: '', date: '', contact: '' });
  };
  const removeFuneral = (id) => {
    setFunerals(prev => (prev || []).filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const setStatus = (id, status) => setFunerals(prev => (prev || []).map(f => f.id === id ? { ...f, status } : f));
  const setField = (id, field, value) => setFunerals(prev => (prev || []).map(f => f.id === id ? { ...f, [field]: value } : f));
  const toggleTask = (funeralId, taskId) => setFunerals(prev => (prev || []).map(f => f.id === funeralId ? { ...f, tasks: f.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : f));

  return (
    <HospitalityShell
      title="Funerals"
      icon="🕊"
      subtitle="Funeral and memorial-service hospitality — reception meal coordination, ushers, family-room setup, and after-care."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{upcomingCount}</span><span className="ha-stat-lbl">In progress</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{funeralList.length}</span><span className="ha-stat-lbl">Total tracked</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🕊️ New service</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Family name" value={draft.family} onChange={e => setDraft(d => ({ ...d, family: e.target.value }))} />
                    <input type="date" className="ys-inp" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <input type="text" className="ys-inp" placeholder="Family-care contact" value={draft.contact} onChange={e => setDraft(d => ({ ...d, contact: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addFuneral}>＋ Add service</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📋 Services</h3>
                <div className="ys-section-body">
                  {funeralList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No services tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {funeralList.map(f => {
                        const done = f.tasks.filter(t => t.done).length;
                        return (
                          <div key={f.id} className="ha-list-row" style={{ cursor: 'pointer', opacity: f.status === 'complete' ? 0.5 : 1 }} onClick={() => setSelectedId(f.id)}>
                            <div className="ha-list-row-body">
                              <span className="ha-list-row-title">{f.family}</span>
                              <span className="ha-list-row-meta">{f.date || 'No date'} · {done}/{f.tasks.length} tasks done · {f.status}</span>
                            </div>
                            <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removeFuneral(f.id); }}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {selected && (
            <div className="ha-slide-overlay" onClick={() => setSelectedId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selected.family}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selected.date || 'No date'} · Family-care contact: {selected.contact || '—'}</div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Status</div>
                    <select className="ys-inp" value={selected.status} onChange={e => setStatus(selected.id, e.target.value)}>
                      <option value="planning">Planning</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Hosting checklist</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {selected.tasks.map(t => (
                        <label key={t.id} className="ha-list-row" style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(selected.id, t.id)} />
                          <span className="ha-list-row-title" style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1 }}>{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Notes</div>
                    <textarea className="ys-inp ys-textarea" rows={3} value={selected.notes || ''} onChange={e => setField(selected.id, 'notes', e.target.value)} placeholder="Family preferences, sensitivities, special requests…" />
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/food/catering')}>Open Event Catering →</button>
                    <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/ops/setup')}>Open Setup &amp; Decor →</button>
                    <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/all')}>Open All Hosts →</button>
                  </div>
                </div>
              </div>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
