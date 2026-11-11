import { useMemo, useState } from 'react';
import MissionsShell from './MissionsShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './MissionsFlagship.css';

/* ─────────────────────────────────────────────────────────────
   Missions → Field → Field Updates

   Newsletters, prayer letters, and reports from missionaries —
   searchable, archived per sender. Laid out as a reverse-
   chronological feed rather than the sidebar+dashboard layout the
   other flagship pages use, since updates are read in order, not
   triaged by status.

   Storage: useUserStoreKey('missions:field-updates', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_UPDATE = () => ({
  id:        makeId('upd'),
  sender:    '',
  region:    '',
  title:     '',
  date:      new Date().toISOString().slice(0, 10),
  body:      '',
  createdAt: Date.now(),
});

export default function MissionsFieldUpdates() {
  const [updates, setUpdates, { loading }] = useUserStoreKey('missions:field-updates', []);
  const list = Array.isArray(updates) ? updates : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  const addUpdate = () => {
    const u = DEFAULT_UPDATE();
    setUpdates(prev => [...(prev || []), u]);
    setSelectedId(u.id);
  };

  const updateUpdate = (id, patch) => {
    setUpdates(prev => (prev || []).map(u => u.id === id ? { ...u, ...patch } : u));
  };

  const removeUpdate = (id) => {
    setUpdates(prev => (prev || []).filter(u => u.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (q) {
      out = out.filter(u =>
        (u.sender || '').toLowerCase().includes(q) ||
        (u.region || '').toLowerCase().includes(q) ||
        (u.title || '').toLowerCase().includes(q) ||
        (u.body || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  }, [list, query]);

  const senderCount = useMemo(() => new Set(list.map(u => (u.sender || '').trim()).filter(Boolean)).size, [list]);

  return (
    <MissionsShell
      title="Field Updates"
      icon="📰"
      subtitle="Newsletters, prayer letters, and reports from missionaries — searchable, archived per sender, with attachment-friendly storage."
      actions={
        <button type="button" className="app-btn primary" onClick={addUpdate}>
          ✦ New update
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
          <div className="app-empty-icon">📰</div>
          <div className="app-empty-title">No field updates yet</div>
          <div className="app-empty-sub">
            Archive newsletters, prayer letters, and reports from the
            field here so they're searchable in one place.
          </div>
          <button type="button" className="app-btn primary" onClick={addUpdate}>
            ✦ Add your first update
          </button>
        </div>
      ) : (
        <div className="msf-detail" style={{ maxWidth: 860 }}>
          <section className="msf-panel">
            <div className="msf-panel-hd">
              <span className="msf-panel-icon">📰</span>
              <h2 className="msf-panel-title">Field Updates</h2>
            </div>
            <div className="msf-stat-row">
              <div className="msf-stat">
                <span className="msf-stat-n">{list.length}</span>
                <span className="msf-stat-lbl">Total updates</span>
              </div>
              <div className="msf-stat">
                <span className="msf-stat-n">{senderCount}</span>
                <span className="msf-stat-lbl">Senders</span>
              </div>
            </div>
          </section>

          <section className="msf-panel">
            <div className="msf-panel-row">
              <h3 className="msf-panel-subtitle">Feed</h3>
            </div>

            <div className="msf-controls">
              <div className="msf-search-wrap">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search by sender, region, title, or content…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {query && <button className="msf-search-clear" onClick={() => setQuery('')}>✕</button>}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="msf-empty-note">No updates match "{query}".</div>
            ) : (
              <ul className="msf-list">
                {visible.map(u => (
                  <UpdateRow
                    key={u.id}
                    update={u}
                    expanded={selectedId === u.id}
                    onToggle={() => setSelectedId(selectedId === u.id ? null : u.id)}
                    onChange={(patch) => updateUpdate(u.id, patch)}
                    onDelete={() => removeUpdate(u.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </MissionsShell>
  );
}

function UpdateRow({ update, expanded, onToggle, onChange, onDelete }) {
  return (
    <li className={`msf-row${expanded ? ' expanded' : ''}`} style={{ '--msf-card-accent': '#4f9e7a' }}>
      <button type="button" className="msf-row-summary" onClick={onToggle}>
        <span className="msf-row-icon">📰</span>
        <span className="msf-row-main">
          <span className="msf-row-top">
            <span className="msf-row-title">{update.title || '(untitled update)'}</span>
          </span>
          <span className="msf-row-sub">
            {update.sender || 'Unknown sender'}
            {update.region && <> · {update.region}</>}
          </span>
        </span>
        <span className="msf-row-meta">{update.date || ''}</span>
        <span className="msf-row-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <UpdateEditor update={update} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

function UpdateEditor({ update, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  return (
    <form className="ys-form msf-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <input
            type="text"
            className="ys-inp msf-title-inp"
            value={update.title || ''}
            onChange={set('title')}
            placeholder="Update title"
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
          <Field label="Sender">
            <input type="text" className="ys-inp" value={update.sender || ''} onChange={set('sender')} placeholder="Missionary name" />
          </Field>
          <Field label="Region">
            <input type="text" className="ys-inp" value={update.region || ''} onChange={set('region')} placeholder="Optional" />
          </Field>
          <Field label="Date">
            <input type="date" className="ys-inp" value={update.date || ''} onChange={set('date')} />
          </Field>
        </Row>
      </Section>

      <Section title="Content">
        <textarea
          className="ys-inp ys-textarea"
          rows={8}
          value={update.body || ''}
          onChange={set('body')}
          placeholder="Paste or write the newsletter / prayer letter / report content here…"
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
