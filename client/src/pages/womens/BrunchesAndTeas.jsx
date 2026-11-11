import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { fileToResizedDataUrl } from '../../lib/imageResize';
/* .ys-* form primitives (Youth roster) + .app-* shell classes
   (shared) — same reuse pattern as LifeStages.jsx. Everything else
   on this page (sidebar, overview, event panels) is purpose-built,
   sharing the .wls-* rose-gold 3D design system from LifeStages.css
   so this page looks and behaves like a sibling of Life Stages —
   sidebar + detail split — rather than the card-grid/slide-over
   pattern most other Women's sub-pages use. */
import '../youth/AllStudents.css';
import './LifeStages.css';
import './BrunchesAndTeas.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Brunches & Teas

   Sidebar + detail split, same shape as Life Stages: a nav of
   gatherings on the left (searchable/filterable), and a stacked
   detail pane on the right for whichever one is selected — event
   header, invite list & RSVPs, menu/potluck, decor & setup,
   budget, and recap, each its own raised rose-gold panel.

   Storage: 'womens:brunches' (array of event records).

   Calendar: when "Sync to Calendar" is on and a date is set, a
   single event is (re)written to the shared calendar (source
   'women-brunch-tea'), replacing this event's prior synced entry
   each time — on save, same strategy as Prayer Groups' meeting
   sync but for a one-off date instead of a recurring one.
   ───────────────────────────────────────────────────────────── */

const EVENT_TYPES = [
  { id: 'brunch',   label: 'Brunch',   icon: '🥐' },
  { id: 'tea',      label: 'Tea',      icon: '🫖' },
  { id: 'luncheon', label: 'Luncheon', icon: '🍽' },
  { id: 'shower',   label: 'Shower',   icon: '🎁' },
  { id: 'other',    label: 'Other',    icon: '✨' },
];
const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t]));

const WHEN_FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past',     label: 'Past' },
  { id: 'all',      label: 'All' },
];

const RSVP_STATUSES = [
  { id: 'pending', label: 'Pending', icon: '⏳' },
  { id: 'yes',      label: 'Yes',    icon: '✅' },
  { id: 'maybe',    label: 'Maybe',  icon: '🤔' },
  { id: 'no',       label: 'No',     icon: '✖' },
];

const CAL_SOURCE = 'women-brunch-tea';
const CAL_COLOR  = '#fbbf24'; // amber — matches the Events group accent

/* Gathering invite popups — a separate calendar source from the
   gathering itself (CAL_SOURCE above). One of these is written per
   directory invite, dated the day she was invited, and shows up as
   an actionable Accept/Decline card on the Calendar page (see
   Calendar.jsx's 'women_invite' type). Removed once a decision is
   made, either from the calendar popup or directly from the Roster
   below. */
const INVITE_CAL_SOURCE = 'women-brunch-invite';

const TIME_OPTIONS = (() => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      let h12 = h % 12; if (h12 === 0) h12 = 12;
      const period = h < 12 ? 'AM' : 'PM';
      out.push(`${h12}:${m === 0 ? '00' : '30'} ${period}`);
    }
  }
  return out;
})();

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_EVENT = () => ({
  id:             makeId('bt'),
  title:          '',
  type:           'brunch',
  date:           '',
  time:           '',
  hostName:       '',
  hostWomanId:    null,
  hostLocation:   '',
  theme:          '',
  dressCode:      '',
  capacity:       '',
  notes:          '',
  syncToCalendar: false,
  invites:        [], // [{ id, womanId, name, rsvp, plusOnes, dietary }]
  menu:           [], // [{ id, dish, assignedTo, dietary, brought }]
  decor:          [], // [{ id, text, done }]
  budgetPerPerson: '',
  budgetTarget:   '',
  budgetItems:    [], // [{ id, label, amount }]
  recapNotes:     '',
  recapPhotos:    [], // [{ id, url, caption }]
  createdAt:      Date.now(),
});

