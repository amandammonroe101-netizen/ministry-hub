import { useMemo, useState } from 'react';
import MissionsShell from './MissionsShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './MissionsFlagship.css';

/* ─────────────────────────────────────────────────────────────
   Missions → Our Sent Ones

   Directory of missionaries sent out from this church — field,
   sending agency, family, term length, current status, and the
   home-church liaison who keeps in touch with them.

   Laid out like Women's Referral Directory: a status sidebar on
   the left scopes the dashboard + list on the right; clicking a
   row expands an inline editor in place (no overlay).

   Storage: useUserStoreKey('missions:sent-ones', [])
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  active:     { label: 'Active on Field',    icon: '🌍' },
  furlough:   { label: 'Furlough',           icon: '🏠' },
  transition: { label: 'In Transition',      icon: '🔄' },
  departing:  { label: 'Preparing to Depart', icon: '🧳' },
};
const STATUS_ORDER = ['active', 'furlough', 'transition', 'departing'];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_SENT_ONE = () => ({
  id:          makeId('sent'),
  name:        '',
  field:       '',
  agency:      '',
  family:      '',
  termLength:  '',
  status:      'active',
  liaison:     '',
  phone:       '',
  email:       '',
  bio:         '',
  createdAt:   Date.now(),
});

export default function MissionsSentOnes() {
  const [sentOnes, setSentOnes, { loading }] = useUserStoreKey('missions:sent-ones', []);
  const list = Array.isArray(sentOnes) ? sentOnes : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const addSentOne = () => {
    const s = DEFAULT_SENT_ONE();
    setSentOnes(prev => [...(prev || []), s]);
    setStatusFilter('all');
    setSelectedId(s.id);
  };

  const updateSentOne = (id, patch) => {
    setSentOnes(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeSentOne = (id) => {
    setSentOnes(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const countFor = (statusId) => list.filter(s => (s.status || 'active') === statusId).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (statusFilter !== 'all') out = out.filter(s => (s.status || 'active') === statusFilter);
    if (q) {
      out = out.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.field || '').toLowerCase().includes(q) ||
        (s.agency || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, statusFilter]);

  const dashboard = useMemo(() => {
    const scoped = statusFilter === 'all' ? list : list.filter(s => (s.status || 'active') === statusFilter);
    return {
      total:       scoped.length,
      active:      scoped.filter(s => (s.status || 'active') === 'active').length,
      noLiaison:   scoped.filter(s => !(s.liaison || '').trim()).length,
      noContact:   scoped.filter(s => !(s.phone || '').trim() && !(s.email || '').trim()).length,
    };
  }, [list, statusFilter]);

  const activeMeta = statusFilter === 'all'
    ? { label: 'All Sent Ones', icon: '🧑‍🤝‍🧑' }
    : STATUS_META[statusFilter];

  return (
    <MissionsShell
      title="Our Sent Ones"
      icon="🧑‍🤝‍🧑"
      subtitle="Missionaries we have sent from our church — field, sending agency, family, term length, current status, and home-church liaison."
      actions={
        <button type="button" className="app-btn primary" onClick={addSentOne}>
          ✦ New sent one
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
        <div className="msf-empty-note" style={{ flex: 1 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="app-empty">
          <div className="app-empty-icon">🧑‍🤝‍🧑</div>
          <div className="app-empty-title">No sent ones yet</div>
          <div className="app-empty-sub">
            Build a directory of missionaries this church has sent out —
            field, agency, family, term, and who's keeping in touch.
          </div>
          <button type="button" className="app-btn primary" onClick={addSentOne}>
            ✦ Add your first sent one
          </button>
        </div>
      ) : (
        <div className="msf-root">
          <nav className="msf-sidebar" aria-label="Sent one status">
            <button
              type="button"
              className={`msf-node${statusFilter === 'all' ? ' on' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <span className="msf-node-icon">🧑‍🤝‍🧑</span>
              <span className="msf-node-name">All</span>
              <span className="msf-node-count">{list.length}</span>
            </button>
            <div className="msf-sidebar-list">
              {STATUS_ORDER.map(id => (
                <button
                  key={id}
                  type="button"
                  className={`msf-node${statusFilter === id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  <span className="msf-node-icon">{STATUS_META[id].icon}</span>
                  <span className="msf-node-name">{STATUS_META[id].label}</span>
                  <span className="msf-node-count">{countFor(id)}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="msf-detail">
            <section className="msf-panel">
              <div className="msf-panel-hd">
                <span className="msf-panel-icon">{activeMeta.icon}</span>
                <h2 className="msf-panel-title">{activeMeta.label}</h2>
              </div>
              <div className="msf-stat-row">
                <div className="msf-stat">
                  <span className="msf-stat-n">{dashboard.total}</span>
                  <span className="msf-stat-lbl">Sent ones</span>
                </div>
                <div className="msf-stat">
                  <span className="msf-stat-n">{dashboard.active}</span>
                  <span className="msf-stat-lbl">Active on field</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.noLiaison}</span>
                  <span className="msf-stat-lbl">No liaison on file</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.noContact}</span>
                  <span className="msf-stat-lbl">No contact on file</span>
                </div>
              </div>
            </section>

            <section className="msf-panel">
              <div className="msf-panel-row">
                <h3 className="msf-panel-subtitle">Directory</h3>
              </div>

              <div className="msf-controls">
                <div className="msf-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by name, field, agency…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="msf-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="msf-empty-note">
                  {query ? `No sent ones match "${query}".` : 'No sent ones match this filter.'}
                </div>
              ) : (
                <ul className="msf-list">
                  {visible.map(s => (
                    <SentOneRow
                      key={s.id}
                      sentOne={s}
                      expanded={selectedId === s.id}
                      onToggle={() => setSelectedId(selectedId === s.id ? null : s.id)}
                      onChange={(patch) => updateSentOne(s.id, patch)}
                      onDelete={() => removeSentOne(s.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </MissionsShell>
  );
}

function SentOneRow({ sentOne, expanded, onToggle, onChange, onDelete }) {
  const meta = STATUS_META[sentOne.status || 'active'] || STATUS_META.active;
  return (
    <li className={`msf-row${expanded ? ' expanded' : ''}`} style={{ '--msf-card-accent': '#3d8bbd' }}>
      <button type="button" className="msf-row-summary" onClick={onToggle}>
        <span className="msf-row-icon">{meta.icon}</span>
        <span className="msf-row-main">
          <span className="msf-row-top">
            <span className="msf-row-title">{sentOne.name || '(unnamed sent one)'}</span>
            <span className="msf-badge" style={{ '--msf-badge-accent': '#3d8bbd' }}>{meta.label}</span>
          </span>
          <span className="msf-row-sub">
            {sentOne.field || 'Field not set'}
            {sentOne.agency && <> · {sentOne.agency}</>}
            {sentOne.termLength && <> · {sentOne.termLength}</>}
          </span>
        </span>
        {sentOne.liaison && <span className="msf-row-meta">Liaison: {sentOne.liaison}</span>}
        <span className="msf-row-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <SentOneEditor sentOne={sentOne} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

function SentOneEditor({ sentOne, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  return (
    <form className="ys-form msf-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 20 }}>{STATUS_META[sentOne.status || 'active'].icon}</span>
          <input
            type="text"
            className="ys-inp msf-title-inp"
            value={sentOne.name || ''}
            onChange={set('name')}
            placeholder="Sent one's name"
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

      <Section title="Field & Sending">
        <Row>
          <Field label="Field / Country">
            <input type="text" className="ys-inp" value={sentOne.field || ''} onChange={set('field')} placeholder="e.g. Northern Thailand" />
          </Field>
          <Field label="Status">
            <select className="ys-inp" value={sentOne.status || 'active'} onChange={set('status')}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Sending agency">
            <input type="text" className="ys-inp" value={sentOne.agency || ''} onChange={set('agency')} placeholder="e.g. Wycliffe, IMB…" />
          </Field>
          <Field label="Term length">
            <input type="text" className="ys-inp" value={sentOne.termLength || ''} onChange={set('termLength')} placeholder="e.g. 4-year term" />
          </Field>
        </Row>
        <Field label="Family">
          <input type="text" className="ys-inp" value={sentOne.family || ''} onChange={set('family')} placeholder="e.g. Spouse + 2 kids" />
        </Field>
      </Section>

      <Section title="Home-church contact">
        <Row>
          <Field label="Home-church liaison">
            <input type="text" className="ys-inp" value={sentOne.liaison || ''} onChange={set('liaison')} placeholder="Who keeps in touch with them" />
          </Field>
          <Field label="Phone">
            <input type="text" className="ys-inp" value={sentOne.phone || ''} onChange={set('phone')} placeholder="Optional" />
          </Field>
        </Row>
        <Field label="Email">
          <input type="text" className="ys-inp" value={sentOne.email || ''} onChange={set('email')} placeholder="Optional" />
        </Field>
      </Section>

      <Section title="Notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={4}
          value={sentOne.bio || ''}
          onChange={set('bio')}
          placeholder="Background, ministry focus, prayer points…"
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
