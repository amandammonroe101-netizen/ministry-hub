import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Sunday Hosting → Ushers & Seating

   Seating-map sections, reserved/accessible seating notes, a
   late-arrival hold policy, and a per-service headcount log.

   Storage:
     sections:    useUserStoreKey('hospitality:usher-sections', [])
     lateArrival: useUserStoreKey('hospitality:usher-late-arrival', '')
     headcounts:  useUserStoreKey('hospitality:usher-headcounts', [])
     hosts:       useHosts() (read only, shared directory, role="usher")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function Ushers() {
  const [hosts] = useHosts();
  const [sections, setSections, { loading }] = useUserStoreKey('hospitality:usher-sections', []);
  const [lateArrival, setLateArrival] = useUserStoreKey('hospitality:usher-late-arrival', '');
  const [headcounts, setHeadcounts] = useUserStoreKey('hospitality:usher-headcounts', []);
  const navigate = useNavigate();

  const usherHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('usher')), [hosts]);
  const sectionList = Array.isArray(sections) ? sections : [];
  const headcountList = Array.isArray(headcounts) ? headcounts : [];
  const latestHeadcount = headcountList[0];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [sectionDraft, setSectionDraft] = useState({ label: '', type: 'general' });
  const [countDraft, setCountDraft] = useState({ service: '', count: '' });

  const addSection = () => {
    const label = sectionDraft.label.trim();
    if (!label) return;
    setSections(prev => [...(prev || []), { id: makeId('us'), label, type: sectionDraft.type, host: '', notes: '' }]);
    setSectionDraft({ label: '', type: 'general' });
  };
  const setSectionField = (id, field, value) => setSections(prev => (prev || []).map(s => s.id === id ? { ...s, [field]: value } : s));
  const removeSection = (id) => setSections(prev => (prev || []).filter(s => s.id !== id));

  const logHeadcount = () => {
    if (!countDraft.service.trim() || !countDraft.count) return;
    setHeadcounts(prev => [{ id: makeId('hc'), service: countDraft.service.trim(), count: Number(countDraft.count) || 0, date: today() }, ...(prev || [])]);
    setCountDraft({ service: '', count: '' });
  };
  const removeHeadcount = (id) => setHeadcounts(prev => (prev || []).filter(h => h.id !== id));

  const typeLabel = { general: 'General seating', reserved: 'Reserved', accessible: '♿ Accessible' };

  return (
    <HospitalityShell
      title="Ushers & Seating"
      icon="🪑"
      subtitle="Ushers — seating map, late-arrival flow, reserved sections, accessibility seating, and headcount per service."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{usherHosts.length}</span><span className="ha-stat-lbl">Ushers</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{sectionList.length}</span><span className="ha-stat-lbl">Sections mapped</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{latestHeadcount ? latestHeadcount.count : '—'}</span><span className="ha-stat-lbl">Last headcount</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🪑 Ushers</h3>
                <div className="ys-section-body">
                  {usherHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Usher yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {usherHosts.map(h => (
                        <div key={h.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <span className="ha-list-row-title">{h.name || 'Unnamed host'}</span>
                          <span className="ha-list-row-meta">{h.servicePreference || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/all')}>Manage on All Hosts →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🗺️ Seating map &amp; sections</h3>
                <div className="ys-section-body">
                  {sectionList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No sections mapped yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sectionList.map(s => (
                        <div key={s.id} className="ha-archive-section" style={{ padding: '10px 12px' }}>
                          <div className="ys-row-fields" style={{ alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{s.label} <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>· {typeLabel[s.type] || s.type}</span></span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select className="ys-inp" value={s.host || ''} onChange={e => setSectionField(s.id, 'host', e.target.value)}>
                                <option value="">Unassigned</option>
                                {usherHosts.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                              </select>
                              <button type="button" className="app-btn ghost" onClick={() => removeSection(s.id)}>✕</button>
                            </div>
                          </div>
                          <input type="text" className="ys-inp" style={{ marginTop: 6 }} placeholder="Notes (e.g. 'family with stroller', 'reserved for staff')" value={s.notes || ''} onChange={e => setSectionField(s.id, 'notes', e.target.value)} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="e.g. Center Left, Balcony, Front Row…" value={sectionDraft.label} onChange={e => setSectionDraft(d => ({ ...d, label: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSection(); } }} />
                    <select className="ys-inp" value={sectionDraft.type} onChange={e => setSectionDraft(d => ({ ...d, type: e.target.value }))}>
                      <option value="general">General seating</option>
                      <option value="reserved">Reserved</option>
                      <option value="accessible">♿ Accessible</option>
                    </select>
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addSection}>＋ Add section</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">⏰ Late-arrival &amp; hold policy</h3>
                <div className="ys-section-body">
                  <textarea className="ys-inp ys-textarea" rows={3} placeholder="e.g. Hold seating during prayer/worship transitions, direct latecomers to back rows or overflow…" value={lateArrival || ''} onChange={e => setLateArrival(e.target.value)} />
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🔢 Headcount log</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Service (e.g. 9:00 AM)" value={countDraft.service} onChange={e => setCountDraft(d => ({ ...d, service: e.target.value }))} />
                    <input type="number" min="0" className="ys-inp" placeholder="Headcount" value={countDraft.count} onChange={e => setCountDraft(d => ({ ...d, count: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logHeadcount(); } }} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={logHeadcount}>＋ Log headcount</button>
                  {headcountList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {headcountList.map(h => (
                        <div key={h.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{h.service}</span>
                            <span className="ha-list-row-meta">{h.count} attendees · {h.date}</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={() => removeHeadcount(h.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
