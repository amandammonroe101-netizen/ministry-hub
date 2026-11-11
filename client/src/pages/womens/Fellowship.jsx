import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center,
   .wa-card-grid/.wa-stats-bar/.wa-controls/.wa-slide…) from
   AllWomen.css and the .ys-* form primitives from the Youth
   roster — same pattern every other Women's page follows. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Fellowship.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Fellowship & Crafts

   One page, four tabs, all backed by a single storage object
   (nothing here is referenced by another Women's page, so unlike
   Bible Studies / Prayer Groups this doesn't need to live in
   womensListsConfig.js):

     Gatherings   — card catalog of one-off fellowship events
                    (craft night, paint-and-pray, book club
                    meetup, game night…). Drill into a slide-over
                    for RSVPs (linked to the shared 'womens:women'
                    directory by id — an actual guest list, not a
                    standing roster-by-label like Prayer Groups),
                    a per-event supply checklist, an optional
                    linked Craft Idea, and one-shot Calendar sync.
     Craft Ideas  — reusable project catalog (materials, cost,
                    difficulty, instructions). "Schedule a
                    gathering with this" spins up a new Gathering
                    pre-filled with the project attached and jumps
                    to the Gatherings tab.
     Book Club    — one current book (discussion notes) plus a
                    rated history of past books, same active →
                    archive shape as Prayer Groups' answered
                    requests.
     Supplies     — a standing shopping list for the craft closet
                    (not tied to one event) plus a read-only
                    rollup of whatever's still unchecked on each
                    upcoming gathering's own supply list.

   Storage: 'womens:fellowship' → { gatherings, craftIdeas,
   bookClub: { current, history }, supplyList }. Everything here
   only ever makes sense in this page's own context, so it's one
   object instead of four separate keys.
   ───────────────────────────────────────────────────────────── */

const GATHERING_TYPES = [
  { id: 'craft',    label: 'Craft Night',      icon: '🎨' },
  { id: 'paint',    label: 'Paint & Pray',     icon: '🖌️' },
  { id: 'bookclub', label: 'Book Club',        icon: '📚' },
  { id: 'game',     label: 'Game Night',       icon: '🎲' },
  { id: 'potluck',  label: 'Potluck',          icon: '🍽️' },
  { id: 'other',    label: 'Other Fellowship', icon: '✨' },
];
const gatheringTypeMeta = (id) =>
  GATHERING_TYPES.find(t => t.id === id) || GATHERING_TYPES[GATHERING_TYPES.length - 1];

const CRAFT_CATEGORIES = ['Paint & Canvas', 'Paper Craft', 'Sewing & Fiber', 'Jewelry', 'Seasonal', 'Home Decor', 'Other'];
const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'];

const PAGE_TABS = [
  { key: 'gatherings', label: 'Gatherings',  icon: '📅' },
  { key: 'crafts',     label: 'Craft Ideas', icon: '🎨' },
  { key: 'bookclub',   label: 'Book Club',   icon: '📚' },
  { key: 'supplies',   label: 'Supplies',    icon: '🧺' },
];

const CAL_SOURCE = 'women-fellowship';
const CAL_COLOR  = '#fbbf24'; // amber — matches the Events group accent

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_STATE = () => ({
  gatherings: [],
  craftIdeas: [],
  bookClub: { current: null, history: [] },
  supplyList: [],
});

const DEFAULT_GATHERING = () => ({
  id:             makeId('fg'),
  title:          '',
  type:           'craft',
  date:           '',
  time:           '',
  location:       '',
  host:           '',
  cap:            '',
  description:    '',
  craftIdeaId:    '',
  attendeeIds:    [],
  supplies:       [], // [{ id, text, who, got }]
  syncToCalendar: false,
  createdAt:      Date.now(),
});

const DEFAULT_CRAFT = () => ({
  id:           makeId('ci'),
  name:         '',
  category:     'Other',
  difficulty:   'Easy',
  estCost:      '',
  materials:    '',
  instructions: '',
  notes:        '',
  createdAt:    Date.now(),
});

