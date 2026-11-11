import { useState, useEffect, useMemo } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './MaintenanceLog.css';

/* ─────────────────────────────────────────────────────────────
   Maintenance Log — service / repair record for gear inventory
   Naming:     .ml-*
   Persistence: localStorage key 'gear:maintenance'
   Reads:       localStorage key 'gear:inventory' (read-only)
   Accent:      var(--accent-green, #6ee7b7)
   ───────────────────────────────────────────────────────────── */

const LS_KEY        = 'gear:maintenance';
const INVENTORY_KEY = 'gear:inventory';

/* ─── Type / status metadata ─────────────────────────────────── */
const TYPES = [
  { key: 'service',     label: 'Service',     icon: '🔧' },
  { key: 'repair',      label: 'Repair',      icon: '🛠' },
  { key: 'inspection',  label: 'Inspection',  icon: '🔍' },
  { key: 'cleaning',    label: 'Cleaning',    icon: '🧽' },
  { key: 'calibration', label: 'Calibration', icon: '📏' },
  { key: 'other',       label: 'Other',       icon: '📋' },
];

const TYPE_MAP = TYPES.reduce((m, t) => { m[t.key] = t; return m; }, {});

const TYPE_FILTERS = [{ key: 'all', label: 'All', icon: '∗' }, ...TYPES];

