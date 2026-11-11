import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
/* Rose-gold pass: this page now mirrors Life Stages' actual shape —
   a type sidebar + detail dashboard, not a photo-directory grid — so
   it shares LifeStages.css's .wls-* panel/sidebar/roster system
   directly (same embossed rose-gold surfaces, same cursive headings)
   plus the .ys-* form primitives from the Youth roster. Only the
   group card + a handful of page-specific bits below are their own
   classes, prefix .sg- */
import '../youth/AllStudents.css';
import './LifeStages.css';
import './SupportGroups.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Care → Support Groups

   Standing recovery/support groups — grief, divorce care, addiction
   recovery, abuse recovery, mental health — distinct from Prayer
   Groups (which are general intercession groups). A group's TYPE
   plays the same role here that a life STAGE plays on that page, so
   the layout follows suit: a type sidebar on the left, and a detail
   dashboard (stats, the type's groups, and a group's full editor
   when one is selected) on the right. Each group keeps its own
   roster (name + optional link into 'womens:women' for photo/
   contact), unlike Prayer Groups' roster which is derived from a
   shared field on the woman's record — support-group membership is
   sensitive enough that it's kept local to this page rather than
   written back onto her public profile.

   Storage: useUserStoreKey('womens:support-groups', [])

   Meeting → Calendar: same opt-in sync pattern as Prayer Groups —
   when "Sync meeting to Calendar" is on and a weekday is set, the
   next several occurrences are (re)computed and written to the
   shared calendar (source 'women-support-group'), replacing this
   group's prior synced events each time.
   ───────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQUENCY_META = {
  weekly:   { label: 'Weekly',        stepDays: 7 },
  biweekly: { label: 'Every 2 weeks', stepDays: 14 },
  monthly:  { label: 'Monthly',       stepDays: null },
};
const FREQUENCY_ORDER = ['weekly', 'biweekly', 'monthly'];
const OCCURRENCE_COUNT = 6;

const TYPE_META = {
  grief:     { label: 'Grief Recovery',     icon: '🕊️', blurb: 'Walking with women through the loss of a parent, spouse, child, or friend.' },
  divorce:   { label: 'Divorce Care',       icon: '💔', blurb: 'Support and stability for women navigating separation or divorce.' },
  addiction: { label: 'Addiction Recovery', icon: '🌿', blurb: 'Recovery-focused support for women working through addiction, one step at a time.' },
  abuse:     { label: 'Abuse Recovery',     icon: '🛡️', blurb: 'A safe, confidential space for survivors of abuse to heal and reconnect.' },
  mental:    { label: 'Mental Health',      icon: '🧠', blurb: 'Care and community for women managing anxiety, depression, or other mental health needs.' },
  other:     { label: 'Other',              icon: '🫂', blurb: 'Any other standing support or recovery group.' },
};
const TYPE_ORDER = ['grief', 'divorce', 'addiction', 'abuse', 'mental', 'other'];

const CAL_SOURCE_MEETING = 'women-support-group';
const CAL_COLOR_MEETING  = '#f472b6';

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'Closed' },
  { id: 'all',    label: 'All' },
];

const DEFAULT_GROUP = (type) => ({
  id:             makeId('sg'),
  label:          '',
  type:           type || 'other',
  facilitator:    '',
  day:            '',
  time:           '',
  location:       '',
  frequency:      'weekly',
  openToNew:      true,
  description:    '',
  syncToCalendar: false,
  roster:         [], // [{ id, name, womanId }]
  notes:          '',
  status:         'active', // active | closed
  closedDate:     '',
  closedNote:     '',
  createdAt:      Date.now(),
});

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

