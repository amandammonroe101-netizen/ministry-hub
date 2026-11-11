import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { servicePlanService } from '../../services/servicePlanService';
import { useUserStoreKey } from '../../lib/userStore';
import './ServiceBuilder.css';

/* ─────────────────────────────────────────────────────────────
   ServiceBuilder — worship service order / timeline planner
   Naming: .sb2-*
   ───────────────────────────────────────────────────────────── */

const ITEM_TYPES = {
  welcome:      { icon: '👋', label: 'Welcome',        color: '#06b6d4', defaultMin: 5  },
  worship:      { icon: '🎵', label: 'Worship Set',    color: '#a855f7', defaultMin: 25 },
  prayer:       { icon: '🙏', label: 'Prayer',          color: '#22c55e', defaultMin: 5  },
  scripture:    { icon: '📖', label: 'Scripture',       color: '#f59e0b', defaultMin: 5  },
  sermon:       { icon: '🎤', label: 'Sermon',          color: '#ef4444', defaultMin: 35 },
  offering:     { icon: '🫶', label: 'Offering',        color: '#ec4899', defaultMin: 5  },
  response:     { icon: '🕊', label: 'Response',        color: '#84cc16', defaultMin: 10 },
  announcement: { icon: '📢', label: 'Announcements',   color: '#f97316', defaultMin: 5  },
  communion:    { icon: '🍞', label: 'Communion',       color: '#dc2626', defaultMin: 10 },
  dismissal:    { icon: '✝',  label: 'Dismissal',       color: '#6366f1', defaultMin: 3  },
  break:        { icon: '☕', label: 'Break',            color: '#78716c', defaultMin: 5  },
  custom:       { icon: '📝', label: 'Custom',          color: '#64748b', defaultMin: 5  },
};

const SERVICE_TYPES = [
  'Sunday Morning',
  'Sunday Evening',
  'Wednesday Night',
  'Special Event',
  'Christmas',
  'Easter',
  'Revival',
  'Youth Service',
  'Prayer Service',
  'Conference',
  'Other',
];