export default function BrunchesAndTeas() {
  const [events, setEvents] = useUserStoreKey('womens:brunches', []);
  const [women] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(events) ? events : [];
  const womenList = Array.isArray(women) ? women : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [whenFilter, setWhenFilter] = useState('upcoming'); // upcoming | past | all
  const [typeFilter, setTypeFilter] = useState('all');

  const syncEventCalendarFor = (event) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const marker = `${event.id}__brunch`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE && e.source_id === marker));
      if (!event.syncToCalendar || !event.date) return others;
      const meta = EVENT_TYPE_MAP[event.type] || EVENT_TYPES[0];
      const fresh = {
        id:              'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        created_at:      new Date().toISOString(),
        title:           `${meta.icon} ${event.title || meta.label}`,
        description:     event.hostLocation ? `Hosted at ${event.hostLocation}.` : '',
        event_date:      event.date,
        end_date:        '',
        event_time:      event.time || '',
        color:           CAL_COLOR,
        category:        'womens',
        source:          CAL_SOURCE,
        source_id:       marker,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      return [fresh, ...others];
    });
  };

  const removeEventCalendarFor = (eventId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE && e.source_id === `${eventId}__brunch`)
    ));
  };

  /* Write (or refresh) the Accept/Decline invite popup for one
     directory invite, dated the day she was invited. */
  const pushInviteCalendarFor = (event, invite) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const marker = `${event.id}__${invite.id}`;
      const others = evList.filter(e => !(e.source === INVITE_CAL_SOURCE && e.source_id === marker));
      const meta = EVENT_TYPE_MAP[event.type] || EVENT_TYPES[0];
      const bits = [];
      if (event.date) bits.push(`${event.date}${event.time ? ' at ' + event.time : ''}`);
      if (event.hostName) bits.push(`Hosted by ${event.hostName}`);
      if (event.hostLocation) bits.push(event.hostLocation);
      if (event.theme) bits.push(event.theme);
      const fresh = {
        id:              'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        created_at:      new Date().toISOString(),
        title:           `${meta.icon} Invite: ${event.title || meta.label}`,
        description:     `You're invited to a ${meta.label.toLowerCase()}${bits.length ? ' — ' + bits.join(' · ') : ''}.`,
        event_date:      invite.inviteDate || today(),
        end_date:        '',
        event_time:      '',
        color:           CAL_COLOR,
        category:        'womens',
        source:          INVITE_CAL_SOURCE,
        source_id:       marker,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      return [fresh, ...others];
    });
  };

  /* Clear one invite's popup — called once a decision has been made,
     whether that happened on the Calendar page or right here. */
  const removeInviteCalendarFor = (eventId, inviteId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === INVITE_CAL_SOURCE && e.source_id === `${eventId}__${inviteId}`)
    ));
  };

  /* Clear every pending invite popup for a gathering — used when the
     whole gathering is deleted so no orphaned popups linger. */
  const removeAllInviteCalendarsFor = (eventId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === INVITE_CAL_SOURCE && String(e.source_id || '').startsWith(`${eventId}__`))
    ));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const t = today();
    let out = list;
    if (q) {
      out = out.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.hostName || '').toLowerCase().includes(q) ||
        (e.hostLocation || '').toLowerCase().includes(q) ||
        (e.theme || '').toLowerCase().includes(q));
    }
    if (whenFilter === 'upcoming') out = out.filter(e => !e.date || e.date >= t);
    if (whenFilter === 'past')     out = out.filter(e => e.date && e.date < t);
    if (typeFilter !== 'all')      out = out.filter(e => e.type === typeFilter);
    return [...out].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  }, [list, query, whenFilter, typeFilter]);

  const selected = useMemo(() => list.find(e => e.id === selectedId) || null, [list, selectedId]);

  const stats = useMemo(() => {
    const t = today();
    const upcoming = list.filter(e => !e.date || e.date >= t);
    const past = list.filter(e => e.date && e.date < t);
    const yesRsvps = list.reduce((sum, e) => {
      const invites = Array.isArray(e.invites) ? e.invites : [];
      return sum + invites.filter(i => i.rsvp === 'yes').reduce((n, i) => n + 1 + (Number(i.plusOnes) || 0), 0);
    }, 0);
    return { total: list.length, upcoming: upcoming.length, past: past.length, yesRsvps };
  }, [list]);

  const addEvent = () => {
    const e = DEFAULT_EVENT();
    setEvents(prev => [...(prev || []), e]);
    setSelectedId(e.id);
  };

  const updateEvent = (id, patch) => {
    const current = list.find(e => e.id === id);
    setEvents(prev => (prev || []).map(e => e.id === id ? { ...e, ...patch } : e));
    if (!current) return;
    const merged = { ...current, ...patch };
    if (['date', 'time', 'title', 'hostLocation', 'syncToCalendar', 'type'].some(k => patch[k] !== undefined)) {
      syncEventCalendarFor(merged);
    }
  };

  const removeEvent = (id) => {
    setEvents(prev => (prev || []).filter(e => e.id !== id));
    removeEventCalendarFor(id);
    removeAllInviteCalendarsFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  return (
    <WomensShell
      title="Brunches & Teas"
      icon="🍽"
      subtitle="Smaller hospitality gatherings — RSVPs, menu, host home, decor, and per-event invite lists."
      actions={
        <button type="button" className="wms-btn primary" onClick={addEvent}>
          ✦ New gathering
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root">
        {list.length === 0 ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">🍽</div>
            <div className="app-empty-title">No brunches or teas yet</div>
            <div className="app-empty-sub">
              Add a gathering — host home, theme, invite list, menu, and decor —
              and RSVPs will track right alongside it.
            </div>
            <button type="button" className="app-btn primary" onClick={addEvent}>
              ✦ Add your first gathering
            </button>
          </div>
        ) : (
          <>
            <section className="wls-panel bt-overview">
              <div className="wls-panel-hd">
                <span className="wls-panel-icon">🍽</span>
                <h2 className="wls-panel-title">Brunches &amp; Teas</h2>
              </div>
              <div className="wls-stat-row bt-stat-row-4">
                <div className="wls-stat"><span className="wls-stat-n">{stats.total}</span><span className="wls-stat-lbl">Gatherings</span></div>
                <div className="wls-stat"><span className="wls-stat-n">{stats.upcoming}</span><span className="wls-stat-lbl">Upcoming</span></div>
                <div className="wls-stat"><span className="wls-stat-n">{stats.yesRsvps}</span><span className="wls-stat-lbl">Yes RSVPs</span></div>
                <div className="wls-stat"><span className="wls-stat-n">{stats.past}</span><span className="wls-stat-lbl">Past</span></div>
              </div>
            </section>

            <div className="wls-split">
              <GatheringSidebar
                events={visible}
                activeId={selectedId}
                onSelect={setSelectedId}
                query={query}
                onQuery={setQuery}
                whenFilter={whenFilter}
                onWhenFilter={setWhenFilter}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
              />

              <div className="wls-detail">
                {selected ? (
                  <EventDetail
                    event={selected}
                    women={womenList}
                    onChange={(patch) => updateEvent(selected.id, patch)}
                    onDelete={() => removeEvent(selected.id)}
                    onOpenWoman={openWoman}
                    onInvite={(invite) => pushInviteCalendarFor(selected, invite)}
                    onInviteResolved={(inviteId) => removeInviteCalendarFor(selected.id, inviteId)}
                  />
                ) : (
                  <div className="wls-panel bt-detail-placeholder">
                    <span className="wls-panel-icon">🍽</span>
                    <h2 className="wls-panel-title">Pick a gathering</h2>
                    <p className="wls-panel-blurb">
                      Select one from the list, or start a new one from the top of the page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
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

/* ── Gathering sidebar — searchable/filterable nav of events ─── */
function GatheringSidebar({ events, activeId, onSelect, query, onQuery, whenFilter, onWhenFilter, typeFilter, onTypeFilter }) {
  return (
    <nav className="wls-sidebar bt-sidebar" aria-label="Gatherings">
      <div className="bt-sidebar-search">
        <input
          type="text"
          className="ys-inp"
          placeholder="Search by name, host, theme…"
          value={query}
          onChange={e => onQuery(e.target.value)}
        />
      </div>

      <div className="bt-sidebar-filters">
        {WHEN_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`wls-filter-chip${whenFilter === f.id ? ' on' : ''}`}
            onClick={() => onWhenFilter(f.id)}
          >{f.label}</button>
        ))}
      </div>

      <div className="bt-sidebar-filters">
        <button
          type="button"
          className={`wls-filter-chip${typeFilter === 'all' ? ' on' : ''}`}
          onClick={() => onTypeFilter('all')}
        >All</button>
        {EVENT_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            className={`wls-filter-chip${typeFilter === t.id ? ' on' : ''}`}
            onClick={() => onTypeFilter(t.id)}
          >{t.icon}</button>
        ))}
      </div>

      <div className="wls-sidebar-list bt-sidebar-list">
        {events.length === 0 ? (
          <div className="wls-empty-note">No gatherings match.</div>
        ) : events.map(e => (
          <GatheringNode key={e.id} event={e} active={e.id === activeId} onClick={() => onSelect(e.id)} />
        ))}
      </div>
    </nav>
  );
}

function GatheringNode({ event, active, onClick }) {
  const meta = EVENT_TYPE_MAP[event.type] || EVENT_TYPES[0];
  const isPast = event.date && event.date < today();
  return (
    <button
      type="button"
      className={`wls-node vertical bt-gathering-node${active ? ' on' : ''}${isPast ? ' is-past' : ''}`}
      onClick={onClick}
    >
      <span className="wls-node-icon">{meta.icon}</span>
      <span className="bt-gathering-node-info">
        <span className="wls-node-name">{event.title || `(untitled ${meta.label.toLowerCase()})`}</span>
        <span className="bt-gathering-node-date">{event.date || 'No date'}{isPast ? ' · past' : ''}</span>
      </span>
    </button>
  );
}

/* ── Detail — stacked panels for the selected gathering ───────── */
function EventDetail({ event, women, onChange, onDelete, onOpenWoman, onInvite, onInviteResolved }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const meta = EVENT_TYPE_MAP[event.type] || EVENT_TYPES[0];
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <form className="ys-form" onSubmit={(ev) => ev.preventDefault()}>
      <div className="wls-panel bt-event-header">
        <div className="ys-form-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span className="bt-detail-icon">{meta.icon}</span>
            <input
              type="text"
              className="ys-inp bt-title-inp"
              value={event.title || ''}
              onChange={set('title')}
              placeholder={`${meta.label} name`}
            />
          </div>
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

      <DetailsSection event={event} women={women} onChange={onChange} />

      <RosterSection event={event} women={women} onChange={onChange} onOpenWoman={onOpenWoman} onInvite={onInvite} onInviteResolved={onInviteResolved} />
      <MenuSection event={event} onChange={onChange} />
      <DecorSection event={event} onChange={onChange} />
      <BudgetSection event={event} onChange={onChange} />
      <RecapSection event={event} onChange={onChange} />
    </form>
  );
}

