import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Special Events → Holiday Hosting

   Christmas/Easter (and other high-attendance) service planning —
   an extra-volunteers-needed count measured against the shared
   host directory, a hosting checklist template, and quick links
   to Event Catering and Setup & Decor for the big day.

   Storage:
     holidays: useUserStoreKey('hospitality:holiday-events', [])
     hosts:    useHosts() (read only, shared directory, for coverage math)
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_TASKS = [
  'Extra parking attendants scheduled',
  'Overflow seating plan confirmed',
  'Extra greeters/ushers scheduled',
  'Guest gifts/programs stocked',
  'Catering/refreshments confirmed',
  'Decor & setup crew scheduled',
];

export default function Holiday() {
  const [holidays, setHolidays, { loading }] = useUserStoreKey('hospitality:holiday-events', []);
  const [hosts] = useHosts();
  const navigate = useNavigate();

  const holidayList = Array.isArray(holidays) ? holidays : [];
  const activeHostCount = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => h.status === 'active').length, [hosts]);
  const upcomingCount = holidayList.filter(h => h.status !== 'complete').length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [draft, setDraft] = useState({ title: '', date: '', expectedAttendance: '', volunteersNeeded: '' });
  const [selectedId, setSelectedId] = useState(null);

  const selected = holidayList.find(h => h.id === selectedId) || null;

  const addHoliday = () => {
    if (!draft.title.trim()) return;
    setHolidays(prev => [{ id: makeId('ho'), title: draft.title.trim(), date: draft.date, expectedAttendance: Number(draft.expectedAttendance) || 0, volunteersNeeded: Number(draft.volunteersNeeded) || 0, status: 'planning', notes: '', tasks: DEFAULT_TASKS.map(label => ({ id: makeId('tk'), label, done: false })) }, ...(prev || [])]);
    setDraft({ title: '', date: '', expectedAttendance: '', volunteersNeeded: '' });
  };
  const removeHoliday = (id) => {
    setHolidays(prev => (prev || []).filter(h => h.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const setStatus = (id, status) => setHolidays(prev => (prev || []).map(h => h.id === id ? { ...h, status } : h));
  const setField = (id, field, value) => setHolidays(prev => (prev || []).map(h => h.id === id ? { ...h, [field]: value } : h));
  const toggleTask = (holidayId, taskId) => setHolidays(prev => (prev || []).map(h => h.id === holidayId ? { ...h, tasks: h.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : h));

  return (
    <HospitalityShell
      title="Holiday Hosting"
      icon="🎄"
      subtitle="Christmas Eve, Easter, Thanksgiving — extra hosts, expanded greeter teams, overflow seating, and visitor-heavy logistics."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{upcomingCount}</span><span className="ha-stat-lbl">Upcoming holiday events</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{activeHostCount}</span><span className="ha-stat-lbl">Active hosts on file</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🎄 New holiday event</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Event (e.g. Christmas Eve, Easter Sunrise)" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                    <input type="date" className="ys-inp" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div className="ys-row-fields">
                    <input type="number" min="0" className="ys-inp" placeholder="Expected attendance" value={draft.expectedAttendance} onChange={e => setDraft(d => ({ ...d, expectedAttendance: e.target.value }))} />
                    <input type="number" min="0" className="ys-inp" placeholder="Extra volunteers needed" value={draft.volunteersNeeded} onChange={e => setDraft(d => ({ ...d, volunteersNeeded: e.target.value }))} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addHoliday}>＋ Add event</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📋 Holiday events</h3>
                <div className="ys-section-body">
                  {holidayList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No holiday events planned yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {holidayList.map(h => {
                        const done = h.tasks.filter(t => t.done).length;
                        const shortfall = Math.max(0, (h.volunteersNeeded || 0) - activeHostCount);
                        return (
                          <div key={h.id} className="ha-list-row" style={{ cursor: 'pointer', opacity: h.status === 'complete' ? 0.5 : 1 }} onClick={() => setSelectedId(h.id)}>
                            <div className="ha-list-row-body">
                              <span className="ha-list-row-title">{h.title}</span>
                              <span className="ha-list-row-meta">{h.date || 'No date'} · {h.expectedAttendance || 0} expected · {done}/{h.tasks.length} tasks done{shortfall > 0 ? ` · ⚡ ${shortfall} more volunteers needed` : ''}</span>
                            </div>
                            <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removeHoliday(h.id); }}>✕</button>
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
                  <h2 style={{ margin: 0 }}>{selected.title}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selected.date || 'No date'} · {selected.expectedAttendance || 0} expected attendance</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    Needs {selected.volunteersNeeded || 0} volunteers · {activeHostCount} active hosts on file
                    {(selected.volunteersNeeded || 0) > activeHostCount && <span style={{ color: '#fdba74' }}> — recruit more!</span>}
                  </div>

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
                    <textarea className="ys-inp ys-textarea" rows={3} value={selected.notes || ''} onChange={e => setField(selected.id, 'notes', e.target.value)} placeholder="Extra service times, overflow room plan, special guest arrangements…" />
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
