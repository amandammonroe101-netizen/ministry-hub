import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { WORSHIP_OVERVIEW, WORSHIP_GROUPS } from './worshipConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import './WorshipShell.css';

/* ─────────────────────────────────────────────────────────────
   Worship Ministry — bespoke shell

   A self-contained nav + header for the Worship section, forked
   from the Hospitality Ministry shell (HospitalityShell.jsx) —
   same "own little space instead of a tab in the app" pattern,
   re-skinned as a dark stage: charcoal surfaces, a musical-note
   nav trigger, and soft spotlight glows instead of latte art.

   Pages that adopt this shell should stop rendering NavRail
   themselves and instead wrap their existing body markup as
   children here.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [WORSHIP_OVERVIEW];

/* Distinct accent per group, tinting each nav group's active pill
   + link. Kept in sync with each group's ".ws-group-<key>" sub-theme
   in WorshipShell.css so the dropdown highlight matches the page
   you're actually on. */
const GROUP_ACCENTS = {
  live:         '#94a3b8',
  instruments:  '#94a3b8',
  production:   '#94a3b8',
  songs:        '#94a3b8',
  team:         '#e8871e',
  gear:         '#74c0fc',
  admin:        '#94a3b8',
};
const DEFAULT_ACCENT = '#e8b563';

const PATH_ACCENTS = {};
const PATH_GROUPS = {};
WORSHIP_GROUPS.forEach(group => {
  const color = GROUP_ACCENTS[group.key] || DEFAULT_ACCENT;
  group.items.forEach(item => {
    PATH_ACCENTS[item.path] = color;
    PATH_GROUPS[item.path] = group.key;
  });
});

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Soft time-of-day variant, chosen once per mount — stays within
   the charcoal/stage family, just shifts the spotlight warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'ws-time-night';
  if (hour < 12) return 'ws-time-morning';
  if (hour < 17) return 'ws-time-afternoon';
  if (hour < 21) return 'ws-time-evening';
  return 'ws-time-night';
}

export default function WorshipShell({
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
     chrome — matching every other detached page. Exception: dragging
     the whole "Worship Ministry" entry off the main rail (rather
     than one sub-page out of the dropdown) keeps this shell's own nav
     dropdown, since that pop-out is meant to carry the whole ministry
     section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  /* Which of the 7 sub-groups (if any) the current page belongs to
     — drives the ".ws-group-<key>" sub-theme below. Overview and
     any unmapped page fall back to the neutral base theme. */
  const activeGroup = PATH_GROUPS[pathname];
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this
     shell is mounted — Worship has its own note-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('ws-shell-active');
    return () => document.body.classList.remove('ws-shell-active');
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
    const rect = document.querySelector('.ws-nav-dropdown')?.getBoundingClientRect();
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

  return (
    <div className="ws-picture-frame">
    <div className={`ws-page ${timeClass}${activeGroup ? ` ws-group-${activeGroup}` : ''}`}>
      <div className="ws-bloom bloom-a" />
      <div className="ws-bloom bloom-b" />

      {dragging && (
        <div className="ws-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="ws-main">
        <header className="ws-header">
          <div className="ws-header-row">
            {keepNav && (
            <div className="ws-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`ws-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Worship Ministry menu"
                aria-expanded={navOpen}
              >
                🎶
              </button>

              {navOpen && (
                <nav className="ws-nav-dropdown">
                  <button type="button" className="ws-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="ws-brand">
                    <span className="ws-brand-mark">🎼</span>
                    <span className="ws-brand-name">Worship</span>
                  </div>

                  <div className="ws-nav-scroll" ref={navScrollRef}>
                    <div
                      className="ws-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="ws-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== WORSHIP_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {WORSHIP_GROUPS.map(group => (
                      <div className="ws-nav-group" key={group.key}>
                        <div className="ws-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="ws-header-text">
              <div className="ws-crumbs">Worship Ministry</div>
              <div className="ws-title-row">
                {icon && <span className="ws-title-icon">{icon}</span>}
                <h1 className="ws-title">{title}</h1>
                <div className="ws-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="ws-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="ws-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="ws-content" key={pathname}>{children}</div>
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
      className={`ws-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--ws-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="ws-nav-link-icon">{page.icon}</span>
      <span className="ws-nav-link-label">{page.label}</span>
    </button>
  );
}