const STATUSES = [
  { key: 'scheduled',   label: 'Scheduled' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

const STATUS_FILTERS = [{ key: 'all', label: 'All' }, ...STATUSES];

const STATUS_META = {
  scheduled:     { label: 'Scheduled',   color: '#fbbf24', bg: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.40)' },
  'in-progress': { label: 'In Progress', color: '#60a5fa', bg: 'rgba(96,165,250,0.16)', border: 'rgba(96,165,250,0.40)' },
  completed:     { label: 'Completed',   color: '#34d399', bg: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.40)' },
};

/* ─── Date helpers ───────────────────────────────────────────── */
function toISO(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayISO() {
  return toISO(new Date());
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
/* Difference in whole days between two YYYY-MM-DD dates (b - a). */
function daysBetween(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00').getTime();
  const b = new Date(bISO + 'T00:00:00').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
function relativeDate(iso, status) {
  if (!iso) return '';
  const today = todayISO();
  const diff = daysBetween(today, iso); // future = positive, past = negative
  if (diff === 0) return 'today';
  if (diff > 0) {
    if (diff === 1) return 'tomorrow';
    return `in ${diff} days`;
  }
  const ago = Math.abs(diff);
  if (status === 'scheduled') {
    return ago === 1 ? 'overdue by 1 day' : `overdue by ${ago} days`;
  }
  if (ago === 1) return 'yesterday';
  return `${ago} days ago`;
}
function isOverdue(entry) {
  if (entry.status !== 'scheduled') return false;
  if (!entry.date) return false;
  return daysBetween(todayISO(), entry.date) < 0;
}
function isThisMonth(iso) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/* ─── Storage ────────────────────────────────────────────────── */
function loadEntries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveEntries(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}
function loadInventory() {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map(it => (it && it.id && it.name)
        ? { id: it.id, name: it.name, category: it.category || '', brand: it.brand || '', model: it.model || '' }
        : null)
      .filter(Boolean);
  } catch { return []; }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Status Pill ────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.scheduled;
  return (
    <span
      className="ml-pill"
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}

/* ─── New / Edit Form Modal ──────────────────────────────────── */
function EntryFormModal({ initial, inventory, onSave, onCancel }) {
  const [itemId,          setItemId]          = useState(initial?.itemId          || '');
  const [itemNameSnapshot, setItemNameSnapshot] = useState(initial?.itemNameSnapshot || '');
  const [type,            setType]            = useState(initial?.type            || 'service');
  const [status,          setStatus]          = useState(initial?.status          || 'scheduled');
  const [date,            setDate]            = useState(initial?.date            || todayISO());
  const [performedBy,     setPerformedBy]     = useState(initial?.performedBy     || '');
  const [cost,            setCost]            = useState(initial?.cost != null ? String(initial.cost) : '');
  const [description,     setDescription]     = useState(initial?.description     || '');
  const [notes,           setNotes]           = useState(initial?.notes           || '');
  const [nextDueDate,     setNextDueDate]     = useState(initial?.nextDueDate     || '');
  const [autoCreateNext,  setAutoCreateNext]  = useState(initial?.autoCreateNext  ?? true);
  const [error,           setError]           = useState('');

  const isEdit = !!initial?.id;
  const itemIsCustom = itemId === '__custom__' || (!itemId && itemNameSnapshot);

  function handleItemSelect(value) {
    if (value === '') {
      setItemId('');
      setItemNameSnapshot('');
      return;
    }
    if (value === '__custom__') {
      setItemId('__custom__');
      return;
    }
    const item = inventory.find(i => i.id === value);
    if (item) {
      setItemId(item.id);
      setItemNameSnapshot(item.name);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!date)               { setError('Date is required.'); return; }

    // Resolve item linkage
    let finalItemId = '';
    let finalItemName = '';
    if (itemId === '__custom__') {
      if (!itemNameSnapshot.trim()) { setError('Enter an item name (or pick from inventory).'); return; }
      finalItemId = '';
      finalItemName = itemNameSnapshot.trim();
    } else if (itemId) {
      const item = inventory.find(i => i.id === itemId);
      finalItemId = itemId;
      finalItemName = item ? item.name : (itemNameSnapshot || '(unknown item)');
    } else {
      // No item selected at all — allow this, treat as untyped
      finalItemId = '';
      finalItemName = itemNameSnapshot.trim() || '(no item)';
    }

    const parsedCost = cost.trim() === '' ? null : Number(cost);
    if (cost.trim() !== '' && Number.isNaN(parsedCost)) {
      setError('Cost must be a number (or empty).');
      return;
    }

    onSave({
      itemId:           finalItemId,
      itemNameSnapshot: finalItemName,
      type,
      status,
      date,
      performedBy:      performedBy.trim(),
      cost:             parsedCost,
      description:      description.trim(),
      notes:            notes.trim(),
      nextDueDate:      nextDueDate || '',
      autoCreateNext:   !!nextDueDate && autoCreateNext,
    });
  }

  return (
    <div className="ml-modal-overlay" onClick={onCancel}>
      <form className="ml-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="ml-modal-head">
          <span>{isEdit ? 'Edit Entry' : 'New Maintenance Entry'}</span>
          <button type="button" className="ml-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="ml-modal-body">
          {error && <div className="ml-error">{error}</div>}

          <div className="ml-field">
            <label className="ml-lbl">Item</label>
            <select
              className="ml-inp"
              value={itemId}
              onChange={e => handleItemSelect(e.target.value)}
            >
              <option value="">— Select an item —</option>
              {inventory.length > 0 && (
                <optgroup label="From inventory">
                  {inventory.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name}{i.brand ? ` · ${i.brand}` : ''}{i.model ? ` ${i.model}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__custom__">Other / not in inventory…</option>
            </select>
            {itemIsCustom && (
              <input
                className="ml-inp ml-inp-secondary"
                type="text"
                placeholder="Item name (free text)"
                value={itemNameSnapshot}
                onChange={e => setItemNameSnapshot(e.target.value)}
              />
            )}
            {inventory.length === 0 && (
              <div className="ml-hint">No inventory items yet — entries will use free-text item names.</div>
            )}
          </div>

          <div className="ml-form-row">
            <div className="ml-field">
              <label className="ml-lbl">Type</label>
              <select className="ml-inp" value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(t => (
                  <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div className="ml-field">
              <label className="ml-lbl">Status</label>
              <select className="ml-inp" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="ml-field">
              <label className="ml-lbl">Date</label>
              <input
                className="ml-inp"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="ml-field">
            <label className="ml-lbl">Description *</label>
            <textarea
              className="ml-inp ml-textarea"
              rows={3}
              placeholder="What was done (or needs doing)…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ml-form-row">
            <div className="ml-field">
              <label className="ml-lbl">Performed by</label>
              <input
                className="ml-inp"
                type="text"
                placeholder="Name or shop"
                value={performedBy}
                onChange={e => setPerformedBy(e.target.value)}
              />
            </div>
            <div className="ml-field">
              <label className="ml-lbl">Cost</label>
              <input
                className="ml-inp"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={e => setCost(e.target.value)}
              />
            </div>
          </div>

          <div className="ml-field">
            <label className="ml-lbl">Notes</label>
            <textarea
              className="ml-inp ml-textarea"
              rows={2}
              placeholder="Anything else worth recording…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="ml-field">
            <label className="ml-lbl">Next due date (recurring)</label>
            <input
              className="ml-inp"
              type="date"
              value={nextDueDate}
              onChange={e => setNextDueDate(e.target.value)}
            />
            {nextDueDate && (
              <label className="ml-toggle">
                <input
                  type="checkbox"
                  checked={autoCreateNext}
                  onChange={e => setAutoCreateNext(e.target.checked)}
                />
                <span>Auto-create next scheduled entry when this one is completed</span>
              </label>
            )}
          </div>
        </div>

        <footer className="ml-modal-ft">
          <button type="button" className="ml-btn ml-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ml-btn ml-btn-accent">
            {isEdit ? 'Save Changes' : 'Create Entry'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Entry Card ─────────────────────────────────────────────── */
function EntryCard({
  entry, onEdit, onDelete, onMarkComplete,
  armedDelete, setArmedDelete,
}) {
  const [expanded, setExpanded] = useState(false);
  const typeMeta = TYPE_MAP[entry.type] || TYPE_MAP.other;
  const overdue  = isOverdue(entry);
  const longDesc = (entry.description || '').length > 160;
  const shortDesc = longDesc && !expanded
    ? entry.description.slice(0, 160).trimEnd() + '…'
    : entry.description;

  const dateRel = relativeDate(entry.date, entry.status);
  const isPast = entry.date && daysBetween(todayISO(), entry.date) < 0;

  return (
    <article className={`ml-card ${overdue ? 'ml-card-overdue' : ''}`}>
      <div className="ml-card-top">
        <div className="ml-card-lhs">
          <StatusPill status={entry.status} />
          <div className="ml-card-title-wrap">
            <div className="ml-card-title-row">
              <span className="ml-type-icon" aria-hidden="true">{typeMeta.icon}</span>
              <h3 className="ml-card-title">{typeMeta.label}</h3>
              {entry.itemNameSnapshot && (
                <span
                  className="ml-item-chip"
                  title={entry.itemId ? 'Linked to inventory' : 'Free-text item'}
                >
                  {entry.itemNameSnapshot}
                </span>
              )}
            </div>
            <div className="ml-card-date">
              <span>{formatDate(entry.date)}</span>
              {dateRel && (
                <>
                  <span className="ml-meta-sep">·</span>
                  <span className={`ml-date-rel ${overdue ? 'ml-date-rel-overdue' : (isPast ? 'ml-date-rel-past' : '')}`}>
                    {dateRel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {entry.description && (
        <div className="ml-card-desc" onClick={() => longDesc && setExpanded(v => !v)} style={{ cursor: longDesc ? 'pointer' : 'default' }}>
          {shortDesc}
          {longDesc && (
            <button
              type="button"
              className="ml-link-btn"
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="ml-card-meta">
        {entry.performedBy && (
          <span className="ml-card-meta-item">
            <span className="ml-meta-label">By:</span>
            <span className="ml-meta-value">{entry.performedBy}</span>
          </span>
        )}
        {entry.cost != null && entry.cost !== '' && !Number.isNaN(Number(entry.cost)) && (
          <span className="ml-card-meta-item">
            <span className="ml-meta-label">Cost:</span>
            <span className="ml-meta-value">${Number(entry.cost).toFixed(2)}</span>
          </span>
        )}
        {entry.notes && (
          <span className="ml-card-meta-item ml-card-meta-notes">
            <span className="ml-meta-label">Notes:</span>
            <span className="ml-meta-value">{entry.notes}</span>
          </span>
        )}
      </div>

      {entry.status === 'completed' && entry.nextDueDate && (
        <div className="ml-next-chip">
          <span aria-hidden="true">🔁</span>
          <span>Next due {formatDateShort(entry.nextDueDate)}</span>
          {entry.autoCreateNext && entry.autoCreateScheduledId && (
            <span className="ml-next-chip-note">· follow-up created</span>
          )}
        </div>
      )}

      <div className="ml-card-actions">
        {entry.status !== 'completed' && (
          <button
            className="ml-btn ml-btn-accent"
            onClick={() => onMarkComplete(entry.id)}
          >
            Mark Complete
          </button>
        )}
        <button className="ml-btn ml-btn-ghost" onClick={() => onEdit(entry)}>
          Edit
        </button>
        <button
          className={`ml-btn ${armedDelete === entry.id ? 'ml-btn-danger-armed' : 'ml-btn-danger'}`}
          onClick={() => onDelete(entry.id)}
          onBlur={() => setArmedDelete(null)}
          title={armedDelete === entry.id ? 'Click again to confirm' : 'Delete entry'}
        >
          {armedDelete === entry.id ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>
    </article>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function MaintenanceLog() {
  /* Live-synced via Firestore. */
  const [entries,      setEntries]      = useUserStoreKey('gear:maintenance', []);
  const [inventory]                     = useUserStoreKey('gear:inventory',   []);
  const [itemFilter,   setItemFilter]   = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm,     setShowForm]     = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [armedDelete,  setArmedDelete]  = useState(null);

  /* (Both entries and inventory autosync via useUserStoreKey.) */

  /* Stats */
  const stats = useMemo(() => {
    let open = 0, completedMonth = 0, overdue = 0;
    for (const e of entries) {
      if (e.status === 'scheduled' || e.status === 'in-progress') open++;
      if (e.status === 'completed' && isThisMonth(e.date))        completedMonth++;
      if (isOverdue(e))                                            overdue++;
    }
    return { open, completedMonth, overdue };
  }, [entries]);

  /* Filtered + sorted list */
  const visible = useMemo(() => {
    const list = entries.filter(e => {
      if (itemFilter !== 'all') {
        if (itemFilter === '__custom__') {
          if (e.itemId) return false;
        } else if (e.itemId !== itemFilter) {
          return false;
        }
      }
      if (typeFilter   !== 'all' && e.type   !== typeFilter)   return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const ad = a.date || '';
      const bd = b.date || '';
      if (ad !== bd) return ad < bd ? 1 : -1; // date desc
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [entries, itemFilter, typeFilter, statusFilter]);

  /* Counts for status pills */
  const statusCounts = useMemo(() => {
    const counts = { all: entries.length, scheduled: 0, 'in-progress': 0, completed: 0 };
    for (const e of entries) {
      if (counts[e.status] != null) counts[e.status]++;
    }
    return counts;
  }, [entries]);

  const typeCounts = useMemo(() => {
    const counts = { all: entries.length };
    for (const t of TYPES) counts[t.key] = 0;
    for (const e of entries) {
      if (counts[e.type] != null) counts[e.type]++;
    }
    return counts;
  }, [entries]);

  const hasActiveFilters =
    itemFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  function resetFilters() {
    setItemFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
  }

  /* ── CRUD ──────────────────────────────────────────────── */
  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(entry) {
    setEditing(entry);
    setShowForm(true);
  }

  function handleSave(data) {
    const now = Date.now();
    if (editing && editing.id) {
      setEntries(prev => prev.map(e =>
        e.id === editing.id ? { ...e, ...data, updatedAt: now } : e
      ));
    } else {
      const newEntry = {
        id:        uid(),
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      setEntries(prev => [newEntry, ...prev]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id) {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    setArmedDelete(null);
  }

  /* Mark Complete — sets status, sets date to today, and if recurring + autoCreateNext
     and no follow-up has been spawned yet, creates a new scheduled entry. */
  function handleMarkComplete(id) {
    const now = Date.now();
    setEntries(prev => {
      const next = [];
      let extra = null;
      for (const e of prev) {
        if (e.id !== id) { next.push(e); continue; }

        const wantsFollowUp =
          !!e.nextDueDate &&
          !!e.autoCreateNext &&
          !e.autoCreateScheduledId;

        let updated = { ...e, status: 'completed', date: todayISO(), updatedAt: now };

        if (wantsFollowUp) {
          extra = {
            id:               uid(),
            itemId:           e.itemId || '',
            itemNameSnapshot: e.itemNameSnapshot || '',
            type:             e.type,
            status:           'scheduled',
            date:             e.nextDueDate,
            performedBy:      '',
            cost:             null,
            description:      e.description || '',
            notes:            '',
            nextDueDate:      '',
            autoCreateNext:   false,
            createdAt:        now,
            updatedAt:        now,
            spawnedFromId:    e.id,
          };
          updated.autoCreateScheduledId = extra.id;
        }
        next.push(updated);
      }
      if (extra) next.unshift(extra);
      return next;
    });
  }

  /* Build inventory dropdown options (include any free-text items already in entries) */
  const itemFilterOptions = useMemo(() => {
    const opts = [{ id: 'all', label: 'All Items' }];
    for (const i of inventory) {
      opts.push({ id: i.id, label: i.name });
    }
    // Add a "Free-text only" option if any entries are unlinked
    if (entries.some(e => !e.itemId)) {
      opts.push({ id: '__custom__', label: 'Free-text items' });
    }
    return opts;
  }, [inventory, entries]);

  /* ── Render ────────────────────────────────────────────── */
  return (
    <WorshipShell title="Maintenance Log" icon="🔧" subtitle="Maintenance history and upcoming service needs for gear.">
    <div className="ml-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="ml-main">
        {/* ── Top bar ── */}
        <div className="ml-topbar">
          <div className="ml-topbar-left">
            <h1 className="ml-page-title">Maintenance Log</h1>
            <p className="ml-page-sub">Track service records, repairs, and scheduled maintenance for your gear.</p>
          </div>
          <div className="ml-topbar-right">
            <button className="ml-btn ml-btn-accent ml-btn-lg" onClick={openNew}>
              + New Entry
            </button>
          </div>
        </div>

        {/* ── Filters row ── */}
        <div className="ml-filters">
          <div className="ml-filter-group ml-filter-item">
            <label className="ml-lbl ml-lbl-inline">Item</label>
            <select
              className="ml-inp ml-inp-compact"
              value={itemFilter}
              onChange={e => setItemFilter(e.target.value)}
            >
              {itemFilterOptions.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="ml-filter-group">
            <label className="ml-lbl ml-lbl-inline">Type</label>
            <div className="ml-pills">
              {TYPE_FILTERS.map(t => (
                <button
                  key={t.key}
                  className={`ml-tab ${typeFilter === t.key ? 'on' : ''}`}
                  onClick={() => setTypeFilter(t.key)}
                  title={t.label}
                >
                  <span aria-hidden="true" className="ml-tab-icon">{t.icon}</span>
                  <span>{t.label}</span>
                  <span className="ml-tab-count">{typeCounts[t.key] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ml-filter-group">
            <label className="ml-lbl ml-lbl-inline">Status</label>
            <div className="ml-pills">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s.key}
                  className={`ml-tab ${statusFilter === s.key ? 'on' : ''}`}
                  onClick={() => setStatusFilter(s.key)}
                >
                  <span>{s.label}</span>
                  <span className="ml-tab-count">{statusCounts[s.key] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="ml-stats">
          <div className="ml-stat">
            <div className="ml-stat-num">{stats.open}</div>
            <div className="ml-stat-lbl">Open entries</div>
          </div>
          <div className="ml-stat">
            <div className="ml-stat-num">{stats.completedMonth}</div>
            <div className="ml-stat-lbl">Completed this month</div>
          </div>
          <div className={`ml-stat ${stats.overdue > 0 ? 'ml-stat-warn' : ''}`}>
            <div className="ml-stat-num">{stats.overdue}</div>
            <div className="ml-stat-lbl">Overdue</div>
          </div>
        </div>

        {/* ── List ── */}
        <div className="ml-list-wrap">
          {visible.length === 0 ? (
            entries.length === 0 ? (
              <div className="ml-empty">
                <div className="ml-empty-icon" aria-hidden="true">🔧</div>
                <div className="ml-empty-title">No maintenance logged yet</div>
                <div className="ml-empty-sub">
                  Track service, repairs, and scheduled upkeep for every piece of gear in one place.
                </div>
                <button className="ml-btn ml-btn-accent ml-empty-cta" onClick={openNew}>
                  + Create your first entry
                </button>
              </div>
            ) : (
              <div className="ml-empty">
                <div className="ml-empty-icon" aria-hidden="true">🔍</div>
                <div className="ml-empty-title">No entries match these filters</div>
                <div className="ml-empty-sub">
                  Try a different combination, or reset the filters to see everything.
                </div>
                {hasActiveFilters && (
                  <button className="ml-btn ml-btn-ghost ml-empty-cta" onClick={resetFilters}>
                    Reset Filters
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="ml-list">
              {visible.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onMarkComplete={handleMarkComplete}
                  armedDelete={armedDelete}
                  setArmedDelete={setArmedDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <EntryFormModal
          initial={editing}
          inventory={inventory}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
    </WorshipShell>
  );
}
