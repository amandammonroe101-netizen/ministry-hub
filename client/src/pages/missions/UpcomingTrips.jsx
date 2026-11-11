import { useMemo, useState } from 'react';
import MissionsShell from './MissionsShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './MissionsFlagship.css';

/* ─────────────────────────────────────────────────────────────
   Missions → Mission Trips → Upcoming Trips

   Trip dashboards — destination, dates, team roster, leaders,
   budget, packing list, and registration status. Same sidebar +
   dashboard + inline-editor layout as Sent Ones, scoped by
   registration status instead of missionary status.

   Storage: useUserStoreKey('missions:trips-upcoming', [])
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  planning:  { label: 'Planning',            icon: '📝' },
  open:      { label: 'Registration Open',   icon: '📣' },
  confirmed: { label: 'Team Confirmed',      icon: '✅' },
  departed:  { label: 'Departed',            icon: '🛫' },
};
const STATUS_ORDER = ['planning', 'open', 'confirmed', 'departed'];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_TRIP = () => ({
  id:           makeId('trip'),
  destination:  '',
  startDate:    '',
  endDate:      '',
  leaders:      '',
  roster:       [],
  budget:       '',
  status:       'planning',
  itinerary:    '',
  packingList:  '',
  createdAt:    Date.now(),
});

function formatDates(start, end) {
  if (!start && !end) return 'Dates TBD';
  if (start && end) return `${start} → ${end}`;
  return start || end;
}

export default function MissionsUpcomingTrips() {
  const [trips, setTrips, { loading }] = useUserStoreKey('missions:trips-upcoming', []);
  const list = Array.isArray(trips) ? trips : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const addTrip = () => {
    const t = DEFAULT_TRIP();
    setTrips(prev => [...(prev || []), t]);
    setStatusFilter('all');
    setSelectedId(t.id);
  };

  const updateTrip = (id, patch) => {
    setTrips(prev => (prev || []).map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const removeTrip = (id) => {
    setTrips(prev => (prev || []).filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const countFor = (statusId) => list.filter(t => (t.status || 'planning') === statusId).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (statusFilter !== 'all') out = out.filter(t => (t.status || 'planning') === statusFilter);
    if (q) {
      out = out.filter(t =>
        (t.destination || '').toLowerCase().includes(q) ||
        (t.leaders || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [list, query, statusFilter]);

  const dashboard = useMemo(() => {
    const scoped = statusFilter === 'all' ? list : list.filter(t => (t.status || 'planning') === statusFilter);
    return {
      total:      scoped.length,
      confirmed:  scoped.filter(t => (t.status || 'planning') === 'confirmed').length,
      noLeader:   scoped.filter(t => !(t.leaders || '').trim()).length,
      noRoster:   scoped.filter(t => !(t.roster || []).length).length,
    };
  }, [list, statusFilter]);

  const activeMeta = statusFilter === 'all'
    ? { label: 'All Upcoming Trips', icon: '📅' }
    : STATUS_META[statusFilter];

  return (
    <MissionsShell
      title="Upcoming Trips"
      icon="📅"
      subtitle="Trip dashboards — destination, dates, team roster, leaders, itinerary, budget, packing list, and registration status."
      actions={
        <button type="button" className="app-btn primary" onClick={addTrip}>
          ✦ New trip
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
        <div className="msf-empty-note" style={{ flex: 1 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="app-empty">
          <div className="app-empty-icon">📅</div>
          <div className="app-empty-title">No upcoming trips yet</div>
          <div className="app-empty-sub">
            Plan a trip's destination, dates, leaders, team roster,
            budget, and packing list all in one place.
          </div>
          <button type="button" className="app-btn primary" onClick={addTrip}>
            ✦ Add your first trip
          </button>
        </div>
      ) : (
        <div className="msf-root">
          <nav className="msf-sidebar" aria-label="Trip registration status">
            <button
              type="button"
              className={`msf-node${statusFilter === 'all' ? ' on' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <span className="msf-node-icon">📅</span>
              <span className="msf-node-name">All</span>
              <span className="msf-node-count">{list.length}</span>
            </button>
            <div className="msf-sidebar-list">
              {STATUS_ORDER.map(id => (
                <button
                  key={id}
                  type="button"
                  className={`msf-node${statusFilter === id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  <span className="msf-node-icon">{STATUS_META[id].icon}</span>
                  <span className="msf-node-name">{STATUS_META[id].label}</span>
                  <span className="msf-node-count">{countFor(id)}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="msf-detail">
            <section className="msf-panel">
              <div className="msf-panel-hd">
                <span className="msf-panel-icon">{activeMeta.icon}</span>
                <h2 className="msf-panel-title">{activeMeta.label}</h2>
              </div>
              <div className="msf-stat-row">
                <div className="msf-stat">
                  <span className="msf-stat-n">{dashboard.total}</span>
                  <span className="msf-stat-lbl">Trips</span>
                </div>
                <div className="msf-stat">
                  <span className="msf-stat-n">{dashboard.confirmed}</span>
                  <span className="msf-stat-lbl">Team confirmed</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.noLeader}</span>
                  <span className="msf-stat-lbl">No leader on file</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.noRoster}</span>
                  <span className="msf-stat-lbl">Empty roster</span>
                </div>
              </div>
            </section>

            <section className="msf-panel">
              <div className="msf-panel-row">
                <h3 className="msf-panel-subtitle">Trips</h3>
              </div>

              <div className="msf-controls">
                <div className="msf-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by destination, leader…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="msf-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="msf-empty-note">
                  {query ? `No trips match "${query}".` : 'No trips match this filter.'}
                </div>
              ) : (
                <ul className="msf-list">
                  {visible.map(t => (
                    <TripRow
                      key={t.id}
                      trip={t}
                      expanded={selectedId === t.id}
                      onToggle={() => setSelectedId(selectedId === t.id ? null : t.id)}
                      onChange={(patch) => updateTrip(t.id, patch)}
                      onDelete={() => removeTrip(t.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </MissionsShell>
  );
}

function TripRow({ trip, expanded, onToggle, onChange, onDelete }) {
  const meta = STATUS_META[trip.status || 'planning'] || STATUS_META.planning;
  const rosterCount = (trip.roster || []).length;
  return (
    <li className={`msf-row${expanded ? ' expanded' : ''}`} style={{ '--msf-card-accent': '#d9954a' }}>
      <button type="button" className="msf-row-summary" onClick={onToggle}>
        <span className="msf-row-icon">{meta.icon}</span>
        <span className="msf-row-main">
          <span className="msf-row-top">
            <span className="msf-row-title">{trip.destination || '(unnamed trip)'}</span>
            <span className="msf-badge" style={{ '--msf-badge-accent': '#d9954a' }}>{meta.label}</span>
          </span>
          <span className="msf-row-sub">
            {formatDates(trip.startDate, trip.endDate)}
            {trip.leaders && <> · Led by {trip.leaders}</>}
          </span>
        </span>
        <span className="msf-row-meta">{rosterCount} on roster</span>
        <span className="msf-row-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <TripEditor trip={trip} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

function TripEditor({ trip, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [newMember, setNewMember] = useState('');
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  const addMember = () => {
    const name = newMember.trim();
    if (!name) return;
    onChange({ roster: [...(trip.roster || []), name] });
    setNewMember('');
  };
  const removeMember = (idx) => {
    onChange({ roster: (trip.roster || []).filter((_, i) => i !== idx) });
  };

  return (
    <form className="ys-form msf-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 20 }}>{STATUS_META[trip.status || 'planning'].icon}</span>
          <input
            type="text"
            className="ys-inp msf-title-inp"
            value={trip.destination || ''}
            onChange={set('destination')}
            placeholder="Trip destination"
          />
        </div>
        <button
          type="button"
          className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete' : '🗑 Delete'}
        </button>
      </div>

      <Section title="Trip details">
        <Row>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={trip.startDate || ''} onChange={set('startDate')} />
          </Field>
          <Field label="End date">
            <input type="date" className="ys-inp" value={trip.endDate || ''} onChange={set('endDate')} />
          </Field>
          <Field label="Status">
            <select className="ys-inp" value={trip.status || 'planning'} onChange={set('status')}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Leaders">
            <input type="text" className="ys-inp" value={trip.leaders || ''} onChange={set('leaders')} placeholder="e.g. John & Sarah Smith" />
          </Field>
          <Field label="Budget">
            <input type="text" className="ys-inp" value={trip.budget || ''} onChange={set('budget')} placeholder="e.g. $1,800 / person" />
          </Field>
        </Row>
      </Section>

      <Section title={`Team roster (${(trip.roster || []).length})`}>
        <div className="msf-chips">
          {(trip.roster || []).map((name, idx) => (
            <span className="msf-chip" key={idx}>
              {name}
              <button type="button" className="msf-chip-remove" onClick={() => removeMember(idx)}>✕</button>
            </span>
          ))}
        </div>
        <div className="msf-chip-add">
          <input
            type="text"
            className="ys-inp"
            value={newMember}
            onChange={e => setNewMember(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }}
            placeholder="Add team member…"
          />
          <button type="button" className="app-btn" onClick={addMember}>+ Add</button>
        </div>
      </Section>

      <Section title="Itinerary">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          value={trip.itinerary || ''}
          onChange={set('itinerary')}
          placeholder="Day-by-day plan, flights, host contacts…"
        />
      </Section>

      <Section title="Packing list">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          value={trip.packingList || ''}
          onChange={set('packingList')}
          placeholder="What to bring, what's provided…"
        />
      </Section>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
