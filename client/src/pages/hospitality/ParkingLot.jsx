import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Sunday Hosting → Parking Lot

   Parking-lot greeter station — zone assignments (pulled from the
   shared host directory by role="parking"), a weather contingency
   plan, and a shuttle log for elderly / mobility-limited guests.

   Storage:
     zones:       useUserStoreKey('hospitality:parking-zones', [])
     weatherPlan: useUserStoreKey('hospitality:parking-weather-plan', '')
     shuttleLog:  useUserStoreKey('hospitality:parking-shuttle-log', [])
     hosts:       useHosts() (read only, shared directory, role="parking")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function ParkingLot() {
  const [hosts] = useHosts();
  const [zones, setZones, { loading }] = useUserStoreKey('hospitality:parking-zones', []);
  const [weatherPlan, setWeatherPlan] = useUserStoreKey('hospitality:parking-weather-plan', '');
  const [shuttleLog, setShuttleLog] = useUserStoreKey('hospitality:parking-shuttle-log', []);
  const navigate = useNavigate();

  const parkingHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('parking')), [hosts]);
  const zoneList = Array.isArray(zones) ? zones : [];
  const shuttleList = Array.isArray(shuttleLog) ? shuttleLog : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [zoneDraft, setZoneDraft] = useState('');
  const [shuttleDraft, setShuttleDraft] = useState({ name: '', notes: '' });

  const addZone = () => {
    const label = zoneDraft.trim();
    if (!label) return;
    setZones(prev => [...(prev || []), { id: makeId('pz'), label, host: '' }]);
    setZoneDraft('');
  };
  const setZoneHost = (id, host) => setZones(prev => (prev || []).map(z => z.id === id ? { ...z, host } : z));
  const removeZone = (id) => setZones(prev => (prev || []).filter(z => z.id !== id));

  const logShuttle = () => {
    if (!shuttleDraft.name.trim()) return;
    setShuttleLog(prev => [{ id: makeId('sh'), name: shuttleDraft.name.trim(), notes: shuttleDraft.notes.trim(), date: today(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...(prev || [])]);
    setShuttleDraft({ name: '', notes: '' });
  };
  const removeShuttle = (id) => setShuttleLog(prev => (prev || []).filter(s => s.id !== id));

  return (
    <HospitalityShell
      title="Parking Lot"
      icon="🅿"
      subtitle="Parking-lot greeters — station map, weather plan, golf-cart shuttle for elderly / mobility-limited guests, and umbrella hospitality."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{parkingHosts.length}</span><span className="ha-stat-lbl">Parking hosts</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{zoneList.length}</span><span className="ha-stat-lbl">Zones mapped</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{shuttleList.length}</span><span className="ha-stat-lbl">Shuttle rides logged</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🅿️ Parking hosts</h3>
                <div className="ys-section-body">
                  {parkingHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Parking Attendant yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {parkingHosts.map(h => (
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
                <h3 className="ys-section-title">🗺️ Zone map & assignments</h3>
                <div className="ys-section-body">
                  {zoneList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No zones mapped yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {zoneList.map(z => (
                        <div key={z.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{z.label}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select className="ys-inp" value={z.host || ''} onChange={e => setZoneHost(z.id, e.target.value)}>
                              <option value="">Unassigned</option>
                              {parkingHosts.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                            </select>
                            <button type="button" className="app-btn ghost" onClick={() => removeZone(z.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="e.g. North Lot, Overflow Field…" value={zoneDraft} onChange={e => setZoneDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addZone(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addZone}>＋ Add zone</button>
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🌧️ Weather contingency plan</h3>
                <div className="ys-section-body">
                  <textarea className="ys-inp ys-textarea" rows={3} placeholder="Rain/snow plan — covered drop-off point, extra golf carts, umbrella runners…" value={weatherPlan || ''} onChange={e => setWeatherPlan(e.target.value)} />
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🛺 Golf-cart shuttle log</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Guest name" value={shuttleDraft.name} onChange={e => setShuttleDraft(d => ({ ...d, name: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Notes (mobility, drop-off point…)" value={shuttleDraft.notes} onChange={e => setShuttleDraft(d => ({ ...d, notes: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logShuttle(); } }} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={logShuttle}>＋ Log ride</button>
                  {shuttleList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {shuttleList.map(s => (
                        <div key={s.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{s.name}</span>
                            {s.notes && <span className="ha-list-row-sub">{s.notes}</span>}
                            <span className="ha-list-row-meta">{s.date} · {s.time}</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={() => removeShuttle(s.id)}>✕</button>
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