/* ── Details ──────────────────────────────────────────────────── */
function DetailsSection({ event, women, onChange }) {
  const [editing, setEditing] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <Section title="Details" right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}>
      {editing ? (
        <>
          <Row>
            <Field label="Type">
              <select className="ys-inp" value={event.type || 'brunch'} onChange={set('type')}>
                {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </Field>
            <Field label="Capacity">
              <input type="number" min="0" className="ys-inp" value={event.capacity || ''} onChange={set('capacity')} placeholder="e.g. 20" />
            </Field>
          </Row>
          <Row>
            <Field label="Date">
              <input type="date" className="ys-inp" value={event.date || ''} onChange={set('date')} />
            </Field>
            <Field label="Time">
              <select className="ys-inp" value={event.time || ''} onChange={set('time')}>
                <option value="">Select a time…</option>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Host">
              <input
                type="text"
                className="ys-inp"
                list={`bt-host-women-${event.id}`}
                value={event.hostName || ''}
                onChange={e => {
                  const val = e.target.value;
                  const match = women.find(w => (w.name || '') === val);
                  onChange({ hostName: val, hostWomanId: match ? match.id : null });
                }}
                placeholder="Search All Women…"
              />
              <datalist id={`bt-host-women-${event.id}`}>
                {women.map(w => <option key={w.id} value={w.name} />)}
              </datalist>
            </Field>
            <Field label="Location">
              <input type="text" className="ys-inp" value={event.hostLocation || ''} onChange={set('hostLocation')} placeholder="Host home / venue" />
            </Field>
          </Row>
          <Row>
            <Field label="Theme">
              <input type="text" className="ys-inp" value={event.theme || ''} onChange={set('theme')} placeholder="e.g. Spring garden tea" />
            </Field>
            <Field label="Dress code">
              <input type="text" className="ys-inp" value={event.dressCode || ''} onChange={set('dressCode')} placeholder="e.g. Sunday best, floral" />
            </Field>
          </Row>
          <Field label="Notes">
            <textarea className="ys-inp ys-textarea" rows={2} value={event.notes || ''} onChange={set('notes')} placeholder="Anything else to remember…" />
          </Field>
          <label className="bt-sync-check">
            <input type="checkbox" checked={!!event.syncToCalendar} onChange={set('syncToCalendar')} disabled={!event.date} />
            <span>Sync to Calendar{!event.date ? ' (set a date first)' : ''}</span>
          </label>
        </>
      ) : (
        <>
          <ViewRow>
            <ViewField label="Type" value={`${EVENT_TYPE_MAP[event.type]?.icon || ''} ${EVENT_TYPE_MAP[event.type]?.label || ''}`.trim()} />
            <ViewField label="Capacity" value={event.capacity} />
          </ViewRow>
          <ViewRow>
            <ViewField label="Date" value={event.date} />
            <ViewField label="Time" value={event.time} />
          </ViewRow>
          <ViewRow>
            <ViewField label="Host" value={event.hostName} />
            <ViewField label="Location" value={event.hostLocation} />
          </ViewRow>
          <ViewRow>
            <ViewField label="Theme" value={event.theme} />
            <ViewField label="Dress code" value={event.dressCode} />
          </ViewRow>
          <ViewField label="Notes" value={event.notes} block />
          <ViewField label="Sync to Calendar" value={event.syncToCalendar ? 'On' : 'Off'} />
        </>
      )}
    </Section>
  );
}

