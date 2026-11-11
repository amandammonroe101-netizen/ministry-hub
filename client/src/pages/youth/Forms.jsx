import { useMemo, useState, useEffect } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Forms.css';

/* Youth → Forms & Permissions
   Storage: youth:forms — array of form templates with per-student status. */

const ACCENT = '#713f12';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_FORM = () => ({
  id:          makeId('f'),
  title:       '',
  type:        'Permission slip',
  forEvent:    '',           // free text or trip name
  dueDate:     '',
  instructions:'',
  status:      {},           // { studentId: 'signed'|'pending'|'missing' }
  createdAt:   Date.now(),
});

const TYPES = ['Permission slip', 'Medical release', 'Photo release', 'Registration', 'Waiver', 'Code of conduct', 'Other'];

export default function Forms() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [forms, setForms, { loading }] = useUserStoreKey('youth:forms', []);
  const [students] = useUserStoreKey('youth:students', []);
  /* Pull upcoming events from the three event-bearing stores so the
     "For event" field in the editor can be a dropdown sourced from
     live youth data instead of free-text typing. */
  const [weeklyNights] = useUserStoreKey('youth:weeklyNights', []);
  const [trips]        = useUserStoreKey('youth:trips', []);
  const [outreach]     = useUserStoreKey('youth:outreach', []);
  const list        = Array.isArray(forms)    ? forms    : [];
  const studentList = Array.isArray(students) ? students : [];

  /* Build the grouped picker source — only upcoming-or-very-recent
     events to keep the dropdown manageable. */
  const availableEvents = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isUpcoming = (iso) => {
      if (!iso) return true;
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && d.getTime() >= today.getTime() - 86400000;
    };
    const wn = (Array.isArray(weeklyNights) ? weeklyNights : [])
      .filter(n => isUpcoming(n.date))
      .map(n => ({ key: `wn:${n.id}`, kind: 'weekly-night', label: n.theme || 'Youth Night', date: n.date }));
    const tr = (Array.isArray(trips) ? trips : [])
      .filter(t => isUpcoming(t.startDate || t.start_date))
      .map(t => ({ key: `trip:${t.id}`, kind: 'trip', label: t.name || 'Trip', date: t.startDate || t.start_date || '' }));
    const ou = (Array.isArray(outreach) ? outreach : [])
      .filter(o => isUpcoming(o.date || o.event_date))
      .map(o => ({ key: `outreach:${o.id}`, kind: 'outreach', label: o.title || 'Outreach', date: o.date || o.event_date || '' }));
    const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
    return {
      weeklyNights: wn.sort(byDate),
      trips:        tr.sort(byDate),
      outreach:     ou.sort(byDate),
    };
  }, [weeklyNights, trips, outreach]);

  const [openId, setOpenId] = useState(null);

  const open = openId ? list.find(f => f.id === openId) : null;

  const add = () => {
    const f = DEFAULT_FORM();
    setForms(prev => [...(prev || []), f]);
    setOpenId(f.id);
  };
  const update = (id, patch) =>
    setForms(prev => (prev || []).map(f => f.id === id ? { ...f, ...patch } : f));
  const remove = (id) => {
    if (!confirm('Remove this form?')) return;
    setForms(prev => (prev || []).filter(f => f.id !== id));
    if (openId === id) setOpenId(null);
  };

  /** Annual refresh — clone every form whose type is one of the
   *  annually-renewable ones (medical / photo release / code of
   *  conduct). The clones get a fresh status map (so every parent
   *  needs to re-sign), a +1 year due date, and the title gets
   *  "(YYYY)" appended for filing. */
  const ANNUAL_TYPES = ['Medical release', 'Photo release', 'Code of conduct'];
  const annualRefresh = () => {
    const candidates = list.filter(f => ANNUAL_TYPES.includes(f.type));
    if (candidates.length === 0) {
      alert('No annually-renewable forms to refresh. Make sure your form types are set to "Medical release", "Photo release", or "Code of conduct".');
      return;
    }
    if (!confirm(`This will create ${candidates.length} fresh form${candidates.length === 1 ? '' : 's'} (one per annually-renewable form) with cleared status maps. Continue?`)) return;
    const year = new Date().getFullYear() + 1;
    const fresh = candidates.map(f => {
      const dueDate = (() => {
        if (!f.dueDate) {
          const d = new Date(); d.setFullYear(d.getFullYear() + 1);
          return d.toISOString().slice(0, 10);
        }
        const d = new Date(f.dueDate);
        if (Number.isNaN(d.getTime())) return f.dueDate;
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
      })();
      return {
        ...f,
        id: makeId('f'),
        title: f.title?.replace(/\s*\(\d{4}\)\s*$/, '') + ` (${year})`,
        dueDate,
        status: {},
        celebratedAt: '',
        createdAt: Date.now(),
      };
    });
    setForms(prev => [...fresh, ...(prev || [])]);
    alert(`Created ${fresh.length} refreshed form${fresh.length === 1 ? '' : 's'}. Head to Parent Communication to schedule reminder series for each.`);
  };

  const setStatus = (formId, studentId, status) => {
    const f = list.find(f => f.id === formId);
    if (!f) return;
    update(formId, { status: { ...f.status, [studentId]: status } });
  };

  return (
    <YouthShell
      groupLabel="Records" groupIcon="🗂"
      icon="📝" title="Forms & Permissions"
      accent={ACCENT}
      subtitle="Form templates and a per-student status tracker. See at a glance who's signed, pending, or missing."
      actions={
        <>
          <button
            className="yps-btn"
            onClick={annualRefresh}
            title="Clone every Medical / Photo release / Code of conduct form for next year, with cleared status maps so every parent re-signs"
          >🔄 Annual refresh</button>
          <button className="yps-add-btn" onClick={add}>＋ New form</button>
        </>
      }
      stats={[
        { n: list.length, label: 'forms' },
        { n: list.reduce((a, f) => a + Object.values(f.status || {}).filter(s => s === 'signed').length, 0), label: 'signed total' },
        { n: list.reduce((a, f) => a + Object.values(f.status || {}).filter(s => s === 'missing').length, 0), label: 'missing' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">📝</div><div className="yps-empty-title">Loading…</div></div>
      ) : list.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">📝</div>
          <div className="yps-empty-title">No forms yet</div>
          <div className="yps-empty-sub">Tap "＋ New form" to set up your first — permission slip, medical release, photo release, etc.</div>
        </div>
      ) : (
        <div className="yf-grid">
          {list.map(f => {
            const counts = {
              signed:  Object.values(f.status || {}).filter(s => s === 'signed').length,
              pending: Object.values(f.status || {}).filter(s => s === 'pending').length,
              missing: studentList.length - Object.values(f.status || {}).filter(s => s === 'signed' || s === 'pending').length,
            };
            return (
              <article key={f.id} className="yf-card" onClick={() => setOpenId(f.id)}>
                <header className="yf-card-hd">
                  <h3>{f.title || 'Untitled form'}</h3>
                  <span className="yps-pill accent">{f.type}</span>
                </header>
                {f.forEvent && <div className="yf-event">📅 {f.forEvent}</div>}
                {f.dueDate && <div className="yf-due">Due {f.dueDate}</div>}
                <div className="yf-counts">
                  <span className="yf-c-signed">✓ {counts.signed} signed</span>
                  <span className="yf-c-pending">⏳ {counts.pending} pending</span>
                  <span className="yf-c-missing">✗ {Math.max(0, counts.missing)} missing</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <FormEditor
          form={open}
          students={studentList}
          availableEvents={availableEvents}
          onChange={(p) => update(open.id, p)}
          onSetStatus={(sid, st) => setStatus(open.id, sid, st)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

function FormEditor({ form, students, availableEvents, onChange, onSetStatus, onDelete, onClose }) {
  const [tab, setTab] = useState('details');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter(s => !q || (s.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, query]);

  /* When the user picks an event from the dropdown, store the label
     as the form's forEvent (backwards-compatible — Parents page
     matches forms↔events by name today). If the form has no due
     date yet AND the picked event has one, auto-fill it as a
     convenience so the user doesn't have to type it twice. */
  const onPickEvent = (label, date) => {
    const patch = { forEvent: label };
    if (date && !form.dueDate) patch.dueDate = date;
    onChange(patch);
  };

  return (
    <div className="yf-modal-backdrop" onClick={onClose}>
      <div className="yf-modal" onClick={e => e.stopPropagation()}>
        <header className="yf-modal-hd">
          <h2>{form.title || 'New form'}</h2>
          <button className="yps-btn ghost" onClick={onClose}>✕</button>
        </header>

        <nav className="yf-tabs-row">
          <button className={`yps-chip ${tab === 'details' ? 'on' : ''}`} onClick={() => setTab('details')}>Details</button>
          <button className={`yps-chip ${tab === 'tracker' ? 'on' : ''}`} onClick={() => setTab('tracker')}>Tracker ({students.length})</button>
        </nav>

        {tab === 'details' && (
          <div className="yf-grid-form">
            <Field label="Title" full><input className="yps-input" value={form.title} onChange={e => onChange({ title: e.target.value })} /></Field>
            <Field label="Type"><select className="yps-select" value={form.type} onChange={e => onChange({ type: e.target.value })}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select></Field>
            <Field label="For event">
              <EventPicker
                value={form.forEvent}
                available={availableEvents}
                onPick={onPickEvent}
              />
            </Field>
            <Field label="Due date" full><input type="date" className="yps-input" value={form.dueDate} onChange={e => onChange({ dueDate: e.target.value })} /></Field>
            <Field label="Instructions" full><textarea className="yps-textarea" rows={5} value={form.instructions} onChange={e => onChange({ instructions: e.target.value })} placeholder="What needs to be signed, where to return it, who to ask…" /></Field>
          </div>
        )}

        {tab === 'tracker' && (
          <div className="yf-tracker">
            {students.length === 0 ? (
              <div className="yps-empty">
                <div className="yps-empty-icon">👥</div>
                <div className="yps-empty-title">No students in your roster</div>
                <div className="yps-empty-sub">Add students from the All Students page first.</div>
              </div>
            ) : (
              <>
                <input className="yps-input yf-search" placeholder="Search students…" value={query} onChange={e => setQuery(e.target.value)} />
                <ul className="yf-tracker-list">
                  {visible.map(s => {
                    const st = form.status?.[s.id] || 'missing';
                    return (
                      <li key={s.id} className="yf-tracker-row">
                        <span className="yf-tracker-name">{s.name || '(unnamed)'}</span>
                        <div className="yf-tracker-actions">
                          {['signed', 'pending', 'missing'].map(opt => (
                            <button
                              key={opt}
                              className={`yps-chip yf-status-${opt} ${st === opt ? 'on' : ''}`}
                              onClick={() => onSetStatus(s.id, opt)}
                            >{opt}</button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        <footer className="yf-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete form</button>
          <button className="yps-add-btn" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EventPicker — grouped dropdown for the form's "For event" field.
   Sources upcoming events from Weekly Nights, Trips & Retreats,
   and Outreach. The user can also pick "✏️ Custom…" to type a
   free-text event name (for external camps, conferences, etc.).
   ───────────────────────────────────────────────────────────── */
function EventPicker({ value, available, onPick }) {
  /* All known event labels — used to detect whether the current
     `value` matches a known event vs. a free-text custom entry. */
  const allLabels = useMemo(() => {
    const s = new Set();
    [...available.weeklyNights, ...available.trips, ...available.outreach]
      .forEach(e => s.add(e.label));
    return s;
  }, [available]);

  const isCustom = !!value && !allLabels.has(value);
  const [showCustom, setShowCustom] = useState(isCustom);
  /* Keep showCustom in sync when the form switches to a different
     stored value (e.g. user picks a known event after typing custom). */
  useEffect(() => { setShowCustom(isCustom); }, [isCustom]);

  /* Find the picked event's key for the <select>'s current value. */
  const pickedKey = useMemo(() => {
    if (!value) return '';
    if (showCustom) return '__custom__';
    const match = [...available.weeklyNights, ...available.trips, ...available.outreach]
      .find(e => e.label === value);
    return match?.key || '';
  }, [value, available, showCustom]);

  const handleSelect = (e) => {
    const key = e.target.value;
    if (key === '') {
      setShowCustom(false);
      onPick('', '');
      return;
    }
    if (key === '__custom__') {
      setShowCustom(true);
      onPick('', '');                  // clear so the text input starts empty
      return;
    }
    const ev = [...available.weeklyNights, ...available.trips, ...available.outreach]
      .find(x => x.key === key);
    if (!ev) return;
    setShowCustom(false);
    onPick(ev.label, ev.date);
  };

  const totalCount = available.weeklyNights.length + available.trips.length + available.outreach.length;

  return (
    <div className="yf-event-picker">
      <select
        className="yps-select yf-event-select"
        value={pickedKey}
        onChange={handleSelect}
      >
        <option value="">— No event</option>
        {available.weeklyNights.length > 0 && (
          <optgroup label="🌙 Weekly Nights">
            {available.weeklyNights.map(e => (
              <option key={e.key} value={e.key}>{e.label}{e.date ? ` · ${e.date}` : ''}</option>
            ))}
          </optgroup>
        )}
        {available.trips.length > 0 && (
          <optgroup label="🧳 Trips & Retreats">
            {available.trips.map(e => (
              <option key={e.key} value={e.key}>{e.label}{e.date ? ` · ${e.date}` : ''}</option>
            ))}
          </optgroup>
        )}
        {available.outreach.length > 0 && (
          <optgroup label="🤝 Outreach">
            {available.outreach.map(e => (
              <option key={e.key} value={e.key}>{e.label}{e.date ? ` · ${e.date}` : ''}</option>
            ))}
          </optgroup>
        )}
        <option value="__custom__">✏️ Custom event (type your own)</option>
      </select>

      {showCustom && (
        <input
          className="yps-input yf-event-custom"
          value={value}
          onChange={e => onPick(e.target.value, '')}
          placeholder="e.g. Summer Camp 2026 (external)"
          autoFocus
        />
      )}

      {totalCount === 0 && !showCustom && (
        <div className="yf-event-hint">
          No upcoming events in Weekly Nights, Trips, or Outreach — pick <b>✏️ Custom event</b> above to type one in.
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yf-field ${full ? 'full' : ''}`}>
      <span className="yf-field-label">{label}</span>
      {children}
    </label>
  );
}