export default function Fellowship() {
  const [data, setData] = useUserStoreKey('womens:fellowship', DEFAULT_STATE);
  const [women] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [tab, setTab] = useState('gatherings');
  const [selectedGatheringId, setSelectedGatheringId] = useState(null);
  const [selectedCraftId, setSelectedCraftId] = useState(null);

  const base = data && typeof data === 'object' && !Array.isArray(data) ? data : DEFAULT_STATE();
  const gatherings = Array.isArray(base.gatherings) ? base.gatherings : [];
  const craftIdeas = Array.isArray(base.craftIdeas) ? base.craftIdeas : [];
  const bookClub = base.bookClub && typeof base.bookClub === 'object' ? base.bookClub : { current: null, history: [] };
  const supplyList = Array.isArray(base.supplyList) ? base.supplyList : [];
  const womenList = Array.isArray(women) ? women : [];

  const setGatherings = (updater) => setData(prev => {
    const b = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : DEFAULT_STATE();
    const list = Array.isArray(b.gatherings) ? b.gatherings : [];
    return { ...b, gatherings: typeof updater === 'function' ? updater(list) : updater };
  });
  const setCraftIdeas = (updater) => setData(prev => {
    const b = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : DEFAULT_STATE();
    const list = Array.isArray(b.craftIdeas) ? b.craftIdeas : [];
    return { ...b, craftIdeas: typeof updater === 'function' ? updater(list) : updater };
  });
  const setBookClub = (updater) => setData(prev => {
    const b = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : DEFAULT_STATE();
    const cur = b.bookClub && typeof b.bookClub === 'object' ? b.bookClub : { current: null, history: [] };
    return { ...b, bookClub: typeof updater === 'function' ? updater(cur) : updater };
  });
  const setSupplyList = (updater) => setData(prev => {
    const b = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : DEFAULT_STATE();
    const list = Array.isArray(b.supplyList) ? b.supplyList : [];
    return { ...b, supplyList: typeof updater === 'function' ? updater(list) : updater };
  });

  /* One-shot event per gathering (not recurring, unlike Prayer
     Groups' weekly meetings) — replaced whenever the gathering's
     date/time/title/location/type/sync flag changes. */
  const syncGatheringCalendar = (gathering) => {
    setCalendarEvents(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const others = list.filter(e => !(e.source === CAL_SOURCE && e.source_id === gathering.id));
      if (!gathering.syncToCalendar || !gathering.date) return others;
      const meta = gatheringTypeMeta(gathering.type);
      const event = {
        id:              'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        created_at:      new Date().toISOString(),
        title:           `${meta.icon} ${gathering.title || meta.label}`,
        description:     gathering.location ? `At ${gathering.location}.` : '',
        event_date:      gathering.date,
        end_date:        '',
        event_time:      gathering.time || '',
        color:           CAL_COLOR,
        category:        'womens',
        source:          CAL_SOURCE,
        source_id:       gathering.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      return [event, ...others];
    });
  };
  const removeGatheringCalendar = (id) => {
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE && e.source_id === id)));
  };

  const addGathering = () => {
    const g = DEFAULT_GATHERING();
    setGatherings(prev => [...prev, g]);
    setSelectedGatheringId(g.id);
  };
  const updateGathering = (id, patch) => {
    const current = gatherings.find(g => g.id === id);
    setGatherings(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
    if (!current) return;
    const merged = { ...current, ...patch };
    if (patch.date !== undefined || patch.time !== undefined || patch.title !== undefined ||
        patch.location !== undefined || patch.type !== undefined || patch.syncToCalendar !== undefined) {
      syncGatheringCalendar(merged);
    }
  };
  const removeGathering = (id) => {
    setGatherings(prev => prev.filter(g => g.id !== id));
    removeGatheringCalendar(id);
    if (selectedGatheringId === id) setSelectedGatheringId(null);
  };

  const addCraft = () => {
    const c = DEFAULT_CRAFT();
    setCraftIdeas(prev => [...prev, c]);
    setSelectedCraftId(c.id);
  };
  const updateCraft = (id, patch) => setCraftIdeas(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeCraft = (id) => {
    setCraftIdeas(prev => prev.filter(c => c.id !== id));
    setGatherings(prev => prev.map(g => g.craftIdeaId === id ? { ...g, craftIdeaId: '' } : g));
    if (selectedCraftId === id) setSelectedCraftId(null);
  };

  const scheduleFromCraft = (craft) => {
    const g = { ...DEFAULT_GATHERING(), title: craft.name || 'Craft Night', type: 'craft', craftIdeaId: craft.id };
    setGatherings(prev => [...prev, g]);
    setTab('gatherings');
    setSelectedGatheringId(g.id);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  const addForTab = () => {
    if (tab === 'gatherings') addGathering();
    else if (tab === 'crafts') addCraft();
    else if (tab === 'supplies') setSupplyList(prev => [...prev, { id: makeId('sup'), text: '', who: '', got: false, createdAt: Date.now() }]);
  };
  const addLabel =
      tab === 'gatherings' ? '✦ New gathering'
    : tab === 'crafts'     ? '✦ New craft idea'
    : tab === 'supplies'   ? '✦ Add item'
    :                        null;

  return (
    <WomensShell
      title="Fellowship & Crafts"
      icon="🎨"
      subtitle="Casual fellowship nights — craft projects, paint-and-pray, book club, and supply lists."
      actions={
        addLabel && (
          <button type="button" className="wms-btn primary" onClick={addForTab}>
            {addLabel}
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wf-corkboard">
          <PinboardStrip
            gatherings={gatherings}
            craftIdeas={craftIdeas}
            bookClub={bookClub}
            onGoToGathering={(id) => { setTab('gatherings'); setSelectedGatheringId(id); }}
            onGoToCraft={(id) => { setTab('crafts'); if (id) setSelectedCraftId(id); }}
            onGoToBookClub={() => setTab('bookclub')}
            onAdd={addGathering}
          />

          <nav className="wf-tabs" role="tablist" aria-label="Fellowship views">
            {PAGE_TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`wf-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.key === 'gatherings' && gatherings.length > 0 && <span className="wf-tab-badge">{gatherings.length}</span>}
                {t.key === 'crafts' && craftIdeas.length > 0 && <span className="wf-tab-badge">{craftIdeas.length}</span>}
              </button>
            ))}
          </nav>

          <div className="wf-tab-body">
            {tab === 'gatherings' && (
              <GatheringsTab
                gatherings={gatherings}
                craftIdeas={craftIdeas}
                womenList={womenList}
                selectedId={selectedGatheringId}
                setSelectedId={setSelectedGatheringId}
                onAdd={addGathering}
                onUpdate={updateGathering}
                onRemove={removeGathering}
                onOpenWoman={openWoman}
                onOpenCraft={(id) => { setTab('crafts'); setSelectedCraftId(id); }}
              />
            )}
            {tab === 'crafts' && (
              <CraftsTab
                craftIdeas={craftIdeas}
                selectedId={selectedCraftId}
                setSelectedId={setSelectedCraftId}
                onAdd={addCraft}
                onUpdate={updateCraft}
                onRemove={removeCraft}
                onSchedule={scheduleFromCraft}
              />
            )}
            {tab === 'bookclub' && (
              <BookClubTab bookClub={bookClub} setBookClub={setBookClub} />
            )}
            {tab === 'supplies' && (
              <SuppliesTab
                supplyList={supplyList}
                setSupplyList={setSupplyList}
                gatherings={gatherings}
                onOpenGathering={(id) => { setTab('gatherings'); setSelectedGatheringId(id); }}
              />
            )}
          </div>
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

/* ── Pinboard landing strip ─────────────────────────────────── */
function PinboardStrip({ gatherings, craftIdeas, bookClub, onGoToGathering, onGoToCraft, onGoToBookClub, onAdd }) {
  const today = todayISO();
  const upcoming = useMemo(
    () => gatherings
      .filter(g => !g.date || g.date >= today)
      .sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99')),
    [gatherings, today]
  );
  const next = upcoming[0] || null;
  const featuredCraft = craftIdeas.length ? craftIdeas[craftIdeas.length - 1] : null;
  const current = bookClub.current;

  return (
    <div className="wf-pin-strip">
      <button type="button" className="wf-pin-card" onClick={() => (next ? onGoToGathering(next.id) : onAdd())}>
        <span className="wf-pin-label">📅 Next Gathering</span>
        {next ? (
          <>
            <div className="wf-pin-value">{gatheringTypeMeta(next.type).icon} {next.title || gatheringTypeMeta(next.type).label}</div>
            <div className="wf-pin-sub">
              {[next.date, next.time].filter(Boolean).join(' · ') || 'Date not set'}
              {upcoming.length > 1 ? ` · +${upcoming.length - 1} more` : ''}
            </div>
          </>
        ) : (
          <div className="wf-pin-empty">Nothing on the board — tap to plan one ✎</div>
        )}
      </button>

      <button type="button" className="wf-pin-card" onClick={() => onGoToCraft(featuredCraft?.id || null)}>
        <span className="wf-pin-label">🎨 Featured Craft</span>
        {featuredCraft ? (
          <>
            <div className="wf-pin-value">{featuredCraft.name || '(untitled)'}</div>
            <div className="wf-pin-sub">{featuredCraft.category}{featuredCraft.difficulty ? ` · ${featuredCraft.difficulty}` : ''}</div>
          </>
        ) : (
          <div className="wf-pin-empty">No craft ideas pinned yet</div>
        )}
      </button>

      <button type="button" className="wf-pin-card" onClick={onGoToBookClub}>
        <span className="wf-pin-label">📖 Currently Reading</span>
        {current ? (
          <>
            <div className="wf-pin-value">{current.title}</div>
            <div className="wf-pin-sub">{current.author ? `by ${current.author}` : 'Book club pick'}</div>
          </>
        ) : (
          <div className="wf-pin-empty">No book picked yet</div>
        )}
      </button>
    </div>
  );
}

/* ── Tab 1: Gatherings ──────────────────────────────────────── */
function GatheringsTab({ gatherings, craftIdeas, womenList, selectedId, setSelectedId, onAdd, onUpdate, onRemove, onOpenWoman, onOpenCraft }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('upcoming');
  const today = todayISO();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = gatherings;
    if (q) {
      out = out.filter(g =>
        (g.title || '').toLowerCase().includes(q) ||
        (g.location || '').toLowerCase().includes(q) ||
        (g.host || '').toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') out = out.filter(g => g.type === typeFilter);
    if (timeFilter === 'upcoming') out = out.filter(g => !g.date || g.date >= today);
    if (timeFilter === 'past') out = out.filter(g => g.date && g.date < today);
    return [...out].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  }, [gatherings, query, typeFilter, timeFilter, today]);

  const selected = useMemo(() => gatherings.find(g => g.id === selectedId) || null, [gatherings, selectedId]);

  return (
    <div className="wf-panel">
      {gatherings.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">🎨</div>
          <div className="app-empty-title">No gatherings yet</div>
          <div className="app-empty-sub">
            Plan a craft night, paint-and-pray, or book club meetup — RSVPs,
            supplies, and calendar sync all live on each gathering.
          </div>
          <button type="button" className="app-btn primary" onClick={onAdd}>
            ✦ Add your first gathering
          </button>
        </div>
      ) : (
        <>
          <div className="wa-controls">
            <div className="wa-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by title, location, host…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>

          <div className="wa-filter-row">
            {[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }, { id: 'all', label: 'All' }].map(f => (
              <button key={f.id} type="button" className={`wa-filter-chip ${timeFilter === f.id ? 'on' : ''}`} onClick={() => setTimeFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="wa-filter-row">
            <button type="button" className={`wa-filter-chip ${typeFilter === 'all' ? 'on' : ''}`} onClick={() => setTypeFilter('all')}>All types</button>
            {GATHERING_TYPES.map(t => (
              <button key={t.id} type="button" className={`wa-filter-chip ${typeFilter === t.id ? 'on' : ''}`} onClick={() => setTypeFilter(t.id)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="wa-directory-empty">
              {query ? `No gatherings match "${query}".` : 'No gatherings match this filter.'}
            </div>
          ) : (
            <div className="wa-card-grid">
              {visible.map(g => (
                <GatheringCard key={g.id} gathering={g} craftIdeas={craftIdeas} onClick={() => setSelectedId(g.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label={selected.title || 'Gathering'}>
            <button className="wa-slide-close" onClick={() => setSelectedId(null)} aria-label="Close" title="Close (Esc)">✕</button>
            <div className="wa-slide-body">
              <GatheringDetail
                gathering={selected}
                craftIdeas={craftIdeas}
                womenList={womenList}
                onChange={(patch) => onUpdate(selected.id, patch)}
                onDelete={() => onRemove(selected.id)}
                onOpenWoman={onOpenWoman}
                onOpenCraft={onOpenCraft}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function GatheringCard({ gathering, craftIdeas, onClick }) {
  const meta = gatheringTypeMeta(gathering.type);
  const craft = craftIdeas.find(c => c.id === gathering.craftIdeaId);
  const attendeeCount = Array.isArray(gathering.attendeeIds) ? gathering.attendeeIds.length : 0;

  return (
    <button type="button" className="wf-card" onClick={onClick}>
      <div className="wf-card-top">
        <span className="wf-card-title">{gathering.title || `(untitled ${meta.label.toLowerCase()})`}</span>
        <span className="wf-badge">{meta.icon} {meta.label}</span>
      </div>
      {(gathering.date || gathering.time) && (
        <div className="wf-card-line">📅 {[gathering.date, gathering.time].filter(Boolean).join(' · ')}</div>
      )}
      {gathering.location && <div className="wf-card-line">📍 {gathering.location}</div>}
      {gathering.host && <div className="wf-card-line">🏠 {gathering.host}</div>}
      {craft && <div className="wf-card-craft">🎨 {craft.name || '(untitled craft)'}</div>}
      <div className="wf-card-foot">
        <span className="wf-card-rsvp">{attendeeCount} {attendeeCount === 1 ? 'RSVP' : 'RSVPs'}{gathering.cap ? ` / ${gathering.cap}` : ''}</span>
        {gathering.syncToCalendar && <span className="wf-card-chip">📆 Synced</span>}
      </div>
    </button>
  );
}

function GatheringDetail({ gathering, craftIdeas, womenList, onChange, onDelete, onOpenWoman, onOpenCraft }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };
  const linkedCraft = craftIdeas.find(c => c.id === gathering.craftIdeaId);
  const attendeeIds = Array.isArray(gathering.attendeeIds) ? gathering.attendeeIds : [];
  const supplies = Array.isArray(gathering.supplies) ? gathering.supplies : [];

  const toggleAttendee = (womanId) => {
    const set2 = new Set(attendeeIds);
    if (set2.has(womanId)) set2.delete(womanId); else set2.add(womanId);
    onChange({ attendeeIds: Array.from(set2) });
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="wf-detail-icon">{gatheringTypeMeta(gathering.type).icon}</span>
          <input
            type="text"
            className="ys-inp wf-title-inp"
            value={gathering.title || ''}
            onChange={set('title')}
            placeholder="Gathering title"
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

      <Section title="Details">
        <Row>
          <Field label="Type">
            <select className="ys-inp" value={gathering.type || 'craft'} onChange={set('type')}>
              {GATHERING_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
          </Field>
          <Field label="Host">
            <input type="text" className="ys-inp" value={gathering.host || ''} onChange={set('host')} placeholder="Who's hosting" />
          </Field>
        </Row>
        <Row>
          <Field label="Date">
            <input type="date" className="ys-inp" value={gathering.date || ''} onChange={set('date')} />
          </Field>
          <Field label="Time">
            <input type="text" className="ys-inp" value={gathering.time || ''} onChange={set('time')} placeholder="e.g. 6:30 PM" />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input type="text" className="ys-inp" value={gathering.location || ''} onChange={set('location')} placeholder="e.g. Fellowship Hall / host home" />
          </Field>
          <Field label="RSVP cap">
            <input type="number" min="0" className="ys-inp" value={gathering.cap || ''} onChange={set('cap')} placeholder="No limit" />
          </Field>
        </Row>
        <Field label="Description">
          <textarea className="ys-inp ys-textarea" rows={3} value={gathering.description || ''} onChange={set('description')} placeholder="What to expect, what to bring…" />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!gathering.syncToCalendar} onChange={set('syncToCalendar')} disabled={!gathering.date} />
          <span>Sync to Calendar{!gathering.date ? ' (set a date first)' : ''}</span>
        </label>
      </Section>

      <Section title="Craft project">
        <Field label="Linked craft idea">
          <select className="ys-inp" value={gathering.craftIdeaId || ''} onChange={set('craftIdeaId')}>
            <option value="">— none —</option>
            {craftIdeas.map(c => <option key={c.id} value={c.id}>{c.name || '(untitled)'}</option>)}
          </select>
        </Field>
        {linkedCraft && (
          <div className="wf-linked-craft">
            <div className="wf-linked-craft-hd">
              <span>{linkedCraft.category}{linkedCraft.difficulty ? ` · ${linkedCraft.difficulty}` : ''}{linkedCraft.estCost ? ` · ~$${linkedCraft.estCost}` : ''}</span>
              <button type="button" className="app-btn ghost wf-linked-craft-open" onClick={() => onOpenCraft(linkedCraft.id)}>
                Open in Craft Ideas →
              </button>
            </div>
            {linkedCraft.materials && <div className="wf-linked-craft-materials"><b>Materials:</b> {linkedCraft.materials}</div>}
          </div>
        )}
      </Section>

      <Section title={`RSVPs (${attendeeIds.length}${gathering.cap ? ` / ${gathering.cap}` : ''})`}>
        <AttendeePicker womenList={womenList} attendeeIds={attendeeIds} onToggle={toggleAttendee} onOpenWoman={onOpenWoman} />
      </Section>

      <SuppliesSection supplies={supplies} attendeeIds={attendeeIds} womenList={womenList} onChange={onChange} />
    </form>
  );
}

function AttendeePicker({ womenList, attendeeIds, onToggle, onOpenWoman }) {
  const [query, setQuery] = useState('');
  const selected = womenList.filter(w => attendeeIds.includes(w.id));
  const q = query.trim().toLowerCase();
  const candidates = q ? womenList.filter(w => (w.name || '').toLowerCase().includes(q)) : womenList;

  if (womenList.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
        No women in the directory yet — add them on All Women first.
      </div>
    );
  }

  return (
    <div className="wf-attendees">
      {selected.length > 0 && (
        <div className="wf-attendee-chips">
          {selected.map(w => (
            <span key={w.id} className="wf-attendee-chip">
              <button type="button" className="wf-attendee-chip-name" onClick={() => onOpenWoman(w.id)}>
                {w.name || '(no name)'}
              </button>
              <button type="button" className="wf-attendee-chip-x" onClick={() => onToggle(w.id)} title="Remove">✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className="ys-inp"
        placeholder="Search women to invite…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="wf-attend-list">
        {candidates.map(w => {
          const on = attendeeIds.includes(w.id);
          return (
            <label key={w.id} className={`wf-attend-row${on ? ' on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(w.id)} />
              <span className="wf-attend-name">{w.name || '(no name)'}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SuppliesSection({ supplies, attendeeIds, womenList, onChange }) {
  const [text, setText] = useState('');
  const [who, setWho] = useState('');

  const addItem = () => {
    const t = text.trim();
    if (!t) return;
    onChange({ supplies: [...supplies, { id: makeId('sup'), text: t, who: who.trim(), got: false }] });
    setText(''); setWho('');
  };
  const updateItem = (id, patch) => onChange({ supplies: supplies.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeItem = (id) => onChange({ supplies: supplies.filter(s => s.id !== id) });

  const attendeeNames = womenList.filter(w => attendeeIds.includes(w.id)).map(w => w.name).filter(Boolean);
  const gotCount = supplies.filter(s => s.got).length;

  return (
    <Section title={`Supplies (${gotCount}/${supplies.length})`}>
      <Row>
        <Field label="Item">
          <input
            type="text"
            className="ys-inp"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. Canvases, glue sticks…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          />
        </Field>
        <Field label="Who's bringing it">
          <input
            type="text"
            className="ys-inp"
            list="wf-attendee-names"
            value={who}
            onChange={e => setWho(e.target.value)}
            placeholder="Name (optional)"
          />
          <datalist id="wf-attendee-names">
            {attendeeNames.map(n => <option key={n} value={n} />)}
          </datalist>
        </Field>
      </Row>
      <button type="button" className="ys-add-btn" disabled={!text.trim()} onClick={addItem}>＋ Add item</button>

      {supplies.length > 0 && (
        <ul className="wf-supply-list">
          {supplies.map(s => (
            <li key={s.id} className={`wf-supply-row${s.got ? ' is-got' : ''}`}>
              <label className="wf-supply-check">
                <input type="checkbox" checked={!!s.got} onChange={e => updateItem(s.id, { got: e.target.checked })} />
                <span>{s.text}</span>
              </label>
              {s.who && <span className="wf-supply-who">{s.who}</span>}
              <button type="button" className="wa-comm-del" onClick={() => removeItem(s.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Tab 2: Craft Idea Library ──────────────────────────────── */
function CraftsTab({ craftIdeas, selectedId, setSelectedId, onAdd, onUpdate, onRemove, onSchedule }) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return craftIdeas
      .filter(c => categoryFilter === 'All' ? true : c.category === categoryFilter)
      .filter(c => difficultyFilter === 'All' ? true : c.difficulty === difficultyFilter)
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.materials || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [craftIdeas, query, categoryFilter, difficultyFilter]);

  const selected = useMemo(() => craftIdeas.find(c => c.id === selectedId) || null, [craftIdeas, selectedId]);

  return (
    <div className="wf-panel">
      {craftIdeas.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">🎨</div>
          <div className="app-empty-title">No craft ideas yet</div>
          <div className="app-empty-sub">
            Build a library of projects — materials, cost, and instructions —
            then schedule any of them straight to a gathering.
          </div>
          <button type="button" className="app-btn primary" onClick={onAdd}>
            ✦ Add your first craft idea
          </button>
        </div>
      ) : (
        <>
          <div className="wa-controls">
            <div className="wa-search-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by name or materials…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          <div className="wa-filter-row">
            <button type="button" className={`wa-filter-chip ${categoryFilter === 'All' ? 'on' : ''}`} onClick={() => setCategoryFilter('All')}>All categories</button>
            {CRAFT_CATEGORIES.map(c => (
              <button key={c} type="button" className={`wa-filter-chip ${categoryFilter === c ? 'on' : ''}`} onClick={() => setCategoryFilter(c)}>{c}</button>
            ))}
          </div>
          <div className="wa-filter-row">
            <button type="button" className={`wa-filter-chip ${difficultyFilter === 'All' ? 'on' : ''}`} onClick={() => setDifficultyFilter('All')}>Any difficulty</button>
            {DIFFICULTY_LEVELS.map(d => (
              <button key={d} type="button" className={`wa-filter-chip ${difficultyFilter === d ? 'on' : ''}`} onClick={() => setDifficultyFilter(d)}>{d}</button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="wa-directory-empty">
              {query ? `No craft ideas match "${query}".` : 'No craft ideas match this filter.'}
            </div>
          ) : (
            <div className="wa-card-grid">
              {visible.map(c => <CraftCard key={c.id} craft={c} onClick={() => setSelectedId(c.id)} />)}
            </div>
          )}
        </>
      )}

      {selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label={selected.name || 'Craft idea'}>
            <button className="wa-slide-close" onClick={() => setSelectedId(null)} aria-label="Close" title="Close (Esc)">✕</button>
            <div className="wa-slide-body">
              <CraftDetail
                craft={selected}
                onChange={(patch) => onUpdate(selected.id, patch)}
                onDelete={() => onRemove(selected.id)}
                onSchedule={() => onSchedule(selected)}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function CraftCard({ craft, onClick }) {
  return (
    <button type="button" className="wf-card wf-craft-card" onClick={onClick}>
      <div className="wf-card-top">
        <span className="wf-card-title">{craft.name || '(untitled)'}</span>
        <span className={`wf-diff-badge diff-${(craft.difficulty || 'Easy').toLowerCase()}`}>{craft.difficulty || 'Easy'}</span>
      </div>
      <div className="wf-card-line">🗂 {craft.category || 'Other'}{craft.estCost ? ` · ~$${craft.estCost}` : ''}</div>
      {craft.materials && <div className="wf-card-materials"><b>Materials:</b> {craft.materials}</div>}
    </button>
  );
}

function CraftDetail({ craft, onChange, onDelete, onSchedule }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="wf-detail-icon">🎨</span>
          <input
            type="text"
            className="ys-inp wf-title-inp"
            value={craft.name || ''}
            onChange={set('name')}
            placeholder="Craft idea name"
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

      <button type="button" className="app-btn ghost wf-schedule-btn" onClick={onSchedule}>
        📅 Schedule a gathering with this
      </button>

      <Section title="Details">
        <Row>
          <Field label="Category">
            <select className="ys-inp" value={craft.category || 'Other'} onChange={set('category')}>
              {CRAFT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className="ys-inp" value={craft.difficulty || 'Easy'} onChange={set('difficulty')}>
              {DIFFICULTY_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="Estimated cost per person">
          <input type="text" className="ys-inp" value={craft.estCost || ''} onChange={set('estCost')} placeholder="e.g. 8" />
        </Field>
        <Field label="Materials">
          <textarea className="ys-inp ys-textarea" rows={3} value={craft.materials || ''} onChange={set('materials')} placeholder="Canvases, paint, brushes, aprons…" />
        </Field>
        <Field label="Instructions">
          <textarea className="ys-inp ys-textarea" rows={5} value={craft.instructions || ''} onChange={set('instructions')} placeholder="Step-by-step…" />
        </Field>
        <Field label="Notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={craft.notes || ''} onChange={set('notes')} />
        </Field>
      </Section>
    </form>
  );
}

/* ── Tab 3: Book Club ───────────────────────────────────────── */
function BookClubTab({ bookClub, setBookClub }) {
  const current = bookClub.current;
  const history = Array.isArray(bookClub.history) ? bookClub.history : [];
  const [finishing, setFinishing] = useState(false);
  const [finishRating, setFinishRating] = useState(5);
  const [finishNotes, setFinishNotes] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');

  const startBook = () => {
    const t = newTitle.trim();
    if (!t) return;
    setBookClub(cur => ({
      ...cur,
      current: {
        id: makeId('bk'), title: t, author: newAuthor.trim(),
        startDate: todayISO(), targetFinishDate: '', discussionNotes: '',
        createdAt: Date.now(),
      },
    }));
    setNewTitle(''); setNewAuthor('');
  };

  const updateCurrent = (patch) => setBookClub(cur => ({ ...cur, current: { ...cur.current, ...patch } }));

  const finishBook = () => {
    if (!current) return;
    setBookClub(cur => ({
      current: null,
      history: [
        { id: makeId('bkh'), title: current.title, author: current.author, finishedDate: todayISO(), rating: finishRating, notes: finishNotes.trim() },
        ...(cur.history || []),
      ],
    }));
    setFinishing(false); setFinishRating(5); setFinishNotes('');
  };

  const removeHistoryEntry = (id) => setBookClub(cur => ({ ...cur, history: (cur.history || []).filter(h => h.id !== id) }));

  return (
    <div className="wf-panel wf-bookclub">
      {!current ? (
        <Section title="Start a new book">
          <Row>
            <Field label="Title">
              <input type="text" className="ys-inp" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Book title" />
            </Field>
            <Field label="Author">
              <input type="text" className="ys-inp" value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="Author" />
            </Field>
          </Row>
          <button type="button" className="ys-add-btn" disabled={!newTitle.trim()} onClick={startBook}>📖 Start reading</button>
        </Section>
      ) : (
        <Section title="Currently reading">
          <div className="wf-current-book">
            <span className="wf-book-icon">📖</span>
            <div className="wf-book-fields">
              <input type="text" className="ys-inp wf-title-inp" value={current.title || ''} onChange={e => updateCurrent({ title: e.target.value })} placeholder="Book title" />
              <input type="text" className="ys-inp" value={current.author || ''} onChange={e => updateCurrent({ author: e.target.value })} placeholder="Author" />
            </div>
          </div>
          <Row>
            <Field label="Started">
              <input type="date" className="ys-inp" value={current.startDate || ''} onChange={e => updateCurrent({ startDate: e.target.value })} />
            </Field>
            <Field label="Target finish">
              <input type="date" className="ys-inp" value={current.targetFinishDate || ''} onChange={e => updateCurrent({ targetFinishDate: e.target.value })} />
            </Field>
          </Row>
          <Field label="Discussion notes & questions">
            <textarea
              className="ys-inp ys-textarea"
              rows={5}
              value={current.discussionNotes || ''}
              onChange={e => updateCurrent({ discussionNotes: e.target.value })}
              placeholder="Chapters covered each meeting, discussion questions, favorite quotes…"
            />
          </Field>

          {finishing ? (
            <div className="wf-finish-form">
              <Field label="Rating">
                <StarRating value={finishRating} onChange={setFinishRating} />
              </Field>
              <Field label="Wrap-up notes">
                <textarea className="ys-inp ys-textarea" rows={2} value={finishNotes} onChange={e => setFinishNotes(e.target.value)} placeholder="What the group thought…" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="ys-add-btn" onClick={finishBook}>✓ Save to history</button>
                <button type="button" className="app-btn ghost" onClick={() => setFinishing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="app-btn ghost" onClick={() => setFinishing(true)}>🏁 Finish this book</button>
              <button
                type="button"
                className={`ys-del-btn${confirmRemove ? ' armed' : ''}`}
                onClick={() => {
                  if (confirmRemove) { setBookClub(cur => ({ ...cur, current: null })); setConfirmRemove(false); return; }
                  setConfirmRemove(true);
                  setTimeout(() => setConfirmRemove(false), 3500);
                }}
              >
                {confirmRemove ? 'Click again to remove' : '✕ Remove without saving'}
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title={`Past books (${history.length})`}>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No books finished yet.</div>
        ) : (
          <ul className="wf-history-list">
            {history.map(h => (
              <li key={h.id} className="wf-history-row">
                <div className="wf-history-hd">
                  <span className="wf-history-title">{h.title}{h.author ? ` — ${h.author}` : ''}</span>
                  <button type="button" className="wa-comm-del" onClick={() => removeHistoryEntry(h.id)}>✕</button>
                </div>
                <div className="wf-history-meta">
                  <StarRating value={h.rating || 0} readOnly />
                  <span>Finished {h.finishedDate}</span>
                </div>
                {h.notes && <div className="wf-history-notes">{h.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function StarRating({ value, onChange, readOnly }) {
  return (
    <div className="wf-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`wf-star ${n <= value ? 'on' : ''}`}
          disabled={readOnly}
          onClick={() => onChange && onChange(n)}
        >★</button>
      ))}
    </div>
  );
}

/* ── Tab 4: Supplies ────────────────────────────────────────── */
function SuppliesTab({ supplyList, setSupplyList, gatherings, onOpenGathering }) {
  const updateItem = (id, patch) => setSupplyList(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeItem = (id) => setSupplyList(prev => prev.filter(s => s.id !== id));

  const gatheringSupplies = useMemo(() => {
    return gatherings
      .filter(g => Array.isArray(g.supplies) && g.supplies.some(s => !s.got))
      .map(g => ({ gathering: g, items: g.supplies.filter(s => !s.got) }));
  }, [gatherings]);

  return (
    <div className="wf-panel">
      <Section title={`Master supply list (${supplyList.filter(s => s.got).length}/${supplyList.length})`}>
        {supplyList.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginBottom: 8 }}>
            Standing items for the craft closet — glue, canvases, paper — that aren't tied to one gathering.
          </div>
        ) : (
          <ul className="wf-supply-list">
            {supplyList.map(s => (
              <li key={s.id} className={`wf-supply-row${s.got ? ' is-got' : ''}`}>
                <label className="wf-supply-check">
                  <input type="checkbox" checked={!!s.got} onChange={e => updateItem(s.id, { got: e.target.checked })} />
                  <input
                    type="text"
                    className="wf-supply-inline-inp"
                    value={s.text || ''}
                    onChange={e => updateItem(s.id, { text: e.target.value })}
                    placeholder="Item name"
                  />
                </label>
                <input
                  type="text"
                  className="wf-supply-inline-inp wf-supply-who-inp"
                  value={s.who || ''}
                  onChange={e => updateItem(s.id, { who: e.target.value })}
                  placeholder="Who"
                />
                <button type="button" className="wa-comm-del" onClick={() => removeItem(s.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {gatheringSupplies.length > 0 && (
        <Section title="Still needed for upcoming gatherings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gatheringSupplies.map(({ gathering, items }) => (
              <div key={gathering.id} className="wf-gathering-needs">
                <button type="button" className="wf-gathering-needs-hd" onClick={() => onOpenGathering(gathering.id)}>
                  {gatheringTypeMeta(gathering.type).icon} {gathering.title || '(untitled)'} {gathering.date ? `· ${gathering.date}` : ''} →
                </button>
                <ul className="wf-gathering-needs-list">
                  {items.map(it => <li key={it.id}>{it.text}{it.who ? ` — ${it.who}` : ''}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

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
