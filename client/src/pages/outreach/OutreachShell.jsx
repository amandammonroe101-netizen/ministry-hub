import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { OUTREACH_OVERVIEW, OUTREACH_GROUPS } from './outreachConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { OUTREACH_VISIBILITY_STORAGE_KEY, isOutreachPageVisible } from './outreachVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './OutreachShell.css';

/* ─────────────────────────────────────────────────────────────
   Outreach Ministry — bespoke shell (prototype)

   A self-contained nav + header for the Outreach Ministry section,
   mirroring WomensShell.jsx's pattern (own dropdown nav, own
   header, own page lock) but with a "sunrise / going out into the
   community" visual identity instead of Women's floral one.
   Replaces NavRail + the shared .app-topbar entirely for any page
   that opts in.

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see OutreachContacts.jsx / OutreachFollowUps.jsx.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [OUTREACH_OVERVIEW];

/* Per-section accents — reuse the same colors already assigned to
   each group in outreachConfig.js so the shell nav and the group
   headers agree. */
const GROUP_ACCENTS = {
  initiatives: '#fb7185',
  people:      '#60a5fa',
  partners:    '#a78bfa',
  resources:   '#fbbf24',
  team:        '#6ee7b7',
  records:     '#f472b6',
};
const DEFAULT_ACCENT = '#2dd4bf';

const PATH_ACCENTS = {};
OUTREACH_GROUPS.forEach(group => {
  const color = GROUP_ACCENTS[group.key] || DEFAULT_ACCENT;
  group.items.forEach(item => { PATH_ACCENTS[item.path] = color; });
});

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Soft time-of-day gradient variant, chosen once per mount — stays
   within the teal/sunrise family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'osh-time-night';
  if (hour < 12) return 'osh-time-morning';
  if (hour < 17) return 'osh-time-afternoon';
  if (hour < 21) return 'osh-time-evening';
  return 'osh-time-night';
}

export default function OutreachShell({
  title,
  icon,
  subtitle,
  actions,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /* Detached pop-out windows show only this page's content — no nav
     chrome, matching how the app-wide NavRail is suppressed in
     App.jsx for every other detached page. Exception: dragging the
     whole "Outreach Ministry" entry off the main rail keeps this
     shell's own nav dropdown, since that pop-out is meant to carry
     the whole ministry section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Outreach Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'outreach');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-outreach-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.outreach?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-outreach-unlocked', '1'); } catch {}
  };

  /* Which pages this member has chosen to see in their own copy of
     the menu — same "hidden unless turned off" model as the main
     app's Settings > Visible Categories, just scoped to this
     ministry and toggled per-page from the profile avatar's
     "Customize Menu" tab (see OutreachMenuSettings). */
  const [pageVisibility] = useUserStoreKey(OUTREACH_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = useMemo(
    () => TOP_LINKS.filter(p => p.path === OUTREACH_OVERVIEW.path || isOutreachPageVisible(pageVisibility, p.path)),
    [pageVisibility]
  );
  const visibleGroups = useMemo(
    () => OUTREACH_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isOutreachPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  /* ── Drag-to-detach ──
        Same gesture as the main NavRail (Electron only). */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Outreach Ministry has its own trigger. */
  useEffect(() => {
    document.body.classList.add('osh-shell-active');
    return () => document.body.classList.remove('osh-shell-active');
  }, []);

  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function handleOutside(e) {
      if (navWrapRef.current && !navWrapRef.current.contains(e.target)) setNavOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [navOpen]);

  useEffect(() => {
    if (!window.electronAPI?.onDetachedRoutes) return;
    const off = window.electronAPI.onDetachedRoutes(routes => setDetachedRoutes(routes || []));
    window.electronAPI.requestDetachedRoutes?.();
    return () => off?.();
  }, []);

  function handleLinkDragStart(e, path) {
    if (!canDetach()) return;
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  function handleLinkDragEnd(e, path) {
    setDragging(false);
    if (!canDetach()) return;
    const rect = document.querySelector('.osh-nav-dropdown')?.getBoundingClientRect();
    const offWindow = e.clientX <= 0 && e.clientY <= 0;
    const outsidePanel = rect
      ? (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
      : true;
    if (offWindow || outsidePanel) {
      window.electronAPI?.openDetached?.(path);
      setNavOpen(false);
    }
  }

  useLayoutEffect(() => {
    const activeEl = linkRefs.current.get(pathname);
    if (activeEl) {
      setPill({
        top: activeEl.offsetTop,
        height: activeEl.offsetHeight,
        opacity: 1,
        accent: PATH_ACCENTS[pathname] || DEFAULT_ACCENT,
      });
    } else {
      setPill(p => ({ ...p, opacity: 0 }));
    }
  }, [pathname]);

  function registerLink(path) {
    return (el) => {
      if (el) linkRefs.current.set(path, el);
      else linkRefs.current.delete(path);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="osh-picture-frame">
        <div className={`osh-page ${timeClass}`}>
          <div className="osh-glow glow-a" />
          <div className="osh-glow glow-b" />
          <div className="osh-lock-wrap" role="dialog" aria-modal="true" aria-label="Outreach Ministry is locked">
            <div className="osh-lock-card">
              <div className="osh-lock-icon" aria-hidden="true">🔒</div>
              <div className="osh-lock-eyebrow">Outreach Ministry</div>
              <h2 className="osh-lock-title">This space is locked</h2>
              <p className="osh-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="osh-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="osh-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="osh-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="osh-lock-settings-link"
                onClick={() => navigate('/settings')}
              >
                Manage this lock in Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="osh-picture-frame">
    <div className={`osh-page ${timeClass}`}>
      <div className="osh-glow glow-a" />
      <div className="osh-glow glow-b" />

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="osh-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="osh-main">
        <header className="osh-header">
          <div className="osh-header-row">
            {keepNav && (
            <div className="osh-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`osh-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Outreach Ministry menu"
                aria-expanded={navOpen}
              >
                🤲
              </button>

              {navOpen && (
                <nav className="osh-nav-dropdown">
                  <button type="button" className="osh-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="osh-brand">
                    <span className="osh-brand-mark">✦</span>
                    <span className="osh-brand-name">Outreach Ministry</span>
                  </div>

                  <div className="osh-nav-scroll" ref={navScrollRef}>
                    <div
                      className="osh-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="osh-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== OUTREACH_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="osh-nav-group" key={group.key}>
                        <div className="osh-nav-group-label">{group.icon} {group.label}</div>
                        {group.items.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                          <NavLink
                            key={p.path}
                            page={p}
                            active={pathname === p.path}
                            onClick={navigate}
                            accent={GROUP_ACCENTS[group.key] || DEFAULT_ACCENT}
                            registerRef={registerLink(p.path)}
                            draggable={canDetach()}
                            onDragStart={(e) => handleLinkDragStart(e, p.path)}
                            onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </nav>
              )}
            </div>
            )}

            <div className="osh-header-text">
              <div className="osh-crumbs">Outreach Ministry</div>
              <div className="osh-title-row">
                {icon && <span className="osh-title-icon">{icon}</span>}
                <h1 className="osh-title">{title}</h1>
                <div className="osh-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="osh-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="osh-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="osh-content" key={pathname}>{children}</div>
      </div>
    </div>
    </div>
  );
}

function NavLink({ page, active, onClick, accent, registerRef, draggable, onDragStart, onDragEnd }) {
  return (
    <button
      ref={registerRef}
      type="button"
      className={`osh-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--osh-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="osh-nav-link-icon">{page.icon}</span>
      <span className="osh-nav-link-label">{page.label}</span>
    </button>
  );
}
