import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useHosts, useRoleInfo, ROLES } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Roles & Positions

   Catalog of every hospitality position. ROLES itself is fixed
   (hospitalityListsConfig.js) — this page shows, per role, who's
   qualified (read live off the shared host directory by matching
   `host.roles`) and holds an editable notes/protocol blurb per
   role (station map, script, money-handling steps…).

   Storage:
     role notes:  useRoleInfo() — hospitality:role-info, keyed by
                  role key → { notes }
     hosts:       useHosts() (read only, shared directory)
   ───────────────────────────────────────────────────────────── */

export default function RolesAndPositions() {
  const [hosts] = useHosts();
  const [roleInfo, setRoleInfo, { loading }] = useRoleInfo();
  const navigate = useNavigate();

  const hostList = Array.isArray(hosts) ? hosts : [];
  const info = roleInfo && typeof roleInfo === 'object' ? roleInfo : {};

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  const hostsForRole = (key) => hostList.filter(h => (h.roles || []).includes(key));

  const selected = useMemo(() => ROLES.find(r => r.key === selectedKey) || null, [selectedKey]);

  const stats = useMemo(() => {
    const covered = ROLES.filter(r => hostsForRole(r.key).length > 0).length;
    return { total: ROLES.length, covered, gaps: ROLES.length - covered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostList]);

  const setNotes = (key, notes) => setRoleInfo(prev => ({ ...(prev || {}), [key]: { ...(prev?.[key] || {}), notes } }));

  return (
    <HospitalityShell
      title="Roles & Positions"
      icon="🎯"
      subtitle="Every hospitality position (Greeter, Usher, Parking Attendant, Welcome Desk, Coffee Host, Communion Prep, Decor) — qualified hosts per role and station assignments."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat">
                  <span className="ha-stat-n">{stats.total}</span>
                  <span className="ha-stat-lbl">Positions</span>
                </div>
                <div className="ha-stat">
                  <span className="ha-stat-n">{stats.covered}</span>
                  <span className="ha-stat-lbl">Covered</span>
                </div>
                <div className={stats.gaps > 0 ? 'ha-stat is-warn' : 'ha-stat'}>
                  <span className="ha-stat-n">{stats.gaps}</span>
                  <span className="ha-stat-lbl">No one assigned</span>
                </div>
              </div>

              <div className="ha-card-grid">
                {ROLES.map(r => {
                  const qualified = hostsForRole(r.key);
                  return (
                    <button key={r.key} type="button" className="ha-fc" onClick={() => setSelectedKey(r.key)}>
                      <span className="ha-fc-stripe" />
                      <span style={{ fontSize: 30 }}>{r.icon}</span>
                      <span className="ha-fc-name">{r.label}</span>
                      <span className="ha-fc-meta">{qualified.length} qualified host{qualified.length === 1 ? '' : 's'}</span>
                      {qualified.length === 0 && <span className="ha-fc-status">⚡ No one assigned</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

      {selected && (
        <>
          <div className="ha-slide-overlay" onClick={() => setSelectedKey(null)} />
          <aside className="ha-slide" role="dialog" aria-label="Role detail">
            <button className="ha-slide-close" onClick={() => setSelectedKey(null)} aria-label="Close" title="Close (Esc)">✕</button>
            <div className="ha-slide-body">
              <RoleDetail
                role={selected}
                notes={info[selected.key]?.notes || ''}
                qualified={hostsForRole(selected.key)}
                onNotesChange={(v) => setNotes(selected.key, v)}
                onOpenStation={() => navigate(selected.path)}
                onOpenHost={() => navigate('/hospitality/all')}
              />
            </div>
          </aside>
        </>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}

function RoleDetail({ role, notes, qualified, onNotesChange, onOpenStation, onOpenHost }) {
  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>{role.icon}</span>
          <h2 className="ys-form-title">{role.label}</h2>
        </div>
      </div>

      <section className="ys-section">
        <h3 className="ys-section-title">Station page</h3>
        <div className="ys-section-body">
          <button type="button" className="app-btn primary" onClick={onOpenStation}>
            Open {role.label} station page →
          </button>
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Qualified hosts ({qualified.length})</h3>
        <div className="ys-section-body">
          {qualified.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
              No hosts assigned to this role yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {qualified.map(h => (
                <div key={h.id} className="ha-list-row" style={{ padding: '6px 4px', cursor: 'default' }}>
                  <span className="ha-list-row-title">
                    {h.name || 'Unnamed host'}
                    {h.primaryRole === role.key ? ' (primary)' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="app-btn ghost" style={{ marginTop: 6, width: 'fit-content' }} onClick={onOpenHost}>
            Manage hosts on All Hosts →
          </button>
        </div>
      </section>

      <section className="ys-section">
        <h3 className="ys-section-title">Notes & protocol</h3>
        <div className="ys-section-body">
          <textarea
            className="ys-inp ys-textarea"
            rows={6}
            placeholder="Station map, talking points, money-handling steps, or anything specific to this role…"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
          />
        </div>
      </section>
    </div>
  );
}
