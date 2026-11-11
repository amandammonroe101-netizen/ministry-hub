import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useGuests, useHosts, GUEST_STAGES, stageMeta, stageIndex } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → New Guests → Follow-Up Pipeline

   The central kanban for every first-time guest captured anywhere
   in Hospitality (Welcome Center card capture). Defines and drives
   the shared `stage` progression on hospitality:guests — First-
   Time Visitor Gifts and Newcomer Connect Events read/write the
   SAME records, so advancing a guest here (or there) is reflected
   everywhere immediately.

   Storage:
     guests: useGuests() — shared with Welcome Center / Gifts / Connect Events
     hosts:  useHosts() (read only, for assigning a follow-up owner)
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function FollowUpPipeline() {
  const [guests, setGuests, { loading }] = useGuests();
  const [hosts] = useHosts();
  const navigate = useNavigate();

  const guestList = Array.isArray(guests) ? guests : [];
  const hostList = Array.isArray(hosts) ? hosts : [];
  const activeGuests = useMemo(() => guestList.filter(g => g.stage !== 'attending'), [guestList]);
  const attendingCount = guestList.filter(g => g.stage === 'attending').length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [manualDraft, setManualDraft] = useState({ name: '', phone: '', email: '', notes: '' });

  const selected = guestList.find(g => g.id === selectedId) || null;

  const byStage = useMemo(() => {
    const map = {};
    GUEST_STAGES.forEach(s => { map[s.key] = []; });
    activeGuests.forEach(g => {
      const key = map[g.stage] ? g.stage : 'card';
      map[key].push(g);
    });
    return map;
  }, [activeGuests]);

  const updateGuest = (id, patch) => setGuests(prev => (prev || []).map(g => g.id === id ? { ...g, ...patch } : g));

  const advanceStage = (guest) => {
    const idx = stageIndex(guest.stage);
    const next = GUEST_STAGES[idx + 1];
    if (!next) return;
    updateGuest(guest.id, { stage: next.key, [`${next.key}Date`]: today() });
  };
  const setStage = (guest, key) => updateGuest(guest.id, { stage: key, [`${key}Date`]: today() });
  const removeGuest = (id) => {
    setGuests(prev => (prev || []).filter(g => g.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addManualGuest = () => {
    if (!manualDraft.name.trim()) return;
    const guest = {
      id: makeId('gu'),
      name: manualDraft.name.trim(),
      phone: manualDraft.phone.trim(),
      email: manualDraft.email.trim(),
      notes: manualDraft.notes.trim(),
      visitDate: today(),
      stage: 'card',
      source: 'manual',
      assignedHostId: null,
      createdAt: Date.now(),
    };
    setGuests(prev => [guest, ...(Array.isArray(prev) ? prev : [])]);
    setManualDraft({ name: '', phone: '', email: '', notes: '' });
  };

  return (
    <HospitalityShell
      title="Follow-Up Pipeline"
      icon="📋"
      subtitle="Pipeline for first-time visitors — Card Received → Thank-You Sent → Called → Invited to Connect → Attending Group. Assigned per host."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{activeGuests.length}</span><span className="ha-stat-lbl">In pipeline</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{attendingCount}</span><span className="ha-stat-lbl">Attending a group</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{guestList.length}</span><span className="ha-stat-lbl">Total guests tracked</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🎟️ Add a guest manually</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Guest name" value={manualDraft.name} onChange={e => setManualDraft(d => ({ ...d, name: e.target.value }))} />
                    <input type="tel" className="ys-inp" placeholder="Phone" value={manualDraft.phone} onChange={e => setManualDraft(d => ({ ...d, phone: e.target.value }))} />
                  </div>
                  <div className="ys-row-fields">
                    <input type="email" className="ys-inp" placeholder="Email" value={manualDraft.email} onChange={e => setManualDraft(d => ({ ...d, email: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Notes" value={manualDraft.notes} onChange={e => setManualDraft(d => ({ ...d, notes: e.target.value }))} />
                  </div>
                  <button type="button" className="app-btn primary" style={{ width: 'fit-content' }} onClick={addManualGuest} disabled={!manualDraft.name.trim()}>＋ Add guest</button>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                    Most guests arrive here automatically from Welcome Center's visitor-card capture.
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🚦 Pipeline board</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GUEST_STAGES.length}, minmax(160px, 1fr))`, gap: 10, overflowX: 'auto' }}>
                    {GUEST_STAGES.map(stage => (
                      <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{stage.icon} {stage.label}</span>
                          <span>{byStage[stage.key]?.length || 0}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 }}>
                          {(byStage[stage.key] || []).map(g => (
                            <div key={g.id} className="ha-archive-section" style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => setSelectedId(g.id)}>
                              <b style={{ fontSize: 12 }}>{g.name}</b>
                              {g.assignedHostId && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Owner assigned</div>}
                              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                <button type="button" className="app-btn ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); advanceStage(g); }} disabled={stageIndex(g.stage) >= GUEST_STAGES.length - 1}>Advance →</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🌱 Attending a group</h3>
                <div className="ys-section-body">
                  {guestList.filter(g => g.stage === 'attending').length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No guests have reached "Attending Group" yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {guestList.filter(g => g.stage === 'attending').map(g => (
                        <div key={g.id} className="ha-list-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedId(g.id)}>
                          <span className="ha-list-row-title">{g.name}</span>
                          <span className="ha-list-row-meta">Visited {g.visitDate}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/guests/connect')}>Open Newcomer Connect Events →</button>
                </div>
              </section>
            </div>
          )}

          {selected && (
            <div className="ha-slide-overlay" onClick={() => setSelectedId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selected.name}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Visited {selected.visitDate} · via {selected.source === 'welcome-center' ? 'Welcome Center card' : 'Manual entry'}</div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Stage</div>
                    <select className="ys-inp" value={selected.stage} onChange={e => setStage(selected, e.target.value)}>
                      {GUEST_STAGES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Follow-up owner</div>
                    <select className="ys-inp" value={selected.assignedHostId || ''} onChange={e => updateGuest(selected.id, { assignedHostId: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {hostList.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Contact</div>
                    <div style={{ fontSize: 13 }}>{selected.phone || '—'}</div>
                    <div style={{ fontSize: 13 }}>{selected.email || '—'}</div>
                  </div>

                  {selected.notes && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Notes</div>
                      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{selected.notes}</p>
                    </div>
                  )}

                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <button type="button" className="app-btn ghost" onClick={() => navigate('/hospitality/guests/gifts')}>Open Gifts →</button>
                    <button type="button" className="app-btn ghost" onClick={() => removeGuest(selected.id)}>Remove guest</button>
                  </div>
                </div>
              </div>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
