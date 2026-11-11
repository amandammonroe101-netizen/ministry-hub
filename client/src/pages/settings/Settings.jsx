import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { useUserStoreKey } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile } from '../../lib/userProfile';
import {
  NAV_VISIBILITY_STORAGE_KEY,
  NAV_STANDALONE_CATEGORIES,
  NAV_MINISTRY_CATEGORIES,
  ALL_CATEGORY_IDS,
  isCategoryVisible,
} from './navVisibilityConfig';
import {
  BRIEFING_PAGES_KEY,
  isBriefingPageEnabled,
  BRIEFING_ENABLED_KEY,
  isBriefingEnabled,
} from '../../lib/dailyBriefing';
import { SUMMARY_PAGES } from '../../lib/pageSummaries';
import { usePageLocks, LOCKABLE_PAGES } from '../../lib/pageLocks';
import { CLAUDE_API_KEY_STORAGE_KEY } from '../../lib/involvementBriefing';
import {
  submitFounderRequest,
  getMyFounderRequests,
  requestTwoWayAccess,
  getRequestMessages,
  sendRequestMessage,
  REQUEST_TYPES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
} from '../../services/founderRequestService';
import './Settings.css';

/* ─────────────────────────────────────────────────────────────
   Settings — per-user sidebar category visibility.

   This file uses a few inline-style fallbacks on the root
   layout containers so the page still appears correctly even
   if Settings.css hasn't loaded yet (e.g. after adding the
   directory, Vite sometimes needs a dev-server restart before
   it watches a brand-new folder).
   ───────────────────────────────────────────────────────────── */

const ACCENT = '#a78bfa';

const ROOT_STYLE = {
  width:    '100vw',
  height:   '100vh',
  display:  'flex',
  overflow: 'hidden',
  /* transparent so the global .app-bg orbs show through */
  background: 'transparent',
  color:    '#e5e7eb',
};

const MAIN_STYLE = {
  flex:        1,
  minWidth:    0,
  overflowY:   'auto',
  padding:     '32px 32px 64px',
};

const SHELL_STYLE = {
  maxWidth:       1080,
  margin:         '0 auto',
  display:        'flex',
  flexDirection:  'column',
  gap:            24,
};

