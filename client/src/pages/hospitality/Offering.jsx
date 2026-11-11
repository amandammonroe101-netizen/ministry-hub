import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Sunday Hosting → Offering & Communion

   Offering-rotation roster, a money-handling protocol reference,
   a communion-prep checklist (elements/plates/gluten-free), and
   a post-service cleanup log.

   Storage:
     rotation:   useUserStoreKey('hospitality:offering-rotation', [])
     protocol:   useUserStoreKey('hospitality:offering-protocol', '')
     communion:  useUserStoreKey('hospitality:communion-checklist', [])
     cleanup:    useUserStoreKey('hospitality:offering-cleanup-log', [])
     hosts:      useHosts() (read only, shared directory, role="communion")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_COMMUNION_ITEMS = [
  'Bread/wafers set out',
  'Juice/wine poured',
  'Gluten-free option prepared',
  'Trays & plates staged',
  'Servers briefed',
];

export default function Offering() {
  const [hosts] = useHosts();
  const [rotation, setRotation, { loading }] = useUserStoreKey('hospitality:offering-rotation', []);
  const [protocol, setProtocol] = useUserStoreKey('hospitality:offering-protocol', '');
  const [communion, setCommunion] = useUserStoreKey('hospitality:communion-checklist', DEFAULT_COMMUNION_ITEMS.map(label => ({ id: makeId('cm'), label, done: false })));
  const [cleanupLog, setCleanupLog] = useUserStoreKey('hospitality:offering-cleanup-log', []);
  const navigate = useNavigate();

  const communionHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('communion')), [hosts]);
  const rotationList = Array.isArray(rotation) ? rotation : [];
  const communionList = Array.isArray(communion) ? communion : [];
  const cleanupList = Array.isArray(cleanupLog) ? cleanupLog : [];
  const communionDone = communionList.filter(c => c.done).length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [rotationDraft, setRotationDraft] = useState({ service: '', names: '' });
  const [cleanupDraft, setCleanupDraft] = useState('');

  const addRotation = () => {
    if (!rotationDraft.service.trim()) return;
    setRotation(prev => [...(prev || []), { id: makeId('or'), service: rotationDraft.service.trim(), names: rotationDraft.names.trim() }]);
    setRotationDraft({ service: '', names: '' });
  };
  const removeRotation = (id) => setRotation(prev => (prev || []).filter(r => r.id !== id));

  const toggleCommunion = (id) => setCommunion(prev => (prev || []).map(c => c.id === id ? { ...c, done: !c.done } : c));
  const resetCommunion = () => setCommunion(DEFAULT_COMMUNION_ITEMS.map(label => ({ id: makeId('cm'), label, done: false })));

  const logCleanup = () => {
    const note = cleanupDraft.trim();
    if (!note) return;
    setCleanupLog(prev => [{ id: makeId('cl'), note, date: today() }, ...(prev || [])]);
    setCleanupDraft('');
  };
  const removeCleanup = (id) => setCleanupLog(prev => (prev || []).filter(c => c.id !== id));

  return (
    <HospitalityShell
      title="Offering & Communion"
      icon="🪙"
      subtitle="Offering rotation, money-handling protocol, communion prep (elements, plates, gluten-free), and post-service cleanup."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{communionHosts.length}</span><span className="ha-stat-lbl">Communion prep hosts</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{rotationList.length}</span><span className="ha-stat-lbl">Services in rotation</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{communionDone}/{communionList.length}</span><span className="ha-stat-lbl">Communion prep done</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🪙 Communion prep hosts</h3>
                <div className="ys-section-body">
                  {communionHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Communion Prep yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {communionHosts.map(h => (
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
                <h3 className="ys-section-title">🔁 Offering rotation</h3>
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
                <h3 className="ys-section-title">🔒 Money-handling protocol</h3>
                <div className="ys-section-body">
                  <textarea className="ys-inp ys-textarea" rows={3} placeholder="e.g. Two-person count, sealed deposit bags, safe drop procedure, who to contact with questions…" value={protocol || ''} onChange={e => setProtocol(e.target.value)} />
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">✝️ Communion prep checklist</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {communionList.map(c => (
                      <label key={c.id} className="ha-list-row" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!c.done} onChange={() => toggleCommunion(c.id)} />
                        <span className="ha-list-row-title" style={{ textDecoration: c.done ? 'line-through' : 'none', opacity: c.done ? 0.6 : 1 }}>{c.label}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={resetCommunion}>↺ Reset checklist for next service</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🧹 Post-service cleanup log</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Note (e.g. 'Trays washed & stored, table wiped down')" value={cleanupDraft} onChange={e => setCleanupDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logCleanup(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={logCleanup}>＋ Log</button>
                  </div>
                  {cleanupList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {cleanupList.map(c => (
                        <div key={c.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{c.note}</span>
                            <span className="ha-list-row-meta">{c.date}</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={() => removeCleanup(c.id)}>✕</button>
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
