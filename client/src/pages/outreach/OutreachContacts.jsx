import { useMemo, useState } from 'react';
import OutreachShell from './OutreachShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import OutreachMenuSettings from './OutreachMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import './OutreachContacts.css';

/* ─────────────────────────────────────────────────────────────
   Outreach → New Contacts

   Directory of people met during outreach — name, contact info,
   where met, prayer request, and the next step assigned. Simplified
   pilot version of the Women's Ministry AllWomen pattern: a
   photo-less card grid with search + filter chips, and a slide-over
   panel to view/edit one contact's full record. No calendar sync,
   no cross-ministry contact-linking — just a straightforward CRUD
   directory scoped to this ministry.

   Storage: useUserStoreKey('outreach:contacts', []) → Firestore.
   ───────────────────────────────────────────────────────────── */

const ACCENT = 'var(--accent-blue, #60a5fa)';

const NEXT_STEPS = [
  { id: '',            label: '— None' },
  { id: 'follow-up',   label: '📞 Needs follow-up' },
  { id: 'invited',     label: '✉️ Invited to church' },
  { id: 'bible-study',  label: '📖 Invited to Bible study' },
  { id: 'connected',   label: '🌱 Connected' },
];
const nextStepLabel = (id) => (NEXT_STEPS.find(s => s.id === id) || NEXT_STEPS[0]).label;

const makeId = () => 'oc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_CONTACT = () => ({
  id:             makeId(),
  name:           '',
  phone:          '',
  email:          '',
  whereMet:       '',
  dateMet:        new Date().toISOString().slice(0, 10),
  prayerRequest:  '',
  nextStep:       'follow-up',
  assignedTo:     '',
  notes:          '',
  createdAt:      Date.now(),
});

const BASE_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'needs-fu',   label: '📞 Needs follow-up' },
  { id: 'unassigned', label: '🙋 Unassigned' },
  { id: 'connected',  label: '🌱 Connected' },
];

