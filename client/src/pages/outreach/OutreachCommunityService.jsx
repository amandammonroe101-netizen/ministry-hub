import { useMemo, useState } from 'react';
import OutreachShell from './OutreachShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import OutreachMenuSettings from './OutreachMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import './OutreachCommunityService.css';

/* ─────────────────────────────────────────────────────────────
   Outreach → Community Service

   Service projects with local impact — food bank shifts, clothing
   drives, park cleanups, repair days. Each project tracks its own
   schedule, volunteer sign-ups, and supply needs checklist.

   Storage: useUserStoreKey('outreach:community-service', []) → Firestore.
   ───────────────────────────────────────────────────────────── */

const ACCENT = 'var(--accent-rose, #fb7185)';

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_PROJECT = () => ({
  id:           makeId('ocsv'),
  title:        '',
  date:         '',
  location:     '',
  description:  '',
  signupLimit:  0,   // 0 = no limit
  volunteers:   [],  // [{ id, name }]
  supplies:     [],  // [{ id, name, qty, have }]
  createdAt:    Date.now(),
});

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OutreachCommunityService() {
  const [projects, setProjects, { loading }] = useUserStoreKey('outreach:community-service', []);
  const list = Array.isArray(projects) ? projects : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [volunteerName, setVolunteerName] = useState('');
  const [supplyDraft, setSupplyDraft] = useState({ name: '', qty: '' });

  const sorted = useMemo(
    () => [...list].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')),
    [list]
  );

  const selected = list.find(p => p.id === openId) || null;

  const addProject = () => {
    const p = DEFAULT_PROJECT();
    setProjects(prev => [...(Array.isArray(prev) ? prev : []), p]);
    setOpenId(p.id);
    setDraft(p);
    setEditing(true);
  };

  const openView = (p) => { setOpenId(p.id); setDraft(p); setEditing(false); };
  const close = () => { setOpenId(null); setDraft(null); setEditing(false); setVolunteerName(''); setSupplyDraft({ name: '', qty: '' }); };

  const saveDraft = () => {
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === draft.id ? draft : p));
    setEditing(false);
  };

  const removeProject = (id) => {
    if (!confirm('Delete this service project? This cannot be undone.')) return;
    setProjects(prev => (Array.isArray(prev) ? prev : []).filter(p => p.id !== id));
    if (openId === id) close();
  };

  const set = (field) => (e) => setDraft(d => ({ ...d, [field]: e.target.value }));

  const addVolunteer = () => {
    const name = volunteerName.trim();
    if (!name || !selected) return;
    const updated = { ...selected, volunteers: [...selected.volunteers, { id: makeId('v'), name }] };
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === selected.id ? updated : p));
    setDraft(updated);
    setVolunteerName('');
  };
  const removeVolunteer = (vid) => {
    const updated = { ...selected, volunteers: selected.volunteers.filter(v => v.id !== vid) };
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === selected.id ? updated : p));
    setDraft(updated);
  };

  const addSupply = () => {
    const name = supplyDraft.name.trim();
    if (!name || !selected) return;
    const updated = { ...selected, supplies: [...selected.supplies, { id: makeId('s'), name, qty: supplyDraft.qty.trim(), have: false }] };
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === selected.id ? updated : p));
    setDraft(updated);
    setSupplyDraft({ name: '', qty: '' });
  };
  const toggleSupply = (sid) => {
    const updated = { ...selected, supplies: selected.supplies.map(s => s.id === sid ? { ...s, have: !s.have } : s) };
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === selected.id ? updated : p));
    setDraft(updated);
  };
  const removeSupply = (sid) => {
    const updated = { ...selected, supplies: selected.supplies.filter(s => s.id !== sid) };
    setProjects(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === selected.id ? updated : p));
    setDraft(updated);
  };

  return (
    <OutreachShell
      title="Community Service"
      icon="🏘"
      subtitle="Service projects with local impact — food bank shifts, clothing drives, park cleanups, repair days. Schedule, sign-ups, and supply needs."
      actions={
        <button type="button" className="osh-btn primary" onClick={addProject}>
          ＋ Add project
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="ocsv-root" style={{ '--ocsv-accent': ACCENT }}>
        <div className="ocsv-shell">

          {loading && list.length === 0 ? (
            <div className="ocsv-loading">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="ocsv-empty">
              <div className="ocsv-empty-title">No service projects yet</div>
              <p className="ocsv-empty-sub">Add your first community service project to start tracking sign-ups and supplies.</p>
            </div>
          ) : (
            <div className="ocsv-grid">
              {sorted.map((p, i) => {
                const isPast = p.date && p.date < todayISO();
                const suppliesNeeded = p.supplies.filter(s => !s.have).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`ocsv-card${isPast ? ' is-past' : ''}`}
                    style={{ '--i': i }}
                    onClick={() => openView(p)}
                  >
                    <div className="ocsv-card-head">
                      <span className="ocsv-card-title">{p.title || '(untitled project)'}</span>
                      {isPast && <span className="ocsv-card-badge">Past</span>}
                    </div>
                    <div className="ocsv-card-meta">
                      {p.date && <span>📅 {p.date}</span>}
                      {p.location && <span>📍 {p.location}</span>}
                    </div>
                    {p.description && <p className="ocsv-card-desc">{p.description}</p>}
                    <div className="ocsv-card-foot">
                      <span>🧑‍🤝‍🧑 {p.volunteers.length}{p.signupLimit ? `/${p.signupLimit}` : ''} signed up</span>
                      {suppliesNeeded > 0 && <span className="ocsv-card-warn">📦 {suppliesNeeded} supplies needed</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {selected && draft && (
        <div className="ocsv-slide-backdrop" onClick={close}>
          <div className="ocsv-slide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ocsv-slide-close" onClick={close}>✕</button>

            {!editing ? (
              <>
                <h2 className="ocsv-view-title">{selected.title || '(untitled project)'}</h2>
                <div className="ocsv-view-meta">
                  {selected.date && <span>📅 {selected.date}</span>}
                  {selected.location && <span>📍 {selected.location}</span>}
                </div>
                {selected.description && <p className="ocsv-view-desc">{selected.description}</p>}

                <section className="ocsv-section">
                  <h3 className="ocsv-section-title">
                    🧑‍🤝‍🧑 Volunteers ({selected.volunteers.length}{selected.signupLimit ? `/${selected.signupLimit}` : ''})
                  </h3>
                  <div className="ocsv-list">
                    {selected.volunteers.map(v => (
                      <div key={v.id} className="ocsv-list-row">
                        <span>{v.name}</span>
                        <button type="button" className="ocsv-list-rm" onClick={() => removeVolunteer(v.id)}>✕</button>
                      </div>
                    ))}
                    {selected.volunteers.length === 0 && <p className="ocsv-list-empty">No volunteers signed up yet.</p>}
                  </div>
                  <div className="ocsv-add-row">
                    <input
                      type="text"
                      className="ocsv-inp"
                      placeholder="Volunteer name"
                      value={volunteerName}
                      onChange={(e) => setVolunteerName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addVolunteer(); }}
                    />
                    <button type="button" className="ocsv-add-btn" onClick={addVolunteer}>＋ Add</button>
                  </div>
                </section>

                <section className="ocsv-section">
                  <h3 className="ocsv-section-title">📦 Supply needs</h3>
                  <div className="ocsv-list">
                    {selected.supplies.map(s => (
                      <label key={s.id} className={`ocsv-supply-row${s.have ? ' have' : ''}`}>
                        <input type="checkbox" checked={s.have} onChange={() => toggleSupply(s.id)} />
                        <span className="ocsv-supply-name">{s.name}</span>
                        {s.qty && <span className="ocsv-supply-qty">×{s.qty}</span>}
                        <button type="button" className="ocsv-list-rm" onClick={(e) => { e.preventDefault(); removeSupply(s.id); }}>✕</button>
                      </label>
                    ))}
                    {selected.supplies.length === 0 && <p className="ocsv-list-empty">No supply needs listed yet.</p>}
                  </div>
                  <div className="ocsv-add-row">
                    <input
                      type="text"
                      className="ocsv-inp"
                      placeholder="Item"
                      value={supplyDraft.name}
                      onChange={(e) => setSupplyDraft(d => ({ ...d, name: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="ocsv-inp ocsv-inp-qty"
                      placeholder="Qty"
                      value={supplyDraft.qty}
                      onChange={(e) => setSupplyDraft(d => ({ ...d, qty: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') addSupply(); }}
                    />
                    <button type="button" className="ocsv-add-btn" onClick={addSupply}>＋ Add</button>
                  </div>
                </section>

                <footer className="ocsv-slide-foot">
                  <button type="button" className="ocsv-btn ocsv-btn-ghost" onClick={() => removeProject(selected.id)}>
                    🗑 Delete
                  </button>
                  <button type="button" className="ocsv-btn ocsv-btn-primary" onClick={() => setEditing(true)}>
                    ✎ Edit
                  </button>
                </footer>
              </>
            ) : (
              <>
                <h2 className="ocsv-view-title">Edit project</h2>
                <div className="ocsv-form-body">
                  <label className="ocsv-field">
                    <span className="ocsv-field-lbl">Title</span>
                    <input type="text" className="ocsv-inp" value={draft.title} onChange={set('title')} />
                  </label>
                  <label className="ocsv-field">
                    <span className="ocsv-field-lbl">Date</span>
                    <input type="date" className="ocsv-inp" value={draft.date} onChange={set('date')} />
                  </label>
                  <label className="ocsv-field">
                    <span className="ocsv-field-lbl">Location</span>
                    <input type="text" className="ocsv-inp" value={draft.location} onChange={set('location')} />
                  </label>
                  <label className="ocsv-field">
                    <span className="ocsv-field-lbl">Sign-up limit (0 = no limit)</span>
                    <input type="number" min="0" className="ocsv-inp" value={draft.signupLimit} onChange={(e) => setDraft(d => ({ ...d, signupLimit: Number(e.target.value) || 0 }))} />
                  </label>
                  <label className="ocsv-field ocsv-field-wide">
                    <span className="ocsv-field-lbl">Description</span>
                    <textarea className="ocsv-inp ocsv-textarea" value={draft.description} onChange={set('description')} />
                  </label>
                </div>
                <footer className="ocsv-slide-foot">
                  <button type="button" className="ocsv-btn ocsv-btn-ghost" onClick={() => { setDraft(selected); setEditing(false); }}>
                    Cancel
                  </button>
                  <button type="button" className="ocsv-btn ocsv-btn-primary" onClick={saveDraft}>
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
