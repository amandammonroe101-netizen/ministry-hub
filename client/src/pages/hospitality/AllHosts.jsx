import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useHosts, ROLES, roleMeta, useServiceOptions, DEFAULT_SERVICE_OPTIONS } from './hospitalityListsConfig';
import ServiceOptionsSettings from './ServiceOptionsSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useMyConnections } from '../../lib/contactRequests';
import { requestInfoShare, useMyInfoShareRequests } from '../../lib/infoShareRequests';
import { getProfileByUid } from '../../lib/userProfile';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { ensureDirectChannel } from '../../lib/directChat';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → All Hosts

   The central hospitality volunteer directory. Every station page
   (Parking Lot, Greeters, Welcome Center, Ushers & Seating,
   Offering & Communion, Coffee & Snacks, Setup & Decor) and
   Scheduling assign FROM this same list by host id — a host's
   name/photo/contact/roles only ever live here.

   Storage: useUserStoreKey('hospitality:hosts', [])
   Reads (read-only, for coverage + check-in nudges):
     useUserStoreKey('hospitality:schedule', [])   — Scheduling page

   A host card opens in a read-only VIEW mode first (WomanView-style
   pattern from Women's Ministry) — an explicit "✎ Edit" button
   switches into the full editable form.
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  active:     { label: 'Active',      icon: '🟢' },
  training:   { label: 'In Training', icon: '🎓' },
  'on-leave': { label: 'On Leave',    icon: '⏸️' },
};
const STATUS_ORDER = ['active', 'training', 'on-leave'];

const STALE_DAYS = 90;

const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_SLOT_OPTIONS = ['Morning', 'Midday', 'Evening'];

const CARE_TYPES = [
  { key: 'thank-you', label: 'Thank-you',        icon: '💌' },
  { key: 'birthday',  label: 'Birthday reminder', icon: '🎂' },
  { key: 'check-in',  label: 'Check-in',          icon: '👋' },
  { key: 'other',     label: 'Other',             icon: '📌' },
];
const careTypeMeta = (key) => CARE_TYPES.find(t => t.key === key) || CARE_TYPES[CARE_TYPES.length - 1];

/* Birthday → Calendar sync, opt-in per host (see AllWomen.jsx's
   identical syncBirthdayToCalendar pattern). */
const CAL_SOURCE_BDAY = 'hospitality-birthday';
const CAL_COLOR_BDAY  = '#a8502e'; // terracotta — matches the Hospitality accent

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* Next occurrence (this year or next) of a YYYY-MM-DD birthday,
   parsed as LOCAL midnight to avoid timezone off-by-one bugs. */
function nextAnniversaryISO(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month, day);
  if (next.getTime() < t0.getTime()) next = new Date(now.getFullYear() + 1, month, day);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

const DEFAULT_HOST = () => ({
  id:                makeId('host'),
  name:              '',
  contactUid:        '',   // linked My Contacts uid, if the name matched a connection
  contactEmailHidden: false, // that connection's email/phone is hidden from the directory
  contactPhoneHidden: false, // — unlocks the "Request info" flow instead of leaving it blank
  infoRequestId:     '',   // outstanding/resolved infoShareRequests doc id, if any
  photoUrl:          '',
  roles:             [],
  primaryRole:       '',
  status:            'active',
  servicePreference: '',
  phone:             '',
  email:             '',
  availability:      [],   // [{ id, day, time }] — multiple slots, editable on double-click
  stationPref:       '',   // free-text preferred station / accommodation notes
  spouseId:          '',   // linked host record — "spouse also serves"
  joinedDate:        today(),
  birthday:          '',
  syncBirthdayToCalendar: false,
  careLog:           [],   // [{ id, type, date, note, done }] — thank-yous, birthday reminders, check-ins
  notes:             '',
  createdAt:         Date.now(),
});

/* "X yr Y mo serving" tenure badge, computed straight from joinedDate —
   no separate field to keep in sync. */
