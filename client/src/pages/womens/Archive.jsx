import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useBibleStudies, useLifeStageInfo } from './womensListsConfig';
import { retreatService } from '../../services/retreatService';
import { conferenceService } from '../../services/conferenceService';
import { mealTrainService } from '../../services/mealTrainService';
import { WomanView } from './AllWomen';
import '../youth/AllStudents.css';
import './AllWomen.css';
import './LifeStages.css';
import './Crisis.css';
import './Archive.css';

/* Women's → Archive
   Read-only roll-up of everything that's already happened across the
   whole ministry. Nothing is stored here; each section reads straight
   from its own page's data source (local store or Firestore service)
   and links back to the live page for edits. Rows are grouped by year
   (newest first) and can be filtered with the search bar above.

   Styling: reuses the Life Stages rose-gold emboss language wholesale
   (.wls-* classes / --wms-* tokens from LifeStages.css, which is safe
   to reuse here since both pages mount inside the same WomensShell)
   instead of inventing a second visual language for this page. Only
   the handful of widgets with no Life-Stages equivalent — the year
   sub-header, per-section legend line, and count pill — get their own
   small addition in Archive.css. */

const today = () => new Date().toISOString().slice(0, 10);

function lastCheckIn(mom) {
  const checkIns = Array.isArray(mom.checkIns) ? mom.checkIns : [];
  if (checkIns.length && checkIns[0].date) return checkIns[0].date;
  return mom.createdAt ? new Date(mom.createdAt).toISOString().slice(0, 10) : '';
}

function lastActivity(woman) {
  if (woman.lastContacted) return woman.lastContacted;
  return woman.createdAt ? new Date(woman.createdAt).toISOString().slice(0, 10) : '';
}

const SECTIONS_META = [
  { key: 'inactiveWomen',  title: '👤 Archived women',            path: '/womens/all',           legend: 'Unchecked "Currently in the ministry" on her All Women profile.' },
  { key: 'studies',       title: '📖 Past Bible studies',        path: '/womens/bible-studies', legend: 'Marked "Completed" on the Bible Studies page.' },
  { key: 'retreats',      title: '🏞 Past retreats',              path: '/womens/retreats',       legend: 'Marked "Completed" on the Retreats page.' },
  { key: 'conferences',   title: '🎤 Past conferences',           path: '/womens/conferences',    legend: 'Marked "Attended" or "Past" on the Conferences page.' },
  { key: 'brunches',      title: '🍽 Past brunches & teas',       path: '/womens/brunches',       legend: 'Any gathering whose date has already passed.' },
  { key: 'fellowship',    title: '🎨 Past fellowship & crafts',   path: '/womens/fellowship',     legend: 'Any gathering whose date has already passed.' },
  { key: 'mentorship',    title: '💗 Completed mentorship pairs', path: '/womens/mentorship',     legend: 'Marked "Completed" on the Mentorship Pairs page.' },
  { key: 'mealTrains',    title: '🍲 Completed meal trains',      path: '/womens/meal-train',     legend: 'Marked "Completed" on the Meal Train page.' },
  { key: 'newMoms',       title: '🤱 Graduated new moms',         path: '/womens/new-moms',       legend: 'Marked "Graduated" on the New Mom Support page.' },
  { key: 'supportGroups', title: '🫂 Closed support groups',      path: '/womens/support-groups', legend: 'Marked "Closed" on the Support Groups page.' },
  { key: 'crisis',        title: '🆘 Closed care cases',          path: '/womens/crisis',         legend: "Closed cases from Crisis & Counseling — names stay blurred here to match that page's confidentiality.", blurred: true },
];

