import { useEffect, useMemo, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { retreatService, DEFAULT_PACKING_ITEMS } from '../../services/retreatService';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-card-grid/.wa-stats-bar/.wa-controls…) from AllWomen.css and the
   .ys-* form primitives from the Youth roster — same pattern
   BibleStudies follows. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Retreats.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Retreats

   Level 1: card catalog — theme, dates, location, speaker,
   registration count vs. cap, budget balance.

   Level 2: clicking a card drills into a dedicated in-page view
   (same pattern as Bible Studies' StudyView / Writing's SeriesView)
   with eight tabs:
     Overview     — theme, dates, location, description, cap, cost,
                    scholarship notes. View mode by default, with an
                    "✎ Edit" button that reveals the form.
     Schedule     — day-by-day itinerary; each day expands to its
                    own list of timed sessions. Both days and
                    sessions are view mode with an "✎ Edit" button.
     Speakers     — session leaders/speakers roster: name, role,
                    topic, contact info, and a full bio. View mode
                    with an "✎ Edit" button per speaker.
     Registration — attendee roster: payment status, amount paid,
                    dietary needs, emergency contact, scholarship
     Rooming      — cabins/rooms with capacity, occupant assignment,
                    and an unassigned-attendees pool
     Budget       — income vs. expense line items with running
                    totals and a projected-income reference
     Team         — volunteer roles (who's running what)
     Packing      — shareable "what to bring" checklist, with a
                    one-click reset to a sensible default list

   Storage: one Firestore doc per retreat at
   /users/{uid}/womens-retreats/{id} (retreatService.js) — everything
   above is embedded on that doc since none of it is queried across
   retreats.
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  planning:      { label: 'Planning',            icon: '📝' },
  open:          { label: 'Registration Open',   icon: '🟢' },
  full:          { label: 'Full',                icon: '🔒' },
  'in-progress': { label: 'In Progress',         icon: '🏕️' },
  completed:     { label: 'Completed',           icon: '✅' },
};
const STATUS_ORDER = ['planning', 'open', 'full', 'in-progress', 'completed'];
const STATUS_FILTERS = [{ id: 'all', label: 'All' }, ...STATUS_ORDER.map(id => ({ id, label: STATUS_META[id].label }))];

const PAYMENT_META = {
  unpaid:  { label: 'Unpaid',  icon: '⭕' },
  partial: { label: 'Partial', icon: '🟡' },
  paid:    { label: 'Paid',    icon: '✅' },
};
const PAYMENT_ORDER = ['unpaid', 'partial', 'paid'];

const TABS = [
  { key: 'overview',     label: 'Overview',     icon: 'ℹ️' },
  { key: 'schedule',     label: 'Schedule',     icon: '📅' },
  { key: 'speakers',     label: 'Speakers',     icon: '🎤' },
  { key: 'registration', label: 'Registration', icon: '📋' },
  { key: 'rooming',      label: 'Rooming',      icon: '🛏️' },
  { key: 'budget',       label: 'Budget',       icon: '💵' },
  { key: 'team',         label: 'Team',         icon: '🙋' },
  { key: 'packing',      label: 'Packing',      icon: '🎒' },
];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const dateRange = (start, end) => {
  if (!start && !end) return '';
  if (start && end && start !== end) return `${start} → ${end}`;
  return start || end;
};

