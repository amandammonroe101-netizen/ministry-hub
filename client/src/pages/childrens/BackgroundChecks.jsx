import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Background Checks
   Read-only derived view from childrens:volunteers. Surfaces every
   volunteer's BG status with expiry alerts so the coordinator can
   chase renewals before a Sunday. */

const ACCENT = 'var(--accent-rose, #fb7185)';
const EXPIRY_SOON_DAYS = 30;

const STATUS_TONE = {
  cleared: 'cm-good',
  pending: 'cm-warn',
  expired: 'cm-bad',
  missing: 'cm-bad',
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
};
const effectiveStatus = (v) => {
  const days = daysUntil(v.bgExpires);
  if (days !== null && days < 0) return 'expired';
  return v.bgStatus || 'missing';
};

export default function ChildrensBackgroundChecks() {
  const [volunteers] = useUserStoreKey('childrens:volunteers', []);
  const list = Array.isArray(volunteers) ? volunteers : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const rows = useMemo(() => {
    return list.map(v => {
      const status = effectiveStatus(v);
      const days = daysUntil(v.bgExpires);
      const soon = status === 'cleared' && days !== null && days >= 0 && days <= EXPIRY_SOON_DAYS;
      return { v, status, days, soon };
    }).sort((a, b) => {
      /* Bad/missing → soon → cleared. */
      const rank = { missing: 0, expired: 1, pending: 2, cleared: 3 };
      const r = (rank[a.status] || 9) - (rank[b.status] || 9);
      if (r !== 0) return r;
      if (a.soon !== b.soon) return a.soon ? -1 : 1;
      return (a.v.name || '').localeCompare(b.v.name || '');
    });
  }, [list]);

  const counts = {
    cleared: rows.filter(r => r.status === 'cleared' && !r.soon).length,
    soon:    rows.filter(r => r.soon).length,
    expired: rows.filter(r => r.status === 'expired').length,
    pending: rows.filter(r => r.status === 'pending').length,
    missing: rows.filter(r => r.status === 'missing').length,
  };

  return (
    <ChildrensShell
      groupLabel="Check-In & Safety" groupIcon="🛡"
      icon="✅" title="Background Checks"
      accent={ACCENT}
      subtitle="Auto-derived from the Volunteers page. Cleared status is required before a volunteer is scheduled to a room."
      actions={<button className="yps-btn" onClick={() => navigate('/childrens/volunteers')}>👥 Open Volunteers</button>}
      stats={[
        { n: counts.cleared, label: 'cleared' },
        { n: counts.soon,    label: 'expiring soon' },
        { n: counts.expired + counts.missing, label: 'not cleared' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {rows.length === 0 ? (
        <div className="cm-empty">
          <div className="cm-empty-icon">✅</div>
          <div className="cm-empty-title">No volunteers yet</div>
          <div className="cm-empty-sub">Add some on the Volunteers page; their BG status will appear here.</div>
        </div>
      ) : (
        <div className="cm-rows">
          {rows.map(({ v, status, days, soon }) => (
            <div key={v.id} className="cm-row" style={{ cursor: 'default' }}>
              <span className="cm-row-name">{v.name || '(unnamed)'}</span>
              <span className="cm-row-sub">{v.role || ''}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className={`yps-pill ${STATUS_TONE[status]}`}>
                  {status === 'cleared' && '✅ Cleared'}
                  {status === 'pending' && '⏳ Pending'}
                  {status === 'expired' && '⚠ Expired'}
                  {status === 'missing' && '❌ Missing'}
                </span>
                {v.bgExpires && (
                  <span className="cm-row-sub">expires {v.bgExpires}</span>
                )}
                {soon && (
                  <span className="yps-pill cm-warn">⏰ {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`}</span>
                )}
                <button className="yps-btn ghost" onClick={() => navigate('/childrens/volunteers')}>Edit →</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
