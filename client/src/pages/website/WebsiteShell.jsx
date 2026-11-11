import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { WEBSITE_OVERVIEW, WEBSITE_GROUPS } from './websiteConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './WebsiteShell.css';

/* ─────────────────────────────────────────────────────────────
   Website Ministry — bespoke shell

   Same "own little space instead of a tab in the app" pattern as
   WomensShell / HospitalityShell, re-skinned as a "blue glass over
   water" surface: an animated water backdrop (drifting light
   caustics), a mitered blue-glass picture frame with river-stone
   corner clusters, and small ripple animations that bloom from any
   button the user clicks.

   Nine of the ten Website pages already had real, fully-built
   components before this shell existed — those pages pass
   `fullBleed` so their own split-pane layouts (sidebar + list/
   detail) fill the content area edge-to-edge instead of getting
   the default scrollable padded box.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [WEBSITE_OVERVIEW];

const GROUP_ACCENTS = {
  inventory:   '#2f8f7a',
  maintenance: '#3a6ea5',
  operations:  '#1c5f8a',
};
const DEFAULT_ACCENT = '#1ba8c4';

const PATH_ACCENTS = {};
WEBSITE_GROUPS.forEach(group => {
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

/* Water-drop ripple: spawns a short-lived expanding circle at the
   click point on any button that calls it. The button itself needs
   position:relative + overflow:hidden (set in CSS) to contain it. */
function spawnRipple(e) {
  const el = e.currentTarget;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.8;
  const ripple = document.createElement('span');
  ripple.className = 'wbs-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

export default function WebsiteShell({
  title,
  icon,
  subtitle,
  actions,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  fullBleed = false,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /* Detached pop-out windows show only this page's content — no nav
     chrome — matching every other detached page. Exception: dragging
     the whole "Website Ministry" entry off the main rail (rather
     than one sub-page out of the dropdown) keeps this shell's own
     nav dropdown, since that pop-out is meant to carry the whole
     ministry section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Page lock: the whole Website Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'website');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-website-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.website?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-website-unlocked', '1'); } catch {}
  };

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this
     shell is mounted — Website Ministry has its own globe trigger. */
  useEffect(() => {
    document.body.classList.add('wbs-shell-active');
    return () => document.body.classList.remove('wbs-shell-active');
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
    const rect = document.querySelector('.wbs-nav-dropdown')?.getBoundingClientRect();
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
      <div className="wbs-page">
        <WbsFrame />
        <div className="wbs-lock-wrap" role="dialog" aria-modal="true" aria-label="Website Ministry is locked">
          <div className="wbs-lock-card">
            <div className="wbs-lock-icon" aria-hidden="true">🔒</div>
            <div className="wbs-lock-eyebrow">Website Ministry</div>
            <h2 className="wbs-lock-title">This space is locked</h2>
            <p className="wbs-lock-sub">Enter the code to continue.</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              className="wbs-lock-input"
              placeholder="Code"
              value={challenge.value}
              onChange={e => setChallenge({ value: e.target.value, error: '' })}
              onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
            />
            {challenge.error && <div className="wbs-lock-err">{challenge.error}</div>}
            <button
              type="button"
              className="wbs-lock-btn"
              onClick={(e) => { spawnRipple(e); submitChallenge(); }}
              disabled={!challenge.value.trim()}
            >
              Unlock
            </button>
            <button
              type="button"
              className="wbs-lock-settings-link"
              onClick={(e) => { spawnRipple(e); navigate('/settings'); }}
            >
              Manage this lock in Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wbs-page">
      <WbsFrame />

      {dragging && (
        <div className="wbs-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="wbs-main">
        <header className="wbs-header">
          <div className="wbs-header-row">
            {keepNav && (
            <div className="wbs-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`wbs-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={(e) => { spawnRipple(e); setNavOpen(o => !o); }}
                aria-label="Open Website Ministry menu"
                aria-expanded={navOpen}
              >
                🌐
              </button>

              {navOpen && (
                <nav className="wbs-nav-dropdown">
                  <button type="button" className="wbs-exit" onClick={(e) => { spawnRipple(e); navigate('/calendar'); }}>
                    ← Ministry Hub
                  </button>

                  <div className="wbs-brand">
                    <span className="wbs-brand-mark">◈</span>
                    <span className="wbs-brand-name">Website Ministry</span>
                  </div>

                  <div className="wbs-nav-scroll" ref={navScrollRef}>
                    <div
                      className="wbs-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="wbs-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== WEBSITE_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {WEBSITE_GROUPS.map(group => (
                      <div className="wbs-nav-group" key={group.key}>
                        <div className="wbs-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="wbs-header-text">
              <div className="wbs-crumbs">Website Ministry</div>
              <div className="wbs-title-row">
                {icon && <span className="wbs-title-icon">{icon}</span>}
                <h1 className="wbs-title">{title}</h1>
                <div className="wbs-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="wbs-avatar"
                      onClick={(e) => { spawnRipple(e); onProfileClick(e); }}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="wbs-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className={`wbs-content${fullBleed ? ' wbs-content-full' : ''}`} key={pathname}>{children}</div>
      </div>
    </div>
  );
}

/* Decorative "blue glass" border — a translucent glass channel inset
   from the shell's edge plus four river-stone corner clusters.
   Rendered above the water backdrop in both the locked and unlocked
   states. */
function WbsFrame() {
  return (
    <div className="wbs-frame" aria-hidden="true">
      <span className="wbs-frame-corner wbs-frame-corner--tl" />
      <span className="wbs-frame-corner wbs-frame-corner--tr" />
      <span className="wbs-frame-corner wbs-frame-corner--bl" />
      <span className="wbs-frame-corner wbs-frame-corner--br" />
    </div>
  );
}

function NavLink({ page, active, onClick, accent, registerRef, draggable, onDragStart, onDragEnd }) {
  return (
    <button
      ref={registerRef}
      type="button"
      className={`wbs-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--wbs-link-accent': accent }}
      onClick={(e) => { spawnRipple(e); onClick(page.path); }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="wbs-nav-link-icon">{page.icon}</span>
      <span className="wbs-nav-link-label">{page.label}</span>
    </button>
  );
}
