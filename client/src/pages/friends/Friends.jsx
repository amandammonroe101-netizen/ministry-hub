import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { friendsService } from '../../services/friendsService';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { prayerService } from '../../services/prayerService';
import { format, parseISO, differenceInDays, addDays, addYears, isBefore, startOfDay } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { useUserStoreKey } from '../../lib/userStore';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import { useMyConnections } from '../../lib/contactRequests';
import { getProfileByUid } from '../../lib/userProfile';
import { CustomAvatar, AvatarBuilder, DEFAULT_AVATAR } from './Avatar';
import { downloadGuideDocx } from '../../lib/downloadGuideDocx';
import { FRIENDS_GUIDE } from './friendsGuide';
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
  photo_url: '',
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

/* SMART_SECTIONS removed — the smart-section accordion sidebar
   was replaced by the Directory's photo grid + filter chip row.
   Each old section now lives as a filter chip:
     reach / birthdays → cadence-bar tiles + filter chips
     close / family / church / prayer / mentor / coworker
       → filter chip per friend_status value
     all → the default chip
   The Bell + Reach-Out queue use reachOutStatus() directly. */

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Friends() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* Live-synced via Firestore. */
  const [friends, setFriends] = useUserStoreKey('friends',          []);
  const [prayers, setPrayers] = useUserStoreKey('prayer-requests',  []);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const [search, setSearch]                     = useState('');
  const [activeTab, setActiveTab]               = useState('profile');
  const [expandedPrayerId, setExpandedPrayerId] = useState(null);

  /* ── Top-level view ──
        Two focused workspaces in the topbar:
          📇 Directory — photo-first card grid, cadence-sorted
          📰 Timeline  — chronological feed of all activity */
  const [view, setView] = useState('directory');

  /* Directory controls — cadence sort is the default because the
     hero use case is "who do I need to reach out to?" */
  const [directorySort, setDirectorySort]   = useState('cadence');
  const [directoryFilter, setDirectoryFilter] = useState('all');
                          // 'all' | a friend_status value | 'overdue' | 'birthdays'

  /* Profile sub-mode inside the slide-over: View (read-only)
     vs Edit (inputs). Defaults to View — feels less intrusive. */
  const [profileMode, setProfileMode] = useState('view');

  /* Floating Reach-Out walkthrough state. */
  const [reachOutOpen, setReachOutOpen] = useState(false);

  /* Activity bell popover. */
  const [bellOpen, setBellOpen] = useState(false);
  const bellCloseTimer = useRef(null);
  /* Bell items the user has dismissed this session (by item id). They
     stay hidden until the underlying state changes (e.g. the friend
     becomes due again, which mints the same id but we clear it on
     reach-out) or the page reloads. */
  const [dismissedBell, setDismissedBell] = useState(() => new Set());
  const dismissBellItem = (id) =>
    setDismissedBell(prev => new Set(prev).add(id));

  /* Quick-add chip — minimal 2-field form for fast capture. */
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddStatus, setQuickAddStatus] = useState('');

  /* Shared profile-avatar modal (matches Journal + Prayers). */
  const [showProfile, setShowProfile] = useState(false);
  const { avatarSourceName, initials } = useProfileTopbar();

  // modals
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendForm, setFriendForm]       = useState(EMPTY_FRIEND);
  const [tagInput, setTagInput]           = useState('');
  const [interestInput, setInterestInput] = useState('');

  /* Accepted Contacts connections — powers the Add Friend name
     typeahead so picking a match can autofill from their public
     profile (church, avatar, ministry tags) instead of retyping it. */
  const { connections: myContacts } = useMyConnections();

  // inline composers
  const [noteText, setNoteText]   = useState('');
  const [eventForm, setEventForm] = useState({ title: '', event_date: '', description: '' });

  /* Avatar builder — opened for a saved friend or for the add-form.
     `avatarEditor` = { initial, name, onSave(cfg) } or null. */
  const [avatarEditor, setAvatarEditor] = useState(null);

  /* No initial fetch — useUserStoreKey loads via onSnapshot. */

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

  /* sectionFriends / SMART_SECTIONS were the data backing the old
     accordion sidebar — replaced by directoryList + cadenceSummary
     (defined further down) and the bell / Reach-Out queue. */

  const friendPrayers = useMemo(() => {
    if (!selected) return [];
    return prayers.filter(p =>
      (p.friends || []).some(f => f.id === selected.id)
    );
  }, [prayers, selected]);

  /* ── Cadence-aware directory ──
        Default sort surfaces "who do I need to reach out to first?"
        at the top: overdue → due today → upcoming → never set →
        alphabetical fallback. */
  const directoryList = useMemo(() => {
    let arr = filteredBySearch;

    /* Filter chips at the top of the Directory. */
    if (directoryFilter === 'overdue') {
      arr = arr.filter(f => {
        const r = reachOutStatus(f);
        return r.state === 'overdue' || r.state === 'due-today';
      });
    } else if (directoryFilter === 'birthdays') {
      arr = arr.filter(f => {
        const d = daysToBirthday(f);
        return d !== null && d <= 30;
      });
    } else if (directoryFilter !== 'all') {
      /* Treat any other filter value as a friend_status match. */
      arr = arr.filter(f => f.friend_status === directoryFilter);
    }

    /* Sort. */
    const arrCopy = [...arr];
    if (directorySort === 'name') {
      arrCopy.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (directorySort === 'recent') {
      arrCopy.sort((a, b) => {
        const at = safeParseDate(a.last_contacted)?.getTime() || 0;
        const bt = safeParseDate(b.last_contacted)?.getTime() || 0;
        return bt - at;
      });
    } else {
      /* cadence (default) — overdue first, then due-today, then
         the soonest upcoming, then never-set, then name. */
      const rank = (f) => {
        const r = reachOutStatus(f);
        if (r.state === 'overdue')   return [0, -(r.overdue || 0)];
        if (r.state === 'due-today') return [1, 0];
        if (r.state === 'upcoming')  return [2, r.daysUntil || 0];
        return [3, 0];
      };
      arrCopy.sort((a, b) => {
        const [ra, rb] = [rank(a), rank(b)];
        if (ra[0] !== rb[0]) return ra[0] - rb[0];
        if (ra[1] !== rb[1]) return ra[1] - rb[1];
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return arrCopy;
  }, [filteredBySearch, directoryFilter, directorySort]);

  /* Cadence buckets summary — shown at the top of the Directory. */
  const cadenceSummary = useMemo(() => {
    let overdue = 0, today = 0, upcoming = 0, never = 0;
    for (const f of friends) {
      const r = reachOutStatus(f);
      if (r.state === 'overdue')   overdue++;
      else if (r.state === 'due-today') today++;
      else if (r.state === 'upcoming')  upcoming++;
      else                              never++;
    }
    return { overdue, today, upcoming, never };
  }, [friends]);

  /* ── Reach-Out queue ── Used by both the bell badge + the
        Reach-Out walkthrough. Sorted so the most overdue go first. */
  const reachOutQueue = useMemo(() => {
    return friends
      .map(f => ({ f, r: reachOutStatus(f) }))
      .filter(x => x.r.state === 'overdue' || x.r.state === 'due-today')
      .sort((a, b) => (b.r.overdue || 0) - (a.r.overdue || 0))
      .map(x => x.f);
  }, [friends]);

  /* ── Today's birthdays — surfaced in the bell. ── */
  const todaysBirthdays = useMemo(() => {
    return friends.filter(f => daysToBirthday(f) === 0);
  }, [friends]);

  /* ── Notification items for the bell. ── */
  const bellItems = useMemo(() => {
    const out = [];
    for (const f of reachOutQueue) {
      const r = reachOutStatus(f);
      out.push({
        id:    `reach-${f.id}`,
        kind:  'reach',
        title: f.name,
        body:  r.state === 'overdue'
          ? `${r.overdue} day${r.overdue === 1 ? '' : 's'} overdue`
          : 'Due to reach out today',
        friend: f,
      });
    }
    for (const f of todaysBirthdays) {
      out.push({
        id:    `bday-${f.id}`,
        kind:  'birthday',
        title: f.name,
        body:  '🎂 Birthday today',
        friend: f,
      });
    }
    return out.filter(n => !dismissedBell.has(n.id));
  }, [reachOutQueue, todaysBirthdays, dismissedBell]);

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

  /* Open the avatar builder for an existing friend. Saving patches
     the friend doc and refreshes both the list and the slide-over. */
  const openAvatarEditor = (friend) => {
    setAvatarEditor({
      initial: friend.avatar || DEFAULT_AVATAR,
      name: friend.name,
      onSave: async (cfg) => {
        try {
          const res = await friendsService.updateFriend(friend.id, { avatar: cfg });
          const updated = res.data.data;
          setFriends(prev => prev.map(f => f.id === updated.id ? updated : f));
          setSelected(s => (s && s.id === updated.id ? updated : s));
        } catch { setError('Failed to save avatar.'); }
        setAvatarEditor(null);
      },
    });
  };

  /* Open the avatar builder while adding a friend — writes into the
     in-progress form rather than a saved doc. */
  const openAddFormAvatarEditor = () => {
    setAvatarEditor({
      initial: friendForm.avatar || DEFAULT_AVATAR,
      name: friendForm.name || 'your new friend',
      onSave: (cfg) => {
        setFriendForm(f => ({ ...f, avatar: cfg }));
        setAvatarEditor(null);
      },
    });
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

  /* ── Calendar sync toggles ──
        Every dated thing on a friend (birthday · reach-out schedule
        · each one-off event) gets an opt-in sync flag stored
        directly on the friend doc. The Calendar page reads those
        flags and only renders the items the user has explicitly
        checked, so the Friends → Calendar relationship is always
        intentional, never automatic. */
  const handleSyncBirthday = (next) => {
    if (!selected) return;
    return handleUpdateField('sync_birthday', !!next);
  };
  const handleSyncReachOut = (next) => {
    if (!selected) return;
    return handleUpdateField('sync_reach_out', !!next);
  };
  /* Per-event sync. Events live as an array on the friend; we
     patch the whole array in one updateFriend call so the change
     is atomic. */
  const handleSyncFriendEvent = async (eventId, next) => {
    if (!selected) return;
    const events = (selected.events || []).map(e =>
      (e.id === eventId) ? { ...e, sync_calendar: !!next } : e
    );
    try {
      const res = await friendsService.updateFriend(selected.id, { events });
      const updated = res.data.data;
      setFriends(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
    } catch { setError('Failed to update event sync.'); }
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
    setProfileMode('view');                     // start in View mode
    setExpandedPrayerId(null);
    try {
      const res = await friendsService.getFriendDetail(f.id);
      setSelected(res.data.data);
    } catch { /* fall back to summary */ }
  };
  const closeSlideOver = () => setSelected(null);

  /* Log a reach-out for any friend (used by Reach-Out mode +
     bell quick-actions, not just the detail panel). Optionally
     appends a timeline note describing the contact medium. */
  const logReachOut = async (f, medium) => {
    if (!f) return;
    try {
      const res = await friendsService.updateFriend(f.id, { last_contacted: todayISO() });
      const updated = res.data.data;
      setFriends(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
      /* Finishing a reach-out clears it from the bell, and drops any
         stale "dismissed" flag so the next cycle can surface again. */
      setDismissedBell(prev => {
        if (!prev.has(`reach-${f.id}`)) return prev;
        const next = new Set(prev);
        next.delete(`reach-${f.id}`);
        return next;
      });
      if (medium) {
        try {
          await friendsService.addTimeline(f.id, {
            content: `Reached out (${medium}).`,
            entry_type: 'note',
          });
        } catch { /* noop */ }
      }
    } catch { setError('Failed to log reach-out.'); }
  };

  /* Quick-add chip submit — only requires a name, defaults a
     reasonable friend_status. */
  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;
    try {
      const ci = COLORS[friends.length % COLORS.length];
      await friendsService.addFriend({
        ...EMPTY_FRIEND,
        name: quickAddName.trim(),
        friend_status: quickAddStatus || '',
        color_from: ci[0], color_to: ci[1],
      });
      setQuickAddName('');
      setQuickAddStatus('');
      setQuickAddOpen(false);
      await fetchAll();
    } catch { setError('Failed to add friend.'); }
  };

  /* Bell hover helpers — mirrors the Journal pattern. */
  const openBell = () => {
    if (bellCloseTimer.current) {
      clearTimeout(bellCloseTimer.current);
      bellCloseTimer.current = null;
    }
    setBellOpen(true);
  };
  const scheduleCloseBell = () => {
    if (bellCloseTimer.current) clearTimeout(bellCloseTimer.current);
    bellCloseTimer.current = setTimeout(() => setBellOpen(false), 180);
  };

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="f-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* TOPBAR — logo · view tabs · Reach Out CTA · Add Friend ·
            activity bell · profile avatar. The view tabs sit in
            the center between logo and actions, matching the
            pattern used on Prayers. */}
      <PageTourHost pageId="friends" />

      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag friends">Friends</span>
        </div>

        <nav className="f-view-switch" role="tablist" aria-label="Friends views">
          {[
            { id: 'directory', icon: '📇', label: 'Directory' },
            { id: 'pulse',     icon: '💓', label: 'Pulse' },
          ].map(v => (
            <button
              key={v.id}
              role="tab" aria-selected={view === v.id}
              className={`f-view-tab ${view === v.id ? 'on' : ''}`}
              onClick={() => setView(v.id)}
            >
              <span className="f-view-icon">{v.icon}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-tb-actions">
          <button
            className="f-reach-now-btn"
            onClick={() => setReachOutOpen(true)}
            title="Walk through everyone you need to reach out to"
          >
            <span>✨</span>
            <span>Reach Out</span>
            {reachOutQueue.length > 0 && (
              <span className="f-reach-now-badge">{reachOutQueue.length}</span>
            )}
          </button>
          <button className="app-btn primary" data-tour="tour-primary-action" onClick={() => setShowAddFriend(true)}>
            ✦ Add Friend
          </button>

          {/* Activity bell — popover lists today's actionable items
              (overdue reach-outs, birthdays). Same hover-tooltip
              pattern as Journal's notification bell. */}
          <div
            className="f-tb-bell-wrap"
            onMouseEnter={openBell}
            onMouseLeave={scheduleCloseBell}
          >
            <button
              className="f-tb-bell"
              onClick={() => setBellOpen(v => !v)}
              aria-label={`${bellItems.length} activity items`}
              title={`${bellItems.length} activity item${bellItems.length === 1 ? '' : 's'}`}
            >
              🔔
              {bellItems.length > 0 && (
                <span className="f-tb-bell-badge">{bellItems.length}</span>
              )}
            </button>
            {bellOpen && (
              <div
                className="f-bell-popover"
                role="dialog"
                aria-label="Activity"
                onMouseEnter={openBell}
                onMouseLeave={scheduleCloseBell}
              >
                <div className="f-bell-popover-hd">
                  <span className="f-bell-popover-title">Today</span>
                  {bellItems.length > 0 && (
                    <button
                      className="f-bell-action"
                      onClick={() => { setBellOpen(false); setReachOutOpen(true); }}
                    >Start Reach Out →</button>
                  )}
                </div>
                {bellItems.length === 0 ? (
                  <div className="f-bell-empty">You're all caught up.</div>
                ) : (
                  <div className="f-bell-list">
                    {bellItems.map(n => (
                      <div key={n.id} className={`f-bell-item kind-${n.kind}`}>
                        <button
                          className="f-bell-item-main"
                          onClick={() => {
                            setBellOpen(false);
                            selectFriend(n.friend);
                          }}
                        >
                          <FriendAv friend={n.friend} />
                          <div className="f-bell-item-text">
                            <div className="f-bell-item-title">{n.title}</div>
                            <div className="f-bell-item-body">{n.body}</div>
                          </div>
                        </button>
                        <div className="f-bell-item-actions">
                          {n.kind === 'reach' && (
                            <button
                              className="f-bell-item-done"
                              onClick={() => logReachOut(n.friend)}
                              title="Mark reached out"
                              aria-label={`Mark ${n.title} as reached out`}
                            >✓</button>
                          )}
                          <button
                            className="f-bell-item-dismiss"
                            onClick={() => dismissBellItem(n.id)}
                            title="Dismiss"
                            aria-label={`Dismiss ${n.title}`}
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile avatar — same shared modal Journal + Prayers
              use (Profile · Page Settings). */}
          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      {/* BODY — single scrollable column. The friend detail is a
            slide-over on the right (no second pane swap), so the
            view grid is just rail · center. */}
      <div
        className="f-body"
        style={{ gridTemplateColumns: `1fr` }}
      >
        <NavRail />

        <main className="f-center">
          {showAddFriend ? (
            <AddFriendForm
              form={friendForm}
              setForm={setFriendForm}
              contacts={myContacts}
              tagInput={tagInput}
              setTagInput={setTagInput}
              interestInput={interestInput}
              setInterestInput={setInterestInput}
              onCancel={() => { setShowAddFriend(false); setFriendForm(EMPTY_FRIEND); setTagInput(''); setInterestInput(''); }}
              onSave={handleAddFriend}
              onEditAvatar={openAddFormAvatarEditor}
            />
          ) : view === 'pulse' ? (
            <PulseView
              friends={friends}
              meInitials={initials}
              onOpenFriend={selectFriend}
              onCustomize={openAvatarEditor}
              onAddFirst={() => setShowAddFriend(true)}
            />
          ) : (
            <DirectoryView
              friends={friends}
              list={directoryList}
              search={search}
              setSearch={setSearch}
              summary={cadenceSummary}
              filter={directoryFilter}
              setFilter={setDirectoryFilter}
              sort={directorySort}
              setSort={setDirectorySort}
              error={error}
              setError={setError}
              onOpenFriend={selectFriend}
              onAddFirst={() => setShowAddFriend(true)}
              onStartReachOut={() => setReachOutOpen(true)}
              reachOutQueueLength={reachOutQueue.length}
            />
          )}
        </main>
      </div>

      {/* Friend detail slide-over panel (right side). Replaces the
          old center-swap detail view. The directory stays visible
          behind it; clicking another friend slides this through. */}
      {selected && (
        <FriendSlideOver
          friend={selected}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profileMode={profileMode}
          setProfileMode={setProfileMode}
          prayers={friendPrayers}
          expandedPrayerId={expandedPrayerId}
          setExpandedPrayerId={setExpandedPrayerId}
          noteText={noteText}
          setNoteText={setNoteText}
          eventForm={eventForm}
          setEventForm={setEventForm}
          onClose={closeSlideOver}
          onMarkContacted={handleMarkContacted}
          onUpdateField={handleUpdateField}
          onAddNote={handleAddNote}
          onAddEvent={handleAddEvent}
          onSyncBirthday={handleSyncBirthday}
          onSyncReachOut={handleSyncReachOut}
          onSyncFriendEvent={handleSyncFriendEvent}
          onRemoveFriend={() => handleRemoveFriend(selected.id)}
          onOpenInPrayers={handleOpenInPrayers}
          onNewPrayerFor={handleNewPrayerFor}
          onEditAvatar={() => openAvatarEditor(selected)}
        />
      )}

      {/* Reach-Out walkthrough — full-screen liturgy overlay. */}
      <ReachOutMode
        open={reachOutOpen}
        queue={reachOutQueue}
        onClose={() => setReachOutOpen(false)}
        onLogReachOut={logReachOut}
        onOpenFriend={(f) => { setReachOutOpen(false); selectFriend(f); }}
        onFinish={(session) => setDismissedBell(prev => {
          const next = new Set(prev);
          (session || []).forEach(({ f }) => f && next.add(`reach-${f.id}`));
          return next;
        })}
      />

      {/* Floating quick-add chip — minimal 2-field "I just met
          someone, save them" capture. */}
      <button
        className="f-quick-add-fab"
        onClick={() => setQuickAddOpen(true)}
        title="Quickly add someone"
        aria-label="Quick add"
      >+</button>

      {quickAddOpen && (
        <>
          <div className="f-quick-add-overlay" onClick={() => setQuickAddOpen(false)}/>
          <div className="f-quick-add-modal" role="dialog" aria-label="Quick add friend">
            <div className="f-quick-add-hd">
              <span>✦ Quick add</span>
              <button
                className="f-quick-add-close"
                onClick={() => setQuickAddOpen(false)}
                aria-label="Close"
              >✕</button>
            </div>
            <input
              autoFocus
              className="f-inp"
              placeholder="Their name"
              value={quickAddName}
              onChange={e => setQuickAddName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); } }}
            />
            <select
              className="f-sel"
              value={quickAddStatus}
              onChange={e => setQuickAddStatus(e.target.value)}
            >
              {FRIEND_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
                </option>
              ))}
            </select>
            <div className="f-quick-add-actions">
              <button className="app-btn ghost" onClick={() => setQuickAddOpen(false)}>Cancel</button>
              <button className="app-btn primary" onClick={handleQuickAdd}>
                ✦ Add
              </button>
            </div>
            <div className="f-quick-add-hint">
              You can fill in birthday, cadence, and more from their card later.
            </div>
          </div>
        </>
      )}

      {/* Shared Profile / Page Settings / Settings modal. Page-specific
          knobs (reach-out defaults, sort preferences, cadence templates)
          are still on the roadmap, but the "How to Use" sub-tab gives
          the tab real content in the meantime. */}
      {avatarEditor && (
        <AvatarBuilder
          initial={avatarEditor.initial}
          name={avatarEditor.name}
          onSave={avatarEditor.onSave}
          onCancel={() => setAvatarEditor(null)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<FriendsPageSettings />}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Friends Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab. Friends doesn't have bespoke
   settings yet (see General tab), but it follows the same
   sub-tab pill pattern as Journal/Prayers so the "How to Use"
   guide has a real home and future settings can slot in beside
   it without restructuring anything.
   ───────────────────────────────────────────────────────────── */
function FriendsPageSettings() {
  const [activeSub, setActiveSub] = useState('general');
  const SUB_TABS = [
    { id: 'general', label: '⚙', name: 'General' },
    { id: 'howto',   label: '❓', name: 'How to Use' },
  ];

  return (
    <div className="f-ps-root">
      <div className="pm-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`pm-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="pm-ps-subtab-icon">{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {activeSub === 'general' && (
        <div className="pm-body" style={{ alignItems:'center', textAlign:'center', padding:'28px 22px' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⚙</div>
          <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.85)', marginBottom:4 }}>
            No Friends-specific settings yet.
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', maxWidth:340, lineHeight:1.55 }}>
            Future home for reach-out reminder defaults, sort preferences, and
            relationship-cadence templates.
          </div>
        </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ─────────
            A full, typed-out reference guide to the Friends page,
            written in-app so users don't have to go hunting for
            documentation. Mirrors docs/FRIENDS_HOW_TO_USE.md. */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="f-ps-howto-title-row">
          <div className="pm-ps-section-title">❓ How to Use the Friends Page</div>
          <button
            type="button"
            className="f-ps-howto-download"
            onClick={() => downloadGuideDocx(FRIENDS_GUIDE, 'Friends-How-To-Use.docx')}
          >⬇ Download as Word doc</button>
        </div>

        <div className="f-ps-howto-feedback">
          <span className="f-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="f-ps-howto-intro">
          A full walkthrough of everything on this page — your directory of people, staying on
          top of reach-outs and birthdays, and tracking prayers, notes, and events per person.
          Skim the headers below or read start to finish.
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">📇 Directory View</div>
          <div className="f-ps-howto-p">
            The default view — a photo-first grid of everyone in your hub, sorted so the people
            who need attention rise to the top.
          </div>
          <ul className="f-ps-howto-list">
            <li><b>Cadence Summary Bar</b> — clickable tiles for Overdue + Today, Upcoming, and No Schedule; plus a "✨ Start Reach-Out" button when someone's due.</li>
            <li><b>Search</b> — matches name, role, church, or tags in real time.</li>
            <li><b>Sort by</b> — Reach-out (urgent first), Most recently contacted, or Name (A–Z).</li>
            <li><b>Filter chips</b> — All, Reach out, Birthdays, Close, Family, Church, Prayer, Mentor, Mentee, Co-worker.</li>
            <li>Cards show a status badge (⚡ "Xd late" / "Today", or 🎂 birthday), avatar, name, role · church, friend status, and last contact date.</li>
          </ul>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">💓 Pulse View</div>
          <div className="f-ps-howto-p">
            A more visual read on your relationships. <b>Orbit mode</b> places you at the center
            with friends orbiting in warmth bands — Warm, Due, Cooling, Drifting. <b>Grid mode</b>
            shows the same people as color-coded cards. Both use the same underlying reach-out
            data as Directory — click anyone to open their detail panel.
          </div>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">✦ Adding a Friend</div>
          <div className="f-ps-howto-p">
            Click <b>✦ Add Friend</b> for the full form, or <b>+ Quick Add</b> for just a name
            (fill in the rest later). The full form covers who they are (name, nickname, status,
            role, church, city, birthday — with autocomplete from your Contacts), backstory (how
            you met, life season, life update), a reach-out schedule (specific weekdays or a
            simple cadence), and free-form tags & interests.
          </div>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">👤 The Friend Detail Panel</div>
          <div className="f-ps-howto-p">
            Click any friend to open a slide-over with reach-out and birthday banners up top, a
            <b> ✓ Reached Out Today</b> button, and four tabs:
          </div>
          <ul className="f-ps-howto-list">
            <li><b>👤 Profile & Reach Out</b> — life season, what they're going through, how you met, interests, reach-out schedule, birthday, quick notes, and Calendar sync toggles.</li>
            <li><b>🙏 Prayer Requests</b> — every prayer/praise linked to them, with a button to start a new one pre-linked.</li>
            <li><b>📅 Events & Birthdays</b> — their birthday plus any custom events, each with its own sync toggle.</li>
            <li><b>📝 Notes</b> — a running timeline of conversations and moments worth remembering.</li>
          </ul>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">✨ Reach-Out Mode</div>
          <div className="f-ps-howto-p">
            Click <b>✨ Reach Out</b> in the topbar to walk through everyone overdue or due today,
            one at a time. One-tap buttons — 📞 Called, 💬 Texted, 📧 Emailed, ☕ In person — log
            the contact and automatically advance to the next person. You can also open their
            full card, skip, or finish early. A completion screen sums up who you connected with.
          </div>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">🔔 Notifications</div>
          <div className="f-ps-howto-p">
            The activity bell shows a combined count of overdue reach-outs and today's birthdays.
            Reach-out items have a one-click <b>✓ Mark reached out</b> button; each item can be
            dismissed individually, and dismissals clear automatically once the status changes.
          </div>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">📅 Calendar Sync</div>
          <div className="f-ps-howto-p">
            Three things can sync to your Calendar page, all opt-in per friend: 🎂 birthday,
            ⚡ reach-out schedule (both toggled in the Profile tab), and individual custom events
            (toggled per event in the Events tab).
          </div>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">🔗 Integrations</div>
          <ul className="f-ps-howto-list">
            <li><b>Prayers</b> — linking is bidirectional; link a friend from either page and it shows up in both.</li>
            <li><b>Contacts</b> — typing a name that matches an accepted Contact connection auto-fills church, photo, and tags.</li>
          </ul>
        </div>

        <div className="f-ps-howto-block">
          <div className="f-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="f-ps-howto-list">
            <li><b>"Remove this friend?"</b> — confirmation shown before permanently deleting a friend and their history.</li>
            <li>Add Friend / Add Event buttons stay disabled until their required fields (name; title + date) are filled in.</li>
            <li><b>"No prayers linked to this friend yet."</b> — link one from the Prayers page or the "New Prayer for [Name]" button.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Inline Add Friend form (renders in the center column)
   ───────────────────────────────────────────────────────────── */
function AddFriendForm({ form, setForm, contacts, tagInput, setTagInput, interestInput, setInterestInput, onCancel, onSave, onEditAvatar }) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const nameMatches = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q || !contacts?.length) return [];
    return contacts.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [form.name, contacts]);

  const pickContact = async (contact) => {
    setSuggestOpen(false);
    setFilling(true);
    try {
      const profile = await getProfileByUid(contact.uid);
      setForm(f => ({
        ...f,
        name: profile?.displayName || contact.name || f.name,
        church: profile?.ministryName || f.church,
        tags: Array.from(new Set([...(f.tags || []), ...(profile?.ministryTypes || [])])),
      }));
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="f-add-form">
      <header className="f-add-form-hd">
        <div className="f-add-form-title">✦ Add Friend</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel" aria-label="Cancel">✕</button>
      </header>

      <div className="f-add-form-body">
        <div className="f-form-section f-avatar-pick">
          <button type="button" className="f-av-edit-btn" onClick={onEditAvatar} title="Customize avatar">
            {form.photo_url
              ? <span className="f-av lg f-av-photo"><img src={form.photo_url} alt="" /></span>
              : form.avatar
              ? <span className="f-av lg f-av-custom"><CustomAvatar avatar={form.avatar} /></span>
              : <span className="f-av lg" style={{ background: 'linear-gradient(135deg,#3730a3,#6c3fc9)' }}>
                  {(form.name || '?').slice(0, 1).toUpperCase()}
                </span>}
            <span className="f-av-edit-badge">🎨</span>
          </button>
          <div className="f-avatar-pick-text">
            <div className="f-avatar-pick-title">Build their avatar</div>
            <div className="f-avatar-pick-sub">
              Give them a face — Snapchat-style. Optional, you can do it later.
            </div>
          </div>
          <button type="button" className="app-btn ghost" onClick={onEditAvatar}>🎨 Customize</button>
        </div>

        <div className="f-form-section">
          <div className="f-form-section-title">Who they are</div>
          <div className="f-form-row">
            <div className="f-name-suggest-wrap">
              <input className="f-inp" placeholder="Full name *"
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setSuggestOpen(true); }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                autoComplete="off" />
              {suggestOpen && nameMatches.length > 0 && (
                <div className="f-name-suggest">
                  <div className="f-name-suggest-hd">From your Contacts</div>
                  {nameMatches.map(c => (
                    <button
                      type="button"
                      key={c.uid}
                      className="f-name-suggest-item"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => pickContact(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {filling && <div className="f-name-suggest-status">Filling from their profile…</div>}
            </div>
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
  const sz = size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : size === 'xl' ? 'xl' : '';
  if (friend.photo_url) {
    return (
      <span className={`f-av ${sz} f-av-photo`}>
        <img src={friend.photo_url} alt="" />
      </span>
    );
  }
  if (friend.avatar) {
    return (
      <span className={`f-av ${sz} f-av-custom`}>
        <CustomAvatar avatar={friend.avatar} />
      </span>
    );
  }
  return (
    <span
      className={`f-av ${sz}`}
      style={{
        background: `linear-gradient(135deg, ${friend.color_from || '#3730a3'}, ${friend.color_to || '#6c3fc9'})`
      }}
    >
      {friend.initials || friend.name?.[0] || '?'}
    </span>
  );
}

/* FriendRow / Section / Stat removed — they were used by the
   old smart-section sidebar + right Insights panel, both
   replaced by the new Directory grid and Activity bell. */

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

/* EmptyState removed — its first-time and no-selection states are
   handled by DirectoryView directly (the directory IS the page now,
   no separate empty center). */

/* ─────────────────────────────────────────────────────────────
   Friend Detail (tabbed)
   ───────────────────────────────────────────────────────────── */
function FriendDetail({
  friend, activeTab, setActiveTab,
  profileMode, setProfileMode,
  prayers, expandedPrayerId, setExpandedPrayerId,
  noteText, setNoteText, eventForm, setEventForm,
  onMarkContacted, onUpdateField,
  onAddNote, onAddEvent,
  onSyncBirthday, onSyncReachOut, onSyncFriendEvent,
  onRemoveFriend, onOpenInPrayers, onNewPrayerFor,
  onEditAvatar,
  embedded,
}) {
  const r = reachOutStatus(friend);
  const bday = daysToBirthday(friend);

  return (
    <div className={`f-detail ${embedded ? 'f-detail-embedded' : ''}`}>
      {/* Header */}
      <header className="f-detail-hd">
        <div className="f-detail-hd-top">
          <button
            type="button"
            className="f-av-edit-btn"
            onClick={onEditAvatar}
            title="Customize avatar"
          >
            <FriendAv friend={friend} size="lg" />
            <span className="f-av-edit-badge">🎨</span>
          </button>
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

        {/* View/Edit toggle — only shown on the profile tab.
            View mode = read-only display, Edit mode = inputs. */}
        {activeTab === 'profile' && setProfileMode && (
          <div className="f-mode-row">
            <div className="f-mode-toggle">
              <button
                className={`f-mode-btn ${profileMode === 'view' ? 'on' : ''}`}
                onClick={() => setProfileMode('view')}
              >👁 View</button>
              <button
                className={`f-mode-btn ${profileMode === 'edit' ? 'on' : ''}`}
                onClick={() => setProfileMode('edit')}
              >✎ Edit</button>
            </div>
          </div>
        )}

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
          <ProfileTab
            friend={friend}
            onUpdateField={onUpdateField}
            mode={profileMode || 'view'}
            onSyncBirthday={onSyncBirthday}
            onSyncReachOut={onSyncReachOut}
          />
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
            onSyncEvent={onSyncFriendEvent}
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
function ProfileTab({ friend, onUpdateField, mode = 'view', onSyncBirthday, onSyncReachOut }) {
  const FREQ_LABELS = {
    daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly',
  };

  /* ── View mode — read-only display, no inputs anywhere.
        The user can click ✎ Edit in the header to flip to inputs. */
  if (mode === 'view') {
    const status = getFriendStatus(friend.friend_status);
    const days = (friend.reach_out_days || []).join(', ');
    return (
      <div className="f-profile f-profile-view">
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

        <div className="f-profile-grid f-profile-grid-narrow">
          <ProfileCard title="Friend Status">
            {status?.value
              ? <span>{status.emoji} {status.label}</span>
              : <span className="f-muted">—</span>}
          </ProfileCard>
          <ProfileCard title="Reach-out Schedule">
            <div>
              {days
                ? <span>{days}</span>
                : <span>Every {FREQ_LABELS[friend.communication_frequency || 'weekly']?.toLowerCase()}</span>}
            </div>
            {friend.sync_reach_out && (
              <span className="f-sync-chip">📅 On Calendar</span>
            )}
          </ProfileCard>
        </div>

        {friend.birthday && (
          <ProfileCard title="Birthday">
            <div>{format(parseISO(friend.birthday), 'MMMM d')}</div>
            {friend.sync_birthday && (
              <span className="f-sync-chip">📅 On Calendar</span>
            )}
          </ProfileCard>
        )}

        {friend.notes && (
          <ProfileCard title="Notes">
            {friend.notes}
          </ProfileCard>
        )}
      </div>
    );
  }

  /* ── Edit mode — original input layout. */
  return (
    <div className="f-profile f-profile-edit-mode">
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
        <div className="f-form-lbl">Life season</div>
        <input
          className="f-inp"
          placeholder="e.g. new parent, job transition…"
          value={friend.life_season || ''}
          onChange={e => onUpdateField('life_season', e.target.value)}
        />
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">What they're going through</div>
        <textarea
          className="f-ta"
          rows={2}
          placeholder="Anything God put on your heart for them right now."
          value={friend.life_update || ''}
          onChange={e => onUpdateField('life_update', e.target.value)}
        />
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">How you met</div>
        <input
          className="f-inp"
          value={friend.how_met || ''}
          onChange={e => onUpdateField('how_met', e.target.value)}
        />
      </div>

      <div className="f-profile-edit">
        <div className="f-form-lbl">Reach-out days</div>
        <div className="f-form-hint">
          Pick the days you want to check in with {friend.name.split(' ')[0]}.
          Due dates in "Reach Out Soon" come from this schedule.
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
        <div className="f-form-lbl">Birthday</div>
        <input
          className="f-inp"
          type="date"
          value={friend.birthday || ''}
          onChange={e => onUpdateField('birthday', e.target.value)}
        />
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

      {/* ── 📅 Calendar sync section ──
            Per-friend opt-in for every dated thing on their card.
            Off by default — the Calendar only shows what the user
            has explicitly checked, so the relationship between
            Friends and Calendar is always intentional. */}
      <div className="f-profile-edit f-sync-block">
        <div className="f-form-lbl">📅 Sync to Calendar</div>
        <div className="f-form-hint">
          Pick which of {friend.name.split(' ')[0]}'s dates show up on the Calendar page.
        </div>
        <label className={`f-sync-row ${!friend.birthday ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={!!friend.sync_birthday && !!friend.birthday}
            disabled={!friend.birthday}
            onChange={e => onSyncBirthday?.(e.target.checked)}
          />
          <span className="f-sync-row-text">
            <span className="f-sync-row-title">🎂 Birthday</span>
            <span className="f-sync-row-sub">
              {friend.birthday
                ? `Recurs every ${format(parseISO(friend.birthday), 'MMMM d')}`
                : 'Set a birthday above to enable'}
            </span>
          </span>
        </label>
        <label className={`f-sync-row ${(friend.reach_out_days||[]).length === 0 && !friend.communication_frequency ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={!!friend.sync_reach_out}
            onChange={e => onSyncReachOut?.(e.target.checked)}
          />
          <span className="f-sync-row-text">
            <span className="f-sync-row-title">⚡ Reach-out schedule</span>
            <span className="f-sync-row-sub">
              {(friend.reach_out_days || []).length > 0
                ? `Every ${friend.reach_out_days.join(', ')}`
                : `Every ${friend.communication_frequency || 'week'}`}
            </span>
          </span>
        </label>
        <div className="f-sync-foot">
          Individual events live in the <strong>Events</strong> tab — each has
          its own sync checkbox.
        </div>
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
function EventsTab({ friend, form, setForm, onAdd, onSyncEvent }) {
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
          {friend.sync_birthday && (
            <span className="f-event-sync-chip">📅 Synced</span>
          )}
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
              {/* Per-event sync checkbox — direct control over
                  whether THIS date shows up on the Calendar page. */}
              <label className="f-event-sync-toggle" title="Sync this event to Calendar">
                <input
                  type="checkbox"
                  checked={!!ev.sync_calendar}
                  onChange={e => onSyncEvent?.(ev.id, e.target.checked)}
                />
                <span>📅</span>
              </label>
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

/* ─────────────────────────────────────────────────────────────
   Directory view — photo-first card grid + cadence-aware sort
   ───────────────────────────────────────────────────────────── */
function DirectoryView({
  friends, list, search, setSearch,
  summary, filter, setFilter, sort, setSort,
  error, setError,
  onOpenFriend, onAddFirst, onStartReachOut,
  reachOutQueueLength,
}) {
  if (friends.length === 0) {
    return (
      <div className="f-empty app-empty">
        <div className="app-empty-icon">👥</div>
        <div className="app-empty-title">Your hub of people</div>
        <div className="app-empty-sub">
          Add the people you walk with — track how you reach out, the prayers
          you carry for them, and the moments worth remembering.
        </div>
        <div className="f-start-steps">
          <div className="f-start-title">First time? Try this:</div>
          <ol className="f-start-list">
            <li><b>Tap "Add Friend"</b> — name + how you know them.</li>
            <li><b>Pick a check-in cadence</b> (weekly, monthly…) so we can remind you.</li>
            <li><b>Tag relationship type</b> (Close · Family · Prayer partner…) — that powers the directory groups.</li>
          </ol>
        </div>
        <button className="app-btn primary" onClick={onAddFirst} style={{ marginTop: 16 }}>
          ✦ Add your first friend
        </button>
      </div>
    );
  }

  /* Visible "filter chips" — kept short so the row breathes. */
  const STATUS_FILTERS = [
    { id: 'all',         label: 'All' },
    { id: 'overdue',     label: '🔴 Reach out', accent: 'overdue' },
    { id: 'birthdays',   label: '🎂 Birthdays', accent: 'bday'    },
    { id: 'Close friend',    label: '💛 Close' },
    { id: 'Family',          label: '👨‍👩‍👧 Family' },
    { id: 'Church friend',   label: '⛪ Church' },
    { id: 'Prayer partner',  label: '🙏 Prayer' },
    { id: 'Mentor',          label: '🌳 Mentor' },
    { id: 'Mentee',          label: '🌱 Mentee' },
    { id: 'Co-worker',       label: '💼 Co-worker' },
  ];

  return (
    <div className="f-directory">
      {error && (
        <div className="f-error">{error}<button onClick={() => setError(null)}>✕</button></div>
      )}

      {/* Cadence summary bar — the hero "who do I need to reach
          out to?" answer is the first thing the user sees. */}
      <div className="f-cadence-bar">
        <button
          className="f-cadence-stat is-overdue"
          onClick={() => setFilter('overdue')}
        >
          <span className="f-cadence-n">{summary.overdue + summary.today}</span>
          <span className="f-cadence-lbl">
            {summary.overdue > 0
              ? `${summary.overdue} overdue${summary.today ? ` · ${summary.today} today` : ''}`
              : summary.today > 0 ? `${summary.today} due today` : 'All caught up'}
          </span>
        </button>
        <button className="f-cadence-stat is-upcoming">
          <span className="f-cadence-n">{summary.upcoming}</span>
          <span className="f-cadence-lbl">Upcoming</span>
        </button>
        <button className="f-cadence-stat is-never">
          <span className="f-cadence-n">{summary.never}</span>
          <span className="f-cadence-lbl">No schedule</span>
        </button>
        {(summary.overdue + summary.today) > 0 && (
          <button className="f-cadence-cta" onClick={onStartReachOut}>
            ✨ Start Reach-Out
            <span className="f-cadence-cta-n">{reachOutQueueLength}</span>
          </button>
        )}
      </div>

      {/* Search + sort row. */}
      <div className="f-directory-controls">
        <div className="f-search-wrap">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search by name, role, church, or tag…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="f-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="f-sort-wrap">
          <label className="f-sort-lbl">Sort</label>
          <select
            className="f-sort-sel"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="cadence">Reach-out (urgent first)</option>
            <option value="recent">Most recently contacted</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Filter chip row. */}
      <div className="f-filter-row">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            className={`f-filter-chip ${filter === f.id ? 'on' : ''} ${f.accent ? `accent-${f.accent}` : ''}`}
            onClick={() => setFilter(f.id)}
          >{f.label}</button>
        ))}
      </div>

      {/* Card grid. */}
      {list.length === 0 ? (
        <div className="f-directory-empty">
          {search ? `No one matches "${search}".` : 'No friends match this filter.'}
        </div>
      ) : (
        <div className="f-card-grid">
          {list.map(f => (
            <FriendCard
              key={f.id}
              friend={f}
              onClick={() => onOpenFriend(f)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FriendCard({ friend, onClick }) {
  const r = reachOutStatus(friend);
  const bday = daysToBirthday(friend);
  const status = getFriendStatus(friend.friend_status);
  const lastContact = safeParseDate(friend.last_contacted);

  /* Sync indicator — true if ANY of birthday / reach-out / a
     friend-event has its sync checkbox flipped on. */
  const syncedEventCount = (friend.events || []).filter(e => e.sync_calendar).length;
  const anySync = !!friend.sync_birthday
               || !!friend.sync_reach_out
               || syncedEventCount > 0;

  /* Pick a single most-important badge for the card corner. */
  let badge = null;
  if (r.state === 'overdue')        badge = { tone: 'overdue', text: `${r.overdue}d late`, emoji: '⚡' };
  else if (r.state === 'due-today') badge = { tone: 'today',   text: 'Today',              emoji: '⚡' };
  else if (bday === 0)              badge = { tone: 'bday',    text: 'Birthday!',          emoji: '🎂' };
  else if (bday !== null && bday <= 7) badge = { tone: 'bday', text: `🎂 ${bday}d`,        emoji: '🎂' };

  return (
    <button className="f-fc" onClick={onClick}>
      {/* Top stripe accent — tone-driven so urgency reads at a
          glance even without reading the label. */}
      <span className={`f-fc-stripe tone-${badge?.tone || 'neutral'}`}/>

      {badge && (
        <span className={`f-fc-badge tone-${badge.tone}`}>
          {badge.emoji} {badge.text}
        </span>
      )}

      <FriendAv friend={friend} size="lg" />

      <div className="f-fc-name">{friend.name}</div>
      {friend.nickname && <div className="f-fc-nick">"{friend.nickname}"</div>}

      <div className="f-fc-meta">
        {friend.role && <span>{friend.role}</span>}
        {friend.role && friend.church && <span>·</span>}
        {friend.church && <span>{friend.church}</span>}
      </div>

      {status?.value && (
        <div className="f-fc-status">{status.emoji} {status.label}</div>
      )}

      <div className="f-fc-cadence">
        <span className="f-fc-cadence-lbl">Last contact</span>
        <span className="f-fc-cadence-val">
          {lastContact ? format(lastContact, 'MMM d, yyyy') : 'Never'}
        </span>
      </div>

      {anySync && (
        <span className="f-fc-sync" title="Some dates sync to Calendar">
          📅 {(friend.sync_birthday ? 1 : 0) + (friend.sync_reach_out ? 1 : 0) + syncedEventCount}
        </span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pulse Wall — full-page grid of living avatar orbs. Each orb
   pulses with a tone derived from how overdue a reach-out is, so
   the whole room shows you who's warm and who's fading at a glance.
   ───────────────────────────────────────────────────────────── */
const PULSE_TONES = {
  overdue: { label: 'Going cold', cls: 'overdue' },
  due:     { label: 'Due today',  cls: 'due'     },
  warm:    { label: 'In rhythm',  cls: 'warm'    },
  new:     { label: 'No schedule',cls: 'new'     },
};

function pulseTone(friend) {
  const r = reachOutStatus(friend);
  if (r.state === 'overdue')   return 'overdue';
  if (r.state === 'due-today') return 'due';
  if (r.state === 'never')     return 'new';
  return 'warm';
}

function pulseStatusLabel(friend) {
  const r = reachOutStatus(friend);
  if (r.state === 'overdue')   return `${r.overdue}d overdue`;
  if (r.state === 'due-today') return 'Reach out today';
  if (r.state === 'never')     return 'Set a cadence';
  const d = daysSince(friend.last_contacted);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d != null) return `${d}d ago`;
  return 'In rhythm';
}

const PULSE_RANK = { overdue: 0, due: 1, new: 2, warm: 3 };

/* Concentric warmth bands (normalized radius, 0 = center "you",
   1 ≈ outer rim). Closer = warmer; drifting friends sit at the edge. */
const ORBIT_BANDS = [
  { tone: 'warm',    r: 0.30, label: 'In rhythm' },
  { tone: 'due',     r: 0.50, label: 'Due'       },
  { tone: 'overdue', r: 0.70, label: 'Cooling'   },
  { tone: 'new',     r: 0.88, label: 'Drifting'  },
];
const ORBIT_R = Object.fromEntries(ORBIT_BANDS.map(b => [b.tone, b.r]));
const ORBIT_K = 54; // % of half-stage per unit radius

/* Lay friends out in polar space: angle = friend_status sector,
   radius = warmth band. Returns positioned nodes + sector labels. */
function orbitLayout(friends) {
  const groups = new Map();
  for (const f of friends) {
    const key = f.friend_status || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const statuses = [...groups.keys()];
  const N = Math.max(statuses.length, 1);
  const nodes = [];
  const sectors = [];

  statuses.forEach((st, si) => {
    const center = (si / N) * Math.PI * 2 - Math.PI / 2; // start at top
    const arr = groups.get(st).slice()
      .sort((a, b) => PULSE_RANK[pulseTone(a)] - PULSE_RANK[pulseTone(b)]);
    const half = ((Math.PI * 2) / N) / 2 * 0.7;

    arr.forEach((f, i) => {
      const t = arr.length > 1 ? i / (arr.length - 1) : 0.5;
      const a = arr.length > 1 ? center - half + t * half * 2 : center;
      const tone = pulseTone(f);
      const r = ORBIT_R[tone] + ((i % 3) - 1) * 0.03;
      nodes.push({
        f, tone,
        left: 50 + Math.cos(a) * r * ORBIT_K,
        top:  50 + Math.sin(a) * r * ORBIT_K,
      });
    });

    sectors.push({
      key: st,
      label: st,
      left: 50 + Math.cos(center) * 0.99 * ORBIT_K,
      top:  50 + Math.sin(center) * 0.99 * ORBIT_K,
    });
  });

  return { nodes, sectors };
}

function PulseView({ friends, meInitials, onOpenFriend, onCustomize, onAddFirst }) {
  const [mode, setMode] = useState('orbit');

  if (friends.length === 0) {
    return (
      <div className="f-empty app-empty">
        <div className="app-empty-icon">💓</div>
        <div className="app-empty-title">Your wall is quiet</div>
        <div className="app-empty-sub">
          Add some friends and they'll appear here as living avatars —
          pulsing warm when you're in rhythm and cooling when it's been a while.
        </div>
        <button className="app-btn primary" onClick={onAddFirst} style={{ marginTop: 16 }}>
          ✦ Add your first friend
        </button>
      </div>
    );
  }

  const ordered = [...friends]
    .map(f => ({ f, tone: pulseTone(f) }))
    .sort((a, b) => PULSE_RANK[a.tone] - PULSE_RANK[b.tone]);

  const counts = ordered.reduce((acc, { tone }) => {
    acc[tone] = (acc[tone] || 0) + 1; return acc;
  }, {});

  return (
    <div className={`f-pulse ${mode === 'orbit' ? 'is-orbit' : ''}`}>
      <header className="f-pulse-hd">
        <div>
          <div className="f-pulse-title">💓 Pulse Wall</div>
          <div className="f-pulse-sub">
            {mode === 'orbit'
              ? 'Your relational orbit — you at the center, friends circling by how warm the connection is. Anyone drifting to the rim needs you.'
              : 'Everyone you know, alive on one wall. Each face pulses by how warm the connection is — tap a fading one to reach out.'}
          </div>
        </div>
        <div className="f-pulse-hd-right">
          <div className="f-pulse-modes" role="tablist" aria-label="Pulse layout">
            <button
              role="tab" aria-selected={mode === 'orbit'}
              className={`f-pulse-mode ${mode === 'orbit' ? 'on' : ''}`}
              onClick={() => setMode('orbit')}
            >🛰 Orbit</button>
            <button
              role="tab" aria-selected={mode === 'grid'}
              className={`f-pulse-mode ${mode === 'grid' ? 'on' : ''}`}
              onClick={() => setMode('grid')}
            >▦ Grid</button>
          </div>
          <div className="f-pulse-legend">
            {Object.entries(PULSE_TONES).map(([key, t]) => (
              <span key={key} className={`f-pulse-leg tone-${t.cls}`}>
                <span className="f-pulse-leg-dot" />
                {t.label}
                {counts[key] ? <b>{counts[key]}</b> : null}
              </span>
            ))}
          </div>
        </div>
      </header>

      {mode === 'orbit' ? (
        <PulseOrbit
          friends={friends}
          meInitials={meInitials}
          onOpenFriend={onOpenFriend}
          onCustomize={onCustomize}
        />
      ) : (
        <div className="f-pulse-grid">
          {ordered.map(({ f, tone }) => (
            <div key={f.id} className={`f-pulse-cell tone-${tone}`}>
              <button
                className="f-pulse-orb"
                onClick={() => onOpenFriend(f)}
                title={`Open ${f.name}`}
              >
                <span className="f-pulse-ring" aria-hidden="true" />
                <FriendAv friend={f} size="xl" />
              </button>
              <button
                className="f-pulse-paint"
                onClick={() => onCustomize(f)}
                title="Customize avatar"
                aria-label={`Customize ${f.name}'s avatar`}
              >🎨</button>
              <div className="f-pulse-name">{f.name}</div>
              <div className="f-pulse-status">{pulseStatusLabel(f)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PulseOrbit({ friends, meInitials, onOpenFriend, onCustomize }) {
  const { nodes, sectors } = useMemo(() => orbitLayout(friends), [friends]);

  return (
    <div className="f-orbit-wrap">
    <div className="f-orbit-stage">
      {/* warmth ring guides */}
      {ORBIT_BANDS.map(b => {
        const d = 2 * b.r * ORBIT_K;
        return (
          <div key={b.tone} className={`f-orbit-ring tone-${b.tone}`}
               style={{ width: `${d}%`, height: `${d}%` }} />
        );
      })}
      {ORBIT_BANDS.map(b => (
        <div key={`l-${b.tone}`} className={`f-orbit-ring-label tone-${b.tone}`}
             style={{ top: `${50 - b.r * ORBIT_K}%` }}>{b.label}</div>
      ))}

      {/* sector labels (friend-status wedges) */}
      {sectors.map(s => (
        <div key={s.key} className="f-orbit-sector"
             style={{ left: `${s.left}%`, top: `${s.top}%` }}>
          {s.label}
        </div>
      ))}

      {/* you, at the center */}
      <div className="f-orbit-me" title="You">
        <span className="f-orbit-me-pulse" aria-hidden="true" />
        <span className="f-orbit-me-pulse d2" aria-hidden="true" />
        <span className="f-orbit-me-face">{meInitials || '✦'}</span>
        <span className="f-orbit-me-tag">You</span>
      </div>

      {/* friend nodes */}
      {nodes.map(({ f, tone, left, top }) => (
        <div key={f.id} className={`f-orbit-node tone-${tone}`}
             style={{ left: `${left}%`, top: `${top}%` }}>
          <button className="f-pulse-orb f-orbit-orb"
                  onClick={() => onOpenFriend(f)} title={`${f.name} · ${pulseStatusLabel(f)}`}>
            <span className="f-pulse-ring" aria-hidden="true" />
            <FriendAv friend={f} size="lg" />
          </button>
          <button className="f-pulse-paint f-orbit-paint"
                  onClick={() => onCustomize(f)} title="Customize avatar"
                  aria-label={`Customize ${f.name}'s avatar`}>🎨</button>
          <div className="f-orbit-node-name">{f.name?.split(' ')[0]}</div>
        </div>
      ))}
    </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Friend Slide-Over — right-side panel hosting FriendDetail
   ───────────────────────────────────────────────────────────── */
function FriendSlideOver(props) {
  const { onClose } = props;
  /* Lock body scroll while the slide-over is open. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Esc to close. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="f-slide-overlay" onClick={onClose}/>
      <aside className="f-slide" role="dialog" aria-label={props.friend?.name}>
        <button
          className="f-slide-close"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >✕</button>
        <FriendDetail
          {...props}
          embedded
        />
      </aside>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Reach-Out Mode — full-screen liturgy walkthrough
   ───────────────────────────────────────────────────────────── */
function ReachOutMode({ open, queue, onClose, onLogReachOut, onOpenFriend, onFinish }) {
  /* Snapshot the queue on open so flipping a friend's status
     doesn't yank them out of the session mid-walkthrough. */
  const initialQueue = useMemo(() => (open ? [...queue] : []), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [idx, setIdx]             = useState(0);
  const [savingMedium, setSavingMedium] = useState(null);
  const [finished, setFinished]   = useState(false);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setSavingMedium(null);
    setFinished(false);
    setCompleted(0);
  }, [open]);

  if (!open) return null;

  /* Empty wall. */
  if (initialQueue.length === 0) {
    return (
      <div className="f-ro-overlay" role="dialog" aria-label="Reach Out">
        <div className="f-ro-card f-ro-empty-card">
          <button className="f-ro-close" onClick={onClose}>✕</button>
          <div className="f-ro-empty-icon">✓</div>
          <div className="f-ro-empty-title">You're all caught up.</div>
          <div className="f-ro-empty-sub">
            Nobody is overdue right now. Set a check-in cadence on a friend's
            card and this list will fill up automatically.
          </div>
          <button className="f-ro-primary" onClick={onClose}>Back to Directory</button>
        </div>
      </div>
    );
  }

  const total = initialQueue.length;

  if (finished) {
    return (
      <div className="f-ro-overlay">
        <div className="f-ro-card f-ro-done-card">
          <button className="f-ro-close" onClick={onClose}>✕</button>
          <div className="f-ro-done-icon">💛</div>
          <div className="f-ro-done-title">You connected with {completed} {completed === 1 ? 'person' : 'people'}.</div>
          <div className="f-ro-done-sub">
            "Carry each other's burdens, and in this way you will fulfill the law of Christ." — Galatians 6:2
          </div>
          <div className="f-ro-done-actions">
            <button className="f-ro-secondary" onClick={() => {
              setFinished(false); setIdx(0); setCompleted(0);
            }}>↻ Walk through again</button>
            <button className="f-ro-primary" onClick={onClose}>Back to Directory</button>
          </div>
        </div>
      </div>
    );
  }

  const current = initialQueue[idx];
  const r = reachOutStatus(current);
  const lastContact = safeParseDate(current.last_contacted);
  const status = getFriendStatus(current.friend_status);
  const isLast = idx === total - 1;
  const progress = ((idx + 1) / total) * 100;

  const advance = () => {
    if (isLast) {
      setFinished(true);
      /* Finishing the walkthrough clears every reach-out notification
         from the bell for this session's friends — whether or not each
         one was logged with a specific medium. */
      onFinish?.(initialQueue);
    } else {
      setIdx(idx + 1);
    }
    setSavingMedium(null);
  };

  const logAndAdvance = async (medium) => {
    setSavingMedium(medium);
    try { await onLogReachOut(current, medium); } catch { /* noop */ }
    setCompleted(c => c + 1);
    advance();
  };

  const skip = () => {
    setSavingMedium(null);
    advance();
  };

  return (
    <div className="f-ro-overlay" role="dialog" aria-label={`Reach Out — ${current.name}`}>
      <div className="f-ro-shell">
        <div className="f-ro-hd">
          <div className="f-ro-counter">
            {idx + 1} <span className="f-ro-of">of</span> {total}
          </div>
          <div className="f-ro-progress">
            <div className="f-ro-progress-fill" style={{ width: `${progress}%` }}/>
          </div>
          <button className="f-ro-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="f-ro-card f-ro-person-card">
          <div className="f-ro-person-top">
            <FriendAv friend={current} size="lg"/>
            <div className="f-ro-person-name-block">
              <div className="f-ro-person-name">{current.name}</div>
              {current.nickname && (
                <div className="f-ro-person-nick">"{current.nickname}"</div>
              )}
              <div className="f-ro-person-meta">
                {status?.value && <span>{status.emoji} {status.label}</span>}
                {current.role && <span>· {current.role}</span>}
                {current.church && <span>· {current.church}</span>}
              </div>
            </div>
          </div>

          <div className="f-ro-banner-row">
            <div className={`f-ro-banner ${r.state === 'overdue' ? 'urgent' : 'today'}`}>
              <span className="f-ro-banner-emoji">⚡</span>
              <div>
                <div className="f-ro-banner-title">
                  {r.state === 'overdue'
                    ? `${r.overdue} day${r.overdue === 1 ? '' : 's'} overdue`
                    : 'Due today'}
                </div>
                <div className="f-ro-banner-sub">
                  {lastContact
                    ? `Last contact: ${format(lastContact, 'MMM d, yyyy')}`
                    : 'No reach-out logged yet'}
                </div>
              </div>
            </div>
          </div>

          {current.life_update && (
            <div className="f-ro-life">
              <div className="f-ro-life-lbl">What they're walking through</div>
              <div className="f-ro-life-text">{current.life_update}</div>
            </div>
          )}
          {current.life_season && (
            <div className="f-ro-life">
              <div className="f-ro-life-lbl">Life season</div>
              <div className="f-ro-life-text">{current.life_season}</div>
            </div>
          )}

          {/* How-to-reach picker — one tap logs and advances. */}
          <div className="f-ro-actions">
            {[
              { id: 'called',   label: '📞 Called',  },
              { id: 'texted',   label: '💬 Texted',  },
              { id: 'emailed',  label: '📧 Emailed', },
              { id: 'in-person',label: '☕ In person',},
            ].map(m => (
              <button
                key={m.id}
                className={`f-ro-action ${savingMedium === m.id ? 'saving' : ''}`}
                onClick={() => logAndAdvance(m.id)}
                disabled={!!savingMedium}
              >{m.label}</button>
            ))}
          </div>
        </div>

        <div className="f-ro-controls">
          <button
            className="f-ro-ctrl pn-edit"
            onClick={() => onOpenFriend(current)}
          >✎ Open their card</button>
          <div className="f-ro-ctrl-spacer"/>
          <button className="f-ro-ctrl" onClick={skip} disabled={!!savingMedium}>
            Skip
          </button>
          <button
            className="f-ro-ctrl f-ro-next"
            onClick={advance}
            disabled={!!savingMedium}
          >{isLast ? 'Finish' : 'Done, Next →'}</button>
        </div>
      </div>
    </div>
  );
}
