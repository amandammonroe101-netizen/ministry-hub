import { useState, useEffect, useMemo, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Subs.css';

/* ─────────────────────────────────────────────────────────────
   Subs — substitute request manager for worship teams
   Naming: .sx-*  (Seaboard already uses .sb-*)
   Persistence: localStorage key 'band:subs'
   ───────────────────────────────────────────────────────────── */

const LS_KEY        = 'band:subs';
const ROSTER_KEY    = 'band:roster';

const ROLES = [
  'Worship Leader',
  'Vocals',
  'Acoustic Guitar',
  'Electric Guitar',
  'Bass',
  'Keys',
  'Drums',
  'Sound',
  'Video',
  'Lights',
  'Other',
];

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'filled',    label: 'Filled' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_META = {
  open:      { label: 'Open',      color: '#60a5fa', bg: 'rgba(96,165,250,0.16)', border: 'rgba(96,165,250,0.40)' },
  filled:    { label: 'Filled',    color: '#34d399', bg: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.40)' },
  cancelled: { label: 'Cancelled', color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
};

/* ─── Date helpers ───────────────────────────────────────────── */
function nextSundayISO() {
  const d = new Date();
  const day = d.getDay();          // 0=Sun .. 6=Sat
  const delta = day === 0 ? 7 : (7 - day);
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatServiceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)     return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)     return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)      return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30)    return `${days} day${days === 1 ? '' : 's'} ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12)      return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/* ─── Storage helpers ────────────────────────────────────────── */
function loadSubs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveSubs(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}
function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Roster may be array of strings OR array of objects with a `name` field
    return arr
      .map(r => typeof r === 'string' ? r : (r && r.name) ? r.name : null)
      .filter(Boolean);
  } catch { return []; }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Status Pill ────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span
      className="sx-pill"
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}

/* ─── Roster Autocomplete Input ──────────────────────────────── */
function RosterInput({ value, onChange, placeholder, roster, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = (value || '').toLowerCase().trim();
  const names = (roster || []).map(n => (typeof n === 'string' ? n : n?.name)).filter(Boolean);
  const matches = names
    .filter(n => !q || n.toLowerCase().includes(q))
    .filter(n => n.toLowerCase() !== q)
    .slice(0, 6);

  return (
    <div className="sx-ac" ref={wrapRef}>
      <input
        className="sx-inp"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="sx-ac-list">
          {matches.map(name => (
            <button
              key={name}
              type="button"
              className="sx-ac-item"
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── New / Edit Request Form (modal) ────────────────────────── */
function RequestFormModal({ initial, roster, onSave, onCancel }) {
  const [serviceDate,   setServiceDate]   = useState(initial?.serviceDate   || nextSundayISO());
  const [serviceName,   setServiceName]   = useState(initial?.serviceName   || 'Sunday Morning');
  const [role,          setRole]          = useState(initial?.role          || 'Vocals');
  const [requesterName, setRequesterName] = useState(initial?.requesterName || '');
  const [reason,        setReason]        = useState(initial?.reason        || '');
  const [notes,         setNotes]         = useState(initial?.notes         || '');
  const [error,         setError]         = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!requesterName.trim()) { setError('Requester name is required.'); return; }
    if (!serviceDate)          { setError('Service date is required.'); return; }
    onSave({
      serviceDate,
      serviceName:   serviceName.trim()   || 'Sunday Morning',
      role,
      requesterName: requesterName.trim(),
      reason:        reason.trim(),
      notes:         notes.trim(),
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div className="sx-modal-overlay" onClick={onCancel}>
      <form className="sx-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="sx-modal-head">
          <span>{isEdit ? 'Edit Sub Request' : 'New Sub Request'}</span>
          <button type="button" className="sx-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="sx-modal-body">
          {error && <div className="sx-error">{error}</div>}

          <div className="sx-form-row">
            <div className="sx-field">
              <label className="sx-lbl">Service date</label>
              <input
                className="sx-inp"
                type="date"
                value={serviceDate}
                onChange={e => setServiceDate(e.target.value)}
              />
            </div>
            <div className="sx-field">
              <label className="sx-lbl">Service name</label>
              <input
                className="sx-inp"
                type="text"
                placeholder="Sunday Morning"
                value={serviceName}
                onChange={e => setServiceName(e.target.value)}
              />
            </div>
          </div>

          <div className="sx-form-row">
            <div className="sx-field">
              <label className="sx-lbl">Role</label>
              <select
                className="sx-inp"
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sx-field">
              <label className="sx-lbl">Requester (who can't make it)</label>
              <RosterInput
                value={requesterName}
                onChange={setRequesterName}
                placeholder="e.g. Sarah"
                roster={roster}
                autoFocus
              />
            </div>
          </div>

          <div className="sx-field">
            <label className="sx-lbl">Reason (optional)</label>
            <input
              className="sx-inp"
              type="text"
              placeholder="Out of town, sick, family event…"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <div className="sx-field">
            <label className="sx-lbl">Notes (optional)</label>
            <textarea
              className="sx-inp sx-textarea"
              rows={3}
              placeholder="Any context the sub should know…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <footer className="sx-modal-ft">
          <button type="button" className="sx-btn sx-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="sx-btn sx-btn-accent">
            {isEdit ? 'Save Changes' : 'Create Request'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Inline "Mark Filled" form ──────────────────────────────── */
function FillForm({ roster, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [err, setErr]   = useState('');

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Enter the name of who is covering.'); return; }
    onSubmit(name.trim());
  }

  return (
    <form className="sx-fill-form" onSubmit={submit}>
      <div className="sx-fill-row">
        <label className="sx-fill-lbl">Covered by</label>
        <RosterInput
          value={name}
          onChange={(v) => { setName(v); if (err) setErr(''); }}
          placeholder="Name of the sub"
          roster={roster}
          autoFocus
        />
      </div>
      {err && <div className="sx-error sx-error-sm">{err}</div>}
      <div className="sx-fill-btns">
        <button type="button" className="sx-btn sx-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="sx-btn sx-btn-accent">Confirm Fill</button>
      </div>
    </form>
  );
}

/* ─── Request Card ───────────────────────────────────────────── */
function RequestCard({
  req, roster,
  onEdit, onDelete, armedDelete, setArmedDelete,
  onMarkFilled, onCancelRequest, onReopen,
  fillingId, setFillingId,
}) {
  const filling = fillingId === req.id;

  return (
    <article className="sx-card">
      <div className="sx-card-top">
        <div className="sx-card-lhs">
          <StatusPill status={req.status} />
          <div className="sx-card-title-wrap">
            <h3 className="sx-card-title">{req.serviceName || 'Service'}</h3>
            <div className="sx-card-date">{formatServiceDate(req.serviceDate)}</div>
          </div>
        </div>
        <div className="sx-card-rhs">
          <span className="sx-role-badge">{req.role}</span>
        </div>
      </div>

      <div className="sx-card-meta">
        <div className="sx-card-line">
          <span className="sx-meta-label">Requested by:</span>
          <span className="sx-meta-value">{req.requesterName || '—'}</span>
        </div>

        {req.status === 'filled' && req.filledBy && (
          <div className="sx-card-line sx-card-line-filled">
            <span className="sx-meta-label">Covered by:</span>
            <span className="sx-meta-value sx-meta-strong">{req.filledBy}</span>
            {req.filledAt && (
              <>
                <span className="sx-meta-sep">·</span>
                <span className="sx-meta-muted">{relativeTime(req.filledAt)}</span>
              </>
            )}
          </div>
        )}

        {req.reason && (
          <div className="sx-card-line">
            <span className="sx-meta-label">Reason:</span>
            <span className="sx-meta-value">{req.reason}</span>
          </div>
        )}

        {req.notes && (
          <div className="sx-card-notes">{req.notes}</div>
        )}
      </div>

      {filling ? (
        <FillForm
          roster={roster}
          onSubmit={(name) => onMarkFilled(req.id, name)}
          onCancel={() => setFillingId(null)}
        />
      ) : (
        <div className="sx-card-actions">
          {req.status === 'open' && (
            <>
              <button
                className="sx-btn sx-btn-accent"
                onClick={() => setFillingId(req.id)}
              >
                Mark Filled
              </button>
              <button
                className="sx-btn sx-btn-ghost"
                onClick={() => onCancelRequest(req.id)}
              >
                Cancel Request
              </button>
              <button
                className="sx-btn sx-btn-ghost"
                onClick={() => onEdit(req)}
              >
                Edit
              </button>
            </>
          )}

          {req.status === 'filled' && (
            <button
              className="sx-btn sx-btn-ghost"
              onClick={() => onReopen(req.id)}
            >
              Mark Open Again
            </button>
          )}

          {req.status === 'cancelled' && (
            <button
              className="sx-btn sx-btn-ghost"
              onClick={() => onReopen(req.id)}
            >
              Reopen
            </button>
          )}

          <button
            className={`sx-btn ${armedDelete === req.id ? 'sx-btn-danger-armed' : 'sx-btn-danger'}`}
            onClick={() => onDelete(req.id)}
            onBlur={() => setArmedDelete(null)}
            title={armedDelete === req.id ? 'Click again to confirm' : 'Delete request'}
          >
            {armedDelete === req.id ? 'Confirm Delete' : 'Delete'}
          </button>
        </div>
      )}
    </article>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Subs() {
  const [subs, setSubs]               = useUserStoreKey('band:subs',   []);
  const [roster]                      = useUserStoreKey('band:roster', []);
  const [tab, setTab]                 = useState('all');
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);   // request being edited (or null for create)
  const [armedDelete, setArmedDelete] = useState(null);   // id armed for deletion
  const [fillingId, setFillingId]     = useState(null);   // id of card with open fill form

  /* ── Derived counts ─────────────────────────────────────── */
  const counts = useMemo(() => ({
    all:       subs.length,
    open:      subs.filter(s => s.status === 'open').length,
    filled:    subs.filter(s => s.status === 'filled').length,
    cancelled: subs.filter(s => s.status === 'cancelled').length,
  }), [subs]);

  /* ── Filtered + sorted list ─────────────────────────────── */
  const visible = useMemo(() => {
    const list = tab === 'all' ? subs : subs.filter(s => s.status === tab);
    return [...list].sort((a, b) => {
      // open requests first, then by service date ascending, then by createdAt descending
      const statusOrder = { open: 0, filled: 1, cancelled: 2 };
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      const ad = a.serviceDate || '';
      const bd = b.serviceDate || '';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [subs, tab]);

  /* ── CRUD handlers ──────────────────────────────────────── */
  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(req) {
    setEditing(req);
    setShowForm(true);
  }

  function handleSave(data) {
    if (editing && editing.id) {
      setSubs(prev => prev.map(s => s.id === editing.id ? { ...s, ...data } : s));
    } else {
      const newReq = {
        id:        uid(),
        ...data,
        status:    'open',
        filledBy:  '',
        filledAt:  0,
        createdAt: Date.now(),
      };
      setSubs(prev => [newReq, ...prev]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id) {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setSubs(prev => prev.filter(s => s.id !== id));
    setArmedDelete(null);
    if (fillingId === id) setFillingId(null);
  }

  function handleMarkFilled(id, name) {
    setSubs(prev => prev.map(s => s.id === id
      ? { ...s, status: 'filled', filledBy: name, filledAt: Date.now() }
      : s
    ));
    setFillingId(null);
  }

  function handleCancelRequest(id) {
    setSubs(prev => prev.map(s => s.id === id
      ? { ...s, status: 'cancelled' }
      : s
    ));
  }

  function handleReopen(id) {
    setSubs(prev => prev.map(s => s.id === id
      ? { ...s, status: 'open', filledBy: '', filledAt: 0 }
      : s
    ));
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell title="Subs" icon="🔄" subtitle="Substitute coverage tracking when a team member can't make a service.">
    <div className="sx-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="sx-main">
        {/* ── Top bar ── */}
        <div className="sx-topbar">
          <div className="sx-topbar-left">
            <h1 className="sx-page-title">Subs</h1>
            <p className="sx-page-sub">Manage substitute requests when scheduled team members can't make a service.</p>
          </div>
          <div className="sx-topbar-right">
            <button className="sx-btn sx-btn-accent sx-btn-lg" onClick={openNew}>
              + New Sub Request
            </button>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div className="sx-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`sx-tab ${tab === t.key ? 'on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
              <span className="sx-tab-count">{counts[t.key]}</span>
            </button>
          ))}
        </div>

        {/* ── List ── */}
        <div className="sx-list-wrap">
          {visible.length === 0 ? (
            <div className="sx-empty">
              <div className="sx-empty-icon" aria-hidden="true">🔄</div>
              <div className="sx-empty-title">No sub requests</div>
              <div className="sx-empty-sub">
                {tab === 'all'
                  ? 'When someone on the schedule needs coverage, log it here so the whole team can see who needs a sub.'
                  : `Nothing in the "${TABS.find(t => t.key === tab)?.label}" bucket right now.`}
              </div>
              <button className="sx-btn sx-btn-accent sx-empty-cta" onClick={openNew}>
                + Create your first request
              </button>
            </div>
          ) : (
            <div className="sx-list">
              {visible.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  roster={roster}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  armedDelete={armedDelete}
                  setArmedDelete={setArmedDelete}
                  onMarkFilled={handleMarkFilled}
                  onCancelRequest={handleCancelRequest}
                  onReopen={handleReopen}
                  fillingId={fillingId}
                  setFillingId={setFillingId}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Form Modal ── */}
      {showForm && (
        <RequestFormModal
          initial={editing}
          roster={roster}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
    </WorshipShell>
  );
}
