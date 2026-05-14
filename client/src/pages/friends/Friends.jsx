import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { friendsService } from '../../services/friendsService';
import { prayerService } from '../../services/prayerService';
import { format, parseISO, differenceInDays, addDays, addYears, isBefore, startOfDay } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import './Friends.css';

/* ─────────────────────────────────────────────────────────────
   Static config
   ───────────────────────────────────────────────────────────── */
const COLORS = [
  ['#3730a3','#6c3fc9'],['#0f6e56','#1d9e75'],['#854f0b','#d4720a'],
  ['#9d174d','#c2326e'],['#185fa5','#378add'],['#3c3489','#7f77dd'],
];

const FREQ_DAYS = {
  daily:    1,
  weekly:   7,
  biweekly: 14,
  monthly:  30,
};

const WEEK_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Structured relationship status — drives smart-section filters + a profile pill. */
const FRIEND_STATUS_OPTIONS = [
  { value: '',                   label: '— Pick one —',     emoji: '' },
  { value: 'Close friend',       label: 'Close friend',     emoji: '💛' },
  { value: 'Family',             label: 'Family',           emoji: '👨‍👩‍👧' },
  { value: 'Co-worker',          label: 'Co-worker',        emoji: '💼' },
  { value: 'Church friend',      label: 'Church friend',    emoji: '⛪' },
  { value: 'Prayer partner',     label: 'Prayer partner',   emoji: '🙏' },
  { value: 'Mentor',             label: 'Mentor',           emoji: '🌳' },
  { value: 'Mentee',             label: 'Mentee',           emoji: '🌱' },
  { value: 'Neighbor',           label: 'Neighbor',         emoji: '🏡' },
  { value: 'Acquaintance',       label: 'Acquaintance',     emoji: '👋' },
  { value: 'Other',              label: 'Other',            emoji: '✨' },
];
const getFriendStatus = (v) => FRIEND_STATUS_OPTIONS.find(s => s.value === v);

const TABS = [
  { key: 'profile', label: 'Profile & Reach Out', emoji: '👤',
    hint: 'Who they are, what they’re walking through, and when you last reached out. Use “Reached Out Today” to log a check-in.' },
  { key: 'prayers', label: 'Prayer Requests',     emoji: '🙏',
    hint: 'All prayers + praises from your Prayers tab linked to this friend. Click any card to expand, or open it in Prayers.' },
  { key: 'events',  label: 'Events & Birthdays',  emoji: '📅',
    hint: 'Birthdays and upcoming events for this friend. Add anything worth remembering.' },
  { key: 'notes',   label: 'Notes',               emoji: '📝',
    hint: 'A running journal of conversations, encouragements, and moments worth remembering.' },
];

const EMPTY_FRIEND = {
  name: '', role: '', church: '', nickname: '', city: '',
  life_season: '', life_update: '', emotional_status: 'peaceful',
  birthday: '', how_met: '', tags: [], interests: [],
  communication_frequency: 'weekly',
  reach_out_days: [],
  friend_status: '',
};

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
const safeParseDate = (s) => {
  if (!s) return null;
  try { return parseISO(s.includes('T') ? s : s.replace(' ', 'T')); }
  catch { return null; }
};

const daysSince = (s) => {
  const d = safeParseDate(s);
  return d ? differenceInDays(new Date(), d) : null;
};

/**
 * Compute the next scheduled reach-out date.
 * - If `reach_out_days` (list of weekdays) is set, find the next matching weekday
 *   after the last contact (or starting today if never contacted).
 * - Otherwise fall back to `communication_frequency` (interval-based cadence).
 * Returns a Date or null if no schedule could be determined.
 */
const nextScheduledDate = (friend) => {
  const days = (friend.reach_out_days || [])
    .map(d => DAY_INDEX[d])
    .filter(n => n !== undefined);

  if (days.length > 0) {
    const today = startOfDay(new Date());
    const start = friend.last_contacted
      ? addDays(startOfDay(safeParseDate(friend.last_contacted) || today), 1)
      : today;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (days.includes(d.getDay())) return d;
    }
    return null;
  }

  if (!friend.last_contacted) return null;
  const last = safeParseDate(friend.last_contacted);
  if (!last) return null;
  const interval = FREQ_DAYS[friend.communication_frequency] ?? 7;
  return addDays(startOfDay(last), interval);
};

/**
 * Reach-out status: { state, overdue, daysUntil, neverContacted, dueDate, scheduleLabel }
 * - state: 'never' | 'overdue' | 'due-today' | 'upcoming'
 */
const reachOutStatus = (friend) => {
  const today = startOfDay(new Date());
  const dueDate = nextScheduledDate(friend);
  const scheduleLabel = (friend.reach_out_days || []).length > 0
    ? friend.reach_out_days.join(', ')
    : (friend.communication_frequency || 'weekly');

  if (!friend.last_contacted && (friend.reach_out_days || []).length === 0) {
    return { state: 'never', neverContacted: true, overdue: null, dueDate: null, scheduleLabel };
  }
  if (!dueDate) {
    return { state: 'never', neverContacted: !friend.last_contacted, dueDate: null, scheduleLabel };
  }
  const diff = differenceInDays(dueDate, today);
  if (diff < 0)  return { state: 'overdue',   overdue: -diff,    daysUntil: diff,  dueDate, scheduleLabel };
  if (diff === 0) return { state: 'due-today', overdue: 0,        daysUntil: 0,     dueDate, scheduleLabel };
  return            { state: 'upcoming',   overdue: -diff,    daysUntil: diff,  dueDate, scheduleLabel };
};

