import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Scheduling.css';

/* ─────────────────────────────────────────────────────────────
   Scheduling — assign roster team members to upcoming services
   Naming: .sc-*
   Persistence: localStorage key `band:schedule`
   Reads (read-only): localStorage key `band:roster`
   ───────────────────────────────────────────────────────────── */

const LS_SCHEDULE_KEY = 'band:schedule';
const LS_ROSTER_KEY   = 'band:roster';

/* Standard service roles (slot definitions). `match` is used to filter the
   roster down to eligible members when assigning. A member matches a slot
   when their `role` equals one of the matchers OR their `instruments` array
   contains one of the matchers (case-insensitive). */
const STANDARD_ROLES = [
  { id: 'worship-leader',  label: 'Worship Leader',  match: ['Worship Leader', 'Vocals', 'Vocal'] },
  { id: 'vocal-1',         label: 'Vocal 1',         match: ['Vocals', 'Vocal', 'Worship Leader'] },
  { id: 'vocal-2',         label: 'Vocal 2',         match: ['Vocals', 'Vocal', 'Worship Leader'] },
  { id: 'vocal-3',         label: 'Vocal 3',         match: ['Vocals', 'Vocal', 'Worship Leader'] },
  { id: 'acoustic-guitar', label: 'Acoustic Guitar', match: ['Acoustic Guitar', 'Guitar'] },
  { id: 'electric-guitar', label: 'Electric Guitar', match: ['Electric Guitar', 'Guitar'] },
  { id: 'bass',            label: 'Bass',            match: ['Bass', 'Bass Guitar'] },
  { id: 'keys',            label: 'Keys / Piano',    match: ['Keys', 'Piano', 'Keys / Piano', 'Keyboard'] },
  { id: 'drums',           label: 'Drums',           match: ['Drums', 'Drummer', 'Percussion'] },
  { id: 'sound',           label: 'Sound',           match: ['Sound', 'Audio', 'FOH'] },
  { id: 'video',           label: 'Video',           match: ['Video', 'Camera', 'Stream'] },
  { id: 'lights',          label: 'Lights',          match: ['Lights', 'Lighting'] },
];

const TOTAL_SLOTS = STANDARD_ROLES.length;

/* ─── Helpers ────────────────────────────────────────────────── */

function uid() {
  return `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function monthGroupKey(dateStr) {
  if (!dateStr) return 'No date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function loadSchedule() {
  try {
    const raw = localStorage.getItem(LS_SCHEDULE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSchedule(services) {
  try {
    localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(services));
  } catch (err) {
    console.warn('Failed to save schedule to localStorage', err);
  }
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(LS_ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countFilled(assignments) {
  if (!assignments) return 0;
  return STANDARD_ROLES.reduce((acc, r) => acc + (assignments[r.label] ? 1 : 0), 0);
}

function fillColor(filled, total) {
  if (filled === 0)      return '#ef4444';
  if (filled >= total)   return '#34d399';
  return '#fbbf24';
}

function memberMatchesRole(member, role) {
  if (!member || !role) return false;
  const matchers = role.match.map(m => m.toLowerCase());
  const memberRole = (member.role || '').toLowerCase();
  if (memberRole && matchers.includes(memberRole)) return true;
  const instruments = Array.isArray(member.instruments) ? member.instruments : [];
  for (const inst of instruments) {
    if (matchers.includes((inst || '').toLowerCase())) return true;
  }
  return false;
}

/* ─── New Service Form ───────────────────────────────────────── */
function NewServiceForm({ onCreate, onCancel }) {
  const [name, setName]           = useState('Sunday Morning');
  const [date, setDate]           = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [error, setError]         = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!date)        { setError('Date is required.'); return; }
    onCreate({
      id:          uid(),
      name:        name.trim(),
      date,
      startTime:   startTime || '10:00',
      notes:       '',
      assignments: {},
      createdAt:   Date.now(),
    });
  }

  return (
    <form className="sc-new-form" onSubmit={handleSubmit}>
      {error && <p className="sc-error">{error}</p>}
      <input
        className="sc-inp"
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        autoFocus
      />
      <input
        className="sc-inp"
        placeholder="Service name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        className="sc-inp"
        type="time"
        value={startTime}
        onChange={e => setStartTime(e.target.value)}
      />
      <div className="sc-new-form-btns">
        <button type="submit" className="sc-btn sc-btn-accent">Create</button>
        <button type="button" className="sc-btn sc-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ─── Sidebar Service Card ───────────────────────────────────── */
function ServiceCard({ service, active, onClick }) {
  const filled = countFilled(service.assignments);
  const color  = fillColor(filled, TOTAL_SLOTS);
  return (
    <button
      className={`sc-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="sc-card-date-row">
        <span className="sc-card-date">{formatDateShort(service.date) || '— No date'}</span>
        <span
          className="sc-card-time"
          title="Start time"
        >{service.startTime || ''}</span>
      </div>
      <div className="sc-card-name">{service.name}</div>
      <div
        className="sc-card-fill"
        style={{ '--fill-color': color }}
        title={`${filled} of ${TOTAL_SLOTS} roles filled`}
      >
        <span className="sc-card-fill-dot" />
        <span className="sc-card-fill-text">{filled}/{TOTAL_SLOTS} filled</span>
      </div>
    </button>
  );
}