export default function OutreachContacts() {
  const [contacts, setContacts, { loading }] = useUserStoreKey('outreach:contacts', []);
  const list = Array.isArray(contacts) ? contacts : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(c => {
      if (q && !`${c.name} ${c.whereMet} ${c.assignedTo}`.toLowerCase().includes(q)) return false;
      if (filter === 'needs-fu' && c.nextStep !== 'follow-up') return false;
      if (filter === 'unassigned' && c.assignedTo) return false;
      if (filter === 'connected' && c.nextStep !== 'connected') return false;
      return true;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [list, search, filter]);

  const stats = useMemo(() => ({
    total:      list.length,
    needsFu:    list.filter(c => c.nextStep === 'follow-up').length,
    connected:  list.filter(c => c.nextStep === 'connected').length,
  }), [list]);

  const selected = list.find(c => c.id === selectedId) || null;

  const openNew = () => {
    const c = DEFAULT_CONTACT();
    setContacts(prev => [...(Array.isArray(prev) ? prev : []), c]);
    setSelectedId(c.id);
    setDraft(c);
    setEditing(true);
  };

  const openView = (c) => {
    setSelectedId(c.id);
    setDraft(c);
    setEditing(false);
  };

  const closeSlide = () => { setSelectedId(null); setDraft(null); setEditing(false); };

  const saveDraft = () => {
    setContacts(prev => (Array.isArray(prev) ? prev : []).map(c => c.id === draft.id ? draft : c));
    setEditing(false);
  };

  const removeContact = (id) => {
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    setContacts(prev => (Array.isArray(prev) ? prev : []).filter(c => c.id !== id));
    if (selectedId === id) closeSlide();
  };

  const set = (field) => (e) => setDraft(d => ({ ...d, [field]: e.target.value }));

  return (
    <OutreachShell
      title="New Contacts"
      icon="🆕"
      subtitle="People met during outreach — name, contact info, where met, prayer request, and the next step assigned."
      actions={
        <button type="button" className="osh-btn primary" onClick={openNew}>
          ＋ Add contact
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="oct-root" style={{ '--oct-accent': ACCENT }}>
        <div className="oct-shell">

          <div className="oct-stats">
            <div className="oct-stat">
              <span className="oct-stat-n">{stats.total}</span>
              <span className="oct-stat-lbl">Total contacts</span>
            </div>
            <div className="oct-stat is-warn">
              <span className="oct-stat-n">{stats.needsFu}</span>
              <span className="oct-stat-lbl">Need follow-up</span>
            </div>
            <div className="oct-stat">
              <span className="oct-stat-n">{stats.connected}</span>
              <span className="oct-stat-lbl">Connected</span>
            </div>
          </div>

          <div className="oct-toolbar">
            <div className="oct-search-wrap">
              <span aria-hidden="true">🔍</span>
              <input
                type="text"
                placeholder="Search by name, location, or assignee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="oct-search-clear" onClick={() => setSearch('')}>✕</button>
              )}
            </div>
            <div className="oct-filters">
              {BASE_FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`oct-filter-chip${filter === f.id ? ' on' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading && list.length === 0 ? (
            <div className="oct-loading">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="oct-empty">
              <div className="oct-empty-title">No contacts yet</div>
              <p className="oct-empty-sub">
                {list.length === 0
                  ? 'Add the first person your team met during an outreach.'
                  : 'No contacts match your search or filter.'}
              </p>
            </div>
          ) : (
            <div className="oct-grid">
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className="oct-card"
                  style={{ '--i': i }}
                  onClick={() => openView(c)}
                >
                  <div className="oct-card-name">{c.name || '(unnamed contact)'}</div>
                  <div className="oct-card-meta">
                    {c.whereMet && <span>📍 {c.whereMet}</span>}
                    {c.dateMet && <span>📅 {c.dateMet}</span>}
                  </div>
                  {c.prayerRequest && (
                    <div className="oct-card-prayer">🙏 {c.prayerRequest}</div>
                  )}
                  <div className="oct-card-foot">
                    <span className="oct-card-foot-val">{nextStepLabel(c.nextStep)}</span>
                    {c.assignedTo && <span className="oct-card-foot-lbl">🙋 {c.assignedTo}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {selected && draft && (
        <div className="oct-slide-backdrop" onClick={closeSlide}>
          <div className="oct-slide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="oct-slide-close" onClick={closeSlide}>✕</button>

            {!editing ? (
              <>
                <h2 className="oct-view-title">{selected.name || '(unnamed contact)'}</h2>
                <div className="oct-view-body">
                  <ViewRow label="Phone" value={selected.phone || '—'} />
                  <ViewRow label="Email" value={selected.email || '—'} />
                  <ViewRow label="Where met" value={selected.whereMet || '—'} />
                  <ViewRow label="Date met" value={selected.dateMet || '—'} />
                  <ViewRow label="Next step" value={nextStepLabel(selected.nextStep)} />
                  <ViewRow label="Assigned to" value={selected.assignedTo || '—'} />
                  {selected.prayerRequest && (
                    <div className="oct-view-row">
                      <span className="oct-view-lbl">Prayer request</span>
                      <p className="oct-view-val">{selected.prayerRequest}</p>
                    </div>
                  )}
                  {selected.notes && (
                    <div className="oct-view-row">
                      <span className="oct-view-lbl">Notes</span>
                      <p className="oct-view-val">{selected.notes}</p>
                    </div>
                  )}
                </div>
                <footer className="oct-slide-foot">
                  <button type="button" className="oct-btn oct-btn-ghost" onClick={() => removeContact(selected.id)}>
                    🗑 Delete
                  </button>
                  <button type="button" className="oct-btn oct-btn-primary" onClick={() => setEditing(true)}>
                    ✎ Edit
                  </button>
                </footer>
              </>
            ) : (
              <>
                <h2 className="oct-view-title">Edit contact</h2>
                <div className="oct-form-body">
                  <label className="oct-field">
                    <span className="oct-field-lbl">Name</span>
                    <input type="text" className="oct-inp" value={draft.name} onChange={set('name')} />
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Phone</span>
                    <input type="tel" className="oct-inp" value={draft.phone} onChange={set('phone')} />
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Email</span>
                    <input type="email" className="oct-inp" value={draft.email} onChange={set('email')} />
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Where met</span>
                    <input type="text" className="oct-inp" value={draft.whereMet} onChange={set('whereMet')} placeholder="e.g. Downtown block party" />
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Date met</span>
                    <input type="date" className="oct-inp" value={draft.dateMet} onChange={set('dateMet')} />
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Next step</span>
                    <select className="oct-inp" value={draft.nextStep} onChange={set('nextStep')}>
                      {NEXT_STEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="oct-field">
                    <span className="oct-field-lbl">Assigned to</span>
                    <input type="text" className="oct-inp" value={draft.assignedTo} onChange={set('assignedTo')} placeholder="Team member's name" />
                  </label>
                  <label className="oct-field oct-field-wide">
                    <span className="oct-field-lbl">Prayer request</span>
                    <textarea className="oct-inp oct-textarea" value={draft.prayerRequest} onChange={set('prayerRequest')} />
                  </label>
                  <label className="oct-field oct-field-wide">
                    <span className="oct-field-lbl">Notes</span>
                    <textarea className="oct-inp oct-textarea" value={draft.notes} onChange={set('notes')} />
                  </label>
                </div>
                <footer className="oct-slide-foot">
                  <button type="button" className="oct-btn oct-btn-ghost" onClick={() => { setDraft(selected); setEditing(false); }}>
                    Cancel
                  </button>
                  <button type="button" className="oct-btn oct-btn-primary" onClick={saveDraft}>
                    Save
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🤲 Customize Menu"
        pageSettings={<OutreachMenuSettings />}
      />
    </OutreachShell>
  );
}

function ViewRow({ label, value }) {
  return (
    <div className="oct-view-row">
      <span className="oct-view-lbl">{label}</span>
      <span className="oct-view-val">{value}</span>
    </div>
  );
}
