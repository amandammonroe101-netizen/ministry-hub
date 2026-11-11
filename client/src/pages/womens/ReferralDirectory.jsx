import { useMemo, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
/* .ys-* form primitives (Youth roster) + .app-* shell classes (shared) —
   same reuse pattern as Life Stages. Everything else on this page
   (category sidebar, dashboard, directory list) is purpose-built,
   prefix .rld-*, see ReferralDirectory.css — same rose-gold embossed
   design system as LifeStages.css, not the AllWomen dark-glass grid
   this page used to borrow. */
import '../youth/AllStudents.css';
import './ReferralDirectory.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Care → Referral Directory

   Standing directory of counselors, hotlines, and outside
   organizations referred to repeatedly from Crisis & Counseling
   (and anywhere else care comes up) — kept as its own page so it
   isn't re-typed on every case.

   Laid out the same way as Life Stages: a category sidebar on the
   left sets what the detail pane on the right is scoped to —
   1. Category sidebar — categories stacked vertically with counts,
      "All" pinned at top. Picking one scopes the dashboard + list.
   2. Category dashboard — total / active / data-quality stats for
      whatever's currently selected in the sidebar.
   3. Directory list — search + inactive toggle, then resources as
      embossed rows. Clicking a row expands its editor inline in
      place (no overlay/slide-over).

   Storage: useUserStoreKey('womens:care-resources', [])
   Crisis & Counseling reads this same key (read-only there) to
   let a case log which resources were given.
   ───────────────────────────────────────────────────────────── */

const CATEGORY_META = {
  counselor:    { label: 'Counselor / Therapist', icon: '🧑‍⚕️' },
  hotline:      { label: 'Hotline',                icon: '☎️' },
  organization: { label: 'Support Org',            icon: '🏢' },
  financial:    { label: 'Financial Assistance',   icon: '💵' },
  legal:        { label: 'Legal Aid',              icon: '⚖️' },
  medical:      { label: 'Medical',                icon: '🩺' },
  other:        { label: 'Other',                  icon: '📌' },
};
const CATEGORY_ORDER = ['counselor', 'hotline', 'organization', 'financial', 'legal', 'medical', 'other'];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_RESOURCE = () => ({
  id:            makeId('res'),
  name:          '',
  category:      'counselor',
  phone:         '',
  website:       '',
  address:       '',
  specialty:     '',
  cost:          '',
  referralNotes: '',
  active:        true,
  createdAt:     Date.now(),
});

export default function ReferralDirectory() {
  const [resources, setResources, { loading }] = useUserStoreKey('womens:care-resources', []);
  const list = Array.isArray(resources) ? resources : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const addResource = () => {
    const r = DEFAULT_RESOURCE();
    setResources(prev => [...(prev || []), r]);
    setCategoryFilter('all');
    setSelectedId(r.id);
  };

  const updateResource = (id, patch) => {
    setResources(prev => (prev || []).map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeResource = (id) => {
    setResources(prev => (prev || []).filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const countFor = (categoryId) => list.filter(r => {
    if (!showInactive && r.active === false) return false;
    return (r.category || 'other') === categoryId;
  }).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (!showInactive) out = out.filter(r => r.active !== false);
    if (categoryFilter !== 'all') out = out.filter(r => (r.category || 'other') === categoryFilter);
    if (q) {
      out = out.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.specialty || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, categoryFilter, showInactive]);

  const dashboard = useMemo(() => {
    const scoped = categoryFilter === 'all' ? list : list.filter(r => (r.category || 'other') === categoryFilter);
    const active = scoped.filter(r => r.active !== false);
    return {
      total:    scoped.length,
      active:   active.length,
      noPhone:  active.filter(r => !(r.phone || '').trim()).length,
      noNotes:  active.filter(r => !(r.referralNotes || '').trim()).length,
    };
  }, [list, categoryFilter]);

  const activeMeta = categoryFilter === 'all'
    ? { label: 'All Resources', icon: '📇' }
    : CATEGORY_META[categoryFilter];

  return (
    <WomensShell
      title="Referral Directory"
      icon="📇"
      subtitle="Standing directory of counselors, hotlines, and outside organizations to refer women to — phone, cost, specialty, and referral notes."
      actions={
        <button type="button" className="wms-btn primary" onClick={addResource}>
          ✦ New resource
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
        <div className="rld-empty-note" style={{ flex: 1 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="rld-empty app-empty">
          <div className="app-empty-icon">📇</div>
          <div className="app-empty-title">No resources yet</div>
          <div className="app-empty-sub">
            Build a standing directory of counselors, hotlines, and outside
            organizations — Crisis & Counseling can reference these on any case.
          </div>
          <button type="button" className="app-btn primary" onClick={addResource}>
            ✦ Add your first resource
          </button>
        </div>
      ) : (
        <div className="rld-root">
          <CategorySidebar
            activeCategory={categoryFilter}
            onSelect={setCategoryFilter}
            totalCount={list.filter(r => showInactive || r.active !== false).length}
            countFor={countFor}
          />

          <div className="rld-detail">
            <section className="rld-panel">
              <div className="rld-panel-hd">
                <span className="rld-panel-icon">{activeMeta.icon}</span>
                <h2 className="rld-panel-title">{activeMeta.label}</h2>
              </div>
              <div className="rld-stat-row">
                <div className="rld-stat">
                  <span className="rld-stat-n">{dashboard.total}</span>
                  <span className="rld-stat-lbl">Resources</span>
                </div>
                <div className="rld-stat">
                  <span className="rld-stat-n">{dashboard.active}</span>
                  <span className="rld-stat-lbl">Active</span>
                </div>
                <div className="rld-stat is-warn">
                  <span className="rld-stat-n">{dashboard.noPhone}</span>
                  <span className="rld-stat-lbl">No phone on file</span>
                </div>
                <div className="rld-stat is-warn">
                  <span className="rld-stat-n">{dashboard.noNotes}</span>
                  <span className="rld-stat-lbl">No referral notes</span>
                </div>
              </div>
            </section>

            <section className="rld-panel">
              <div className="rld-panel-row">
                <h3 className="rld-panel-subtitle">Directory</h3>
              </div>

              <div className="rld-controls">
                <div className="rld-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by name, specialty, phone…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="rld-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
                <label className="rld-inactive-toggle">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  <span>Show inactive</span>
                </label>
              </div>

              {visible.length === 0 ? (
                <div className="rld-empty-note">
                  {query ? `No resources match "${query}".` : 'No resources match this filter.'}
                </div>
              ) : (
                <ul className="rld-list">
                  {visible.map(r => (
                    <ResourceRow
                      key={r.id}
                      resource={r}
                      expanded={selectedId === r.id}
                      onToggle={() => setSelectedId(selectedId === r.id ? null : r.id)}
                      onChange={(patch) => updateResource(r.id, patch)}
                      onDelete={() => removeResource(r.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}

/* ── 1. Category sidebar ──────────────────────────────────────── */
function CategorySidebar({ activeCategory, onSelect, totalCount, countFor }) {
  return (
    <nav className="rld-sidebar" aria-label="Resource categories">
      <button
        type="button"
        className={`rld-node${activeCategory === 'all' ? ' on' : ''}`}
        onClick={() => onSelect('all')}
      >
        <span className="rld-node-icon">📇</span>
        <span className="rld-node-name">All</span>
        <span className="rld-node-count">{totalCount}</span>
      </button>
      <div className="rld-sidebar-list">
        {CATEGORY_ORDER.map(id => (
          <button
            key={id}
            type="button"
            className={`rld-node${activeCategory === id ? ' on' : ''}`}
            onClick={() => onSelect(id)}
          >
            <span className="rld-node-icon">{CATEGORY_META[id].icon}</span>
            <span className="rld-node-name">{CATEGORY_META[id].label}</span>
            <span className="rld-node-count">{countFor(id)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ── 2/3. Directory row — collapsed card, expands to inline editor ─ */
function ResourceRow({ resource, expanded, onToggle, onChange, onDelete }) {
  const meta = CATEGORY_META[resource.category || 'other'] || CATEGORY_META.other;
  return (
    <li className={`rld-row${expanded ? ' expanded' : ''}`}>
      <button type="button" className="rld-row-summary" onClick={onToggle}>
        <span className="rld-row-icon">{meta.icon}</span>
        <span className="rld-row-main">
          <span className="rld-row-top">
            <span className="rld-row-title">{resource.name || '(unnamed resource)'}</span>
            {resource.active === false && <span className="rld-badge is-inactive">Inactive</span>}
          </span>
          <span className="rld-row-sub">
            {meta.label}
            {resource.phone && <> · ☎️ {resource.phone}</>}
            {resource.specialty && <> · {resource.specialty}</>}
          </span>
        </span>
        {resource.cost && <span className="rld-row-cost">{resource.cost}</span>}
        <span className="rld-row-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ResourceEditor resource={resource} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

function ResourceEditor({ resource, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <form className="ys-form rld-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="rld-detail-icon">{CATEGORY_META[resource.category || 'other'].icon}</span>
          <input
            type="text"
            className="ys-inp rld-title-inp"
            value={resource.name || ''}
            onChange={set('name')}
            placeholder="Resource name"
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

      <Section title="Details">
        <Row>
          <Field label="Category">
            <select className="ys-inp" value={resource.category || 'other'} onChange={set('category')}>
              {CATEGORY_ORDER.map(id => <option key={id} value={id}>{CATEGORY_META[id].icon} {CATEGORY_META[id].label}</option>)}
            </select>
          </Field>
          <Field label="Active">
            <label className="rld-active-check">
              <input type="checkbox" checked={resource.active !== false} onChange={set('active')} />
              <span>Currently referring here</span>
            </label>
          </Field>
        </Row>
        <Row>
          <Field label="Phone">
            <input type="text" className="ys-inp" value={resource.phone || ''} onChange={set('phone')} placeholder="e.g. (555) 123-4567" />
          </Field>
          <Field label="Website">
            <input type="text" className="ys-inp" value={resource.website || ''} onChange={set('website')} placeholder="https://…" />
          </Field>
        </Row>
        <Field label="Address">
          <input type="text" className="ys-inp" value={resource.address || ''} onChange={set('address')} placeholder="Optional" />
        </Field>
        <Field label="Specialty">
          <input type="text" className="ys-inp" value={resource.specialty || ''} onChange={set('specialty')} placeholder="e.g. Trauma, grief, marriage counseling…" />
        </Field>
        <Field label="Cost / insurance">
          <input type="text" className="ys-inp" value={resource.cost || ''} onChange={set('cost')} placeholder="e.g. Sliding scale, accepts Medicaid, free…" />
        </Field>
      </Section>

      <Section title="Referral notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={4}
          value={resource.referralNotes || ''}
          onChange={set('referralNotes')}
          placeholder="How to make a referral, what to tell her to expect, wait times…"
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
