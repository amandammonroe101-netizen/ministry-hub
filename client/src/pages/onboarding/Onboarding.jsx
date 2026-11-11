import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey, getValue, setValue } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import './Onboarding.css';

/* ─────────────────────────────────────────────────────────────
   Onboarding — new team member onboarding tracker
   Naming: .ob-*
   Persistence: localStorage key "band:onboarding"
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'band:onboarding';
const ROSTER_KEY  = 'band:roster';

/* Roles match Roster page */
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

const DEFAULT_STEP_TEMPLATES = [
  { label: 'Profile / contact info collected' },
  { label: 'Intro meeting with worship pastor' },
  { label: 'Statement of faith reviewed' },
  { label: 'Background check (if required)' },
  { label: 'Skill audition / observation' },
  { label: 'Position confirmed' },
  { label: 'Training videos watched (rehearsal etiquette, in-ear monitor use, etc.)' },
  { label: 'Equipment checkout (in-ears, music binder, etc.)' },
  { label: 'First rehearsal attended' },
  { label: 'First service played' },
  { label: '30-day check-in' },
];

/* ─── Helpers ────────────────────────────────────────────────── */
function makeId(prefix = 'p') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(people) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
  } catch {
    /* ignore quota errors */
  }
}

function makeDefaultSteps() {
  return DEFAULT_STEP_TEMPLATES.map(t => ({
    id: makeId('s'),
    label: t.label,
    done: false,
    doneAt: null,
    notes: '',
  }));
}

function makePerson({ name, role, startDate, email, phone }) {
  return {
    id: makeId('person'),
    name: (name || '').trim() || 'New Person',
    role: role || ROLES[0],
    startDate: startDate || '',
    email: (email || '').trim(),
    phone: (phone || '').trim(),
    steps: makeDefaultSteps(),
    notes: '',
    status: 'in-progress',
    createdAt: Date.now(),
  };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatDoneAt(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
  } catch {
    return null;
  }
}

function joinedLabel(dateStr) {
  const days = daysSince(dateStr);
  if (days == null) return '';
  if (days === 0)   return 'Joined today';
  if (days === 1)   return 'Joined 1 day ago';
  if (days < 0)     return `Joining in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  return `Joined ${days} days ago`;
}

/* Determine status from step completion */
function deriveStatus(person) {
  const steps = person.steps || [];
  if (steps.length > 0 && steps.every(s => s.done)) return 'completed';
  return 'in-progress';
}

/* ─── New Person Form ────────────────────────────────────────── */
function NewPersonForm({ onSave, onCancel }) {
  const [name, setName]           = useState('');
  const [role, setRole]           = useState(ROLES[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [error, setError]         = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    onSave({ name: name.trim(), role, startDate, email: email.trim(), phone: phone.trim() });
  }

  return (
    <form className="ob-new-form" onSubmit={handleSubmit}>
      {error && <p className="ob-error">{error}</p>}
      <input
        className="ob-inp"
        placeholder="Name *"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <select
        className="ob-inp"
        value={role}
        onChange={e => setRole(e.target.value)}
      >
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <input
        className="ob-inp"
        type="date"
        value={startDate}
        onChange={e => setStartDate(e.target.value)}
      />
      <input
        className="ob-inp"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        className="ob-inp"
        type="tel"
        placeholder="Phone"
        value={phone}
        onChange={e => setPhone(e.target.value)}
      />
      <div className="ob-new-form-btns">
        <button type="submit" className="ob-btn ob-btn-accent">
          Create
        </button>
        <button type="button" className="ob-btn ob-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Sidebar Person Card ────────────────────────────────────── */
function PersonCard({ person, active, onClick }) {
  const total = (person.steps || []).length;
  const done  = (person.steps || []).filter(s => s.done).length;
  const pct   = total ? (done / total) * 100 : 0;
  const isCompleted = person.status === 'completed';

  return (
    <button
      className={`ob-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="ob-card-top">
        <span className="ob-card-name">{person.name || 'Unnamed'}</span>
        <span className={`ob-pill ${isCompleted ? 'done' : 'inprog'}`}>
          {isCompleted ? 'Completed' : 'In Progress'}
        </span>
      </div>
      {person.role && <div className="ob-card-role">{person.role}</div>}
      <div className="ob-card-bar">
        <div className="ob-card-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="ob-card-count">{done} / {total} steps</div>
    </button>
  );
}

