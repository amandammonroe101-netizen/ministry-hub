import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Archive.css';

/* Youth → Archive
   Read-only roll-up of past artifacts, pulling from every other
   youth: store so nothing has to be duplicated. */

const ACCENT = '#713f12';

const SECTIONS = [
  { key: 'series',    label: 'Archived series',   emoji: '📚', path: '/youth/lessons' },
  { key: 'trips',     label: 'Past trips',        emoji: '🏕', path: '/youth/trips' },
  { key: 'nights',    label: 'Past weekly nights', emoji: '🌙', path: '/youth/weekly-nights' },
  { key: 'outreach',  label: 'Past outreaches',   emoji: '🤲', path: '/youth/outreach' },
  { key: 'graduated', label: 'Graduated students', emoji: '🎓', path: '/youth/students' },
];

export default function Archive() {
  const [series]       = useUserStoreKey('youth:series', []);
  const [trips]        = useUserStoreKey('youth:trips', []);
  const [nights]       = useUserStoreKey('youth:weeklyNights', []);
  const [outreaches]   = useUserStoreKey('youth:outreach', []);
  const [students]     = useUserStoreKey('youth:students', []);

  const navigate = useNavigate();
  const [tab, setTab] = useState('series');
  const today = new Date().toISOString().slice(0, 10);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const buckets = useMemo(() => ({
    series:    (series    || []).filter(s => s.archived),
    trips:     (trips     || []).filter(t => (t.endDate || t.startDate || '') < today),
    nights:    (nights    || []).filter(n => (n.date || '') < today),
    outreach:  (outreaches|| []).filter(o => (o.date || '') < today),
    graduated: (students  || []).filter(s => (s.grade || '') === 'College' || s.graduated),
  }), [series, trips, nights, outreaches, students, today]);

  const counts = {
    series:    buckets.series.length,
    trips:     buckets.trips.length,
    nights:    buckets.nights.length,
    outreach:  buckets.outreach.length,
    graduated: buckets.graduated.length,
  };

  return (
    <YouthShell
      groupLabel="Records" groupIcon="🗂"
      icon="📦" title="Archive"
      accent={ACCENT}
      subtitle="A read-only window onto everything that's already happened — past series, trips, weekly nights, outreaches, and graduated students. Original records still live on each page."
      stats={[
        { n: counts.series + counts.trips + counts.nights + counts.outreach + counts.graduated, label: 'archived items total' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <nav className="ya-tabs">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`yps-chip ${tab === s.key ? 'on' : ''}`}
            onClick={() => setTab(s.key)}
          >
            <span>{s.emoji}</span> {s.label}
            <span className="yps-pill">{counts[s.key]}</span>
          </button>
        ))}
      </nav>

      {tab === 'series' && (
        <ArchiveList
          items={buckets.series}
          renderRow={(s) => ({
            title: s.title,
            sub:   s.theme,
            meta:  `${s.lessons.length} lessons · ${s.lessons.filter(l => l.taught).length} taught`,
          })}
          gotoPath="/youth/lessons"
          navigate={navigate}
          emptyText="No archived series yet. Toggle Archived on a series in the Lessons tab."
        />
      )}
      {tab === 'trips' && (
        <ArchiveList
          items={buckets.trips}
          renderRow={(t) => ({
            title: t.name || 'Untitled trip',
            sub:   `${t.startDate || 'TBD'} → ${t.endDate || t.startDate || 'TBD'}`,
            meta:  `${t.roster.length} on roster · ${t.location || ''}`,
          })}
          gotoPath="/youth/trips"
          navigate={navigate}
          emptyText="No past trips yet."
        />
      )}
      {tab === 'nights' && (
        <ArchiveList
          items={buckets.nights}
          renderRow={(n) => ({
            title: n.theme || `Youth night ${n.date}`,
            sub:   n.bigIdea || n.scripture,
            meta:  n.date + (n.attendance ? ` · ${n.attendance} attended` : ''),
          })}
          gotoPath="/youth/weekly-nights"
          navigate={navigate}
          emptyText="No past weekly nights yet."
        />
      )}
      {tab === 'outreach' && (
        <ArchiveList
          items={buckets.outreach}
          renderRow={(o) => ({
            title: o.name || 'Untitled outreach',
            sub:   `${o.type} · ${o.location || ''}`,
            meta:  `${o.date} · ${o.signups?.length || 0} signed up`,
          })}
          gotoPath="/youth/outreach"
          navigate={navigate}
          emptyText="No past outreaches yet."
        />
      )}
      {tab === 'graduated' && (
        <ArchiveList
          items={buckets.graduated}
          renderRow={(s) => ({
            title: s.name || '(unnamed)',
            sub:   s.school,
            meta:  s.grade + (s.joinedDate ? ` · joined ${s.joinedDate}` : ''),
          })}
          gotoPath="/youth/students"
          navigate={navigate}
          emptyText='Mark a student as "College" grade (or set graduated=true) and they will show up here.'
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

function ArchiveList({ items, renderRow, gotoPath, navigate, emptyText }) {
  if (items.length === 0) {
    return (
      <div className="yps-empty">
        <div className="yps-empty-icon">📦</div>
        <div className="yps-empty-title">Nothing here yet</div>
        <div className="yps-empty-sub">{emptyText}</div>
      </div>
    );
  }
  return (
    <ul className="ya-list">
      {items.map(item => {
        const r = renderRow(item);
        return (
          <li
            key={item.id}
            className="ya-row"
            onClick={() => navigate(gotoPath)}
            title="Open on its main page"
          >
            <div className="ya-row-body">
              <div className="ya-row-title">{r.title}</div>
              {r.sub && <div className="ya-row-sub">{r.sub}</div>}
              {r.meta && <div className="ya-row-meta">{r.meta}</div>}
            </div>
            <span className="ya-row-go">›</span>
          </li>
        );
      })}
    </ul>
  );
}