function tenureLabel(joinedDate) {
  if (!joinedDate) return null;
  const start = new Date(joinedDate);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((Date.now() - start.getTime()) / 86400000);
  if (days < 0) return null;
  if (days < 30) return 'New this month';
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo serving`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days - years * 365) / 30);
  return remMonths > 0 ? `${years} yr ${remMonths} mo serving` : `${years} yr serving`;
}

export default function AllHosts() {
  const [hosts, setHosts, { loading }] = useHosts();
  const [schedule] = useUserStoreKey('hospitality:schedule', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [serviceOptionsRaw] = useServiceOptions();
  const serviceOptions = Array.isArray(serviceOptionsRaw) && serviceOptionsRaw.length ? serviceOptionsRaw : DEFAULT_SERVICE_OPTIONS;
  const list = Array.isArray(hosts) ? hosts : [];
  const scheduleList = Array.isArray(schedule) ? schedule : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials, user, profile } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' — for the slide-over
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [staleOnly, setStaleOnly] = useState(false);

  /* Birthday → Calendar sync helpers (mirrors AllWomen.jsx exactly).
     Off by default — only hosts with syncBirthdayToCalendar show up,
     so the Hospitality → Calendar relationship is always intentional. */
  const syncBirthdayCalendarFor = (host) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const sourceId = `${host.id}__bday`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE_BDAY && e.source_id === sourceId));
      if (!host.syncBirthdayToCalendar || !host.birthday) return others;
      const date = nextAnniversaryISO(host.birthday);
      if (!date) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_bday_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       `🎂 ${host.name || 'Host'}'s birthday`,
        description: host.birthday ? `Born ${host.birthday}.` : '',
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_BDAY,
        category:    'hospitality',
        source:      CAL_SOURCE_BDAY,
        source_id:   sourceId,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeBirthdayCalendarFor = (hostId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_BDAY && (e.source_id || '').startsWith(`${hostId}__`))
    ));
  };

  const addHost = () => {
    const h = DEFAULT_HOST();
    setHosts(prev => [...(prev || []), h]);
    setSelectedId(h.id);
    setMode('edit');
  };
  const updateHost = (id, patch) => {
    setHosts(prev => (prev || []).map(h => h.id === id ? { ...h, ...patch } : h));
    const current = list.find(h => h.id === id);
    if (current) syncBirthdayCalendarFor({ ...current, ...patch });
  };
  const removeHost = (id) => {
    setHosts(prev => (prev || []).filter(h => h.id !== id));
    removeBirthdayCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  /* Bidirectional "spouse also serves" link — setting it on one host
     mirrors onto the other, and clears any stale reverse-link left
     over from a previous pairing. */
  const setSpouse = (hostId, spouseId) => {
    setHosts(prev => {
      const list = prev || [];
      const current = list.find(h => h.id === hostId);
      const oldSpouseId = current?.spouseId || '';
      return list.map(h => {
        if (h.id === hostId) return { ...h, spouseId: spouseId || '' };
        if (spouseId && h.id === spouseId) return { ...h, spouseId: hostId };
        if (oldSpouseId && h.id === oldSpouseId && h.id !== spouseId) return { ...h, spouseId: '' };
        return h;
      });
    });
  };

  /* Opens (or creates) an immediately-usable private chat with a host
     linked to a Contacts connection — no invite/accept step, since
     they're already a mutual connection. See lib/directChat.js. */
  const startChat = async (host) => {
    if (!host?.contactUid || !user?.uid) return;
    const channelId = await ensureDirectChannel({
      myUid:     user.uid,
      myName:    profile?.displayName || user.displayName || 'Member',
      otherUid:  host.contactUid,
      otherName: host.name,
    });
    navigate('/chat', { state: { openChannelId: channelId } });
  };

  const selected = useMemo(() => list.find(h => h.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  /* When a member accepts one of our contact-info requests, backfill
     the shared phone/email straight onto the host that request was
     made for (matched by infoRequestId) — even if that member has
     phone/email hidden in their own profile, since accepting is an
     explicit, one-time consented share (see infoShareRequests.js). */
  const { requests: infoRequests } = useMyInfoShareRequests();
  useEffect(() => {
    if (!user?.uid || !infoRequests.length || !list.length) return;
    const accepted = infoRequests.filter(r => r.status === 'accepted' && r.senderUid === user.uid);
    if (!accepted.length) return;
    list.forEach(h => {
      if (!h.infoRequestId) return;
      const match = accepted.find(r => r.id === h.infoRequestId);
      if (!match) return;
      const patch = {};
      if (!h.phone && match.sharedPhone) patch.phone = match.sharedPhone;
      if (!h.email && match.sharedEmail) patch.email = match.sharedEmail;
      if (Object.keys(patch).length === 0) return;
      updateHost(h.id, patch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoRequests, list, user]);

  /* Last actually-served date per host, from Scheduling's slots —
     powers the "needs a check-in" nudge below. */
  const lastServedMap = useMemo(() => {
    const map = {};
    const t = today();
    for (const s of scheduleList) {
      if (!s.hostId || !s.date || s.date > t) continue;
      if (!map[s.hostId] || s.date > map[s.hostId]) map[s.hostId] = s.date;
    }
    return map;
  }, [scheduleList]);

  const isStale = useMemo(() => {
    const cutoff = daysAgoISO(STALE_DAYS);
    return (h) => {
      if ((h.status || 'active') !== 'active') return false;
      const last = lastServedMap[h.id];
      if (last) return last < cutoff;
      return Boolean(h.joinedDate) && h.joinedDate < cutoff;
    };
  }, [lastServedMap]);

  const staleHosts = useMemo(() => list.filter(isStale), [list, isStale]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(h => (h.name || '').toLowerCase().includes(q) || (h.primaryRole || '').toLowerCase().includes(q))
      : list;
    if (statusFilter !== 'all') out = out.filter(h => (h.status || 'active') === statusFilter);
    if (roleFilter !== 'all') out = out.filter(h => (h.roles || []).includes(roleFilter));
    if (staleOnly) out = out.filter(isStale);
    return [...out].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, statusFilter, roleFilter, staleOnly, isStale]);

  const stats = useMemo(() => ({
    total:    list.length,
    active:   list.filter(h => (h.status || 'active') === 'active').length,
    training: list.filter(h => h.status === 'training').length,
  }), [list]);

  return (
    <HospitalityShell
      title="All Hosts"
      icon="🧑‍🤝‍🧑"
      subtitle="Directory of every hospitality volunteer — photo, contact, primary role, service preference, and availability."
      actions={
        <button type="button" className="hms-btn primary" onClick={addHost}>
          ✦ New host
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading && list.length === 0 ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : list.length === 0 ? (
            <div className="ha-empty app-empty">
              <div className="app-empty-icon">🧑‍🤝‍🧑</div>
              <div className="app-empty-title">No hosts added yet</div>
              <div className="app-empty-sub">
                Build the hospitality volunteer directory — every station
                page and the Scheduling page will assign from this same
                list by name.
              </div>
              <button type="button" className="app-btn primary" onClick={addHost}>
                ✦ Add your first host
              </button>
            </div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat">
                  <span className="ha-stat-n">{stats.total}</span>
                  <span className="ha-stat-lbl">Hosts</span>
                </div>
                <div className="ha-stat">
                  <span className="ha-stat-n">{stats.active}</span>
                  <span className="ha-stat-lbl">Active</span>
                </div>
                <div className="ha-stat">
                  <span className="ha-stat-n">{stats.training}</span>
                  <span className="ha-stat-lbl">In training</span>
                </div>
                <div className={`ha-stat${staleHosts.length > 0 ? ' is-warn' : ''}`}>
                  <span className="ha-stat-n">{staleHosts.length}</span>
                  <span className="ha-stat-lbl">Needs a check-in</span>
                </div>
              </div>

              <div className="ha-controls">
                <div className="ha-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by name or role…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="ha-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
              </div>

              <div className="ha-filter-row">
                <button type="button" className={`ha-filter-chip ${statusFilter === 'all' ? 'on' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
                {STATUS_ORDER.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={`ha-filter-chip ${statusFilter === id ? 'on' : ''}`}
                    onClick={() => setStatusFilter(id)}
                  >{STATUS_META[id].icon} {STATUS_META[id].label}</button>
                ))}
                {staleHosts.length > 0 && (
                  <button
                    type="button"
                    className={`ha-filter-chip warn ${staleOnly ? 'on' : ''}`}
                    onClick={() => setStaleOnly(v => !v)}
                    title="Active hosts not scheduled in the last 90 days"
                  >⚠️ Needs check-in ({staleHosts.length})</button>
                )}
              </div>
              <div className="ha-filter-row">
                <button type="button" className={`ha-filter-chip ${roleFilter === 'all' ? 'on' : ''}`} onClick={() => setRoleFilter('all')}>All roles</button>
                {ROLES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    className={`ha-filter-chip ${roleFilter === r.key ? 'on' : ''}`}
                    onClick={() => setRoleFilter(r.key)}
                  >{r.icon} {r.label}</button>
                ))}
              </div>

              {visible.length === 0 ? (
                <div className="ha-directory-empty">
                  {query ? `No hosts match "${query}".` : 'No hosts match this filter.'}
                </div>
              ) : (
                <div className="ha-card-grid">
                  {visible.map(h => (
                    <HostCard key={h.id} host={h} stale={isStale(h)} onClick={() => { setSelectedId(h.id); setMode('view'); }} />
                  ))}
                </div>
              )}
            </div>
          )}

      {selected && (
        <>
          <div className="ha-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="ha-slide" role="dialog" aria-label="Host">
            <button className="ha-slide-close" onClick={() => setSelectedId(null)} aria-label="Close" title="Close (Esc)">✕</button>
            <div className="ha-slide-body">
              {mode === 'view' ? (
                <HostView
                  host={selected}
                  hosts={list}
                  schedule={scheduleList}
                  onEdit={() => setMode('edit')}
                  onChat={() => startChat(selected)}
                  onChange={(patch) => updateHost(selected.id, patch)}
                  onNavTag={(target) => navigate(target)}
                />
              ) : (
                <HostForm
                  key={selected.id}
                  host={selected}
                  hosts={list}
                  schedule={scheduleList}
                  serviceOptions={serviceOptions}
                  user={user}
                  profile={profile}
                  onChange={(patch) => updateHost(selected.id, patch)}
                  onDelete={() => removeHost(selected.id)}
                  onNavTag={(target) => navigate(target)}
                  onSetSpouse={(spouseId) => setSpouse(selected.id, spouseId)}
                  onChat={() => startChat(selected)}
                  onDone={() => setMode('view')}
                />
              )}
            </div>
          </aside>
        </>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageSettings={<ServiceOptionsSettings />}
      />
    </HospitalityShell>
  );
}

function HostCard({ host, stale, onClick }) {
  const status = host.status || 'active';
  const meta = STATUS_META[status] || STATUS_META.active;
  const fromTraining = /^Promoted from training/.test(host.notes || '');

  return (
    <button type="button" className="ha-fc" onClick={onClick}>
      <span className="ha-fc-stripe" />
      {stale && <span className="ha-fc-badge ha-fc-badge-warn">⚠️ Check in</span>}
      <AvatarDot url={host.photoUrl} name={host.name} />
      <span className="ha-fc-name">{host.name || 'Unnamed host'}</span>
      <span className={`ha-fc-status${status === 'active' ? '' : ' inactive'}`}>{meta.icon} {meta.label}</span>
      {(host.spouseId || fromTraining) && (
        <div className="ha-fc-pills">
          {host.spouseId && <span className="ha-pill" style={{ '--pill-c': '#c084fc' }}>💍 Spouse serves</span>}
          {fromTraining && <span className="ha-pill" style={{ '--pill-c': '#22c55e' }}>🎓 From training</span>}
        </div>
      )}
    </button>
  );
}

/* ── Read-only view (shown on card click) ────────────────────── */
function HostView({ host, hosts, schedule, onEdit, onChat, onChange, onNavTag }) {
  const [chatBusy, setChatBusy] = useState(false);
  const tenure = tenureLabel(host.joinedDate);
  const status = host.status || 'active';
  const statusMeta = STATUS_META[status] || STATUS_META.active;
  const primary = roleMeta(host.primaryRole);
  const spouse = useMemo(() => (hosts || []).find(h => h.id === host.spouseId) || null, [hosts, host.spouseId]);
  const coverage = useMemo(() => {
    const mine = (schedule || []).filter(s => s.hostId === host.id);
    const t = today();
    const upcoming = mine.filter(s => s.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    const pastCount = mine.filter(s => s.date < t).length;
    return { upcoming, pastCount };
  }, [schedule, host.id]);
  const avail = Array.isArray(host.availability) ? host.availability : [];
  const careLog = Array.isArray(host.careLog) ? host.careLog : [];
  const sortedCare = useMemo(
    () => [...careLog].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [careLog]
  );
  const toggleCareDone = (id) => {
    onChange?.({ careLog: careLog.map(c => c.id === id ? { ...c, done: !c.done } : c) });
  };

  const handleChat = async () => {
    setChatBusy(true);
    try {
      await onChat();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hospitality] could not start chat:', err);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AvatarDot url={host.photoUrl} name={host.name} large />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className="ys-form-title">{host.name || 'Unnamed host'}</h2>
            {tenure && <span className="ha-tenure-badge">🎖️ {tenure}</span>}
          </div>
        </div>
        <button type="button" className="app-btn primary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={onEdit}>
          ✎ Edit
        </button>
      </div>

      {host.contactUid && (
        <button type="button" className="ha-chat-btn" onClick={handleChat} disabled={chatBusy}>
          {chatBusy ? 'Opening chat…' : `💬 Chat with ${host.name || 'this host'}`}
        </button>
      )}

      <Section title="Roles">
        <ViewRow label="Primary role" value={primary ? `${primary.icon} ${primary.label}` : ''} />
        <ViewRow label="Status" value={`${statusMeta.icon} ${statusMeta.label}`} />
        <ViewRow label="Preferred station / notes" value={host.stationPref} />
      </Section>

      {spouse && (
        <Section title="Household">
          <div className="ha-household-note">💍 Linked with <b>{spouse.name}</b> — shows on both records.</div>
        </Section>
      )}

      <Section title="Status & schedule">
        <ViewRow label="Service preference" value={host.servicePreference} />
        <ViewRow label="Joined" value={host.joinedDate} />
      </Section>

      {avail.length > 0 && (
        <Section title="Availability">
          <div className="ha-avail-chips">
            {avail.map(s => <span key={s.id} className="ha-avail-chip static">{s.day} · {s.time}</span>)}
          </div>
        </Section>
      )}

      <Section title="Coverage">
        {coverage.upcoming.length === 0 ? (
          <div className="ha-directory-empty" style={{ padding: '10px 4px', textAlign: 'left' }}>No upcoming Sundays scheduled.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {coverage.upcoming.map(s => {
              const r = roleMeta(s.roleKey);
              return (
                <button
                  key={s.id}
                  type="button"
                  className="ha-list-row"
                  disabled={!r?.path}
                  title={r ? `Open ${r.label} station page` : ''}
                  onClick={() => r?.path && onNavTag?.(r.path)}
                >
                  <span className="ha-list-row-title">{s.date} · {s.service}</span>
                  <span className="ha-list-row-meta">{r ? `${r.icon} ${r.label}` : ''}</span>
                  {r?.path && <span className="ha-list-row-go">›</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="ha-coverage-summary">Served {coverage.pastCount} time{coverage.pastCount === 1 ? '' : 's'} on record — see Scheduling for the full history.</div>
      </Section>

      {(host.phone || host.email) && (
        <Section title="Contact">
          <ViewRow label="Phone" value={host.phone} />
          <ViewRow label="Email" value={host.email} />
        </Section>
      )}

      {(host.birthday || sortedCare.length > 0) && (
        <Section title="Care & follow-up">
          <ViewRow label="Birthday" value={host.birthday} />
          {host.birthday && host.syncBirthdayToCalendar && (
            <div className="ha-household-note">📅 Synced to Calendar</div>
          )}
          {sortedCare.length > 0 && (
            <div className="ha-care-log-list">
              {sortedCare.map(c => (
                <div key={c.id} className={`ha-care-log-row${c.done ? ' done' : ''}`}>
                  <button type="button" className="ha-care-check" onClick={() => toggleCareDone(c.id)} title={c.done ? 'Mark as not done' : 'Mark as done'}>
                    {c.done ? '✅' : '⬜'}
                  </button>
                  <span className="ha-care-icon" aria-hidden="true">{careTypeMeta(c.type).icon}</span>
                  <div className="ha-care-log-body">
                    <span className="ha-care-log-date">{c.date}</span>
                    <span className="ha-care-log-note">{c.note || careTypeMeta(c.type).label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {host.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: 'var(--hms-ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {host.notes}
          </div>
        </Section>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="ha-view-row">
      <span className="ha-view-lbl">{label}</span>
      <span className="ha-view-val">{value}</span>
    </div>
  );
}

/* ── Editable form (shown via the view's "✎ Edit" button) ─────── */
function HostForm({ host, hosts, schedule, serviceOptions, user, profile, onChange, onDelete, onNavTag, onSetSpouse, onChat, onDone }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  const toggleRole = (key) => {
    const roles = Array.isArray(host.roles) ? host.roles : [];
    const next = roles.includes(key) ? roles.filter(r => r !== key) : [...roles, key];
    const patch = { roles: next };
    if (!next.includes(host.primaryRole)) patch.primaryRole = next[0] || '';
    onChange(patch);
  };

  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 480, quality: 0.85 });
      onChange({ photoUrl: dataUrl });
    } catch (err) {
      setPhotoError(err?.message || 'Could not add that photo.');
    }
  };

  const handleChat = async () => {
    setChatBusy(true);
    try {
      await onChat();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hospitality] could not start chat:', err);
    } finally {
      setChatBusy(false);
    }
  };

  /* ── Request-info flow — ask the linked Contacts connection to
     share their phone/email when it's hidden from the directory.
     Consent-based: nothing is shared until they accept (see
     lib/infoShareRequests.js and AllHosts()'s auto-apply effect). */
  const { requests: infoRequests } = useMyInfoShareRequests();
  const sentInfoRequest = useMemo(() => {
    if (!host.infoRequestId) return null;
    return infoRequests.find(r => r.id === host.infoRequestId) || null;
  }, [infoRequests, host.infoRequestId]);
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [infoRequestError, setInfoRequestError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const needsEmail = Boolean(host.contactUid) && host.contactEmailHidden && !host.email;
  const needsPhone = Boolean(host.contactUid) && host.contactPhoneHidden && !host.phone;

  const handleRequestInfo = async () => {
    if (!host.contactUid || (!needsEmail && !needsPhone)) return;
    setRequestingInfo(true);
    setInfoRequestError('');
    try {
      const requestId = await requestInfoShare(
        profile,
        { uid: host.contactUid, displayName: host.name },
        {
          wantEmail: needsEmail,
          wantPhone: needsPhone,
          context: `Hospitality — ${host.name || 'host'}`,
          message: requestMessage.trim(),
        }
      );
      onChange({ infoRequestId: requestId });
      setRequestMessage('');
    } catch (err) {
      setInfoRequestError(err?.message || 'Could not send request.');
    } finally {
      setRequestingInfo(false);
    }
  };

  const tenure = tenureLabel(host.joinedDate);
  const spouse = useMemo(() => (hosts || []).find(h => h.id === host.spouseId) || null, [hosts, host.spouseId]);
  const coverage = useMemo(() => {
    const mine = (schedule || []).filter(s => s.hostId === host.id);
    const t = today();
    const upcoming = mine.filter(s => s.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    const pastCount = mine.filter(s => s.date < t).length;
    return { upcoming, pastCount };
  }, [schedule, host.id]);

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AvatarDot url={host.photoUrl} name={host.name} large />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className="ys-form-title">{host.name || 'New host'}</h2>
            {tenure && <span className="ha-tenure-badge">🎖️ {tenure}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="app-btn ghost"
            style={{ padding: '7px 14px', fontSize: 12 }}
            onClick={onDone}
          >
            ✓ Done
          </button>
          <button
            type="button"
            className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
            onClick={() => {
              if (confirmDel) { onDelete(); return; }
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3500);
            }}
          >
            {confirmDel ? 'Click again to delete' : '🗑 Delete'}
          </button>
        </div>
      </div>

      <Section title="Who">
        <Field label="Name">
          <HostNameField host={host} hosts={hosts} onChange={onChange} />
        </Field>
        {host.contactUid && (
          <button type="button" className="ha-chat-btn" onClick={handleChat} disabled={chatBusy}>
            {chatBusy ? 'Opening chat…' : `💬 Chat with ${host.name || 'this host'}`}
          </button>
        )}
        <Field label="Photo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ cursor: 'pointer', display: 'inline-flex' }} title="Click to upload a photo">
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoChosen} />
              <AvatarDot url={host.photoUrl} name={host.name} large />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ha-photo-hint">Click the photo to upload one.</span>
              {photoError && <span className="ha-photo-error">{photoError}</span>}
              {host.photoUrl && (
                <button
                  type="button"
                  className="app-btn ghost"
                  style={{ padding: '3px 9px', fontSize: 11, alignSelf: 'flex-start' }}
                  onClick={() => onChange({ photoUrl: '' })}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </Field>
      </Section>

      <Section title="Roles">
        <div className="ha-filter-row">
          {ROLES.map(r => (
            <button
              key={r.key}
              type="button"
              className={`ha-filter-chip ${(host.roles || []).includes(r.key) ? 'on' : ''}`}
              onClick={() => toggleRole(r.key)}
            >{r.icon} {r.label}</button>
          ))}
        </div>
        {(host.roles || []).length > 0 && (
          <Field label="Primary role">
            <select className="ys-inp" value={host.primaryRole || ''} onChange={set('primaryRole')}>
              {(host.roles || []).map(key => {
                const m = roleMeta(key);
                return m ? <option key={key} value={key}>{m.icon} {m.label}</option> : null;
              })}
            </select>
          </Field>
        )}
        <Field label="Preferred station / notes">
          <input type="text" className="ys-inp" value={host.stationPref || ''} onChange={set('stationPref')} placeholder="e.g. prefers Welcome Desk, avoid heavy lifting…" />
        </Field>
        {(host.roles || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(host.roles || []).map(key => {
              const m = roleMeta(key);
              if (!m) return null;
              return (
                <button key={key} type="button" className="ha-list-row" style={{ padding: '6px 4px' }} onClick={() => onNavTag(m.path)}>
                  <span className="ha-list-row-title">{m.icon} Open {m.label} station page</span>
                  <span className="ha-list-row-go">›</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Household">
        <Field label="Spouse also serves">
          <select className="ys-inp" value={host.spouseId || ''} onChange={e => onSetSpouse(e.target.value)}>
            <option value="">— Not linked —</option>
            {(hosts || []).filter(h => h.id !== host.id).map(h => (
              <option key={h.id} value={h.id}>{h.name || 'Unnamed host'}</option>
            ))}
          </select>
        </Field>
        {spouse && (
          <div className="ha-household-note">💍 Linked with <b>{spouse.name}</b> — shows on both records.</div>
        )}
      </Section>

      <Section title="Status & schedule">
        <Row>
          <Field label="Status">
            <select className="ys-inp" value={host.status || 'active'} onChange={set('status')}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
          <Field label="Service preference">
            <select className="ys-inp" value={host.servicePreference || ''} onChange={set('servicePreference')}>
              <option value="">—</option>
              {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="Availability">
          <AvailabilityField host={host} onChange={onChange} />
        </Field>
        <Field label="Joined">
          <input type="date" className="ys-inp" value={host.joinedDate || ''} onChange={set('joinedDate')} />
        </Field>
      </Section>

      <Section title="Coverage">
        {coverage.upcoming.length === 0 ? (
          <div className="ha-directory-empty" style={{ padding: '10px 4px', textAlign: 'left' }}>No upcoming Sundays scheduled.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {coverage.upcoming.map(s => {
              const r = roleMeta(s.roleKey);
              return (
                <div key={s.id} className="ha-list-row" style={{ cursor: 'default' }}>
                  <span className="ha-list-row-title">{s.date} · {s.service}</span>
                  <span className="ha-list-row-meta">{r ? `${r.icon} ${r.label}` : ''}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="ha-coverage-summary">Served {coverage.pastCount} time{coverage.pastCount === 1 ? '' : 's'} on record — see Scheduling for the full history.</div>
      </Section>

      <Section title="Contact">
        <Row>
          <Field label="Phone">
            <div className="ha-contact-row">
              <input type="tel" className="ys-inp" value={host.phone || ''} onChange={set('phone')} placeholder={needsPhone ? 'Hidden from directory' : ''} />
              {host.phone && <a className="ha-quick-contact" href={`tel:${host.phone}`} title={`Call ${host.name || 'host'}`}>📞</a>}
            </div>
          </Field>
          <Field label="Email">
            <div className="ha-contact-row">
              <input type="email" className="ys-inp" value={host.email || ''} onChange={set('email')} placeholder={needsEmail ? 'Hidden from directory' : ''} />
              {host.email && <a className="ha-quick-contact" href={`mailto:${host.email}`} title={`Email ${host.name || 'host'}`}>✉️</a>}
            </div>
          </Field>
        </Row>

        {(needsEmail || needsPhone) && !sentInfoRequest && (
          <div className="ha-info-request">
            <span className="ha-info-request-text">
              🔒 {host.name || 'This host'} keeps {needsEmail && needsPhone ? 'their email and phone' : needsEmail ? 'their email' : 'their phone number'} private.
            </span>
            <input
              type="text"
              className="ys-inp ha-info-request-msg"
              placeholder="Optional note to include with the request…"
              value={requestMessage}
              onChange={e => setRequestMessage(e.target.value)}
            />
            <button type="button" className="app-btn ghost ha-info-request-btn" disabled={requestingInfo} onClick={handleRequestInfo}>
              {requestingInfo ? 'Sending…' : 'Request info'}
            </button>
            {infoRequestError && <span className="ha-info-request-error">{infoRequestError}</span>}
          </div>
        )}
        {sentInfoRequest && sentInfoRequest.status === 'pending' && (needsEmail || needsPhone) && (
          <div className="ha-info-request pending">
            <span className="ha-info-request-text">🔒 Waiting for {host.name || 'this host'} to accept your info request…</span>
          </div>
        )}
        {sentInfoRequest && sentInfoRequest.status === 'declined' && (needsEmail || needsPhone) && (
          <div className="ha-info-request declined">
            <span className="ha-info-request-text">{host.name || 'This host'} declined to share that info.</span>
          </div>
        )}
      </Section>

      <Section title="Care & follow-up">
        <Field label="Birthday">
          <input type="date" className="ys-inp" value={host.birthday || ''} onChange={set('birthday')} />
        </Field>
        <label className="ha-sync-check">
          <input
            type="checkbox"
            checked={!!host.syncBirthdayToCalendar}
            disabled={!host.birthday}
            onChange={e => onChange({ syncBirthdayToCalendar: e.target.checked })}
          />
          📅 Sync birthday to Calendar
        </label>
        {!host.birthday && <span className="ha-photo-hint">Set a birthday above to enable.</span>}
        <CareLogField host={host} onChange={onChange} />
      </Section>

      <Section title="Notes">
        <textarea className="ys-inp ys-textarea" rows={3} value={host.notes || ''} onChange={set('notes')} placeholder="Anything the team should know…" />
      </Section>
    </form>
  );
}

/* Multiple day/time availability slots — add via the dropdowns below,
   remove with the ✕ on a chip, or double-click a chip to edit it
   inline in place. */
function AvailabilityField({ host, onChange }) {
  const slots = Array.isArray(host.availability) ? host.availability : [];
  const [newDay, setNewDay] = useState(DAY_OPTIONS[0]);
  const [newTime, setNewTime] = useState(TIME_SLOT_OPTIONS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editDay, setEditDay] = useState('');
  const [editTime, setEditTime] = useState('');

  const addSlot = () => {
    onChange({ availability: [...slots, { id: makeId('avail'), day: newDay, time: newTime }] });
  };
  const removeSlot = (id) => onChange({ availability: slots.filter(s => s.id !== id) });
  const startEdit = (s) => { setEditingId(s.id); setEditDay(s.day); setEditTime(s.time); };
  const commitEdit = () => {
    onChange({ availability: slots.map(s => s.id === editingId ? { ...s, day: editDay, time: editTime } : s) });
    setEditingId(null);
  };

  return (
    <div className="ha-avail-wrap">
      {slots.length > 0 && (
        <div className="ha-avail-chips">
          {slots.map(s => editingId === s.id ? (
            <span key={s.id} className="ha-avail-chip editing">
              <select className="ys-inp ha-avail-mini-select" value={editDay} onChange={e => setEditDay(e.target.value)}>
                {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="ys-inp ha-avail-mini-select" value={editTime} onChange={e => setEditTime(e.target.value)}>
                {TIME_SLOT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" className="ha-avail-chip-btn" onClick={commitEdit} title="Save">✓</button>
              <button type="button" className="ha-avail-chip-btn" onClick={() => setEditingId(null)} title="Cancel">✕</button>
            </span>
          ) : (
            <span key={s.id} className="ha-avail-chip" onDoubleClick={() => startEdit(s)} title="Double-click to edit">
              {s.day} · {s.time}
              <button type="button" className="ha-avail-chip-btn" onClick={() => removeSlot(s.id)} title="Remove">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="ha-avail-add-row">
        <select className="ys-inp" value={newDay} onChange={e => setNewDay(e.target.value)}>
          {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="ys-inp" value={newTime} onChange={e => setNewTime(e.target.value)}>
          {TIME_SLOT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" className="ha-avail-add-btn" onClick={addSlot}>+ Add slot</button>
      </div>
    </div>
  );
}

/* Care/follow-up log — tracks when you DID reach out (past date) and
   when you WILL (future date), each with its own note. Purpose-built
   for volunteer thank-yous and birthday reminders, but open to any
   check-in. A past date auto-marks the entry done; toggle the
   checkbox to flip either way. */
function CareLogField({ host, onChange }) {
  const log = Array.isArray(host.careLog) ? host.careLog : [];
  const [type, setType] = useState('check-in');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const addEntry = () => {
    if (!date) return;
    const entry = { id: makeId('care'), type, date, note: note.trim(), done: date < today() };
    onChange({ careLog: [entry, ...log] });
    setNote('');
  };
  const toggleDone = (id) => onChange({ careLog: log.map(c => c.id === id ? { ...c, done: !c.done } : c) });
  const removeEntry = (id) => onChange({ careLog: log.filter(c => c.id !== id) });

  const sorted = useMemo(() => [...log].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [log]);

  return (
    <div className="ha-care-editor">
      {sorted.length > 0 && (
        <div className="ha-care-log-list">
          {sorted.map(c => (
            <div key={c.id} className={`ha-care-log-row${c.done ? ' done' : ''}`}>
              <button type="button" className="ha-care-check" onClick={() => toggleDone(c.id)} title={c.done ? 'Mark as not done' : 'Mark as done'}>
                {c.done ? '✅' : '⬜'}
              </button>
              <span className="ha-care-icon" aria-hidden="true">{careTypeMeta(c.type).icon}</span>
              <div className="ha-care-log-body">
                <span className="ha-care-log-date">{c.date}</span>
                <span className="ha-care-log-note">{c.note || careTypeMeta(c.type).label}</span>
              </div>
              <button type="button" className="ha-care-remove" onClick={() => removeEntry(c.id)} title="Remove">🗑</button>
            </div>
          ))}
        </div>
      )}
      <div className="ha-care-add">
        <Row>
          <Field label="Type">
            <select className="ys-inp" value={type} onChange={e => setType(e.target.value)}>
              {CARE_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </Field>
          <Field label="Date (past = did, future = will)">
            <input type="date" className="ys-inp" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </Row>
        <input
          type="text"
          className="ys-inp"
          placeholder="Note — e.g. thanked for covering Easter, sent a card…"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <button type="button" className="ha-care-add-btn" onClick={addEntry}>+ Log entry</button>
      </div>
    </div>
  );
}

/* Name field with a "From your Contacts" typeahead — mirrors the
   pattern in womens/AllWomen.jsx. Picking a suggestion links the
   host record to that connection's uid (host.contactUid), which is
   what unlocks the "Chat" button above. Typing any name that doesn't
   match — the vast majority of hospitality volunteers won't have an
   app account — is always allowed; it just leaves contactUid unset. */
function HostNameField({ host, hosts, onChange }) {
  const { connections } = useMyConnections();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  /* A connection already linked to a DIFFERENT host record shouldn't
     be offered again — picking it here would just create a duplicate
     entry for the same person. */
  const usedUids = useMemo(
    () => new Set((hosts || []).filter(h => h.id !== host.id && h.contactUid).map(h => h.contactUid)),
    [hosts, host.id]
  );

  const nameMatches = useMemo(() => {
    const q = (host.name || '').trim().toLowerCase();
    if (!q || !connections?.length) return [];
    return connections
      .filter(c => (c.name || '').toLowerCase().includes(q) && !usedUids.has(c.uid))
      .slice(0, 6);
  }, [host.name, connections, usedUids]);

  const pickContact = async (contact) => {
    setSuggestOpen(false);
    setFilling(true);
    try {
      const profile = await getProfileByUid(contact.uid);
      const patch = {
        name: profile?.displayName || contact.name || host.name,
        contactUid: contact.uid,
        contactEmailHidden: profile?.emailVisible === false,
        contactPhoneHidden: profile?.phoneVisible === false,
        infoRequestId: '',
      };
      const pic = profile?.avatar || profile?.photoUrl || profile?.logo;
      if (pic) patch.photoUrl = pic;
      if (profile?.phoneVisible !== false && profile?.phone) patch.phone = profile.phone;
      if (profile?.emailVisible !== false && profile?.email) patch.email = profile.email;
      onChange(patch);
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="ha-name-suggest-wrap">
      <input
        type="text"
        className="ys-inp"
        value={host.name || ''}
        onChange={e => { onChange({ name: e.target.value, contactUid: '' }); setSuggestOpen(true); }}
        onFocus={() => setSuggestOpen(true)}
        onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
        placeholder="Host's name — type freely, or pick from Contacts"
        autoComplete="off"
      />
      {host.contactUid && <span className="ha-linked-pill">🔗 Linked to Contacts</span>}
      {suggestOpen && nameMatches.length > 0 && (
        <div className="ha-name-suggest">
          <div className="ha-name-suggest-hd">From your Contacts</div>
          {nameMatches.map(c => (
            <button
              type="button"
              key={c.uid}
              className="ha-name-suggest-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickContact(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {filling && <div className="ha-name-suggest-status">Linking contact…</div>}
    </div>
  );
}

function AvatarDot({ url, name, large }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const style = large ? { width: 48, height: 48, fontSize: 17 } : undefined;
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className="ha-avatar-dot" style={style} />;
  }
  return <span className="ha-avatar-dot ha-avatar-fallback" style={style} aria-hidden="true">{initials}</span>;
}

function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) { return <div className="ys-row-fields">{children}</div>; }
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
