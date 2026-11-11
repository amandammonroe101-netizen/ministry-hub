import { useEffect, useMemo, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { conferenceService } from '../../services/conferenceService';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-card-grid/.wa-stats-bar/.wa-controls…) from AllWomen.css and the
   .ys-* form primitives from the Youth roster — same pattern
   Retreats already follows. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Conferences.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Conferences

   Level 1: card catalog — hosting/attending badge, dates, location,
   headline speaker, registration count vs. cap.

   Level 2: clicking a card drills into a dedicated in-page view
   (same pattern as Retreats' RetreatView) with five tabs:
     Overview             — theme, dates, location, host org/website,
                             cost, cap, description
     Speakers & Sessions  — speaker roster (bio + topic) and a flat,
                             date-sorted session schedule
     Attendees & Travel   — group travel logistics + attendee roster.
                             Each attendee can be linked to a record
                             in the shared Women's directory (so her
                             name/contact info stays in sync) or added
                             as a manual guest with no directory link
     Scholarships & Budget — scholarship fund + recipient list, plus
                             income/expense line items with running
                             totals
     Follow-Up & Reflections — post-conference debrief, per-person
                             takeaways, and action items

   Storage: one Firestore doc per conference at
   /users/{uid}/womens-conferences/{id} (conferenceService.js) —
   everything above is embedded on that doc since none of it is
   queried across conferences. Attendees optionally reference a woman
   by `womanId` into the shared 'womens:women' directory, but store
   their own name/email/phone copy so a record stays legible even if
   the directory entry is later edited or removed.
   ───────────────────────────────────────────────────────────── */

const TYPE_META = {
  attending: { label: 'Attending', icon: '✈️' },
  hosting:   { label: 'Hosting',   icon: '🎪' },
};
const TYPE_ORDER = ['attending', 'hosting'];

const STATUS_META = {
  upcoming: { label: 'Upcoming',           icon: '🕓' },
  open:     { label: 'Registration Open',  icon: '🟢' },
  attended: { label: 'Attended',           icon: '✅' },
  past:     { label: 'Past',               icon: '📦' },
};
const STATUS_ORDER = ['upcoming', 'open', 'attended', 'past'];
const STATUS_FILTERS = [{ id: 'all', label: 'All' }, ...STATUS_ORDER.map(id => ({ id, label: STATUS_META[id].label }))];

const REG_META = {
  invited:    { label: 'Invited',    icon: '📩' },
  registered: { label: 'Registered', icon: '📝' },
  confirmed:  { label: 'Confirmed',  icon: '✅' },
  declined:   { label: 'Declined',   icon: '❌' },
};
const REG_ORDER = ['invited', 'registered', 'confirmed', 'declined'];

const PAYMENT_META = {
  unpaid:  { label: 'Unpaid',  icon: '⭕' },
  partial: { label: 'Partial', icon: '🟡' },
  paid:    { label: 'Paid',    icon: '✅' },
};
const PAYMENT_ORDER = ['unpaid', 'partial', 'paid'];

const TABS = [
  { key: 'overview',  label: 'Overview',              icon: 'ℹ️' },
  { key: 'speakers',  label: 'Speakers & Sessions',    icon: '🎤' },
  { key: 'attendees', label: 'Attendees & Travel',     icon: '🚐' },
  { key: 'budget',    label: 'Scholarships & Budget',  icon: '💵' },
  { key: 'followup',  label: 'Follow-Up & Reflections', icon: '📝' },
];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const dateRange = (start, end) => {
  if (!start && !end) return '';
  if (start && end && start !== end) return `${start} → ${end}`;
  return start || end;
};

