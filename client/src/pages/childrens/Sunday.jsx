import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Sunday Mornings
   Storage: childrens:sundays — array of Sunday-morning service
   plans. Each { id, date, serviceTime, theme, lessonId,
   roomAssignments: [{ band, roomName, leadName, helperNames }],
   runSheet, notes }. */

const ACCENT = 'var(--accent-amber, #fbbf24)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const AGE_BANDS = ['Nursery (0-2)', 'Toddler (2-3)', 'Preschool (3-5)', 'K-2nd', '3rd-5th'];

const DEFAULT_SUNDAY = () => ({
  id:           makeId('sun'),
  date:         nextSundayIso(),
  serviceTime:  '9:00 AM',
  theme:        '',
  lessonId:     '',
  roomAssignments: AGE_BANDS.map(b => ({ band: b, roomName: '', leadName: '', helperNames: '' })),
  runSheet:     '',
  notes:        '',
  createdAt:    Date.now(),
});

function nextSundayIso() {
  const d = new Date();
  const day = d.getDay();             // 0 = Sun
  const add = day === 0 ? 7 : (7 - day);
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export default function ChildrensSunday() {
  const [sundays, setSundays, { loading }] = useUserStoreKey('childrens:sundays', []);
  const [lessons] = useUserStoreKey('childrens:lessons', []);
  const list       = Array.isArray(sundays) ? sundays : [];
  const lessonList = Array.isArray(lessons) ? lessons : [];

  const [filter, setFilter] = useState('upcoming');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => list
    .filter(s => filter === 'upcoming' ? s.date >= today : filter === 'past' ? s.date < today : true)
    .sort((a, b) => filter === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
  , [list, filter, today]);

  const add = () => {
    const s = DEFAULT_SUNDAY();
    setSundays(prev => [s, ...(prev || [])]);
    setOpenId(s.id);
  };
  const update = (id, patch) =>
    setSundays(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  const remove = (id) => {
    if (!confirm('Delete this Sunday?')) return;
    setSundays(prev => (prev || []).filter(s => s.id !== id));
    if (openId === id) setOpenId(null);
  };

  const open = openId ? list.find(s => s.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Programs" groupIcon="📅"
      icon="☀" title="Sunday Mornings"
      accent={ACCENT}
      subtitle="One card per Sunday — service time, lesson, room assignments, run sheet."
      actions={<button className="yps-add-btn" onClick={add}>＋ New Sunday</button>}
      stats={[
        { n: list.filter(s => s.date >= today).length, label: 'upcoming' },
        { n: list.length, label: 'total in records' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-chips">
        <button className={`yps-chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button className={`yps-chip ${filter === 'past' ? 'on' : ''}`}     onClick={() => setFilter('past')}>Past</button>
        <button className={`yps-chip ${filter === 'all' ? 'on' : ''}`}      onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">☀</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">☀</div><div className="cm-empty-title">No Sundays planned</div><div className="cm-empty-sub">Tap "＋ New Sunday" to plan your next service.</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(s => {
            const filled = (s.roomAssignments || []).filter(r => r.leadName).length;
            const total = (s.roomAssignments || []).length;
            const lesson = lessonList.find(l => l.id === s.lessonId);
            return (
              <article key={s.id} className="cm-card" onClick={() => setOpenId(s.id)}>
                <div className="cm-card-hd">
                  <h3 className="cm-card-title">{s.date}</h3>
                  <span className="yps-pill">{s.serviceTime}</span>
                </div>
                {s.theme && <div className="cm-card-sub"><b>Theme:</b> {s.theme}</div>}
                {lesson && <div className="cm-card-sub">📖 {lesson.title || 'Lesson'}</div>}
                <div className="cm-card-meta">
                  <span className={`yps-pill ${filled === total ? 'cm-good' : filled === 0 ? 'cm-bad' : 'cm-warn'}`}>
                    👥 {filled}/{total} rooms staffed
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.date} — Sunday plan</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Date"><input type="date" className="yps-input" value={open.date} onChange={e => update(open.id, { date: e.target.value })} /></Field>
              <Field label="Service time"><input className="yps-input" value={open.serviceTime} onChange={e => update(open.id, { serviceTime: e.target.value })} placeholder="9:00 AM" /></Field>
              <Field label="Theme" full><input className="yps-input" value={open.theme} onChange={e => update(open.id, { theme: e.target.value })} placeholder="e.g. God's love" /></Field>
              <Field label="Lesson" full>
                <select className="yps-select" value={open.lessonId} onChange={e => update(open.id, { lessonId: e.target.value })}>
                  <option value="">— Pick from curriculum</option>
                  {lessonList.map(l => <option key={l.id} value={l.id}>{l.title || 'Untitled lesson'}</option>)}
                </select>
              </Field>

              <div className="cm-field full">
                <span className="cm-field-label">Room assignments</span>
                <table style={{ width: '100%', fontSize: 'var(--fs-sm)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '4px 6px' }}>Band</th>
                      <th style={{ padding: '4px 6px' }}>Room</th>
                      <th style={{ padding: '4px 6px' }}>Lead</th>
                      <th style={{ padding: '4px 6px' }}>Helpers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(open.roomAssignments || []).map((r, i) => (
                      <tr key={r.band}>
                        <td style={{ padding: '2px 6px', fontWeight: 600 }}>{r.band}</td>
                        <td style={{ padding: '2px 6px' }}><input className="yps-input" value={r.roomName} onChange={e => {
                          const next = [...open.roomAssignments];
                          next[i] = { ...next[i], roomName: e.target.value };
                          update(open.id, { roomAssignments: next });
                        }} /></td>
                        <td style={{ padding: '2px 6px' }}><input className="yps-input" value={r.leadName} onChange={e => {
                          const next = [...open.roomAssignments];
                          next[i] = { ...next[i], leadName: e.target.value };
                          update(open.id, { roomAssignments: next });
                        }} placeholder="Volunteer name" /></td>
                        <td style={{ padding: '2px 6px' }}><input className="yps-input" value={r.helperNames} onChange={e => {
                          const next = [...open.roomAssignments];
                          next[i] = { ...next[i], helperNames: e.target.value };
                          update(open.id, { roomAssignments: next });
                        }} placeholder="Comma-separated" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Field label="Run sheet" full>
                <textarea className="yps-textarea" rows={5} value={open.runSheet} onChange={e => update(open.id, { runSheet: e.target.value })} placeholder="9:00 — doors open\n9:15 — worship\n9:30 — lesson\n9:50 — game / activity\n10:00 — pickup begins" />
              </Field>
              <Field label="Notes" full><textarea className="yps-textarea" rows={3} value={open.notes} onChange={e => update(open.id, { notes: e.target.value })} /></Field>
            </div>
            <footer className="cm-modal-ft">
              <button className="yps-btn danger" onClick={() => remove(open.id)}>🗑 Delete</button>
              <button className="yps-add-btn" onClick={() => setOpenId(null)}>Done</button>
            </footer>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`cm-field ${full ? 'full' : ''}`}>
      <span className="cm-field-label">{label}</span>
      {children}
    </label>
  );
}
