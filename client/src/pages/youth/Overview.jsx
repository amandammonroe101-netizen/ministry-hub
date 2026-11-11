import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import { YOUTH_GROUPS } from './youthConfig';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import YouthOnboardingModal from './YouthOnboardingModal';
import { YOUTH_VISIBILITY_STORAGE_KEY, YOUTH_ONBOARDING_SEEN_KEY, isYouthPageVisible } from './youthVisibilityConfig';
import './Overview.css';

/* Youth → Overview
   The home base for the youth ministry — at-a-glance counts, the
   next event, attention items, and quick navigation to every
   sub-page. Reads from every other youth: store; writes nothing. */

export default function Overview() {
  const navigate = useNavigate();
  const [students]   = useUserStoreKey('youth:students', []);
  const [leaders]    = useUserStoreKey('youth:leaders', []);
  const [series]     = useUserStoreKey('youth:series', []);
  const [trips]      = useUserStoreKey('youth:trips', []);
  const [nights]     = useUserStoreKey('youth:weeklyNights', []);
  const [outreaches] = useUserStoreKey('youth:outreach', []);
  const [forms]      = useUserStoreKey('youth:forms', []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* First-ever visit: ask which pages to show, then never show this
     again (see YOUTH_ONBOARDING_SEEN_KEY). */
  const [onboardingSeen, setOnboardingSeen, { loading: onboardingLoading }] =
    useUserStoreKey(YOUTH_ONBOARDING_SEEN_KEY, false);
  const [pageVisibility, setPageVisibility] = useUserStoreKey(YOUTH_VISIBILITY_STORAGE_KEY, {});
  const showOnboarding = !onboardingLoading && !onboardingSeen;

  const finishOnboarding = (visibility) => {
    setPageVisibility(visibility);
    setOnboardingSeen(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const studentList = students   || [];
  const leaderList  = leaders    || [];
  const tripList    = trips      || [];
  const nightList   = nights     || [];
  const outreachList = outreaches|| [];
  const seriesList  = series     || [];
  const formList    = forms      || [];

  const stats = useMemo(() => ({
    students:        studentList.length,
    visitors:        studentList.filter(s => s.visitorStatus && s.visitorStatus !== 'connected').length,
    activeLeaders:   leaderList.filter(l => l.active).length,
    flaggedLeaders:  leaderList.filter(l => l.active && l.bgStatus !== 'cleared').length,
    activeSeries:    seriesList.filter(s => !s.archived).length,
    upcomingTrips:   tripList.filter(t => (t.endDate || t.startDate || '') >= today).length,
    upcomingNights:  nightList.filter(n => (n.date || '') >= today).length,
    upcomingOutreach:outreachList.filter(o => (o.date || '') >= today).length,
    pendingPerms:    formList.reduce((a, f) =>
      a + Object.values(f.status || {}).filter(s => s === 'pending').length, 0),
  }), [studentList, leaderList, seriesList, tripList, nightList, outreachList, formList, today]);

  /* Next event = next thing happening across nights + trips + outreaches. */
  const nextEvent = useMemo(() => {
    const candidates = [
      ...nightList.map(n => ({ type: 'Weekly night', name: n.theme || `Night ${n.date}`, date: n.date, path: '/youth/weekly-nights' })),
      ...tripList.map(t => ({ type: 'Trip', name: t.name || 'Trip', date: t.startDate, path: '/youth/trips' })),
      ...outreachList.map(o => ({ type: 'Outreach', name: o.name || 'Outreach', date: o.date, path: '/youth/outreach' })),
    ].filter(c => (c.date || '') >= today);
    return candidates.sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || null;
  }, [nightList, tripList, outreachList, today]);

  /* Attention items — things the user probably wants to deal with. */
  const attention = useMemo(() => {
    const out = [];
    if (stats.visitors > 0)
      out.push({ emoji: '🆕', text: `${stats.visitors} visitor${stats.visitors === 1 ? '' : 's'} need follow-up`, path: '/youth/visitors' });
    if (stats.flaggedLeaders > 0)
      out.push({ emoji: '⚠️', text: `${stats.flaggedLeaders} active leader${stats.flaggedLeaders === 1 ? '' : 's'} need background check`, path: '/youth/leaders' });
    if (stats.pendingPerms > 0)
      out.push({ emoji: '📝', text: `${stats.pendingPerms} permission slip${stats.pendingPerms === 1 ? '' : 's'} pending`, path: '/youth/forms' });
    if (studentList.length === 0)
      out.push({ emoji: '👋', text: 'Add your first student to get started', path: '/youth/students' });
    return out;
  }, [stats, studentList]);

  const visibleGroups = useMemo(
    () => YOUTH_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => isYouthPageVisible(pageVisibility, i.path)) }))
      .filter(g => g.items.length > 0),
    [pageVisibility],
  );

  return (
    <YouthShell
      title="Youth Ministry"
      icon="⚡"
      subtitle="Overview & quick access"
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yov-shell" style={{ '--yov-accent': 'var(--yps-accent, #b45309)' }}>

        {/* Top row: next event + attention items */}
        <section className="yov-top">
          <article className="yov-next">
            <div className="yov-next-label">Next on the calendar</div>
            {nextEvent ? (
              <>
                <div className="yov-next-name">{nextEvent.name}</div>
                <div className="yov-next-meta">
                  <span className="yps-pill accent">{nextEvent.type}</span>
                  <span className="yov-next-date">📅 {nextEvent.date}</span>
                </div>
                <button className="yps-btn yov-next-btn" onClick={() => navigate(nextEvent.path)}>Open →</button>
              </>
            ) : (
              <div className="yov-empty-text">Nothing scheduled yet. Plan a weekly night, trip, or outreach to fill this in.</div>
            )}
          </article>

          <article className="yov-attention">
            <div className="yov-section-label">Attention</div>
            {attention.length === 0 ? (
              <div className="yov-empty-text">All clear — nothing flagged right now.</div>
            ) : (
              <ul className="yov-attention-list">
                {attention.map((a, i) => (
                  <li key={i} className="yov-attention-row" onClick={() => navigate(a.path)}>
                    <span className="yov-attention-emoji">{a.emoji}</span>
                    <span>{a.text}</span>
                    <span className="yov-attention-arrow">›</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        {/* Stats grid */}
        <section className="yov-stats">
          <Stat n={stats.students}         label="Students"          emoji="👥" onClick={() => navigate('/youth/students')} />
          <Stat n={stats.visitors}         label="Visitors"          emoji="👋" onClick={() => navigate('/youth/visitors')} />
          <Stat n={stats.activeLeaders}    label="Active leaders"    emoji="🧑‍🏫" onClick={() => navigate('/youth/leaders')} />
          <Stat n={stats.activeSeries}     label="Active series"     emoji="📚" onClick={() => navigate('/youth/lessons')} />
          <Stat n={stats.upcomingNights}   label="Upcoming nights"   emoji="🌙" onClick={() => navigate('/youth/weekly-nights')} />
          <Stat n={stats.upcomingTrips}    label="Upcoming trips"    emoji="🏕" onClick={() => navigate('/youth/trips')} />
          <Stat n={stats.upcomingOutreach} label="Upcoming outreach" emoji="🤲" onClick={() => navigate('/youth/outreach')} />
          <Stat n={stats.pendingPerms}     label="Pending permissions" emoji="📝" onClick={() => navigate('/youth/forms')} />
        </section>

        {/* Browse all sub-pages */}
        <section className="yov-groups">
          <div className="yov-section-label">All sections</div>
          {visibleGroups.map(group => (
            <div key={group.key} className="yov-group">
              <div className="yov-group-hd">
                <span>{group.icon}</span> {group.label}
              </div>
              <div className="yov-group-items">
                {group.items.map(item => (
                  <button
                    key={item.path}
                    className="yov-group-item"
                    onClick={() => navigate(item.path)}
                  >
                    <span className="yov-group-icon">{item.icon}</span>
                    <span className="yov-group-label">{item.label}</span>
                    <span className="yov-group-arrow">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />

      {showOnboarding && <YouthOnboardingModal onFinish={finishOnboarding} />}
    </YouthShell>
  );
}

function Stat({ n, label, emoji, onClick }) {
  return (
    <button className="yov-stat" onClick={onClick}>
      <span className="yov-stat-emoji">{emoji}</span>
      <span className="yov-stat-n">{n}</span>
      <span className="yov-stat-l">{label}</span>
    </button>
  );
}
