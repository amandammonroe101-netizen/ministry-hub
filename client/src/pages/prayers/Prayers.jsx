import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { prayerService } from '../../services/prayerService';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { friendsService } from '../../services/friendsService';
import { format, parseISO, differenceInDays } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { useUserStoreKey } from '../../lib/userStore';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PrayerPageSettings from './PrayerPageSettings';
import PrayerDashboard from './PrayerDashboard';
import PrayerKanban from './PrayerKanban';
import PrayNowMode from './PrayNowMode';
import { usePrayerDisplay, usePrayerCategories } from '../../lib/prayerPageSettings';
import { usePrayerNotifications } from '../../lib/prayerNotifications';
import { fetchVerseText, looksLikeReference } from '../../lib/bibleLookup';
import PageTourHost from '../../components/tour/PageTourHost';
import './Prayers.css';

/* ─────────────────────────────────────────────────────────────
   Static data
   ───────────────────────────────────────────────────────────── */

/* Consolidated "kind" — combines the old `status` + `entry_type`
   into a single dimension everywhere in the UI:
     • praying  → an active prayer request (legacy 'waiting' rolls
                  into this — we no longer expose it)
     • answered → a request God has answered (testimony)
     • praise   → a thanksgiving entry that was never a request

   The wire format still stores both fields (`status` +
   `entry_type`) so existing data stays intact. Reads go through
   getKind(p); writes go through setKindPayload(kind). */
export const KINDS = [
  { value: 'praying',  label: 'Praying',  emoji: '🙏', color: 'rgba(167,139,250,0.18)', text: '#c4b5fd' },
  { value: 'answered', label: 'Answered', emoji: '✓',  color: 'rgba(52,211,153,0.18)',  text: '#6ee7b7' },
  { value: 'praise',   label: 'Praise',   emoji: '✨', color: 'rgba(244,114,182,0.18)', text: '#f9a8d4' },
];
export const KIND_BY_VALUE = KINDS.reduce((acc, k) => (acc[k.value] = k, acc), {});

export function getKind(p) {
  if (!p) return 'praying';
  if (p.entry_type === 'praise')   return 'praise';
  if (p.status === 'answered')     return 'answered';
  /* Legacy 'waiting' rolls into 'praying' — UX-wise they're the
     same now (an open prayer that hasn't been answered yet). */
  return 'praying';
}

/* Build the write-side patch for moving a prayer to a new kind.
   Keeps both fields consistent so legacy code paths still work. */
export function setKindPayload(kind) {
  if (kind === 'praise')   return { entry_type: 'praise',  status: 'praying' };
  if (kind === 'answered') return { entry_type: 'request', status: 'answered' };
  return                          { entry_type: 'request', status: 'praying' };
}

const URGENT = { value: 'urgent', label: 'Urgent', emoji: '🔥', color: 'rgba(239,68,68,0.18)', text: '#fca5a5' };
const CATEGORIES = ['General','Health','Family','Church','Provision','Guidance','Relationships','Ministry','Other'];

const TABS = [
  /* Order matters: Prayer (formerly "Request") sits first so the
     detail opens on the original prayer + scripture, not the
     updates log. */
  { key: 'request',  label: 'Prayer',      emoji: '📖', hint: 'The original prayer, scripture verses, status, and quick flags like urgent and daily list.' },
  { key: 'updates',  label: 'Updates',     emoji: '🙏', hint: 'Add notes over time as God moves — this is the running story of this prayer.' },
  { key: 'people',   label: 'Praying For', emoji: '👥', hint: 'Link friends to this prayer so you remember who you’re lifting up.' },
  { key: 'insights', label: 'Insights',    emoji: '📊', hint: 'See how long this prayer has been on the wall and how often you’ve added updates.' },
];

const EMPTY_FORM = {
  title: '', content: '',
  entry_type: 'request',
  category: 'General', status: 'praying',
  is_urgent: false, is_daily: false,
  /* Pending scripture input — the in-progress reference text the
     user is typing. NOT what gets saved; it's added to `verses` via
     the Add button (or Enter). Kept in form state so the debounced
     verse-text lookup result has somewhere to land. */
  scripture: '',
  verse_text: '',
  /* Saved multi-verse list — each entry `{ ref, text }`. The detail
     view renders these as collapsible cards. */
  verses: [],
  friend_ids: [],
};

/* Pill descriptor for a prayer's KIND — Praying / Answered / Praise.
   Urgent is no longer rolled into this; it's a separate flag with
   its own badge (see the header in PrayerDetail). Keeping them split
   means the user can mark an Answered prayer urgent without losing
   the answered state, and vice versa. */
const getStatus = (p) =>
  KIND_BY_VALUE[getKind(p)] || KIND_BY_VALUE.praying;
const ageDays = (createdAt) => {
  try { return differenceInDays(new Date(), parseISO(createdAt.replace(' ', 'T'))); }
  catch { return 0; }
};

/* ─────────────────────────────────────────────────────────────
   Smart section definitions
   ───────────────────────────────────────────────────────────── */