/* ── Roster — invite list & RSVPs ──────────────────────────────
   Two ways in:
     - "Invite from directory" — an existing All Women record. Sends
       an Accept/Decline popup to the Overview Calendar dated the
       day she was invited (onInvite); accepting/declining there (or
       right here) resolves it (onInviteResolved).
     - "Add guest" (not in directory) — no calendar round-trip since
       she's not a directory profile. Lands at the top of the roster
       immediately with her own Accept/Decline buttons and an
       editable reach-out/invite date. */
function RosterSection({ event, women, onChange, onOpenWoman, onInvite, onInviteResolved }) {
  const [editing, setEditing] = useState(false);
  const [pickWomanId, setPickWomanId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestInviteDate, setGuestInviteDate] = useState(today());
  const invites = Array.isArray(event.invites) ? event.invites : [];
  const invitedWomanIds = new Set(invites.filter(i => i.womanId).map(i => i.womanId));
  const availableWomen = women.filter(w => !invitedWomanIds.has(w.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const yesCount = invites.filter(i => i.rsvp === 'yes').reduce((n, i) => n + 1 + (Number(i.plusOnes) || 0), 0);
  const rsvpMeta = (id) => RSVP_STATUSES.find(s => s.id === id) || RSVP_STATUSES[0];

  const inviteWoman = () => {
    const w = women.find(x => x.id === pickWomanId);
    if (!w) return;
    const entry = {
      id: makeId('bti'), womanId: w.id, name: w.name || '(no name)',
      rsvp: 'pending', plusOnes: 0, dietary: '',
      source: 'directory', inviteDate: today(),
    };
    onChange({ invites: [...invites, entry] });
    onInvite?.(entry);
    setPickWomanId('');
  };

  const addGuest = () => {
    const nm = guestName.trim();
    if (!nm) return;
    const entry = {
      id: makeId('bti'), womanId: null, name: nm,
      rsvp: 'pending', plusOnes: 0, dietary: '',
      phone: guestPhone.trim(), email: guestEmail.trim(),
      source: 'manual', inviteDate: guestInviteDate || today(),
    };
    onChange({ invites: [entry, ...invites] });
    setGuestName('');
    setGuestPhone('');
    setGuestEmail('');
    setGuestInviteDate(today());
  };

  const updateInvite = (id, patch) => {
    onChange({ invites: invites.map(i => i.id === id ? { ...i, ...patch } : i) });
    /* A decision made here resolves any outstanding calendar popup
       for this invite too — idempotent no-op if there isn't one. */
    if (patch.rsvp !== undefined) onInviteResolved?.(id);
  };

  const removeInvite = (id) => {
    onChange({ invites: invites.filter(i => i.id !== id) });
    onInviteResolved?.(id);
  };

  return (
    <Section
      title={`Roster (${invites.length} invited · ${yesCount} coming)`}
      right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}
    >
      {editing && (
        <Row>
          <Field label="Invite from directory">
            <div className="bt-inline-add">
              <select className="ys-inp" value={pickWomanId} onChange={e => setPickWomanId(e.target.value)}>
                <option value="">Choose a woman…</option>
                {availableWomen.map(w => <option key={w.id} value={w.id}>{w.name || '(no name)'}</option>)}
              </select>
              <button type="button" className="ys-add-btn" disabled={!pickWomanId} onClick={inviteWoman}>＋ Invite</button>
            </div>
          </Field>
          <Field label="Add guest (not in directory)">
            <div className="bt-guest-form">
              <div className="bt-inline-add">
                <input
                  type="text"
                  className="ys-inp"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }}
                  placeholder="Guest name"
                />
                <button type="button" className="ys-add-btn" disabled={!guestName.trim()} onClick={addGuest}>＋ Add</button>
              </div>
              <div className="bt-inline-add">
                <input
                  type="tel"
                  className="ys-inp bt-guest-mini-field"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="Phone number"
                />
                <input
                  type="email"
                  className="ys-inp bt-guest-mini-field"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  placeholder="Email"
                />
              </div>
              <label className="bt-invite-mini bt-reachout-field">
                <span>Reach Out:</span>
                <input
                  type="date"
                  className="ys-inp bt-mini-inp bt-guest-date-inp"
                  value={guestInviteDate}
                  onChange={e => setGuestInviteDate(e.target.value)}
                />
              </label>
            </div>
          </Field>
        </Row>
      )}

      {invites.length === 0 ? (
        <div className="wls-empty-note">No one invited yet.</div>
      ) : (
        <ul className="bt-invite-list">
          {invites.map(i => (
            <li key={i.id} className="bt-invite-row">
              <div className="bt-invite-head">
                {i.womanId ? (
                  <button type="button" className="bt-invite-name is-linked" onClick={() => onOpenWoman(i.womanId)}>
                    {i.name} →
                  </button>
                ) : (
                  <span className="bt-invite-name">{i.name}</span>
                )}
                {editing && <button type="button" className="bt-row-del" onClick={() => removeInvite(i.id)}>✕</button>}
              </div>

              {!editing && (
                <ViewRow>
                  <ViewField label="RSVP" value={`${rsvpMeta(i.rsvp).icon} ${rsvpMeta(i.rsvp).label}`} />
                  <ViewField label="+guests" value={i.plusOnes || 0} />
                  {i.dietary && <ViewField label="Dietary" value={i.dietary} />}
                  {!i.womanId && i.phone && <ViewField label="Phone" value={i.phone} />}
                  {!i.womanId && i.email && <ViewField label="Email" value={i.email} />}
                  {!i.womanId && <ViewField label="Reach Out" value={i.inviteDate} />}
                </ViewRow>
              )}

              {editing && !i.womanId && (
                <>
                  <div className="bt-inline-add">
                    <input
                      type="tel"
                      className="ys-inp bt-guest-mini-field"
                      value={i.phone || ''}
                      onChange={e => updateInvite(i.id, { phone: e.target.value })}
                      placeholder="Phone number"
                    />
                    <input
                      type="email"
                      className="ys-inp bt-guest-mini-field"
                      value={i.email || ''}
                      onChange={e => updateInvite(i.id, { email: e.target.value })}
                      placeholder="Email"
                    />
                  </div>
                  <label className="bt-invite-mini bt-reachout-field">
                    <span>Reach Out:</span>
                    <input
                      type="date"
                      className="ys-inp bt-mini-inp bt-guest-date-inp"
                      value={i.inviteDate || ''}
                      onChange={e => updateInvite(i.id, { inviteDate: e.target.value })}
                    />
                  </label>
                </>
              )}

              {editing && (
                <div className="bt-invite-controls">
                  <div className="bt-rsvp-toggle">
                    {RSVP_STATUSES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className={`bt-rsvp-btn rsvp-${s.id} ${i.rsvp === s.id ? 'on' : ''}`}
                        onClick={() => updateInvite(i.id, { rsvp: s.id })}
                      >{s.icon} {s.label}</button>
                    ))}
                  </div>
                  <label className="bt-invite-mini">
                    <span>+guests</span>
                    <input
                      type="number"
                      min="0"
                      className="ys-inp bt-mini-inp"
                      value={i.plusOnes || 0}
                      onChange={e => updateInvite(i.id, { plusOnes: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <input
                    type="text"
                    className="ys-inp bt-dietary-inp"
                    value={i.dietary || ''}
                    onChange={e => updateInvite(i.id, { dietary: e.target.value })}
                    placeholder="Dietary notes"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Menu / potluck sign-up ─────────────────────────────────── */
function MenuSection({ event, onChange }) {
  const [editing, setEditing] = useState(false);
  const [dish, setDish] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dietary, setDietary] = useState('');
  const menu = Array.isArray(event.menu) ? event.menu : [];
  const invites = Array.isArray(event.invites) ? event.invites : [];

  const addDish = () => {
    const nm = dish.trim();
    if (!nm) return;
    const entry = { id: makeId('btm'), dish: nm, assignedTo: assignedTo.trim(), dietary: dietary.trim(), brought: false };
    onChange({ menu: [...menu, entry] });
    setDish(''); setAssignedTo(''); setDietary('');
  };

  const updateDish = (id, patch) => onChange({ menu: menu.map(m => m.id === id ? { ...m, ...patch } : m) });
  const removeDish = (id) => onChange({ menu: menu.filter(m => m.id !== id) });

  return (
    <Section
      title={`Menu / potluck (${menu.length})`}
      right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}
    >
      {editing && (
        <>
          <Row>
            <Field label="Dish">
              <input type="text" className="ys-inp" value={dish} onChange={e => setDish(e.target.value)} placeholder="e.g. Quiche" />
            </Field>
            <Field label="Assigned to">
              <input
                type="text"
                className="ys-inp"
                list={`bt-menu-names-${event.id}`}
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="Who's bringing it"
              />
              <datalist id={`bt-menu-names-${event.id}`}>
                {invites.map(i => <option key={i.id} value={i.name} />)}
              </datalist>
            </Field>
          </Row>
          <Row>
            <Field label="Dietary tag">
              <input type="text" className="ys-inp" value={dietary} onChange={e => setDietary(e.target.value)} placeholder="e.g. gluten-free" />
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="ys-add-btn" disabled={!dish.trim()} onClick={addDish}>＋ Add dish</button>
            </div>
          </Row>
        </>
      )}

      {menu.length === 0 ? (
        <div className="wls-empty-note">No dishes yet.</div>
      ) : (
        <ul className="bt-menu-list">
          {menu.map(m => (
            <li key={m.id} className={`bt-menu-row ${m.brought ? 'is-brought' : ''}`}>
              {editing ? (
                <label className="bt-menu-check">
                  <input type="checkbox" checked={!!m.brought} onChange={e => updateDish(m.id, { brought: e.target.checked })} />
                </label>
              ) : (
                <span className="bt-menu-check">{m.brought ? '✅' : '⬜'}</span>
              )}
              <div className="bt-menu-info">
                <span className="bt-menu-dish">{m.dish}</span>
                <span className="bt-menu-meta">
                  {m.assignedTo || 'Unassigned'}{m.dietary ? ` · ${m.dietary}` : ''}
                </span>
              </div>
              {editing && <button type="button" className="bt-row-del" onClick={() => removeDish(m.id)}>✕</button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Decor & setup checklist ────────────────────────────────── */
function DecorSection({ event, onChange }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const decor = Array.isArray(event.decor) ? event.decor : [];
  const doneCount = decor.filter(d => d.done).length;

  const addItem = () => {
    const nm = text.trim();
    if (!nm) return;
    onChange({ decor: [...decor, { id: makeId('btd'), text: nm, done: false }] });
    setText('');
  };

  const toggleItem = (id) => onChange({ decor: decor.map(d => d.id === id ? { ...d, done: !d.done } : d) });
  const removeItem = (id) => onChange({ decor: decor.filter(d => d.id !== id) });

  return (
    <Section
      title={`Decor & setup (${doneCount}/${decor.length})`}
      right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}
    >
      {editing && (
        <Row>
          <Field label="Add item">
            <input
              type="text"
              className="ys-inp"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
              placeholder="e.g. Table linens, centerpieces, name cards…"
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="ys-add-btn" disabled={!text.trim()} onClick={addItem}>＋ Add</button>
          </div>
        </Row>
      )}

      {decor.length === 0 ? (
        <div className="wls-empty-note">Nothing on the list yet.</div>
      ) : (
        <ul className="bt-checklist">
          {decor.map(d => (
            <li key={d.id} className={`bt-checklist-row ${d.done ? 'is-done' : ''}`}>
              {editing ? (
                <label className="bt-menu-check">
                  <input type="checkbox" checked={!!d.done} onChange={() => toggleItem(d.id)} />
                </label>
              ) : (
                <span className="bt-menu-check">{d.done ? '✅' : '⬜'}</span>
              )}
              <span className="bt-checklist-text">{d.text}</span>
              {editing && <button type="button" className="bt-row-del" onClick={() => removeItem(d.id)}>✕</button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Budget ──────────────────────────────────────────────────── */
function BudgetSection({ event, onChange }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const items = Array.isArray(event.budgetItems) ? event.budgetItems : [];
  const spent = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const target = Number(event.budgetTarget) || 0;
  const remaining = target - spent;
  const pct = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0;
  const perPersonTarget = Number(event.budgetPerPerson) || 0;
  const guestCount = (Array.isArray(event.invites) ? event.invites : [])
    .filter(i => i.rsvp === 'yes').reduce((n, i) => n + 1 + (Number(i.plusOnes) || 0), 0);
  const perPersonActual = guestCount > 0 ? spent / guestCount : 0;

  const addItem = () => {
    const nm = label.trim();
    if (!nm) return;
    onChange({ budgetItems: [...items, { id: makeId('btb'), label: nm, amount: Number(amount) || 0 }] });
    setLabel(''); setAmount('');
  };

  const removeItem = (id) => onChange({ budgetItems: items.filter(i => i.id !== id) });

  return (
    <Section
      title="Budget"
      right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}
    >
      <div className="bt-budget-stats">
        <div className="bt-budget-stat">
          <span className="bt-budget-stat-n">${target.toFixed(2)}</span>
          <span className="bt-budget-stat-lbl">Target</span>
        </div>
        <div className="bt-budget-stat">
          <span className="bt-budget-stat-n">${spent.toFixed(2)}</span>
          <span className="bt-budget-stat-lbl">Spent</span>
        </div>
        <div className={`bt-budget-stat${remaining < 0 ? ' is-over' : ''}`}>
          <span className="bt-budget-stat-n">${remaining.toFixed(2)}</span>
          <span className="bt-budget-stat-lbl">{remaining < 0 ? 'Over budget' : 'Remaining'}</span>
        </div>
        <div className="bt-budget-stat">
          <span className="bt-budget-stat-n">${perPersonActual.toFixed(2)}</span>
          <span className="bt-budget-stat-lbl">Actual / guest{perPersonTarget ? ` (target $${perPersonTarget.toFixed(2)})` : ''}</span>
        </div>
      </div>

      {target > 0 && (
        <div className="bt-budget-bar">
          <div className={`bt-budget-bar-fill${remaining < 0 ? ' is-over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {editing && (
        <>
          <Row>
            <Field label="Budget target">
              <input
                type="number"
                min="0"
                step="0.01"
                className="ys-inp"
                value={event.budgetTarget || ''}
                onChange={e => onChange({ budgetTarget: e.target.value })}
                placeholder="e.g. 150.00"
              />
            </Field>
            <Field label="Cost per person (target)">
              <input
                type="number"
                min="0"
                step="0.01"
                className="ys-inp"
                value={event.budgetPerPerson || ''}
                onChange={e => onChange({ budgetPerPerson: e.target.value })}
                placeholder="e.g. 8.00"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Item">
              <input type="text" className="ys-inp" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Flowers" />
            </Field>
            <Field label="Amount">
              <input type="number" min="0" step="0.01" className="ys-inp" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </Row>
          <button type="button" className="ys-add-btn" disabled={!label.trim()} onClick={addItem}>＋ Add cost</button>
        </>
      )}

      {items.length === 0 ? (
        <div className="wls-empty-note">No costs logged yet.</div>
      ) : (
        <ul className="bt-budget-list">
          {items.map(i => (
            <li key={i.id} className="bt-budget-row">
              <span className="bt-budget-label">{i.label}</span>
              <span className="bt-budget-amount">${Number(i.amount || 0).toFixed(2)}</span>
              {editing && <button type="button" className="bt-row-del" onClick={() => removeItem(i.id)}>✕</button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Recap ───────────────────────────────────────────────────── */
function RecapSection({ event, onChange }) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef(null);
  const photos = Array.isArray(event.recapPhotos) ? event.recapPhotos : [];

  const pickPhoto = () => {
    setPhotoError('');
    fileInputRef.current?.click();
  };

  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 800, quality: 0.85 });
      onChange({ recapPhotos: [...photos, { id: makeId('btp'), url: dataUrl, caption: caption.trim() }] });
      setCaption('');
    } catch {
      setPhotoError('Could not add that photo — try a different image.');
    }
  };

  const removePhoto = (id) => onChange({ recapPhotos: photos.filter(p => p.id !== id) });

  return (
    <Section title="Recap" right={<EditToggle editing={editing} onToggle={() => setEditing(v => !v)} />}>
      {editing ? (
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          value={event.recapNotes || ''}
          onChange={e => onChange({ recapNotes: e.target.value })}
          placeholder="How'd it go? What to remember for next time…"
        />
      ) : (
        <ViewField label="Notes" value={event.recapNotes} block />
      )}

      {editing && (
        <Row>
          <Field label="Caption">
            <input type="text" className="ys-inp" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Optional, applies to next photo" />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="ys-add-btn" onClick={pickPhoto}>📷 Upload photo</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onPhotoChosen}
            />
          </div>
        </Row>
      )}
      {editing && photoError && <div className="bt-photo-error">{photoError}</div>}

      {photos.length > 0 && (
        <div className="bt-photo-grid">
          {photos.map(p => (
            <div key={p.id} className="bt-photo-card">
              <img src={p.url} alt={p.caption || 'Recap photo'} className="bt-photo-img" />
              {p.caption && <span className="bt-photo-caption">{p.caption}</span>}
              {editing && <button type="button" className="bt-photo-del" onClick={() => removePhoto(p.id)}>✕</button>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="ys-section">
      <div className="ys-section-hd">
        <h3 className="ys-section-title">{title}</h3>
        {right}
      </div>
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

/* ── View/Edit toggle button + read-only display helpers ─────── */
function EditToggle({ editing, onToggle }) {
  return (
    <button type="button" className="bt-edit-btn" onClick={onToggle}>
      {editing ? '✓ Done' : '✎ Edit'}
    </button>
  );
}
function ViewRow({ children }) {
  return <div className="bt-view-row">{children}</div>;
}
function ViewField({ label, value, placeholder = '—', icon, block }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={`bt-view-field${block ? ' block' : ''}`}>
      <span className="bt-view-field-lbl">{icon ? `${icon} ` : ''}{label}</span>
      <span className={`bt-view-field-val${empty ? ' is-empty' : ''}`}>{empty ? placeholder : value}</span>
    </div>
  );
}
