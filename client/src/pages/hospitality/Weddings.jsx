import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Special Events → Weddings

   Wedding hosting checklist per couple — coordinator, rehearsal
   date, ceremony/reception hosting tasks, and quick links to
   Event Catering (reception meal) and Setup & Decor (venue setup).

   Storage:
     weddings: useUserStoreKey('hospitality:weddings', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_TASKS = [
  'Coordinator assigned',
  'Rehearsal walkthrough scheduled',
  'Guest book / welcome table staffed',
  'Ceremony seating/ushers assigned',
  'Reception setup & teardown crew assigned',
  'Catering request submitted',
];

export default function Weddings() {
  const [weddings, setWeddings, { loading }] = useUserStoreKey('hospitality:weddings', []);
  const navigate = useNavigate();

  const weddingList = Array.isArray(weddings) ? weddings : [];
  const upcomingCount = weddingList.filter(w => w.status !== 'complete').length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [draft, setDraft] = useState({ couple: '', date: '', coordinator: '', rehearsalDate: '' });
  const [selectedId, setSelectedId] = useState(null);

  const selected = weddingList.find(w => w.id === selectedId) || null;

  const addWedding = () => {
    if (!draft.couple.trim()) return;
    setWeddings(prev => [{ id: makeId('wd'), couple: draft.couple.trim(), date: draft.date, coordinator: draft.coordinator.trim(), rehearsalDate: draft.rehearsalDate, status: 'planning', notes: '', tasks: DEFAULT_TASKS.map(label => ({ id: makeId('tk'), label, done: false })) }, ...(prev || [])]);
    setDraft({ couple: '', date: '', coordinator: '', rehearsalDate: '' });
  };
  const removeWedding = (id) => {
    setWeddings(prev => (prev || []).filter(w => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const setStatus = (id, status) => setWeddings(prev => (prev || []).map(w => w.id === id ? { ...w, status } : w));
  const setField = (id, field, value) => setWeddings(prev => (prev || []).map(w => w.id === id ? { ...w, [field]: value } : w));
  const toggleTask = (weddingId, taskId) => setWeddings(prev => (prev || []).map(w => w.id === weddingId ? { ...w, tasks: w.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : w));

  return (
    <HospitalityShell
      title="Weddings"
      icon="💍"
      subtitle="Wedding coordination — venue setup, rehearsal hosting, ceremony ushers, reception support, and post-event cleanup."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{upcomingCount}</span><span className="ha-stat-lbl">Weddings in progress</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{weddingList.length}</span><span className="ha-stat-lbl">Total tracked</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">💍 New wedding</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Couple name(s)" value={draft.couple} onChange={e => setDraft(d => ({ ...d, couple: e.target.value }))} />
                    <input type="date" className="ys-inp" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Coordinator" value={draft.coordinator} onChange={e => setDraft(d => ({ ...d, coordinator: e.target.value }))} />
                    <input type="date" className="ys-inp" placeholder="Rehearsal date" value={draft.rehearsalDate} onChange={e => setDraft(d => ({ ...d, rehearsalDate: e.target.value }))} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addWedding}>＋ Add wedding</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📋 Weddings</h3>
                <div className="ys-section-body">
                  {weddingList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No weddings tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {weddingList.map(w => {
                        const done = w.tasks.filter(t => t.done).length;
                        return (
                          <div key={w.id} className="ha-list-row" style={{ cursor: 'pointer', opacity: w.status === 'complete' ? 0.5 : 1 }} onClick={() => setSelectedId(w.id)}>
                            <div className="ha-list-row-body">
                              <span className="ha-list-row-title">{w.couple}</span>
                              <span className="ha-list-row-meta">{w.date || 'No date'} · {done}/{w.tasks.length} tasks done · {w.status}</span>
                            </div>
                            <button type="button" className="app-btn ghost" onClick={(e) => { e.stopPropagation(); removeWedding(w.id); }}>✕</button>
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
                  <h2 style={{ margin: 0 }}>{selected.couple}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selected.date || 'No date'} · Coordinator: {selected.coordinator || '—'}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Rehearsal: {selected.rehearsalDate || 'Not scheduled'}</div>

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
                    <textarea className="ys-inp ys-textarea" rows={3} value={selected.notes || ''} onChange={e => setField(selected.id, 'notes', e.target.value)} placeholder="Special requests, family dynamics to be aware of, timeline notes…" />
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
