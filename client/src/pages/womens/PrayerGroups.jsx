import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { usePrayerGroups, makeListItem, MEETING_TIMES } from './womensListsConfig';
import usePulseOnChange from './usePulseOnChange';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center/.wa-slide,
   .wa-card-grid/.wa-stats-bar/.wa-controls…) from AllWomen.css, the
   .wls-roster / .wls-unassigned bits from LifeStages.css (already in
   the bundle via App.jsx), and the .ys-* form primitives from the
   Youth roster — same pattern BibleStudies already follows. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './PrayerGroups.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Prayer Groups

   Card catalog of standing prayer groups — leader, meeting day/
   time/location, and a shared, per-group prayer request log with
   an Active → Answered lifecycle. Roster is NOT a separate list:
   it's derived from the shared 'womens:women' directory by
   matching each woman's `prayerGroup` field (a label, not an id —
   see womensListsConfig.js) against this group's title, same
   foreign-key strategy as Bible Studies.

   Storage: 'womens:prayer-groups' (this page + the prayer-group
   picker on All Women both read/write the same key).

   Meeting → Calendar: when "Sync meeting to Calendar" is on and a
   weekday is set, the next several occurrences are (re)computed
   and written to the shared calendar (source 'women-prayer-group'),
   replacing this group's prior synced events each time — both on
   save and on page load, so the calendar never runs dry even if
   the group isn't edited for a while.
   ───────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQUENCY_META = {
  weekly:   { label: 'Weekly',        stepDays: 7 },
  biweekly: { label: 'Every 2 weeks', stepDays: 14 },
  monthly:  { label: 'Monthly',       stepDays: null }, // stepped by month, not days
};
const FREQUENCY_ORDER = ['weekly', 'biweekly', 'monthly'];
const OCCURRENCE_COUNT = 6;

const CAL_SOURCE_MEETING = 'women-prayer-group';
const CAL_COLOR_MEETING  = '#a78bfa'; // purple — matches the Discipleship group accent

const DEFAULT_GROUP = () => ({
  ...makeListItem(''),
  leader:         '',
  focus:          '',
  day:            '',
  time:           '',
  location:       '',
  frequency:      'weekly',
  openToNew:      true,
  syncToCalendar: false,
  minMembers:     '',
  maxMembers:     '',
  manualMembers:  [],   // [{ id, name }] — added by hand from the roster search, not linked to an All Women record
  requests:       [],   // [{ id, text, requestedBy, date, status, sensitive, answeredNote, answeredAt, createdAt }]
  createdAt:      Date.now(),
});

const norm = (s) => (s || '').trim().toLowerCase();
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

/* Next N calendar dates for a weekday, stepped by the group's
   meeting frequency — starting from the next upcoming occurrence
   (today counts as "next" if it matches). */
