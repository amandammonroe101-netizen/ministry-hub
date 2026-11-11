import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Roster.css';

/* ─────────────────────────────────────────────────────────────
   Roster — worship/ministry team member manager
   Naming: .rs-*
   Persistence: localStorage key "band:roster"
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'band:roster';

const ROLES = [
  'Worship Leader',
  'Vocals',
  'Acoustic Guitar',
  'Electric Guitar',
  'Bass',
  'Keys / Piano',
  'Drums',
  'Percussion',
  'Sound Engineer',
  'Video / Projection',
  'Lighting',
  'Stage Manager',
  'Other',
];

const FILTER_PILLS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

function makeId() {
  return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRoster(members) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  } catch {
    /* ignore quota errors */
  }
}

function emptyMember() {
  return {
    id: makeId(),
    name: '',
    role: 'Vocals',
    email: '',
    phone: '',
    instruments: [],
    availability: '',
    notes: '',
    status: 'active',
    createdAt: Date.now(),
  };
}

/* ─── Sidebar member row ─────────────────────────────────────── */
function MemberRow({ member, active, onClick }) {
  return (
    <button
      className={`rs-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="rs-card-top">
        <span
          className={`rs-status-dot ${member.status === 'active' ? 'on' : 'off'}`}
          aria-label={member.status === 'active' ? 'Active' : 'Inactive'}
        />
        <span className="rs-card-name">{member.name || 'Unnamed'}</span>
      </div>
      {member.role && <div className="rs-card-role">{member.role}</div>}
      {Array.isArray(member.instruments) && member.instruments.length > 0 && (
        <div className="rs-card-chips">
          {member.instruments.slice(0, 4).map((inst, i) => (
            <span key={i} className="rs-card-chip">{inst}</span>
          ))}
          {member.instruments.length > 4 && (
            <span className="rs-card-chip rs-card-chip-more">
              +{member.instruments.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function Roster() {
  const [members, setMembers]       = useUserStoreKey('band:roster', []);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all');
  const [armedDelete, setArmedDelete] = useState(false);
  const [instrumentDraft, setInstrumentDraft] = useState('');

  const armTimerRef = useRef(null);

  /* Auto-disarm delete after 3s */
  useEffect(() => {
    if (!armedDelete) return;
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedDelete(false), 3000);
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [armedDelete]);

  /* Reset armed-delete + instrument draft whenever selection changes */
  useEffect(() => {
    setArmedDelete(false);
    setInstrumentDraft('');
  }, [selectedId]);

  /* ─── Derived: filtered + sorted member list ───────────────── */
  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(m => {
        if (filter === 'active'   && m.status !== 'active')   return false;
        if (filter === 'inactive' && m.status !== 'inactive') return false;
        if (!q) return true;
        return (
          (m.name || '').toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [members, query, filter]);

  const selected = useMemo(
    () => members.find(m => m.id === selectedId) || null,
    [members, selectedId]
  );

  /* ─── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setMembers(prev => prev.map(m => (m.id === selectedId ? { ...m, ...patch } : m)));
  }, [selectedId]);

  const handleNew = useCallback(() => {
    const m = emptyMember();
    setMembers(prev => [m, ...prev]);
    setSelectedId(m.id);
  }, []);

  const handleToggleStatus = useCallback(() => {
    if (!selected) return;
    updateSelected({ status: selected.status === 'active' ? 'inactive' : 'active' });
  }, [selected, updateSelected]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    setMembers(prev => prev.filter(m => m.id !== selected.id));
    setSelectedId(null);
    setArmedDelete(false);
  }, [selected, armedDelete]);

  const handleAddInstrument = useCallback(() => {
    const v = instrumentDraft.trim();
    if (!v || !selected) return;
    const existing = selected.instruments || [];
    if (existing.some(x => x.toLowerCase() === v.toLowerCase())) {
      setInstrumentDraft('');
      return;
    }
    updateSelected({ instruments: [...existing, v] });
    setInstrumentDraft('');
  }, [instrumentDraft, selected, updateSelected]);

  const handleRemoveInstrument = useCallback((inst) => {
    if (!selected) return;
    updateSelected({
      instruments: (selected.instruments || []).filter(x => x !== inst),
    });
  }, [selected, updateSelected]);

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <WorshipShell title="Roster" icon="👤" subtitle="Directory of every worship team member — role, contact, and availability.">
    <div className="rs-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="rs-sidebar">
        <div className="rs-sidebar-head">
          <span className="rs-sidebar-title">Roster</span>
          <button
            className="rs-new-btn"
            onClick={handleNew}
            title="Add a new team member"
          >
            + New
          </button>
        </div>

        <div className="rs-sidebar-controls">
          <input
            className="rs-inp"
            placeholder="Search name or role…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="rs-pills">
            {FILTER_PILLS.map(p => (
              <button
                key={p.key}
                className={`rs-pill${filter === p.key ? ' on' : ''}`}
                onClick={() => setFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rs-list">
          {filteredMembers.length === 0 && (
            <p className="rs-muted rs-list-empty">
              {members.length === 0
                ? 'No team members yet.'
                : 'No matches.'}
            </p>
          )}
          {filteredMembers.map(m => (
            <MemberRow
              key={m.id}
              member={m}
              active={selectedId === m.id}
              onClick={() => setSelectedId(m.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="rs-main">
        {!selected && members.length === 0 && (
          <div className="rs-empty">
            <div className="rs-empty-icon" aria-hidden="true">👥</div>
            <div className="rs-empty-title">Build your team roster</div>
            <div className="rs-empty-sub">
              Track worship band members, tech crew, and volunteers — their roles,
              instruments, contact info, and availability — all in one place.
            </div>
            <button className="rs-btn rs-btn-accent rs-empty-cta" onClick={handleNew}>
              + Add your first team member
            </button>
          </div>
        )}

        {!selected && members.length > 0 && (
          <div className="rs-empty">
            <div className="rs-empty-icon" aria-hidden="true">👥</div>
            <div className="rs-empty-title">No team member selected</div>
            <div className="rs-empty-sub">
              Pick someone from the sidebar or add a new member.
            </div>
          </div>
        )}

        {selected && (
          <div className="rs-detail">
            {/* Detail header */}
            <div className="rs-detail-head">
              <div className="rs-detail-head-info">
                <input
                  className="rs-name-inp"
                  placeholder="Member name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="rs-detail-meta">
                  <span
                    className={`rs-status-pill ${selected.status === 'active' ? 'on' : 'off'}`}
                  >
                    <span
                      className={`rs-status-dot ${selected.status === 'active' ? 'on' : 'off'}`}
                    />
                    {selected.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                  {selected.role && (
                    <span className="rs-chip rs-chip-role">{selected.role}</span>
                  )}
                </div>
              </div>
              <div className="rs-detail-actions">
                <button
                  className="rs-btn rs-btn-ghost"
                  onClick={handleToggleStatus}
                  title="Toggle active/inactive"
                >
                  {selected.status === 'active' ? 'Make Inactive' : 'Make Active'}
                </button>
                <button
                  className={`rs-btn${armedDelete ? ' rs-btn-danger-armed' : ' rs-btn-danger'}`}
                  onClick={handleDelete}
                  title={armedDelete ? 'Click again to confirm deletion' : 'Delete member'}
                >
                  {armedDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="rs-form">
              <div className="rs-row rs-row-2">
                <label className="rs-field">
                  <span className="rs-label">Role</span>
                  <select
                    className="rs-inp"
                    value={selected.role || ''}
                    onChange={e => updateSelected({ role: e.target.value })}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="rs-field">
                  <span className="rs-label">Status</span>
                  <select
                    className="rs-inp"
                    value={selected.status}
                    onChange={e => updateSelected({ status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>

              <div className="rs-row rs-row-2">
                <label className="rs-field">
                  <span className="rs-label">Email</span>
                  <input
                    className="rs-inp"
                    type="email"
                    placeholder="name@example.com"
                    value={selected.email}
                    onChange={e => updateSelected({ email: e.target.value })}
                  />
                </label>
                <label className="rs-field">
                  <span className="rs-label">Phone</span>
                  <input
                    className="rs-inp"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={selected.phone}
                    onChange={e => updateSelected({ phone: e.target.value })}
                  />
                </label>
              </div>

              <div className="rs-field">
                <span className="rs-label">Instruments</span>
                <div className="rs-chip-input">
                  <div className="rs-chip-list">
                    {(selected.instruments || []).map((inst, i) => (
                      <span key={i} className="rs-instr-chip">
                        {inst}
                        <button
                          type="button"
                          className="rs-instr-chip-x"
                          onClick={() => handleRemoveInstrument(inst)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="rs-chip-inp"
                      placeholder={
                        (selected.instruments || []).length === 0
                          ? 'Type and press Enter…'
                          : 'Add another…'
                      }
                      value={instrumentDraft}
                      onChange={e => setInstrumentDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddInstrument();
                        } else if (
                          e.key === 'Backspace' &&
                          instrumentDraft === '' &&
                          (selected.instruments || []).length > 0
                        ) {
                          e.preventDefault();
                          const last = selected.instruments[selected.instruments.length - 1];
                          handleRemoveInstrument(last);
                        }
                      }}
                      onBlur={handleAddInstrument}
                    />
                  </div>
                </div>
                <span className="rs-hint">
                  Type an instrument and press Enter. Click ✕ on a chip to remove.
                </span>
              </div>

              <label className="rs-field">
                <span className="rs-label">Availability</span>
                <input
                  className="rs-inp"
                  placeholder="e.g. Sundays only, not 1st of month"
                  value={selected.availability}
                  onChange={e => updateSelected({ availability: e.target.value })}
                />
              </label>

              <label className="rs-field">
                <span className="rs-label">Notes</span>
                <textarea
                  className="rs-inp rs-textarea"
                  placeholder="Anything worth remembering…"
                  rows={4}
                  value={selected.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                />
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
