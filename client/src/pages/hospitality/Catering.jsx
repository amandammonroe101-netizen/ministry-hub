import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Food & Refreshments → Event Catering

   Catering requests for weddings, funerals, holiday events, and
   other large gatherings — headcount, budget, menu plan, and a
   vendor contact list. Links out to the matching Special Events
   page so catering details stay attached to the event itself.

   Storage:
     requests: useUserStoreKey('hospitality:catering-requests', [])
     vendors:  useUserStoreKey('hospitality:catering-vendors', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const EVENT_TYPE_LINKS = {
  wedding: '/hospitality/events/weddings',
  funeral: '/hospitality/events/funerals',
  holiday: '/hospitality/events/holiday',
  other: null,
};

export default function Catering() {
  const [requests, setRequests, { loading }] = useUserStoreKey('hospitality:catering-requests', []);
  const [vendors, setVendors] = useUserStoreKey('hospitality:catering-vendors', []);
  const navigate = useNavigate();

  const requestList = Array.isArray(requests) ? requests : [];
  const vendorList = Array.isArray(vendors) ? vendors : [];
  const upcomingCount = requestList.filter(r => r.status !== 'complete').length;
  const totalBudget = requestList.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [reqDraft, setReqDraft] = useState({ title: '', eventType: 'other', date: '', headcount: '', budget: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [menuDraft, setMenuDraft] = useState('');
  const [vendorDraft, setVendorDraft] = useState({ name: '', contact: '', specialty: '' });

  const selected = requestList.find(r => r.id === selectedId) || null;

  const addRequest = () => {
    if (!reqDraft.title.trim()) return;
    setRequests(prev => [{ id: makeId('cr'), title: reqDraft.title.trim(), eventType: reqDraft.eventType, date: reqDraft.date, headcount: Number(reqDraft.headcount) || 0, budget: Number(reqDraft.budget) || 0, status: 'planning', menu: [], vendorId: null }, ...(prev || [])]);
    setReqDraft({ title: '', eventType: 'other', date: '', headcount: '', budget: '' });
  };
  const setStatus = (id, status) => setRequests(prev => (prev || []).map(r => r.id === id ? { ...r, status } : r));
  const removeRequest = (id) => {
    setRequests(prev => (prev || []).filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const setVendorForRequest = (id, vendorId) => setRequests(prev => (prev || []).map(r => r.id === id ? { ...r, vendorId: vendorId || null } : r));

  const addMenuItem = () => {
    if (!selected || !menuDraft.trim()) return;
    setRequests(prev => prev.map(r => r.id === selected.id ? { ...r, menu: [...(r.menu || []), { id: makeId('mi'), item: menuDraft.trim() }] } : r));
    setMenuDraft('');
  };
  const removeMenuItem = (itemId) => setRequests(prev => prev.map(r => r.id === selectedId ? { ...r, menu: (r.menu || []).filter(m => m.id !== itemId) } : r));

  const addVendor = () => {
    if (!vendorDraft.name.trim()) return;
    setVendors(prev => [...(prev || []), { id: makeId('ve'), name: vendorDraft.name.trim(), contact: vendorDraft.contact.trim(), specialty: vendorDraft.specialty.trim() }]);
    setVendorDraft({ name: '', contact: '', specialty: '' });
  };
  const removeVendor = (id) => setVendors(prev => (prev || []).filter(v => v.id !== id));

  return (
    <HospitalityShell
      title="Event Catering"
      icon="🧁"
      subtitle="Catering for special events — vendor list, in-house vs. outsourced, headcount-based ordering, and per-event budget."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{upcomingCount}</span><span className="ha-stat-lbl">Active requests</span></div>
                <div className="ha-stat"><span className="ha-stat-n">${totalBudget.toLocaleString()}</span><span className="ha-stat-lbl">Total budget</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{vendorList.length}</span><span className="ha-stat-lbl">Vendors on file</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🍽️ New catering request</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Event title" value={reqDraft.title} onChange={e => setReqDraft(d => ({ ...d, title: e.target.value }))} />
                    <select className="ys-inp" value={reqDraft.eventType} onChange={e => setReqDraft(d => ({ ...d, eventType: e.target.value }))}>
                      <option value="wedding">Wedding</option>
                      <option value="funeral">Funeral</option>
                      <option value="holiday">Holiday event</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="ys-row-fields">
                    <input type="date" className="ys-inp" value={reqDraft.date} onChange={e => setReqDraft(d => ({ ...d, date: e.target.value }))} />
                    <input type="number" min="0" className="ys-inp" placeholder="Headcount" value={reqDraft.headcount} onChange={e => setReqDraft(d => ({ ...d, headcount: e.target.value }))} />
                    <input type="number" min="0" className="ys-inp" placeholder="Budget ($)" value={reqDraft.budget} onChange={e => setReqDraft(d => ({ ...d, budget: e.target.value }))} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addRequest}>＋ Add request</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📋 Catering requests</h3>
                <div className="ys-section-body">
                  {requestList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No catering requests yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {requestList.map(r => (
                        <div key={r.id} className="ha-list-row" style={{ cursor: 'pointer', opacity: r.status === 'complete' ? 0.5 : 1 }} onClick={() => setSelectedId(r.id)}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{r.title}</span>
                            <span className="ha-list-row-meta">{r.date || 'No date'} · {r.headcount || 0} guests · ${(r.budget || 0).toLocaleString()} · {r.status}</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removeRequest(r.id); }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📇 Vendor contacts</h3>
                <div className="ys-section-body">
                  {vendorList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No vendors on file yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {vendorList.map(v => (
                        <div key={v.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{v.name}</span>
                            <span className="ha-list-row-meta">{v.specialty || ''}{v.contact ? ` · ${v.contact}` : ''}</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={() => removeVendor(v.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Vendor name" value={vendorDraft.name} onChange={e => setVendorDraft(d => ({ ...d, name: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Contact (phone/email)" value={vendorDraft.contact} onChange={e => setVendorDraft(d => ({ ...d, contact: e.target.value }))} />
                  </div>
                  <input type="text" className="ys-inp" placeholder="Specialty (e.g. BBQ, desserts, full-service)" value={vendorDraft.specialty} onChange={e => setVendorDraft(d => ({ ...d, specialty: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addVendor}>＋ Add vendor</button>
                </div>
              </section>
            </div>
          )}

          {selected && (
            <div className="ha-slide-overlay" onClick={() => setSelectedId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selected.title}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selected.date || 'No date'} · {selected.headcount || 0} guests · ${(selected.budget || 0).toLocaleString()}</div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Status</div>
                    <select className="ys-inp" value={selected.status} onChange={e => setStatus(selected.id, e.target.value)}>
                      <option value="planning">Planning</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Vendor</div>
                    <select className="ys-inp" value={selected.vendorId || ''} onChange={e => setVendorForRequest(selected.id, e.target.value)}>
                      <option value="">Unassigned</option>
                      {vendorList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Menu plan</div>
                    {(selected.menu || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No menu items yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {selected.menu.map(m => (
                          <div key={m.id} className="ha-list-row" style={{ cursor: 'default' }}>
                            <span className="ha-list-row-title">{m.item}</span>
                            <button type="button" className="app-btn ghost" onClick={() => removeMenuItem(m.id)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input type="text" className="ys-inp" placeholder="Menu item" value={menuDraft} onChange={e => setMenuDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMenuItem(); } }} />
                      <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addMenuItem}>＋</button>
                    </div>
                  </div>

                  {EVENT_TYPE_LINKS[selected.eventType] && (
                    <button type="button" className="app-btn ghost" style={{ width: 'fit-content', marginTop: 16 }} onClick={() => navigate(EVENT_TYPE_LINKS[selected.eventType])}>
                      Open {selected.eventType === 'wedding' ? 'Weddings' : selected.eventType === 'funeral' ? 'Funerals' : 'Holiday Hosting'} →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
