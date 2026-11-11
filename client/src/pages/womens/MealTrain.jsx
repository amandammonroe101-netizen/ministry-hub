import { useEffect, useMemo, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { mealTrainService } from '../../services/mealTrainService';
import { useUserStoreKey } from '../../lib/userStore';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-card-grid/.wa-stats-bar/.wa-controls…) from AllWomen.css, the
   .ys-* form primitives from the Youth roster, and the day-accordion /
   row-list bits (.wr-day*, .wr-team-list, .wr-checkbox-row, .wr-row-del…)
   from Retreats.css — same pattern Retreats/Conferences follow. Only the
   meal-train-specific card + view bits below are scoped here, prefix .mt-*.
   Wrapping the page body in .wa-root (see the return below) is what
   pulls in AllWomen.css's rose-gold-emboss + cursive theme for those
   shared classes, matching Life Stages/All Women; MealTrain.css layers
   its own rose-gold pass on top for the .mt- and reused .wr- bits
   unique to this page. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Retreats.css';
import './MealTrain.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Meal Train

   Level 1: card catalog — recipient, situation category, status,
   date range, coordinator, and how many delivery days are filled
   vs. still open.

   Level 2: clicking a card drills into a dedicated in-page view.
   Every section below stacks as its own panel in one continuous
   scroll — no tab switching — matching Life Stages' dashboard /
   groups / roster layout:
     Overview      — recipient, category, coordinator, dates,
                     contact info, drop-off instructions, household
                     size, meal-time preference, allergies/dietary
                     notes, situation description
     Calendar      — day-by-day delivery schedule; each day can be
                     assigned to a volunteer (picked from the
                     Women's directory or entered free text), with
                     a meal description and open/claimed/delivered
                     status
     Volunteers    — the standing pool of people who've offered to
                     help this family, independent of a specific day
     Communication — reminder / thank-you note log
     Notes         — running coordinator notes log

   An allergy/dietary banner renders above these panels on every
   view whenever the recipient has restrictions on file — the one
   detail that actually matters for safety shouldn't be buried in a
   scroll.

   Storage: one Firestore doc per train at
   /users/{uid}/womens-meal-trains/{id} (mealTrainService.js) —
   everything above is embedded on that doc since none of it is
   queried across trains.
   ───────────────────────────────────────────────────────────── */

const CATEGORY_META = {
  baby:        { label: 'New Baby',          icon: '👶' },
  surgery:     { label: 'Surgery / Illness',  icon: '🏥' },
  bereavement: { label: 'Bereavement',        icon: '💔' },
  crisis:      { label: 'Crisis',             icon: '🆘' },
  other:       { label: 'Other',              icon: '💝' },
};
const CATEGORY_ORDER = ['baby', 'surgery', 'bereavement', 'crisis', 'other'];

const STATUS_META = {
  planning:  { label: 'Planning',  icon: '📝' },
  active:    { label: 'Active',    icon: '🟢' },
  paused:    { label: 'Paused',    icon: '⏸️' },
  completed: { label: 'Completed', icon: '✅' },
};
const STATUS_ORDER = ['planning', 'active', 'paused', 'completed'];
const STATUS_FILTERS = [{ id: 'all', label: 'All' }, ...STATUS_ORDER.map(id => ({ id, label: STATUS_META[id].label }))];

const SLOT_META = {
  open:      { label: 'Open',      icon: '⭕' },
  claimed:   { label: 'Claimed',   icon: '🟡' },
  delivered: { label: 'Delivered', icon: '✅' },
};
const SLOT_ORDER = ['open', 'claimed', 'delivered'];

const TABS = [
  { key: 'overview',      label: 'Overview',      icon: 'ℹ️' },
  { key: 'calendar',      label: 'Calendar',      icon: '📅' },
  { key: 'volunteers',    label: 'Volunteers',    icon: '🙋' },
  { key: 'communication', label: 'Communication', icon: '💬' },
  { key: 'notes',         label: 'Notes',         icon: '📝' },
];

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const dateRange = (start, end) => {
  if (!start && !end) return '';
  if (start && end && start !== end) return `${start} → ${end}`;
  return start || end;
};
const addDaysIso = (iso, days) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function MealTrain() {
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [women] = useUserStoreKey('womens:women', []);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    mealTrainService.getAll()
      .then(res => { if (alive) setTrains(Array.isArray(res?.data?.data) ? res.data.data : []); })
      .catch(err => { if (alive) setLoadErr(err?.message || 'Could not load meal trains.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const list = trains;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(t =>
          (t.recipientName || '').toLowerCase().includes(q) ||
          (t.coordinator || '').toLowerCase().includes(q) ||
          (t.address || '').toLowerCase().includes(q))
      : list;
    if (statusFilter !== 'all') out = out.filter(t => (t.status || 'planning') === statusFilter);
    return [...out].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  }, [list, query, statusFilter]);

  const openTrain = useMemo(() => list.find(t => t.id === openId) || null, [list, openId]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekAhead = useMemo(() => addDaysIso(today, 7), [today]);
  const stats = useMemo(() => {
    let openSoon = 0;
    let delivered = 0;
    for (const t of list) {
      for (const d of (t.schedule || [])) {
        if (d.status === 'delivered') delivered++;
        if ((d.status || 'open') === 'open' && d.date && d.date >= today && d.date <= weekAhead) openSoon++;
      }
    }
    return {
      total:  list.length,
      active: list.filter(t => (t.status || 'planning') === 'active').length,
      openSoon,
      delivered,
    };
  }, [list, today, weekAhead]);

  const addTrain = async () => {
    const res = await mealTrainService.create({});
    const t = res?.data?.data;
    if (!t) return;
    setTrains(prev => [...prev, t]);
    setOpenId(t.id);
  };

  const updateTrain = (id, patch) => {
    setTrains(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    mealTrainService.update(id, patch).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[MealTrain] Failed to save:', err);
    });
  };

  const removeTrain = (id) => {
    setTrains(prev => prev.filter(t => t.id !== id));
    if (openId === id) setOpenId(null);
    mealTrainService.delete(id).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[MealTrain] Failed to delete:', err);
    });
  };

  return (
    <WomensShell
      title="Meal Train"
      icon="🍲"
      subtitle="Coordinate meal trains for new moms, surgery recovery, bereavement, and crisis — sign-up calendar, allergy notes, and drop-off instructions."
      actions={
        !openTrain && !loading && (
          <button type="button" className="wms-btn primary" onClick={addTrain}>
            ✦ New meal train
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root">
      {loading ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🍲</div>
              <div className="app-empty-title">Loading meal trains…</div>
            </div>
          ) : loadErr ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">⚠️</div>
              <div className="app-empty-title">Couldn't load meal trains</div>
              <div className="app-empty-sub">{loadErr}</div>
            </div>
          ) : openTrain ? (
            <MealTrainView
              train={openTrain}
              women={women}
              onChange={(patch) => updateTrain(openTrain.id, patch)}
              onDelete={() => removeTrain(openTrain.id)}
              onBack={() => setOpenId(null)}
            />
          ) : list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">🍲</div>
              <div className="app-empty-title">No meal trains yet</div>
              <div className="app-empty-sub">
                Start one for a new mom, surgery recovery, bereavement, or
                crisis — recipient info and drop-off instructions first,
                then build out the delivery calendar and volunteer pool.
              </div>
              <button type="button" className="app-btn primary" onClick={addTrain}>
                ✦ Start your first meal train
              </button>
            </div>
          ) : (
            <div className="wa-directory">
              <div className="wa-stats-bar">
                <div className="wa-stat">
                  <span className="wa-stat-n">{stats.total}</span>
                  <span className="wa-stat-lbl">Meal trains</span>
                </div>
                <div className="wa-stat">
                  <span className="wa-stat-n">{stats.active}</span>
                  <span className="wa-stat-lbl">Active</span>
                </div>
                <div className="wa-stat">
                  <span className="wa-stat-n">{stats.delivered}</span>
                  <span className="wa-stat-lbl">Meals delivered</span>
                </div>
                {stats.openSoon > 0 && (
                  <div className="wa-stat is-warn">
                    <span className="wa-stat-n">{stats.openSoon}</span>
                    <span className="wa-stat-lbl">Open slots this week</span>
                  </div>
                )}
              </div>

              <div className="wa-controls">
                <div className="wa-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search by recipient, coordinator, address…"
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
                  {query ? `No meal trains match "${query}".` : 'No meal trains match this filter.'}
                </div>
              ) : (
                <div className="wa-card-grid">
                  {visible.map(t => (
                    <MealTrainCard key={t.id} train={t} onClick={() => setOpenId(t.id)} />
                  ))}
                </div>
              )}
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