const renderers = {
  inactiveWomen: w => ({ title: w.name || '(unnamed)',                  sub: w.lifeStage,  meta: w.lastContacted ? `Last contact ${w.lastContacted}` : '', dateStr: lastActivity(w) }),
  studies:       s => ({ title: s.label || 'Untitled study',            sub: s.book,       meta: [s.leader, s.startDate && s.endDate ? `${s.startDate} → ${s.endDate}` : s.endDate].filter(Boolean).join(' · '), dateStr: s.endDate || s.startDate || '' }),
  retreats:      r => ({ title: r.name || 'Untitled retreat',            sub: r.location,   meta: r.startDate && r.endDate ? `${r.startDate} → ${r.endDate}` : (r.startDate || ''), dateStr: r.endDate || r.startDate || '' }),
  conferences:   c => ({ title: c.name || 'Untitled conference',         sub: c.location,   meta: c.startDate && c.endDate ? `${c.startDate} → ${c.endDate}` : (c.startDate || ''), dateStr: c.endDate || c.startDate || '' }),
  brunches:      b => ({ title: b.title || 'Untitled gathering',         sub: [b.hostName, b.hostLocation].filter(Boolean).join(' · '), meta: b.date || '', dateStr: b.date || '' }),
  fellowship:    g => ({ title: g.title || 'Untitled gathering',         sub: g.host,       meta: g.date || '', dateStr: g.date || '' }),
  mentorship:    p => ({ title: `${p.mentorName || '?'} → ${p.menteeName || '?'}`, sub: p.focusArea, meta: p.startDate && p.endDate ? `${p.startDate} → ${p.endDate}` : (p.endDate || ''), dateStr: p.endDate || p.startDate || '' }),
  mealTrains:    m => ({ title: m.recipientName || 'Untitled meal train', sub: m.reason,     meta: m.startDate && m.endDate ? `${m.startDate} → ${m.endDate}` : (m.startDate || ''), dateStr: m.endDate || m.startDate || '' }),
  newMoms:       m => ({ title: m.name || '(unnamed)',                   sub: m.mentorMomName ? `Mentor: ${m.mentorMomName}` : '', meta: 'Graduated', dateStr: lastCheckIn(m) }),
  supportGroups: g => ({ title: g.label || 'Untitled group',             sub: g.facilitator, meta: g.closedDate ? `Closed ${g.closedDate}` : 'Closed', dateStr: g.closedDate || '' }),
  crisis:        c => ({ title: c.name || 'Unnamed case',                sub: c.situationSummary, meta: c.closedDate ? `Closed ${c.closedDate}` : 'Closed', dateStr: c.closedDate || '' }),
};

/* Groups pre-sorted (desc by dateStr) items into consecutive year
   buckets, applying the search query along the way. */
function buildYearGroups(items, render, query) {
  const q = query.trim().toLowerCase();
  const rows = items
    .map(item => ({ item, r: render(item) }))
    .filter(({ r }) => !q || [r.title, r.sub, r.meta].filter(Boolean).join(' ').toLowerCase().includes(q));
  const groups = [];
  for (const row of rows) {
    const year = (row.r.dateStr || '').slice(0, 4) || 'Undated';
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }
  return groups;
}