export default function Retreats() {
  const [retreats, setRetreats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [allWomen] = useUserStoreKey('womens:women', []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    retreatService.getAll()
      .then(res => { if (alive) setRetreats(Array.isArray(res?.data?.data) ? res.data.data : []); })
      .catch(err => { if (alive) setLoadErr(err?.message || 'Could not load retreats.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const list = retreats;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(r =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.theme || '').toLowerCase().includes(q) ||
          (r.location || '').toLowerCase().includes(q) ||
          (r.speaker || '').toLowerCase().includes(q) ||
          (r.speakers || []).some(s => (s.name || '').toLowerCase().includes(q)))
      : list;
    if (statusFilter !== 'all') out = out.filter(r => (r.status || 'planning') === statusFilter);
    return [...out].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  }, [list, query, statusFilter]);

  const openRetreat = useMemo(() => list.find(r => r.id === openId) || null, [list, openId]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const stats = useMemo(() => ({
    total:      list.length,
    upcoming:   list.filter(r => (r.status || 'planning') !== 'completed' && (!r.startDate || r.startDate >= today)).length,
    registered: list.reduce((sum, r) => sum + (r.attendees?.length || 0), 0),
    overCap:    list.filter(r => r.cap && (r.attendees?.length || 0) > Number(r.cap)).length,
  }), [list, today]);

  const addRetreat = async () => {
    const res = await retreatService.create({});
    const r = res?.data?.data;
    if (!r) return;
    setRetreats(prev => [...prev, r]);
    setOpenId(r.id);
  };

  const updateRetreat = (id, patch) => {
    setRetreats(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    retreatService.update(id, patch).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[Retreats] Failed to save:', err);
    });
  };

  const removeRetreat = (id) => {
    setRetreats(prev => prev.filter(r => r.id !== id));
    if (openId === id) setOpenId(null);
    retreatService.delete(id).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[Retreats] Failed to delete:', err);
    });
  };

  return (
    <WomensShell
      title="Retreats"
      icon="🏞"
      subtitle="Annual retreat dashboards — theme, speaker, location, schedule, rooming, registration, and budget."
      actions={
        !openRetreat && !loading && (
          <button type="button" className="wms-btn primary" onClick={addRetreat}>
            ✦ New retreat
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wr-root">
      {loading ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🏞</div>
              <div className="app-empty-title">Loading retreats…</div>
            </div>
          ) : loadErr ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">⚠️</div>
              <div className="app-empty-title">Couldn't load retreats</div>
              <div className="app-empty-sub">{loadErr}</div>
            </div>
          ) : openRetreat ? (
            <RetreatView
              retreat={openRetreat}
              allWomen={allWomen}
              onChange={(patch) => updateRetreat(openRetreat.id, patch)}
              onDelete={() => removeRetreat(openRetreat.id)}
              onBack={() => setOpenId(null)}
            />
          ) : list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🏞</div>
              <div className="app-empty-title">No retreats yet</div>
              <div className="app-empty-sub">
                Add your next annual retreat — theme, speaker, dates, and
                location — then build out the schedule, roster, rooming,
                budget, team, and packing list from its dashboard.
              </div>
              <button type="button" className="app-btn primary" onClick={addRetreat}>
                ✦ Add your first retreat
              </button>
            </div>
          ) : (
            <div className="wa-directory">
              <section className="wr-panel">
                <h3 className="wr-panel-subtitle">At a glance</h3>
                <div className="wa-stats-bar">
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.total}</span>
                    <span className="wa-stat-lbl">Retreats</span>
                  </div>
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.upcoming}</span>
                    <span className="wa-stat-lbl">Upcoming</span>
                  </div>
                  <div className="wa-stat">
                    <span className="wa-stat-n">{stats.registered}</span>
                    <span className="wa-stat-lbl">Total registered</span>
                  </div>
                  {stats.overCap > 0 && (
                    <div className="wa-stat is-warn">
                      <span className="wa-stat-n">{stats.overCap}</span>
                      <span className="wa-stat-lbl">Over capacity</span>
                    </div>
                  )}
                </div>
              </section>

              <section className="wr-panel">
                <div className="wr-panel-row">
                  <h3 className="wr-panel-subtitle">All retreats ({visible.length}{visible.length !== list.length ? ` of ${list.length}` : ''})</h3>
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
                    {query ? `No retreats match "${query}".` : 'No retreats match this filter.'}
                  </div>
                ) : (
                  <div className="wa-card-grid">
                    {visible.map(r => (
                      <RetreatCard key={r.id} retreat={r} onClick={() => setOpenId(r.id)} />
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
function RetreatCard({ retreat, onClick }) {
  const status = retreat.status || 'planning';
  const meta = STATUS_META[status] || STATUS_META.planning;
  const attendeeCount = retreat.attendees?.length || 0;
  const overCap = retreat.cap && attendeeCount > Number(retreat.cap);
  const net = (retreat.budgetItems || []).reduce((sum, b) =>
    sum + (b.kind === 'income' ? Number(b.amount) || 0 : -(Number(b.amount) || 0)), 0);
  const speakerCount = retreat.speakers?.length || 0;
  const primarySpeaker = retreat.speakers?.[0]?.name || retreat.speaker || '';

  return (
    <button type="button" className="wr-card" onClick={onClick}>
      <div className="wr-card-top">
        <span className="wr-card-title">{retreat.name || '(untitled retreat)'}</span>
        <span className={`wr-badge status-${status}`}>{meta.icon} {meta.label}</span>
      </div>
      {retreat.theme && <div className="wr-card-theme">"{retreat.theme}"</div>}
      {dateRange(retreat.startDate, retreat.endDate) && (
        <div className="wr-card-line">📅 {dateRange(retreat.startDate, retreat.endDate)}</div>
      )}
      {retreat.location && <div className="wr-card-line">📍 {retreat.location}</div>}
      {primarySpeaker && (
        <div className="wr-card-line">🎤 {primarySpeaker}{speakerCount > 1 ? ` +${speakerCount - 1}` : ''}</div>
      )}
      <div className="wr-card-foot">
        <span className={overCap ? 'wr-card-chip is-over' : 'wr-card-chip'}>
          {attendeeCount} {attendeeCount === 1 ? 'registered' : 'registered'}{retreat.cap ? ` / ${retreat.cap}` : ''}
        </span>
        {(retreat.budgetItems?.length || 0) > 0 && (
          <span className={`wr-card-chip ${net < 0 ? 'is-over' : 'is-good'}`}>{money(net)} net</span>
        )}
      </div>
    </button>
  );
}

/* ── Level 2: dedicated retreat drill-in ────────────────────── */
function RetreatView({ retreat, allWomen, onChange, onDelete, onBack }) {
  const [tab, setTab] = useState('overview');
  const [confirmDel, setConfirmDel] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const attendees = Array.isArray(retreat.attendees) ? retreat.attendees : [];
  const schedule = Array.isArray(retreat.schedule) ? retreat.schedule : [];
  const speakers = Array.isArray(retreat.speakers) ? retreat.speakers : [];
  const rooms = Array.isArray(retreat.rooms) ? retreat.rooms : [];
  const team = Array.isArray(retreat.team) ? retreat.team : [];
  const budgetItems = Array.isArray(retreat.budgetItems) ? retreat.budgetItems : [];
  const packingItems = Array.isArray(retreat.packingItems) ? retreat.packingItems : [];

  // One-time migration: older retreats stored a single speaker as
  // `speaker`/`speakerBio` on the Overview tab. Fold that into the
  // new Speakers roster the first time this retreat is opened so
  // existing data isn't lost now that Overview no longer shows it.
  useEffect(() => {
    if (speakers.length === 0 && (retreat.speaker || retreat.speakerBio)) {
      onChange({
        speakers: [{
          id: makeId('spk'), name: retreat.speaker || '', role: '', topic: '',
          email: '', phone: '', bio: retreat.speakerBio || '', notes: '',
        }],
        speaker: '',
        speakerBio: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retreat.id]);

  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = retreat.startDate
    ? Math.round((new Date(retreat.startDate) - new Date(today)) / 86400000)
    : null;
  const dayTier = daysUntil == null ? 'none' : daysUntil < 0 ? 'bad' : daysUntil <= 14 ? 'warn' : 'good';
  const paidCount = attendees.filter(a => a.paymentStatus === 'paid').length;
  const collected = attendees.reduce((sum, a) => sum + (Number(a.amountPaid) || 0), 0);
  const projected = (Number(retreat.costPerPerson) || 0) * attendees.length;
  const budgetIncome = budgetItems.filter(b => b.kind === 'income').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const budgetExpense = budgetItems.filter(b => b.kind === 'expense').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const budgetNet = budgetIncome - budgetExpense;

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <div className="wr-view">
      <button type="button" className="wr-view-back" onClick={onBack}>← All Retreats</button>

      <div className="wr-view-head">
        <span className="wr-view-icon">🏞</span>
        {editingTitle ? (
          <input
            type="text"
            className="ys-inp wr-title-inp wr-view-title-inp"
            value={retreat.name || ''}
            onChange={set('name')}
            placeholder="Retreat name"
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditingTitle(false); } }}
            autoFocus
          />
        ) : (
          <h1
            className="wr-title-display"
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-click to edit"
          >
            {retreat.name || 'Untitled Retreat'}
          </h1>
        )}
        <select className="ys-inp wr-view-status-sel" value={retreat.status || 'planning'} onChange={set('status')}>
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

      <div className="wr-view-meta">
        {dateRange(retreat.startDate, retreat.endDate) && <span className="wr-chip">📅 {dateRange(retreat.startDate, retreat.endDate)}</span>}
        {retreat.location && <span className="wr-chip">📍 {retreat.location}</span>}
        {speakers.length > 0 && (
          <span className="wr-chip">🎤 {speakers[0].name || '(unnamed speaker)'}{speakers.length > 1 ? ` +${speakers.length - 1}` : ''}</span>
        )}
        <span className="wr-chip">{attendees.length} registered{retreat.cap ? ` / ${retreat.cap}` : ''}</span>
      </div>

      <div className="wr-dash-row">
        <div className="wr-dash-stat">
          <span className="wr-dash-n">{attendees.length}{retreat.cap ? ` / ${retreat.cap}` : ''}</span>
          <span className="wr-dash-lbl">Registered</span>
        </div>
        <div className="wr-dash-stat">
          <span className="wr-dash-n">{paidCount}</span>
          <span className="wr-dash-lbl">Paid in full</span>
        </div>
        <div className="wr-dash-stat">
          <span className="wr-dash-n">{money(collected)}</span>
          <span className="wr-dash-lbl">Collected{projected ? ` / ${money(projected)}` : ''}</span>
        </div>
        <div className={`wr-dash-stat is-days tier-${dayTier}`}>
          <span className="wr-dash-n">{daysUntil == null ? '—' : Math.abs(daysUntil)}</span>
          <span className="wr-dash-lbl">{daysUntil == null ? 'No date set' : daysUntil < 0 ? 'Days ago' : 'Days until'}</span>
        </div>
        <div className={`wr-dash-stat ${budgetNet < 0 ? 'is-over' : 'is-good'}`}>
          <span className="wr-dash-n">{money(budgetNet)}</span>
          <span className="wr-dash-lbl">Budget net</span>
        </div>
      </div>

      <nav className="wr-tabs" role="tablist" aria-label="Retreat views">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`wr-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'schedule' && schedule.length > 0 && <span className="wr-tab-badge">{schedule.length}</span>}
            {t.key === 'speakers' && speakers.length > 0 && <span className="wr-tab-badge">{speakers.length}</span>}
            {t.key === 'registration' && attendees.length > 0 && <span className="wr-tab-badge">{attendees.length}</span>}
            {t.key === 'rooming' && rooms.length > 0 && <span className="wr-tab-badge">{rooms.length}</span>}
            {t.key === 'team' && team.length > 0 && <span className="wr-tab-badge">{team.length}</span>}
            {t.key === 'packing' && packingItems.length > 0 && <span className="wr-tab-badge">{packingItems.length}</span>}
          </button>
        ))}
      </nav>

      <div className="wr-view-body">
        {tab === 'overview' && <OverviewTab retreat={retreat} set={set} />}
        {tab === 'schedule' && <ScheduleTab retreat={retreat} schedule={schedule} onChange={onChange} />}
        {tab === 'speakers' && <SpeakersTab speakers={speakers} onChange={onChange} />}
        {tab === 'registration' && <RegistrationTab retreat={retreat} attendees={attendees} rooms={rooms} onChange={onChange} />}
        {tab === 'rooming' && <RoomingTab attendees={attendees} rooms={rooms} onChange={onChange} />}
        {tab === 'budget' && <BudgetTab retreat={retreat} budgetItems={budgetItems} onChange={onChange} />}
        {tab === 'team' && <TeamTab team={team} allWomen={allWomen} onChange={onChange} />}
        {tab === 'packing' && <PackingTab packingItems={packingItems} onChange={onChange} />}
      </div>
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────── */
function OverviewTab({ retreat, set }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return <OverviewView retreat={retreat} onEdit={() => setEditing(true)} />;
  }

  return (
    <>
      <div className="wr-tab-edit-head">
        <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(false)}>✓ Done</button>
      </div>

      <Section title="Theme & dates">
        <Field label="Theme">
          <input type="text" className="ys-inp" value={retreat.theme || ''} onChange={set('theme')} placeholder="e.g. Rooted — a weekend in Philippians" />
        </Field>
        <Row>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={retreat.startDate || ''} onChange={set('startDate')} />
          </Field>
          <Field label="End date">
            <input type="date" className="ys-inp" value={retreat.endDate || ''} onChange={set('endDate')} />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input type="text" className="ys-inp" value={retreat.location || ''} onChange={set('location')} placeholder="e.g. Pine Ridge Retreat Center" />
          </Field>
          <Field label="Venue contact">
            <input type="text" className="ys-inp" value={retreat.venueContact || ''} onChange={set('venueContact')} placeholder="Name / phone / email" />
          </Field>
        </Row>
      </Section>

      <Section title="Description">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          placeholder="What this retreat is about, who it's for…"
          value={retreat.description || ''}
          onChange={set('description')}
        />
      </Section>

      <Section title="Registration & cost">
        <Row>
          <Field label="Registration cap">
            <input type="number" min="0" className="ys-inp" value={retreat.cap || ''} onChange={set('cap')} placeholder="No limit" />
          </Field>
          <Field label="Cost per person">
            <input type="number" min="0" step="0.01" className="ys-inp" value={retreat.costPerPerson || ''} onChange={set('costPerPerson')} placeholder="0.00" />
          </Field>
        </Row>
        <Field label="Scholarship / financial aid notes">
          <textarea
            className="ys-inp ys-textarea"
            rows={2}
            placeholder="How scholarships work, fund balance, who to contact…"
            value={retreat.scholarshipNotes || ''}
            onChange={set('scholarshipNotes')}
          />
        </Field>
      </Section>
    </>
  );
}

/* Read-only rendering of the Overview tab, behind an "✎ Edit" button —
   same view/edit split used throughout this page (Schedule's days
   and sessions, Speakers below). Everything under the theme is
   centered (.wr-overview-centered) so the dashboard reads like a
   poster rather than a form. */
function OverviewView({ retreat, onEdit }) {
  return (
    <div className="wr-overview-centered">
      <div className="wr-tab-edit-head">
        <button type="button" className="app-btn ghost wr-export-btn" onClick={() => window.print()}>🖨 Export Overview</button>
        <button type="button" className="app-btn ghost wr-edit-btn" onClick={onEdit}>✎ Edit</button>
      </div>

      <Section title="Theme & dates">
        <ViewField value={retreat.theme} placeholder="No theme set yet" hero />
        <ViewRow>
          <ViewField label="Start date" value={retreat.startDate} placeholder="Not set" icon="📅" />
          <ViewField label="End date" value={retreat.endDate} placeholder="Not set" icon="📅" />
        </ViewRow>
        <ViewRow>
          <ViewField label="Location" value={retreat.location} placeholder="Not set" icon="📍" />
          <ViewField label="Venue contact" value={retreat.venueContact} placeholder="Not set" icon="☎️" />
        </ViewRow>
      </Section>

      <Section title="Description">
        <ViewField value={retreat.description} placeholder="No description yet." block />
      </Section>

      <Section title="Registration & cost">
        <ViewRow>
          <ViewField label="Registration cap" value={retreat.cap} placeholder="No limit" icon="🎟️" />
          <ViewField label="Cost per person" value={retreat.costPerPerson ? money(retreat.costPerPerson) : ''} placeholder="Not set" icon="💵" />
        </ViewRow>
        <ViewField label="Scholarship / financial aid notes" value={retreat.scholarshipNotes} placeholder="No notes yet." block icon="🎓" />
      </Section>

      <OverviewPrintSheet retreat={retreat} />
    </div>
  );
}

/* Hidden print-only sheet for "Export Overview" — same pattern as
   SchedulePrintSheet, shown only while printing. */
function OverviewPrintSheet({ retreat }) {
  const generatedOn = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="wr-print-area">
      <div className="wr-print-head">
        <h1 className="wr-print-title">{retreat?.name || 'Untitled Retreat'}</h1>
        {retreat?.theme && <p className="wr-print-theme">"{retreat.theme}"</p>}
        <p className="wr-print-meta">
          {[
            [retreat?.startDate, retreat?.endDate].filter(Boolean).join(' – '),
            retreat?.location,
          ].filter(Boolean).join('  •  ')}
        </p>
      </div>

      <div className="wr-print-fields">
        <div className="wr-print-field">
          <span className="wr-print-field-lbl">Venue contact</span>
          <span className="wr-print-field-val">{retreat?.venueContact || '—'}</span>
        </div>
        <div className="wr-print-field">
          <span className="wr-print-field-lbl">Registration cap</span>
          <span className="wr-print-field-val">{retreat?.cap || 'No limit'}</span>
        </div>
        <div className="wr-print-field">
          <span className="wr-print-field-lbl">Cost per person</span>
          <span className="wr-print-field-val">{retreat?.costPerPerson ? money(retreat.costPerPerson) : '—'}</span>
        </div>
      </div>

      {retreat?.description && (
        <div className="wr-print-block">
          <h2 className="wr-print-block-title">Description</h2>
          <p className="wr-print-block-body">{retreat.description}</p>
        </div>
      )}

      {retreat?.scholarshipNotes && (
        <div className="wr-print-block">
          <h2 className="wr-print-block-title">Scholarship / financial aid</h2>
          <p className="wr-print-block-body">{retreat.scholarshipNotes}</p>
        </div>
      )}

      <p className="wr-print-footer">Generated {generatedOn}</p>
    </div>
  );
}

/* ── Schedule ────────────────────────────────────────────────── */
function ScheduleTab({ retreat, schedule, onChange }) {
  const sorted = useMemo(() => [...schedule].sort((a, b) => (a.date || '').localeCompare(b.date || '')), [schedule]);
  const [expandedId, setExpandedId] = useState(sorted[0]?.id || null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [dayEditId, setDayEditId] = useState(null);
  const [sessionEditId, setSessionEditId] = useState(null);

  const addDay = () => {
    const d = { id: makeId('day'), date: '', label: '', sessions: [] };
    onChange({ schedule: [...schedule, d] });
    setExpandedId(d.id);
    setDayEditId(d.id);
  };
  const updateDay = (id, patch) => onChange({ schedule: schedule.map(d => d.id === id ? { ...d, ...patch } : d) });
  const removeDay = (id) => {
    onChange({ schedule: schedule.filter(d => d.id !== id) });
    if (expandedId === id) setExpandedId(null);
    if (dayEditId === id) setDayEditId(null);
  };
  const addSession = (day) => {
    const s = { id: makeId('sess'), time: '', title: '', leader: '', location: '' };
    updateDay(day.id, { sessions: [...(day.sessions || []), s] });
    setSessionEditId(s.id);
  };
  const updateSession = (day, sessionId, patch) => {
    updateDay(day.id, { sessions: (day.sessions || []).map(s => s.id === sessionId ? { ...s, ...patch } : s) });
  };
  const removeSession = (day, sessionId) => {
    updateDay(day.id, { sessions: (day.sessions || []).filter(s => s.id !== sessionId) });
    if (sessionEditId === sessionId) setSessionEditId(null);
  };

  return (
    <Section title="Schedule">
      <div className="wr-schedule-toolbar">
        <button type="button" className="app-btn ghost wr-add-btn" onClick={addDay}>+ Add day</button>
        {sorted.length > 0 && (
          <button type="button" className="app-btn ghost wr-export-btn" onClick={() => window.print()}>🖨 Export Schedule</button>
        )}
      </div>

      {sorted.length > 0 && <SchedulePrintSheet retreat={retreat} sorted={sorted} />}

      {sorted.length === 0 ? (
        <Empty text="No days added yet — add one for each day of the retreat, then list its sessions." />
      ) : (
        <div className="wr-day-list">
          {sorted.map(day => {
            const open = expandedId === day.id;
            const sessions = [...(day.sessions || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            const armed = confirmDelId === day.id;
            const editingDay = dayEditId === day.id;
            return (
              <div key={day.id} className={`wr-day${open ? ' open' : ''}`}>
                <button type="button" className="wr-day-head" onClick={() => setExpandedId(open ? null : day.id)}>
                  <span className="wr-day-date">{day.date || 'No date'}</span>
                  <span className="wr-day-label">{day.label || '(untitled day)'}</span>
                  <span className="wr-day-summary">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
                  <span className="wr-chevron">▶</span>
                </button>
                {open && (
                  <div className="wr-day-body">
                    {editingDay ? (
                      <>
                        <Row>
                          <Field label="Date">
                            <input type="date" className="ys-inp" value={day.date || ''} onChange={e => updateDay(day.id, { date: e.target.value })} />
                          </Field>
                          <Field label="Day label">
                            <input type="text" className="ys-inp" value={day.label || ''} onChange={e => updateDay(day.id, { label: e.target.value })} placeholder="e.g. Friday — Arrival" />
                          </Field>
                        </Row>
                        <div className="wr-day-edit-done-row">
                          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setDayEditId(null)}>✓ Done</button>
                        </div>
                      </>
                    ) : (
                      <div className="wr-day-view-row">
                        <div className="wr-day-view-info">
                          <span className="wr-day-view-date-pill">{day.date || 'No date set'}</span>
                          <span className="wr-day-view-label">{day.label || '(untitled day)'}</span>
                        </div>
                        <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setDayEditId(day.id)}>✎ Edit</button>
                      </div>
                    )}

                    {sessions.length === 0 ? (
                      <Empty text="No sessions yet — add the first one below." />
                    ) : (
                      <div className="wr-timeline">
                        {sessions.map(session => {
                          const editingSession = sessionEditId === session.id;
                          return editingSession ? (
                            <div key={session.id} className="wr-session-row">
                              <input type="text" className="ys-inp wr-session-time" value={session.time || ''} onChange={e => updateSession(day, session.id, { time: e.target.value })} placeholder="7:00 PM" />
                              <input type="text" className="ys-inp wr-session-title" value={session.title || ''} onChange={e => updateSession(day, session.id, { title: e.target.value })} placeholder="Session title" />
                              <input type="text" className="ys-inp wr-session-leader" value={session.leader || ''} onChange={e => updateSession(day, session.id, { leader: e.target.value })} placeholder="Leader" />
                              <input type="text" className="ys-inp wr-session-location" value={session.location || ''} onChange={e => updateSession(day, session.id, { location: e.target.value })} placeholder="Location" />
                              <button type="button" className="wr-row-done" onClick={() => setSessionEditId(null)} title="Done">✓</button>
                            </div>
                          ) : (
                            <div key={session.id} className="wr-timeline-row">
                              <div className="wr-timeline-rail">
                                <span className="wr-timeline-dot" />
                              </div>
                              <div className="wr-timeline-content">
                                <span className="wr-timeline-time">{session.time || '—'}</span>
                                <span className="wr-timeline-title">{session.title || '(untitled session)'}</span>
                                <span className="wr-timeline-meta">{[session.leader, session.location].filter(Boolean).join(' · ') || 'No leader or location set'}</span>
                              </div>
                              <div className="wr-timeline-actions">
                                <button type="button" className="wr-row-edit" onClick={() => setSessionEditId(session.id)} title="Edit session">✎</button>
                                <button type="button" className="wr-row-del" onClick={() => removeSession(day, session.id)} title="Remove session">✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button type="button" className="app-btn ghost wr-add-btn" onClick={() => addSession(day)}>+ Add session</button>

                    <div className="wr-day-del-row">
                      <button
                        type="button"
                        className={`ys-del-btn${armed ? ' armed' : ''}`}
                        onClick={() => {
                          if (armed) { removeDay(day.id); return; }
                          setConfirmDelId(day.id);
                          setTimeout(() => setConfirmDelId(prev => prev === day.id ? null : prev), 3500);
                        }}
                      >
                        {armed ? 'Click again to delete' : '🗑 Delete day'}
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
  );
}

/* yyyy-mm-dd -> "Friday, June 12, 2026". Parsed manually (not via
   `new Date(str)`) to avoid UTC-shift-by-a-day bugs. Falls back to
   the raw string for anything that isn't a clean ISO date. */
function formatPrintDate(iso) {
  if (!iso) return 'No date set';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/* Hidden print-only sheet for "Export Schedule" — only visible while
   printing (see @media print rules in Retreats.css), so it renders
   off-screen the rest of the time. */
function SchedulePrintSheet({ retreat, sorted }) {
  const generatedOn = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="wr-print-area">
      <div className="wr-print-head">
        <h1 className="wr-print-title">{retreat?.name || 'Untitled Retreat'}</h1>
        {retreat?.theme && <p className="wr-print-theme">"{retreat.theme}"</p>}
        <p className="wr-print-meta">
          {[
            [retreat?.startDate, retreat?.endDate].filter(Boolean).join(' – '),
            retreat?.location,
          ].filter(Boolean).join('  •  ')}
        </p>
      </div>

      {sorted.map((day, i) => {
        const sessions = [...(day.sessions || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        return (
          <div key={day.id} className="wr-print-day">
            <h2 className="wr-print-day-title">
              <span className="wr-print-day-num">Day {i + 1}</span>
              <span className="wr-print-day-date">{formatPrintDate(day.date)}</span>
              {day.label && <span className="wr-print-day-label">{day.label}</span>}
            </h2>
            {sessions.length === 0 ? (
              <p className="wr-print-no-sessions">No sessions scheduled.</p>
            ) : (
              <table className="wr-print-table">
                <thead>
                  <tr>
                    <th className="wr-print-th-time">Time</th>
                    <th className="wr-print-th-title">Session</th>
                    <th className="wr-print-th-leader">Leader</th>
                    <th className="wr-print-th-location">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr key={session.id}>
                      <td className="wr-print-td-time">{session.time || '—'}</td>
                      <td className="wr-print-td-title">{session.title || '(untitled session)'}</td>
                      <td className="wr-print-td-leader">{session.leader || '—'}</td>
                      <td className="wr-print-td-location">{session.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      <p className="wr-print-footer">Generated {generatedOn}</p>
    </div>
  );
}

/* ── Speakers ────────────────────────────────────────────────── */
function SpeakersTab({ speakers, onChange }) {
  const [editId, setEditId] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);

  const addSpeaker = () => {
    const s = { id: makeId('spk'), name: '', role: '', topic: '', email: '', phone: '', bio: '', notes: '' };
    onChange({ speakers: [...speakers, s] });
    setEditId(s.id);
  };
  const updateSpeaker = (id, patch) => onChange({ speakers: speakers.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeSpeaker = (id) => {
    onChange({ speakers: speakers.filter(s => s.id !== id) });
    if (editId === id) setEditId(null);
  };

  return (
    <Section title="Session leaders & speakers">
      <button type="button" className="app-btn ghost wr-add-btn" onClick={addSpeaker}>+ Add speaker</button>

      {speakers.length === 0 ? (
        <Empty text="No speakers added yet — add each session leader with their bio, topic, and contact info." />
      ) : (
        <div className="wr-spk-list">
          {speakers.map(spk => {
            const editing = editId === spk.id;
            const armed = confirmDelId === spk.id;
            return (
              <div key={spk.id} className="wr-spk-card">
                {editing ? (
                  <>
                    <Row>
                      <Field label="Name">
                        <input type="text" className="ys-inp" value={spk.name || ''} onChange={e => updateSpeaker(spk.id, { name: e.target.value })} placeholder="e.g. Jane Smith" />
                      </Field>
                      <Field label="Role / title">
                        <input type="text" className="ys-inp" value={spk.role || ''} onChange={e => updateSpeaker(spk.id, { role: e.target.value })} placeholder="e.g. Keynote speaker" />
                      </Field>
                    </Row>
                    <Field label="Topic / session focus">
                      <input type="text" className="ys-inp" value={spk.topic || ''} onChange={e => updateSpeaker(spk.id, { topic: e.target.value })} placeholder="What she'll be speaking on" />
                    </Field>
                    <Row>
                      <Field label="Email">
                        <input type="email" className="ys-inp" value={spk.email || ''} onChange={e => updateSpeaker(spk.id, { email: e.target.value })} />
                      </Field>
                      <Field label="Phone">
                        <input type="text" className="ys-inp" value={spk.phone || ''} onChange={e => updateSpeaker(spk.id, { phone: e.target.value })} />
                      </Field>
                    </Row>
                    <Field label="Bio">
                      <textarea
                        className="ys-inp ys-textarea"
                        rows={4}
                        placeholder="Bio, ministry background, credentials…"
                        value={spk.bio || ''}
                        onChange={e => updateSpeaker(spk.id, { bio: e.target.value })}
                      />
                    </Field>
                    <Field label="Notes">
                      <textarea
                        className="ys-inp ys-textarea"
                        rows={2}
                        placeholder="Travel, honorarium, green-room needs…"
                        value={spk.notes || ''}
                        onChange={e => updateSpeaker(spk.id, { notes: e.target.value })}
                      />
                    </Field>
                    <div className="wr-day-del-row">
                      <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditId(null)}>✓ Done</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="wr-spk-view-top">
                      <span className="wr-spk-medallion">{(spk.name || '?').trim().charAt(0).toUpperCase()}</span>
                      <div className="wr-spk-view-info">
                        <span className="wr-spk-view-name">{spk.name || '(unnamed speaker)'}</span>
                        {spk.role && <span className="wr-spk-view-role">{spk.role}</span>}
                      </div>
                      <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditId(spk.id)}>✎ Edit</button>
                    </div>
                    {spk.topic && <div className="wr-spk-view-topic">🎯 {spk.topic}</div>}
                    <div className="wr-spk-view-bio">{spk.bio || 'No bio added yet.'}</div>
                    {(spk.email || spk.phone) && (
                      <div className="wr-spk-view-contact-row">
                        {spk.email && <span className="wr-spk-view-contact-chip">✉️ {spk.email}</span>}
                        {spk.phone && <span className="wr-spk-view-contact-chip">📞 {spk.phone}</span>}
                      </div>
                    )}
                    {spk.notes && <div className="wr-spk-view-notes">📝 {spk.notes}</div>}
                  </>
                )}

                <div className="wr-day-del-row">
                  <button
                    type="button"
                    className={`ys-del-btn${armed ? ' armed' : ''}`}
                    onClick={() => {
                      if (armed) { removeSpeaker(spk.id); return; }
                      setConfirmDelId(spk.id);
                      setTimeout(() => setConfirmDelId(prev => prev === spk.id ? null : prev), 3500);
                    }}
                  >
                    {armed ? 'Click again to remove' : '🗑 Remove speaker'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ── Registration ────────────────────────────────────────────── */
function RegistrationTab({ retreat, attendees, rooms, onChange }) {
  const [expandedId, setExpandedId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [printMode, setPrintMode] = useState('line');

  /* Two export sheets share the same generic .wr-print-area class
     (only one is ever mounted per print), so switching which one is
     rendered right before calling window.print() — same
     class-then-requestAnimationFrame pattern Songs' exportPDF uses —
     is what keeps "Export Guest List" and "Export Full Profiles"
     from bleeding into each other's printout. */
  const exportGuestList = () => { setPrintMode('line'); requestAnimationFrame(() => window.print()); };
  const exportFullProfiles = () => { setPrintMode('full'); requestAnimationFrame(() => window.print()); };

  const addAttendee = () => {
    const a = {
      id: makeId('att'), name: '', email: '', phone: '', paymentStatus: 'unpaid', amountPaid: '',
      dietary: '', emergencyContact: '', emergencyPhone: '', scholarship: false, roomId: '', notes: '',
    };
    onChange({ attendees: [...attendees, a] });
    setExpandedId(a.id);
    setEditId(a.id);
  };
  const updateAttendee = (id, patch) => onChange({ attendees: attendees.map(a => a.id === id ? { ...a, ...patch } : a) });
  const removeAttendee = (id) => {
    onChange({ attendees: attendees.filter(a => a.id !== id) });
    if (expandedId === id) setExpandedId(null);
    if (editId === id) setEditId(null);
  };

  const collected = attendees.reduce((sum, a) => sum + (Number(a.amountPaid) || 0), 0);
  const expected = (Number(retreat.costPerPerson) || 0) * attendees.length;
  const overCap = retreat.cap && attendees.length > Number(retreat.cap);

  return (
    <Section title="Registration">
      <div className="wr-reg-stats">
        <span className="wr-chip">{attendees.length} registered{retreat.cap ? ` / ${retreat.cap}` : ''}{overCap ? ' ⚠️' : ''}</span>
        <span className="wr-chip">{attendees.filter(a => a.paymentStatus === 'paid').length} paid in full</span>
        <span className="wr-chip">{money(collected)} collected{expected ? ` / ${money(expected)} expected` : ''}</span>
      </div>

      <div className="wr-schedule-toolbar">
        <button type="button" className="app-btn ghost wr-add-btn" onClick={addAttendee}>+ Add attendee</button>
        {attendees.length > 0 && (
          <div className="wr-export-btn-group">
            <button type="button" className="app-btn ghost wr-export-btn" onClick={exportGuestList}>🖨 Export Guest List</button>
            <button type="button" className="app-btn ghost wr-export-btn" onClick={exportFullProfiles}>🖨 Export Full Profiles</button>
          </div>
        )}
      </div>

      {attendees.length === 0 ? (
        <Empty text="No one registered yet — add each woman signing up, along with payment and dietary/emergency info." />
      ) : (
        <div className="wr-att-list">
          {attendees.map(a => {
            const open = expandedId === a.id;
            const editing = editId === a.id;
            const pm = PAYMENT_META[a.paymentStatus || 'unpaid'] || PAYMENT_META.unpaid;
            const armed = confirmDelId === a.id;
            const room = rooms.find(r => r.id === a.roomId);
            return (
              <div key={a.id} className={`wr-att${open ? ' open' : ''}`}>
                <button type="button" className="wr-att-head" onClick={() => setExpandedId(open ? null : a.id)}>
                  <span className="wr-att-name">{a.name || '(no name)'}</span>
                  <span className={`wr-badge status-${a.paymentStatus || 'unpaid'}`}>{pm.icon} {pm.label}</span>
                  {a.scholarship && <span className="wr-att-flag" title="Scholarship">🎓</span>}
                  {room && <span className="wr-att-room">🛏️ {room.name}</span>}
                  <span className="wr-chevron">▶</span>
                </button>
                {open && (
                  <div className="wr-att-body">
                    {editing ? (
                      <>
                        <Row>
                          <Field label="Name">
                            <input type="text" className="ys-inp" value={a.name || ''} onChange={e => updateAttendee(a.id, { name: e.target.value })} />
                          </Field>
                          <Field label="Payment status">
                            <select className="ys-inp" value={a.paymentStatus || 'unpaid'} onChange={e => updateAttendee(a.id, { paymentStatus: e.target.value })}>
                              {PAYMENT_ORDER.map(id => <option key={id} value={id}>{PAYMENT_META[id].icon} {PAYMENT_META[id].label}</option>)}
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
                          <Field label="Amount paid">
                            <input type="number" min="0" step="0.01" className="ys-inp" value={a.amountPaid || ''} onChange={e => updateAttendee(a.id, { amountPaid: e.target.value })} placeholder="0.00" />
                          </Field>
                          <Field label="Room assignment">
                            <select className="ys-inp" value={a.roomId || ''} onChange={e => updateAttendee(a.id, { roomId: e.target.value })}>
                              <option value="">Unassigned</option>
                              {rooms.map(r => <option key={r.id} value={r.id}>{r.name || '(unnamed room)'}</option>)}
                            </select>
                          </Field>
                        </Row>
                        <Field label="Dietary restrictions / allergies">
                          <input type="text" className="ys-inp" value={a.dietary || ''} onChange={e => updateAttendee(a.id, { dietary: e.target.value })} placeholder="e.g. gluten-free, nut allergy" />
                        </Field>
                        <Row>
                          <Field label="Emergency contact">
                            <input type="text" className="ys-inp" value={a.emergencyContact || ''} onChange={e => updateAttendee(a.id, { emergencyContact: e.target.value })} />
                          </Field>
                          <Field label="Emergency phone">
                            <input type="text" className="ys-inp" value={a.emergencyPhone || ''} onChange={e => updateAttendee(a.id, { emergencyPhone: e.target.value })} />
                          </Field>
                        </Row>
                        <Field label="Scholarship / financial aid">
                          <label className="wr-checkbox-row">
                            <input type="checkbox" checked={!!a.scholarship} onChange={e => updateAttendee(a.id, { scholarship: e.target.checked })} />
                            <span>Receiving scholarship</span>
                          </label>
                        </Field>
                        <Field label="Notes">
                          <textarea className="ys-inp ys-textarea" rows={2} value={a.notes || ''} onChange={e => updateAttendee(a.id, { notes: e.target.value })} />
                        </Field>
                        <div className="wr-day-del-row">
                          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditId(null)}>✓ Done</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="wr-tab-edit-head">
                          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditId(a.id)}>✎ Edit</button>
                        </div>
                        <ViewRow>
                          <ViewField label="Email" value={a.email} placeholder="Not set" icon="✉️" />
                          <ViewField label="Phone" value={a.phone} placeholder="Not set" icon="📞" />
                        </ViewRow>
                        <ViewRow>
                          <ViewField label="Amount paid" value={a.amountPaid ? money(a.amountPaid) : ''} placeholder="Not set" icon="💵" />
                          <ViewField label="Room assignment" value={room?.name} placeholder="Unassigned" icon="🛏️" />
                        </ViewRow>
                        <ViewField label="Dietary restrictions / allergies" value={a.dietary} placeholder="None noted" icon="🍽️" />
                        <ViewRow>
                          <ViewField label="Emergency contact" value={a.emergencyContact} placeholder="Not set" icon="🆘" />
                          <ViewField label="Emergency phone" value={a.emergencyPhone} placeholder="Not set" icon="📞" />
                        </ViewRow>
                        <ViewField label="Scholarship / financial aid" value={a.scholarship ? 'Receiving scholarship' : ''} placeholder="Not receiving scholarship" icon="🎓" />
                        <ViewField label="Notes" value={a.notes} placeholder="No notes." block icon="📝" />
                      </>
                    )}

                    <div className="wr-day-del-row">
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

      {attendees.length > 0 && (
        printMode === 'full'
          ? <RegistrationFullPrintSheet retreat={retreat} attendees={attendees} rooms={rooms} />
          : <RegistrationLinePrintSheet retreat={retreat} attendees={attendees} rooms={rooms} />
      )}
    </Section>
  );
}

/* Hidden print-only sheet for "Export Guest List" — one compact line
   per registered guest (name, payment status, amount, room). */
function RegistrationLinePrintSheet({ retreat, attendees, rooms }) {
  const generatedOn = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const sorted = [...attendees].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return (
    <div className="wr-print-area">
      <div className="wr-print-head">
        <h1 className="wr-print-title">{retreat?.name || 'Untitled Retreat'} — Guest List</h1>
        <p className="wr-print-meta">{sorted.length} registered{retreat?.cap ? ` / ${retreat.cap}` : ''}</p>
      </div>
      <table className="wr-print-table">
        <thead>
          <tr>
            <th className="wr-print-th-title">Name</th>
            <th className="wr-print-th-leader">Payment</th>
            <th className="wr-print-th-location">Amount paid</th>
            <th className="wr-print-th-location">Room</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(a => {
            const pm = PAYMENT_META[a.paymentStatus || 'unpaid'] || PAYMENT_META.unpaid;
            const room = rooms.find(r => r.id === a.roomId);
            return (
              <tr key={a.id}>
                <td className="wr-print-td-title">{a.name || '(no name)'}{a.scholarship ? ' 🎓' : ''}</td>
                <td>{pm.label}</td>
                <td>{a.amountPaid ? money(a.amountPaid) : '—'}</td>
                <td>{room?.name || 'Unassigned'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="wr-print-footer">Generated {generatedOn}</p>
    </div>
  );
}

/* Hidden print-only sheet for "Export Full Profiles" — the complete
   guest-form rundown for every attendee, one block per person. */
function RegistrationFullPrintSheet({ retreat, attendees, rooms }) {
  const generatedOn = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const sorted = [...attendees].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return (
    <div className="wr-print-area">
      <div className="wr-print-head">
        <h1 className="wr-print-title">{retreat?.name || 'Untitled Retreat'} — Full Guest Profiles</h1>
        <p className="wr-print-meta">{sorted.length} registered{retreat?.cap ? ` / ${retreat.cap}` : ''}</p>
      </div>
      {sorted.map(a => {
        const pm = PAYMENT_META[a.paymentStatus || 'unpaid'] || PAYMENT_META.unpaid;
        const room = rooms.find(r => r.id === a.roomId);
        return (
          <div key={a.id} className="wr-print-block">
            <h2 className="wr-print-block-title">{a.name || '(no name)'}{a.scholarship ? ' — Scholarship' : ''}</h2>
            <div className="wr-print-fields">
              <div className="wr-print-field"><span className="wr-print-field-lbl">Payment</span><span className="wr-print-field-val">{pm.label}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Amount paid</span><span className="wr-print-field-val">{a.amountPaid ? money(a.amountPaid) : '—'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Room</span><span className="wr-print-field-val">{room?.name || 'Unassigned'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Email</span><span className="wr-print-field-val">{a.email || '—'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Phone</span><span className="wr-print-field-val">{a.phone || '—'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Dietary</span><span className="wr-print-field-val">{a.dietary || '—'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Emergency contact</span><span className="wr-print-field-val">{a.emergencyContact || '—'}</span></div>
              <div className="wr-print-field"><span className="wr-print-field-lbl">Emergency phone</span><span className="wr-print-field-val">{a.emergencyPhone || '—'}</span></div>
            </div>
            {a.notes && <p className="wr-print-block-body">📝 {a.notes}</p>}
          </div>
        );
      })}
      <p className="wr-print-footer">Generated {generatedOn}</p>
    </div>
  );
}

/* ── Rooming ─────────────────────────────────────────────────── */
function RoomingTab({ attendees, rooms, onChange }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState(null);

  const addRoom = () => {
    onChange({ rooms: [...rooms, { id: makeId('room'), name: '', capacity: '', roomLeader: '', notes: '' }] });
    setEditing(true);
  };
  const updateRoom = (id, patch) => onChange({ rooms: rooms.map(r => r.id === id ? { ...r, ...patch } : r) });
  const removeRoom = (id) => {
    onChange({
      rooms: rooms.filter(r => r.id !== id),
      attendees: attendees.map(a => a.roomId === id ? { ...a, roomId: '' } : a),
    });
  };
  const unassign = (attendeeId) => onChange({ attendees: attendees.map(a => a.id === attendeeId ? { ...a, roomId: '' } : a) });
  const assign = (attendeeId, roomId) => onChange({ attendees: attendees.map(a => a.id === attendeeId ? { ...a, roomId } : a) });

  const unassigned = attendees.filter(a => !a.roomId);

  return (
    <>
      <Section title="Rooms">
        <div className="wr-tab-edit-head">
          {editing ? (
            <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(false)}>✓ Done</button>
          ) : (
            <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
          )}
        </div>

        {editing && <button type="button" className="app-btn ghost wr-add-btn" onClick={addRoom}>+ Add room</button>}

        {rooms.length === 0 ? (
          <Empty text="No rooms added yet — add each cabin/room and its capacity, then assign attendees to it." />
        ) : (
          <div className="wr-room-grid">
            {rooms.map(room => {
              const occupants = attendees.filter(a => a.roomId === room.id);
              const overCap = room.capacity && occupants.length > Number(room.capacity);
              const armed = confirmDelId === room.id;
              return (
                <div key={room.id} className="wr-room-card">
                  {editing ? (
                    <>
                      <Row>
                        <Field label="Room name">
                          <input type="text" className="ys-inp" value={room.name || ''} onChange={e => updateRoom(room.id, { name: e.target.value })} placeholder="e.g. Cabin 3" />
                        </Field>
                        <Field label="Capacity">
                          <input type="number" min="0" className="ys-inp" value={room.capacity || ''} onChange={e => updateRoom(room.id, { capacity: e.target.value })} placeholder="No limit" />
                        </Field>
                      </Row>
                      <Field label="Room leader">
                        <input type="text" className="ys-inp" value={room.roomLeader || ''} onChange={e => updateRoom(room.id, { roomLeader: e.target.value })} placeholder="Who's hosting/leading this room" />
                      </Field>
                      <Field label="Notes">
                        <input type="text" className="ys-inp" value={room.notes || ''} onChange={e => updateRoom(room.id, { notes: e.target.value })} placeholder="Bunk layout, accessibility, etc." />
                      </Field>
                    </>
                  ) : (
                    <div className="wr-room-view-top">
                      <span className="wr-room-view-name">{room.name || '(unnamed room)'}</span>
                      {room.roomLeader && <span className="wr-room-leader-chip">👑 {room.roomLeader}</span>}
                    </div>
                  )}
                  <div className={`wr-room-fill${overCap ? ' is-over' : ''}`}>
                    {occupants.length}{room.capacity ? ` / ${room.capacity}` : ''} occupants{overCap ? ' ⚠️ over capacity' : ''}
                  </div>
                  {occupants.length === 0 ? (
                    <div className="wr-room-empty">No one assigned yet.</div>
                  ) : (
                    <ul className="wr-room-occupants">
                      {occupants.map(a => (
                        <li key={a.id}>
                          <span>{a.name || '(no name)'}</span>
                          <button type="button" className="wr-row-del" onClick={() => unassign(a.id)} title="Unassign">✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!editing && room.notes && <div className="wr-room-notes">📝 {room.notes}</div>}
                  {editing && (
                    <div className="wr-day-del-row">
                      <button
                        type="button"
                        className={`ys-del-btn${armed ? ' armed' : ''}`}
                        onClick={() => {
                          if (armed) { removeRoom(room.id); return; }
                          setConfirmDelId(room.id);
                          setTimeout(() => setConfirmDelId(prev => prev === room.id ? null : prev), 3500);
                        }}
                      >
                        {armed ? 'Click again to delete' : '🗑 Delete room'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`Unassigned (${unassigned.length})`}>
        {unassigned.length === 0 ? (
          <Empty text="Everyone registered has a room assignment." />
        ) : (
          <div className="wr-unassigned-list">
            {unassigned.map(a => (
              <div key={a.id} className="wr-unassigned-row">
                <span className="wr-att-name">{a.name || '(no name)'}</span>
                <select className="ys-inp" value="" onChange={e => e.target.value && assign(a.id, e.target.value)}>
                  <option value="">Assign to room…</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name || '(unnamed room)'}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

const BUDGET_STATUS_META = {
  pending: { label: 'Pending', icon: '⏳' },
  paid:    { label: 'Paid',    icon: '✅' },
};
const BUDGET_STATUS_ORDER = ['pending', 'paid'];

/* ── Budget ──────────────────────────────────────────────────── */
function BudgetTab({ retreat, budgetItems, onChange }) {
  const [editing, setEditing] = useState(false);
  const addItem = () => {
    onChange({
      budgetItems: [...budgetItems, {
        id: makeId('bud'), kind: 'expense', category: '', label: '', vendor: '',
        dueDate: '', paidStatus: 'pending', amount: '', notes: '',
      }],
    });
    setEditing(true);
  };
  const updateItem = (id, patch) => onChange({ budgetItems: budgetItems.map(b => b.id === id ? { ...b, ...patch } : b) });
  const removeItem = (id) => onChange({ budgetItems: budgetItems.filter(b => b.id !== id) });

  const income = budgetItems.filter(b => b.kind === 'income').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const expense = budgetItems.filter(b => b.kind === 'expense').reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const net = income - expense;
  const attendeeCount = retreat.attendees?.length || 0;
  const projectedIncome = (Number(retreat.costPerPerson) || 0) * attendeeCount;
  const today = new Date().toISOString().slice(0, 10);

  const incomeItems = budgetItems.filter(b => b.kind === 'income');
  const expenseItems = budgetItems.filter(b => (b.kind || 'expense') !== 'income');

  return (
    <Section title="Budget">
      <div className="wr-reg-stats">
        <span className="wr-chip is-good">{money(income)} income</span>
        <span className="wr-chip is-over">{money(expense)} expenses</span>
        <span className={`wr-chip ${net < 0 ? 'is-over' : 'is-good'}`}>{money(net)} net</span>
        {projectedIncome > 0 && <span className="wr-chip">{money(projectedIncome)} projected ({attendeeCount} × cost)</span>}
      </div>

      <div className="wr-tab-edit-head">
        {editing ? (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(false)}>✓ Done</button>
        ) : (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
        )}
      </div>

      {editing && <button type="button" className="app-btn ghost wr-add-btn" onClick={addItem}>+ Add line item</button>}

      {budgetItems.length === 0 ? (
        <Empty text="No line items yet — add registration income and expenses like venue, food, speaker honorarium, and swag." />
      ) : editing ? (
        <div className="wr-budget-card-list">
          {budgetItems.map(b => (
            <div key={b.id} className="wr-budget-card">
              <Row>
                <Field label="Type">
                  <select className="ys-inp" value={b.kind || 'expense'} onChange={e => updateItem(b.id, { kind: e.target.value })}>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className="ys-inp" value={b.paidStatus || 'pending'} onChange={e => updateItem(b.id, { paidStatus: e.target.value })}>
                    {BUDGET_STATUS_ORDER.map(id => <option key={id} value={id}>{BUDGET_STATUS_META[id].icon} {BUDGET_STATUS_META[id].label}</option>)}
                  </select>
                </Field>
              </Row>
              <Row>
                <Field label="Category">
                  <input type="text" className="ys-inp" value={b.category || ''} onChange={e => updateItem(b.id, { category: e.target.value })} placeholder="e.g. Venue" />
                </Field>
                <Field label="Description">
                  <input type="text" className="ys-inp" value={b.label || ''} onChange={e => updateItem(b.id, { label: e.target.value })} placeholder="What this line item is for" />
                </Field>
              </Row>
              <Row>
                <Field label="Vendor / payee">
                  <input type="text" className="ys-inp" value={b.vendor || ''} onChange={e => updateItem(b.id, { vendor: e.target.value })} placeholder="Who it's paid to/from" />
                </Field>
                <Field label="Amount">
                  <input type="number" min="0" step="0.01" className="ys-inp" value={b.amount || ''} onChange={e => updateItem(b.id, { amount: e.target.value })} placeholder="0.00" />
                </Field>
              </Row>
              <Field label="Due date">
                <input type="date" className="ys-inp" value={b.dueDate || ''} onChange={e => updateItem(b.id, { dueDate: e.target.value })} />
              </Field>
              <Field label="Notes">
                <input type="text" className="ys-inp" value={b.notes || ''} onChange={e => updateItem(b.id, { notes: e.target.value })} placeholder="Notes" />
              </Field>
              <div className="wr-day-del-row">
                <button type="button" className="wr-row-del" onClick={() => removeItem(b.id)} title="Remove line item">✕ Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <BudgetGroupView title="Income" items={incomeItems} today={today} />
          <BudgetGroupView title="Expenses" items={expenseItems} today={today} />
        </>
      )}
    </Section>
  );
}

/* Read-only grouped budget table — one per kind (income/expenses),
   with an overdue flag on anything past its due date and still
   pending. */
function BudgetGroupView({ title, items, today }) {
  if (items.length === 0) return null;
  return (
    <div className="wr-budget-group">
      <div className="wr-budget-group-title">{title}</div>
      <div className="wr-budget-table">
        <div className="wr-budget-table-head">
          <span>Category</span>
          <span>Description</span>
          <span>Vendor</span>
          <span>Due</span>
          <span>Status</span>
          <span>Amount</span>
        </div>
        {items.map(b => {
          const status = BUDGET_STATUS_META[b.paidStatus || 'pending'] || BUDGET_STATUS_META.pending;
          const overdue = b.dueDate && b.dueDate < today && (b.paidStatus || 'pending') !== 'paid';
          return (
            <div key={b.id} className="wr-budget-table-row">
              <span>{b.category || '—'}</span>
              <span>{b.label || '—'}{b.notes && <span className="wr-budget-row-notes"> · {b.notes}</span>}</span>
              <span>{b.vendor || '—'}</span>
              <span>{b.dueDate || '—'}</span>
              <span className={`wr-badge status-${overdue ? 'partial' : b.paidStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                {overdue ? '⚠️ Overdue' : `${status.icon} ${status.label}`}
              </span>
              <span className="wr-budget-table-amt">{money(b.amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Team ────────────────────────────────────────────────────── */
function TeamTab({ team, allWomen, onChange }) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');

  const addMember = (patch = {}) => {
    onChange({ team: [...team, { id: makeId('mem'), name: '', role: '', phone: '', notes: '', ...patch }] });
  };
  const updateMember = (id, patch) => onChange({ team: team.map(m => m.id === id ? { ...m, ...patch } : m) });
  const removeMember = (id) => onChange({ team: team.filter(m => m.id !== id) });

  /* Live substring match against All Women — picking a result adds
     her by name and auto-fills her phone if it's on file, same
     search-to-add pattern Prayer Groups uses for roster members. */
  const q = search.trim().toLowerCase();
  const results = q ? (allWomen || []).filter(w => (w.name || '').trim() && w.name.toLowerCase().includes(q)).slice(0, 6) : [];

  const addFromWoman = (woman) => {
    addMember({ name: woman.name || '', phone: woman.phone || '' });
    setSearch('');
  };
  const addManual = () => {
    const val = search.trim();
    if (!val) return;
    addMember({ name: val });
    setSearch('');
  };

  return (
    <Section title="Volunteer team">
      <div className="wr-tab-edit-head">
        {editing ? (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(false)}>✓ Done</button>
        ) : (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
        )}
      </div>

      {editing && (
        <div className="wr-team-add">
          <div className="wr-team-search-row">
            <input
              type="text"
              className="ys-inp"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results.length === 0) addManual(); } }}
              placeholder="Search All Women or type a name to add…"
            />
            <button type="button" className="app-btn ghost wr-add-btn" disabled={!search.trim()} onClick={addManual}>+ Add</button>
          </div>
          {search.trim() && (
            <ul className="wr-team-search-results">
              {results.length === 0 ? (
                <li className="wr-team-search-empty">No match in All Women — “{search.trim()}” will be added as a new, unlinked member.</li>
              ) : (
                results.map(w => (
                  <li key={w.id} className="wr-team-search-result-row">
                    <span className="wr-att-name">{w.name}</span>
                    {w.phone && <span className="wr-team-search-phone">📞 {w.phone}</span>}
                    <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => addFromWoman(w)}>+ Add</button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {team.length === 0 ? (
        <Empty text="No team members yet — assign who's running check-in, worship, decor, hospitality, and more." />
      ) : editing ? (
        <div className="wr-team-list">
          {team.map(m => (
            <div key={m.id} className="wr-team-row">
              <input type="text" className="ys-inp" value={m.name || ''} onChange={e => updateMember(m.id, { name: e.target.value })} placeholder="Name" />
              <input type="text" className="ys-inp" value={m.role || ''} onChange={e => updateMember(m.id, { role: e.target.value })} placeholder="Role (e.g. Check-in lead)" />
              <input type="text" className="ys-inp" value={m.phone || ''} onChange={e => updateMember(m.id, { phone: e.target.value })} placeholder="Phone" />
              <input type="text" className="ys-inp" value={m.notes || ''} onChange={e => updateMember(m.id, { notes: e.target.value })} placeholder="Notes" />
              <button type="button" className="wr-row-del" onClick={() => removeMember(m.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="wr-team-view-list">
          {team.map(m => (
            <div key={m.id} className="wr-team-view-row">
              <span className="wr-team-view-name">{m.name || '(no name)'}</span>
              {m.role && <span className="wr-team-view-role">{m.role}</span>}
              {m.phone && <span className="wr-team-view-phone">📞 {m.phone}</span>}
              {m.notes && <span className="wr-team-view-notes">📝 {m.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── Packing list ────────────────────────────────────────────── */
function PackingTab({ packingItems, onChange }) {
  const [editing, setEditing] = useState(false);
  const addItem = () => onChange({ packingItems: [...packingItems, { id: makeId('pac'), text: '', category: '', checked: false }] });
  const updateItem = (id, patch) => onChange({ packingItems: packingItems.map(p => p.id === id ? { ...p, ...patch } : p) });
  const removeItem = (id) => onChange({ packingItems: packingItems.filter(p => p.id !== id) });
  const resetDefaults = () => onChange({ packingItems: DEFAULT_PACKING_ITEMS.map(d => ({ id: makeId('pac'), checked: false, ...d })) });
  const toggleChecked = (id) => onChange({ packingItems: packingItems.map(p => p.id === id ? { ...p, checked: !p.checked } : p) });

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const item of packingItems) {
      const cat = item.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(item);
    }
    return [...groups.entries()];
  }, [packingItems]);

  const checkedCount = packingItems.filter(p => p.checked).length;

  return (
    <Section title="Packing list — what to bring">
      <div className="wr-tab-edit-head">
        {!editing && packingItems.length > 0 && (
          <span className="wr-chip">{checkedCount} / {packingItems.length} packed</span>
        )}
        {editing ? (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(false)}>✓ Done</button>
        ) : (
          <button type="button" className="app-btn ghost wr-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
        )}
      </div>

      {editing && (
        <div className="wr-packing-actions">
          <button type="button" className="app-btn ghost wr-add-btn" onClick={addItem}>+ Add item</button>
          <button type="button" className="app-btn ghost wr-add-btn" onClick={resetDefaults}>↻ Reset to default list</button>
        </div>
      )}

      {packingItems.length === 0 ? (
        <Empty text="No items yet — build a shareable checklist, or reset to a sensible default list to start." />
      ) : editing ? (
        <div className="wr-packing-groups">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="wr-packing-group">
              <div className="wr-packing-group-title">{cat}</div>
              {items.map(item => (
                <div key={item.id} className="wr-packing-row">
                  <input type="text" className="ys-inp" value={item.text || ''} onChange={e => updateItem(item.id, { text: e.target.value })} placeholder="Item" />
                  <input type="text" className="ys-inp wr-packing-cat" value={item.category || ''} onChange={e => updateItem(item.id, { category: e.target.value })} placeholder="Category" />
                  <button type="button" className="wr-row-del" onClick={() => removeItem(item.id)} title="Remove">✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="wr-packing-groups">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="wr-packing-group">
              <div className="wr-packing-group-title">{cat}</div>
              {items.map(item => (
                <label key={item.id} className={`wr-packing-check-row${item.checked ? ' is-checked' : ''}`}>
                  <input type="checkbox" checked={!!item.checked} onChange={() => toggleChecked(item.id)} />
                  <span>{item.text || '(untitled item)'}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </Section>
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
  return <div className="wr-empty-hint">{text}</div>;
}
function ViewRow({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function ViewField({ label, value, placeholder, italic, block, hero, icon }) {
  const hasValue = value !== undefined && value !== null && value !== '';
  if (hero) {
    return (
      <div className="wr-view-hero">
        <span className={`wr-view-hero-val${hasValue ? '' : ' is-empty'}`}>
          {hasValue ? `“${value}”` : placeholder}
        </span>
      </div>
    );
  }
  return (
    <div className={`wr-view-field${block ? ' is-block' : ''}`}>
      {label && <span className="wr-view-field-lbl">{icon ? `${icon} ` : ''}{label}</span>}
      <span className={`wr-view-field-val${hasValue ? '' : ' is-empty'}${italic && hasValue ? ' is-italic' : ''}`}>
        {hasValue ? value : placeholder}
      </span>
    </div>
  );
}