/* Delivery progress rendered as a little train chugging along a
   track — the engine's position along the rail reflects filled/total
   days, so progress reads as "how far the train has traveled" rather
   than a plain fraction. Used on both the directory card and the
   drill-in header. */
function TrainProgress({ filled, total, size = 'md' }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (filled / total) * 100)) : 0;
  return (
    <div
      className={`mt-progress mt-progress-${size}`}
      role="img"
      aria-label={`${filled} of ${total || 0} days filled`}
    >
      <div className="mt-progress-track">
        <div className="mt-progress-rail" />
        <div className="mt-progress-fill" style={{ width: `${pct}%` }} />
        <span className="mt-progress-engine" style={{ left: `${pct}%` }}>🚂</span>
      </div>
      <span className="mt-progress-label">{filled} / {total || 0} days</span>
    </div>
  );
}

/* ── Directory card ─────────────────────────────────────────── */
function MealTrainCard({ train, onClick }) {
  const status = train.status || 'planning';
  const sMeta = STATUS_META[status] || STATUS_META.planning;
  const category = train.category || 'other';
  const cMeta = CATEGORY_META[category] || CATEGORY_META.other;
  const schedule = train.schedule || [];
  const filled = schedule.filter(d => (d.status || 'open') !== 'open').length;
  const openCount = schedule.length - filled;

  return (
    <button type="button" className="mt-card" onClick={onClick}>
      <div className="mt-card-top">
        <span className="mt-card-title">{train.recipientName || '(untitled meal train)'}</span>
        <span className={`mt-badge status-${status}`}>{sMeta.icon} {sMeta.label}</span>
      </div>
      <div className="mt-card-line"><span className="mt-cat-chip">{cMeta.icon} {cMeta.label}</span></div>
      {dateRange(train.startDate, train.endDate) && (
        <div className="mt-card-line">📅 {dateRange(train.startDate, train.endDate)}</div>
      )}
      {train.coordinator && <div className="mt-card-line">🙋 Coordinated by {train.coordinator}</div>}
      {train.allergies && <div className="mt-card-line mt-card-allergy">⚠️ {train.allergies}</div>}
      <div className="mt-card-foot">
        <TrainProgress filled={filled} total={schedule.length} size="sm" />
        {openCount > 0 && <span className="mt-card-chip is-over">{openCount} open</span>}
      </div>
    </button>
  );
}