function nextOccurrences(dayName, frequency, count) {
  const targetDow = WEEKDAYS.indexOf(dayName);
  if (targetDow < 0) return [];
  const out = [];
  const now = new Date();
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (targetDow - cur.getDay() + 7) % 7;
  cur.setDate(cur.getDate() + diff);
  const meta = FREQUENCY_META[frequency] || FREQUENCY_META.weekly;
  for (let i = 0; i < count; i++) {
    out.push(cur.toISOString().slice(0, 10));
    if (meta.stepDays) cur.setDate(cur.getDate() + meta.stepDays);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

export default function PrayerGroups() {
  const [groups, setGroups, { loading: groupsLoading }] = usePrayerGroups();
  const [women, setWomen] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  /* Leaders registry (Women's → Leaders, 'womens:leaders') — read-only
     here, purely to cross-reference: if the name in a group's Leader
     field (or a roster member's name) also has a record there, we
     show a "Registered ministry leader" tag. Same name-match strategy
     Leaders.jsx itself uses to read Bible Studies/Prayer Groups. */
  const [leaders] = useUserStoreKey('womens:leaders', []);
  const list = Array.isArray(groups) ? groups : [];
  const womenList = Array.isArray(women) ? women : [];
  const leadersList = Array.isArray(leaders) ? leaders : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  /* 'view' (read-only, everything shown) or 'edit' (the original fully-
     editable form). Clicking a card opens View; double-clicking (or the
     "✎ Edit" button inside View) jumps straight to Edit — same split
     All Women's WomanView/WomanForm already uses. */
  const [mode, setMode] = useState('view');
  const [query, setQuery] = useState('');
  const [openFilter, setOpenFilter] = useState('all'); // all | open | closed

  const rosterFor = (group) => {
    const label = norm(group.label);
    if (!label) return [];
    return womenList.filter(w => norm(w.prayerGroup) === label);
  };

  /* Manually-added roster members — women who aren't (or aren't yet)
     in the All Women directory, typed straight into this group's
     roster instead of being matched in by `prayerGroup` label. */
  const manualRosterFor = (group) => (Array.isArray(group.manualMembers) ? group.manualMembers : []);
  const totalRosterFor = (group) => rosterFor(group).length + manualRosterFor(group).length;

  const findWomanByName = (name) => {
    const n = norm(name);
    if (!n) return null;
    return womenList.find(w => norm(w.name) === n) || null;
  };

  const isRegisteredLeaderName = (name) => {
    const n = norm(name);
    if (!n) return false;
    return leadersList.some(l => norm(l.name) === n);
  };

  const syncMeetingCalendarFor = (group) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const prefix = `${group.id}__meeting__`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE_MEETING && (e.source_id || '').startsWith(prefix)));
      if (!group.syncToCalendar || !group.day) return others;
      const dates = nextOccurrences(group.day, group.frequency, OCCURRENCE_COUNT);
      const fresh = dates.map((d) => ({
        id:              'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        created_at:      new Date().toISOString(),
        title:           `🙏 ${group.label || 'Prayer group'}`,
        description:     group.location ? `Meets at ${group.location}.` : '',
        event_date:      d,
        end_date:        '',
        event_time:      group.time || '',
        color:           CAL_COLOR_MEETING,
        category:        'womens',
        source:          CAL_SOURCE_MEETING,
        source_id:       `${prefix}${d}`,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }));
      return [...fresh, ...others];
    });
  };

  const removeMeetingCalendarFor = (groupId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE_MEETING && (e.source_id || '').startsWith(`${groupId}__meeting__`))
    ));
  };

  /* Refresh every synced group's upcoming occurrences once groups
     have loaded from Firestore, so the calendar stays populated
     even if no group is edited during this visit. Cheap and
     idempotent — safe to re-run. */
  useEffect(() => {
    if (groupsLoading) return;
    list.forEach(g => { if (g.syncToCalendar && g.day) syncMeetingCalendarFor(g); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsLoading]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(g =>
          (g.label || '').toLowerCase().includes(q) ||
          (g.leader || '').toLowerCase().includes(q) ||
          (g.day || '').toLowerCase().includes(q) ||
          (g.focus || '').toLowerCase().includes(q))
      : list;
    if (openFilter === 'open')   out = out.filter(g => g.openToNew !== false);
    if (openFilter === 'closed') out = out.filter(g => g.openToNew === false);
    return [...out].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [list, query, openFilter]);

  const selected = useMemo(() => list.find(g => g.id === selectedId) || null, [list, selectedId]);

  const unassigned = useMemo(
    () => womenList.filter(w => w.active !== false && !(w.prayerGroup || '').trim()),
    [womenList]
  );

  const stats = useMemo(() => {
    let members = 0, active = 0, answered = 0;
    for (const g of list) {
      members += totalRosterFor(g);
      const reqs = Array.isArray(g.requests) ? g.requests : [];
      active   += reqs.filter(r => r.status !== 'answered').length;
      answered += reqs.filter(r => r.status === 'answered').length;
    }
    return { groups: list.length, members, active, answered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, womenList]);

  const groupsPulse = usePulseOnChange(stats.groups);
  const membersPulse = usePulseOnChange(stats.members);
  const activePulse = usePulseOnChange(stats.active);
  const answeredPulse = usePulseOnChange(stats.answered);

  const addGroup = () => {
    const g = DEFAULT_GROUP();
    setGroups(prev => [...(prev || []), g]);
    setSelectedId(g.id);
  };

  const updateGroup = (id, patch) => {
    const current = list.find(g => g.id === id);
    setGroups(prev => (prev || []).map(g => g.id === id ? { ...g, ...patch } : g));
    if (!current) return;
    const merged = { ...current, ...patch };

    /* Renaming a group cascades the new label onto every woman
       whose prayerGroup currently matches the OLD label, so the
       roster count never drifts from All Women. */
    if (patch.label !== undefined) {
      const oldLabel = (current.label || '').trim();
      const newLabel = (patch.label || '').trim();
      if (oldLabel && oldLabel !== newLabel) {
        setWomen(prev => (prev || []).map(w =>
          norm(w.prayerGroup) === norm(oldLabel) ? { ...w, prayerGroup: newLabel } : w
        ));
      }
    }

    if (patch.day !== undefined || patch.time !== undefined || patch.frequency !== undefined ||
        patch.location !== undefined || patch.syncToCalendar !== undefined || patch.label !== undefined) {
      syncMeetingCalendarFor(merged);
    }

    /* Lowering the max (or setting one for the first time) can put an
       already-full roster over the new limit — re-check right away
       instead of waiting for the next add. */
    if (patch.maxMembers !== undefined) {
      enforceCapacity(merged, totalRosterFor(current));
    }
  };

  const removeGroup = (id) => {
    setGroups(prev => (prev || []).filter(g => g.id !== id));
    removeMeetingCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  /* "Open to new members" auto-unchecks the moment a group's roster
     reaches its max — a one-way nudge (reaching capacity closes the
     group), not a hard lock, so a coordinator can still re-open it by
     hand (e.g. after raising the max or expecting a member to leave). */
  const enforceCapacity = (group, newCount) => {
    const max = parseInt(group.maxMembers, 10);
    if (Number.isFinite(max) && max > 0 && newCount >= max && group.openToNew !== false) {
      updateGroup(group.id, { openToNew: false });
    }
  };

  const addWomanToRoster = (group, womanId) => {
    const woman = womenList.find(w => w.id === womanId);
    if (!woman) return;
    setWomen(prev => (prev || []).map(w => w.id === womanId ? { ...w, prayerGroup: group.label } : w));
    enforceCapacity(group, totalRosterFor(group) + 1);
  };

  const removeWomanFromRoster = (womanId) => {
    setWomen(prev => (prev || []).map(w => w.id === womanId ? { ...w, prayerGroup: '' } : w));
  };

  const addManualRosterMember = (group, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const members = [...manualRosterFor(group), { id: makeId('pgm'), name: trimmed }];
    updateGroup(group.id, { manualMembers: members });
    enforceCapacity(group, rosterFor(group).length + members.length);
  };

  const removeManualRosterMember = (group, memberId) => {
    updateGroup(group.id, { manualMembers: manualRosterFor(group).filter(m => m.id !== memberId) });
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);
  const openRosterSearch = (label) => navigate(`/womens/all?q=${encodeURIComponent(label)}`);

  return (
    <WomensShell
      title="Prayer Groups"
      icon="🙏"
      subtitle="Standing prayer groups with leader, meeting time, roster, and a shared request log — Active through Answered."
      actions={
        <button type="button" className="wms-btn primary" onClick={addGroup}>
          ✦ New group
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="pg-root">
      {list.length === 0 ? (
        <div className="wa-empty app-empty">
          <div className="app-empty-icon">🙏</div>
          <div className="app-empty-title">No prayer groups yet</div>
          <div className="app-empty-sub">
            Add each standing group — leader, meeting time, and a shared
            request log — and women assigned to it in All Women will show
            up here automatically.
          </div>
          <button type="button" className="app-btn primary" onClick={addGroup}>
            ✦ Add your first group
          </button>
        </div>
      ) : (
        <div className="wa-directory">
          <section className="pg-panel">
            <h3 className="pg-panel-subtitle">At a glance</h3>
            <div className="wa-stats-bar">
              <div className="wa-stat">
                <span className={`wa-stat-n${groupsPulse ? ' is-pulsing' : ''}`}>{stats.groups}</span>
                <span className="wa-stat-lbl">Groups</span>
              </div>
              <div className="wa-stat">
                <span className={`wa-stat-n${membersPulse ? ' is-pulsing' : ''}`}>{stats.members}</span>
                <span className="wa-stat-lbl">Women in a group</span>
              </div>
              <div className="wa-stat">
                <span className={`wa-stat-n${activePulse ? ' is-pulsing' : ''}`}>{stats.active}</span>
                <span className="wa-stat-lbl">Open requests</span>
              </div>
              <div className="wa-stat">
                <span className={`wa-stat-n${answeredPulse ? ' is-pulsing' : ''}`}>{stats.answered}</span>
                <span className="wa-stat-lbl">Answered</span>
              </div>
            </div>
          </section>

          {unassigned.length > 0 && (
            <div className="wls-unassigned">
              <div className="wls-unassigned-hd">
                ⚠️ {unassigned.length} {unassigned.length === 1 ? 'woman has' : 'women have'} no prayer group set
              </div>
              <div className="wls-unassigned-list">
                {unassigned.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    className="wls-unassigned-chip"
                    onClick={() => openWoman(w.id)}
                  >{w.name || '(no name)'}</button>
                ))}
              </div>
            </div>
          )}

          <section className="pg-panel">
            <div className="pg-panel-row">
              <h3 className="pg-panel-subtitle">All groups ({visible.length}{visible.length !== list.length ? ` of ${list.length}` : ''})</h3>
            </div>

            <div className="wa-controls">
              <div className="wa-search-wrap">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search by group, leader, day…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
              </div>
            </div>

            <div className="wa-filter-row">
              {[
                { id: 'all',    label: 'All' },
                { id: 'open',   label: '🚪 Open to new' },
                { id: 'closed', label: '🔒 Closed' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`wa-filter-chip ${openFilter === f.id ? 'on' : ''}`}
                  onClick={() => setOpenFilter(f.id)}
                >{f.label}</button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="wa-directory-empty">
                {query ? `No groups match "${query}".` : 'No groups match this filter.'}
              </div>
            ) : (
              <div className="wa-card-grid">
                {visible.map((g, i) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    index={i}
                    rosterCount={totalRosterFor(g)}
                    onClick={() => { setSelectedId(g.id); setMode('view'); }}
                    onDoubleClick={() => { setSelectedId(g.id); setMode('edit'); }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {selected && (
        <>
          <div className="wa-slide-overlay" onClick={() => setSelectedId(null)} />
          <aside className="wa-slide" role="dialog" aria-label={selected.label || 'Prayer group'}>
            <button
              className="wa-slide-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              title="Close (Esc)"
            >✕</button>
            <div className="wa-slide-body">
              {mode === 'view' ? (
                <GroupView
                  group={selected}
                  roster={rosterFor(selected)}
                  manualRoster={manualRosterFor(selected)}
                  leaderWoman={findWomanByName(selected.leader)}
                  isRegisteredLeader={isRegisteredLeaderName(selected.leader)}
                  isRegisteredLeaderName={isRegisteredLeaderName}
                  onEdit={() => setMode('edit')}
                  onOpenWoman={openWoman}
                />
              ) : (
                <GroupDetail
                  group={selected}
                  roster={rosterFor(selected)}
                  manualRoster={manualRosterFor(selected)}
                  allWomen={womenList}
                  leaderWoman={findWomanByName(selected.leader)}
                  isRegisteredLeader={isRegisteredLeaderName(selected.leader)}
                  isRegisteredLeaderName={isRegisteredLeaderName}
                  onChange={(patch) => updateGroup(selected.id, patch)}
                  onDelete={() => removeGroup(selected.id)}
                  onOpenWoman={openWoman}
                  onOpenRoster={openRosterSearch}
                  onAddToRoster={(womanId) => addWomanToRoster(selected, womanId)}
                  onRemoveFromRoster={removeWomanFromRoster}
                  onAddManualMember={(name) => addManualRosterMember(selected, name)}
                  onRemoveManualMember={(memberId) => removeManualRosterMember(selected, memberId)}
                  onDone={() => setMode('view')}
                />
              )}
            </div>
          </aside>
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

/* ── Directory card ─────────────────────────────────────────── */
function GroupCard({ group, rosterCount, index, onClick, onDoubleClick }) {
  const reqs = Array.isArray(group.requests) ? group.requests : [];
  const openCount = reqs.filter(r => r.status !== 'answered').length;
  const freq = FREQUENCY_META[group.frequency] || FREQUENCY_META.weekly;

  return (
    <button
      type="button"
      className="pg-card"
      style={{ '--i': index }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click to view · double-click to edit"
    >
      <div className="pg-card-top">
        <span className="pg-card-title">{group.label || '(untitled group)'}</span>
        <span className={`pg-badge ${group.openToNew === false ? 'is-closed' : 'is-open'}`}>
          {group.openToNew === false ? '🔒 Closed' : '🚪 Open'}
        </span>
      </div>
      {group.leader && <div className="pg-card-line">🧑‍🏫 {group.leader}</div>}
      {(group.day || group.time) && (
        <div className="pg-card-line">
          📅 {[group.day, group.time].filter(Boolean).join(' · ')} {group.day ? `· ${freq.label}` : ''}
        </div>
      )}
      {group.location && <div className="pg-card-line">📍 {group.location}</div>}
      {group.focus && <div className="pg-card-focus">{group.focus}</div>}
      <div className="pg-card-foot">
        <span className="pg-card-roster">{rosterCount} {rosterCount === 1 ? 'woman' : 'women'}</span>
        {openCount > 0 && <span className="pg-card-reqs">🙏 {openCount} open</span>}
      </div>
    </button>
  );
}

/* ── Read-only detail view — opened on a single click, matches
   All Women's WomanView/WomanForm split. Shows everything the edit
   form does, just not editable; the "✎ Edit" button (or a
   double-click on the card) is the only way into GroupDetail. ──── */
function GroupView({ group, roster, manualRoster, leaderWoman, isRegisteredLeader, isRegisteredLeaderName, onEdit, onOpenWoman }) {
  const freq = FREQUENCY_META[group.frequency] || FREQUENCY_META.weekly;
  const reqs = Array.isArray(group.requests) ? group.requests : [];
  const activeReqs = [...reqs].filter(r => r.status !== 'answered').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const answeredCount = reqs.filter(r => r.status === 'answered').length;
  const total = roster.length + manualRoster.length;

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pg-detail-icon">🙏</span>
          <h2 className="ys-form-title">{group.label || '(untitled group)'}</h2>
        </div>
        <button type="button" className="app-btn primary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={onEdit}>
          ✎ Edit
        </button>
      </div>

      <span className={`pg-badge ${group.openToNew === false ? 'is-closed' : 'is-open'}`} style={{ alignSelf: 'flex-start' }}>
        {group.openToNew === false ? '🔒 Closed to new members' : '🚪 Open to new members'}
      </span>

      <Section title="Details">
        <ViewRow label="Leader" value={group.leader} />
        {group.leader && (leaderWoman || isRegisteredLeader) && (
          <div className="pg-leader-note">
            {isRegisteredLeader && <span className="pg-leader-tag">🧑‍🏫 Registered ministry leader</span>}
            {leaderWoman && (
              <button type="button" className="app-btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onOpenWoman(leaderWoman.id)}>
                {leaderWoman.lifeStage ? `${leaderWoman.lifeStage} · ` : ''}Open her profile →
              </button>
            )}
          </div>
        )}
        <ViewRow label="Meets" value={[group.day, group.time].filter(Boolean).join(' · ') + (group.day ? ` · ${freq.label}` : '')} />
        <ViewRow label="Location" value={group.location} />
        <ViewRow label="Focus" value={group.focus} />
        <ViewRow label="Group size" value={(group.minMembers || group.maxMembers) ? `${group.minMembers || '—'}–${group.maxMembers || '—'} women` : ''} />
        <ViewRow label="Calendar sync" value={group.syncToCalendar ? 'On' : ''} />
      </Section>

      <Section title={`Roster (${total})`}>
        {total === 0 ? (
          <div className="pg-empty-note">No one signed up yet.</div>
        ) : (
          <ul className="wls-roster">
            {roster.map(w => (
              <li key={w.id} className="wls-roster-row">
                <span className="wls-roster-name">{w.name || '(no name)'}</span>
                <span className="wls-roster-meta">{w.lifeStage || '—'}</span>
                {isRegisteredLeaderName(w.name) && <span className="pg-leader-tag">🧑‍🏫 Leader</span>}
                <button type="button" className="wls-roster-open" onClick={() => onOpenWoman(w.id)}>Open →</button>
              </li>
            ))}
            {manualRoster.map(m => (
              <li key={m.id} className="wls-roster-row">
                <span className="wls-roster-name">{m.name}</span>
                <span className="wls-roster-meta">Added by hand</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Prayer requests">
        {activeReqs.length === 0 ? (
          <div className="pg-empty-note">No open requests.</div>
        ) : (
          <ul className="pg-req-list">
            {activeReqs.map(r => (
              <li key={r.id} className="pg-req-row">
                <span className="pg-req-meta">
                  {r.requestedBy || 'Anonymous'} · {r.date}
                  {r.sensitive && <span className="pg-req-sensitive-tag"> · 🔒 sensitive</span>}
                </span>
                <div className="pg-req-text">{r.sensitive ? 'Sensitive request — open Edit to reveal.' : r.text}</div>
              </li>
            ))}
          </ul>
        )}
        {answeredCount > 0 && (
          <div className="pg-answered-wrap">
            <span className="pg-answered-toggle" style={{ cursor: 'default' }}>🎉 {answeredCount} answered — see Edit for the full log</span>
          </div>
        )}
      </Section>
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="wa-view-row">
      <span className="wa-view-lbl">{label}</span>
      <span className="wa-view-val">{value}</span>
    </div>
  );
}

/* ── Detail / edit slide-over ───────────────────────────────── */
function GroupDetail({
  group, roster, manualRoster, allWomen, leaderWoman, isRegisteredLeader, isRegisteredLeaderName,
  onChange, onDelete, onOpenWoman, onOpenRoster,
  onAddToRoster, onRemoveFromRoster, onAddManualMember, onRemoveManualMember, onDone,
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="pg-detail-icon">🙏</span>
          <input
            type="text"
            className="ys-inp pg-title-inp"
            value={group.label || ''}
            onChange={set('label')}
            placeholder="Group name"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="app-btn ghost"
            style={{ padding: '7px 12px', fontSize: 12 }}
            onClick={onDone}
            title="Back to view"
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

      <Section title="Details">
        <Row>
          <Field label="Leader">
            <input
              type="text"
              className="ys-inp"
              list="pg-leader-options"
              value={group.leader || ''}
              onChange={set('leader')}
              placeholder="Search All Women or type a name"
            />
            <datalist id="pg-leader-options">
              {allWomen.filter(w => (w.name || '').trim()).map(w => <option key={w.id} value={w.name} />)}
            </datalist>
          </Field>
          <Field label="Open to new members">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={group.openToNew !== false} onChange={set('openToNew')} />
              <span>Open</span>
            </label>
          </Field>
        </Row>
        {group.leader && (leaderWoman || isRegisteredLeader) && (
          <div className="pg-leader-note">
            {isRegisteredLeader && <span className="pg-leader-tag">🧑‍🏫 Registered ministry leader</span>}
            {leaderWoman && (
              <button type="button" className="app-btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onOpenWoman(leaderWoman.id)}>
                {leaderWoman.lifeStage ? `${leaderWoman.lifeStage} · ` : ''}Open her profile →
              </button>
            )}
          </div>
        )}
        <Row>
          <Field label="Day">
            <select className="ys-inp" value={group.day || ''} onChange={set('day')}>
              <option value="">—</option>
              {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Time">
            <select className="ys-inp" value={group.time || ''} onChange={set('time')}>
              <option value="">—</option>
              {MEETING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              {group.time && !MEETING_TIMES.includes(group.time) && <option value={group.time}>{group.time}</option>}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input type="text" className="ys-inp" value={group.location || ''} onChange={set('location')} placeholder="e.g. Fellowship Hall / Zoom" />
          </Field>
          <Field label="Frequency">
            <select className="ys-inp" value={group.frequency || 'weekly'} onChange={set('frequency')}>
              {FREQUENCY_ORDER.map(id => <option key={id} value={id}>{FREQUENCY_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Min. members">
            <input type="number" min="0" className="ys-inp" value={group.minMembers ?? ''} onChange={set('minMembers')} placeholder="No minimum" />
          </Field>
          <Field label="Max. members">
            <input type="number" min="0" className="ys-inp" value={group.maxMembers ?? ''} onChange={set('maxMembers')} placeholder="No maximum" />
          </Field>
        </Row>
        <Field label="Focus">
          <input type="text" className="ys-inp" value={group.focus || ''} onChange={set('focus')} placeholder="e.g. Moms group, young adults, general intercession…" />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!group.syncToCalendar} onChange={set('syncToCalendar')} disabled={!group.day} />
          <span>Sync meeting to Calendar{!group.day ? ' (set a day first)' : ''}</span>
        </label>
      </Section>

      <RosterSection
        group={group}
        roster={roster}
        manualRoster={manualRoster}
        allWomen={allWomen}
        isRegisteredLeaderName={isRegisteredLeaderName}
        onOpenWoman={onOpenWoman}
        onOpenRoster={onOpenRoster}
        onAddToRoster={onAddToRoster}
        onRemoveFromRoster={onRemoveFromRoster}
        onAddManualMember={onAddManualMember}
        onRemoveManualMember={onRemoveManualMember}
      />

      <RequestsSection group={group} allWomen={allWomen} onChange={onChange} />
    </form>
  );
}

/* ── Roster — women matched in automatically by `prayerGroup` label
   (set from All Women) PLUS members added by hand right here, either
   picked from a search of All Women or typed in fresh. Min/max are a
   soft capacity guide: reaching max auto-closes "Open to new members"
   (see enforceCapacity in the parent), it doesn't block adding more. */
function RosterSection({
  group, roster, manualRoster, allWomen, isRegisteredLeaderName,
  onOpenWoman, onOpenRoster, onAddToRoster, onRemoveFromRoster, onAddManualMember, onRemoveManualMember,
}) {
  const [search, setSearch] = useState('');
  const total = roster.length + manualRoster.length;
  const min = parseInt(group.minMembers, 10);
  const max = parseInt(group.maxMembers, 10);
  const belowMin = Number.isFinite(min) && min > 0 && total < min;
  const atMax = Number.isFinite(max) && max > 0 && total >= max;

  const rosterIds = new Set(roster.map(w => w.id));
  const manualNames = new Set(manualRoster.map(m => norm(m.name)));
  const searchOptions = allWomen.filter(w => (w.name || '').trim() && !rosterIds.has(w.id) && !manualNames.has(norm(w.name)));

  /* Live substring match — clicking a result adds that woman by ID
     directly, so this never depends on the typed text exactly
     matching her full name (the old <datalist> version silently
     failed to link her whenever the text wasn't a perfect match). */
  const q = norm(search);
  const results = q ? searchOptions.filter(w => norm(w.name).includes(q)).slice(0, 6) : [];
  const exactMatch = q ? searchOptions.some(w => norm(w.name) === q) : false;

  const pickResult = (womanId) => {
    onAddToRoster(womanId);
    setSearch('');
  };

  const addManual = () => {
    const val = search.trim();
    if (!val) return;
    onAddManualMember(val);
    setSearch('');
  };

  return (
    <Section title={`Roster (${total})`}>
      {(group.minMembers || group.maxMembers) && (
        <div className="pg-roster-capacity">
          {group.minMembers && <span>Min {group.minMembers}</span>}
          {group.maxMembers && <span>Max {group.maxMembers}</span>}
          {belowMin && <span className="pg-badge is-closed">Below minimum</span>}
          {atMax && <span className="pg-badge is-closed">Full</span>}
        </div>
      )}

      {total === 0 ? (
        <div className="pg-empty-note">No one signed up yet.</div>
      ) : (
        <ul className="wls-roster">
          {roster.map(w => (
            <li key={w.id} className="wls-roster-row">
              <span className="wls-roster-name">{w.name || '(no name)'}</span>
              <span className="wls-roster-meta">{w.lifeStage || '—'}</span>
              {isRegisteredLeaderName(w.name) && <span className="pg-leader-tag">🧑‍🏫 Leader</span>}
              <button type="button" className="wls-roster-open" onClick={() => onOpenWoman(w.id)}>Open →</button>
              <button type="button" className="wa-comm-del" onClick={() => onRemoveFromRoster(w.id)} title="Remove from this group">✕</button>
            </li>
          ))}
          {manualRoster.map(m => (
            <li key={m.id} className="wls-roster-row">
              <span className="wls-roster-name">{m.name}</span>
              <span className="wls-roster-meta">Added by hand</span>
              <button type="button" className="wa-comm-del" onClick={() => onRemoveManualMember(m.id)} title="Remove from this group">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="pg-roster-add">
        <input
          type="text"
          className="ys-inp"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!exactMatch) addManual(); } }}
          placeholder="Search All Women or type a name to add…"
        />
        {!exactMatch && (
          <button type="button" className="ys-add-btn" disabled={!search.trim()} onClick={addManual} title="Add as a new, unlinked member">
            ＋ Add
          </button>
        )}
      </div>

      {search.trim() && (
        <ul className="pg-roster-results">
          {results.length === 0 ? (
            <li className="pg-roster-results-empty">No match in All Women — “{search.trim()}” will be added as a new, unlinked member.</li>
          ) : (
            results.map(w => (
              <li key={w.id} className="pg-roster-result-row">
                <span className="wls-roster-name">{w.name}</span>
                <span className="wls-roster-meta">{w.lifeStage || '—'}</span>
                <button type="button" className="ys-add-btn" onClick={() => pickResult(w.id)}>＋ Add</button>
              </li>
            ))
          )}
        </ul>
      )}

      {group.label && (
        <button
          type="button"
          className="app-btn ghost"
          style={{ alignSelf: 'flex-start', padding: '7px 12px', fontSize: 12 }}
          onClick={() => onOpenRoster(group.label)}
        >
          Manage in All Women →
        </button>
      )}
    </Section>
  );
}

/* ── Prayer request log ─────────────────────────────────────── */
function RequestsSection({ group, allWomen, onChange }) {
  const [text, setText] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [revealed, setRevealed] = useState(() => new Set());
  const [answeringId, setAnsweringId] = useState(null);
  const [answerNote, setAnswerNote] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);

  const requests = Array.isArray(group.requests) ? group.requests : [];
  const activeReqs   = [...requests].filter(r => r.status !== 'answered').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const answeredReqs = [...requests].filter(r => r.status === 'answered').sort((a, b) => (b.answeredAt || '').localeCompare(a.answeredAt || ''));

  const addRequest = () => {
    const content = text.trim();
    if (!content) return;
    const entry = {
      id: makeId('pgr'),
      text: content,
      requestedBy: requestedBy.trim(),
      date: today(),
      status: 'active',
      sensitive,
      answeredNote: '',
      answeredAt: '',
      createdAt: new Date().toISOString(),
    };
    onChange({ requests: [entry, ...requests] });
    setText(''); setRequestedBy(''); setSensitive(false);
  };

  const startAnswer = (id) => { setAnsweringId(id); setAnswerNote(''); };

  const commitAnswer = (id) => {
    onChange({
      requests: requests.map(r => r.id === id
        ? { ...r, status: 'answered', answeredNote: answerNote.trim(), answeredAt: today() }
        : r),
    });
    setAnsweringId(null);
    setAnswerNote('');
  };

  const reopenRequest = (id) => {
    onChange({ requests: requests.map(r => r.id === id ? { ...r, status: 'active', answeredNote: '', answeredAt: '' } : r) });
  };

  const removeRequest = (id) => onChange({ requests: requests.filter(r => r.id !== id) });

  const toggleReveal = (id) => {
    setRevealed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Section title="Prayer requests">
      <Field label="New request">
        <textarea
          className="ys-inp ys-textarea"
          rows={2}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What to pray for…"
        />
      </Field>
      <Row>
        <Field label="Requested by">
          <input
            type="text"
            className="ys-inp"
            list={`pg-members-${group.id}`}
            value={requestedBy}
            onChange={e => setRequestedBy(e.target.value)}
            placeholder="Search All Women or type a name…"
          />
          <datalist id={`pg-members-${group.id}`}>
            {allWomen.filter(w => (w.name || '').trim()).map(w => <option key={w.id} value={w.name} />)}
          </datalist>
        </Field>
        <Field label="Sensitive">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)} />
            <span>Blur until opened</span>
          </label>
        </Field>
      </Row>
      <button type="button" className="ys-add-btn" disabled={!text.trim()} onClick={addRequest}>＋ Add request</button>

      {activeReqs.length > 0 && (
        <ul className="pg-req-list">
          {activeReqs.map(r => (
            <li key={r.id} className="pg-req-row">
              <div className="pg-req-head">
                <span className="pg-req-meta">
                  {r.requestedBy || 'Anonymous'} · {r.date}
                  {r.sensitive && <span className="pg-req-sensitive-tag"> · 🔒 sensitive</span>}
                </span>
                <button type="button" className="wa-comm-del" onClick={() => removeRequest(r.id)}>✕</button>
              </div>
              <div
                className={`pg-req-text${r.sensitive && !revealed.has(r.id) ? ' is-blurred' : ''}`}
                onClick={() => r.sensitive && toggleReveal(r.id)}
              >
                {r.sensitive && !revealed.has(r.id) ? 'Tap to reveal sensitive request' : r.text}
              </div>
              {answeringId === r.id ? (
                <div className="pg-answer-form">
                  <input
                    type="text"
                    className="ys-inp"
                    autoFocus
                    placeholder="Praise note (optional)"
                    value={answerNote}
                    onChange={e => setAnswerNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitAnswer(r.id); } }}
                  />
                  <button type="button" className="wa-comm-done" onClick={() => commitAnswer(r.id)}>✓ Save</button>
                  <button type="button" className="wa-comm-del" onClick={() => setAnsweringId(null)}>✕</button>
                </div>
              ) : (
                <button type="button" className="pg-answer-btn" onClick={() => startAnswer(r.id)}>✓ Mark answered</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {answeredReqs.length > 0 && (
        <div className="pg-answered-wrap">
          <button type="button" className="pg-answered-toggle" onClick={() => setShowAnswered(v => !v)}>
            {showAnswered ? '▾' : '▸'} Answered ({answeredReqs.length})
          </button>
          {showAnswered && (
            <ul className="pg-req-list">
              {answeredReqs.map(r => (
                <li key={r.id} className="pg-req-row is-answered">
                  <div className="pg-req-head">
                    <span className="pg-req-meta">{r.requestedBy || 'Anonymous'} · asked {r.date} · answered {r.answeredAt}</span>
                    <button type="button" className="wa-comm-del" onClick={() => removeRequest(r.id)}>✕</button>
                  </div>
                  <div className="pg-req-text">{r.text}</div>
                  {r.answeredNote && <div className="pg-req-praise">🎉 {r.answeredNote}</div>}
                  <button type="button" className="pg-answer-btn ghost" onClick={() => reopenRequest(r.id)}>↺ Reopen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
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