/* ─── Step Row (drag-to-reorder, expand for notes) ───────────── */
function StepRow({
  step,
  index,
  expanded,
  dragOver,
  armedRemove,
  onToggle,
  onLabelChange,
  onNotesChange,
  onExpand,
  onArmRemove,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  return (
    <div
      className={`ob-step${step.done ? ' done' : ''}${dragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <span className="ob-step-handle" title="Drag to reorder">⠿</span>

      <button
        className={`ob-step-check${step.done ? ' on' : ''}`}
        onClick={onToggle}
        title={step.done ? 'Mark not done' : 'Mark done'}
        aria-label={step.done ? 'Mark not done' : 'Mark done'}
      >
        {step.done && '✓'}
      </button>

      <div className="ob-step-main">
        <input
          className="ob-step-label"
          value={step.label}
          onChange={e => onLabelChange(e.target.value)}
          placeholder="Step label…"
        />
        {step.done && step.doneAt && (
          <span className="ob-step-doneat">✓ Completed {formatDoneAt(step.doneAt)}</span>
        )}
      </div>

      <button
        className={`ob-step-expand${expanded ? ' on' : ''}`}
        onClick={onExpand}
        title={expanded ? 'Hide notes' : 'Show notes'}
        aria-label="Toggle notes"
      >
        {expanded ? '▾' : '▸'}
      </button>

      <button
        className={`ob-step-remove${armedRemove ? ' armed' : ''}`}
        onClick={onRemove}
        onBlur={() => armedRemove && onArmRemove(false)}
        title={armedRemove ? 'Click again to confirm' : 'Remove step'}
        aria-label="Remove step"
      >
        {armedRemove ? '!' : '✕'}
      </button>

      {expanded && (
        <div className="ob-step-notes-wrap">
          <textarea
            className="ob-step-notes"
            placeholder="Notes for this step…"
            rows={2}
            value={step.notes || ''}
            onChange={e => onNotesChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Onboarding() {
  const { user } = useAuth();
  const [people, setPeople]         = useUserStoreKey('band:onboarding', []);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew]       = useState(false);
  const [expandedSteps, setExpandedSteps]   = useState({});  // stepId -> bool
  const [armedRemoveSteps, setArmedRemoveSteps] = useState({}); // stepId -> bool
  const [armedDeletePerson, setArmedDeletePerson]   = useState(false);
  const [armedComplete, setArmedComplete] = useState(false);
  const [newStepDraft, setNewStepDraft] = useState('');
  const [showAddStep, setShowAddStep]   = useState(false);

  /* Drag state for step reorder */
  const dragIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  /* Timers for armed states */
  const armDelTimer  = useRef(null);
  const armCompTimer = useRef(null);

  /* (useUserStoreKey autosaves — no separate persist effect needed.) */

  /* ── Reset armed states when selection changes ────────────── */
  useEffect(() => {
    setArmedDeletePerson(false);
    setArmedComplete(false);
    setArmedRemoveSteps({});
    setExpandedSteps({});
    setShowAddStep(false);
    setNewStepDraft('');
  }, [selectedId]);

  /* ── Auto-disarm timers ───────────────────────────────────── */
  useEffect(() => {
    if (!armedDeletePerson) return;
    if (armDelTimer.current) clearTimeout(armDelTimer.current);
    armDelTimer.current = setTimeout(() => setArmedDeletePerson(false), 3000);
    return () => { if (armDelTimer.current) clearTimeout(armDelTimer.current); };
  }, [armedDeletePerson]);

  useEffect(() => {
    if (!armedComplete) return;
    if (armCompTimer.current) clearTimeout(armCompTimer.current);
    armCompTimer.current = setTimeout(() => setArmedComplete(false), 3000);
    return () => { if (armCompTimer.current) clearTimeout(armCompTimer.current); };
  }, [armedComplete]);

  /* ── Derived: sorted people list ──────────────────────────── */
  const sortedPeople = useMemo(() => {
    // Sort by startDate DESC; people without startDate fall back to createdAt
    return [...people].sort((a, b) => {
      const aKey = a.startDate || (a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '');
      const bKey = b.startDate || (b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : '');
      return bKey.localeCompare(aKey);
    });
  }, [people]);

  const selected = useMemo(
    () => people.find(p => p.id === selectedId) || null,
    [people, selectedId]
  );

  /* ── Mutators ─────────────────────────────────────────────── */
  const updateSelected = useCallback((patch) => {
    if (!selectedId) return;
    setPeople(prev => prev.map(p => (p.id === selectedId ? { ...p, ...patch } : p)));
  }, [selectedId]);

  // Wrapper that also re-derives status whenever steps change
  const updateSelectedWithStatus = useCallback((updater) => {
    if (!selectedId) return;
    setPeople(prev => prev.map(p => {
      if (p.id !== selectedId) return p;
      const next = typeof updater === 'function' ? updater(p) : { ...p, ...updater };
      // Auto-derive status from step completion
      next.status = deriveStatus(next);
      return next;
    }));
  }, [selectedId]);

  const handleCreatePerson = useCallback((draft) => {
    const person = makePerson(draft);
    setPeople(prev => [person, ...prev]);
    setSelectedId(person.id);
    setShowNew(false);
  }, []);

  const handleToggleStep = useCallback((stepId) => {
    updateSelectedWithStatus(person => {
      const steps = (person.steps || []).map(s => {
        if (s.id !== stepId) return s;
        const nowDone = !s.done;
        return {
          ...s,
          done: nowDone,
          doneAt: nowDone ? Date.now() : null,
        };
      });
      return { ...person, steps };
    });
  }, [updateSelectedWithStatus]);

  const handleStepLabel = useCallback((stepId, label) => {
    updateSelectedWithStatus(person => ({
      ...person,
      steps: (person.steps || []).map(s => s.id === stepId ? { ...s, label } : s),
    }));
  }, [updateSelectedWithStatus]);

  const handleStepNotes = useCallback((stepId, notes) => {
    updateSelectedWithStatus(person => ({
      ...person,
      steps: (person.steps || []).map(s => s.id === stepId ? { ...s, notes } : s),
    }));
  }, [updateSelectedWithStatus]);

  const handleExpandStep = useCallback((stepId) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  }, []);

  const handleRemoveStep = useCallback((stepId) => {
    setArmedRemoveSteps(prev => {
      if (prev[stepId]) {
        // armed — actually remove it
        updateSelectedWithStatus(person => ({
          ...person,
          steps: (person.steps || []).filter(s => s.id !== stepId),
        }));
        const next = { ...prev };
        delete next[stepId];
        return next;
      }
      // not yet armed — arm it
      return { ...prev, [stepId]: true };
    });
  }, [updateSelectedWithStatus]);

  const handleArmRemoveStep = useCallback((stepId, armed) => {
    setArmedRemoveSteps(prev => {
      const next = { ...prev };
      if (armed) next[stepId] = true;
      else delete next[stepId];
      return next;
    });
  }, []);

  const handleAddCustomStep = useCallback(() => {
    const label = newStepDraft.trim();
    if (!label) return;
    updateSelectedWithStatus(person => ({
      ...person,
      steps: [
        ...(person.steps || []),
        { id: makeId('s'), label, done: false, doneAt: null, notes: '' },
      ],
    }));
    setNewStepDraft('');
    setShowAddStep(false);
  }, [newStepDraft, updateSelectedWithStatus]);

  /* ── Drag handlers ───────────────────────────────────────── */
  const handleDragStart = useCallback((e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    setDragOver(null);
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    if (fromIndex == null || fromIndex === dropIndex || !selected) return;

    updateSelectedWithStatus(person => {
      const steps = [...(person.steps || [])];
      const [moved] = steps.splice(fromIndex, 1);
      steps.splice(dropIndex, 0, moved);
      return { ...person, steps };
    });
  }, [selected, updateSelectedWithStatus]);

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    setDragOver(null);
  }, []);

  /* ── Mark as completed / delete person ───────────────────── */
  const handleMarkCompleted = useCallback(async () => {
    if (!selected) return;
    const total = (selected.steps || []).length;
    const done  = (selected.steps || []).filter(s => s.done).length;
    const allDone = total > 0 && done === total;

    if (selected.status === 'completed') {
      // Flip back to in-progress
      updateSelected({ status: 'in-progress' });
      return;
    }

    if (!allDone && !armedComplete) {
      setArmedComplete(true);
      return;
    }

    // Mark all steps done as a side-effect of completion, or just flip status?
    // Spec: only enabled when all done, OR with confirmation if not.
    // We'll just flip status without auto-checking steps, but note the auto-progression
    // already handles all-done → completed automatically.
    updateSelected({ status: 'completed' });
    setArmedComplete(false);

    // Optional: offer to copy to Roster (writes the user's own band:roster doc)
    try {
      const should = window.confirm('Add this person to the Roster as an active team member?');
      if (should && user?.uid) {
        const existing = (await getValue(user.uid, 'band:roster')) || [];
        const list = Array.isArray(existing) ? existing : [];
        const newMember = {
          id: 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
          name: selected.name,
          role: selected.role || 'Vocals',
          email: selected.email || '',
          phone: selected.phone || '',
          instruments: [],
          availability: '',
          notes: selected.notes || '',
          status: 'active',
          createdAt: Date.now(),
        };
        await setValue(user.uid, 'band:roster', [newMember, ...list]);
      }
    } catch {
      /* ignore roster copy errors */
    }
  }, [selected, armedComplete, updateSelected, user]);

  const handleDeletePerson = useCallback(() => {
    if (!selected) return;
    if (!armedDeletePerson) {
      setArmedDeletePerson(true);
      return;
    }
    setPeople(prev => prev.filter(p => p.id !== selected.id));
    setSelectedId(null);
    setArmedDeletePerson(false);
  }, [selected, armedDeletePerson]);

  /* ── Derived for selected ────────────────────────────────── */
  const total = (selected?.steps || []).length;
  const done  = (selected?.steps || []).filter(s => s.done).length;
  const pct   = total ? (done / total) * 100 : 0;
  const allDone = total > 0 && done === total;

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell title="Onboarding" icon="📝" subtitle="Onboarding checklist for new worship team members.">
    <div className="ob-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Sidebar ── */}
      <aside className="ob-sidebar">
        <div className="ob-sidebar-head">
          <span className="ob-sidebar-title">Onboarding</span>
          {!showNew && (
            <button
              className="ob-new-btn"
              onClick={() => setShowNew(true)}
              title="Onboard a new person"
            >
              + New Person
            </button>
          )}
        </div>

        {showNew && (
          <NewPersonForm
            onSave={handleCreatePerson}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="ob-list">
          {sortedPeople.length === 0 && !showNew && (
            <p className="ob-muted ob-list-empty">
              No one being onboarded yet.
            </p>
          )}
          {sortedPeople.map(p => (
            <PersonCard
              key={p.id}
              person={p}
              active={selectedId === p.id}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="ob-main">
        {!selected && (
          <div className="ob-empty">
            <div className="ob-empty-icon" aria-hidden="true">📝</div>
            <div className="ob-empty-title">No one selected</div>
            <div className="ob-empty-sub">
              Pick a person from the sidebar or add a new one to start their
              onboarding checklist.
            </div>
          </div>
        )}

        {selected && (
          <div className="ob-detail">
            {/* Detail header */}
            <div className="ob-detail-head">
              <div className="ob-detail-head-info">
                <input
                  className="ob-name-inp"
                  placeholder="Name"
                  value={selected.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
                <div className="ob-detail-meta">
                  <span className={`ob-pill ${selected.status === 'completed' ? 'done' : 'inprog'}`}>
                    {selected.status === 'completed' ? 'Completed' : 'In Progress'}
                  </span>
                  {selected.role && (
                    <span className="ob-chip ob-chip-role">{selected.role}</span>
                  )}
                  {selected.startDate && (
                    <span className="ob-chip ob-chip-date">
                      {formatDate(selected.startDate)}
                    </span>
                  )}
                  {selected.startDate && (
                    <span className="ob-chip ob-chip-since">
                      {joinedLabel(selected.startDate)}
                    </span>
                  )}
                </div>
              </div>
              <div className="ob-detail-actions">
                <button
                  className={`ob-btn ${
                    selected.status === 'completed'
                      ? 'ob-btn-ghost'
                      : armedComplete
                        ? 'ob-btn-accent-armed'
                        : 'ob-btn-accent'
                  }`}
                  onClick={handleMarkCompleted}
                  onBlur={() => setArmedComplete(false)}
                  title={
                    selected.status === 'completed'
                      ? 'Reopen onboarding'
                      : !allDone && armedComplete
                        ? 'Click again to confirm — not all steps done'
                        : 'Mark as completed'
                  }
                >
                  {selected.status === 'completed'
                    ? 'Reopen'
                    : armedComplete
                      ? 'Confirm Complete'
                      : 'Mark as Completed'}
                </button>
                <button
                  className={`ob-btn${armedDeletePerson ? ' ob-btn-danger-armed' : ' ob-btn-danger'}`}
                  onClick={handleDeletePerson}
                  title={armedDeletePerson ? 'Click again to confirm deletion' : 'Delete person'}
                >
                  {armedDeletePerson ? 'Confirm Delete' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Editable person fields */}
            <div className="ob-fields">
              <div className="ob-fields-row">
                <label className="ob-field">
                  <span className="ob-label">Role</span>
                  <select
                    className="ob-inp"
                    value={selected.role || ''}
                    onChange={e => updateSelected({ role: e.target.value })}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="ob-field">
                  <span className="ob-label">Start date</span>
                  <input
                    className="ob-inp"
                    type="date"
                    value={selected.startDate || ''}
                    onChange={e => updateSelected({ startDate: e.target.value })}
                  />
                </label>
              </div>
              <div className="ob-fields-row">
                <label className="ob-field">
                  <span className="ob-label">Email</span>
                  <input
                    className="ob-inp"
                    type="email"
                    placeholder="name@example.com"
                    value={selected.email || ''}
                    onChange={e => updateSelected({ email: e.target.value })}
                  />
                </label>
                <label className="ob-field">
                  <span className="ob-label">Phone</span>
                  <input
                    className="ob-inp"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={selected.phone || ''}
                    onChange={e => updateSelected({ phone: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Progress bar */}
            <div className="ob-progress">
              <div className="ob-progress-info">
                <span className="ob-progress-label">Onboarding progress</span>
                <span className="ob-progress-count">
                  {done} / {total} step{total === 1 ? '' : 's'} ({Math.round(pct)}%)
                </span>
              </div>
              <div className="ob-progress-bar">
                <div
                  className="ob-progress-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Checklist */}
            <div className="ob-steps">
              {(selected.steps || []).length === 0 && (
                <div className="ob-steps-empty">
                  No steps yet — add one below.
                </div>
              )}
              {(selected.steps || []).map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index}
                  expanded={!!expandedSteps[step.id]}
                  dragOver={dragOver === index}
                  armedRemove={!!armedRemoveSteps[step.id]}
                  onToggle={() => handleToggleStep(step.id)}
                  onLabelChange={(label) => handleStepLabel(step.id, label)}
                  onNotesChange={(notes) => handleStepNotes(step.id, notes)}
                  onExpand={() => handleExpandStep(step.id)}
                  onArmRemove={(armed) => handleArmRemoveStep(step.id, armed)}
                  onRemove={() => handleRemoveStep(step.id)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}

              {/* Add custom step */}
              {!showAddStep ? (
                <button
                  className="ob-add-step-btn"
                  onClick={() => setShowAddStep(true)}
                >
                  + Add custom step
                </button>
              ) : (
                <div className="ob-add-step-row">
                  <input
                    className="ob-inp"
                    placeholder="Custom step label…"
                    value={newStepDraft}
                    onChange={e => setNewStepDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomStep();
                      } else if (e.key === 'Escape') {
                        setShowAddStep(false);
                        setNewStepDraft('');
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="ob-btn ob-btn-accent"
                    onClick={handleAddCustomStep}
                    disabled={!newStepDraft.trim()}
                  >
                    Add
                  </button>
                  <button
                    className="ob-btn ob-btn-ghost"
                    onClick={() => { setShowAddStep(false); setNewStepDraft(''); }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* General notes */}
            <div className="ob-notes-section">
              <label className="ob-label">General notes</label>
              <textarea
                className="ob-inp ob-textarea"
                placeholder="Anything worth remembering about this person's onboarding…"
                rows={4}
                value={selected.notes || ''}
                onChange={e => updateSelected({ notes: e.target.value })}
              />
            </div>
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