/* ─── Helpers ────────────────────────────────────────────────── */

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(totalMin) {
  if (!totalMin || totalMin <= 0) return '0 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Compute HH:MM start time string for each item given a service start time and items array.
 *  startTime is a string like "10:00" (24-hour).
 *  Returns array of { hour, minute } objects aligned with items[]. */
function computeTimecodes(startTime, items) {
  const [startH, startM] = (startTime || '10:00').split(':').map(Number);
  let totalMin = startH * 60 + (startM || 0);
  return items.map(item => {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    totalMin += (item.duration_min || 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

function totalDuration(items) {
  return (items || []).reduce((acc, i) => acc + (i.duration_min || 0), 0);
}

/* ─── New Plan Form ──────────────────────────────────────────── */
function NewPlanForm({ onSave, onCancel }) {
  const [name, setName]               = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [serviceType, setServiceType] = useState('Sunday Morning');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await servicePlanService.create({
        name: name.trim(),
        service_date: serviceDate || null,
        service_type: serviceType,
      });
      onSave(res.data.data);
    } catch {
      setError('Failed to create plan.');
      setSaving(false);
    }
  }

  return (
    <form className="sb2-new-form" onSubmit={handleSubmit}>
      {error && <p className="sb2-error">{error}</p>}
      <input
        className="sb2-inp"
        placeholder="Plan name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <input
        className="sb2-inp"
        type="date"
        value={serviceDate}
        onChange={e => setServiceDate(e.target.value)}
      />
      <select
        className="sb2-inp"
        value={serviceType}
        onChange={e => setServiceType(e.target.value)}
      >
        {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <div className="sb2-new-form-btns">
        <button type="submit" className="sb2-btn sb2-btn-accent" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="sb2-btn sb2-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Plan Card (sidebar) ────────────────────────────────────── */
const PlanCard = forwardRef(function PlanCard({ plan, active, onClick }, ref) {
  const dur   = totalDuration(plan.items || []);
  const count = (plan.items || []).length;
  return (
    <button
      ref={ref}
      className={`sb2-card${active ? ' on' : ''}`}
      onClick={onClick}
    >
      <div className="sb2-card-name">{plan.name}</div>
      {plan.service_date && (
        <div className="sb2-card-date">{formatDate(plan.service_date)}</div>
      )}
      {plan.service_type && (
        <div className="sb2-card-type">{plan.service_type}</div>
      )}
      <div className="sb2-card-meta">
        <span className="sb2-card-count">{count} item{count !== 1 ? 's' : ''}</span>
        {dur > 0 && <span className="sb2-card-dur">{formatDuration(dur)}</span>}
      </div>
    </button>
  );
});

/* ─── Timeline Item Row ──────────────────────────────────────── */
function TimelineItem({
  item, timecode,
  index, dragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onUpdateField, onRemove,
}) {
  const def          = ITEM_TYPES[item.item_type] || ITEM_TYPES.custom;
  const [editTitle,  setEditTitle]  = useState(false);
  const [titleVal,   setTitleVal]   = useState(item.title || '');
  const [editDur,    setEditDur]    = useState(false);
  const [durVal,     setDurVal]     = useState(item.duration_min ?? def.defaultMin);
  const [leaderVal,  setLeaderVal]  = useState(item.leader || '');
  const [editNotes,  setEditNotes]  = useState(false);
  const [notesVal,   setNotesVal]   = useState(item.notes || '');

  // Keep local state in sync when item prop changes
  useEffect(() => { setTitleVal(item.title || ''); }, [item.title]);
  useEffect(() => { setDurVal(item.duration_min ?? def.defaultMin); }, [item.duration_min, def.defaultMin]);
  useEffect(() => { setLeaderVal(item.leader || ''); }, [item.leader]);
  useEffect(() => { setNotesVal(item.notes || ''); }, [item.notes]);

  function commitTitle() {
    setEditTitle(false);
    if (titleVal.trim() !== item.title) {
      onUpdateField(item.id, { title: titleVal.trim() });
    }
  }

  function commitDur() {
    setEditDur(false);
    const n = parseInt(durVal, 10);
    const safe = isNaN(n) || n < 0 ? 0 : n;
    setDurVal(safe);
    if (safe !== item.duration_min) {
      onUpdateField(item.id, { duration_min: safe });
    }
  }

  function commitLeader(val) {
    setLeaderVal(val);
    onUpdateField(item.id, { leader: val });
  }

  function commitNotes() {
    setEditNotes(false);
    if (notesVal.trim() !== (item.notes || '')) {
      onUpdateField(item.id, { notes: notesVal.trim() });
    }
  }

  return (
    <div
      className={`sb2-item${dragOver ? ' drag-over' : ''}`}
      style={{ '--item-color': def.color }}
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      <span className="sb2-item-handle" title="Drag to reorder">⠿</span>

      {/* Timecode */}
      <span className="sb2-item-time">{timecode}</span>

      {/* Icon */}
      <span className="sb2-item-icon" title={def.label}>{def.icon}</span>

      {/* Title (inline edit) */}
      <div className="sb2-item-body">
        {editTitle ? (
          <input
            className="sb2-item-title-inp"
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(item.title || ''); setEditTitle(false); } }}
            autoFocus
          />
        ) : (
          <span
            className="sb2-item-title"
            onClick={() => setEditTitle(true)}
            title="Click to edit title"
          >
            {item.title || <em className="sb2-item-placeholder">{def.label}</em>}
          </span>
        )}

        {/* Leader */}
        <input
          className="sb2-item-leader"
          value={leaderVal}
          placeholder="— Leader"
          onChange={e => setLeaderVal(e.target.value)}
          onBlur={e => commitLeader(e.target.value)}
        />

        {/* Notes (double-click to edit) */}
        {editNotes ? (
          <textarea
            className="sb2-item-notes-inp"
            value={notesVal}
            onChange={e => setNotesVal(e.target.value)}
            onBlur={commitNotes}
            onKeyDown={e => { if (e.key === 'Escape') { setNotesVal(item.notes || ''); setEditNotes(false); } }}
            placeholder="Cues, transitions, reminders…"
            rows={2}
            autoFocus
          />
        ) : (
          <p
            className="sb2-item-notes"
            onDoubleClick={() => setEditNotes(true)}
            title="Double-click to edit notes"
          >
            {item.notes || <em className="sb2-item-placeholder">Double-click to add notes</em>}
          </p>
        )}
      </div>

      {/* Duration (inline edit) */}
      <div className="sb2-item-dur-wrap">
        {editDur ? (
          <input
            className="sb2-item-dur-inp"
            type="number"
            min="0"
            max="999"
            value={durVal}
            onChange={e => setDurVal(e.target.value)}
            onBlur={commitDur}
            onKeyDown={e => { if (e.key === 'Enter') commitDur(); if (e.key === 'Escape') { setDurVal(item.duration_min ?? def.defaultMin); setEditDur(false); } }}
            autoFocus
          />
        ) : (
          <span
            className="sb2-item-dur"
            onClick={() => setEditDur(true)}
            title="Click to edit duration"
          >
            {item.duration_min ?? def.defaultMin} min
          </span>
        )}
      </div>

      {/* Remove */}
      <button
        className="sb2-item-remove"
        title="Remove item"
        onClick={() => onRemove(item.id)}
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Add Item Row ───────────────────────────────────────────── */
function AddItemRow({ onAdd }) {
  return (
    <div className="sb2-add-row">
      <span className="sb2-add-label">Add</span>
      <div className="sb2-add-scroll">
        {Object.entries(ITEM_TYPES).map(([key, def]) => (
          <button
            key={key}
            className="sb2-add-pill"
            style={{ '--pill-color': def.color }}
            onClick={() => onAdd(key, def)}
            title={`Add ${def.label}`}
          >
            <span className="sb2-add-pill-icon">{def.icon}</span>
            <span className="sb2-add-pill-label">{def.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function ServiceBuilder() {
  /* ── Plans list state ─────────────────────────────────────── */
  /* Live-synced via Firestore. */
  const [plans, setPlans]               = useUserStoreKey('service-plans', []);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError]     = useState('');
  const [showNew, setShowNew]           = useState(false);

  /* ── Selected plan state ──────────────────────────────────── */
  const [selected, setSelected]             = useState(null);
  const [detailLoading, setDetailLoading]   = useState(false);
  const [detailError, setDetailError]       = useState('');
  const [armedDelete, setArmedDelete]       = useState(false);

  /* ── Inline plan name edit ────────────────────────────────── */
  const [editingName, setEditingName]   = useState(false);
  const [nameVal, setNameVal]           = useState('');

  /* ── Start time ───────────────────────────────────────────── */
  const [startTime, setStartTime]       = useState('10:00');

  /* ── Drag state ───────────────────────────────────────────── */
  const dragIndex = useRef(null);
  const [dragOver, setDragOver]         = useState(null);

  /* loadPlans kept for explicit refresh after mutations that need
     the hydrated server view; useUserStoreKey handles the initial load
     and live sync via onSnapshot. */
  const loadPlans = useCallback(async () => {
    setListsError('');
    try {
      const res = await servicePlanService.getAll();
      setPlans(res.data.data || []);
    } catch {
      setListsError('Failed to load service plans.');
    }
  }, [setPlans]);

  /* ── Sidebar card refs (for scroll-to-new) ────────────────── */
  const cardRefs = useRef(new Map());
  const pendingScrollId = useRef(null);

  /* ── Select a plan ────────────────────────────────────────── */
  const selectPlan = useCallback(async (id) => {
    setArmedDelete(false);
    setEditingName(false);
    setDetailError('');
    setDetailLoading(true);
    setSelected(null);
    try {
      const res = await servicePlanService.getOne(id);
      const plan = res.data.data || {};
      // Always guarantee an items array so the detail view never crashes
      const safe = { ...plan, items: Array.isArray(plan.items) ? plan.items : [] };
      setSelected(safe);
      setNameVal(safe.name || '');
    } catch {
      setDetailError('Failed to load service plan.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ── Create new plan ──────────────────────────────────────── */
  const handleNewSaved = useCallback((newPlan) => {
    // API may return plan without items array; normalise
    const full = { ...newPlan, items: Array.isArray(newPlan?.items) ? newPlan.items : [] };
    // Dedupe: the live Firestore listener backing `plans` can echo this
    // same plan in before this callback runs, so guard against
    // double-prepending the same id (which produced React's duplicate-key
    // warning and persisted a duplicated array back to Firestore).
    setPlans(prev => [full, ...prev.filter(p => p.id !== full.id)]);
    setShowNew(false);
    // Optimistically show the new plan immediately so the detail area is
    // never blank while getOne is in flight.
    setSelected(full);
    setNameVal(full.name || '');
    pendingScrollId.current = full.id;
    selectPlan(full.id);
  }, [selectPlan]);

  /* ── Scroll newly-created card into view ──────────────────── */
  useEffect(() => {
    const id = pendingScrollId.current;
    if (id == null) return;
    const el = cardRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      pendingScrollId.current = null;
    }
  }, [plans]);

  /* ── Delete plan ──────────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    try {
      await servicePlanService.delete(selected.id);
      setPlans(prev => prev.filter(p => p.id !== selected.id));
      setSelected(null);
      setArmedDelete(false);
    } catch {
      setDetailError('Failed to delete plan.');
    }
  }, [selected, armedDelete]);

  /* ── Commit plan name edit ────────────────────────────────── */
  const commitName = useCallback(async () => {
    setEditingName(false);
    if (!selected || nameVal.trim() === selected.name || !nameVal.trim()) return;
    const trimmed = nameVal.trim();
    try {
      await servicePlanService.update(selected.id, { name: trimmed });
      setSelected(prev => ({ ...prev, name: trimmed }));
      setPlans(prev => prev.map(p => p.id === selected.id ? { ...p, name: trimmed } : p));
    } catch {
      setDetailError('Failed to rename plan.');
      setNameVal(selected.name);
    }
  }, [selected, nameVal]);

  /* ── Add item ─────────────────────────────────────────────── */
  const handleAddItem = useCallback(async (typeKey, def) => {
    if (!selected) return;
    const existingCount = (selected.items || []).filter(i => i.item_type === typeKey).length;
    const title = existingCount > 0 ? `${def.label} ${existingCount + 1}` : def.label;
    const payload = {
      item_type:    typeKey,
      title,
      duration_min: def.defaultMin,
      notes:        '',
      leader:       '',
      sort_order:   (selected.items || []).length,
    };
    try {
      // addItem returns the whole hydrated plan; pick the newest item from it
      const res = await servicePlanService.addItem(selected.id, payload);
      const hydrated = res.data.data || {};
      const hydratedItems = Array.isArray(hydrated.items) ? hydrated.items : [];
      setSelected(prev => {
        const updated = { ...prev, items: hydratedItems };
        updateSidebarDur(updated);
        return updated;
      });
    } catch {
      setDetailError('Failed to add item.');
    }
  }, [selected]);

  /* ── Update item field ────────────────────────────────────── */
  const handleUpdateField = useCallback(async (itemId, fields) => {
    if (!selected) return;
    try {
      const res = await servicePlanService.updateItem(selected.id, itemId, fields);
      const hydrated = res.data.data || {};
      const hydratedItems = Array.isArray(hydrated.items) ? hydrated.items : null;
      setSelected(prev => {
        const prevItems = Array.isArray(prev.items) ? prev.items : [];
        const items = hydratedItems
          ? hydratedItems
          : prevItems.map(i => i.id === itemId ? { ...i, ...fields } : i);
        const next = { ...prev, items };
        updateSidebarDur(next);
        return next;
      });
    } catch {
      setDetailError('Failed to update item.');
    }
  }, [selected]);

  /* ── Remove item ──────────────────────────────────────────── */
  const handleRemoveItem = useCallback(async (itemId) => {
    if (!selected) return;
    try {
      await servicePlanService.removeItem(selected.id, itemId);
      setSelected(prev => {
        const prevItems = Array.isArray(prev.items) ? prev.items : [];
        const items = prevItems.filter(i => i.id !== itemId);
        const next = { ...prev, items };
        updateSidebarDur(next);
        return next;
      });
    } catch {
      setDetailError('Failed to remove item.');
    }
  }, [selected]);

  /* ── Helper: keep sidebar plan duration in sync ───────────── */
  function updateSidebarDur(updatedPlan) {
    setPlans(prev => prev.map(p =>
      p.id === updatedPlan.id
        ? { ...p, items: updatedPlan.items }
        : p
    ));
  }

  /* ── Drag handlers ────────────────────────────────────────── */
  const handleDragStart = useCallback((e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  }, []);

  const handleDrop = useCallback(async (e, dropIndex) => {
    e.preventDefault();
    setDragOver(null);
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    if (fromIndex == null || fromIndex === dropIndex || !selected) return;

    const currentItems = Array.isArray(selected.items) ? selected.items : [];
    const reordered = [...currentItems];
    const [moved]   = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    setSelected(prev => ({ ...prev, items: reordered }));

    try {
      const orderArray = reordered.map(i => i.id);
      await servicePlanService.reorderItems(selected.id, orderArray);
    } catch {
      setSelected(prev => ({ ...prev, items: currentItems }));
      setDetailError('Failed to save new order.');
    }
  }, [selected]);

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    setDragOver(null);
  }, []);

  /* ── Derived ─────────────────────────────────────────────── */
  const items     = selected?.items || [];
  const durTotal  = totalDuration(items);
  const timecodes = computeTimecodes(startTime, items);
  const durOver   = durTotal > 90;

  /* Self-heal: an older race in handleNewSaved could persist the same
     plan id twice in the stored array (React then warns about duplicate
     keys). Collapse to the first occurrence so the sidebar never renders
     a duplicate, regardless of what's already saved in Firestore. */
  const dedupedPlans = plans.filter((p, i) => plans.findIndex(q => q.id === p.id) === i);

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell
      title="Service Builder"
      icon="🗓"
      subtitle="Plan the full service flow — songs, announcements, transitions, and cues in one timeline."
    >
    <div className="sb2-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── Left Sidebar ── */}
      <aside className="sb2-sidebar">
        <div className="sb2-sidebar-head">
          <span className="sb2-sidebar-title">Service Builder</span>
          {!showNew && (
            <button
              className="sb2-new-btn"
              onClick={() => setShowNew(true)}
              title="New service plan"
            >
              + New
            </button>
          )}
        </div>

        {showNew && (
          <NewPlanForm
            onSave={handleNewSaved}
            onCancel={() => setShowNew(false)}
          />
        )}

        <div className="sb2-list">
          {listsLoading && (
            <p className="sb2-muted" style={{ padding: '12px 14px' }}>Loading…</p>
          )}
          {listsError && (
            <p className="sb2-error" style={{ margin: '8px 10px' }}>{listsError}</p>
          )}
          {!listsLoading && !listsError && dedupedPlans.length === 0 && (
            <p className="sb2-muted" style={{ padding: '12px 14px', fontStyle: 'italic' }}>
              No service plans yet. Create one above.
            </p>
          )}
          {dedupedPlans.map(plan => (
            <PlanCard
              key={plan.id}
              ref={el => {
                if (el) cardRefs.current.set(plan.id, el);
                else cardRefs.current.delete(plan.id);
              }}
              plan={plan}
              active={selected?.id === plan.id}
              onClick={() => selectPlan(plan.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="sb2-main">

        {detailLoading && (
          <div className="sb2-empty">
            <p className="sb2-muted">Loading plan…</p>
          </div>
        )}

        {!detailLoading && !selected && !detailError && (
          <div className="sb2-empty">
            <div className="sb2-empty-icon">🗓</div>
            <div className="sb2-empty-title">No plan selected</div>
            <div className="sb2-empty-sub">
              Choose a service plan from the sidebar, or create a new one.
            </div>
          </div>
        )}

        {!detailLoading && detailError && (
          <div className="sb2-empty">
            <p className="sb2-error">{detailError}</p>
          </div>
        )}

        {!detailLoading && selected && (
          <div className="sb2-detail">
            {/* ── Detail Header ── */}
            <div className="sb2-detail-head">
              <div className="sb2-detail-head-left">
                {/* Editable plan name */}
                {editingName ? (
                  <input
                    className="sb2-detail-name-inp"
                    value={nameVal}
                    onChange={e => setNameVal(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') { setNameVal(selected.name); setEditingName(false); }
                    }}
                    autoFocus
                  />
                ) : (
                  <h1
                    className="sb2-detail-name"
                    onClick={() => { setNameVal(selected.name); setEditingName(true); }}
                    title="Click to rename"
                  >
                    {selected.name}
                    <span className="sb2-edit-hint">✏</span>
                  </h1>
                )}

                {/* Chips row */}
                <div className="sb2-detail-chips">
                  {selected.service_date && (
                    <span className="sb2-chip sb2-chip-date">{formatDate(selected.service_date)}</span>
                  )}
                  {selected.service_type && (
                    <span className="sb2-chip sb2-chip-type">{selected.service_type}</span>
                  )}
                </div>
              </div>

              <div className="sb2-detail-head-right">
                {/* Start time clock */}
                <div className="sb2-start-wrap">
                  <span className="sb2-start-label">Start</span>
                  <input
                    className="sb2-start-time"
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    title="Service start time"
                  />
                </div>

                {/* Running total duration */}
                <div className={`sb2-duration-total${durOver ? ' over' : ''}`}>
                  {formatDuration(durTotal)}
                </div>

                {/* Actions */}
                <div className="sb2-detail-actions">
                  <button
                    className={`sb2-btn${armedDelete ? ' sb2-btn-danger-armed' : ' sb2-btn-danger'}`}
                    onClick={handleDelete}
                    onBlur={() => setArmedDelete(false)}
                    title={armedDelete ? 'Click again to confirm deletion' : 'Delete plan'}
                  >
                    {armedDelete ? 'Confirm Delete' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>

            {/* Error banner */}
            {detailError && (
              <div className="sb2-banner-error">
                {detailError}
                <button className="sb2-banner-dismiss" onClick={() => setDetailError('')}>✕</button>
              </div>
            )}

            {/* ── Timeline ── */}
            <div className="sb2-timeline">
              {items.length === 0 && (
                <div className="sb2-timeline-empty">
                  <div className="sb2-timeline-empty-icon">📋</div>
                  <div className="sb2-timeline-empty-title">No items yet</div>
                  <div className="sb2-timeline-empty-sub">
                    Pick a service element from the row below to begin building
                    your order of service.
                  </div>
                  <div className="sb2-timeline-empty-cta">
                    <button
                      className="sb2-btn sb2-btn-accent"
                      onClick={() => handleAddItem('welcome', ITEM_TYPES.welcome)}
                    >
                      + Add Welcome to start
                    </button>
                  </div>
                </div>
              )}

              {items.map((item, index) => (
                <TimelineItem
                  key={item.id}
                  item={item}
                  timecode={timecodes[index]}
                  index={index}
                  dragOver={dragOver === index}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onUpdateField={handleUpdateField}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>

            {/* ── Add Item Row (always visible so users can add any of the
                 12 item types — including when the plan is brand-new) ── */}
            <AddItemRow onAdd={handleAddItem} />
          </div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}