/* SMART_SECTIONS removed — the Wall view is a mailbox now, not
   smart-section accordions. The Dashboard's SECTION_PRESETS (in
   the Prayers component) describes the same "jump from a stat
   tile to a filter preset" mapping, sourced from p.is_urgent /
   is_daily / status / age directly. */

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Prayers() {
  const [searchParams, setSearchParams] = useSearchParams();
  /* Live-synced via Firestore. */
  const [prayers, setPrayers] = useUserStoreKey('prayer-requests', []);
  const [friends, setFriends] = useUserStoreKey('friends',          []);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  /* When editing an existing prayer (vs creating a new one) this
     holds its id. handleSave inspects it to choose update vs create;
     the form header + save button swap labels via the `editing` prop. */
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  /* Detail-modal supporting state. activeTab + updateText drive
     the tabbed PrayerDetail inside the modal; showFriendPicker
     gates the "Praying For" tab's add-friend mini-picker. */
  /* Default to the Prayer tab (the original prayer + scripture) —
     it's now the first tab in TABS, so opening a prayer lands there
     instead of the running updates log. */
  const [activeTab, setActiveTab]                 = useState('request');
  const [updateText, setUpdateText]               = useState('');
  const [addingUpdate, setAddingUpdate]           = useState(false);
  const [showFriendPicker, setShowFriendPicker]   = useState(false);

  /* ── Notification bell state + tooltip grace-period timer ──
     Mirrors the Journal page pattern. The 220ms close-debounce
     stops the popover from snapping shut when the mouse briefly
     leaves the bell wrap (e.g. crossing the gap into the popover
     itself). */
  const [showNotifs, setShowNotifs] = useState(false);
  const { notifications, dismiss, dismissAll } = usePrayerNotifications();
  const notifsCloseTimerRef = useRef(null);
  const openNotifsTooltip = () => {
    if (notifsCloseTimerRef.current) clearTimeout(notifsCloseTimerRef.current);
    setShowNotifs(true);
  };
  const scheduleCloseNotifs = () => {
    if (notifsCloseTimerRef.current) clearTimeout(notifsCloseTimerRef.current);
    notifsCloseTimerRef.current = setTimeout(() => setShowNotifs(false), 220);
  };

  /* Pray Now overlay — launched from the dashboard CTA. */
  const [prayNowOpen, setPrayNowOpen] = useState(false);

  /* Profile / Page Settings modal — opened from the avatar in the
     topbar. Mirrors the Journal modal pattern via the shared
     <ProfileModal> + page-specific <PrayerPageSettings> body. */
  const [showProfile, setShowProfile] = useState(false);
  const { avatarSourceName, initials } = useProfileTopbar();

  /* Top-level view: 'dashboard' (default) or 'wall'. Mirrors
     JournalDashboard's role on the Journal page — the dashboard is
     the primary landing experience and the wall is the secondary
     "browse everything" view. */
  const [view, setView] = useState('dashboard');

  /* Live Page Settings — the display group drives landing view +
     wall section + visibility toggles; the categories group adds
     user-defined categories to the picker. */
  const [display]      = usePrayerDisplay();
  const [catSettings]  = usePrayerCategories();

  /* Apply Page Settings → Display → landingView live — any time the
     user changes the setting, we re-route the view immediately. The
     previous "once on mount" gate meant the setting felt broken
     (toggle it, nothing happens until a full reload). We track the
     last-applied value so we don't fight the user's in-page tab
     switches: only re-apply when the SETTING itself changes. */
  const lastLandingRef = useRef(null);
  useEffect(() => {
    const lv = display?.landingView;
    if (!lv) return;
    if (lastLandingRef.current === lv) return;
    lastLandingRef.current = lv;
    if (lv === 'kanban' || lv === 'board') setView('kanban');
    else if (lv === 'dashboard')           setView('dashboard');
    /* anything else (legacy 'wall' / 'people') — no change. */
  }, [display?.landingView]);

  /* Merge built-in + user-defined custom categories. Used by the
     prayer-form picker and the sidebar's "By Category" group. */
  const ALL_CATEGORIES = useMemo(() => {
    const extras = (catSettings?.custom || []).filter(c => !CATEGORIES.includes(c));
    return [...CATEGORIES, ...extras];
  }, [catSettings?.custom]);

  /* No initial fetch — useUserStoreKey loads via onSnapshot. */

  /* ── URL query param handling (cross-tab links from Friends) ── */
  useEffect(() => {
    // Wait until data is loaded
    if (prayers.length === 0 && friends.length === 0) return;

    const prayerId = searchParams.get('prayer');
    const isNew    = searchParams.get('new') === '1';
    const friendId = searchParams.get('friend');

    if (isNew) {
      const friendIds = friendId ? [Number(friendId)] : [];
      setShowForm(true);
      setSelected(null);
      setForm({ ...EMPTY_FORM, entry_type: 'request', friend_ids: friendIds });
      setSearchParams({}, { replace: true });
    } else if (prayerId) {
      const p = prayers.find(x => x.id === Number(prayerId));
      if (p) {
        setSelected(p);
        setShowForm(false);
        /* Land on the Prayer tab so the user sees the original
           request + verses first; Updates is just a click away. */
        setActiveTab('request');
      }
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayers, friends]);

  const fetchPrayers = async () => {
    try {
      const res = await prayerService.getAll();
      setPrayers(res.data.data);
    } catch { setError('Could not load prayers.'); }
  };
  const fetchFriends = async () => {
    try {
      const res = await friendsService.getFriends();
      setFriends(res.data.data);
    } catch { /* friends optional */ }
  };

  /* ── mutations ───────────────────────────────────────────── */
  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      /* Two paths — create a brand-new prayer, OR update an existing
         one (when the user opened the form via the Edit button on
         the detail header). The update path preserves `updates`,
         `friend_ids`, timestamps, etc. since prayerService.update
         spreads the existing record and merges only the patch
         fields we send. */
      const res = editingId
        ? await prayerService.update(editingId, form)
        : await prayerService.create(form);
      const saved = res.data.data;
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      setSelected(saved);
      if (!editingId) setActiveTab('updates');
      await fetchPrayers();
    } catch { setError('Failed to save.'); }
    finally { setSaving(false); }
  };

  /* Pre-fill the form from an existing prayer and open the editor.
     Triggered by the Edit button in PrayerDetail's header. Friend
     ids fall back to the legacy embedded shape for safety. */
  const handleEditPrayer = (p) => {
    if (!p) return;
    const friendIds = Array.isArray(p.friend_ids)
      ? p.friend_ids
      : Array.isArray(p.friends)
        ? p.friends.map(f => f?.id).filter(Boolean)
        : [];
    setForm({
      title:      p.title      || '',
      content:    p.content    || '',
      entry_type: p.entry_type || 'request',
      category:   p.category   || 'General',
      status:     p.status     || 'praying',
      is_urgent:  !!p.is_urgent,
      is_daily:   !!p.is_daily,
      scripture:  '',  // pending-input field; the saved refs go into `verses`
      verse_text: '',
      /* Seed verses from the saved array; fall back to migrating the
         legacy single `scripture` / `verse_text` pair into a single
         verse entry so old prayers don't lose their references. */
      verses: Array.isArray(p.verses) && p.verses.length
        ? p.verses
        : (p.scripture ? [{ ref: p.scripture, text: p.verse_text || '' }] : []),
      friend_ids: friendIds,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  /* Remove a single update from a prayer's timeline. Confirm first
     since the action is destructive and there's no undo. */
  const handleDeleteUpdate = async (updateId) => {
    if (!selected || !updateId) return;
    if (!confirm('Delete this update? This cannot be undone.')) return;
    try {
      const res = await prayerService.deleteUpdate(selected.id, updateId);
      const updated = res.data.data;
      if (!updated) return;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
    } catch { setError('Failed to delete update.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prayer? This cannot be undone.')) return;
    try {
      await prayerService.delete(id);
      setPrayers(prev => prev.filter(p => p.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch { setError('Failed to delete.'); }
  };

  /* Status change accepts:
       • a kind value: 'praying' | 'answered' | 'praise'  → routes
         through setKindPayload so we write a consistent
         status + entry_type pair
       • 'urgent'    → flips the is_urgent flag without touching kind
       • 'praying' from an urgent toggle-off path → also clears urgent
     This single API is what the detail panel, Kanban drag-drops,
     and Pray Now overlay all hit. */
  const handleStatusChange = async (p, newStatus) => {
    try {
      let patch;
      if (newStatus === 'urgent') {
        /* Explicit "make this urgent" path — flip the flag on. We
           used to ALSO clear urgent when the kind changed, but the
           user wants kind and urgent fully independent: changing
           Praying → Answered should leave urgent alone. */
        patch = { is_urgent: 1 };
      } else if (KIND_BY_VALUE[newStatus]) {
        /* Kind change ONLY — urgent stays whatever it already was. */
        patch = setKindPayload(newStatus);
      } else {
        /* Unknown — be defensive, do nothing harmful. */
        patch = { status: newStatus };
      }
      const res = await prayerService.update(p.id, patch);
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    } catch { setError('Failed to update status.'); }
  };

  /* Dedicated toggle for the urgent flag — used by the RequestTab's
     "Urgent" status pill since the user wants Urgent as its own
     toggleable status independent of Praying/Answered/Praise. */
  const handleToggleUrgent = async (p) => {
    try {
      const res = await prayerService.update(p.id, { is_urgent: p.is_urgent ? 0 : 1 });
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    } catch { setError('Failed to update urgent flag.'); }
  };

  const handleToggleDaily = async (p) => {
    try {
      const res = await prayerService.update(p.id, { is_daily: p.is_daily ? 0 : 1 });
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    } catch { setError('Failed to toggle daily.'); }
  };

  const handleAddUpdate = async () => {
    if (!updateText.trim() || !selected) return;
    setAddingUpdate(true);
    try {
      await prayerService.addUpdate(selected.id, { content: updateText });
      setUpdateText('');
      const res = await prayerService.getOne(selected.id);
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
    } catch { setError('Failed to add update.'); }
    finally { setAddingUpdate(false); }
  };

  const handleSetFriends = async (friendIds) => {
    if (!selected) return;
    try {
      const res = await prayerService.setFriends(selected.id, friendIds);
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
    } catch { setError('Failed to update friends.'); }
  };

  const toggleFriendLink = (friendId) => {
    if (!selected) return;
    /* Source of truth is `friend_ids` (what prayerService.setFriends
       writes). Fall back to a legacy embedded `friends` array of
       objects in case any historical record uses that shape — the
       map+filter handles either form safely. Without this, toggling
       always silently overwrote the linked list with just the
       single toggled id. */
    const current = Array.isArray(selected.friend_ids)
      ? selected.friend_ids
      : Array.isArray(selected.friends)
        ? selected.friends.map(f => f?.id).filter(Boolean)
        : [];
    const next = current.includes(friendId)
      ? current.filter(id => id !== friendId)
      : [...current, friendId];
    handleSetFriends(next);
  };

  /* ── derived ─────────────────────────────────────────────── */
  /* The Board (PrayerKanban) owns its own grouping by kind and
     does any internal sorting. We pass `prayers` to it directly —
     no filter pipeline / search needed here anymore. */

  /* overall/answerRate moved into PrayerDashboard — the Wall view
     no longer needs aggregate stats now that the right panel is
     gone. */

  /* ── handlers ────────────────────────────────────────────── */
  const openNew = (entryType = 'request') => {
    setShowForm(true);
    setSelected(null);
    setForm({ ...EMPTY_FORM, entry_type: entryType });
  };
  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const openPrayer = (p) => {
    setSelected(p);
    setShowForm(false);
    /* Land on the Prayer tab — the original request + scripture
       verses — instead of jumping straight into the updates log. */
    setActiveTab('request');
    setShowFriendPicker(false);
  };

  /* toggleSection / leftW / leftCollapsed removed — they were
     props of the old Wall mailbox sidebar that no longer exists. */

  /* ── Cross-view helpers ──
        With Wall gone, all "jump" actions now route to the Board
        (kanban). Stat tiles + "see all" links from the Dashboard
        switch the view; opening a prayer or the new-prayer form
        pops the detail modal on top of the Board. */
  const jumpToBoard = () => {
    setSelected(null);
    setShowForm(false);
    setView('kanban');
  };
  const openPrayerFromDashboard = (p) => {
    setSelected(p);
    setShowForm(false);
    /* Open on the Prayer tab so the user sees the request first. */
    setActiveTab('request');
    setShowFriendPicker(false);
    setView('kanban');
  };
  const newFromDashboard = (entryType) => {
    openNew(entryType);
    setView('kanban');
  };

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="p-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <PageTourHost pageId="prayers" />

      {/* TOPBAR */}
      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag prayers">Prayers</span>
        </div>

        {/* View switcher — Dashboard (stats + Pray Now) ↔ Board
            (the kanban). Wall and People were removed; the Board
            is the single "manage prayers" surface, and clicking a
            card opens its detail in a modal overlay. */}
        <nav className="p-view-switch" role="tablist" aria-label="Prayers views">
          {[
            { id: 'dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'kanban',    icon: '📋', label: 'Board' },
          ].map(v => (
            <button
              key={v.id}
              role="tab" aria-selected={view === v.id}
              className={`p-view-tab ${view === v.id ? 'on' : ''}`}
              onClick={() => setView(v.id)}
            >
              <span className="p-view-icon">{v.icon}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-tb-actions">
          {/* New Prayer button lives in the topbar only while the
              Board view is active — the Dashboard has its own CTAs
              (Pray Now banner, stat tiles, empty-state) and didn't
              need a second New Prayer call-to-action competing with
              them. Praise was removed entirely from the topbar; the
              kind picker inside the form (Praying / Answered /
              Praise) is the single place to choose. */}
          {view === 'kanban' && (
            <button className="app-btn primary" data-tour="tour-primary-action" onClick={() => newFromDashboard('request')}>✦ New Prayer</button>
          )}

          {/* Notification bell — mirrors the Journal topbar bell.
              Hover or click opens the popover. Long-standing alerts
              link straight to the affected prayer; reminder alerts
              just inform. */}
          <div
            className="p-tb-bell-wrap"
            onMouseEnter={openNotifsTooltip}
            onMouseLeave={scheduleCloseNotifs}
          >
            <button
              className="p-tb-bell"
              onClick={() => setShowNotifs(v => !v)}
              aria-label={`${notifications.length} notifications`}
              title={`${notifications.length} notification${notifications.length === 1 ? '' : 's'}`}
            >
              🔔
              {notifications.length > 0 && (
                <span className="p-tb-bell-badge">{notifications.length}</span>
              )}
            </button>
            {showNotifs && (
              <div
                className="p-notif-popover"
                role="dialog"
                aria-label="Notifications"
                onMouseEnter={openNotifsTooltip}
                onMouseLeave={scheduleCloseNotifs}
              >
                <div className="p-notif-popover-hd">
                  <span className="p-notif-popover-title">Notifications</span>
                  {notifications.length > 0 && (
                    <button className="p-notif-dismiss-all" onClick={dismissAll}>
                      Dismiss all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="p-notif-empty">You're all caught up.</div>
                ) : (
                  <div className="p-notif-list">
                    {notifications.map(n => (
                      <div key={n.id} className="p-notif-item">
                        {/* Long-standing alerts deep-link to the
                            specific prayer; reminder alerts just sit
                            on the popover. */}
                        {n.prayerId ? (
                          <button
                            type="button"
                            className="p-notif-text-btn"
                            onClick={() => {
                              setShowNotifs(false);
                              const target = (prayers || []).find(p => p.id === n.prayerId);
                              if (target) openPrayerFromDashboard(target);
                            }}
                            title="Open this prayer"
                          >
                            <span className="p-notif-icon">{n.icon || '🔔'}</span>
                            <span className="p-notif-text">
                              <span className="p-notif-title">{n.title}</span>
                              <span className="p-notif-body">{n.body}</span>
                            </span>
                          </button>
                        ) : (
                          <div className="p-notif-text-wrap">
                            <span className="p-notif-icon">{n.icon || '🔔'}</span>
                            <span className="p-notif-text">
                              <span className="p-notif-title">{n.title}</span>
                              <span className="p-notif-body">{n.body}</span>
                            </span>
                          </div>
                        )}
                        <button
                          className="p-notif-dismiss"
                          onClick={() => dismiss(n.id)}
                          title="Dismiss"
                          aria-label="Dismiss notification"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile avatar — opens a tabbed modal:
              👤 Profile · 📋 Page Settings.
              Mirrors the Journal topbar pattern. */}
          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      {/* BODY ──
            Four views share the page chrome:
              • dashboard → stats + Pray Now CTA + recent activity
              • wall      → mailbox (filter chips · inline-expand list)
              • kanban    → 3-column drag-drop board
              • people    → grouped by who you're praying for
            Each gets its own grid template — Wall is the only one
            with a multi-pane layout. */}
      {view === 'dashboard' ? (
        <div
          className="p-body p-body-dashboard"
          style={{ gridTemplateColumns: `1fr` }}
        >
          <NavRail />
          <main className="p-center">
            <PrayerDashboard
              prayers={prayers}
              categories={ALL_CATEGORIES}
              display={display}
              onJump={jumpToBoard}
              onOpenPrayer={openPrayerFromDashboard}
              onNew={newFromDashboard}
              onStartPrayNow={() => setPrayNowOpen(true)}
            />
          </main>
        </div>
      ) : (
        <div
          className="p-body p-body-kanban"
          style={{ gridTemplateColumns: `1fr` }}
        >
          <NavRail />
          <main className="p-center">
            <PrayerKanban
              prayers={prayers}
              allFriends={friends}
              display={display}
              onChangeKind={handleStatusChange}
              onOpenPrayer={openPrayerFromDashboard}
              onNew={newFromDashboard}
            />
          </main>
        </div>
      )}

      {/* Detail / Form modal —
            Shown when the user either clicks a prayer card on the
            Board (which sets `selected`) or hits ✦ New Prayer /
            ✨ Praise (which sets `showForm`). The same overlay
            hosts both states; whichever flag is truthy decides
            what renders inside. Clicking the dimmed backdrop or
            the ✕ closes both. */}
      {(showForm || selected) && (
        <>
          <div
            className="p-detail-overlay"
            onClick={() => { setShowForm(false); setSelected(null); }}
          />
          <div className="p-detail-modal" role="dialog" aria-label={showForm ? 'New prayer' : selected?.title}>
            <button
              className="p-detail-modal-close"
              onClick={() => { setShowForm(false); setSelected(null); }}
              aria-label="Close"
            >✕</button>
            <div className="p-detail-modal-body">
              {showForm ? (
                <NewPrayerForm
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  friends={friends}
                  categories={ALL_CATEGORIES}
                  editing={!!editingId}
                  onSave={handleSave}
                  onCancel={closeForm}
                />
              ) : (
                <PrayerDetail
                  prayer={selected}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  friends={friends}
                  showFriendPicker={showFriendPicker}
                  setShowFriendPicker={setShowFriendPicker}
                  updateText={updateText}
                  setUpdateText={setUpdateText}
                  addingUpdate={addingUpdate}
                  onAddUpdate={handleAddUpdate}
                  onStatusChange={handleStatusChange}
                  onToggleDaily={handleToggleDaily}
                  onToggleUrgent={handleToggleUrgent}
                  onToggleFriend={toggleFriendLink}
                  onEdit={() => handleEditPrayer(selected)}
                  onDelete={() => handleDelete(selected.id)}
                  onDeleteUpdate={handleDeleteUpdate}
                  embedded
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Profile / Page Settings modal — shared shell that hosts
          the page-specific PrayerPageSettings body in its second
          tab. */}
      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={
          <PrayerPageSettings
            prayers={prayers}
            setPrayers={setPrayers}
            onClose={() => setShowProfile(false)}
          />
        }
      />

      {/* Pray Now liturgy overlay — fires from the Dashboard CTA.
          Mutations route through the same handlers the Wall uses
          (handleAddUpdate, handleStatusChange) so updates flow
          back to Firestore + the live prayers array. */}
      <PrayNowMode
        open={prayNowOpen}
        prayers={prayers}
        onClose={() => setPrayNowOpen(false)}
        onAddUpdate={async (p, text) => {
          try {
            await prayerService.addUpdate(p.id, { content: text });
            const res = await prayerService.getOne(p.id);
            const updated = res.data.data;
            setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
          } catch { /* swallow — the session continues */ }
        }}
        onStatusChange={(p, status) => handleStatusChange(p, status)}
        onOpenPrayer={(p) => {
          setPrayNowOpen(false);
          openPrayerFromDashboard(p);
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */

/* PrayerRow / FilterGroup / FilterChip / MailboxEmptyState
   sub-components were removed alongside the Wall view. The Board
   (PrayerKanban) renders its own cards, and the new-prayer empty
   case is handled inside PrayerKanban + PrayerDashboard. */

/* ─────────────────────────────────────────────────────────────
   Detail (tabbed)
   ───────────────────────────────────────────────────────────── */
function PrayerDetail({
  prayer, activeTab, setActiveTab,
  friends, showFriendPicker, setShowFriendPicker,
  updateText, setUpdateText, addingUpdate, onAddUpdate,
  onStatusChange, onToggleDaily, onToggleUrgent, onToggleFriend,
  onEdit, onDelete, onDeleteUpdate,
}) {
  const s = getStatus(prayer);
  const isPraise = getKind(prayer) === 'praise';
  const age = ageDays(prayer.created_at);
  const updates = prayer.updates || [];
  /* Resolve `friend_ids` → array of full friend objects (with name,
     color_from, etc.) using the page's loaded `friends` list. Falls
     back to a legacy embedded `friends` array for historical
     compatibility. Without this resolution the Praying-For tab kept
     showing "No one linked yet" even after linking someone. */
  const linkedIds = Array.isArray(prayer.friend_ids)
    ? prayer.friend_ids
    : Array.isArray(prayer.friends)
      ? prayer.friends.map(f => f?.id).filter(Boolean)
      : [];
  const linkedFriends = linkedIds
    .map(id => (friends || []).find(f => f.id === id))
    .filter(Boolean);

  return (
    <div className="p-detail">
      {/* Header */}
      <header className="p-detail-hd">
        <div className="p-detail-hd-top">
          <div className="p-detail-pills">
            {/* Kind pill — Praying / Answered / Praise. NO LONGER
                overridden by is_urgent (those are independent now);
                if the prayer is urgent it gets a separate pill
                rendered next to this one. */}
            <span className="p-mood-pill" style={{ background: s.color, color: s.text }}>
              {isPraise ? '✨ Praise' : `${s.emoji} ${s.label}`}
            </span>
            {!!prayer.is_urgent && (
              <span
                className="p-mood-pill p-mood-pill-urgent"
                style={{ background: URGENT.color, color: URGENT.text }}
              >
                {URGENT.emoji} {URGENT.label}
              </span>
            )}
            {!!prayer.is_daily && <span className="p-pill-daily">📆 Daily</span>}
            <span className="p-pill-cat">{prayer.category || 'General'}</span>
          </div>
          <div className="p-detail-actions">
            {/* Opens the same form that's used for new prayers, but
                pre-filled with this prayer's title, content, category,
                scripture, urgent / daily flags, kind, and linked
                friends. Saving routes through prayerService.update. */}
            <button className="app-btn ghost icon-only" title="Edit prayer" onClick={onEdit}>✏</button>
            <button className="app-btn ghost icon-only" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        </div>
        <h1 className="p-detail-title">{prayer.title || '(Untitled prayer)'}</h1>
        <div className="p-detail-meta">
          {/* `created_at` was unconditional .replace().parseISO() — any
              prayer missing the field (e.g. stub records written by an
              earlier setFriends bug, before that service returned full
              objects) crashed the entire detail render. Try/catch keeps
              the modal openable so the user can fix or delete the
              entry instead of being stuck on a blank screen. */}
          {(() => {
            try {
              if (!prayer.created_at) return null;
              const dt = parseISO(prayer.created_at.replace(' ', 'T'));
              return <span>📅 {format(dt, 'MMMM d, yyyy')}</span>;
            } catch { return null; }
          })()}
          {prayer.created_at && <span>·</span>}
          <span>{age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'} on the wall`}</span>
          {updates.length > 0 && <>
            <span>·</span>
            <span>{updates.length} update{updates.length === 1 ? '' : 's'}</span>
          </>}
        </div>
      </header>

      {/* Tabs */}
      <nav className="p-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`p-tab ${activeTab === t.key ? 'on' : ''}`}
            onClick={() => setActiveTab(t.key)}
            title={t.hint}
          >
            <span>{t.emoji}</span> {t.label}
            {t.key === 'updates'  && updates.length > 0      && <span className="p-tab-badge">{updates.length}</span>}
            {t.key === 'people'   && linkedFriends.length > 0 && <span className="p-tab-badge">{linkedFriends.length}</span>}
          </button>
        ))}
      </nav>

      {/* Tab hint — explains what this tab shows */}
      <div className="p-tab-hint">
        {TABS.find(t => t.key === activeTab)?.hint}
      </div>

      {/* Tab content */}
      <div className="p-tab-body">
        {activeTab === 'updates' && (
          <UpdatesTab
            updates={updates}
            text={updateText}
            setText={setUpdateText}
            adding={addingUpdate}
            onAdd={onAddUpdate}
            onDelete={onDeleteUpdate}
          />
        )}
        {activeTab === 'request' && (
          <RequestTab
            prayer={prayer}
            onStatusChange={onStatusChange}
            onToggleDaily={onToggleDaily}
            onToggleUrgent={onToggleUrgent}
          />
        )}
        {activeTab === 'people' && (
          <PeopleTab
            prayer={prayer}
            friends={friends}
            linked={linkedFriends}
            showPicker={showFriendPicker}
            setShowPicker={setShowFriendPicker}
            onToggle={onToggleFriend}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab prayer={prayer} updates={updates} age={age} />
        )}
      </div>
    </div>
  );
}

function UpdatesTab({ updates, text, setText, adding, onAdd, onDelete }) {
  return (
    <div className="p-updates">
      <div className="p-up-composer">
        <textarea
          className="p-up-textarea"
          rows={3}
          placeholder="How is God moving? Share an update, a sense of peace, a Scripture, a step forward…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAdd(); }}
        />
        <div className="p-up-composer-ft">
          <span className="p-up-hint">⌘+Enter to post</span>
          <button
            className="app-btn primary"
            onClick={onAdd}
            disabled={adding || !text.trim()}
          >
            {adding ? 'Posting…' : '+ Add Update'}
          </button>
        </div>
      </div>

      {updates.length === 0 ? (
        <div className="p-up-empty">
          <div className="p-up-empty-icon">🙏</div>
          <div className="p-up-empty-title">No updates yet</div>
          <div className="p-up-empty-sub">
            This is the running journal of how God is moving in this prayer.
            Add your first reflection above.
          </div>
        </div>
      ) : (
        <div className="p-up-timeline">
          {updates.map((u, idx) => (
            <article key={u.id} className="p-up-item">
              <div className="p-up-dot" data-idx={idx} />
              <div className="p-up-body">
                <div className="p-up-text">{u.content}</div>
                <div className="p-up-date">
                  {(() => {
                    try {
                      if (!u.created_at) return '';
                      return format(parseISO(u.created_at.replace(' ', 'T')), 'MMM d, yyyy · h:mm a');
                    } catch { return ''; }
                  })()}
                </div>
              </div>
              {/* Per-update delete. Only shown when a handler is
                  wired so reusable callers without the handler
                  don't end up with a dead button. */}
              {onDelete && (
                <button
                  type="button"
                  className="p-up-del"
                  title="Delete this update"
                  aria-label="Delete update"
                  onClick={() => onDelete(u.id)}
                >✕</button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestTab({ prayer, onStatusChange, onToggleDaily, onToggleUrgent }) {
  /* Unified verse list — prefer the new multi `verses` array; fall
     back to migrating the legacy single `scripture` / `verse_text`
     pair so older prayers keep displaying their reference. */
  const verses = (Array.isArray(prayer.verses) && prayer.verses.length)
    ? prayer.verses
    : (prayer.scripture
        ? [{ ref: prayer.scripture, text: prayer.verse_text || '' }]
        : []);

  return (
    <div className="p-request">
      {/* ── 1. Body / "Share your heart" content ── */}
      <div className="p-req-section">
        <div className="p-req-label">📝 Prayer</div>
        <div className="p-req-content">
          {prayer.content || <span className="p-muted">No description.</span>}
        </div>
      </div>

      {/* ── 2. Scripture verses — each one collapsible ── */}
      {verses.length > 0 && (
        <div className="p-req-section">
          <div className="p-req-label">
            📖 Scripture · {verses.length} verse{verses.length === 1 ? '' : 's'}
          </div>
          <div className="p-req-verses">
            {verses.map((v, i) => (
              <RequestVerseCard key={i} verse={v} />
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Metadata strip — category at a glance ── */}
      <div className="p-req-section p-req-meta-strip">
        <span className="p-req-meta-chip">🗂 {prayer.category || 'General'}</span>
      </div>

      {/* ── 4. Status picker (Praying / Answered / Praise) ──
          Urgent is NO LONGER one of these — it's a separate toggle
          below so the user can mark an Answered prayer urgent (or
          vice versa) without one wiping out the other. */}
      <div className="p-req-section">
        <div className="p-req-label">Status</div>
        <div className="p-status-btns">
          {KINDS.map(k => {
            const on = getKind(prayer) === k.value;
            return (
              <button
                key={k.value}
                className={`p-status-btn ${on ? 'on' : ''}`}
                style={on ? { background: k.color, color: k.text, borderColor: k.text } : null}
                onClick={() => onStatusChange(prayer, k.value)}
              >
                {k.emoji} {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 5. Independent Urgent toggle + daily list ── */}
      <div className="p-req-section">
        <div className="p-req-label">Flags</div>
        <label className="p-toggle">
          <input
            type="checkbox"
            checked={!!prayer.is_urgent}
            onChange={() => onToggleUrgent?.(prayer)}
          />
          <span>🔥 Mark as urgent (independent of status)</span>
        </label>
        <label className="p-toggle">
          <input
            type="checkbox"
            checked={!!prayer.is_daily}
            onChange={() => onToggleDaily(prayer)}
          />
          <span>📆 Include in my daily prayer list</span>
        </label>
      </div>
    </div>
  );
}

/* Collapsible verse card. Shows the reference always; clicking
   expands to show the resolved bible-api text. If we have no text
   (offline / unresolved at save time) the card still surfaces the
   reference but the toggle is hidden. */
function RequestVerseCard({ verse }) {
  const [open, setOpen] = useState(false);
  const hasText = !!verse?.text;
  return (
    <div className={`p-req-verse-card ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="p-req-verse-toggle"
        onClick={() => hasText && setOpen(v => !v)}
        disabled={!hasText}
      >
        <span className="p-req-verse-ref">📖 {verse.ref}</span>
        {hasText && (
          <span className="p-req-verse-chev">
            {open ? '▲ collapse' : '▼ read verse'}
          </span>
        )}
      </button>
      {open && hasText && (
        <div className="p-req-verse-text">{verse.text}</div>
      )}
    </div>
  );
}

function PeopleTab({ prayer, friends, linked, showPicker, setShowPicker, onToggle }) {
  const linkedIds = new Set(linked.map(f => f.id));
  const available = friends.filter(f => !linkedIds.has(f.id));

  return (
    <div className="p-people">
      <div className="p-people-section">
        <div className="p-req-label">Praying For</div>
        {linked.length === 0 ? (
          <div className="p-people-empty">
            No one linked yet. Add friends from your contacts to keep them
            close to this prayer.
          </div>
        ) : (
          <div className="p-friend-chips">
            {linked.map(f => (
              <button
                key={f.id}
                className="p-friend-chip"
                onClick={() => onToggle(f.id)}
                title="Remove"
              >
                <span
                  className="p-friend-av"
                  style={{
                    background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                  }}
                >{f.initials || f.name?.[0] || '?'}</span>
                <span className="p-friend-name">{f.name}</span>
                <span className="p-friend-x">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-people-section">
        <div className="p-people-add">
          <button
            className="app-btn ghost"
            onClick={() => setShowPicker(v => !v)}
          >
            {showPicker ? 'Hide friend list' : '+ Add a friend to this prayer'}
          </button>
        </div>
        {showPicker && (
          <div className="p-friend-picker">
            {friends.length === 0 ? (
              <div className="p-people-empty">
                No friends in your hub yet. Add them in the Friends tab first.
              </div>
            ) : available.length === 0 ? (
              <div className="p-people-empty">
                Every friend is already linked to this prayer.
              </div>
            ) : (
              available.map(f => (
                <button
                  key={f.id}
                  className="p-picker-row"
                  onClick={() => onToggle(f.id)}
                >
                  <span
                    className="p-friend-av"
                    style={{
                      background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                    }}
                  >{f.initials || f.name?.[0] || '?'}</span>
                  <div className="p-picker-info">
                    <div className="p-picker-name">{f.name}</div>
                    <div className="p-picker-role">{f.role || f.church || 'Friend'}</div>
                  </div>
                  <span className="p-picker-add">+</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsTab({ prayer, updates, age }) {
  const lastUpdate = updates[0];
  const daysSinceLast = lastUpdate
    ? ageDays(lastUpdate.created_at)
    : age;
  const updateFreq = updates.length > 0 && age > 0
    ? (updates.length / Math.max(1, Math.floor(age / 7))).toFixed(1)
    : updates.length;

  return (
    <div className="p-insights">
      <div className="p-ins-grid">
        <InsightCard label="Days on the wall"        value={age || 'Today'} />
        <InsightCard label="Total updates"           value={updates.length} />
        <InsightCard label="Days since last update"  value={lastUpdate ? daysSinceLast : '—'} />
        <InsightCard label="Updates per week"        value={updates.length === 0 ? '—' : updateFreq} />
      </div>

      <div className="p-ins-tip">
        💡 {updates.length === 0
          ? 'Adding regular updates turns a prayer into a story of how God moves.'
          : daysSinceLast > 14
          ? 'It has been a while since you added an update. Reflect on where God has met you.'
          : 'Keep noting the small movements — they often reveal the bigger picture later.'}
      </div>
    </div>
  );
}

function InsightCard({ label, value }) {
  return (
    <div className="p-ins-card">
      <div className="p-ins-value">{value}</div>
      <div className="p-ins-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   New Prayer Form
   ───────────────────────────────────────────────────────────── */
function NewPrayerForm({ form, setForm, saving, friends, onSave, onCancel, categories, editing = false }) {
  const CATS = categories && categories.length ? categories : CATEGORIES;
  const isPraise = getKind(form) === 'praise';
  const toggleFriend = (id) => {
    setForm(f => ({
      ...f,
      friend_ids: f.friend_ids.includes(id)
        ? f.friend_ids.filter(x => x !== id)
        : [...f.friend_ids, id]
    }));
  };

  /* ── Scripture verse lookup (mirrors Journal) ──
     As the user types a reference ("John 3:16", "Psalm 23",
     "Romans 8:28-39"), we debounce 900ms then hit bible-api.com.
     The resolved text lands on `form.verse_text` so it persists with
     the saved prayer AND shows in the inline preview below the
     input. `looksLikeReference` skips lookups on plain words
     ("love", "John") so we don't fire on every keystroke of "John". */
  const [verseLoading, setVerseLoading] = useState(false);
  const verseDebounceRef = useRef(null);

  const handleScriptureChange = (e) => {
    const val = e.target.value;
    /* If the input is cleared, also clear any previously-resolved
       text — otherwise stale verse text would linger under an
       empty reference. */
    setForm(f => ({ ...f, scripture: val, verse_text: val ? f.verse_text : '' }));
    if (verseDebounceRef.current) clearTimeout(verseDebounceRef.current);
    if (!val.trim() || !looksLikeReference(val)) {
      setVerseLoading(false);
      return;
    }
    setVerseLoading(true);
    verseDebounceRef.current = setTimeout(async () => {
      const text = await fetchVerseText(val);
      setForm(f => ({ ...f, verse_text: text }));
      setVerseLoading(false);
    }, 900);
  };

  /* Push the in-progress reference onto form.verses and clear the
     composer. If the lookup hasn't returned yet we still add the
     reference (with an empty `text`); the detail view falls back to
     showing just the reference in that case. */
  const addPendingVerse = () => {
    const ref = form.scripture.trim();
    if (!ref) return;
    setForm(f => ({
      ...f,
      verses: [...(f.verses || []), { ref, text: f.verse_text || '' }],
      scripture: '',
      verse_text: '',
    }));
    if (verseDebounceRef.current) clearTimeout(verseDebounceRef.current);
    setVerseLoading(false);
  };

  return (
    <div className="p-form">
      <header className="p-form-hd">
        <div className="p-form-title">
          {editing
            ? (isPraise ? '✏ Edit Praise' : '✏ Edit Prayer')
            : (isPraise ? '✨ New Praise' : '✦ New Prayer Request')}
        </div>
        <button className="app-btn ghost icon-only" onClick={onCancel}>✕</button>
      </header>

      {/* Status picker (consolidated kind) — replaces the old
          Type toggle + Status dropdown pair. The three buttons map
          1:1 onto how the rest of the page filters and groups
          prayers. */}
      <div className="p-type-toggle p-kind-toggle">
        {KINDS.map(k => {
          const on = getKind(form) === k.value;
          return (
            <button
              key={k.value}
              type="button"
              className={`p-type-opt ${on ? 'on' : ''} kind-${k.value}`}
              onClick={() => setForm(f => ({ ...f, ...setKindPayload(k.value) }))}
            >
              {k.emoji} {k.label}
            </button>
          );
        })}
      </div>

      <div className="p-form-body">
        <input
          className="p-form-title-input"
          placeholder={isPraise ? 'What are you giving thanks for?' : 'What are you lifting up to God?'}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        />

        <textarea
          className="p-form-body-input"
          rows={5}
          placeholder={isPraise
            ? 'Tell the story — what did God do, and what does it stir in you?'
            : 'Share your heart — be specific, He hears every word…'}
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
        />

        {/* Multi-verse picker. Type a reference; once it resolves
            (or even if it doesn't), hit Enter or "+ Add" to push it
            into form.verses. Each saved verse becomes a collapsible
            card both here in the form and on the detail Request tab. */}
        <div className="p-form-scripture-wrap">
          {/* Already-added verses — small cards with a remove ✕. */}
          {form.verses.length > 0 && (
            <div className="p-form-verses-list">
              {form.verses.map((v, idx) => (
                <div key={idx} className="p-form-verse-card">
                  <span className="p-form-verse-card-ref">📖 {v.ref}</span>
                  {!!v.text && (
                    <span className="p-form-verse-card-hint">— {v.text.length} char{v.text.length === 1 ? '' : 's'} resolved</span>
                  )}
                  <button
                    type="button"
                    className="p-form-verse-card-x"
                    onClick={() => setForm(f => ({
                      ...f,
                      verses: f.verses.filter((_, i) => i !== idx),
                    }))}
                    aria-label="Remove verse"
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Composer row — input + Add. Enter also adds. */}
          <div className="p-form-verse-add-row">
            <input
              className="p-form-scripture"
              placeholder="📖 Add a scripture (e.g. John 3:16, Psalm 23, Romans 8:28-39)"
              value={form.scripture}
              onChange={handleScriptureChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && form.scripture.trim()) {
                  e.preventDefault();
                  addPendingVerse();
                }
              }}
            />
            <button
              type="button"
              className="p-form-verse-add-btn"
              onClick={addPendingVerse}
              disabled={verseLoading || !form.scripture.trim()}
              title="Add this scripture to the prayer"
            >+ Add</button>
          </div>

          {verseLoading && (
            <div className="p-form-verse-spinner" aria-label="Looking up verse">
              <span/><span/><span/>
            </div>
          )}
          {!verseLoading && !!form.verse_text && (
            <div className="p-form-verse-preview" aria-live="polite">
              <div className="p-form-verse-preview-hd">
                📖 {form.scripture}
              </div>
              <div className="p-form-verse-preview-body">{form.verse_text}</div>
            </div>
          )}
          {!verseLoading
            && !!form.scripture.trim()
            && looksLikeReference(form.scripture)
            && !form.verse_text && (
              <div className="p-form-verse-miss">
                Couldn't find that reference — you can still add it as a reference-only entry.
              </div>
            )}
          {form.verses.length === 0 && !form.scripture.trim() && (
            <div className="p-form-verse-hint">
              Press Enter or tap + Add · You can add multiple verses.
            </div>
          )}
        </div>

        <div className="p-form-row">
          <div className="p-form-field">
            <label className="p-form-lbl">Category</label>
            <select
              className="p-form-select"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Status dropdown removed — the kind picker above
              handles "Praying / Answered / Praise" in one place. */}
        </div>

        {!isPraise && (
          <div className="p-form-checks">
            <label className="p-toggle">
              <input
                type="checkbox"
                checked={form.is_urgent}
                onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked }))}
              />
              <span>🔥 Urgent — needs immediate intercession</span>
            </label>
            <label className="p-toggle">
              <input
                type="checkbox"
                checked={form.is_daily}
                onChange={e => setForm(f => ({ ...f, is_daily: e.target.checked }))}
              />
              <span>📆 Add to my daily prayer list</span>
            </label>
          </div>
        )}

        {friends.length > 0 && (
          <div className="p-form-field">
            <label className="p-form-lbl">Praying for (optional)</label>
            <div className="p-form-friends">
              {friends.map(f => (
                <button
                  key={f.id}
                  className={`p-form-friend ${form.friend_ids.includes(f.id) ? 'on' : ''}`}
                  onClick={() => toggleFriend(f.id)}
                >
                  <span
                    className="p-friend-av sm"
                    style={{
                      background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                    }}
                  >{f.initials || f.name?.[0] || '?'}</span>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="p-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={saving || !form.title.trim() || !form.content.trim()}
        >
          {saving
            ? 'Saving…'
            : editing
              ? '💾 Save Changes'
              : (isPraise ? '✨ Save Praise' : '🙏 Submit Prayer')}
        </button>
      </footer>
    </div>
  );
}
