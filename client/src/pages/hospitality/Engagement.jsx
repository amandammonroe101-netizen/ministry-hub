import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts, useGuests, GUEST_STAGES, stageIndex, ROLES } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Records → Engagement & Attendance

   Read-only analytics rollup across the whole ministry — host
   coverage per role, first-time visitor counts, follow-up
   pipeline conversion funnel, and open scheduling gaps. Pulls
   directly from the same shared stores every other page writes
   to (hosts, guests, schedule) — nothing is entered here.
   ───────────────────────────────────────────────────────────── */

export default function Engagement() {
  const [hosts, , { loading }] = useHosts();
  const [guests] = useGuests();
  const [schedule] = useUserStoreKey('hospitality:schedule', []);
  const [ushers] = useUserStoreKey('hospitality:usher-headcounts', []);
  const navigate = useNavigate();

  const hostList = Array.isArray(hosts) ? hosts : [];
  const guestList = Array.isArray(guests) ? guests : [];
  const scheduleList = Array.isArray(schedule) ? schedule : [];
  const headcountList = Array.isArray(ushers) ? ushers : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const roleCoverage = useMemo(() => ROLES.map(r => ({
    ...r,
    hostCount: hostList.filter(h => (h.roles || []).includes(r.key)).length,
    slots: scheduleList.filter(s => s.roleKey === r.key),
    unfilled: scheduleList.filter(s => s.roleKey === r.key && !s.hostId).length,
  })), [hostList, scheduleList]);

  const totalUnfilled = scheduleList.filter(s => !s.hostId).length;

  const stageFunnel = useMemo(() => GUEST_STAGES.map(s => ({
    ...s,
    count: guestList.filter(g => stageIndex(g.stage) >= stageIndex(s.key)).length,
  })), [guestList]);

  const conversionRate = stageFunnel.length > 1 && stageFunnel[0].count > 0
    ? Math.round((stageFunnel[stageFunnel.length - 1].count / stageFunnel[0].count) * 100)
    : 0;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const visitorsThisMonth = guestList.filter(g => (g.visitDate || '').slice(0, 7) === thisMonth).length;

  const avgHeadcount = headcountList.length ? Math.round(headcountList.reduce((sum, h) => sum + (h.count || 0), 0) / headcountList.length) : 0;

  return (
    <HospitalityShell
      title="Engagement & Attendance"
      icon="📊"
      subtitle="Trends across services and events — host coverage, first-time visitor counts, follow-up conversion, and gaps to fill."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{visitorsThisMonth}</span><span className="ha-stat-lbl">First-time visitors this month</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{conversionRate}%</span><span className="ha-stat-lbl">Guest → attending conversion</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{totalUnfilled}</span><span className="ha-stat-lbl">Open scheduling gaps</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{avgHeadcount || '—'}</span><span className="ha-stat-lbl">Avg. headcount / service</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">🧑‍🤝‍🧑 Host coverage by role</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {roleCoverage.map(r => (
                      <div key={r.key} className="ha-list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(r.path)}>
                        <div className="ha-list-row-body">
                          <span className="ha-list-row-title">{r.icon} {r.label}</span>
                          <span className="ha-list-row-meta">{r.hostCount} host{r.hostCount === 1 ? '' : 's'} · {r.slots.length} slots scheduled{r.unfilled > 0 ? ` · ⚡ ${r.unfilled} unfilled` : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/ops/scheduling')}>Open Scheduling →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🚦 Follow-up conversion funnel</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {stageFunnel.map(s => (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, width: 160, flexShrink: 0 }}>{s.icon} {s.label}</span>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                          <div style={{ width: `${stageFunnel[0].count ? (s.count / stageFunnel[0].count) * 100 : 0}%`, background: 'var(--ha-accent, #fb923c)', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: 12, width: 32, textAlign: 'right' }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/guests/follow-up')}>Open Follow-Up Pipeline →</button>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