export default function Conferences() {
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [women] = useUserStoreKey('womens:women', []);
  const directory = Array.isArray(women) ? women : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    conferenceService.getAll()
      .then(res => { if (alive) setConferences(Array.isArray(res?.data?.data) ? res.data.data : []); })
      .catch(err => { if (alive) setLoadErr(err?.message || 'Could not load conferences.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const list = conferences;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.theme || '').toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q) ||
          (c.organizer || '').toLowerCase().includes(q) ||
          (c.speakers || []).some(s => (s.name || '').toLowerCase().includes(q)))
      : list;
    if (statusFilter !== 'all') out = out.filter(c => (c.status || 'upcoming') === statusFilter);
    return [...out].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  }, [list, query, statusFilter]);

  const openConference = useMemo(() => list.find(c => c.id === openId) || null, [list, openId]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const stats = useMemo(() => ({
    total:      list.length,
    upcoming:   list.filter(c => (c.status || 'upcoming') !== 'past' && (c.status || 'upcoming') !== 'attended' && (!c.startDate || c.startDate >= today)).length,
    attendees:  list.reduce((sum, c) => sum + (c.attendees?.length || 0), 0),
    scholarships: list.reduce((sum, c) => sum + (c.attendees || []).filter(a => a.scholarship).length, 0),
  }), [list, today]);

  const addConference = async () => {
    const res = await conferenceService.create({});
    const c = res?.data?.data;
    if (!c) return;
    setConferences(prev => [...prev, c]);
    setOpenId(c.id);
  };

  const updateConference = (id, patch) => {
    setConferences(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    conferenceService.update(id, patch).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[Conferences] Failed to save:', err);
    });
  };

  const removeConference = (id) => {
    setConferences(prev => prev.filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
    conferenceService.delete(id).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[Conferences] Failed to delete:', err);
    });
  };

  return (
    <WomensShell
      title="Conferences"
      icon="🎤"
      subtitle="Conferences hosted or attended — speakers, sessions, group travel, scholarships, and follow-up reflections."
      actions={
        !openConference && !loading && (
          <button type="button" className="wms-btn primary" onClick={addConference}>
            ✦ New conference
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wc-root">
      {loading ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🎤</div>
              <div className="app-empty-title">Loading conferences…</div>
            </div>
          ) : loadErr ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">⚠️</div>
              <div className="app-empty-title">Couldn't load conferences</div>
              <div className="app-empty-sub">{loadErr}</div>
            </div>
          ) : openConference ? (
            <ConferenceView
              conference={openConference}
              directory={directory}
              onChange={(patch) => updateConference(openConference.id, patch)}
              onDelete={() => removeConference(openConference.id)}
              onBack={() => setOpenId(null)}
            />
          ) : list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🎤</div>
              <div className="app-empty-title">No conferences yet</div>
              <div className="app-empty-sub">
                Add a conference you're hosting or sending women to — theme,
                dates, and location — then build out speakers, attendees,
                travel, scholarships, budget, and follow-up from its
                dashboard.
              </div>
              <button type="button" className="app-btn primary" onClick={addConference}>
                ✦ Add your first conference
              </button>
            </div>
          ) : (
            <div className="wa-directory">
              <section className="wc-panel">
                <h3 className="wc-panel-subtitle">At a glance</h3>
                <div className="wa-stats-bar">
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.total}</span>
                    <span className="wa-stat-lbl">Conferences</span>
                  </div>
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.upcoming}</span>
                    <span className="wa-stat-lbl">Upcoming</span>
                  </div>
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.attendees}</span>
                    <span className="wa-stat-lbl">Total attendees</span>
                  </div>
                  {stats.scholarships > 0 && (
                    <div className="wa-stat">
                      <span className="wa-stat-n">{stats.scholarships}</span>
                      <span className="wa-stat-lbl">On scholarship</span>
                    </div>
                  )}
                </div>
              </section>

              <section className="wc-panel">
                <div className="wc-panel-row">
                  <h3 className="wc-panel-subtitle">All conferences ({visible.length}{visible.length !== list.length ? ` of ${list.length}` : ''})</h3>
                </div>

                <div className="wa-controls">
                  <div className="wa-search-wrap">
                    <span>🔍</span>
                    <input
                      type="text"
                      placeholder="Search by name, theme, location, speaker…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />
                    {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
                  </div>
                </div>

                <div className="wa-filter-row">
                  {STATUS_FILTERS.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`wa-filter-chip ${statusFilter === f.id ? 'on' : ''}`}
                      onClick={() => setStatusFilter(f.id)}
                    >{f.label}</button>
                  ))}
                </div>

                {visible.length === 0 ? (
                  <div className="wa-directory-empty">
                    {query ? `No conferences match "${query}".` : 'No conferences match this filter.'}
                  </div>
                ) : (
                  <div className="wa-card-grid">
                    {visible.map(c => (
                      <ConferenceCard key={c.id} conference={c} onClick={() => setOpenId(c.id)} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}

/* ── Directory card ─────────────────────────────────────────── */
function ConferenceCard({ conference, onClick }) {
  const status = conference.status || 'upcoming';
  const meta = STATUS_META[status] || STATUS_META.upcoming;
  const type = TYPE_META[conference.type || 'attending'] || TYPE_META.attending;
  const attendeeCount = conference.attendees?.length || 0;
  const overCap = conference.cap && attendeeCount > Number(conference.cap);
  const headline = (conference.speakers || [])[0]?.name;
  const net = (conference.budgetItems || []).reduce((sum, b) =>
    sum + (b.kind === 'income' ? Number(b.amount) || 0 : -(Number(b.amount) || 0)), 0);

  return (
    <button type="button" className="wc-card" onClick={onClick}>
      <div className="wc-card-top">
        <span className="wc-card-title">{conference.name || '(untitled conference)'}</span>
        <span className={`wc-badge status-${status}`}>{meta.icon} {meta.label}</span>
      </div>
      <div className="wc-card-type">{type.icon} {type.label}</div>
      {conference.theme && <div className="wc-card-theme">"{conference.theme}"</div>}
      {dateRange(conference.startDate, conference.endDate) && (
        <div className="wc-card-line">📅 {dateRange(conference.startDate, conference.endDate)}</div>
      )}
      {conference.location && <div className="wc-card-line">📍 {conference.location}</div>}
      {headline && <div className="wc-card-line">🎤 {headline}{(conference.speakers?.length || 0) > 1 ? ` +${conference.speakers.length - 1}` : ''}</div>}
      <div className="wc-card-foot">
        <span className={overCap ? 'wc-card-chip is-over' : 'wc-card-chip'}>
          {attendeeCount} attending{conference.cap ? ` / ${conference.cap}` : ''}
        </span>
        {(conference.budgetItems?.length || 0) > 0 && (
          <span className={`wc-card-chip ${net < 0 ? 'is-over' : 'is-good'}`}>{money(net)} net</span>
        )}
      </div>
    </button>
  );
}

/* ── Level 2: dedicated conference drill-in ─────────────────── */
function ConferenceView({ conference, directory, onChange, onDelete, onBack }) {
  const [tab, setTab] = useState('overview');
  const [confirmDel, setConfirmDel] = useState(false);
  const speakers = Array.isArray(conference.speakers) ? conference.speakers : [];
  const sessions = Array.isArray(conference.sessions) ? conference.sessions : [];
  const attendees = Array.isArray(conference.attendees) ? conference.attendees : [];
  const budgetItems = Array.isArray(conference.budgetItems) ? conference.budgetItems : [];
  const takeaways = Array.isArray(conference.takeaways) ? conference.takeaways : [];
  const actionItems = Array.isArray(conference.actionItems) ? conference.actionItems : [];

  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = conference.startDate
    ? Math.round((new Date(conference.startDate) - new Date(today)) / 86400000)
    : null;
  const dayTier = daysUntil == null ? 'none' : daysUntil < 0 ? 'bad' : daysUntil <= 14 ? 'warn' : 'good';
  const confirmedCount = attendees.filter(a => a.regStatus === 'confirmed').length;
  const collected = attendees.reduce((sum, a) => sum + (Number(a.amountPaid) || 0), 0);
  const projected = (Number(conference.costPerPerson) || 0) * attendees.length;
  const budgetIncome = budgetItems.filter(b => b.kind === 'income').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const budgetExpense = budgetItems.filter(b => b.kind === 'expense').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const budgetNet = budgetIncome - budgetExpense;

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <div className="wc-view">
      <button type="button" className="wc-view-back" onClick={onBack}>← All Conferences</button>

      <div className="wc-view-head">
        <span className="wc-view-icon">🎤</span>
        <input
          type="text"
          className="ys-inp wc-title-inp wc-view-title-inp"
          value={conference.name || ''}
          onChange={set('name')}
          placeholder="Conference name"
        />
        <select className="ys-inp wc-view-type-sel" value={conference.type || 'attending'} onChange={set('type')}>
          {TYPE_ORDER.map(id => <option key={id} value={id}>{TYPE_META[id].icon} {TYPE_META[id].label}</option>)}
        </select>
        <select className="ys-inp wc-view-status-sel" value={conference.status || 'upcoming'} onChange={set('status')}>
          {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
        </select>
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

      <div className="wc-view-meta">
        {dateRange(conference.startDate, conference.endDate) && <span className="wc-chip">📅 {dateRange(conference.startDate, conference.endDate)}</span>}
        {conference.location && <span className="wc-chip">📍 {conference.location}</span>}
        {conference.organizer && <span className="wc-chip">🏛 {conference.organizer}</span>}
        <span className="wc-chip">{attendees.length} attending{conference.cap ? ` / ${conference.cap}` : ''}</span>
      </div>

      <div className="wc-dash-row">
        <div className="wc-dash-stat">
          <span className="wc-dash-n">{attendees.length}{conference.cap ? ` / ${conference.cap}` : ''}</span>
          <span className="wc-dash-lbl">Attending</span>
        </div>
        <div className="wc-dash-stat">
          <span className="wc-dash-n">{confirmedCount}</span>
          <span className="wc-dash-lbl">Confirmed</span>
        </div>
        <div className="wc-dash-stat">
          <span className="wc-dash-n">{money(collected)}</span>
          <span className="wc-dash-lbl">Collected{projected ? ` / ${money(projected)}` : ''}</span>
        </div>
        <div className={`wc-dash-stat is-days tier-${dayTier}`}>
          <span className="wc-dash-n">{daysUntil == null ? '—' : Math.abs(daysUntil)}</span>
          <span className="wc-dash-lbl">{daysUntil == null ? 'No date set' : daysUntil < 0 ? 'Days ago' : 'Days until'}</span>
        </div>
        <div className={`wc-dash-stat ${budgetNet < 0 ? 'is-over' : 'is-good'}`}>
          <span className="wc-dash-n">{money(budgetNet)}</span>
          <span className="wc-dash-lbl">Budget net</span>
        </div>
      </div>

      <nav className="wc-tabs" role="tablist" aria-label="Conference views">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`wc-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'speakers' && (speakers.length + sessions.length) > 0 && <span className="wc-tab-badge">{speakers.length + sessions.length}</span>}
            {t.key === 'attendees' && attendees.length > 0 && <span className="wc-tab-badge">{attendees.length}</span>}
            {t.key === 'budget' && budgetItems.length > 0 && <span className="wc-tab-badge">{budgetItems.length}</span>}
            {t.key === 'followup' && (takeaways.length + actionItems.length) > 0 && <span className="wc-tab-badge">{takeaways.length + actionItems.length}</span>}
          </button>
        ))}
      </nav>

      <div className="wc-view-body">
        {tab === 'overview' && <OverviewTab conference={conference} set={set} />}
        {tab === 'speakers' && <SpeakersTab speakers={speakers} sessions={sessions} onChange={onChange} />}
        {tab === 'attendees' && (
          <AttendeesTab
            conference={conference}
            attendees={attendees}
            directory={directory}
            onChange={onChange}
          />
        )}
        {tab === 'budget' && <BudgetTab conference={conference} attendees={attendees} budgetItems={budgetItems} onChange={onChange} />}
        {tab === 'followup' && <FollowUpTab conference={conference} attendees={attendees} takeaways={takeaways} actionItems={actionItems} onChange={onChange} />}
      </div>
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────── */
function OverviewTab({ conference, set }) {
  return (
    <>
      <Section title="Theme & dates">
        <Field label="Theme">
          <input type="text" className="ys-inp" value={conference.theme || ''} onChange={set('theme')} placeholder="e.g. Called — a leadership conference for women" />
        </Field>
        <Row>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={conference.startDate || ''} onChange={set('startDate')} />
          </Field>
          <Field label="End date">
            <input type="date" className="ys-inp" value={conference.endDate || ''} onChange={set('endDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input type="text" className="ys-inp" value={conference.location || ''} onChange={set('location')} placeholder="e.g. Downtown Convention Center" />
          </Field>
          <Field label="Hosting organization">
            <input type="text" className="ys-inp" value={conference.organizer || ''} onChange={set('organizer')} placeholder="Who is putting this on" />
          </Field>
        </Row>
        <Field label="Website / registration link">
          <input type="text" className="ys-inp" value={conference.website || ''} onChange={set('website')} placeholder="https://…" />
        </Field>
      </Section>

      <Section title="Description">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="What this conference is about, who it's for…"
          value={conference.description || ''}
          onChange={set('description')}
        />
      </Section>

      <Section title="Registration & cost">
        <Row>
          <Field label="Group cap">
            <input type="number" min="0" className="ys-inp" value={conference.cap || ''} onChange={set('cap')} placeholder="No limit" />
          </Field>
          <Field label="Cost per person">
            <input type="number" min="0" step="0.01" className="ys-inp" value={conference.costPerPerson || ''} onChange={set('costPerPerson')} placeholder="0.00" />
          </Field>
        </Row>
      </Section>
    </>
  );
}

/* ── Speakers & Sessions ─────────────────────────────────────── */
function SpeakersTab({ speakers, sessions, onChange }) {
  const addSpeaker = () => onChange({ speakers: [...speakers, { id: makeId('spk'), name: '', topic: '', bio: '' }] });
  const updateSpeaker = (id, patch) => onChange({ speakers: speakers.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeSpeaker = (id) => onChange({ speakers: speakers.filter(s => s.id !== id) });

  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || '')),
  [sessions]);
  const addSession = () => onChange({ sessions: [...sessions, { id: makeId('sess'), date: '', time: '', title: '', speakerName: '', location: '', notes: '' }] });
  const updateSession = (id, patch) => onChange({ sessions: sessions.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeSession = (id) => onChange({ sessions: sessions.filter(s => s.id !== id) });

  return (
    <>
      <Section title="Speakers">
        <button type="button" className="app-btn ghost wc-add-btn" onClick={addSpeaker}>+ Add speaker</button>

        {speakers.length === 0 ? (
          <Empty text="No speakers yet — add each speaker along with their topic and a short bio." />
        ) : (
          <div className="wc-speaker-list">
            {speakers.map(s => (
              <div key={s.id} className="wc-speaker-card">
                <Row>
                  <Field label="Name">
                    <input type="text" className="ys-inp" value={s.name || ''} onChange={e => updateSpeaker(s.id, { name: e.target.value })} placeholder="Speaker name" />
                  </Field>
                  <Field label="Topic">
                    <input type="text" className="ys-inp" value={s.topic || ''} onChange={e => updateSpeaker(s.id, { topic: e.target.value })} placeholder="What she's speaking on" />
                  </Field>
                </Row>
                <Field label="Bio">
                  <textarea className="ys-inp ys-textarea" rows={2} value={s.bio || ''} onChange={e => updateSpeaker(s.id, { bio: e.target.value })} placeholder="Bio / ministry background…" />
                </Field>
                <div className="wc-row-del-row">
                  <button type="button" className="wc-row-del" onClick={() => removeSpeaker(s.id)} title="Remove speaker">✕ Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Session schedule">
        <button type="button" className="app-btn ghost wc-add-btn" onClick={addSession}>+ Add session</button>

        {sortedSessions.length === 0 ? (
          <Empty text="No sessions yet — add each breakout or main session with its date, time, and speaker." />
        ) : (
          <div className="wc-session-list">
            {sortedSessions.map(session => (
              <div key={session.id} className="wc-session-row">
                <input type="date" className="ys-inp wc-session-date" value={session.date || ''} onChange={e => updateSession(session.id, { date: e.target.value })} />
                <input type="text" className="ys-inp wc-session-time" value={session.time || ''} onChange={e => updateSession(session.id, { time: e.target.value })} placeholder="7:00 PM" />
                <input type="text" className="ys-inp wc-session-title" value={session.title || ''} onChange={e => updateSession(session.id, { title: e.target.value })} placeholder="Session title" />
                <input type="text" className="ys-inp wc-session-speaker" value={session.speakerName || ''} onChange={e => updateSession(session.id, { speakerName: e.target.value })} placeholder="Speaker" />
                <input type="text" className="ys-inp wc-session-location" value={session.location || ''} onChange={e => updateSession(session.id, { location: e.target.value })} placeholder="Room / location" />
                <button type="button" className="wc-row-del" onClick={() => removeSession(session.id)} title="Remove session">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/* ── Attendees & Travel ─────────────────────────────────────── */
function AttendeesTab({ conference, attendees, directory, onChange }) {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const groupTravel = conference.groupTravel || {};
  const setGroupTravel = (field) => (e) => onChange({ groupTravel: { ...groupTravel, [field]: e.target.value } });

  const linkedIds = new Set(attendees.map(a => a.womanId).filter(Boolean));
  const pickable = directory.filter(w => !linkedIds.has(w.id));

  const addFromDirectory = (woman) => {
    const a = {
      id: makeId('att'), womanId: woman.id, name: woman.name || '', email: woman.email || '', phone: woman.phone || '',
      regStatus: 'invited', paymentStatus: 'unpaid', amountPaid: '', scholarship: false, scholarshipAmount: '',
      travelMethod: '', travelNotes: '', notes: '',
    };
    onChange({ attendees: [...attendees, a] });
    setExpandedId(a.id);
    setPickerOpen(false);
  };
  const addGuest = () => {
    const a = {
      id: makeId('att'), womanId: '', name: '', email: '', phone: '',
      regStatus: 'invited', paymentStatus: 'unpaid', amountPaid: '', scholarship: false, scholarshipAmount: '',
      travelMethod: '', travelNotes: '', notes: '',
    };
    onChange({ attendees: [...attendees, a] });
    setExpandedId(a.id);
  };
  const updateAttendee = (id, patch) => onChange({ attendees: attendees.map(a => a.id === id ? { ...a, ...patch } : a) });
  const removeAttendee = (id) => {
    onChange({ attendees: attendees.filter(a => a.id !== id) });
    if (expandedId === id) setExpandedId(null);
  };

  const overCap = conference.cap && attendees.length > Number(conference.cap);

  return (
    <>
      <Section title="Group travel">
        <Row>
          <Field label="Method">
            <input type="text" className="ys-inp" value={groupTravel.method || ''} onChange={setGroupTravel('method')} placeholder="e.g. Church van, carpool, flying" />
          </Field>
          <Field label="Departure location">
            <input type="text" className="ys-inp" value={groupTravel.departureLocation || ''} onChange={setGroupTravel('departureLocation')} placeholder="e.g. Church parking lot" />
          </Field>
        </Row>
        <Row>
          <Field label="Departure time">
            <input type="text" className="ys-inp" value={groupTravel.departureTime || ''} onChange={setGroupTravel('departureTime')} placeholder="e.g. Fri 6:00 AM" />
          </Field>
          <Field label="Return time">
            <input type="text" className="ys-inp" value={groupTravel.returnTime || ''} onChange={setGroupTravel('returnTime')} placeholder="e.g. Sun 8:00 PM" />
          </Field>
        </Row>
        <Field label="Notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={groupTravel.notes || ''} onChange={setGroupTravel('notes')} placeholder="Lodging, meeting points, anything the group needs to know…" />
        </Field>
      </Section>

      <Section title="Attendees">
        <div className="wc-reg-stats">
          <span className="wc-chip">{attendees.length} attending{conference.cap ? ` / ${conference.cap}` : ''}{overCap ? ' ⚠️' : ''}</span>
          <span className="wc-chip">{attendees.filter(a => a.regStatus === 'confirmed').length} confirmed</span>
          <span className="wc-chip">{attendees.filter(a => a.scholarship).length} on scholarship</span>
        </div>

        <div className="wc-add-row">
          <div className="wc-picker">
            <button type="button" className="app-btn ghost wc-add-btn" onClick={() => setPickerOpen(o => !o)}>
              + Add from directory
            </button>
            {pickerOpen && (
              <div className="wc-picker-menu">
                {pickable.length === 0 ? (
                  <div className="wc-picker-empty">Everyone in the directory is already added.</div>
                ) : pickable.map(w => (
                  <button key={w.id} type="button" className="wc-picker-item" onClick={() => addFromDirectory(w)}>
                    {w.name || '(no name)'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="app-btn ghost wc-add-btn" onClick={addGuest}>+ Add guest</button>
        </div>

        {attendees.length === 0 ? (
          <Empty text="No one added yet — link women from the shared directory, or add a guest who isn't in it." />
        ) : (
          <div className="wc-att-list">
            {attendees.map(a => {
              const open = expandedId === a.id;
              const rm = REG_META[a.regStatus || 'invited'] || REG_META.invited;
              const pm = PAYMENT_META[a.paymentStatus || 'unpaid'] || PAYMENT_META.unpaid;
              const armed = confirmDelId === a.id;
              return (
                <div key={a.id} className={`wc-att${open ? ' open' : ''}`}>
                  <button type="button" className="wc-att-head" onClick={() => setExpandedId(open ? null : a.id)}>
                    <span className="wc-att-name">{a.name || '(no name)'}</span>
                    {a.womanId && <span className="wc-att-flag" title="Linked to directory">🔗</span>}
                    <span className={`wc-badge status-${a.regStatus || 'invited'}`}>{rm.icon} {rm.label}</span>
                    <span className={`wc-badge status-${a.paymentStatus || 'unpaid'}`}>{pm.icon} {pm.label}</span>
                    {a.scholarship && <span className="wc-att-flag" title="Scholarship">🎓</span>}
                    <span className="wc-chevron">▶</span>
                  </button>
                  {open && (
                    <div className="wc-att-body">
                      <Row>
                        <Field label="Name">
                          <input type="text" className="ys-inp" value={a.name || ''} onChange={e => updateAttendee(a.id, { name: e.target.value })} />
                        </Field>
                        <Field label="Registration status">
                          <select className="ys-inp" value={a.regStatus || 'invited'} onChange={e => updateAttendee(a.id, { regStatus: e.target.value })}>
                            {REG_ORDER.map(id => <option key={id} value={id}>{REG_META[id].icon} {REG_META[id].label}</option>)}
                          </select>
                        </Field>
                      </Row>
                      <Row>
                        <Field label="Email">
                          <input type="email" className="ys-inp" value={a.email || ''} onChange={e => updateAttendee(a.id, { email: e.target.value })} />
                        </Field>
                        <Field label="Phone">
                          <input type="text" className="ys-inp" value={a.phone || ''} onChange={e => updateAttendee(a.id, { phone: e.target.value })} />
                        </Field>
                      </Row>
                      <Row>
                        <Field label="Payment status">
                          <select className="ys-inp" value={a.paymentStatus || 'unpaid'} onChange={e => updateAttendee(a.id, { paymentStatus: e.target.value })}>
                            {PAYMENT_ORDER.map(id => <option key={id} value={id}>{PAYMENT_META[id].icon} {PAYMENT_META[id].label}</option>)}
                          </select>
                        </Field>
                        <Field label="Amount paid">
                          <input type="number" min="0" step="0.01" className="ys-inp" value={a.amountPaid || ''} onChange={e => updateAttendee(a.id, { amountPaid: e.target.value })} placeholder="0.00" />
                        </Field>
                      </Row>
                      <Row>
                        <Field label="Travel method">
                          <input type="text" className="ys-inp" value={a.travelMethod || ''} onChange={e => updateAttendee(a.id, { travelMethod: e.target.value })} placeholder="e.g. Riding with the group" />
                        </Field>
                        <Field label="Scholarship">
                          <label className="wc-checkbox-row">
                            <input type="checkbox" checked={!!a.scholarship} onChange={e => updateAttendee(a.id, { scholarship: e.target.checked })} />
                            <span>Receiving scholarship</span>
                          </label>
                        </Field>
                      </Row>
                      {a.scholarship && (
                        <Field label="Scholarship amount">
                          <input type="number" min="0" step="0.01" className="ys-inp" value={a.scholarshipAmount || ''} onChange={e => updateAttendee(a.id, { scholarshipAmount: e.target.value })} placeholder="0.00" />
                        </Field>
                      )}
                      <Field label="Travel notes">
                        <input type="text" className="ys-inp" value={a.travelNotes || ''} onChange={e => updateAttendee(a.id, { travelNotes: e.target.value })} placeholder="Rooming, ride share, arrival plans…" />
                      </Field>
                      <Field label="Notes">
                        <textarea className="ys-inp ys-textarea" rows={2} value={a.notes || ''} onChange={e => updateAttendee(a.id, { notes: e.target.value })} />
                      </Field>

                      <div className="wc-row-del-row">
                        {a.womanId && (
                          <button type="button" className="app-btn ghost wc-add-btn" onClick={() => updateAttendee(a.id, { womanId: '' })}>
                            🔗 Unlink from directory
                          </button>
                        )}
                        <button
                          type="button"
                          className={`ys-del-btn${armed ? ' armed' : ''}`}
                          onClick={() => {
                            if (armed) { removeAttendee(a.id); return; }
                            setConfirmDelId(a.id);
                            setTimeout(() => setConfirmDelId(prev => prev === a.id ? null : prev), 3500);
                          }}
                        >
                          {armed ? 'Click again to remove' : '🗑 Remove attendee'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

/* ── Scholarships & Budget ──────────────────────────────────── */
function BudgetTab({ conference, attendees, budgetItems, onChange }) {
  const setField = (field) => (e) => onChange({ [field]: e.target.value });
  const scholarshipRecipients = attendees.filter(a => a.scholarship);
  const totalAwarded = scholarshipRecipients.reduce((s, a) => s + (Number(a.scholarshipAmount) || 0), 0);
  const updateAttendeeAmount = (id, val) => onChange({ attendees: attendees.map(a => a.id === id ? { ...a, scholarshipAmount: val } : a) });

  const addItem = () => onChange({ budgetItems: [...budgetItems, { id: makeId('bud'), kind: 'expense', category: '', label: '', amount: '', notes: '' }] });
  const updateItem = (id, patch) => onChange({ budgetItems: budgetItems.map(b => b.id === id ? { ...b, ...patch } : b) });
  const removeItem = (id) => onChange({ budgetItems: budgetItems.filter(b => b.id !== id) });

  const income = budgetItems.filter(b => b.kind === 'income').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const expense = budgetItems.filter(b => b.kind === 'expense').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const net = income - expense;
  const projectedIncome = (Number(conference.costPerPerson) || 0) * attendees.length;

  return (
    <>
      <Section title="Scholarship fund">
        <Row>
          <Field label="Fund total">
            <input type="number" min="0" step="0.01" className="ys-inp" value={conference.scholarshipFund || ''} onChange={setField('scholarshipFund')} placeholder="0.00" />
          </Field>
          <Field label="Awarded so far">
            <input type="text" className="ys-inp" value={money(totalAwarded)} readOnly disabled />
          </Field>
        </Row>
        <Field label="Notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={conference.scholarshipNotes || ''} onChange={setField('scholarshipNotes')} placeholder="How scholarships work, who to contact, fund source…" />
        </Field>

        {scholarshipRecipients.length === 0 ? (
          <Empty text="No one is on scholarship yet — flag it from an attendee's card in Attendees & Travel." />
        ) : (
          <div className="wc-scholarship-list">
            {scholarshipRecipients.map(a => (
              <div key={a.id} className="wc-scholarship-row">
                <span className="wc-att-name">🎓 {a.name || '(no name)'}</span>
                <input
                  type="number" min="0" step="0.01" className="ys-inp wc-scholarship-amount"
                  value={a.scholarshipAmount || ''} onChange={e => updateAttendeeAmount(a.id, e.target.value)} placeholder="0.00"
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Budget">
        <div className="wc-reg-stats">
          <span className="wc-chip is-good">{money(income)} income</span>
          <span className="wc-chip is-over">{money(expense)} expenses</span>
          <span className={`wc-chip ${net < 0 ? 'is-over' : 'is-good'}`}>{money(net)} net</span>
          {projectedIncome > 0 && <span className="wc-chip">{money(projectedIncome)} projected ({attendees.length} × cost)</span>}
        </div>

        <button type="button" className="app-btn ghost wc-add-btn" onClick={addItem}>+ Add line item</button>

        {budgetItems.length === 0 ? (
          <Empty text="No line items yet — add registration income and expenses like travel, lodging, and registration fees." />
        ) : (
          <div className="wc-budget-list">
            {budgetItems.map(b => (
              <div key={b.id} className="wc-budget-row">
                <select className="ys-inp wc-budget-kind" value={b.kind || 'expense'} onChange={e => updateItem(b.id, { kind: e.target.value })}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <input type="text" className="ys-inp" value={b.category || ''} onChange={e => updateItem(b.id, { category: e.target.value })} placeholder="Category (e.g. Registration)" />
                <input type="text" className="ys-inp" value={b.label || ''} onChange={e => updateItem(b.id, { label: e.target.value })} placeholder="Description" />
                <input type="number" min="0" step="0.01" className="ys-inp wc-budget-amount" value={b.amount || ''} onChange={e => updateItem(b.id, { amount: e.target.value })} placeholder="0.00" />
                <button type="button" className="wc-row-del" onClick={() => removeItem(b.id)} title="Remove line item">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/* ── Follow-Up & Reflections ────────────────────────────────── */
function FollowUpTab({ conference, attendees, takeaways, actionItems, onChange }) {
  const setField = (field) => (e) => onChange({ [field]: e.target.value });

  const addTakeaway = () => onChange({ takeaways: [...takeaways, { id: makeId('take'), attendeeName: '', text: '' }] });
  const updateTakeaway = (id, patch) => onChange({ takeaways: takeaways.map(t => t.id === id ? { ...t, ...patch } : t) });
  const removeTakeaway = (id) => onChange({ takeaways: takeaways.filter(t => t.id !== id) });

  const addActionItem = () => onChange({ actionItems: [...actionItems, { id: makeId('act'), text: '', owner: '', done: false }] });
  const updateActionItem = (id, patch) => onChange({ actionItems: actionItems.map(a => a.id === id ? { ...a, ...patch } : a) });
  const removeActionItem = (id) => onChange({ actionItems: actionItems.filter(a => a.id !== id) });

  return (
    <>
      <Section title="Debrief">
        <textarea
          className="ys-inp ys-textarea"
          rows={4}
          placeholder="Overall reflections — what went well, what to change next time…"
          value={conference.debrief || ''}
          onChange={setField('debrief')}
        />
      </Section>

      <Section title="Key takeaways">
        <button type="button" className="app-btn ghost wc-add-btn" onClick={addTakeaway}>+ Add takeaway</button>

        {takeaways.length === 0 ? (
          <Empty text="No takeaways logged yet — capture what stood out to each woman who attended." />
        ) : (
          <div className="wc-takeaway-list">
            {takeaways.map(t => (
              <div key={t.id} className="wc-takeaway-row">
                <select className="ys-inp wc-takeaway-who" value={t.attendeeName || ''} onChange={e => updateTakeaway(t.id, { attendeeName: e.target.value })}>
                  <option value="">Who?</option>
                  {attendees.map(a => <option key={a.id} value={a.name}>{a.name || '(no name)'}</option>)}
                </select>
                <textarea className="ys-inp ys-textarea wc-takeaway-text" rows={2} value={t.text || ''} onChange={e => updateTakeaway(t.id, { text: e.target.value })} placeholder="What she took away from it…" />
                <button type="button" className="wc-row-del" onClick={() => removeTakeaway(t.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Action items">
        <button type="button" className="app-btn ghost wc-add-btn" onClick={addActionItem}>+ Add action item</button>

        {actionItems.length === 0 ? (
          <Empty text="No action items yet — capture follow-ups the ministry wants to act on." />
        ) : (
          <div className="wc-action-list">
            {actionItems.map(a => (
              <div key={a.id} className={`wc-action-row${a.done ? ' is-done' : ''}`}>
                <input type="checkbox" checked={!!a.done} onChange={e => updateActionItem(a.id, { done: e.target.checked })} />
                <input type="text" className="ys-inp wc-action-text" value={a.text || ''} onChange={e => updateActionItem(a.id, { text: e.target.value })} placeholder="What needs to happen" />
                <input type="text" className="ys-inp wc-action-owner" value={a.owner || ''} onChange={e => updateActionItem(a.id, { owner: e.target.value })} placeholder="Owner" />
                <button type="button" className="wc-row-del" onClick={() => removeActionItem(a.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/* ── Shared bits ─────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
function Empty({ text }) {
  return <div className="wc-empty-hint">{text}</div>;
}
