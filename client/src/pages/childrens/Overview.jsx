import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { CHILDRENS_GROUPS } from './childrensConfig';
import './_shared.css';
import './Overview.css';

/* Children's Ministry — landing dashboard.
   Reads stats from every relevant childrens:* store so the page
   surfaces "what matters today" without each sub-page having to
   come back to a separate home screen. */

export default function ChildrensOverview() {
  const navigate = useNavigate();
  const [kids]        = useUserStoreKey('childrens:kids', []);
  const [volunteers]  = useUserStoreKey('childrens:volunteers', []);
  const [incidents]   = useUserStoreKey('childrens:incidents', []);
  const [checkIns]    = useUserStoreKey('childrens:checkIns', []);
  const [supplies]    = useUserStoreKey('childrens:supplies', []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const kList = Array.isArray(kids) ? kids : [];
  const vList = Array.isArray(volunteers) ? volunteers : [];
  const iList = Array.isArray(incidents) ? incidents : [];
  const cList = Array.isArray(checkIns) ? checkIns : [];
  const sList = Array.isArray(supplies) ? supplies : [];

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const checkedInToday = cList.filter(c => c.date === today && !c.checkedOutAt).length;
    const openIncidents  = iList.filter(i => !i.acknowledged).length;
    const lowStock       = sList.filter(s => Number(s.qty || 0) <= Number(s.reorderAt || 0)).length;
    const expiringBg     = vList.filter(v => {
      if (!v.bgExpires) return false;
      const days = Math.ceil((new Date(v.bgExpires).getTime() - Date.now()) / 86400000);
      return days <= 30;
    }).length;
    return { kids: kList.length, volunteers: vList.length, checkedInToday, openIncidents, lowStock, expiringBg };
  }, [kList, vList, iList, cList, sList, today]);

  return (
    <ChildrensShell
      icon="🏠" title="Children's Ministry"
      subtitle="Dashboard for everything kids — today's check-ins, volunteer coverage, incident alerts, and supply warnings."
      stats={[
        { n: stats.kids, label: 'kids in roster' },
        { n: stats.volunteers, label: 'volunteers' },
        { n: stats.checkedInToday, label: 'checked in today' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {(stats.openIncidents > 0 || stats.lowStock > 0 || stats.expiringBg > 0) && (
        <section className="cmov-alerts">
          <h2 className="cmov-section-title">⚠️ Needs attention</h2>
          <div className="cmov-alert-grid">
            {stats.openIncidents > 0 && (
              <button className="cmov-alert cmov-alert-red" onClick={() => navigate('/childrens/incidents')}>
                <span className="cmov-alert-n">{stats.openIncidents}</span>
                <span className="cmov-alert-label">unacknowledged incident{stats.openIncidents === 1 ? '' : 's'}</span>
              </button>
            )}
            {stats.expiringBg > 0 && (
              <button className="cmov-alert cmov-alert-amber" onClick={() => navigate('/childrens/background-checks')}>
                <span className="cmov-alert-n">{stats.expiringBg}</span>
                <span className="cmov-alert-label">background check{stats.expiringBg === 1 ? '' : 's'} expiring soon</span>
              </button>
            )}
            {stats.lowStock > 0 && (
              <button className="cmov-alert cmov-alert-amber" onClick={() => navigate('/childrens/snacks')}>
                <span className="cmov-alert-n">{stats.lowStock}</span>
                <span className="cmov-alert-label">supply item{stats.lowStock === 1 ? '' : 's'} low</span>
              </button>
            )}
          </div>
        </section>
      )}

      <section className="cmov-map">
        <h2 className="cmov-section-title">Everything in Children's Ministry</h2>
        <p className="cmov-sub">Tap any card to jump into that area.</p>
        {CHILDRENS_GROUPS.map(group => (
          <div key={group.key} className="cmov-group">
            <h3 className="cmov-group-title">
              <span className="cmov-group-icon">{group.icon}</span>
              {group.label}
            </h3>
            <div className="cmov-grid">
              {group.items.map(item => (
                <button
                  key={item.path}
                  className="cmov-card"
                  style={{ '--card-accent': item.accent || group.color }}
                  onClick={() => navigate(item.path)}
                >
                  <span className="cmov-card-icon">{item.icon}</span>
                  <span className="cmov-card-label">{item.label}</span>
                  <span className="cmov-card-desc">{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