/* ─── Member Picker Modal ────────────────────────────────────── */
function MemberPicker({ role, roster, onPick, onClose }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery]     = useState('');

  const matching = useMemo(() => roster.filter(m => memberMatchesRole(m, role)), [roster, role]);
  const list     = showAll ? roster : matching;

  const filtered = list.filter(m => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (m.name || '').toLowerCase().includes(q)
        || (m.role || '').toLowerCase().includes(q)
        || (Array.isArray(m.instruments) ? m.instruments.join(' ').toLowerCase() : '').includes(q);
  });

  return (
    <div className="sc-picker-overlay" onClick={onClose}>
      <div className="sc-picker" onClick={e => e.stopPropagation()}>
        <div className="sc-picker-head">
          <div className="sc-picker-head-text">
            <span className="sc-picker-title">Assign {role.label}</span>
            <span className="sc-picker-sub">
              {matching.length} eligible {matching.length === 1 ? 'member' : 'members'} in roster
            </span>
          </div>
          <button className="sc-picker-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="sc-picker-controls">
          <input
            className="sc-picker-search"
            placeholder="Search members…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <label className="sc-picker-toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
            />
            <span>Show all members</span>
          </label>
        </div>

        <div className="sc-picker-list">
          {roster.length === 0 && (
            <div className="sc-picker-empty sc-muted">
              No team members in your roster yet.
              Add team members in the Roster tab first.
            </div>
          )}
          {roster.length > 0 && filtered.length === 0 && (
            <div className="sc-picker-empty sc-muted">
              {showAll
                ? 'No members match your search.'
                : `No eligible members for ${role.label}. Toggle "Show all members" to see everyone.`}
            </div>
          )}
          {filtered.map(m => {
            const eligible = memberMatchesRole(m, role);
            return (
              <button
                key={m.id || m.name}
                className={`sc-picker-row${!eligible ? ' off-role' : ''}`}
                onClick={() => onPick(m)}
              >
                <div className="sc-picker-row-main">
                  <span className="sc-picker-row-name">{m.name || 'Unnamed'}</span>
                  {m.role && (
                    <span className="sc-picker-row-role">{m.role}</span>
                  )}
                </div>
                {Array.isArray(m.instruments) && m.instruments.length > 0 && (
                  <div className="sc-picker-row-instruments">
                    {m.instruments.map(i => (
                      <span key={i} className="sc-picker-chip">{i}</span>
                    ))}
                  </div>
                )}
                {!eligible && (
                  <span className="sc-picker-off-tag">off-role</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Scheduling() {
  const [services, setServices]   = useUserStoreKey('band:schedule', []);
  const [roster]                  = useUserStoreKey('band:roster',   []);
  const [searchParams, setSearchParams] = useSearchParams();
  /* Deep-link: ?id=<serviceId> auto-selects that service on mount. */
  const [selectedId, setSelectedId] = useState(() => {
    const fromUrl = searchParams.get('id');
    const parsed = fromUrl ? (Number.isNaN(Number(fromUrl)) ? fromUrl : Number(fromUrl)) : null;
    return parsed;
  });

  useEffect(() => {
    const fromUrl = searchParams.get('id');
    if (fromUrl) {
      const parsed = Number.isNaN(Number(fromUrl)) ? fromUrl : Number(fromUrl);
      setSelectedId(parsed);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showNew, setShowNew]     = useState(false);
  const [pickerRole, setPickerRole] = useState(null);   // role object when picker open
  const [armedDelete, setArmedDelete] = useState(false);

  /* Inline editing of header fields */
  const [editingName, setEditingName]   = useState(false);
  const [nameVal, setNameVal]           = useState('');
  const previousIdRef = useRef(null);

  /* (No persist/listener useEffects — useUserStoreKey autosaves and
     onSnapshot streams in roster edits from the Roster page in real time.) */

  /* ── Sorted + grouped services ─────────────────────────────── */
  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => {
      const ad = a.date || '';
      const bd = b.date || '';
      if (ad === bd) return (a.createdAt || 0) - (b.createdAt || 0);
      // Empty dates go last
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    });
  }, [services]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const s of sortedServices) {
      const key = monthGroupKey(s.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return Array.from(groups.entries()); // [ [groupName, [services]], ... ]
  }, [sortedServices]);

  /* ── Derived selected service ──────────────────────────────── */
  const selected = useMemo(
    () => services.find(s => s.id === selectedId) || null,
    [services, selectedId]
  );

  /* ── Reset transient state when selection changes ─────────── */
  useEffect(() => {
    if (previousIdRef.current !== selectedId) {
      previousIdRef.current = selectedId;
      setArmedDelete(false);
      setEditingName(false);
      setNameVal(selected?.name || '');
    }
  }, [selectedId, selected]);

  /* ── Member lookup ─────────────────────────────────────────── */
  const memberById = useMemo(() => {
    const map = new Map();
    for (const m of roster) {
      if (m && m.id != null) map.set(m.id, m);
    }
    return map;
  }, [roster]);

  /* ── Handlers ──────────────────────────────────────────────── */
  const handleCreate = useCallback((svc) => {
    setServices(prev => [...prev, svc]);
    setSelectedId(svc.id);
    setShowNew(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setServices(prev => prev.filter(s => s.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const updateSelected = useCallback((updater) => {
    if (!selected) return;
    setServices(prev => prev.map(s => s.id === selected.id ? updater(s) : s));
  }, [selected]);

  const handleAssign = useCallback((roleLabel, member) => {
    updateSelected(s => ({
      ...s,
      assignments: { ...(s.assignments || {}), [roleLabel]: member.id },
    }));
    setPickerRole(null);
  }, [updateSelected]);

  const handleUnassign = useCallback((roleLabel) => {
    updateSelected(s => {
      const next = { ...(s.assignments || {}) };
      delete next[roleLabel];
      return { ...s, assignments: next };
    });
  }, [updateSelected]);

  const handleCopyFromLast = useCallback(() => {
    if (!selected) return;
    // Find the most recent service (by date, then createdAt) that is *not* this one
    // and that has at least one assignment.
    const candidates = sortedServices.filter(
      s => s.id !== selected.id && Object.keys(s.assignments || {}).length > 0
    );
    if (candidates.length === 0) return;
    // Prefer the most recent service prior to this one's date
    const targetDate = selected.date || '';
    let prev = null;
    for (const s of candidates) {
      const sd = s.date || '';
      if (sd && targetDate && sd < targetDate) {
        if (!prev || (prev.date || '') < sd) prev = s;
      }
    }
    // Fall back to most recent regardless of date
    if (!prev) {
      prev = candidates.reduce((acc, s) =>
        (!acc || (s.date || '') > (acc.date || '')) ? s : acc, null);
    }
    if (!prev) return;
    updateSelected(s => ({ ...s, assignments: { ...prev.assignments } }));
  }, [selected, sortedServices, updateSelected]);

  const commitName = useCallback(() => {
    setEditingName(false);
    if (!selected) return;
    const trimmed = (nameVal || '').trim();
    if (!trimmed || trimmed === selected.name) {
      setNameVal(selected.name || '');
      return;
    }
    updateSelected(s => ({ ...s, name: trimmed }));
  }, [selected, nameVal, updateSelected]);

  const handleDateChange = useCallback((newDate) => {
    updateSelected(s => ({ ...s, date: newDate }));
  }, [updateSelected]);

  const handleTimeChange = useCallback((newTime) => {
    updateSelected(s => ({ ...s, startTime: newTime }));
  }, [updateSelected]);

  /* ── Derived for header ────────────────────────────────────── */
  const filledCount = selected ? countFilled(selected.assignments) : 0;
  const fillTone    = selected ? fillColor(filledCount, TOTAL_SLOTS) : '#ef4444';
  const canCopy     = !!selected && services.some(
    s => s.id !== selected.id && Object.keys(s.assignments || {}).length > 0
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell title="Scheduling" icon="📆" subtitle="Per-service schedule for the band and tech team — fills, swaps, and sub requests.">
    <div className="sc-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="sc-sidebar">
        <div className="sc-sidebar-head">
          <span className="sc-sidebar-title">Schedule</span>
          {!showNew && (
            <button
              className="sc-new-btn"
              onClick={() => setShowNew(true)}
              title="New service"
            >
              + New Service
            </button>
          )}
        </div>

        {showNew && (
          <NewServiceForm
            onCreate={handleCreate}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="sc-list">
          {sortedServices.length === 0 && !showNew && (
            <p className="sc-muted sc-list-empty">
              No services yet. Create one above to begin scheduling.
            </p>
          )}
          {grouped.map(([groupName, groupServices]) => (
            <div key={groupName} className="sc-group">
              <div className="sc-group-head">{groupName}</div>
              {groupServices.map(svc => (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  active={selectedId === svc.id}
                  onClick={() => setSelectedId(svc.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="sc-main">
        {!selected && (
          <div className="sc-empty">
            <div className="sc-empty-icon">📆</div>
            <div className="sc-empty-title">No service selected</div>
            <div className="sc-empty-sub">
              Pick a service from the sidebar, or create a new one to begin
              assigning team members to roles.
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* ── Header ── */}
            <div className="sc-detail-head">
              <div className="sc-detail-head-left">
                {editingName ? (
                  <input
                    className="sc-detail-name-inp"
                    value={nameVal}
                    onChange={e => setNameVal(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') {
                        setNameVal(selected.name || '');
                        setEditingName(false);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <h1
                    className="sc-detail-name"
                    onClick={() => { setNameVal(selected.name || ''); setEditingName(true); }}
                    title="Click to rename"
                  >
                    {selected.name}
                    <span className="sc-edit-hint">✏</span>
                  </h1>
                )}

                <div className="sc-detail-meta">
                  <label className="sc-meta-field">
                    <span className="sc-meta-label">Date</span>
                    <input
                      className="sc-meta-inp"
                      type="date"
                      value={selected.date || ''}
                      onChange={e => handleDateChange(e.target.value)}
                    />
                  </label>
                  <label className="sc-meta-field">
                    <span className="sc-meta-label">Start</span>
                    <input
                      className="sc-meta-inp"
                      type="time"
                      value={selected.startTime || '10:00'}
                      onChange={e => handleTimeChange(e.target.value)}
                    />
                  </label>
                  <div
                    className="sc-fill-pill"
                    style={{ '--fill-color': fillTone }}
                  >
                    <span className="sc-fill-dot" />
                    <span>{filledCount}/{TOTAL_SLOTS} roles filled</span>
                  </div>
                </div>

                {selected.date && (
                  <div className="sc-detail-date-long">
                    {formatDate(selected.date)}
                  </div>
                )}
              </div>

              <div className="sc-detail-actions">
                <button
                  className="sc-btn sc-btn-ghost"
                  onClick={handleCopyFromLast}
                  disabled={!canCopy}
                  title={canCopy ? 'Duplicate the previous service\'s assignments to this one' : 'No other service to copy from yet'}
                >
                  Copy from last service
                </button>
                <button
                  className={`sc-btn${armedDelete ? ' sc-btn-danger-armed' : ' sc-btn-danger'}`}
                  onClick={handleDelete}
                  onBlur={() => setArmedDelete(false)}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete service'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Roster-empty banner */}
            {roster.length === 0 && (
              <div className="sc-banner-info">
                <span className="sc-banner-icon">ℹ</span>
                Add team members in the Roster tab first to start assigning roles.
              </div>
            )}

            {/* ── Role assignment grid ── */}
            <div className="sc-roles">
              {STANDARD_ROLES.map(role => {
                const memberId = selected.assignments?.[role.label];
                const member   = memberId ? memberById.get(memberId) : null;
                const missing  = memberId && !member;  // member was deleted from roster
                return (
                  <div className="sc-role-row" key={role.id}>
                    <div className="sc-role-label">{role.label}</div>
                    {member ? (
                      <div className="sc-role-assigned">
                        <button
                          className="sc-role-member"
                          onClick={() => setPickerRole(role)}
                          title="Click to change assignment"
                        >
                          <span className="sc-role-avatar">
                            {(member.name || '?').trim().charAt(0).toUpperCase() || '?'}
                          </span>
                          <span className="sc-role-member-info">
                            <span className="sc-role-member-name">{member.name || 'Unnamed'}</span>
                            {member.role && member.role !== role.label && (
                              <span className="sc-role-member-sub">{member.role}</span>
                            )}
                          </span>
                        </button>
                        <button
                          className="sc-role-unassign"
                          onClick={() => handleUnassign(role.label)}
                          title="Unassign"
                        >✕</button>
                      </div>
                    ) : missing ? (
                      <div className="sc-role-assigned">
                        <button
                          className="sc-role-member sc-role-member-missing"
                          onClick={() => setPickerRole(role)}
                          title="The previously assigned member is no longer in your roster"
                        >
                          <span className="sc-role-avatar sc-role-avatar-missing">?</span>
                          <span className="sc-role-member-info">
                            <span className="sc-role-member-name">Removed from roster</span>
                            <span className="sc-role-member-sub">Click to re-assign</span>
                          </span>
                        </button>
                        <button
                          className="sc-role-unassign"
                          onClick={() => handleUnassign(role.label)}
                          title="Clear"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        className="sc-role-assign"
                        onClick={() => setPickerRole(role)}
                        disabled={roster.length === 0}
                        title={roster.length === 0 ? 'Add roster members first' : `Assign someone to ${role.label}`}
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* ── Member Picker Modal ── */}
      {pickerRole && selected && (
        <MemberPicker
          role={pickerRole}
          roster={roster}
          onPick={(m) => handleAssign(pickerRole.label, m)}
          onClose={() => setPickerRole(null)}
        />
      )}
    </div>
    </WorshipShell>
  );
}