export default function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('general'); // 'general' | 'page'
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState(null);

  /* Opens "Send a Request" pre-filled — used by the "Forgot code?" link
     on a Page Lock row so a member who's locked herself out (or forgot
     what code she set) can ask the founder to reset it, instead of
     dead-ending with no way forward. */
  const openRequestModal = (prefill = null) => {
    setRequestPrefill(prefill);
    setRequestModalOpen(true);
  };
  const closeRequestModal = () => {
    setRequestModalOpen(false);
    setRequestPrefill(null);
  };
  const [visibility, setVisibility, { loading }] = useUserStoreKey(
    NAV_VISIBILITY_STORAGE_KEY,
    {}
  );

  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_CATEGORY_IDS.length;
    const visible = ALL_CATEGORY_IDS.filter(id => isCategoryVisible(safeVisibility, id)).length;
    return { visible, total, hidden: total - visible };
  }, [safeVisibility]);

  const toggle = (id) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isCategoryVisible(base, id);
      return { ...base, [id]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_CATEGORY_IDS.forEach(id => { next[id] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_CATEGORY_IDS.forEach(id => { next[id] = false; });
    setVisibility(next);
  };
  const reset = () => setVisibility({});

  const showGroup = (ids) => setVisibility(prev => {
    const next = { ...(prev || {}) };
    ids.forEach(id => { next[id] = true; });
    return next;
  });
  const hideGroup = (ids) => setVisibility(prev => {
    const next = { ...(prev || {}) };
    ids.forEach(id => { next[id] = false; });
    return next;
  });

  /* Daily Briefing — which pages feed the "Your Day at a Glance"
     popup. Same default-on model as the sidebar: a page is included
     unless its box is unchecked. */
  const [briefing, setBriefing] = useUserStoreKey(BRIEFING_PAGES_KEY, {});
  const safeBriefing = briefing || {};

  /* Master on/off for the whole Daily Summary popup. Defaults on
     (true) until the user turns it off here. */
  const [briefingEnabled, setBriefingEnabled] = useUserStoreKey(BRIEFING_ENABLED_KEY, true);
  const summaryOn = isBriefingEnabled(briefingEnabled);
  const briefingCounts = useMemo(() => {
    const total = SUMMARY_PAGES.length;
    const on = SUMMARY_PAGES.filter(p => isBriefingPageEnabled(safeBriefing, p.id)).length;
    return { on, total };
  }, [safeBriefing]);

  const toggleBriefing = (id) => setBriefing(prev => {
    const base = prev || {};
    return { ...base, [id]: !isBriefingPageEnabled(base, id) };
  });
  const briefingAll = () => {
    const next = {};
    SUMMARY_PAGES.forEach(p => { next[p.id] = true; });
    setBriefing(next);
  };
  const briefingNone = () => {
    const next = {};
    SUMMARY_PAGES.forEach(p => { next[p.id] = false; });
    setBriefing(next);
  };

  /* Claude API key — powers the real AI-generated briefing on the
     My Involvement dashboard. Stored per-user, same kv pattern as
     everything else here. */
  const [claudeKey, setClaudeKey] = useUserStoreKey(CLAUDE_API_KEY_STORAGE_KEY, '');
  const [claudeKeyDraft, setClaudeKeyDraft] = useState('');
  const [claudeKeyVisible, setClaudeKeyVisible] = useState(false);
  const [claudeKeySaved, setClaudeKeySaved] = useState(false);
  useEffect(() => { setClaudeKeyDraft(claudeKey || ''); }, [claudeKey]);
  const saveClaudeKey = () => {
    setClaudeKey(claudeKeyDraft.trim());
    setClaudeKeySaved(true);
    setTimeout(() => setClaudeKeySaved(false), 2000);
  };

  return (
    <div className="set-root" style={{ ...ROOT_STYLE, '--set-accent': ACCENT }}>
      <NavRail />

      <main className="set-main" style={MAIN_STYLE}>
        <div className="set-shell" style={SHELL_STYLE}>

          <header className="set-header">
            <div className="set-title-row">
              <span className="set-title-icon" aria-hidden="true">⚙</span>
              <h1 className="set-title">Settings</h1>
            </div>
            <p className="set-description">
              Customize your Ministry Hub. Changes are saved to your
              account and apply on every device you sign in from.
            </p>

            <div className="set-tabs" role="tablist" aria-label="Settings sections">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'general'}
                className={`set-tab${tab === 'general' ? ' is-active' : ''}`}
                onClick={() => setTab('general')}
              >
                General
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'page'}
                className={`set-tab${tab === 'page' ? ' is-active' : ''}`}
                onClick={() => setTab('page')}
              >
                📋 Page Settings
              </button>
            </div>
          </header>

          {tab === 'general' && (
            <>
              <section className="set-card">
                <div className="set-card-head">
                  <div>
                    <h2 className="set-card-title">Feedback & Requests</h2>
                    <p className="set-card-sub">
                      Spot a bug, want a new feature, or have an add-on idea?
                      Send it straight to the founder — it shows up right away
                      on the Founder Dashboard.
                    </p>
                  </div>
                  <div className="set-bulk">
                    <button
                      type="button"
                      className="set-btn set-btn-toggle-on"
                      onClick={() => openRequestModal()}
                    >
                      + New Request
                    </button>
                  </div>
                </div>
              </section>

              <MyRequestsSection />

              <section className="set-card">
                <div className="set-card-head">
                  <div>
                    <h2 className="set-card-title">Visible Categories</h2>
                    <p className="set-card-sub">
                      Choose which sidebar categories appear on your interface.
                      {loading ? ' Loading…' : ` Showing ${counts.visible} of ${counts.total} (${counts.hidden} hidden).`}
                    </p>
                  </div>
                  <div className="set-bulk">
                    <button type="button" className="set-btn set-btn-ghost" onClick={showAll}>Show all</button>
                    <button type="button" className="set-btn set-btn-ghost" onClick={hideAll}>Hide all</button>
                    <button type="button" className="set-btn set-btn-ghost" onClick={reset}>Reset</button>
                  </div>
                </div>

                <CategoryGroup
                  title="Pages"
                  subtitle="The single-page items in the top of your sidebar."
                  categories={NAV_STANDALONE_CATEGORIES}
                  visibility={safeVisibility}
                  onToggle={toggle}
                  onShowAll={() => showGroup(NAV_STANDALONE_CATEGORIES.map(c => c.id))}
                  onHideAll={() => hideGroup(NAV_STANDALONE_CATEGORIES.map(c => c.id))}
                />

                <CategoryGroup
                  title="Ministries"
                  subtitle="The collapsible ministry groups that hold sub-pages."
                  categories={NAV_MINISTRY_CATEGORIES}
                  visibility={safeVisibility}
                  onToggle={toggle}
                  onShowAll={() => showGroup(NAV_MINISTRY_CATEGORIES.map(c => c.id))}
                  onHideAll={() => hideGroup(NAV_MINISTRY_CATEGORIES.map(c => c.id))}
                />

                <p className="set-footnote">
                  Heads-up: hidden categories are still reachable by direct URL —
                  Settings just keeps them out of your sidebar.
                </p>
              </section>

              <section className="set-card">
                <div className="set-card-head">
                  <div>
                    <h2 className="set-card-title">Daily Summary</h2>
                    <p className="set-card-sub">
                      {summaryOn
                        ? 'Pick which pages appear in your “Here’s what’s new” summary, shown once on your first launch each day — step through one page at a time with Next.'
                        : 'The Daily Summary popup is turned off — it won’t appear on launch. Turn it back on to choose which pages it includes.'}
                      {summaryOn && ` Including ${briefingCounts.on} of ${briefingCounts.total} pages.`}
                    </p>
                  </div>
                  <div className="set-bulk">
                    <button
                      type="button"
                      className={`set-btn ${summaryOn ? 'set-btn-toggle-on' : 'set-btn-ghost'}`}
                      aria-pressed={summaryOn}
                      onClick={() => setBriefingEnabled(!summaryOn)}
                    >
                      {summaryOn ? 'Popup on' : 'Popup off'}
                    </button>
                    <button type="button" className="set-btn set-btn-ghost" onClick={briefingAll} disabled={!summaryOn}>All</button>
                    <button type="button" className="set-btn set-btn-ghost" onClick={briefingNone} disabled={!summaryOn}>None</button>
                  </div>
                </div>

                <div className="set-grid" style={summaryOn ? undefined : { opacity: 0.45, pointerEvents: 'none' }}>
                  {SUMMARY_PAGES.map(p => {
                    const on = isBriefingPageEnabled(safeBriefing, p.id);
                    return (
                      <label
                        key={p.id}
                        className={`set-row${on ? ' on' : ''}`}
                        title={on ? `${p.label} — shown in your summary` : `${p.label} — left out of your summary`}
                      >
                        <input
                          type="checkbox"
                          className="set-checkbox"
                          checked={on}
                          onChange={() => toggleBriefing(p.id)}
                        />
                        <span className="set-row-icon" aria-hidden="true">{p.icon}</span>
                        <span className="set-row-label">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="set-card">
                <div className="set-card-head">
                  <div>
                    <h2 className="set-card-title">✦ Claude API Key</h2>
                    <p className="set-card-sub">
                      Powers the AI-generated briefing on My Involvement's Dashboard tab.
                      Your key is stored on your account and never shared — get one from{' '}
                      <span style={{ color: 'rgba(255,255,255,0.85)' }}>console.anthropic.com</span>.
                    </p>
                  </div>
                </div>
                <div className="set-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type={claudeKeyVisible ? 'text' : 'password'}
                      className="set-modal-input"
                      style={{ flex: 1 }}
                      value={claudeKeyDraft}
                      onChange={(e) => setClaudeKeyDraft(e.target.value)}
                      placeholder="sk-ant-…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="set-btn set-btn-ghost"
                      onClick={() => setClaudeKeyVisible(v => !v)}
                    >
                      {claudeKeyVisible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="set-btn set-btn-toggle-on"
                      onClick={saveClaudeKey}
                      disabled={claudeKeyDraft.trim() === (claudeKey || '')}
                    >
                      {claudeKeySaved ? 'Saved ✓' : 'Save'}
                    </button>
                  </div>
                  {claudeKey && (
                    <p className="set-footnote" style={{ margin: 0 }}>
                      A key is saved. Clear the field and press Save to remove it.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {tab === 'page' && <PageSettingsTab onForgotCode={openRequestModal} />}

          <div className="set-actions">
            <button
              type="button"
              className="set-btn set-btn-ghost"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </div>

        </div>
      </main>

      {requestModalOpen && (
        <RequestFounderModal onClose={closeRequestModal} initial={requestPrefill} />
      )}
    </div>
  );
}

function CategoryGroup({ title, subtitle, categories, visibility, onToggle, onShowAll, onHideAll }) {
  return (
    <section className="set-group">
      <header className="set-group-head">
        <div>
          <h3 className="set-group-title">{title}</h3>
          <p className="set-group-sub">{subtitle}</p>
        </div>
        <div className="set-group-bulk">
          <button type="button" className="set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </header>
      <div className="set-grid">
        {categories.map(cat => {
          const on = isCategoryVisible(visibility, cat.id);
          return (
            <label
              key={cat.id}
              className={`set-row${on ? ' on' : ''}`}
              title={on ? `${cat.label} — visible in sidebar` : `${cat.label} — hidden from sidebar`}
            >
              <input
                type="checkbox"
                className="set-checkbox"
                checked={on}
                onChange={() => onToggle(cat.id)}
              />
              <span className="set-row-icon" aria-hidden="true">{cat.icon}</span>
              <span className="set-row-label">{cat.label}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/* Page Settings tab — per-page settings that don't fit "sidebar
   visibility" or "daily summary". Currently just Page Locks (code-gate
   a whole section), but built to hold more per-page settings later
   without needing another tab. */
function PageSettingsTab({ onForgotCode }) {
  const [locks, setLocks] = usePageLocks();
  const safeLocks = locks || {};

  return (
    <section className="set-card">
      <div className="set-card-head">
        <div>
          <h2 className="set-card-title">🔒 Page Locks</h2>
          <p className="set-card-sub">
            Require a code before certain sections open — handy on a shared
            device. Codes are tied to your account and sync everywhere
            you're signed in.
          </p>
        </div>
      </div>

      <div className="set-lock-list">
        {LOCKABLE_PAGES.map(page => (
          <PageLockRow
            key={page.id}
            page={page}
            lock={safeLocks[page.id]}
            onChange={(next) => setLocks(prev => ({ ...(prev || {}), [page.id]: next }))}
            onForgotCode={onForgotCode}
          />
        ))}
      </div>
    </section>
  );
}

/* Changing or removing an existing code both require the *current*
   code first — same "prove you know it" gate a stranger at the lock
   screen would hit, so anyone with a few minutes alone at this
   already-signed-in Settings page can't silently swap or drop
   someone else's lock. Forgetting the current code is a dead end
   here on purpose; "Forgot code?" hands off to the founder instead
   of adding a bypass that would defeat the lock. */
function PageLockRow({ page, lock, onChange, onForgotCode }) {
  const enabled = !!(lock?.enabled && String(lock?.code || '').trim());
  const currentCode = lock?.code || '';

  const [mode, setMode]         = useState(null); // null | 'set' | 'change' | 'remove'
  const [oldCode, setOldCode]   = useState('');
  const [code, setCode]         = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [error, setError]       = useState('');

  const resetFields = () => {
    setOldCode('');
    setCode('');
    setConfirmCode('');
    setError('');
  };

  const startSet    = () => { resetFields(); setMode('set'); };
  const startChange = () => { resetFields(); setMode('change'); };
  const startRemove = () => { resetFields(); setMode('remove'); };
  const cancel       = () => { resetFields(); setMode(null); };

  const saveNewCode = () => {
    const trimmed = code.trim();
    if (!trimmed) { setError('Enter a code.'); return; }
    if (trimmed !== confirmCode.trim()) { setError("Codes don't match."); return; }
    onChange({ enabled: true, code: trimmed });
    cancel();
  };

  const saveChangedCode = () => {
    if (oldCode.trim() !== currentCode.trim()) { setError('That\'s not the current code.'); return; }
    const trimmed = code.trim();
    if (!trimmed) { setError('Enter a new code.'); return; }
    if (trimmed !== confirmCode.trim()) { setError("New codes don't match."); return; }
    onChange({ enabled: true, code: trimmed });
    cancel();
  };

  const confirmRemove = () => {
    if (oldCode.trim() !== currentCode.trim()) { setError('That\'s not the current code.'); return; }
    onChange({ enabled: false, code: '' });
    cancel();
  };

  const forgotCode = () => {
    onForgotCode?.({
      type: 'bug',
      title: `Forgot my ${page.label} lock code`,
      description: `I can't remember the code I set for ${page.label} and need it reset so I can get back in. (Sent from Settings → Page Settings.)`,
    });
  };

  return (
    <div className="set-lock-row">
      <div className="set-lock-row-head">
        <span className="set-lock-row-icon" aria-hidden="true">{page.icon}</span>
        <div className="set-lock-row-text">
          <span className="set-lock-row-label">{page.label}</span>
          <span className="set-lock-row-status">
            {enabled
              ? '🔒 Locked — a code is required to open this section.'
              : page.description}
          </span>
        </div>
        {!mode && (
          <div className="set-lock-row-actions">
            {enabled ? (
              <>
                <button type="button" className="set-btn set-btn-ghost" onClick={startChange}>Change Code</button>
                <button type="button" className="set-btn set-btn-ghost" onClick={startRemove}>Remove Lock</button>
              </>
            ) : (
              <button type="button" className="set-btn set-btn-toggle-on" onClick={startSet}>Set Code</button>
            )}
          </div>
        )}
      </div>

      {mode === 'set' && (
        <div className="set-lock-edit">
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="New code"
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            autoFocus
          />
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="Confirm code"
            value={confirmCode}
            onChange={e => { setConfirmCode(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') saveNewCode(); }}
          />
          {error && <div className="set-modal-error">⚠ {error}</div>}
          <div className="set-lock-edit-actions">
            <button type="button" className="set-btn set-btn-ghost" onClick={cancel}>Cancel</button>
            <button type="button" className="set-btn set-btn-toggle-on" onClick={saveNewCode} disabled={!code.trim()}>Save</button>
          </div>
        </div>
      )}

      {mode === 'change' && (
        <div className="set-lock-edit">
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="Current code"
            value={oldCode}
            onChange={e => { setOldCode(e.target.value); setError(''); }}
            autoFocus
          />
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="New code"
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
          />
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="Confirm new code"
            value={confirmCode}
            onChange={e => { setConfirmCode(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') saveChangedCode(); }}
          />
          {error && <div className="set-modal-error">⚠ {error}</div>}
          <div className="set-lock-edit-foot">
            <button type="button" className="set-lock-forgot" onClick={forgotCode}>Forgot code?</button>
            <div className="set-lock-edit-actions">
              <button type="button" className="set-btn set-btn-ghost" onClick={cancel}>Cancel</button>
              <button
                type="button"
                className="set-btn set-btn-toggle-on"
                onClick={saveChangedCode}
                disabled={!oldCode.trim() || !code.trim() || !confirmCode.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'remove' && (
        <div className="set-lock-edit">
          <p className="set-lock-edit-note">Enter the current code to remove this lock.</p>
          <input
            type="password"
            inputMode="numeric"
            className="set-modal-input"
            placeholder="Current code"
            value={oldCode}
            onChange={e => { setOldCode(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') confirmRemove(); }}
            autoFocus
          />
          {error && <div className="set-modal-error">⚠ {error}</div>}
          <div className="set-lock-edit-foot">
            <button type="button" className="set-lock-forgot" onClick={forgotCode}>Forgot code?</button>
            <div className="set-lock-edit-actions">
              <button type="button" className="set-btn set-btn-ghost" onClick={cancel}>Cancel</button>
              <button type="button" className="set-btn set-btn-toggle-on" onClick={confirmRemove} disabled={!oldCode.trim()}>
                Remove Lock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* "Your Requests" — the sender's own view of everything they've filed:
   status/priority, either party's due date, and the per-request chat
   thread. The founder can message here any time (one-way); a sender can
   only reply once the founder accepts their two-way chat request. Only
   rendered once the person has actually filed at least one request. */
function MyRequestsSection() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [messageCounts, setMessageCounts] = useState({});

  /* Message counts per request so a request row visibly shows "there's
     a chat here" even before the person clicks in — without this, a
     founder message could land and the sender would have no way to
     know a thread even exists. */
  const loadMessageCounts = async (rows) => {
    const counts = {};
    await Promise.all(rows.map(async (r) => {
      try {
        const msgs = await getRequestMessages(r.id);
        counts[r.id] = msgs.length;
      } catch {
        counts[r.id] = 0;
      }
    }));
    setMessageCounts(counts);
  };

  const load = async () => {
    setError(null);
    try {
      const rows = await getMyFounderRequests();
      setRequests(rows);
      loadMessageCounts(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load your requests.');
      setRequests([]);
    }
  };

  useEffect(() => { load(); }, []);

  const handleTwoWayChange = (id, status) => {
    setRequests(prev => (prev || []).map(r => (r.id === id ? { ...r, twoWayStatus: status } : r)));
  };

  const handleThreadClose = () => {
    setOpenId(null);
    load();
  };

  if (requests && requests.length === 0) return null;

  const openRequest = openId ? (requests || []).find(r => r.id === openId) : null;

  return (
    <section className="set-card">
      <div className="set-card-head">
        <div>
          <h2 className="set-card-title">Your Requests</h2>
          <p className="set-card-sub">
            Track what you've sent the founder, and chat about it here.
          </p>
        </div>
      </div>

      {error && <div className="set-modal-error">⚠ {error}</div>}
      {requests === null && !error && <p className="set-card-sub">Loading…</p>}

      {requests && requests.length > 0 && (
        <div className="set-my-requests-list">
          {requests.map(r => {
            const statusLabel = REQUEST_STATUSES.find(s => s.id === r.status)?.label || r.status;
            return (
              <button
                key={r.id}
                type="button"
                className="set-my-request-row"
                onClick={() => setOpenId(r.id)}
              >
                <span className="set-my-request-title">{r.title}</span>
                <span className="set-my-request-status">{statusLabel}</span>
                {messageCounts[r.id] > 0 && (
                  <span className="set-my-request-flag set-my-request-flag-msg">💬 {messageCounts[r.id]}</span>
                )}
                {r.twoWayStatus === 'requested' && (
                  <span className="set-my-request-flag">Two-way pending</span>
                )}
                {r.twoWayStatus === 'accepted' && (
                  <span className="set-my-request-flag set-my-request-flag-on">Two-way open</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {openRequest && (
        <MyRequestThreadModal
          request={openRequest}
          onClose={handleThreadClose}
          onTwoWayChange={handleTwoWayChange}
        />
      )}
    </section>
  );
}

/* Per-request chat thread from the sender's side — read the founder's
   messages, request two-way access with an optional note, or (once
   accepted) send messages back. */
function MyRequestThreadModal({ request, onClose, onTwoWayChange }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const rows = await getRequestMessages(request.id);
      setMessages(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load messages.');
      setMessages([]);
    }
  };

  useEffect(() => { load(); }, [request.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendRequestMessage(request.id, { role: 'user', text });
      setText('');
      await load();
    } catch (err) {
      window.alert(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleRequestTwoWay = async (e) => {
    e.preventDefault();
    if (requesting) return;
    setRequesting(true);
    try {
      await requestTwoWayAccess(request.id, note);
      onTwoWayChange(request.id, 'requested');
    } catch (err) {
      window.alert(err?.message || 'Failed to request two-way chat.');
    } finally {
      setRequesting(false);
    }
  };

  const dueDate = request.dueDate ? new Date(`${request.dueDate}T00:00:00`) : null;
  const founderDueDate = request.founderDueDate ? new Date(`${request.founderDueDate}T00:00:00`) : null;
  const canRequestTwoWay = !request.twoWayStatus || request.twoWayStatus === 'none' || request.twoWayStatus === 'declined';

  return (
    <div className="set-modal-backdrop" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <div className="set-modal-head">
          <h2 className="set-modal-title">{request.title}</h2>
          <button type="button" className="set-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {(dueDate || founderDueDate) && (
          <div className="set-thread-meta">
            {dueDate && <span className="set-due-user">Due {format(dueDate, 'MMM d, yyyy')}</span>}
            {founderDueDate && <span className="set-due-founder">Founder due {format(founderDueDate, 'MMM d, yyyy')}</span>}
          </div>
        )}

        {request.twoWayStatus === 'accepted' ? (
          <div className="set-two-way-banner set-two-way-banner-on">
            Two-way chat is enabled — send a message any time.
          </div>
        ) : (
          <div className="set-two-way-banner set-two-way-banner-info">
            You can read messages from the founder here, but can't reply directly —
            request two-way chat below to start a conversation.
          </div>
        )}
        {request.twoWayStatus === 'requested' && (
          <div className="set-two-way-banner">Waiting on the founder to accept two-way chat…</div>
        )}
        {request.twoWayStatus === 'declined' && (
          <div className="set-two-way-banner set-two-way-banner-declined">Your two-way chat request was declined.</div>
        )}

        {error && <div className="set-modal-error">⚠ {error}</div>}
        {messages === null && !error && <p className="set-card-sub">Loading messages…</p>}

        {messages && (
          <div className="set-chat-thread">
            {messages.length === 0 ? (
              <p className="set-card-sub">No messages yet.</p>
            ) : messages.map(m => {
              const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
              return (
                <div key={m.id} className={`set-chat-bubble${m.senderRole === 'founder' ? ' set-chat-bubble-founder' : ' set-chat-bubble-user'}`}>
                  <div className="set-chat-bubble-text">{m.text}</div>
                  {created && <div className="set-chat-bubble-time">{format(created, 'MMM d, h:mm a')}</div>}
                </div>
              );
            })}
          </div>
        )}

        {request.twoWayStatus === 'accepted' ? (
          <form className="set-chat-form" onSubmit={handleSend}>
            <input
              className="set-modal-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Send a message…"
            />
            <button type="submit" className="set-btn set-btn-toggle-on" disabled={sending || !text.trim()}>
              {sending ? '…' : 'Send'}
            </button>
          </form>
        ) : canRequestTwoWay ? (
          <form className="set-modal-form" onSubmit={handleRequestTwoWay}>
            <label className="set-modal-label">
              Ask to chat back and forth (optional note)
              <textarea
                className="set-modal-input set-modal-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why would two-way chat help here?"
                rows={3}
              />
            </label>
            <div className="set-modal-actions">
              <button type="submit" className="set-btn set-btn-toggle-on" disabled={requesting}>
                {requesting ? 'Requesting…' : 'Request Two-Way Chat'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/* "Send a Request" form — files a bug/feature/add-on request that lands
   in the founderRequests Firestore collection and surfaces on the
   Founder Dashboard's Requests panel. */
function RequestFounderModal({ onClose, initial }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const [type, setType] = useState(initial?.type || REQUEST_TYPES[0].id);
  const [priority, setPriority] = useState('medium');
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFounderRequest({
        type,
        title,
        description,
        priority,
        dueDate,
        senderName:  profile?.displayName || user?.displayName || 'Member',
        senderEmail: profile?.email || user?.email || '',
      });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Failed to send request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="set-modal-backdrop" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <div className="set-modal-head">
          <h2 className="set-modal-title">Send a Request</h2>
          <button type="button" className="set-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {sent ? (
          <div className="set-modal-success">
            <p>✓ Sent! Your request landed on the Founder Dashboard.</p>
            <button type="button" className="set-btn set-btn-ghost" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="set-modal-form" onSubmit={handleSubmit}>
            <label className="set-modal-label">
              Type
              <select
                className="set-modal-input"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {REQUEST_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="set-modal-label">
              Priority
              <select
                className="set-modal-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {REQUEST_PRIORITIES.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className="set-modal-label">
              Title
              <input
                className="set-modal-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                maxLength={120}
                required
                autoFocus
              />
            </label>

            <label className="set-modal-label">
              Details
              <textarea
                className="set-modal-input set-modal-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's going on, or what would you like to see?"
                rows={5}
              />
            </label>

            <label className="set-modal-label">
              Due Date (optional)
              <input
                className="set-modal-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>

            {error && <div className="set-modal-error">⚠ {error}</div>}

            <div className="set-modal-actions">
              <button type="button" className="set-btn set-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="set-btn set-btn-toggle-on"
                disabled={submitting || !title.trim()}
              >
                {submitting ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
