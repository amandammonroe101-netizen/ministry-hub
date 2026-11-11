import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts, ROLES } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Operations → Scheduling

   Per-position schedule across services, drawing assignees FROM
   the shared host directory by role — fills gaps station pages
   leave unassigned, plus a swap/sub-request board so a host can
   flag they need coverage without a text-message chain.

   Storage:
     schedule: useUserStoreKey('hospitality:schedule', [])   — [{id, date, service, roleKey, hostId}]
     subs:     useUserStoreKey('hospitality:sub-requests', [])
     hosts:    useHosts() (read only, shared directory)
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function Scheduling() {
  const [schedule, setSchedule, { loading }] = useUserStoreKey('hospitality:schedule', []);
  const [subs, setSubs] = useUserStoreKey('hospitality:sub-requests', []);
  const [hosts] = useHosts();
  const navigate = useNavigate();

  const scheduleList = Array.isArray(schedule) ? schedule : [];
  const subList = Array.isArray(subs) ? subs : [];
  const hostList = Array.isArray(hosts) ? hosts : [];
  const openSubs = subList.filter(s => s.status !== 'filled');
  const unfilledSlots = scheduleList.filter(s => !s.hostId).length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [slotDraft, setSlotDraft] = useState({ date: today(), service: '9:00 AM', roleKey: ROLES[0].key });

  const hostsForRole = (roleKey) => hostList.filter(h => (h.roles || []).includes(roleKey));

  const addSlot = () => {
    setSchedule(prev => [...(prev || []), { id: makeId('sh'), date: slotDraft.date, service: slotDraft.service, roleKey: slotDraft.roleKey, hostId: null }]);
  };
  const setSlotHost = (id, hostId) => setSchedule(prev => (prev || []).map(s => s.id === id ? { ...s, hostId: hostId || null } : s));
  const removeSlot = (id) => setSchedule(prev => (prev || []).filter(s => s.id !== id));

  const requestSub = (slot) => {
    const host = hostList.find(h => h.id === slot.hostId);
    setSubs(prev => [{ id: makeId('sr'), slotId: slot.id, date: slot.date, service: slot.service, roleKey: slot.roleKey, originalHost: host?.name || '', status: 'open', filledBy: '' }, ...(prev || [])]);
  };
  const fillSub = (subId, filledByName) => {
    setSubs(prev => (prev || []).map(s => s.id === subId ? { ...s, status: 'filled', filledBy: filledByName } : s));
  };
  const removeSub = (id) => setSubs(prev => (prev || []).filter(s => s.id !== id));

  const sortedSchedule = useMemo(() => [...scheduleList].sort((a, b) => (a.date || '').localeCompare(b.date || '')), [scheduleList]);

  return (
    <HospitalityShell
      title="Scheduling"
      icon="📅"
      subtitle="Per-position schedule across services — fills, swaps, sub requests. Integrates with the global Scheduling Rec."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{scheduleList.length}</span><span className="ha-stat-lbl">Slots scheduled</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{unfilledSlots}</span><span className="ha-stat-lbl">Unfilled slots</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{openSubs.length}</span><span className="ha-stat-lbl">Open sub requests</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">📅 Add a slot</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="date" className="ys-inp" value={slotDraft.date} onChange={e => setSlotDraft(d => ({ ...d, date: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Service (e.g. 9:00 AM)" value={slotDraft.service} onChange={e => setSlotDraft(d => ({ ...d, service: e.target.value }))} />
                    <select className="ys-inp" value={slotDraft.roleKey} onChange={e => setSlotDraft(d => ({ ...d, roleKey: e.target.value }))}>
                      {ROLES.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
                    </select>
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addSlot}>＋ Add slot</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🗓️ Per-position schedule</h3>
                <div className="ys-section-body">
                  {sortedSchedule.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No slots scheduled yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sortedSchedule.map(s => {
                        const role = ROLES.find(r => r.key === s.roleKey);
                        const candidates = hostsForRole(s.roleKey);
                        return (
                          <div key={s.id} className="ha-archive-section" style={{ padding: '8px 10px' }}>
                            <div className="ys-row-fields" style={{ alignItems: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.date} · {s.service} · {role?.icon} {role?.label}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <select className="ys-inp" value={s.hostId || ''} onChange={e => setSlotHost(s.id, e.target.value)}>
                                  <option value="">Unassigned</option>
                                  {candidates.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                </select>
                                <button type="button" className="app-btn ghost" onClick={() => removeSlot(s.id)}>✕</button>
                              </div>
                            </div>
                            {s.hostId && (
                              <button type="button" className="app-btn ghost" style={{ marginTop: 6 }} onClick={() => requestSub(s)}>Request a sub</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/roles')}>Open Roles &amp; Positions →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🔁 Swap / sub-request board</h3>
                <div className="ys-section-body">
                  {subList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No sub requests yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subList.map(s => (
                        <div key={s.id} className="ha-archive-section" style={{ padding: '8px 10px', opacity: s.status === 'filled' ? 0.6 : 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13 }}>{s.date} · {s.service} · {ROLES.find(r => r.key === s.roleKey)?.label}</b>
                            <button type="button" className="app-btn ghost" onClick={() => removeSub(s.id)}>✕</button>
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Originally: {s.originalHost || 'Unassigned'} · {s.status === 'filled' ? `Filled by ${s.filledBy}` : 'Open'}</div>
                          {s.status !== 'filled' && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <select className="ys-inp" onChange={e => e.target.value && fillSub(s.id, e.target.value)} defaultValue="">
                                <option value="" disabled>Fill with…</option>
                                {hostsForRole(s.roleKey).map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                              </select>
                            </div>
                          )}
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
