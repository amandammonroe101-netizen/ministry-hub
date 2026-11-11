import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts, useGuests, useTrainees, GUEST_STAGES, stageIndex } from './hospitalityListsConfig';
import { HOSPITALITY_GROUPS } from './hospitalityConfig';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import '../youth/Overview.css';

/* Hospitality → Overview
   The home base for the hospitality ministry — at-a-glance counts,
   the next special event / catering job on the calendar, attention
   items pulled from the guest pipeline / schedule / gift inventory,
   and quick navigation to every sub-page. Reads from every other
   hospitality: store; writes nothing. */

const ACCENT = '#fb923c';
const today = () => new Date().toISOString().slice(0, 10);

export default function Overview() {
  const navigate = useNavigate();
  const [hosts, , { loading }] = useHosts();
  const [guests] = useGuests();
  const [trainees] = useTrainees();
  const [schedule] = useUserStoreKey('hospitality:schedule', []);
  const [inventory] = useUserStoreKey('hospitality:gift-inventory', []);
  const [weddings] = useUserStoreKey('hospitality:weddings', []);
  const [funerals] = useUserStoreKey('hospitality:funerals', []);
  const [holidays] = useUserStoreKey('hospitality:holiday-events', []);
  const [catering] = useUserStoreKey('hospitality:catering-requests', []);
  const [preServiceRun] = useUserStoreKey('hospitality:pre-service-run', { date: '', checked: [] });
  const [preServiceItems] = useUserStoreKey('hospitality:pre-service-items', []);

  const hostList     = Array.isArray(hosts) ? hosts : [];
  const guestList    = Array.isArray(guests) ? guests : [];
  const traineeList  = Array.isArray(trainees) ? trainees : [];
  const scheduleList = Array.isArray(schedule) ? schedule : [];
  const inventoryList = Array.isArray(inventory) ? inventory : [];
  const weddingList  = Array.isArray(weddings) ? weddings : [];
  const funeralList  = Array.isArray(funerals) ? funerals : [];
  const holidayList  = Array.isArray(holidays) ? holidays : [];
  const cateringList = Array.isArray(catering) ? catering : [];

  const day = today();
  const thisMonth = day.slice(0, 7);

  const stats = useMemo(() => ({
    activeHosts:    hostList.filter(h => h.status !== 'on-leave').length,
    inTraining:     traineeList.length,
    visitors:       guestList.filter(g => (g.visitDate || '').slice(0, 7) === thisMonth).length,
    activePipeline: guestList.filter(g => g.stage !== 'attending').length,
    unfilledSlots:  scheduleList.filter(s => !s.hostId).length,
    lowGiftStock:   inventoryList.filter(i => i.count <= i.lowThreshold).length,
    upcomingEvents: [...weddingList, ...funeralList, ...holidayList]
      .filter(e => e.status !== 'complete' && (e.date || '') >= day).length,
    upcomingCatering: cateringList.filter(c => c.status !== 'complete' && (c.date || '') >= day).length,
  }), [hostList, traineeList, guestList, scheduleList, inventoryList, weddingList, funeralList, holidayList, cateringList, thisMonth, day]);

  /* Next event = nearest upcoming wedding, funeral, holiday event, or catering job. */
  const nextEvent = useMemo(() => {
    const candidates = [
      ...weddingList.map(w => ({ type: 'Wedding', name: w.couple || 'Wedding', date: w.date, path: '/hospitality/events/weddings' })),
      ...funeralList.map(f => ({ type: 'Service', name: f.family || 'Service', date: f.date, path: '/hospitality/events/funerals' })),
      ...holidayList.map(h => ({ type: 'Holiday event', name: h.title || 'Holiday event', date: h.date, path: '/hospitality/events/holiday' })),
      ...cateringList.map(c => ({ type: 'Catering', name: c.title || 'Catering request', date: c.date, path: '/hospitality/food/catering' })),
    ].filter(c => (c.date || '') >= day);
    return candidates.sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || null;
  }, [weddingList, funeralList, holidayList, cateringList, day]);

  /* Attention items — things the user probably wants to deal with. */
  const attention = useMemo(() => {
    const out = [];
    if (stats.activePipeline > 0)
      out.push({ emoji: '📋', text: `${stats.activePipeline} guest${stats.activePipeline === 1 ? '' : 's'} in the follow-up pipeline`, path: '/hospitality/guests/follow-up' });
    if (stats.unfilledSlots > 0)
      out.push({ emoji: '⚡', text: `${stats.unfilledSlots} scheduling slot${stats.unfilledSlots === 1 ? '' : 's'} unfilled`, path: '/hospitality/ops/scheduling' });
    if (stats.lowGiftStock > 0)
      out.push({ emoji: '🎁', text: `${stats.lowGiftStock} gift item${stats.lowGiftStock === 1 ? '' : 's'} running low`, path: '/hospitality/guests/gifts' });
    if (preServiceItems.length > 0 && preServiceRun.date !== day)
      out.push({ emoji: '⏱', text: "Today's pre-service checklist hasn't been started", path: '/hospitality/ops/pre-service' });
    if (hostList.length === 0)
      out.push({ emoji: '👋', text: 'Add your first host to get started', path: '/hospitality/all' });
    return out;
  }, [stats, preServiceItems, preServiceRun, day, hostList]);

  /* Guest-stage snapshot, reusing the same stage constants as the
     Follow-Up Pipeline / Gifts / Connect Events pages. */
  const stageCounts = useMemo(() => GUEST_STAGES.map(s => ({
    ...s,
    count: guestList.filter(g => stageIndex(g.stage) === stageIndex(s.key)).length,
  })), [guestList]);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  if (loading) {
    return (
      <HospitalityShell
        title="Overview"
        icon="🏠"
        subtitle="Dashboard for the Hospitality ministry."
        avatarInitials={initials}
        avatarTitle={avatarSourceName}
        onProfileClick={() => setShowProfile(true)}
      >
        <div className="yov-root" style={{ '--yov-accent': ACCENT }}>
          <div className="yov-shell">Loading…</div>
        </div>
      </HospitalityShell>
    );
  }

  return (
    <HospitalityShell
      title="Overview"
      icon="🏠"
      subtitle="This Sunday's host coverage, first-time visitor pipeline, upcoming events, and gift-bag inventory — all in one place."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yov-root" style={{ '--yov-accent': ACCENT }}>
        <div className="yov-shell">

          {/* Top row: next event + attention items */}
          <section className="yov-top">
            <article className="yov-next">
              <div className="yov-next-label">Next on the calendar</div>
              {nextEvent ? (
                <>
                  <div className="yov-next-name">{nextEvent.name}</div>
                  <div className="yov-next-meta">
                    <span className="app-pill active">{nextEvent.type}</span>
                    <span className="yov-next-date">📅 {nextEvent.date}</span>
                  </div>
                  <button className="app-btn primary yov-next-btn" onClick={() => navigate(nextEvent.path)}>Open →</button>
                </>
              ) : (
                <div className="yov-empty-text">Nothing scheduled yet. Plan a wedding, funeral, holiday event, or catering job to fill this in.</div>
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
            <Stat n={stats.activeHosts}      label="Active hosts"       emoji="🧑‍🤝‍🧑" onClick={() => navigate('/hospitality/all')} />
            <Stat n={stats.inTraining}       label="In training"        emoji="✨" onClick={() => navigate('/hospitality/training')} />
            <Stat n={stats.visitors}         label="Visitors this month" emoji="👋" onClick={() => navigate('/hospitality/guests/follow-up')} />
            <Stat n={stats.activePipeline}   label="In follow-up"       emoji="📋" onClick={() => navigate('/hospitality/guests/follow-up')} />
            <Stat n={stats.unfilledSlots}    label="Unfilled slots"     emoji="⚡" onClick={() => navigate('/hospitality/ops/scheduling')} />
            <Stat n={stats.lowGiftStock}     label="Low gift stock"     emoji="🎁" onClick={() => navigate('/hospitality/guests/gifts')} />
            <Stat n={stats.upcomingEvents}   label="Upcoming events"    emoji="💒" onClick={() => navigate('/hospitality/events/weddings')} />
            <Stat n={stats.upcomingCatering} label="Upcoming catering"  emoji="🧁" onClick={() => navigate('/hospitality/food/catering')} />
          </section>

          {/* Guest pipeline snapshot */}
          <section className="yov-attention" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="yov-section-label">First-time guest pipeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stageCounts.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, width: 150, flexShrink: 0 }}>{s.icon} {s.label}</span>
                  <div style={{ flex: 1, background: 'rgba(168,80,46,0.10)', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                    <div style={{ width: `${guestList.length ? (s.count / guestList.length) * 100 : 0}%`, background: 'var(--yov-accent)', height: '100%' }} />
                  </div>
                  <span style={{ fontSize: 12, width: 24, textAlign: 'right' }}>{s.count}</span>
                </div>
              ))}
            </div>
            <button className="app-btn ghost yov-next-btn" onClick={() => navigate('/hospitality/records/engagement')}>View full engagement report →</button>
          </section>

          {/* Browse all sub-pages */}
          <section className="yov-groups">
            <div className="yov-section-label">All sections</div>
            {HOSPITALITY_GROUPS.map(group => (
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
      </div>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
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