/* ── Level 2: dedicated meal train drill-in ─────────────────── */
function MealTrainView({ train, women, onChange, onDelete, onBack }) {
  const [tab, setTab] = useState('overview');
  const [confirmDel, setConfirmDel] = useState(false);
  const schedule = Array.isArray(train.schedule) ? train.schedule : [];
  const volunteers = Array.isArray(train.volunteers) ? train.volunteers : [];
  const reminders = Array.isArray(train.reminders) ? train.reminders : [];
  const notesLog = Array.isArray(train.notesLog) ? train.notesLog : [];

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const category = train.category || 'other';
  const cMeta = CATEGORY_META[category] || CATEGORY_META.other;
  const filled = schedule.filter(d => (d.status || 'open') !== 'open').length;
  const openSlots = schedule.length - filled;

  const today = new Date().toISOString().slice(0, 10);
  const daysUntilStart = train.startDate
    ? Math.round((new Date(train.startDate) - new Date(today)) / 86400000)
    : null;
  const dayTier = daysUntilStart == null ? 'none' : daysUntilStart < 0 ? 'bad' : daysUntilStart <= 7 ? 'warn' : 'good';

  return (
    <div className="mt-view">
      <button type="button" className="mt-view-back" onClick={onBack}>← All Meal Trains</button>

      <div className="mt-view-head">
        <span className="mt-view-icon">🍲</span>
        <input
          type="text"
          className="ys-inp mt-title-inp mt-view-title-inp"
          value={train.recipientName || ''}
          onChange={set('recipientName')}
          placeholder="Recipient name"
        />
        <select className="ys-inp mt-view-status-sel" value={train.status || 'planning'} onChange={set('status')}>
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

      <div className="mt-view-meta">
        <span className="mt-chip">{cMeta.icon} {cMeta.label}</span>
        {dateRange(train.startDate, train.endDate) && <span className="mt-chip">📅 {dateRange(train.startDate, train.endDate)}</span>}
        {train.coordinator && <span className="mt-chip">🙋 {train.coordinator}</span>}
        <TrainProgress filled={filled} total={schedule.length} size="md" />
      </div>

      {train.allergies && (
        <div className="mt-allergy-banner">
          <span className="mt-allergy-icon">⚠️</span>
          <span><strong>Allergies / dietary restrictions:</strong> {train.allergies}</span>
        </div>
      )}

      <div className="wr-dash-row mt-dash-row">
        <div className="wr-dash-stat">
          <span className="wr-dash-n">{filled} / {schedule.length}</span>
          <span className="wr-dash-lbl">Days filled</span>
        </div>
        <div className={`wr-dash-stat ${openSlots > 0 ? 'is-over' : 'is-good'}`}>
          <span className="wr-dash-n">{openSlots}</span>
          <span className="wr-dash-lbl">Open slots</span>
        </div>
        <div className="wr-dash-stat">
          <span className="wr-dash-n">{volunteers.length}</span>
          <span className="wr-dash-lbl">Volunteer pool</span>
        </div>
        <div className={`wr-dash-stat is-days tier-${dayTier}`}>
          <span className="wr-dash-n">{daysUntilStart == null ? '—' : Math.abs(daysUntilStart)}</span>
          <span className="wr-dash-lbl">{daysUntilStart == null ? 'No start date' : daysUntilStart < 0 ? 'Days since start' : 'Days until start'}</span>
        </div>
      </div>

      <nav className="wr-tabs" role="tablist" aria-label="Meal train views">
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
            {t.key === 'calendar' && schedule.length > 0 && <span className="wr-tab-badge">{schedule.length}</span>}
            {t.key === 'volunteers' && volunteers.length > 0 && <span className="wr-tab-badge">{volunteers.length}</span>}
            {t.key === 'communication' && reminders.length > 0 && <span className="wr-tab-badge">{reminders.length}</span>}
            {t.key === 'notes' && notesLog.length > 0 && <span className="wr-tab-badge">{notesLog.length}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-view-body">
        {tab === 'overview' && <OverviewTab train={train} set={set} />}
        {tab === 'calendar' && <CalendarTab schedule={schedule} women={women} onChange={onChange} />}
        {tab === 'volunteers' && <VolunteersTab volunteers={volunteers} women={women} onChange={onChange} />}
        {tab === 'communication' && <CommunicationTab reminders={reminders} onChange={onChange} />}
        {tab === 'notes' && <NotesTab notesLog={notesLog} onChange={onChange} />}
      </div>
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────── */
function OverviewTab({ train, set }) {
  return (
    <>
      <Section title="Recipient & situation">
        <Field label="Recipient / family name">
          <input type="text" className="ys-inp" value={train.recipientName || ''} onChange={set('recipientName')} placeholder="e.g. The Johnson Family" />
        </Field>
        <Row>
          <Field label="Category">
            <select className="ys-inp" value={train.category || 'baby'} onChange={set('category')}>
              {CATEGORY_ORDER.map(id => <option key={id} value={id}>{CATEGORY_META[id].icon} {CATEGORY_META[id].label}</option>)}
            </select>
          </Field>
          <Field label="Coordinator">
            <input type="text" className="ys-inp" value={train.coordinator || ''} onChange={set('coordinator')} placeholder="Who's organizing this train" />
          </Field>
        </Row>
        <Row>
          <Field label="Start date">
            <input type="date" className="ys-inp" value={train.startDate || ''} onChange={set('startDate')} />
          </Field>
          <Field label="End date">
            <input type="date" className="ys-inp" value={train.endDate || ''} onChange={set('endDate')} />
          </Field>
        </Row>
        <Field label="Situation / description">
          <textarea
            className="ys-inp ys-textarea"
            rows={3}
            placeholder="What's going on, any context helpful to volunteers…"
            value={train.description || ''}
            onChange={set('description')}
          />
        </Field>
      </Section>

      <Section title="Contact & delivery">
        <Row>
          <Field label="Contact phone">
            <input type="text" className="ys-inp" value={train.contactPhone || ''} onChange={set('contactPhone')} />
          </Field>
          <Field label="Contact email">
            <input type="email" className="ys-inp" value={train.contactEmail || ''} onChange={set('contactEmail')} />
          </Field>
        </Row>
        <Field label="Address / drop-off location">
          <input type="text" className="ys-inp" value={train.address || ''} onChange={set('address')} placeholder="Street address" />
        </Field>
        <Field label="Drop-off instructions">
          <textarea
            className="ys-inp ys-textarea"
            rows={2}
            placeholder="Gate code, porch, ring bell or not, pets, parking…"
            value={train.dropOffInstructions || ''}
            onChange={set('dropOffInstructions')}
          />
        </Field>
        <Row>
          <Field label="Household size">
            <input type="number" min="0" className="ys-inp" value={train.householdSize || ''} onChange={set('householdSize')} placeholder="# of people to feed" />
          </Field>
          <Field label="Preferred meal time">
            <input type="text" className="ys-inp" value={train.mealTimePreference || ''} onChange={set('mealTimePreference')} placeholder="e.g. Dinner, 5–6pm" />
          </Field>
        </Row>
      </Section>

      <Section title="Dietary & allergies">
        <Field label="Allergies / restrictions">
          <input
            type="text"
            className="ys-inp mt-allergy-inp"
            value={train.allergies || ''}
            onChange={set('allergies')}
            placeholder="e.g. peanut allergy, gluten-free — shown as a banner above every panel"
          />
        </Field>
        <Field label="Additional dietary notes">
          <textarea
            className="ys-inp ys-textarea"
            rows={2}
            placeholder="Preferences, dislikes, favorite meals to bring…"
            value={train.dietaryNotes || ''}
            onChange={set('dietaryNotes')}
          />
        </Field>
      </Section>
    </>
  );
}

/* ── Calendar ────────────────────────────────────────────────── */
function CalendarTab({ schedule, women, onChange }) {
  const sorted = useMemo(() => [...schedule].sort((a, b) => (a.date || '').localeCompare(b.date || '')), [schedule]);
  const [expandedId, setExpandedId] = useState(sorted[0]?.id || null);
  const [confirmDelId, setConfirmDelId] = useState(null);

  const addDay = () => {
    const d = {
      id: makeId('day'), date: '', mealTime: '', volunteerId: '',
      volunteerName: '', volunteerPhone: '', volunteerEmail: '',
      meal: '', status: 'open', notes: '',
    };
    onChange({ schedule: [...schedule, d] });
    setExpandedId(d.id);
  };
  const updateDay = (id, patch) => onChange({ schedule: schedule.map(d => d.id === id ? { ...d, ...patch } : d) });
  const removeDay = (id) => {
    onChange({ schedule: schedule.filter(d => d.id !== id) });
    if (expandedId === id) setExpandedId(null);
  };
  const pickVolunteer = (day, womanId) => {
    if (!womanId) { updateDay(day.id, { volunteerId: '' }); return; }
    const w = (women || []).find(w => w.id === womanId);
    if (!w) return;
    updateDay(day.id, {
      volunteerId: w.id,
      volunteerName: w.name || '',
      volunteerPhone: w.phone || '',
      volunteerEmail: w.email || '',
      status: day.status === 'open' ? 'claimed' : day.status,
    });
  };

  const openCount = sorted.filter(d => (d.status || 'open') === 'open').length;

  return (
    <Section title="Delivery calendar">
      <div className="wr-reg-stats">
        <span className="mt-chip">{sorted.length} day{sorted.length === 1 ? '' : 's'} scheduled</span>
        {openCount > 0 && <span className="mt-chip is-over">{openCount} still need a volunteer</span>}
      </div>

      <button type="button" className="app-btn ghost wr-add-btn" onClick={addDay}>+ Add delivery day</button>

      {sorted.length === 0 ? (
        <Empty text="No delivery days added yet — add each day a meal is needed, then assign a volunteer to it." />
      ) : (
        <>
          <div className="mt-track-cap">
            <span className="mt-track-cap-icon">🚂</span> Start of the route
          </div>
          <div className="mt-track-list">
            {sorted.map((day, i) => {
              const open = expandedId === day.id;
              const armed = confirmDelId === day.id;
              const sMeta = SLOT_META[day.status || 'open'] || SLOT_META.open;
              const isLast = i === sorted.length - 1;
              return (
                <div key={day.id} className={`mt-track-row${isLast ? ' is-last' : ''}`}>
                  <div className="mt-track-node-col">
                    <span className={`mt-track-node status-${day.status || 'open'}`}>{sMeta.icon}</span>
                  </div>
                  <div className={`wr-day${open ? ' open' : ''}`}>
                    <button type="button" className="wr-day-head" onClick={() => setExpandedId(open ? null : day.id)}>
                      <span className="wr-day-date">{day.date || 'No date'}</span>
                      <span className="wr-day-label">{day.volunteerName || 'Needs a volunteer'}{day.mealTime ? ` — ${day.mealTime}` : ''}</span>
                      <span className={`mt-badge status-${day.status || 'open'}`}>{sMeta.icon} {sMeta.label}</span>
                      <span className="wr-chevron">▶</span>
                    </button>
                    {open && (
                      <div className="wr-day-body">
                        <Row>
                          <Field label="Date">
                            <input type="date" className="ys-inp" value={day.date || ''} onChange={e => updateDay(day.id, { date: e.target.value })} />
                          </Field>
                          <Field label="Meal time">
                            <input type="text" className="ys-inp" value={day.mealTime || ''} onChange={e => updateDay(day.id, { mealTime: e.target.value })} placeholder="e.g. Dinner, 5:30pm" />
                          </Field>
                        </Row>

                        <Field label="Assign a volunteer from the directory">
                          <select className="ys-inp" value={day.volunteerId || ''} onChange={e => pickVolunteer(day, e.target.value)}>
                            <option value="">— Pick from Women's directory (optional) —</option>
                            {(women || []).map(w => <option key={w.id} value={w.id}>{w.name || '(unnamed)'}</option>)}
                          </select>
                        </Field>
                        <Row>
                          <Field label="Volunteer name">
                            <input type="text" className="ys-inp" value={day.volunteerName || ''} onChange={e => updateDay(day.id, { volunteerName: e.target.value })} placeholder="Name (editable even if picked above)" />
                          </Field>
                          <Field label="Volunteer phone">
                            <input type="text" className="ys-inp" value={day.volunteerPhone || ''} onChange={e => updateDay(day.id, { volunteerPhone: e.target.value })} />
                          </Field>
                        </Row>
                        <Row>
                          <Field label="Volunteer email">
                            <input type="email" className="ys-inp" value={day.volunteerEmail || ''} onChange={e => updateDay(day.id, { volunteerEmail: e.target.value })} />
                          </Field>
                          <Field label="Status">
                            <select className="ys-inp" value={day.status || 'open'} onChange={e => updateDay(day.id, { status: e.target.value })}>
                              {SLOT_ORDER.map(id => <option key={id} value={id}>{SLOT_META[id].icon} {SLOT_META[id].label}</option>)}
                            </select>
                          </Field>
                        </Row>
                        <Field label="Meal">
                          <input type="text" className="ys-inp" value={day.meal || ''} onChange={e => updateDay(day.id, { meal: e.target.value })} placeholder="What's being brought" />
                        </Field>
                        <Field label="Notes">
                          <textarea className="ys-inp ys-textarea" rows={2} value={day.notes || ''} onChange={e => updateDay(day.id, { notes: e.target.value })} />
                        </Field>

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
                </div>
              );
            })}
          </div>
          <div className="mt-track-cap mt-track-cap-end">
            <span className="mt-track-cap-icon">🏁</span> End of the route
          </div>
        </>
      )}
    </Section>
  );
}

/* ── Volunteers ──────────────────────────────────────────────── */
function VolunteersTab({ volunteers, women, onChange }) {
  const addVolunteer = () => onChange({
    volunteers: [...volunteers, {
      id: makeId('vol'), womanId: '', name: '', phone: '', email: '',
      allergySafeConfirmed: false, notes: '',
    }],
  });
  const updateVolunteer = (id, patch) => onChange({ volunteers: volunteers.map(v => v.id === id ? { ...v, ...patch } : v) });
  const removeVolunteer = (id) => onChange({ volunteers: volunteers.filter(v => v.id !== id) });
  const pick = (id, womanId) => {
    if (!womanId) { updateVolunteer(id, { womanId: '' }); return; }
    const w = (women || []).find(w => w.id === womanId);
    if (!w) return;
    updateVolunteer(id, { womanId: w.id, name: w.name || '', phone: w.phone || '', email: w.email || '' });
  };

  return (
    <Section title="Volunteer pool">
      <button type="button" className="app-btn ghost wr-add-btn" onClick={addVolunteer}>+ Add volunteer</button>

      {volunteers.length === 0 ? (
        <Empty text="No volunteers yet — add anyone who's offered to help, whether or not they're scheduled for a specific day." />
      ) : (
        <div className="wr-team-list">
          {volunteers.map(v => (
            <div key={v.id} className="mt-vol-row">
              <select className="ys-inp" value={v.womanId || ''} onChange={e => pick(v.id, e.target.value)}>
                <option value="">— Directory (optional) —</option>
                {(women || []).map(w => <option key={w.id} value={w.id}>{w.name || '(unnamed)'}</option>)}
              </select>
              <input type="text" className="ys-inp" value={v.name || ''} onChange={e => updateVolunteer(v.id, { name: e.target.value })} placeholder="Name" />
              <input type="text" className="ys-inp" value={v.phone || ''} onChange={e => updateVolunteer(v.id, { phone: e.target.value })} placeholder="Phone" />
              <input type="email" className="ys-inp" value={v.email || ''} onChange={e => updateVolunteer(v.id, { email: e.target.value })} placeholder="Email" />
              <label className="wr-checkbox-row mt-vol-check">
                <input type="checkbox" checked={!!v.allergySafeConfirmed} onChange={e => updateVolunteer(v.id, { allergySafeConfirmed: e.target.checked })} />
                <span>Allergy-safe confirmed</span>
              </label>
              <button type="button" className="wr-row-del" onClick={() => removeVolunteer(v.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── Communication ───────────────────────────────────────────── */
const REMINDER_TYPES = { reminder: 'Reminder', 'thank-you': 'Thank-you note' };

function CommunicationTab({ reminders, onChange }) {
  const addReminder = () => onChange({
    reminders: [...reminders, { id: makeId('rem'), type: 'reminder', date: '', note: '', sent: false }],
  });
  const updateReminder = (id, patch) => onChange({ reminders: reminders.map(r => r.id === id ? { ...r, ...patch } : r) });
  const removeReminder = (id) => onChange({ reminders: reminders.filter(r => r.id !== id) });

  return (
    <Section title="Reminders & thank-you notes">
      <button type="button" className="app-btn ghost wr-add-btn" onClick={addReminder}>+ Add reminder</button>

      {reminders.length === 0 ? (
        <Empty text="Track reminders to send before someone's delivery day, and thank-you notes to send after." />
      ) : (
        <div className="wr-team-list">
          {reminders.map(r => (
            <div key={r.id} className="mt-rem-row">
              <select className="ys-inp" value={r.type || 'reminder'} onChange={e => updateReminder(r.id, { type: e.target.value })}>
                {Object.entries(REMINDER_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <input type="date" className="ys-inp" value={r.date || ''} onChange={e => updateReminder(r.id, { date: e.target.value })} />
              <input type="text" className="ys-inp" value={r.note || ''} onChange={e => updateReminder(r.id, { note: e.target.value })} placeholder="Who / what to send" />
              <label className="wr-checkbox-row mt-vol-check">
                <input type="checkbox" checked={!!r.sent} onChange={e => updateReminder(r.id, { sent: e.target.checked })} />
                <span>Sent</span>
              </label>
              <button type="button" className="wr-row-del" onClick={() => removeReminder(r.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── Notes ───────────────────────────────────────────────────── */
function NotesTab({ notesLog, onChange }) {
  const [draft, setDraft] = useState('');

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    onChange({ notesLog: [{ id: makeId('note'), content: text, created_at: new Date().toISOString() }, ...notesLog] });
    setDraft('');
  };
  const removeNote = (id) => onChange({ notesLog: notesLog.filter(n => n.id !== id) });

  return (
    <Section title="Coordinator notes">
      <div className="mt-note-composer">
        <textarea
          className="ys-inp ys-textarea"
          rows={2}
          placeholder="Log an update — timeline change, a family request, anything the next coordinator should know…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <button type="button" className="app-btn ghost wr-add-btn" onClick={addNote}>+ Add note</button>
      </div>

      {notesLog.length === 0 ? (
        <Empty text="No notes yet." />
      ) : (
        <div className="mt-note-list">
          {notesLog.map(n => (
            <div key={n.id} className="mt-note-row">
              <div className="mt-note-body">
                <div className="mt-note-date">{new Date(n.created_at).toLocaleString()}</div>
                <div className="mt-note-text">{n.content}</div>
              </div>
              <button type="button" className="wr-row-del" onClick={() => removeNote(n.id)} title="Remove note">✕</button>
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
