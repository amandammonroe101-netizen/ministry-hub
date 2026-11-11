import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Archive
   Read-only summary of past programs, VBS years, and graduated /
   inactive kids. Each section is collapsible. Jumps back to the
   live page if the user wants to edit. */

const ACCENT = 'var(--accent-purple, #a78bfa)';

export default function ChildrensArchive() {
  const navigate = useNavigate();
  const [kids]       = useUserStoreKey('childrens:kids', []);
  const [sundays]    = useUserStoreKey('childrens:sundays', []);
  const [events]     = useUserStoreKey('childrens:specialEvents', []);
  const [volunteers] = useUserStoreKey('childrens:volunteers', []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const pastSundays  = useMemo(() => (Array.isArray(sundays) ? sundays : []).filter(s => s.date < today).sort((a, b) => b.date.localeCompare(a.date)), [sundays, today]);
  const pastEvents   = useMemo(() => (Array.isArray(events) ? events : []).filter(e => (e.endDate || e.startDate) < today).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')), [events, today]);
  const graduatedKids = useMemo(() => (Array.isArray(kids) ? kids : []).filter(k => !k.active).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [kids]);
  const inactiveVols  = useMemo(() => (Array.isArray(volunteers) ? volunteers : []).filter(v => !v.active).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [volunteers]);

  const sections = [
    { id: 'sundays',   title: '☀ Past Sundays',          items: pastSundays,  path: '/childrens/sunday',     render: s => `${s.date} · ${s.theme || 'Service'}` },
    { id: 'events',    title: '🎪 Past VBS / events',    items: pastEvents,   path: '/childrens/vbs',        render: e => `${e.startDate} · ${e.name || 'Event'} (${e.kind})` },
    { id: 'kids',      title: '🧒 Graduated / inactive kids', items: graduatedKids, path: '/childrens/kids',   render: k => `${k.name} · ${k.ageBand}` },
    { id: 'volunteers',title: '🧑‍🏫 Inactive volunteers', items: inactiveVols, path: '/childrens/volunteers',render: v => `${v.name} · ${v.role}` },
  ];

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <ChildrensShell
      groupLabel="Records" groupIcon="🗂"
      icon="📦" title="Archive"
      accent={ACCENT}
      subtitle="Past Sundays, past VBS years, graduated kids, and inactive volunteers — collapsible read-only summary."
      stats={[
        { n: total, label: 'archived items' },
        { n: pastEvents.length, label: 'past events' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {total === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📦</div><div className="cm-empty-title">Archive is empty</div><div className="cm-empty-sub">Past Sundays and inactive records will appear here automatically.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map(sec => (
            sec.items.length === 0 ? null : (
              <details key={sec.id} open style={{ background: 'var(--bg-glass)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '10px 16px' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700 }}>
                  <span>{sec.title}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="yps-pill">{sec.items.length}</span>
                    <button className="yps-btn ghost" onClick={(e) => { e.preventDefault(); navigate(sec.path); }}>Open page →</button>
                  </span>
                </summary>
                <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sec.items.slice(0, 50).map(it => (
                    <li key={it.id} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', padding: '2px 0' }}>
                      {sec.render(it)}
                    </li>
                  ))}
                  {sec.items.length > 50 && <li style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>… +{sec.items.length - 50} more</li>}
                </ul>
              </details>
            )
          ))}
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
