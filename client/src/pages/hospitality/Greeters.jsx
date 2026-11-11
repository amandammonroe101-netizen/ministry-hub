import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Sunday Hosting → Greeters

   Door greeter station — per-door coverage (assigned from the
   shared host directory by role="greeter"), a reusable script /
   talking-points library, kids-area direction notes, and a
   bulletin-handout count per service.

   Storage:
     doors:      useUserStoreKey('hospitality:greeter-doors', [])
     scripts:    useUserStoreKey('hospitality:greeter-scripts', [])
     kidsNote:   useUserStoreKey('hospitality:greeter-kids-note', '')
     bulletins:  useUserStoreKey('hospitality:greeter-bulletins', { count: 0, lastService: '' })
     hosts:      useHosts() (read only, shared directory, role="greeter")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function Greeters() {
  const [hosts] = useHosts();
  const [doors, setDoors, { loading }] = useUserStoreKey('hospitality:greeter-doors', []);
  const [scripts, setScripts] = useUserStoreKey('hospitality:greeter-scripts', []);
  const [kidsNote, setKidsNote] = useUserStoreKey('hospitality:greeter-kids-note', '');
  const [bulletins, setBulletins] = useUserStoreKey('hospitality:greeter-bulletins', { count: 0, lastService: '' });
  const navigate = useNavigate();

  const greeterHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('greeter')), [hosts]);
  const doorList = Array.isArray(doors) ? doors : [];
  const scriptList = Array.isArray(scripts) ? scripts : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [doorDraft, setDoorDraft] = useState('');
  const [scriptDraft, setScriptDraft] = useState({ title: '', body: '' });

  const addDoor = () => {
    const label = doorDraft.trim();
    if (!label) return;
    setDoors(prev => [...(prev || []), { id: makeId('dr'), label, host: '' }]);
    setDoorDraft('');
  };
  const setDoorHost = (id, host) => setDoors(prev => (prev || []).map(d => d.id === id ? { ...d, host } : d));
  const removeDoor = (id) => setDoors(prev => (prev || []).filter(d => d.id !== id));

  const addScript = () => {
    if (!scriptDraft.title.trim()) return;
    setScripts(prev => [...(prev || []), { id: makeId('sc'), title: scriptDraft.title.trim(), body: scriptDraft.body.trim() }]);
    setScriptDraft({ title: '', body: '' });
  };
  const removeScript = (id) => setScripts(prev => (prev || []).filter(s => s.id !== id));

  const b = bulletins && typeof bulletins === 'object' ? bulletins : { count: 0, lastService: '' };

  return (
    <HospitalityShell
      title="Greeters"
      icon="👋"
      subtitle="Door greeters at every entrance — per-door coverage, scripts/talking points, kids-area direction, and bulletin handouts."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{greeterHosts.length}</span><span className="ha-stat-lbl">Greeters</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{doorList.length}</span><span className="ha-stat-lbl">Doors covered</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{b.count || 0}</span><span className="ha-stat-lbl">Bulletins handed out</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">👋 Greeters</h3>
                <div className="ys-section-body">
                  {greeterHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Greeter yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {greeterHosts.map(h => (
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
                <h3 className="ys-section-title">🚪 Per-door coverage</h3>
                <div className="ys-section-body">
                  {doorList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No doors mapped yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {doorList.map(d => (
                        <div key={d.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select className="ys-inp" value={d.host || ''} onChange={e => setDoorHost(d.id, e.target.value)}>
                              <option value="">Unassigned</option>
                              {greeterHosts.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                            </select>
                            <button type="button" className="app-btn ghost" onClick={() => removeDoor(d.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="e.g. Main Entrance, East Foyer…" value={doorDraft} onChange={e => setDoorDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDoor(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addDoor}>＋ Add door</button>
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">💬 Script & talking points library</h3>
                <div className="ys-section-body">
                  {scriptList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No scripts yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {scriptList.map(s => (
                        <div key={s.id} className="ha-archive-section" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b style={{ fontSize: 13 }}>{s.title}</b>
                            <button type="button" className="app-btn ghost" onClick={() => removeScript(s.id)}>✕</button>
                          </div>
                          {s.body && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap' }}>{s.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <input type="text" className="ys-inp" placeholder="Script title (e.g. 'Standard welcome')" value={scriptDraft.title} onChange={e => setScriptDraft(d => ({ ...d, title: e.target.value }))} />
                  <textarea className="ys-inp ys-textarea" rows={2} placeholder="What to say…" value={scriptDraft.body} onChange={e => setScriptDraft(d => ({ ...d, body: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addScript}>＋ Add script</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🧒 Kids-area direction</h3>
                <div className="ys-section-body">
                  <textarea className="ys-inp ys-textarea" rows={2} placeholder="How greeters should direct families to kids check-in…" value={kidsNote || ''} onChange={e => setKidsNote(e.target.value)} />
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📄 Bulletin handouts</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <label className="ys-field"><span className="ys-field-lbl">Count this service</span>
                      <input type="number" min="0" className="ys-inp" value={b.count || 0} onChange={e => setBulletins({ ...b, count: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="ys-field"><span className="ys-field-lbl">Last service</span>
                      <input type="text" className="ys-inp" placeholder="e.g. 11:00 AM, July 27" value={b.lastService || ''} onChange={e => setBulletins({ ...b, lastService: e.target.value })} />
                    </label>
                  </div>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