/** Human-readable due label, e.g. "Due Wed, May 20", "2d overdue", "Today" */
const dueLabel = (friend) => {
  const r = reachOutStatus(friend);
  if (r.state === 'never')     return 'No schedule set';
  if (r.state === 'overdue')   return `${r.overdue}d overdue`;
  if (r.state === 'due-today') return 'Due today';
  if (r.dueDate) return `Due ${format(r.dueDate, 'EEE, MMM d')}`;
  return '';
};

const daysToBirthday = (friend) => {
  if (!friend.birthday) return null;
  try {
    const bday = parseISO(friend.birthday);
    const now = new Date();
    let next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
    if (isBefore(next, new Date(now.getFullYear(), now.getMonth(), now.getDate()))) {
      next = addYears(next, 1);
    }
    return differenceInDays(next, now);
  } catch { return null; }
};

const tagsInclude = (tags, keywords) => {
  if (!Array.isArray(tags)) return false;
  return tags.some(t => keywords.some(k => t.toLowerCase().includes(k.toLowerCase())));
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ─────────────────────────────────────────────────────────────
   Smart sections
   ───────────────────────────────────────────────────────────── */
const SMART_SECTIONS = [
  {
    key: 'reach',
    label: 'Reach Out Soon',
    emoji: '⚡',
    tone: 'reach',
    subtitle: 'Due today or overdue — based on each friend’s schedule.',
    filter: (f) => {
      const r = reachOutStatus(f);
      return r.state === 'never' || r.state === 'overdue' || r.state === 'due-today';
    },
  },
  {
    key: 'birthdays',
    label: 'Upcoming Birthdays',
    emoji: '🎂',
    tone: 'birthdays',
    subtitle: 'Birthdays in the next 30 days.',
    filter: (f) => {
      const d = daysToBirthday(f);
      return d !== null && d <= 30;
    },
  },
  {
    key: 'close',
    label: 'Close Friends',
    emoji: '💛',
    tone: 'close',
    subtitle: 'Your inner circle.',
    filter: (f) => f.friend_status === 'Close friend' || tagsInclude(f.tags, ['Close', 'Best']),
  },
  {
    key: 'family',
    label: 'Family',
    emoji: '👨‍👩‍👧',
    tone: 'family',
    subtitle: 'Relatives you keep close.',
    filter: (f) => f.friend_status === 'Family' || tagsInclude(f.tags, ['Family']),
  },
  {
    key: 'coworkers',
    label: 'Co-workers',
    emoji: '💼',
    tone: 'coworkers',
    subtitle: 'People you work alongside.',
    filter: (f) => f.friend_status === 'Co-worker',
  },
  {
    key: 'church',
    label: 'Church Community',
    emoji: '⛪',
    tone: 'church',
    subtitle: 'People from your church or ministry.',
    filter: (f) => f.friend_status === 'Church friend' || tagsInclude(f.tags, ['Church', 'Ministry', 'Community']),
  },
  {
    key: 'prayer',
    label: 'Prayer Partners',
    emoji: '🙏',
    tone: 'prayer',
    subtitle: 'Friends you regularly pray with or for.',
    filter: (f) => f.friend_status === 'Prayer partner' || tagsInclude(f.tags, ['Prayer']),
  },
  {
    key: 'mentors',
    label: 'Mentors & Mentees',
    emoji: '🌳',
    tone: 'mentors',
    subtitle: 'People discipling you or being discipled.',
    filter: (f) => f.friend_status === 'Mentor' || f.friend_status === 'Mentee',
  },
  {
    key: 'all',
    label: 'All Friends',
    emoji: '👥',
    tone: 'all',
    subtitle: 'Everyone in your hub.',
    filter: () => true,
  },
];

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Friends() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [friends, setFriends]   = useState([]);
  const [prayers, setPrayers]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [search, setSearch]                     = useState('');
  const [activeSection, setActiveSection]       = useState('all');
  const [expandedSections, setExpandedSections] = useState({ all: true, reach: true });
  const [activeTab, setActiveTab]               = useState('profile');
  const [expandedPrayerId, setExpandedPrayerId] = useState(null);
  const [leftCollapsed, setLeftCollapsed]       = useState(false);
  const [rightCollapsed, setRightCollapsed]     = useState(false);

  // modals
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendForm, setFriendForm]       = useState(EMPTY_FRIEND);
  const [tagInput, setTagInput]           = useState('');
  const [interestInput, setInterestInput] = useState('');

  // inline composers
  const [noteText, setNoteText]   = useState('');
  const [eventForm, setEventForm] = useState({ title: '', event_date: '', description: '' });

  /* ── data loading ────────────────────────────────────────── */
  useEffect(() => { fetchAll(); }, []);

  /* ── Cross-tab deep link: ?friend=ID auto-selects that friend ── */
  useEffect(() => {
    if (friends.length === 0) return;
    const friendId = searchParams.get('friend');
    if (!friendId) return;
    const f = friends.find(x => x.id === Number(friendId));
    if (f) selectFriend(f);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [fr, pr] = await Promise.all([
        friendsService.getFriends(),
        prayerService.getAll(),
      ]);
      setFriends(fr.data.data);
      setPrayers(pr.data.data);
    } catch { setError('Could not load data.'); }
    finally { setLoading(false); }
  };

  /* ── derived ─────────────────────────────────────────────── */
  const filteredBySearch = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return friends;
    return friends.filter(f =>
      f.name?.toLowerCase().includes(s) ||
      f.role?.toLowerCase().includes(s) ||
      f.church?.toLowerCase().includes(s) ||
      (f.tags || []).some(t => t.toLowerCase().includes(s))
    );
  }, [friends, search]);

  const sectionFriends = useMemo(() => {
    const map = {};
    for (const sec of SMART_SECTIONS) {
      map[sec.key] = filteredBySearch.filter(sec.filter);
    }
    return map;
  }, [filteredBySearch]);

  const friendPrayers = useMemo(() => {
    if (!selected) return [];
    return prayers.filter(p =>
      (p.friends || []).some(f => f.id === selected.id)
    );
  }, [prayers, selected]);

  const overdueCount  = sectionFriends.reach?.length || 0;
  const birthdayCount = sectionFriends.birthdays?.length || 0;

  /* ── mutations ───────────────────────────────────────────── */
  const handleAddFriend = async () => {
    if (!friendForm.name.trim()) return;
    try {
      const ci = COLORS[friends.length % COLORS.length];
      await friendsService.addFriend({ ...friendForm, color_from: ci[0], color_to: ci[1] });
      setFriendForm(EMPTY_FRIEND);
      setTagInput(''); setInterestInput('');
      setShowAddFriend(false);
      await fetchAll();
    } catch { setError('Failed to add friend.'); }
  };

  const handleRemoveFriend = async (id) => {
    if (!confirm('Remove this friend?')) return;
    try {
      await friendsService.removeFriend(id);
      if (selected?.id === id) setSelected(null);
      await fetchAll();
    } catch { setError('Failed to remove.'); }
  };

  const handleMarkContacted = async () => {
    if (!selected) return;
    try {
      const res = await friendsService.updateFriend(selected.id, { last_contacted: todayISO() });
      const updated = res.data.data;
      setFriends(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
    } catch { setError('Failed to update.'); }
  };

  const handleUpdateField = async (field, value) => {
    if (!selected) return;
    try {
      const res = await friendsService.updateFriend(selected.id, { [field]: value });
      const updated = res.data.data;
      setFriends(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
    } catch { setError('Failed to update.'); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !selected) return;
    try {
      await friendsService.addTimeline(selected.id, { content: noteText, entry_type: 'note' });
      setNoteText('');
      const res = await friendsService.getFriendDetail(selected.id);
      const detail = res.data.data;
      // merge timeline into our selected
      setSelected(s => ({ ...s, timeline: detail.timeline }));
    } catch { setError('Failed to add note.'); }
  };

  const handleAddEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.event_date || !selected) return;
    try {
      await friendsService.addFriendEvent(selected.id, eventForm);
      setEventForm({ title: '', event_date: '', description: '' });
      const res = await friendsService.getFriendDetail(selected.id);
      const detail = res.data.data;
      setSelected(s => ({ ...s, events: detail.events }));
    } catch { setError('Failed to add event.'); }
  };

  const handleOpenInPrayers = (prayerId) => {
    navigate(`/prayers?prayer=${prayerId}`);
  };

  const handleNewPrayerFor = () => {
    if (!selected) return;
    navigate(`/prayers?new=1&friend=${selected.id}`);
  };

  /* ── selection helpers ───────────────────────────────────── */
  const selectFriend = async (f) => {
    setSelected(f);
    setActiveTab('profile');
    setExpandedPrayerId(null);
    try {
      const res = await friendsService.getFriendDetail(f.id);
      setSelected(res.data.data);
    } catch { /* fall back to summary */ }
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    setActiveSection(key);
  };

  const leftW  = leftCollapsed  ? 'var(--rail-w)' : '300px';
  const rightW = rightCollapsed ? 'var(--rail-w)' : '240px';

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="f-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* TOPBAR */}
      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag friends">Friends</span>
        </div>
        <div className="app-tb-actions">
          <button className="app-btn primary" onClick={() => setShowAddFriend(true)}>✦ Add Friend</button>
          {overdueCount > 0 && (
            <span className="f-topbar-nudge">⚡ {overdueCount} to reach out</span>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="f-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* ── LEFT: Smart sections sidebar ── */}
        <aside className={`f-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">My People</span>}
          </div>

          {!leftCollapsed && (
            <>
              <div className="app-search">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search friends..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="f-search-clear" onClick={() => setSearch('')}>✕</button>
                )}
              </div>

              {error && (
                <div className="f-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}

              <div className="f-sections-scroll">
                {SMART_SECTIONS.map(sec => {
                  const list = sectionFriends[sec.key] || [];
                  if (list.length === 0 && sec.key !== 'all') return null;
                  const open = expandedSections[sec.key] ?? false;
                  return (
                    <div key={sec.key} className={`f-sec f-sec-${sec.tone}`}>
                      <button
                        className={`f-sec-header ${activeSection === sec.key ? 'on' : ''}`}
                        onClick={() => toggleSection(sec.key)}
                        title={sec.subtitle}
                      >
                        <span className="f-sec-emoji">{sec.emoji}</span>
                        <span className="f-sec-label">{sec.label}</span>
                        <span className="f-sec-count">{list.length}</span>
                        <span className="f-sec-chevron">{open ? '▾' : '▸'}</span>
                      </button>
                      {open && sec.subtitle && (
                        <div className="f-sec-subtitle">{sec.subtitle}</div>
                      )}
                      {open && (
                        <div className="f-sec-list">
                          {list.length === 0 ? (
                            <div className="f-sec-empty">No friends here yet.</div>
                          ) : list.map(f => (
                            <FriendRow
                              key={f.id}
                              friend={f}
                              section={sec.key}
                              selected={selected?.id === f.id}
                              onClick={() => selectFriend(f)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {friends.length === 0 && !loading && (
                  <div className="f-empty-list">
                    <div>No friends yet.</div>
                    <button className="app-btn primary" onClick={() => setShowAddFriend(true)}>
                      + Add first friend
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── CENTER ── */}
        <main className="f-center">
          {showAddFriend ? (
            <AddFriendForm
              form={friendForm}
              setForm={setFriendForm}
              tagInput={tagInput}
              setTagInput={setTagInput}
              interestInput={interestInput}
              setInterestInput={setInterestInput}
              onCancel={() => { setShowAddFriend(false); setFriendForm(EMPTY_FRIEND); setTagInput(''); setInterestInput(''); }}
              onSave={handleAddFriend}
            />
          ) : selected ? (
            <FriendDetail
              friend={selected}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              prayers={friendPrayers}
              expandedPrayerId={expandedPrayerId}
              setExpandedPrayerId={setExpandedPrayerId}
              noteText={noteText}
              setNoteText={setNoteText}
              eventForm={eventForm}
              setEventForm={setEventForm}
              onMarkContacted={handleMarkContacted}
              onUpdateField={handleUpdateField}
              onAddNote={handleAddNote}
              onAddEvent={handleAddEvent}
              onRemoveFriend={() => handleRemoveFriend(selected.id)}
              onOpenInPrayers={handleOpenInPrayers}
              onNewPrayerFor={handleNewPrayerFor}
            />
          ) : (
            <EmptyState onAdd={() => setShowAddFriend(true)} count={friends.length} />
          )}
        </main>

        {/* ── RIGHT: Insights ── */}
        <aside className={`f-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">Insights</span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>

          {!rightCollapsed && (
            <div className="f-right-scroll">
              <Section title="Overview">
                <div className="f-stat-grid">
                  <Stat n={friends.length} l="Friends" />
                  <Stat n={overdueCount}   l="Reach Out" color="#fcd34d" />
                  <Stat n={birthdayCount}  l="Birthdays" color="#f9a8d4" />
                  <Stat n={prayers.length} l="Linked"    color="#a78bfa" />
                </div>
              </Section>

              {overdueCount > 0 && (
                <Section title="Reach Out Soon">
                  {(sectionFriends.reach || []).slice(0, 5).map(f => {
                    const r = reachOutStatus(f);
                    const dueClass =
                      r.state === 'overdue'   ? 'is-overdue' :
                      r.state === 'due-today' ? 'is-today'   :
                      r.state === 'never'     ? 'is-never'   : '';
                    return (
                      <button
                        key={f.id}
                        className="f-r-row"
                        onClick={() => selectFriend(f)}
                      >
                        <FriendAv friend={f} />
                        <div className="f-r-row-info">
                          <div className="f-r-row-name">{f.name}</div>
                          <div className={`f-r-row-sub ${dueClass}`}>
                            {dueLabel(f)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </Section>
              )}

              {birthdayCount > 0 && (
                <Section title="Upcoming Birthdays">
                  {(sectionFriends.birthdays || []).slice(0, 5).map(f => {
                    const d = daysToBirthday(f);
                    return (
                      <button
                        key={f.id}
                        className="f-r-row"
                        onClick={() => selectFriend(f)}
                      >
                        <FriendAv friend={f} />
                        <div className="f-r-row-info">
                          <div className="f-r-row-name">{f.name}</div>
                          <div className="f-r-row-sub">
                            {d === 0 ? 'Today! 🎉' : `in ${d} day${d === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </Section>
              )}

              <Section title="Tip">
                <div className="f-tip">
                  💡 Mark your check-ins with "Mark contacted" — it powers the
                  Reach Out Soon list based on each friend's cadence.
                </div>
              </Section>
            </div>
          )}
        </aside>
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Inline Add Friend form (renders in the center column)
   ───────────────────────────────────────────────────────────── */
function AddFriendForm({ form, setForm, tagInput, setTagInput, interestInput, setInterestInput, onCancel, onSave }) {
  return (
    <div className="f-add-form">
      <header className="f-add-form-hd">
        <div className="f-add-form-title">✦ Add Friend</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel" aria-label="Cancel">✕</button>
      </header>

      <div className="f-add-form-body">
        <div className="f-form-section">
          <div className="f-form-section-title">Who they are</div>
          <div className="f-form-row">
            <input className="f-inp" placeholder="Full name *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className="f-inp" placeholder="Nickname"
              value={form.nickname}
              onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
          </div>
          <div className="f-form-field">
            <label className="f-form-lbl">Friend status — how do you know them?</label>
            <select className="f-sel"
              value={form.friend_status || ''}
              onChange={e => setForm(f => ({ ...f, friend_status: e.target.value }))}>
              {FRIEND_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="f-form-row">
            <input className="f-inp" placeholder="Role (e.g. Youth Pastor)"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
            <input className="f-inp" placeholder="Church / Organization"
              value={form.church}
              onChange={e => setForm(f => ({ ...f, church: e.target.value }))} />
          </div>
          <div className="f-form-row">
            <input className="f-inp" placeholder="City"
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            <input className="f-inp" type="date" placeholder="Birthday"
              value={form.birthday}
              onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />
          </div>
        </div>

        <div className="f-form-section">
          <div className="f-form-section-title">Backstory</div>
          <input className="f-inp" placeholder="How you met"
            value={form.how_met}
            onChange={e => setForm(f => ({ ...f, how_met: e.target.value }))} />
          <input className="f-inp" placeholder="Current life season"
            value={form.life_season}
            onChange={e => setForm(f => ({ ...f, life_season: e.target.value }))} />
          <textarea className="f-ta" rows={2} placeholder="Life update / what they're going through..."
            value={form.life_update}
            onChange={e => setForm(f => ({ ...f, life_update: e.target.value }))} />
        </div>

        <div className="f-form-section">
          <div className="f-form-section-title">Reach-out schedule</div>
          <div className="f-form-hint">
            Pick the days of the week you want to check in. Friends become “Due”
            on those days based on the last time you reached out.
          </div>
          <DayPicker
            days={form.reach_out_days || []}
            onChange={(days) => setForm(f => ({ ...f, reach_out_days: days }))}
          />
          <div className="f-form-row" style={{ marginTop: 10 }}>
            <div className="f-form-field">
              <label className="f-form-lbl">Or simple cadence</label>
              <select className="f-sel"
                value={form.communication_frequency}
                onChange={e => setForm(f => ({ ...f, communication_frequency: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="f-form-field">
              <label className="f-form-lbl">Current emotional status</label>
              <select className="f-sel"
                value={form.emotional_status}
                onChange={e => setForm(f => ({ ...f, emotional_status: e.target.value }))}>
                {['peaceful','happy','grateful','reflective','burdened','anxious','joyful','frustrated'].map(v =>
                  <option key={v} value={v}>{v}</option>
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="f-form-section">
          <div className="f-form-section-title">Tags & interests</div>
          <ChipInput
            label="Tags (Close friend, Family, Church, Prayer partner...)"
            value={tagInput}
            setValue={setTagInput}
            chips={form.tags}
            onAdd={(v) => setForm(f => ({ ...f, tags: [...f.tags, v] }))}
            onRemove={(idx) => setForm(f => ({ ...f, tags: f.tags.filter((_, i) => i !== idx) }))}
          />
          <ChipInput
            label="Interests"
            value={interestInput}
            setValue={setInterestInput}
            chips={form.interests}
            onAdd={(v) => setForm(f => ({ ...f, interests: [...f.interests, v] }))}
            onRemove={(idx) => setForm(f => ({ ...f, interests: f.interests.filter((_, i) => i !== idx) }))}
          />
        </div>
      </div>

      <footer className="f-add-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button className="app-btn primary" onClick={onSave} disabled={!form.name.trim()}>
          ✓ Add Friend
        </button>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */
function FriendAv({ friend, size }) {
  return (
    <span
      className={`f-av ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''}`}
      style={{
        background: `linear-gradient(135deg, ${friend.color_from || '#3730a3'}, ${friend.color_to || '#6c3fc9'})`
      }}
    >
      {friend.initials || friend.name?.[0] || '?'}
    </span>
  );
}

function FriendRow({ friend, section, selected, onClick }) {
  const r = reachOutStatus(friend);
  const days = daysToBirthday(friend);
  const dueClass =
    r.state === 'overdue'   ? 'is-overdue' :
    r.state === 'due-today' ? 'is-today'   :
    r.state === 'never'     ? 'is-never'   : '';
  return (
    <button className={`f-row ${selected ? 'sel' : ''}`} onClick={onClick}>
      <FriendAv friend={friend} />
      <div className="f-row-info">
        <div className="f-row-name">{friend.name}</div>
        <div className={`f-row-sub ${section === 'reach' ? dueClass : ''}`}>
          {section === 'reach' && dueLabel(friend)}
          {section === 'birthdays' && (
            days === 0 ? '🎂 Today!' : `🎂 in ${days}d`
          )}
          {section !== 'reach' && section !== 'birthdays' && (
            friend.role || friend.church || 'Friend'
          )}
        </div>
      </div>
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="f-r-section">
      <div className="f-r-section-title">{title}</div>
      {children}
    </div>
  );
}

function Stat({ n, l, color }) {
  return (
    <div className="f-stat">
      <span className="f-stat-n" style={color ? { color } : null}>{n}</span>
      <span className="f-stat-l">{l}</span>
    </div>
  );
}

function DayPicker({ days, onChange }) {
  const toggle = (d) => {
    onChange(days.includes(d) ? days.filter(x => x !== d) : [...days, d]);
  };
  return (
    <div className="f-day-picker">
      <div className="f-day-row">
        {WEEK_DAYS.map(d => (
          <button
            key={d}
            type="button"
            className={`f-day-btn ${days.includes(d) ? 'on' : ''}`}
            onClick={() => toggle(d)}
            title={`Toggle ${d}`}
          >{d[0]}</button>
        ))}
      </div>
      <div className="f-day-presets">
        <button type="button" onClick={() => onChange([...WEEK_DAYS])}>Daily</button>
        <button type="button" onClick={() => onChange(['Mon','Tue','Wed','Thu','Fri'])}>Weekdays</button>
        <button type="button" onClick={() => onChange(['Sat','Sun'])}>Weekends</button>
        <button type="button" onClick={() => onChange(['Mon','Wed','Fri'])}>M / W / F</button>
        <button type="button" className="f-day-clear" onClick={() => onChange([])}>Clear</button>
      </div>
    </div>
  );
}

function ChipInput({ label, value, setValue, chips, onAdd, onRemove }) {
  return (
    <div className="f-chip-input">
      <div className="f-form-lbl">{label}</div>
      <input
        className="f-inp"
        placeholder="Type and press Enter..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            onAdd(value.trim());
            setValue('');
          }
        }}
      />
      {chips.length > 0 && (
        <div className="f-chips-row">
          {chips.map((c, idx) => (
            <span key={idx} className="f-chip">
              {c}
              <button onClick={() => onRemove(idx)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd, count }) {
  return (
    <div className="app-empty f-empty">
      <div className="app-empty-icon">👥</div>
      <div className="app-empty-title">
        {count === 0 ? 'Your hub of people' : 'Pick a friend to dive in'}
      </div>
      <div className="app-empty-sub">
        {count === 0
          ? 'Add the people you walk with — track how you reach out, the prayers you carry for them, the moments worth remembering.'
          : 'Select someone from the sidebar to see their profile, prayers, events, and notes.'}
      </div>

      {count === 0 && (
        <div className="f-start-steps">
          <div className="f-start-title">First time? Try this:</div>
          <ol className="f-start-list">
            <li><b>Tap “Add Friend”</b> — at minimum a name and how you know them.</li>
            <li><b>Pick a check-in cadence</b> (weekly, monthly…) so we can remind you.</li>
            <li><b>Tag them</b> (Close friend, Family, Prayer partner…) — that powers the sidebar groups.</li>
          </ol>
        </div>
      )}

      {count === 0 && (
        <button className="app-btn primary" onClick={onAdd} style={{ marginTop: 16 }}>
          ✦ Add your first friend
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Friend Detail (tabbed)
   ───────────────────────────────────────────────────────────── */
function FriendDetail({
  friend, activeTab, setActiveTab,
  prayers, expandedPrayerId, setExpandedPrayerId,
  noteText, setNoteText, eventForm, setEventForm,
  onMarkContacted, onUpdateField,
  onAddNote, onAddEvent,
  onRemoveFriend, onOpenInPrayers, onNewPrayerFor,
}) {
  const r = reachOutStatus(friend);
  const bday = daysToBirthday(friend);

  return (
    <div className="f-detail">
      {/* Header */}
      <header className="f-detail-hd">
        <div className="f-detail-hd-top">
          <FriendAv friend={friend} size="lg" />
          <div className="f-detail-name-block">
            <h1 className="f-detail-name">
              {friend.name}
              {friend.nickname && <span className="f-detail-nick">"{friend.nickname}"</span>}
            </h1>
            <div className="f-detail-meta">
              {friend.role && <span>{friend.role}</span>}
              {friend.role && friend.church && <span>·</span>}
              {friend.church && <span>{friend.church}</span>}
              {friend.city && <><span>·</span><span>📍 {friend.city}</span></>}
            </div>
            <div className="f-detail-pills">
              {friend.friend_status && (() => {
                const s = getFriendStatus(friend.friend_status);
                return (
                  <span className="f-pill-status">
                    {s?.emoji} {friend.friend_status}
                  </span>
                );
              })()}
              {(friend.tags || []).map((t, i) => (
                <span key={i} className="f-pill-tag">{t}</span>
              ))}
            </div>
          </div>
          <div className="f-detail-actions">
            <button
              className="app-btn primary"
              onClick={onMarkContacted}
              title="Mark contacted today"
            >
              ✓ Reached Out Today
            </button>
            <button className="app-btn ghost icon-only" onClick={onRemoveFriend} title="Remove">🗑</button>
          </div>
        </div>

        {/* Reach-out + birthday banner */}
        <div className="f-banner-row">
          <div className={`f-banner ${r.state === 'overdue' || r.state === 'never' ? 'urgent' : r.state === 'due-today' ? 'today' : ''}`}>
            <span className="f-banner-emoji">⚡</span>
            <div>
              <div className="f-banner-title">
                {r.state === 'never'     && 'No schedule set'}
                {r.state === 'overdue'   && `${r.overdue} day${r.overdue === 1 ? '' : 's'} overdue`}
                {r.state === 'due-today' && 'Due to reach out today'}
                {r.state === 'upcoming'  && r.dueDate &&
                  `Next reach-out: ${format(r.dueDate, 'EEEE, MMM d')}`}
              </div>
              <div className="f-banner-sub">
                {(friend.reach_out_days || []).length > 0
                  ? `Schedule: ${friend.reach_out_days.join(', ')}`
                  : `Cadence: ${friend.communication_frequency || 'weekly'}`}
                {' · '}
                {friend.last_contacted
                  ? `last on ${format(parseISO(friend.last_contacted), 'MMM d')}`
                  : 'no contact logged'}
              </div>
            </div>
          </div>
          {bday !== null && bday <= 60 && (
            <div className="f-banner birthday">
              <span className="f-banner-emoji">🎂</span>
              <div>
                <div className="f-banner-title">
                  {bday === 0 ? 'Birthday today!' :
                   bday === 1 ? 'Birthday tomorrow' :
                   `Birthday in ${bday} days`}
                </div>
                <div className="f-banner-sub">
                  {friend.birthday && format(parseISO(friend.birthday), 'MMMM d')}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="f-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`f-tab ${activeTab === t.key ? 'on' : ''}`}
            onClick={() => setActiveTab(t.key)}
            title={t.hint}
          >
            <span>{t.emoji}</span> {t.label}
            {t.key === 'prayers' && prayers.length > 0 && (
              <span className="f-tab-badge">{prayers.length}</span>
            )}
            {t.key === 'events' && (friend.events?.length || 0) > 0 && (
              <span className="f-tab-badge">{friend.events.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab hint — explains what this tab shows */}
      <div className="f-tab-hint">
        {TABS.find(t => t.key === activeTab)?.hint}
      </div>

      {/* Tab content */}
      <div className="f-tab-body">
        {activeTab === 'profile' && (
          <ProfileTab friend={friend} onUpdateField={onUpdateField} />
        )}
        {activeTab === 'prayers' && (
          <PrayersTab
            friend={friend}
            prayers={prayers}
            expandedId={expandedPrayerId}
            setExpandedId={setExpandedPrayerId}
            onOpenInPrayers={onOpenInPrayers}
            onNewPrayerFor={onNewPrayerFor}
          />
        )}
        {activeTab === 'events' && (
          <EventsTab
            friend={friend}
            form={eventForm}
            setForm={setEventForm}
            onAdd={onAddEvent}
          />
        )}
        {activeTab === 'notes' && (
          <NotesTab
            friend={friend}
            text={noteText}
            setText={setNoteText}
            onAdd={onAddNote}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Profile & Reach Out tab
   ───────────────────────────────────────────────────────────── */
function ProfileTab({ friend, onUpdateField }) {
  return (
    <div className="f-profile">
      <div className="f-profile-grid">
        <ProfileCard title="Life Season">
          {friend.life_season || <span className="f-muted">—</span>}
        </ProfileCard>
        <ProfileCard title="What They're Going Through">
          {friend.life_update || <span className="f-muted">—</span>}
        </ProfileCard>
        <ProfileCard title="How We Met">
          {friend.how_met || <span className="f-muted">—</span>}
        </ProfileCard>
        <ProfileCard title="Interests">
          {(friend.interests || []).length > 0 ? (
            <div className="f-chips-inline">
              {friend.interests.map((i, idx) => (
                <span key={idx} className="f-pill-tag">{i}</span>
              ))}
            </div>
          ) : <span className="f-muted">—</span>}
        </ProfileCard>
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">Friend status</div>
        <select
          className="f-sel"
          value={friend.friend_status || ''}
          onChange={e => onUpdateField('friend_status', e.target.value)}
        >
          {FRIEND_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">Reach-out days</div>
        <div className="f-form-hint">
          Pick the days you want to check in with {friend.name.split(' ')[0]}.
          Due dates in “Reach Out Soon” come from this schedule.
        </div>
        <DayPicker
          days={friend.reach_out_days || []}
          onChange={(days) => onUpdateField('reach_out_days', days)}
        />
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">Or simple cadence (used when no specific days)</div>
        <select
          className="f-sel"
          value={friend.communication_frequency || 'weekly'}
          onChange={e => onUpdateField('communication_frequency', e.target.value)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">Quick note</div>
        <textarea
          className="f-ta"
          rows={3}
          placeholder="Free-form notes about this friend..."
          value={friend.notes || ''}
          onChange={e => onUpdateField('notes', e.target.value)}
        />
      </div>
    </div>
  );
}

function ProfileCard({ title, children }) {
  return (
    <div className="f-profile-card">
      <div className="f-profile-card-title">{title}</div>
      <div className="f-profile-card-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Prayer Requests tab — inline expand + open-in-prayers link
   ───────────────────────────────────────────────────────────── */
function PrayersTab({ friend, prayers, expandedId, setExpandedId, onOpenInPrayers, onNewPrayerFor }) {
  const requests = prayers.filter(p => p.entry_type !== 'praise');
  const praises  = prayers.filter(p => p.entry_type === 'praise');

  return (
    <div className="f-prayers">
      <div className="f-prayers-actions">
        <button className="app-btn primary" onClick={onNewPrayerFor}>
          ✦ New Prayer for {friend.name.split(' ')[0]}
        </button>
        <div className="f-prayers-hint">
          Adds a new prayer in the Prayers tab with {friend.name.split(' ')[0]} already linked.
        </div>
      </div>

      <PrayerGroup
        title="Prayer Requests"
        list={requests}
        emptyMessage="No prayers linked to this friend yet."
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        onOpenInPrayers={onOpenInPrayers}
      />

      {praises.length > 0 && (
        <PrayerGroup
          title="Praise & Thanksgiving"
          list={praises}
          emptyMessage=""
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onOpenInPrayers={onOpenInPrayers}
        />
      )}
    </div>
  );
}

function PrayerGroup({ title, list, emptyMessage, expandedId, setExpandedId, onOpenInPrayers }) {
  return (
    <div className="f-prayer-group">
      <div className="f-group-title">{title} <span className="f-group-count">{list.length}</span></div>
      {list.length === 0 ? (
        emptyMessage && <div className="f-prayer-empty">{emptyMessage}</div>
      ) : (
        <div className="f-prayer-list">
          {list.map(p => (
            <LinkedPrayerCard
              key={p.id}
              prayer={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onOpen={() => onOpenInPrayers(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkedPrayerCard({ prayer, expanded, onToggle, onOpen }) {
  const isPraise = prayer.entry_type === 'praise';
  const statusColor =
    isPraise ? '#f9a8d4' :
    prayer.is_urgent ? '#fca5a5' :
    prayer.status === 'answered' ? '#6ee7b7' :
    prayer.status === 'waiting' ? '#fcd34d' :
    '#c4b5fd';
  const statusLabel =
    isPraise ? '✨ Praise' :
    prayer.is_urgent ? '🔥 Urgent' :
    prayer.status === 'answered' ? '✓ Answered' :
    prayer.status === 'waiting' ? '⏳ Waiting' :
    '🙏 Praying';
  const updates = prayer.updates || [];

  return (
    <article className={`f-linked-prayer ${expanded ? 'open' : ''}`}>
      <button className="f-lp-header" onClick={onToggle}>
        <span className="f-lp-status" style={{ color: statusColor, borderColor: statusColor }}>
          {statusLabel}
        </span>
        <div className="f-lp-title-block">
          <div className="f-lp-title">{prayer.title}</div>
          <div className="f-lp-meta">
            <span>{prayer.category}</span>
            <span>·</span>
            <span>{updates.length} update{updates.length === 1 ? '' : 's'}</span>
            {!!prayer.is_daily && <><span>·</span><span>📆 Daily</span></>}
          </div>
        </div>
        <span className="f-lp-chev">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="f-lp-body">
          <div className="f-lp-content">{prayer.content}</div>
          {prayer.scripture && (
            <div className="f-lp-scripture">📖 {prayer.scripture}</div>
          )}
          {updates.length > 0 && (
            <div className="f-lp-updates">
              <div className="f-lp-updates-title">Recent updates</div>
              {updates.slice(0, 3).map(u => (
                <div key={u.id} className="f-lp-update">
                  <div className="f-lp-update-dot" />
                  <div>
                    <div className="f-lp-update-text">{u.content}</div>
                    <div className="f-lp-update-date">
                      {format(parseISO(u.created_at.replace(' ', 'T')), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              ))}
              {updates.length > 3 && (
                <div className="f-lp-update-more">+{updates.length - 3} more in Prayers tab</div>
              )}
            </div>
          )}
          <div className="f-lp-footer">
            <button className="app-btn ghost" onClick={onOpen}>
              🔗 Open in Prayers tab
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Events & Birthdays tab
   ───────────────────────────────────────────────────────────── */
function EventsTab({ friend, form, setForm, onAdd }) {
  const events = friend.events || [];
  const sortedEvents = [...events].sort((a, b) =>
    (a.event_date || '').localeCompare(b.event_date || '')
  );

  return (
    <div className="f-events">
      {friend.birthday && (
        <div className="f-event-card birthday">
          <span className="f-event-emoji">🎂</span>
          <div className="f-event-info">
            <div className="f-event-title">Birthday</div>
            <div className="f-event-date">
              {format(parseISO(friend.birthday), 'MMMM d')}
            </div>
          </div>
        </div>
      )}

      {sortedEvents.length === 0 ? (
        <div className="f-prayer-empty">No upcoming events.</div>
      ) : (
        <div className="f-event-list">
          {sortedEvents.map(ev => (
            <div key={ev.id} className="f-event-card">
              <span className="f-event-emoji">📅</span>
              <div className="f-event-info">
                <div className="f-event-title">{ev.title}</div>
                {ev.description && (
                  <div className="f-event-desc">{ev.description}</div>
                )}
                <div className="f-event-date">
                  {ev.event_date && format(parseISO(ev.event_date), 'MMMM d, yyyy')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="f-event-composer">
        <div className="f-form-lbl">Add event</div>
        <div className="f-form-row">
          <input
            className="f-inp"
            placeholder="Event title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <input
            className="f-inp"
            type="date"
            value={form.event_date}
            onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
          />
        </div>
        <textarea
          className="f-ta"
          rows={2}
          placeholder="Description (optional)"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            className="app-btn primary"
            disabled={!form.title.trim() || !form.event_date}
            onClick={onAdd}
          >+ Add Event</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Notes tab (timeline journal)
   ───────────────────────────────────────────────────────────── */
function NotesTab({ friend, text, setText, onAdd }) {
  const timeline = friend.timeline || [];
  return (
    <div className="f-notes">
      <div className="f-note-composer">
        <textarea
          className="f-ta"
          rows={3}
          placeholder="Log a conversation, encounter, or something worth remembering..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            className="app-btn primary"
            disabled={!text.trim()}
            onClick={onAdd}
          >+ Add Note</button>
        </div>
      </div>

      {timeline.length === 0 ? (
        <div className="f-prayer-empty">
          No notes yet. Use this as a journal of your friendship — conversations,
          encouragements, moments worth remembering.
        </div>
      ) : (
        <div className="f-note-list">
          {timeline.map(t => (
            <article key={t.id} className="f-note-item">
              <div
                className="f-note-dot"
                style={{ background: t.dot_color || '#c4b5fd' }}
              />
              <div className="f-note-body">
                <div className="f-note-text">{t.content}</div>
                <div className="f-note-date">
                  {format(parseISO(t.created_at.replace(' ', 'T')), 'MMM d, yyyy · h:mm a')}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