export default function WomensArchive() {
  const navigate = useNavigate();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [query, setQuery] = useState('');

  const [women] = useUserStoreKey('womens:women', []);
  const [stageInfo] = useLifeStageInfo();
  const [viewingWoman, setViewingWoman] = useState(null);
  const [studies] = useBibleStudies();
  const [pairs] = useUserStoreKey('womens:mentorship-pairs', []);
  const [brunches] = useUserStoreKey('womens:brunches', []);
  const [fellowshipData] = useUserStoreKey('womens:fellowship', { gatherings: [] });
  const [newMoms] = useUserStoreKey('womens:new-moms', []);
  const [supportGroups] = useUserStoreKey('womens:support-groups', []);
  const [crisisCases] = useUserStoreKey('womens:crisis-cases', []);

  const [retreats, setRetreats] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [mealTrains, setMealTrains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      retreatService.getAll().then(res => (Array.isArray(res?.data?.data) ? res.data.data : [])).catch(() => []),
      conferenceService.getAll().then(res => (Array.isArray(res?.data?.data) ? res.data.data : [])).catch(() => []),
      mealTrainService.getAll().then(res => (Array.isArray(res?.data?.data) ? res.data.data : [])).catch(() => []),
    ]).then(([r, c, m]) => {
      if (!alive) return;
      setRetreats(r);
      setConferences(c);
      setMealTrains(m);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const fellowshipGatherings = Array.isArray(fellowshipData?.gatherings) ? fellowshipData.gatherings : [];

  /* Flattens Life Stages' per-stage "Meeting groups" into one list, each
     tagged with its stage — mirrors AllWomen.jsx so the popup's Groups
     section can resolve an archived woman's `lifeStageGroup` the same way. */
  const allStageGroups = useMemo(() => {
    const info = stageInfo && typeof stageInfo === 'object' ? stageInfo : {};
    const out = [];
    for (const stage of Object.keys(info)) {
      const groups = Array.isArray(info[stage]?.groups) ? info[stage].groups : [];
      for (const g of groups) out.push({ ...g, stage });
    }
    return out;
  }, [stageInfo]);

  /* Lock body scroll + Esc-to-close while the profile popup is open. */
  useEffect(() => {
    if (!viewingWoman) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setViewingWoman(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [viewingWoman]);

  const buckets = useMemo(() => {
    const t = today();
    const byDateDesc = (a, b) => (b.startDate || b.endDate || '').localeCompare(a.startDate || a.endDate || '');
    return {
      inactiveWomen: (women || []).filter(w => w.active === false).sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))),
      studies:       (studies || []).filter(s => s.status === 'completed').sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')),
      retreats:      (retreats || []).filter(r => r.status === 'completed').sort(byDateDesc),
      conferences:   (conferences || []).filter(c => c.status === 'attended' || c.status === 'past').sort(byDateDesc),
      brunches:      (brunches || []).filter(b => b.date && b.date < t).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      fellowship:    fellowshipGatherings.filter(g => g.date && g.date < t).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      mentorship:    (pairs || []).filter(p => p.status === 'completed').sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')),
      mealTrains:    (mealTrains || []).filter(m => m.status === 'completed').sort(byDateDesc),
      newMoms:       (newMoms || []).filter(m => m.status === 'graduated').sort((a, b) => lastCheckIn(b).localeCompare(lastCheckIn(a))),
      supportGroups: (supportGroups || []).filter(g => g.status === 'closed').sort((a, b) => (b.closedDate || '').localeCompare(a.closedDate || '')),
      crisis:        (crisisCases || []).filter(c => c.status === 'closed').sort((a, b) => (b.closedDate || '').localeCompare(a.closedDate || '')),
    };
  }, [women, studies, retreats, conferences, brunches, fellowshipGatherings, pairs, mealTrains, newMoms, supportGroups, crisisCases]);

  const total = SECTIONS_META.reduce((n, s) => n + buckets[s.key].length, 0);

  return (
    <WomensShell
      title="Archive"
      icon="📦"
      subtitle="Everything that's already wrapped up across the ministry — archived women, Bible studies, events, mentorship, meal trains, new-mom graduations, closed groups, and closed care cases."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root wa-archive-root">
        {loading ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">📦</div>
            <div className="app-empty-title">Loading archive…</div>
          </div>
        ) : (
          <>
            <div className="wls-panel wa-archive-stats">
              <div className="wls-stat-row" style={{ gridTemplateColumns: '1fr' }}>
                <div className="wls-stat">
                  <span className="wls-stat-n">{total}</span>
                  <span className="wls-stat-lbl">Archived items</span>
                </div>
              </div>
            </div>

            <div className="wls-unassigned wa-archive-crosslink">
              <span className="wls-unassigned-hd">Curious who's engaging or has gone quiet?</span>
              <button type="button" className="wls-btn-ghost" onClick={() => navigate('/womens/engagement')}>
                📊 Engagement & Attendance →
              </button>
            </div>

            <div className="wls-panel wa-archive-search">
              <label className="wls-mini-field">
                <span>🔍 Search archive</span>
                <input
                  type="text"
                  className="ys-inp"
                  placeholder="Search by name, leader, location…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              {query && (
                <button type="button" className="wls-btn-ghost" onClick={() => setQuery('')}>Clear ✕</button>
              )}
            </div>

            {total === 0 ? (
              <div className="wls-empty app-empty">
                <div className="app-empty-icon">📦</div>
                <div className="app-empty-title">Archive is empty</div>
                <div className="app-empty-sub">
                  Women unchecked as "Currently in the ministry," past Bible studies,
                  events, mentorship pairs, meal trains, graduated new moms, closed
                  groups, and closed care cases will land here automatically once
                  they're marked inactive/completed/closed on their own pages.
                </div>
              </div>
            ) : (
              <div className="wa-archive-sections">
                {SECTIONS_META.map(s => {
                  const items = buckets[s.key];
                  if (items.length === 0) return null;
                  const yearGroups = buildYearGroups(items, renderers[s.key], query);
                  const visibleCount = yearGroups.reduce((n, g) => n + g.rows.length, 0);
                  if (query && visibleCount === 0) return null;
                  return (
                    <details key={s.key} open className="wls-panel wa-archive-section">
                      <summary className="wls-panel-row wa-archive-summary">
                        <h3 className="wls-panel-subtitle">{s.title}</h3>
                        <span className="wa-archive-summary-actions">
                          <span className="wa-archive-pill">{query ? visibleCount : items.length}</span>
                          <button
                            type="button"
                            className="wls-btn-ghost"
                            onClick={(e) => { e.preventDefault(); navigate(s.path); }}
                          >
                            Open page →
                          </button>
                        </span>
                      </summary>
                      <div className="wls-empty-note wa-archive-legend">{s.legend}</div>
                      {yearGroups.map(g => (
                        <div key={g.year}>
                          <div className="wa-archive-year">{g.year}</div>
                          <ul className="wls-roster">
                            {g.rows.map(({ item, r }) => (
                              s.blurred ? (
                                <BlurredArchiveRow key={item.id} r={r} onOpen={() => navigate(s.path)} />
                              ) : (
                                <li
                                  key={item.id}
                                  className="wls-roster-row wa-archive-row"
                                  onClick={() => s.key === 'inactiveWomen' ? setViewingWoman(item) : navigate(s.path)}
                                  title={s.key === 'inactiveWomen' ? 'View her full profile' : 'Open on its main page'}
                                >
                                  <div className="wls-roster-top">
                                    <span className="wls-roster-name">{r.title}</span>
                                    {r.sub && <span className="wls-roster-meta">{r.sub}</span>}
                                    <span className="wls-roster-open" aria-hidden="true">
                                      {s.key === 'inactiveWomen' ? 'View →' : 'Open →'}
                                    </span>
                                  </div>
                                  {r.meta && <div className="wa-archive-meta">{r.meta}</div>}
                                </li>
                              )
                            ))}
                          </ul>
                        </div>
                      ))}
                    </details>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Archived woman's full profile — read-only snapshot of everything
         gathered on her while she was still active, same view AllWomen
         uses for its slide-over. "Edit" deep-links to All Women with her
         record and the edit form pre-opened. */}
      {viewingWoman && (
        <>
          <div className="wa-slide-overlay" onClick={() => setViewingWoman(null)} />
          <aside className="wa-slide wa-root" role="dialog" aria-label={viewingWoman.name || 'Woman'}>
            <button
              className="wa-slide-close"
              onClick={() => setViewingWoman(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              <WomanView
                woman={viewingWoman}
                allStageGroups={allStageGroups}
                studies={Array.isArray(studies) ? studies : []}
                onEdit={() => navigate(`/womens/all?woman=${viewingWoman.id}&edit=1`)}
              />
            </div>
          </aside>
        </>
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

/* Confidential row for closed Crisis & Counseling cases — the real
   name/summary never sit in the DOM until revealed (placeholder text
   swaps in, same as the live Crisis page's CaseCard), then a second
   tap opens the live page. */
function BlurredArchiveRow({ r, onOpen }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="wls-roster-row wa-archive-row">
      <div className="wls-roster-top">
        <button
          type="button"
          className={`wls-roster-name cc-card-name${revealed ? '' : ' is-blurred'}`}
          onClick={() => setRevealed(v => !v)}
          title={revealed ? 'Tap to blur' : 'Tap to reveal'}
        >
          {revealed ? r.title : '●●●●● (tap to reveal)'}
        </button>
        {r.sub && (
          <span
            className={`wls-roster-meta cc-card-summary${revealed ? '' : ' is-blurred'}`}
            onClick={() => setRevealed(v => !v)}
          >
            {revealed ? r.sub : 'Tap name to reveal details'}
          </span>
        )}
        <button type="button" className="wls-roster-open" onClick={onOpen}>Open →</button>
      </div>
      {r.meta && <div className="wa-archive-meta">{r.meta}</div>}
    </li>
  );
}
