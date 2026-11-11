/* Prayer Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab on the Prayers page.

   Mirrors Journal's PageSettingsTab pattern: a sub-tab pill bar
   along the top splits the knobs into themed groups so the modal
   isn't one long scroll. The shared `pm-ps-*` classes from
   ProfileModal.css style the pill bar + section headers, so this
   file only owns its bespoke list/grid rules. */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { prayerService } from '../../services/prayerService';
import { fetchVerseText, looksLikeReference } from '../../lib/bibleLookup';
import {
  usePrayerReminders, usePrayerDisplay, usePrayerCategories,
  usePrayerNotifPrefs, usePrayerBackup, usePrayerIntegrations,
  SYNC_WEEK_CHOICES,
} from '../../lib/prayerPageSettings';
import { createReminderEvents, deleteReminderEvents } from '../../lib/reminderCalendarSync';
import { useUserStoreKey } from '../../lib/userStore';
import { downloadGuideDocx } from '../../lib/downloadGuideDocx';
import { PRAYER_GUIDE } from './prayerGuide';
import './PrayerPageSettings.css';

/* Local YYYY-MM-DD — must match todayISO() in prayerNotifications so
   the dismissal we clear here lines up with the bell's day key. */
function todayISOLocal() {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const SHORT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const SUB_TABS = [
  { id: 'reminders',    label: '🔔', name: 'Reminders' },
  { id: 'display',      label: '🎨', name: 'Display' },
  { id: 'categories',   label: '🗂', name: 'Categories' },
  { id: 'integrations', label: '🔗', name: 'Integrations' },
  { id: 'archived',     label: '📦', name: 'Archived' },
  { id: 'data',         label: '💾', name: 'Data' },
  { id: 'howto',        label: '❓', name: 'How to Use' },
];

export default function PrayerPageSettings({ prayers, setPrayers, onClose }) {
  const [activeSub, setActiveSub] = useState('reminders');
  const navigate = useNavigate();

  /* Live-subscribed setting groups — each writes to its own
     Firestore key. */
  const [reminders,    setReminders]    = usePrayerReminders();
  const [display,      setDisplay]      = usePrayerDisplay();
  const [categories,   setCategories]   = usePrayerCategories();
  const [notifPrefs,   setNotifPrefs]   = usePrayerNotifPrefs();
  const [backup,       setBackup]       = usePrayerBackup();
  const [integrations, setIntegrations] = usePrayerIntegrations();

  /* Today's dismissed-notification record (shared with the bell via
     usePrayerNotifications). We clear the reminder entry here when the
     user re-enables the reminder so it re-appears immediately instead
     of staying hidden behind an earlier same-day dismissal. */
  const [, setDismissedToday] = useUserStoreKey('prayer-dismissed-today', { date: '', ids: [] });

  /* Custom-category input row state. */
  const [newCat, setNewCat] = useState('');

  /* ── Encouragement-verse lookup (Display tab) ──
     Mirrors the prayer form's scripture pattern: as the user types
     a new reference, debounce 900ms, hit bible-api.com via the
     shared lib, then persist both `encouragementRef` and the
     resolved `encouragementText` so the Dashboard card displays
     the chosen verse without needing to re-fetch. */
  const [encLoading, setEncLoading] = useState(false);
  const encDebounceRef = useRef(null);
  const handleEncouragementChange = (val) => {
    /* Optimistic write of the reference so the input stays
       responsive. Text is left alone here and replaced below once
       the lookup returns (or cleared if the input went empty). */
    if (!val.trim()) {
      setDisplay({ ...display, encouragementRef: '', encouragementText: '' });
      if (encDebounceRef.current) clearTimeout(encDebounceRef.current);
      setEncLoading(false);
      return;
    }
    setDisplay({ ...display, encouragementRef: val });
    if (encDebounceRef.current) clearTimeout(encDebounceRef.current);
    if (!looksLikeReference(val)) {
      setEncLoading(false);
      return;
    }
    setEncLoading(true);
    encDebounceRef.current = setTimeout(async () => {
      const text = await fetchVerseText(val);
      setDisplay({ ...display, encouragementRef: val, encouragementText: text });
      setEncLoading(false);
    }, 900);
  };

  /* ── Reminder commit + calendar sync ──
     Every change to the prayer-reminder settings (enabled, time,
     days, syncCalendar, syncWeeks) routes through this helper instead
     of calling setReminders directly. It diffs the new state against
     the current one and decides whether the calendar needs to be
     rewritten:

       • Sync OFF (either toggle off, or reminder disabled) → tear
         down whatever events we created previously.
       • Sync ON and a schedule field changed (time/days/weeks) →
         delete the old events, create a fresh batch, store the
         new ids on the reminder so we know what to clean up next.

     Network work happens AFTER the Firestore write so the UI is
     never blocked on bulkCreate / bulkDelete; if the calendar call
     fails (offline, permissions, etc.) the settings still save and
     we just log a warning. */
  const commitReminders = async (next) => {
    const prev = reminders || {};
    const wasSyncing = !!(prev.enabled && prev.syncCalendar);
    const willSync   = !!(next.enabled && next.syncCalendar);
    const scheduleChanged =
      JSON.stringify(prev.days || []) !== JSON.stringify(next.days || []) ||
      (prev.time || '')   !== (next.time || '')   ||
      (prev.syncWeeks||12) !== (next.syncWeeks||12);

    /* Optimistic write — persist immediately so the UI feels snappy.
       eventIds may be replaced again below after the calendar work. */
    setReminders(next);

    /* Turning the reminder ON (from off) should surface it in the bell
       right away — even if it was dismissed earlier today. Clear any
       same-day reminder dismissal so usePrayerNotifications stops
       suppressing it. */
    if (next.enabled && !prev.enabled) {
      const today = todayISOLocal();
      setDismissedToday(d => {
        const sameDay = d?.date === today;
        const ids = (sameDay ? (d.ids || []) : [])
          .filter(id => !String(id).startsWith('pr-reminder-'));
        return { date: today, ids };
      });
    }

    /* Nothing calendar-related to do unless we're toggling sync, or
       a schedule field changed while sync is already on. */
    if (!wasSyncing && !willSync) return;
    if (wasSyncing && willSync && !scheduleChanged) return;

    /* Tear down whatever we created previously. */
    await deleteReminderEvents(prev.eventIds || []);

    /* If sync is on (and the reminder is enabled), create a fresh
       batch and persist the new ids. */
    let eventIds = [];
    if (willSync) {
      eventIds = await createReminderEvents({
        label:    '🙏 Prayer reminder',
        time:     next.time || '08:00',
        days:     next.days || [],
        weeks:    next.syncWeeks || 12,
        color:    '#a78bfa',
        source:   'prayer-reminder',
        sourceId: '',
      });
    }
    setReminders({ ...next, eventIds });
  };

  const toggleDay = (d) => {
    const days = Array.isArray(reminders.days) ? reminders.days : [];
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    commitReminders({ ...reminders, days: next });
  };

  const addCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    if ((categories.custom || []).includes(trimmed)) { setNewCat(''); return; }
    setCategories({ custom: [...(categories.custom || []), trimmed] });
    setNewCat('');
  };
  const removeCategory = (c) => {
    setCategories({ custom: (categories.custom || []).filter(x => x !== c) });
  };

  /* ── Archived sub-tab actions ──
     Archive logic = prayers marked answered. Set-current isn't a
     thing for prayers, but the user can permanently delete or
     re-open (flip status back to praying). */
  const archived = (prayers || []).filter(p => p.status === 'answered');

  const reopenPrayer = async (p) => {
    try {
      const res = await prayerService.update(p.id, { status: 'praying' });
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch { /* error surfaced elsewhere */ }
  };
  const deletePrayer = async (p) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await prayerService.delete(p.id);
      setPrayers(prev => prev.filter(x => x.id !== p.id));
    } catch { /* noop */ }
  };

  /* ── Data sub-tab: export all prayers as JSON. */
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(prayers || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prayers-${format(new Date(),'yyyy-MM-dd')}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="pm-body pps-root">
      {/* Sub-tab pill bar. */}
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

      {/* ───────── 🔔 Reminders ───────── */}
      {activeSub === 'reminders' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">🔔 Prayer Reminders</div>
        <div className="pm-ps-section-sub">
          A gentle nudge to spend time praying on the days you choose.
        </div>

        <label className="pps-toggle">
          <input
            type="checkbox" checked={!!reminders.enabled}
            onChange={e => commitReminders({ ...reminders, enabled: e.target.checked })}
          />
          <span>Enable prayer reminder</span>
        </label>

        <div className="pps-row">
          <div className="pps-field">
            <span className="pm-lbl">Days</span>
            <div className="pps-day-row">
              {SHORT_DAYS.map(d => {
                const on = (reminders.days || []).includes(d);
                return (
                  <button
                    key={d} type="button"
                    className={`pps-day ${on ? 'on' : ''}`}
                    onClick={() => toggleDay(d)}
                    disabled={!reminders.enabled}
                    aria-pressed={on}
                  >{d}</button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="pps-toggle">
          <input
            type="checkbox" checked={!!reminders.syncCalendar}
            onChange={e => commitReminders({ ...reminders, syncCalendar: e.target.checked })}
            disabled={!reminders.enabled}
          />
          <span>Sync to Calendar</span>
        </label>

        {/* How many weeks of events to materialize. Replaces the old
            hard-coded "next 12 weeks" suffix. Disabled when sync is
            off so the chooser doesn't suggest it's doing anything. */}
        <label className="pps-field pps-field-narrow">
          <span className="pm-lbl">Sync horizon</span>
          <select
            className="pm-input"
            value={reminders.syncWeeks || 12}
            onChange={e => commitReminders({
              ...reminders,
              syncWeeks: parseInt(e.target.value, 10) || 12,
            })}
            disabled={!reminders.enabled || !reminders.syncCalendar}
          >
            {SYNC_WEEK_CHOICES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <div className="pps-field-hint">
            How many weeks of reminder events to add to the calendar.
          </div>
        </label>

        {/* "View in Calendar" — proves the sync actually wrote
            events, and gives the user a one-click path to see them.
            Only shown once sync is on AND we've successfully
            materialized at least one event (eventIds tracks them). */}
        {reminders.enabled
          && reminders.syncCalendar
          && (reminders.eventIds || []).length > 0 && (
            <div className="pps-sync-link-row">
              <button
                type="button"
                className="pps-sync-link"
                onClick={() => { navigate('/calendar'); onClose?.(); }}
                title="Jump to your calendar to see the linked reminders"
              >
                📅 View {reminders.eventIds.length} reminder{reminders.eventIds.length === 1 ? '' : 's'} in Calendar →
              </button>
            </div>
          )}
      </div>
      )}

      {/* ───────── 🎨 Display ───────── */}
      {activeSub === 'display' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">🎨 Display & Layout</div>
        <div className="pm-ps-section-sub">
          Tune what shows up + how it's laid out.
        </div>

        <label className="pm-field">
          <span className="pm-lbl">Open page on</span>
          <select
            className="pm-input"
            value={display.landingView || 'dashboard'}
            onChange={e => setDisplay({ ...display, landingView: e.target.value })}
          >
            <option value="dashboard">📊 Dashboard (recommended)</option>
            <option value="kanban">📋 Board</option>
          </select>
        </label>

        {/* Default Wall section removed — the Wall is now a
            mailbox with filter chips, not accordion sections.
            The Dashboard's stat tiles set the right filter preset
            when you jump from Dashboard → Wall. */}

        <label className="pm-field">
          <span className="pm-lbl">Sort prayers by</span>
          <select
            className="pm-input"
            value={display.sortOrder || 'newest'}
            onChange={e => setDisplay({ ...display, sortOrder: e.target.value })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="mostUpdated">Most updates first</option>
          </select>
        </label>

        <label className="pm-field">
          <span className="pm-lbl">List density</span>
          <select
            className="pm-input"
            value={display.cardDensity || 'comfy'}
            onChange={e => setDisplay({ ...display, cardDensity: e.target.value })}
          >
            <option value="comfy">Comfy</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <div className="pm-lbl" style={{ marginTop: 6 }}>Dashboard cards</div>
        <div className="pps-toggle-grid">
          <label className="pps-toggle">
            <input
              type="checkbox" checked={display.showAnswerRate !== false}
              onChange={e => setDisplay({ ...display, showAnswerRate: e.target.checked })}
            />
            <span>Answer rate</span>
          </label>
          <label className="pps-toggle">
            <input
              type="checkbox" checked={display.showCategoryBars !== false}
              onChange={e => setDisplay({ ...display, showCategoryBars: e.target.checked })}
            />
            <span>Category bars</span>
          </label>
          <label className="pps-toggle">
            <input
              type="checkbox" checked={display.showEncouragement !== false}
              onChange={e => setDisplay({ ...display, showEncouragement: e.target.checked })}
            />
            <span>Encouragement verse</span>
          </label>
        </div>

        {/* ── Encouragement verse picker ──
            Self-contained block under the dashboard-cards toggles so
            it visually attaches to the "Encouragement verse" toggle
            it depends on. Hidden entirely when the toggle is off. */}
        {display.showEncouragement !== false && (
          <div className="pps-enc-card">
            <div className="pps-enc-hd">
              <span className="pps-enc-icon">📖</span>
              <span className="pps-enc-title">Encouragement verse</span>
            </div>
            <div className="pps-enc-sub">
              Pick any scripture — the full text is looked up automatically and shown on the Dashboard card.
            </div>
            <div className="pps-enc-input-wrap">
              <input
                type="text"
                className="pm-input pps-enc-input"
                placeholder="e.g. Philippians 4:6, Psalm 23, Romans 8:28"
                value={display.encouragementRef || ''}
                onChange={e => handleEncouragementChange(e.target.value)}
              />
              {encLoading && (
                <div className="pps-enc-spinner" aria-label="Looking up verse">
                  <span/><span/><span/>
                </div>
              )}
            </div>

            {!encLoading && !!display.encouragementText && (
              <div className="pps-enc-preview" aria-live="polite">
                <div className="pps-enc-preview-text">
                  &ldquo;{display.encouragementText}&rdquo;
                </div>
                <div className="pps-enc-preview-ref">— {display.encouragementRef}</div>
              </div>
            )}
            {!encLoading
              && !!(display.encouragementRef || '').trim()
              && looksLikeReference(display.encouragementRef)
              && !display.encouragementText && (
                <div className="pps-enc-miss">
                  Couldn't find that reference — the card will fall back to just the reference.
                </div>
              )}
            {!encLoading
              && !(display.encouragementRef || '').trim() && (
                <div className="pps-enc-hint">
                  Leave the reference blank to hide the verse card entirely.
                </div>
              )}
          </div>
        )}
      </div>
      )}

      {/* ───────── 🗂 Categories ───────── */}
      {activeSub === 'categories' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">🗂 Custom Categories</div>
        <div className="pm-ps-section-sub">
          Built-in: General · Health · Family · Church · Provision · Guidance · Relationships · Ministry · Other.
          Add your own below — they show up everywhere you pick a category.
        </div>

        <div className="pps-cat-add">
          <input
            type="text" className="pm-input"
            placeholder="e.g. Adoption, Salvation, Business…"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <button type="button" className="pps-cat-add-btn" onClick={addCategory}>
            + Add
          </button>
        </div>

        {(categories.custom || []).length === 0 ? (
          <div className="pm-ps-empty">No custom categories yet.</div>
        ) : (
          <div className="pps-cat-chips">
            {(categories.custom || []).map(c => (
              <span key={c} className="pps-cat-chip">
                {c}
                <button
                  type="button"
                  className="pps-cat-chip-x"
                  onClick={() => removeCategory(c)}
                  title="Remove"
                  aria-label={`Remove ${c}`}
                >✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ───────── 🔗 Integrations ───────── */}
      {activeSub === 'integrations' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">🔗 Integrations</div>
        <div className="pm-ps-section-sub">
          Connect Prayers to the rest of Ministry Hub.
        </div>

        <label className="pps-toggle">
          <input
            type="checkbox" checked={!!integrations.linkJournal}
            onChange={e => setIntegrations({ ...integrations, linkJournal: e.target.checked })}
          />
          <span>
            Link prayers to journal entries
            <em style={{ opacity:.55, marginLeft:6 }}>— surface a journal-picker in the prayer detail</em>
          </span>
        </label>
        <label className="pps-toggle">
          <input
            type="checkbox" checked={!!integrations.linkPlanner}
            onChange={e => setIntegrations({ ...integrations, linkPlanner: e.target.checked })}
          />
          <span>
            Add daily list to Day Planner
            <em style={{ opacity:.55, marginLeft:6 }}>— surfaces today's daily prayers as a planner block</em>
          </span>
        </label>

        <div className="pm-ps-section-title" style={{ marginTop:10, fontSize:13 }}>🔔 Notification Behavior</div>
        <label className="pps-toggle">
          <input
            type="checkbox" checked={!!notifPrefs.longstandingAlert}
            onChange={e => setNotifPrefs({ ...notifPrefs, longstandingAlert: e.target.checked })}
          />
          <span>
            Long-standing alert
            <em style={{ opacity:.55, marginLeft:6 }}>
              — notify when a prayer has waited {notifPrefs.longstandingThreshold || 30}+ days
            </em>
          </span>
        </label>
        <label className="pps-toggle">
          <input
            type="checkbox" checked={notifPrefs.urgentBadge !== false}
            onChange={e => setNotifPrefs({ ...notifPrefs, urgentBadge: e.target.checked })}
          />
          <span>Show urgent badge on the nav rail</span>
        </label>
      </div>
      )}

      {/* ───────── 📦 Archived (Answered) ───────── */}
      {activeSub === 'archived' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">📦 Answered Prayers</div>
        <div className="pm-ps-section-sub">
          Every prayer you've marked answered. Re-open one to put it back on
          the active wall, or delete it entirely.
        </div>

        {archived.length === 0 ? (
          <div className="pm-ps-empty">No answered prayers yet.</div>
        ) : (
          <div className="pps-mv-list">
            {archived.map(p => (
              <div key={p.id} className="pps-mv-item">
                <div className="pps-mv-info">
                  <div className="pps-mv-ref">🎉 {p.title}</div>
                  <div className="pps-mv-text">
                    "{(p.content || '').slice(0, 120)}{(p.content || '').length > 120 ? '…' : ''}"
                  </div>
                  <div className="pps-mv-date">
                    {p.created_at
                      ? `Created ${format(parseISO(p.created_at.replace(' ','T')), 'MMM d, yyyy')}`
                      : ''}
                  </div>
                </div>
                <div className="pps-mv-acts">
                  <button
                    type="button"
                    className="pps-mv-activate"
                    onClick={() => reopenPrayer(p)}
                  >↺ Re-open</button>
                  <button
                    type="button"
                    className="pps-mv-delete"
                    onClick={() => deletePrayer(p)}
                    title="Delete this prayer"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ───────── 💾 Data ───────── */}
      {activeSub === 'data' && (
      <div className="pm-ps-section">
        <div className="pm-ps-section-title">💾 Data & Export</div>
        <div className="pm-ps-section-sub">
          Download a copy of every prayer or change the default export format.
        </div>

        <label className="pm-field">
          <span className="pm-lbl">Default export format</span>
          <select
            className="pm-input"
            value={backup.defaultFormat || 'md'}
            onChange={e => setBackup({ ...backup, defaultFormat: e.target.value })}
          >
            <option value="md">Markdown (.md)</option>
            <option value="txt">Plain text (.txt)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </label>

        <div className="pps-toggle-grid">
          <label className="pps-toggle">
            <input
              type="checkbox" checked={backup.includeUpdates !== false}
              onChange={e => setBackup({ ...backup, includeUpdates: e.target.checked })}
            />
            <span>Include updates</span>
          </label>
          <label className="pps-toggle">
            <input
              type="checkbox" checked={backup.includeFriends !== false}
              onChange={e => setBackup({ ...backup, includeFriends: e.target.checked })}
            />
            <span>Include linked friends</span>
          </label>
        </div>

        <button type="button" className="pps-export-btn" onClick={exportAll}>
          ⬇ Download all prayers (JSON)
        </button>
      </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ─────────
            A full, typed-out reference guide to the Prayers page,
            written in-app so users don't have to go hunting for
            documentation. Mirrors docs/PRAYERS_HOW_TO_USE.md. */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="pps-howto-title-row">
          <div className="pm-ps-section-title">❓ How to Use the Prayers Page</div>
          <button
            type="button"
            className="pps-howto-download"
            onClick={() => downloadGuideDocx(PRAYER_GUIDE, 'Prayers-How-To-Use.docx')}
          >⬇ Download as Word doc</button>
        </div>

        <div className="pps-howto-feedback">
          <span className="pps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="pps-howto-intro">
          A full walkthrough of everything on this page — tracking prayer requests and praise,
          working through them with Pray Now, and linking the people you're praying for. Skim
          the headers below or read start to finish.
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">🏠 The Dashboard</div>
          <ul className="pps-howto-list">
            <li><b>🙏 Pray Now banner</b> — launches a guided walkthrough of what needs prayer right now.</li>
            <li><b>Today's Focus</b> — up to 6 urgent and daily-list prayers; click a row to open it.</li>
            <li><b>Stats Row</b> — Total, Answered, Urgent, Daily, Praise, and 30+ days — each tile jumps to the Board pre-filtered.</li>
            <li><b>Answer Rate</b> — percentage of prayers marked answered (toggle in Display tab).</li>
            <li><b>Recent Testimonies</b> — up to 4 recently answered prayers.</li>
            <li><b>Carrying Longest</b> — up to 3 of your oldest still-open prayers.</li>
            <li><b>Category Bars</b> — distribution of prayers across categories (toggle in Display tab).</li>
            <li><b>Encouragement Verse</b> — a scripture verse you choose, auto-looked-up (set in Display tab).</li>
          </ul>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">📋 The Board (Kanban)</div>
          <div className="pps-howto-p">
            Switch to <b>📋 Board</b> in the topbar to see every prayer as a draggable card across
            three columns: <b>🙏 Praying</b>, <b>✓ Answered</b>, and <b>✨ Praise</b>. Drag a card
            between columns to change its status instantly, or click a card to open its full
            detail view. Urgent prayers float to the top of the Praying column automatically.
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">✦ Adding a Prayer or Praise</div>
          <div className="pps-howto-p">
            Click <b>✦ New Prayer</b> in the topbar. Choose a kind (🙏 Praying / ✓ Answered /
            ✨ Praise — Praise simplifies the form), then fill in a title, body, optional
            scripture references, a category, and the <b>🔥 Urgent</b> / <b>📆 Daily</b> flags.
            You can also toggle on any Friends you're praying for, right from the form.
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">🔍 The Prayer Detail View</div>
          <div className="pps-howto-p">
            Click any prayer card to open its detail modal, with five tabs:
          </div>
          <ul className="pps-howto-list">
            <li><b>📖 Prayer</b> — the request text, scripture, category, and status controls.</li>
            <li><b>🙏 Updates</b> — a running timeline; type a reflection and press ⌘+Enter (or click + Add Update) to post.</li>
            <li><b>👥 Praying For</b> — manage which Friends are linked (see below).</li>
            <li><b>📊 Insights</b> — days on the wall, total updates, days since last update, and updates per week, with a contextual tip.</li>
          </ul>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">🙏 Pray Now (Guided Session)</div>
          <div className="pps-howto-p">
            The Pray Now banner walks you through up to 12 prayers in order: urgent first, then
            daily-list, then your 3 oldest, then up to 3 praise entries (saved for last). For
            each one you can jot an optional reflection, mark it answered, skip it, or bail out
            to the Board. Finishing shows a completion screen with the option to pray through
            the list again.
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">👥 Linking Friends to a Prayer</div>
          <div className="pps-howto-p">
            From the <b>Praying For</b> tab (or the New/Edit form), attach any of your saved
            Friends to a prayer. The link is bidirectional — the same prayer shows up under
            that friend's Prayer Requests tab on the Friends page, with a button to jump back
            here.
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">📖 Scripture References</div>
          <div className="pps-howto-p">
            Type a reference (e.g. <i>Romans 8:28-39</i>) and press Enter or click + Add. The
            verse text is auto-fetched after a short pause. If the reference can't be found,
            you'll see a message but the reference is still saved without resolved text.
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">🔔 Reminders & Notifications</div>
          <div className="pps-howto-p">
            Set a daily prayer nudge in the <b>Reminders</b> tab above — pick days and, if you
            like, sync it to your Calendar page. The bell icon in the topbar surfaces both that
            reminder and <b>⏳ long-standing alerts</b> for prayers that have been open past your
            configured threshold (default 30 days, adjustable in the Integrations tab).
          </div>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">📋 Page Settings — Full Reference</div>
          <ul className="pps-howto-list">
            <li><b>🔔 Reminders</b> — daily prayer reminder, days, and calendar sync.</li>
            <li><b>🎨 Display</b> — landing view, sort order, card density, Dashboard cards, and the Encouragement Verse.</li>
            <li><b>🗂 Categories</b> — add or remove custom categories beyond the built-in list.</li>
            <li><b>🔗 Integrations</b> — journal linking, Day Planner, and notification behavior.</li>
            <li><b>📦 Archived</b> — every answered prayer, with re-open or delete.</li>
            <li><b>💾 Data</b> — export format and a one-click download of all prayers.</li>
          </ul>
        </div>

        <div className="pps-howto-block">
          <div className="pps-howto-h">🛠 Troubleshooting</div>
          <ul className="pps-howto-list">
            <li><b>"Couldn't find that reference…"</b> — the Bible lookup failed; the reference itself is still saved.</li>
            <li><b>"Delete this prayer? This cannot be undone."</b> — confirmation shown before permanent deletion.</li>
            <li>Save button stays disabled — both title and body are required.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}
