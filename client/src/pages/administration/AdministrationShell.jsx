import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ADMINISTRATION_OVERVIEW, ADMINISTRATION_GROUPS } from './administrationConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { ADMINISTRATION_VISIBILITY_STORAGE_KEY, isAdministrationPageVisible } from './administrationVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './AdministrationShell.css';

/* ─────────────────────────────────────────────────────────────
   Administration Ministry — bespoke shell (prototype)

   A self-contained nav + header for the Administration Ministry
   section, mirroring WomensShell.jsx / OutreachShell.jsx's pattern
   (own dropdown nav, own header, own page lock) but with a cool
   slate "institutional dashboard" visual identity instead of
   Women's floral or Outreach's sunrise one. Replaces NavRail + the
   shared .app-topbar entirely for any page that opts in.

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see ComingSoon.jsx.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [ADMINISTRATION_OVERVIEW];

/* Per-section accents — reuse the same colors already assigned to
   each group in administrationConfig.js so the shell nav and the
   group headers agree. */
const GROUP_ACCENTS = {
  hr:           '#60a5fa',
  finance:      '#6ee7b7',
  governance:   '#a78bfa',
  facilities:   '#fbbf24',
  legal:        '#fb7185',
  members:      '#2dd4bf',
  office:       '#f472b6',
  records:      '#94a3b8',
};
const DEFAULT_ACCENT = '#64748b';

const PATH_ACCENTS = {};
ADMINISTRATION_GROUPS.forEach(group => {
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
   entirely within the slate/steel family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'ash-time-night';
  if (hour < 12) return 'ash-time-morning';
  if (hour < 17) return 'ash-time-afternoon';
  if (hour < 21) return 'ash-time-evening';
  return 'ash-time-night';
}

export default function AdministrationShell({
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
     whole "Administration" entry off the main rail keeps this
     shell's own nav dropdown, since that pop-out is meant to carry
     the whole ministry section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Administration section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'administration');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-administration-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.administration?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-administration-unlocked', '1'); } catch {}
  };

  /* Which pages this member has chosen to see in their own copy of
     the menu — same "hidden unless turned off" model as the main
     app's Settings > Visible Categories, just scoped to this
     ministry and toggled per-page from the profile avatar's
     "Customize Menu" tab (see AdministrationMenuSettings). */
  const [pageVisibility] = useUserStoreKey(ADMINISTRATION_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = useMemo(
    () => TOP_LINKS.filter(p => p.path === ADMINISTRATION_OVERVIEW.path || isAdministrationPageVisible(pageVisibility, p.path)),
    [pageVisibility]
  );
  const visibleGroups = useMemo(
    () => ADMINISTRATION_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isAdministrationPageVisible(pageVisibility, i.path)) }))
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
     is mounted — Administration has its own trigger. */
  useEffect(() => {
    document.body.classList.add('ash-shell-active');
    return () => document.body.classList.remove('ash-shell-active');
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
    const rect = document.querySelector('.ash-nav-dropdown')?.getBoundingClientRect();
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
      <div className="ash-picture-frame">
        <div className={`ash-page ${timeClass}`}>
          <div className="ash-glow glow-a" />
          <div className="ash-glow glow-b" />
          <div className="ash-lock-wrap" role="dialog" aria-modal="true" aria-label="Administration is locked">
            <div className="ash-lock-card">
              <div className="ash-lock-icon" aria-hidden="true">🔒</div>
              <div className="ash-lock-eyebrow">Administration</div>
              <h2 className="ash-lock-title">This space is locked</h2>
              <p className="ash-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="ash-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="ash-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="ash-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="ash-lock-settings-link"
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
    <div className="ash-picture-frame">
    <div className={`ash-page ${timeClass}`}>
      <div className="ash-glow glow-a" />
      <div className="ash-glow glow-b" />
      <div className="ash-glow glow-c" />
      <div className="ash-grid" aria-hidden="true" />
      <div className="ash-scan" aria-hidden="true" />

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="ash-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="ash-main">
        <header className="ash-header">
          <div className="ash-header-row">
            {keepNav && (
            <div className="ash-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`ash-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Administration menu"
                aria-expanded={navOpen}
              >
                🏛
              </button>

              {navOpen && (
                <nav className="ash-nav-dropdown">
                  <button type="button" className="ash-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="ash-brand">
                    <span className="ash-brand-mark">✦</span>
                    <span className="ash-brand-name">Administration</span>
                  </div>

                  <div className="ash-nav-scroll" ref={navScrollRef}>
                    <div
                      className="ash-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="ash-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== ADMINISTRATION_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="ash-nav-group" key={group.key}>
                        <div className="ash-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="ash-header-text">
              <div className="ash-crumbs">Administration</div>
              <div className="ash-title-row">
                {icon && <span className="ash-title-icon">{icon}</span>}
                <h1 className="ash-title">{title}</h1>
                <div className="ash-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="ash-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="ash-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="ash-content" key={pathname}>{children}</div>
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
      className={`ash-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--ash-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="ash-nav-link-icon">{page.icon}</span>
      <span className="ash-nav-link-label">{page.label}</span>
    </button>
  );
}