export default function SupportGroups() {
  const [groups, setGroups, { loading }] = useUserStoreKey('womens:support-groups', []);
  const [women] = useUserStoreKey('womens:women', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(groups) ? groups : [];
  const womenList = Array.isArray(women) ? women : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [activeType, setActiveType] = useState(TYPE_ORDER[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const syncMeetingCalendarFor = (group) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const prefix = `${group.id}__meeting__`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE_MEETING && (e.source_id || '').startsWith(prefix)));
      if (!group.syncToCalendar || !group.day) return others;
      const dates = nextOccurrences(group.day, group.frequency, OCCURRENCE_COUNT);
      const meta = TYPE_META[group.type || 'other'] || TYPE_META.other;
      const fresh = dates.map((d) => ({
        id:              'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        created_at:      new Date().toISOString(),
        title:           `${meta.icon} ${group.label || 'Support group'}`,
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

  useEffect(() => {
    if (loading) return;
    list.forEach(g => { if (g.syncToCalendar && g.day) syncMeetingCalendarFor(g); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const groupsByType = useMemo(() => {
    const map = {};
    for (const t of TYPE_ORDER) map[t] = [];
    for (const g of list) {
      const t = g.type && map[g.type] ? g.type : 'other';
      map[t].push(g);
    }
    for (const t of TYPE_ORDER) map[t].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return map;
  }, [list]);

  const typeStats = (type) => {
    const g = groupsByType[type] || [];
    const total = g.length;
    const closedCount = g.filter(x => x.status === 'closed').length;
    const openCount = g.filter(x => x.status !== 'closed' && x.openToNew !== false).length;
    const members = g.reduce((sum, x) => sum + (Array.isArray(x.roster) ? x.roster.length : 0), 0);
    const emptyRoster = g.filter(x => x.status !== 'closed' && (!Array.isArray(x.roster) || x.roster.length === 0)).length;
    return { total, closedCount, openCount, members, emptyRoster };
  };

  const visibleGroups = useMemo(() => {
    let out = groupsByType[activeType] || [];
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(g =>
        (g.label || '').toLowerCase().includes(q) ||
        (g.facilitator || '').toLowerCase().includes(q) ||
        (g.day || '').toLowerCase().includes(q));
    }
    if (statusFilter === 'active') out = out.filter(g => (g.status || 'active') !== 'closed');
    else if (statusFilter === 'closed') out = out.filter(g => g.status === 'closed');
    return out;
  }, [groupsByType, activeType, query, statusFilter]);

  const selected = useMemo(() => list.find(g => g.id === selectedId) || null, [list, selectedId]);

  const addGroup = (type) => {
    const g = DEFAULT_GROUP(type || activeType);
    setGroups(prev => [...(prev || []), g]);
    setSelectedId(g.id);
  };

  const updateGroup = (id, patch) => {
    const current = list.find(g => g.id === id);
    setGroups(prev => (prev || []).map(g => g.id === id ? { ...g, ...patch } : g));
    if (!current) return;
    const merged = { ...current, ...patch };
    if (patch.day !== undefined || patch.time !== undefined || patch.frequency !== undefined ||
        patch.location !== undefined || patch.syncToCalendar !== undefined || patch.label !== undefined ||
        patch.type !== undefined) {
      syncMeetingCalendarFor(merged);
    }
  };

  const removeGroup = (id) => {
    setGroups(prev => (prev || []).filter(g => g.id !== id));
    removeMeetingCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  const addRosterMember = (groupId, name, womanId) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const current = list.find(g => g.id === groupId);
    if (!current) return;
    const roster = Array.isArray(current.roster) ? current.roster : [];
    if (roster.some(m => (m.name || '').toLowerCase() === trimmed.toLowerCase())) return;
    updateGroup(groupId, { roster: [...roster, { id: makeId('sgm'), name: trimmed, womanId: womanId || null }] });
  };

  const removeRosterMember = (groupId, memberId) => {
    const current = list.find(g => g.id === groupId);
    if (!current) return;
    updateGroup(groupId, { roster: (current.roster || []).filter(m => m.id !== memberId) });
  };

  const closeGroup = (id, { closedNote } = {}) => {
    updateGroup(id, { status: 'closed', closedDate: today(), closedNote: (closedNote || '').trim() });
  };

  const reopenGroup = (id) => {
    updateGroup(id, { status: 'active', closedDate: '', closedNote: '' });
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  const selectType = (type) => {
    setActiveType(type);
    setSelectedId(null);
  };

  return (
    <WomensShell
      title="Support Groups"
      icon="🫂"
      subtitle="Standing recovery and support groups — grief, divorce care, addiction recovery — with facilitator, meeting info, and roster."
      actions={
        <button type="button" className="wms-btn primary" onClick={() => addGroup(activeType)}>
          ✦ New group
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wls-root">
        {loading && list.length === 0 ? (
          <div className="wls-empty-note" style={{ padding: '40px 0' }}>Loading…</div>
        ) : list.length === 0 ? (
          <div className="wls-empty app-empty">
            <div className="app-empty-icon">🫂</div>
            <div className="app-empty-title">No support groups yet</div>
            <div className="app-empty-sub">
              Add each standing recovery group — grief, divorce care, addiction
              recovery — with a facilitator, meeting info, and roster.
            </div>
            <button type="button" className="app-btn primary" onClick={() => addGroup('grief')}>
              ✦ Add your first group
            </button>
          </div>
        ) : (
          <div className="wls-split">
            <TypeSidebar activeType={activeType} onSelect={selectType} countFor={(t) => (groupsByType[t] || []).length} />

            <div className="wls-detail">
              <TypeDashboard type={activeType} stats={typeStats(activeType)} />

              <GroupsPanel
                groups={visibleGroups}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
                onAdd={() => addGroup(activeType)}
                query={query}
                onQueryChange={setQuery}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
              />

              {selected && (
                <GroupDetailPanel
                  group={selected}
                  women={womenList}
                  onChange={(patch) => updateGroup(selected.id, patch)}
                  onDelete={() => removeGroup(selected.id)}
                  onClose={() => setSelectedId(null)}
                  onAddMember={(name, womanId) => addRosterMember(selected.id, name, womanId)}
                  onRemoveMember={(memberId) => removeRosterMember(selected.id, memberId)}
                  onOpenWoman={openWoman}
                  onCloseGroup={(payload) => closeGroup(selected.id, payload)}
                  onReopenGroup={() => reopenGroup(selected.id)}
                />
              )}
            </div>
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

/* ── 1. Type sidebar ───────────────────────────────────────────
   Group type stands in for "life stage" here — a flat list (types
   aren't a sequence, so no arrow connectors), same node styling as
   the Life Stages sidebar. */
function TypeSidebar({ activeType, onSelect, countFor }) {
  return (
    <nav className="wls-sidebar" aria-label="Support group types">
      <div className="wls-sidebar-list">
        {TYPE_ORDER.map(type => (
          <div key={type} className="wls-sidebar-item">
            <TypeNode
              type={type}
              active={type === activeType}
              count={countFor(type)}
              onClick={() => onSelect(type)}
            />
          </div>
        ))}
      </div>
    </nav>
  );
}

function TypeNode({ type, active, count, onClick }) {
  const meta = TYPE_META[type];
  return (
    <button type="button" className={`wls-node vertical${active ? ' on' : ''}`} onClick={onClick}>
      <span className="wls-node-icon">{meta.icon}</span>
      <span className="wls-node-name">{meta.label}</span>
      <span className="wls-node-count">{count}</span>
    </button>
  );
}

/* ── 2. Type dashboard — stats for the active type ─────────────── */
function TypeDashboard({ type, stats }) {
  const meta = TYPE_META[type];
  return (
    <section className="wls-panel">
      <div className="wls-panel-hd">
        <span className="wls-panel-icon">{meta.icon}</span>
        <div>
          <h2 className="wls-panel-title">{meta.label}</h2>
          {meta.blurb && <div className="wls-panel-blurb">{meta.blurb}</div>}
        </div>
      </div>

      <div className="wls-stat-row">
        <div className="wls-stat"><span className="wls-stat-n">{stats.total}</span><span className="wls-stat-lbl">Groups</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.members}</span><span className="wls-stat-lbl">Women in a group</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.openCount}</span><span className="wls-stat-lbl">Open to new</span></div>
        <div className="wls-stat"><span className="wls-stat-n">{stats.closedCount}</span><span className="wls-stat-lbl">Closed</span></div>
        <div className={`wls-stat is-days tier-${stats.emptyRoster > 0 ? 'warn' : 'good'}`}>
          <span className="wls-stat-n">{stats.emptyRoster}</span><span className="wls-stat-lbl">No one enrolled yet</span>
        </div>
      </div>
    </section>
  );
}

/* ── 3. Groups panel — search/filter + grid + add ──────────────── */
function GroupsPanel({ groups, selectedId, onSelect, onAdd, query, onQueryChange, statusFilter, onStatusFilter }) {
  return (
    <section className="wls-panel">
      <div className="wls-panel-row">
        <h3 className="wls-panel-subtitle">Groups</h3>
        <button type="button" className="ys-add-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onAdd}>＋ Add group</button>
      </div>

      <div className="sg-toolbar">
        <div className="sg-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search by group, facilitator, day…"
          />
          {query && <button type="button" className="sg-search-clear" onClick={() => onQueryChange('')} aria-label="Clear search">✕</button>}
        </div>
        <div className="wls-roster-filters">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`wls-filter-chip${statusFilter === f.id ? ' on' : ''}`}
              onClick={() => onStatusFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="wls-empty-note">
          {query ? `No groups match "${query}".` : 'No groups of this type yet.'}
        </div>
      ) : (
        <div className="wls-group-grid">
          {groups.map(g => (
            <GroupCard key={g.id} group={g} active={g.id === selectedId} onClick={() => onSelect(g.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupCard({ group, active, onClick }) {
  const freq = FREQUENCY_META[group.frequency] || FREQUENCY_META.weekly;
  const rosterCount = Array.isArray(group.roster) ? group.roster.length : 0;

  return (
    <button type="button" className={`sg-card${active ? ' on' : ''}`} onClick={onClick}>
      <div className="sg-card-top">
        <span className="sg-card-title">{group.label || '(untitled group)'}</span>
        {group.status === 'closed' ? (
          <span className="sg-badge is-closed">🗄 Closed</span>
        ) : (
          <span className={`sg-badge ${group.openToNew === false ? 'is-closed' : 'is-open'}`}>
            {group.openToNew === false ? '🔒 Closed to new' : '🚪 Open'}
          </span>
        )}
      </div>
      {group.facilitator && <div className="sg-card-line">🧑‍🏫 {group.facilitator}</div>}
      {(group.day || group.time) && (
        <div className="sg-card-line">
          📅 {[group.day, group.time].filter(Boolean).join(' · ')} {group.day ? `· ${freq.label}` : ''}
        </div>
      )}
      {group.location && <div className="sg-card-line">📍 {group.location}</div>}
      <div className="sg-card-foot">
        <span className="sg-card-roster">{rosterCount} {rosterCount === 1 ? 'woman' : 'women'}</span>
      </div>
    </button>
  );
}

/* ── 4. Group detail / edit panel ──────────────────────────────── */
function GroupDetailPanel({ group, women, onChange, onDelete, onClose, onAddMember, onRemoveMember, onOpenWoman, onCloseGroup, onReopenGroup }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [memberDraft, setMemberDraft] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const roster = Array.isArray(group.roster) ? group.roster : [];

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const commitMember = () => {
    const name = memberDraft.trim();
    if (!name) return;
    const match = women.find(w => (w.name || '').toLowerCase() === name.toLowerCase());
    onAddMember(name, match ? match.id : null);
    setMemberDraft('');
  };

  return (
    <form className="ys-form wls-panel sg-detail-panel" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="sg-detail-icon">{TYPE_META[group.type || 'other'].icon}</span>
          <input
            type="text"
            className="ys-inp sg-title-inp"
            value={group.label || ''}
            onChange={set('label')}
            placeholder="Group name"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className={`sg-del-btn${confirmDel ? ' armed' : ''}`}
            onClick={() => {
              if (confirmDel) { onDelete(); return; }
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3500);
            }}
          >
            {confirmDel ? 'Click again to delete' : '🗑 Delete'}
          </button>
          <button type="button" className="wls-group-del" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>
      </div>

      <Section title="Details">
        <Row>
          <Field label="Type">
            <select className="ys-inp" value={group.type || 'other'} onChange={set('type')}>
              {TYPE_ORDER.map(id => <option key={id} value={id}>{TYPE_META[id].icon} {TYPE_META[id].label}</option>)}
            </select>
          </Field>
          <Field label="Open to new members">
            <label className="sg-check">
              <input type="checkbox" checked={group.openToNew !== false} onChange={set('openToNew')} />
              <span>Open</span>
            </label>
          </Field>
        </Row>
        <Field label="Facilitator">
          <input type="text" className="ys-inp" value={group.facilitator || ''} onChange={set('facilitator')} placeholder="Who leads this group" />
        </Field>
        <Row>
          <Field label="Day">
            <select className="ys-inp" value={group.day || ''} onChange={set('day')}>
              <option value="">—</option>
              {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Time">
            <input type="text" className="ys-inp" value={group.time || ''} onChange={set('time')} placeholder="e.g. 7:00 PM" />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input type="text" className="ys-inp" value={group.location || ''} onChange={set('location')} placeholder="e.g. Room 204 / Zoom" />
          </Field>
          <Field label="Frequency">
            <select className="ys-inp" value={group.frequency || 'weekly'} onChange={set('frequency')}>
              {FREQUENCY_ORDER.map(id => <option key={id} value={id}>{FREQUENCY_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="Description">
          <textarea className="ys-inp ys-textarea" rows={2} value={group.description || ''} onChange={set('description')} placeholder="What this group is for, format, curriculum used…" />
        </Field>
        <label className="sg-check" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <input type="checkbox" checked={!!group.syncToCalendar} onChange={set('syncToCalendar')} disabled={!group.day} />
          <span>Sync meeting to Calendar{!group.day ? ' (set a day first)' : ''}</span>
        </label>
      </Section>

      <Section title={`Roster (${roster.length})`}>
        <Row>
          <Field label="Add member">
            <input
              type="text"
              className="ys-inp"
              list="sg-women-datalist"
              value={memberDraft}
              onChange={e => setMemberDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitMember(); } }}
              placeholder="Name (matches to All Women if found)"
            />
            <datalist id="sg-women-datalist">
              {women.map(w => <option key={w.id} value={w.name} />)}
            </datalist>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="ys-add-btn" disabled={!memberDraft.trim()} onClick={commitMember}>＋ Add</button>
          </div>
        </Row>
        {roster.length === 0 ? (
          <div className="wls-empty-note">No one added yet.</div>
        ) : (
          <ul className="wls-roster">
            {roster.map(m => (
              <li key={m.id} className="wls-roster-row">
                <div className="wls-roster-top">
                  <span className="wls-roster-name">{m.name}</span>
                  {m.womanId
                    ? <button type="button" className="wls-roster-open" onClick={() => onOpenWoman(m.womanId)}>Open →</button>
                    : <span className="sg-roster-unlinked">not in directory</span>}
                  <button type="button" className="wls-leader-delete" title="Remove" onClick={() => onRemoveMember(m.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Facilitator notes">
        <textarea
          className="ys-inp ys-textarea"
          rows={3}
          value={group.notes || ''}
          onChange={set('notes')}
          placeholder="Session themes, concerns to watch, wins to celebrate…"
        />
      </Section>

      <Section title="Close out">
        {group.status === 'closed' ? (
          <>
            <div className="wls-empty-note">
              Closed {group.closedDate}{group.closedNote ? ` — ${group.closedNote}` : ''}
            </div>
            <button type="button" className="wls-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onReopenGroup}>↺ Reopen group</button>
          </>
        ) : closing ? (
          <>
            <Field label="Closing note">
              <textarea
                className="ys-inp ys-textarea"
                rows={2}
                autoFocus
                value={closeNote}
                onChange={e => setCloseNote(e.target.value)}
                placeholder="Why this group is closing / disbanding…"
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="wls-btn-confirm" onClick={() => { onCloseGroup({ closedNote: closeNote }); setClosing(false); setCloseNote(''); }}>
                Confirm close
              </button>
              <button type="button" className="wls-btn-ghost" onClick={() => { setClosing(false); setCloseNote(''); }}>Cancel</button>
            </div>
          </>
        ) : (
          <button type="button" className="wls-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setClosing(true)}>
            🗄 Mark group as closed
          </button>
        )}
      </Section>
    </form>
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
