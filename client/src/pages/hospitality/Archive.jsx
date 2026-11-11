import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';
import '../youth/Archive.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Records → Archive

   Read-only roll-up of everything that's already happened — past
   weddings/funerals/holiday events, retired gift-inventory items,
   former (on-leave/removed) hosts, and completed catering requests
   and meal trains. Nothing is stored here; each section reads
   straight from its own page's shared store and links back to the
   live page for edits.
   ───────────────────────────────────────────────────────────── */

const SECTIONS_META = [
  { key: 'weddings',   title: '💍 Past weddings',            path: '/hospitality/events/weddings' },
  { key: 'funerals',   title: '🕊️ Past services',            path: '/hospitality/events/funerals' },
  { key: 'holidays',   title: '🎄 Past holiday events',       path: '/hospitality/events/holiday' },
  { key: 'catering',   title: '🍽️ Completed catering requests', path: '/hospitality/food/catering' },
  { key: 'mealTrains', title: '🍲 Closed meal trains',        path: '/hospitality/food/meals' },
  { key: 'formerHosts', title: '🧑 Former / on-leave hosts',  path: '/hospitality/all' },
];

export default function HospitalityArchive() {
  const navigate = useNavigate();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [hosts, , { loading }] = useHosts();
  const [weddings] = useUserStoreKey('hospitality:weddings', []);
  const [funerals] = useUserStoreKey('hospitality:funerals', []);
  const [holidays] = useUserStoreKey('hospitality:holiday-events', []);
  const [catering] = useUserStoreKey('hospitality:catering-requests', []);
  const [mealTrains] = useUserStoreKey('hospitality:meal-trains', []);

  const buckets = useMemo(() => {
    const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
    return {
      weddings:   (weddings || []).filter(w => w.status === 'complete').sort(byDateDesc),
      funerals:   (funerals || []).filter(f => f.status === 'complete').sort(byDateDesc),
      holidays:   (holidays || []).filter(h => h.status === 'complete').sort(byDateDesc),
      catering:   (catering || []).filter(c => c.status === 'complete').sort(byDateDesc),
      mealTrains: (mealTrains || []).filter(m => m.status === 'closed'),
      formerHosts: (hosts || []).filter(h => h.status === 'on-leave'),
    };
  }, [weddings, funerals, holidays, catering, mealTrains, hosts]);

  const renderers = {
    weddings:   w => ({ title: w.couple || 'Untitled wedding', sub: w.coordinator, meta: w.date || '' }),
    funerals:   f => ({ title: f.family || 'Untitled service', sub: f.contact, meta: f.date || '' }),
    holidays:   h => ({ title: h.title || 'Untitled event', sub: `${h.expectedAttendance || 0} expected`, meta: h.date || '' }),
    catering:   c => ({ title: c.title || 'Untitled request', sub: `${c.headcount || 0} guests`, meta: c.date || '' }),
    mealTrains: m => ({ title: m.recipient || 'Untitled meal train', sub: m.reason, meta: `${(m.slots || []).length} meals delivered` }),
    formerHosts: h => ({ title: h.name || 'Unnamed host', sub: (h.roles || []).join(', '), meta: h.servicePreference || '' }),
  };

  const total = SECTIONS_META.reduce((n, s) => n + buckets[s.key].length, 0);

  return (
    <HospitalityShell
      title="Archive"
      icon="📦"
      subtitle="Past events, retired gift designs, former hosts, and historical reports — collapsible just like the other archives."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading archive…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{total}</span><span className="ha-stat-lbl">Archived items</span></div>
                {SECTIONS_META.map(s => (
                  <div className="ha-stat" key={s.key}><span className="ha-stat-n">{buckets[s.key].length}</span><span className="ha-stat-lbl">{s.title.replace(/^\S+\s/, '')}</span></div>
                ))}
              </div>

              {total === 0 ? (
                <div className="ha-directory-empty" style={{ flex: 1 }}>
                  Archive is empty. Past weddings, funerals, holiday events, catering requests, closed meal trains, and former hosts will land here automatically once marked complete on their own pages.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {SECTIONS_META.map(s => {
                    const items = buckets[s.key];
                    if (items.length === 0) return null;
                    const render = renderers[s.key];
                    return (
                      <details key={s.key} open className="ha-archive-section">
                        <summary className="ha-archive-summary">
                          <span>{s.title}</span>
                          <span className="ha-archive-summary-actions">
                            <span className="app-pill">{items.length}</span>
                            <button type="button" className="app-btn ghost" onClick={(e) => { e.preventDefault(); navigate(s.path); }}>Open page →</button>
                          </span>
                        </summary>
                        <ul className="ya-list" style={{ marginTop: 8 }}>
                          {items.slice(0, 50).map(item => {
                            const r = render(item);
                            return (
                              <li key={item.id} className="ya-row" onClick={() => navigate(s.path)} title="Open on its main page">
                                <div className="ya-row-body">
                                  <div className="ya-row-title">{r.title}</div>
                                  {r.sub && <div className="ya-row-sub">{r.sub}</div>}
                                  {r.meta && <div className="ya-row-meta">{r.meta}</div>}
                                </div>
                                <span className="ya-row-go">›</span>
                              </li>
                            );
                          })}
                          {items.length > 50 && <li className="ya-row-meta" style={{ padding: '4px 2px' }}>… +{items.length - 50} more</li>}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
