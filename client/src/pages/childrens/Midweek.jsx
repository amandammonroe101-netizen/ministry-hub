import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Midweek / Clubs
   Storage: childrens:clubs — recurring midweek programs.
   Each { id, name, dayOfWeek, startTime, endTime, ageBand, lead,
   description, meetings: [{ id, date, attendance, notes }], active }. */

const ACCENT = 'var(--accent-amber, #fbbf24)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DEFAULT_CLUB = () => ({
  id:           makeId('cl'),
  name:         '',
  dayOfWeek:    'Wednesday',
  startTime:    '6:30 PM',
  endTime:      '8:00 PM',
  ageBand:      'K-2nd',
  lead:         '',
  description:  '',
  meetings:     [],
  active:       true,
  createdAt:    Date.now(),
});

export default function ChildrensMidweek() {
  const [clubs, setClubs, { loading }] = useUserStoreKey('childrens:clubs', []);
  const list = Array.isArray(clubs) ? clubs : [];

  const [filter, setFilter] = useState('active');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => list
    .filter(c => filter === 'all' ? true : filter === 'active' ? c.active : !c.active)
    .sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek))
  , [list, filter]);

  const add = () => {
    const c = DEFAULT_CLUB();
    setClubs(prev => [...(prev || []), c]);
    setOpenId(c.id);
  };
  const update = (id, patch) =>
    setClubs(prev => (prev || []).map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id) => {
    if (!confirm('Delete this club?')) return;
    setClubs(prev => (prev || []).filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
  };

  const logMeeting = (clubId) => {
    const club = list.find(c => c.id === clubId);
    if (!club) return;
    const meeting = {
      id:        makeId('mtg'),
      date:      new Date().toISOString().slice(0, 10),
      attendance: 0,
      notes:     '',
    };
    update(clubId, { meetings: [meeting, ...(club.meetings || [])] });
  };

  const open = openId ? list.find(c => c.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Programs" groupIcon="📅"
      icon="🌙" title="Midweek / Clubs"
      accent={ACCENT}
      subtitle="Recurring midweek programs — Awana, Bible Buddies, etc. — with attendance tracking per meeting."
      actions={<button className="yps-add-btn" onClick={add}>＋ New club</button>}
      stats={[
        { n: list.filter(c => c.active).length, label: 'active clubs' },
        { n: list.reduce((n, c) => n + (c.meetings?.length || 0), 0), label: 'meetings logged' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-chips">
        <button className={`yps-chip ${filter === 'active' ? 'on' : ''}`} onClick={() => setFilter('active')}>Active</button>
        <button className={`yps-chip ${filter === 'inactive' ? 'on' : ''}`} onClick={() => setFilter('inactive')}>Inactive</button>
        <button className={`yps-chip ${filter === 'all' ? 'on' : ''}`}    onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🌙</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🌙</div><div className="cm-empty-title">No clubs yet</div><div className="cm-empty-sub">Set up your first recurring midweek program.</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(c => {
            const last = (c.meetings || [])[0];
            return (
              <article key={c.id} className="cm-card" onClick={() => setOpenId(c.id)}>
                <div className="cm-card-hd">
                  <h3 className="cm-card-title">{c.name || 'Untitled club'}</h3>
                  {!c.active && <span className="yps-pill">paused</span>}
                </div>
                <div className="cm-card-meta">
                  <span className="yps-pill">{c.dayOfWeek}s</span>
                  <span className="yps-pill">{c.startTime} – {c.endTime}</span>
                  <span className="yps-pill">{c.ageBand}</span>
                </div>
                {c.lead && <div className="cm-card-sub">👤 {c.lead}</div>}
                {last && (
                  <div className="cm-card-sub">
                    Last meeting: {last.date} · {last.attendance} kids
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.name || 'New club'}</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Name" full><input className="yps-input" value={open.name} onChange={e => update(open.id, { name: e.target.value })} placeholder="Awana, Bible Buddies, etc." /></Field>
              <Field label="Day of week">
                <select className="yps-select" value={open.dayOfWeek} onChange={e => update(open.id, { dayOfWeek: e.target.value })}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Age band"><input className="yps-input" value={open.ageBand} onChange={e => update(open.id, { ageBand: e.target.value })} placeholder="K-2nd" /></Field>
              <Field label="Start time"><input className="yps-input" value={open.startTime} onChange={e => update(open.id, { startTime: e.target.value })} /></Field>
              <Field label="End time"><input className="yps-input" value={open.endTime} onChange={e => update(open.id, { endTime: e.target.value })} /></Field>
              <Field label="Lead" full><input className="yps-input" value={open.lead} onChange={e => update(open.id, { lead: e.target.value })} /></Field>
              <Field label="Description" full>
                <textarea className="yps-textarea" rows={3} value={open.description} onChange={e => update(open.id, { description: e.target.value })} />
              </Field>
              <Field label="Active">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <input type="checkbox" checked={open.active} onChange={e => update(open.id, { active: e.target.checked })} />
                  <span>Currently meeting</span>
                </label>
              </Field>

              <div className="cm-field full">
                <span className="cm-field-label">Meetings ({(open.meetings || []).length})</span>
                <button className="yps-btn" onClick={() => logMeeting(open.id)} style={{ width: 'fit-content' }}>＋ Log meeting</button>
                {(open.meetings || []).length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {open.meetings.map((m, i) => (
                      <li key={m.id} style={{ display: 'grid', gridTemplateColumns: '120px 80px 1fr auto', gap: 6, alignItems: 'center' }}>
                        <input type="date" className="yps-input" value={m.date} onChange={e => {
                          const next = [...open.meetings];
                          next[i] = { ...m, date: e.target.value };
                          update(open.id, { meetings: next });
                        }} />
                        <input type="number" min={0} className="yps-input" value={m.attendance} onChange={e => {
                          const next = [...open.meetings];
                          next[i] = { ...m, attendance: Number(e.target.value) || 0 };
                          update(open.id, { meetings: next });
                        }} />
                        <input className="yps-input" placeholder="Notes" value={m.notes} onChange={e => {
                          const next = [...open.meetings];
                          next[i] = { ...m, notes: e.target.value };
                          update(open.id, { meetings: next });
                        }} />
                        <button className="yps-btn ghost" onClick={() => {
                          update(open.id, { meetings: open.meetings.filter(x => x.id !== m.id) });
                        }}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
