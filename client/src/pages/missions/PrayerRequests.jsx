import { useMemo, useState } from 'react';
import MissionsShell from './MissionsShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './MissionsFlagship.css';

/* ─────────────────────────────────────────────────────────────
   Missions → Prayer → Prayer Requests

   Active and urgent requests from the field — categorized by
   missionary, region, and topic. Marking a request answered moves
   it out of the active lists without deleting the record, so a
   history of answered prayer stays visible.

   Storage: useUserStoreKey('missions:prayer-requests', [])
   ───────────────────────────────────────────────────────────── */

const URGENCY_META = {
  urgent: { label: 'Urgent', icon: '🔥' },
  normal: { label: 'Normal', icon: '🙏' },
};

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_REQUEST = () => ({
  id:         makeId('req'),
  missionary: '',
  region:     '',
  topic:      '',
  urgency:    'normal',
  body:       '',
  answered:   false,
  createdAt:  Date.now(),
});

function formatDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

export default function MissionsPrayerRequests() {
  const [requests, setRequests, { loading }] = useUserStoreKey('missions:prayer-requests', []);
  const list = Array.isArray(requests) ? requests : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const addRequest = () => {
    const r = DEFAULT_REQUEST();
    setRequests(prev => [...(prev || []), r]);
    setStatusFilter('active');
    setSelectedId(r.id);
  };

  const updateRequest = (id, patch) => {
    setRequests(prev => (prev || []).map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRequest = (id) => {
    setRequests(prev => (prev || []).filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const countFor = (id) => {
    if (id === 'urgent') return list.filter(r => !r.answered && r.urgency === 'urgent').length;
    if (id === 'normal') return list.filter(r => !r.answered && r.urgency !== 'urgent').length;
    if (id === 'answered') return list.filter(r => r.answered).length;
    return list.filter(r => !r.answered).length;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (statusFilter === 'active') out = out.filter(r => !r.answered);
    else if (statusFilter === 'answered') out = out.filter(r => r.answered);
    else if (statusFilter === 'urgent') out = out.filter(r => !r.answered && r.urgency === 'urgent');
    else if (statusFilter === 'normal') out = out.filter(r => !r.answered && r.urgency !== 'urgent');
    if (q) {
      out = out.filter(r =>
        (r.missionary || '').toLowerCase().includes(q) ||
        (r.region || '').toLowerCase().includes(q) ||
        (r.topic || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [list, query, statusFilter]);

  const dashboard = useMemo(() => {
    const active = list.filter(r => !r.answered);
    return {
      active:   active.length,
      urgent:   active.filter(r => r.urgency === 'urgent').length,
      answered: list.filter(r => r.answered).length,
      noTopic:  active.filter(r => !(r.topic || '').trim()).length,
    };
  }, [list]);

  const SIDEBAR_ITEMS = [
    { id: 'active',   label: 'Active Requests', icon: '🙏' },
    { id: 'urgent',   label: 'Urgent',          icon: '🔥' },
    { id: 'normal',   label: 'Normal',          icon: '📋' },
    { id: 'answered', label: 'Answered',        icon: '✅' },
  ];
  const activeMeta = SIDEBAR_ITEMS.find(s => s.id === statusFilter) || SIDEBAR_ITEMS[0];

  return (
    <MissionsShell
      title="Prayer Requests"
      icon="📋"
      subtitle="Active and urgent requests from the field — categorized by missionary, region, and topic. Mark answered to keep the list focused."
      actions={
        <button type="button" className="app-btn primary" onClick={addRequest}>
          ✦ New request
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
          <div className="app-empty-icon">📋</div>
          <div className="app-empty-title">No prayer requests yet</div>
          <div className="app-empty-sub">
            Log requests coming in from the field — missionary, region,
            topic, and urgency — and mark them answered as God moves.
          </div>
          <button type="button" className="app-btn primary" onClick={addRequest}>
            ✦ Add your first request
          </button>
        </div>
      ) : (
        <div className="msf-root">
          <nav className="msf-sidebar" aria-label="Prayer request status">
            <div className="msf-sidebar-list" style={{ borderTop: 'none', paddingTop: 0 }}>
              {SIDEBAR_ITEMS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`msf-node${statusFilter === item.id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(item.id)}
                >
                  <span className="msf-node-icon">{item.icon}</span>
                  <span className="msf-node-name">{item.label}</span>
                  <span className="msf-node-count">{countFor(item.id)}</span>
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
                  <span className="msf-stat-n">{dashboard.active}</span>
                  <span className="msf-stat-lbl">Active requests</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.urgent}</span>
                  <span className="msf-stat-lbl">Urgent</span>
                </div>
                <div className="msf-stat">
                  <span className="msf-stat-n">{dashboard.answered}</span>
                  <span className="msf-stat-lbl">Answered</span>
                </div>
                <div className="msf-stat is-warn">
                  <span className="msf-stat-n">{dashboard.noTopic}</span>
                  <span className="msf-stat-lbl">No topic on file</span>
                </div>
              </div>
            </section>

            <section className="msf-panel">
              <div className="msf-panel-row">
                <h3 className="msf-panel-subtitle">Requests</h3>
              </div>

              <div className="msf-controls">
                <div className="msf-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by missionary, region, topic…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="msf-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="msf-empty-note">
                  {query ? `No requests match "${query}".` : 'No requests match this filter.'}
                </div>
              ) : (
                <ul className="msf-list">
                  {visible.map(r => (
                    <RequestRow
                      key={r.id}
                      request={r}
                      expanded={selectedId === r.id}
                      onToggle={() => setSelectedId(selectedId === r.id ? null : r.id)}
                      onChange={(patch) => updateRequest(r.id, patch)}
                      onDelete={() => removeRequest(r.id)}
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

function RequestRow({ request, expanded, onToggle, onChange, onDelete }) {
  const urgencyMeta = URGENCY_META[request.urgency || 'normal'];
  const accent = request.answered ? '#4f9e7a' : (request.urgency === 'urgent' ? '#c9503f' : '#7c7fdb');
  return (
    <li className={`msf-row${expanded ? ' expanded' : ''}`} style={{ '--msf-card-accent': accent }}>
      <button type="button" className="msf-row-summary" onClick={onToggle}>
        <span className="msf-row-icon">{request.answered ? '✅' : urgencyMeta.icon}</span>
        <span className="msf-row-main">
          <span className="msf-row-top">
            <span className="msf-row-title">{request.topic || '(untitled request)'}</span>
            {request.answered
              ? <span className="msf-badge is-muted">Answered</span>
              : request.urgency === 'urgent' && <span className="msf-badge" style={{ '--msf-badge-accent': '#c9503f' }}>Urgent</span>}
          </span>
          <span className="msf-row-sub">
            {request.missionary || 'Unassigned'}
            {request.region && <> · {request.region}</>}
          </span>
        </span>
        <span className="msf-row-meta">{formatDate(request.createdAt)}</span>
        <span className="msf-row-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <RequestEditor request={request} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

function RequestEditor({ request, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  return (
    <form className="ys-form msf-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <input
            type="text"
            className="ys-inp msf-title-inp"
            value={request.topic || ''}
            onChange={set('topic')}
            placeholder="Request topic"
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
          <Field label="Missionary / region contact">
            <input type="text" className="ys-inp" value={request.missionary || ''} onChange={set('missionary')} placeholder="Who this is for" />
          </Field>
          <Field label="Region">
            <input type="text" className="ys-inp" value={request.region || ''} onChange={set('region')} placeholder="e.g. Southeast Asia" />
          </Field>
        </Row>
        <Row>
          <Field label="Urgency">
            <select className="ys-inp" value={request.urgency || 'normal'} onChange={set('urgency')}>
              <option value="normal">🙏 Normal</option>
              <option value="urgent">🔥 Urgent</option>
            </select>
          </Field>
          <Field label="Answered">
            <label className="msf-check">
              <input
                type="checkbox"
                checked={!!request.answered}
                onChange={e => onChange({ answered: e.target.checked })}
              />
              <span>Mark as answered</span>
            </label>
          </Field>
        </Row>
      </Section>

      <Section title="Request">
        <textarea
          className="ys-inp ys-textarea"
          rows={5}
          value={request.body || ''}
          onChange={set('body')}
          placeholder="What to pray for…"
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
