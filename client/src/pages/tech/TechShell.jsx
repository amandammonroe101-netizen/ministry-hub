import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TECH_OVERVIEW, TECH_GROUPS } from './techConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { TECH_VISIBILITY_STORAGE_KEY, isTechPageVisible } from './techVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './TechShell.css';

/* ─────────────────────────────────────────────────────────────
   Tech / Production Ministry — bespoke shell.

   A self-contained nav + header for the Tech / Production
   section, re-skinned to match Website Ministry's "Blue Glass
   Over Water" theme: an animated water backdrop (drifting light
   caustics), a mitered blue-glass picture frame with river-stone
   corner clusters, and small ripple animations that bloom from
   any button the user clicks. Mirrors WebsiteShell.jsx exactly
   in structure/behavior — only the copy (labels, icons, accent
   palette) differs so this still reads as its own section rather
   than a re-skinned duplicate of Website Ministry.

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see ComingSoon.jsx.
   ───────────────────────────────────────────────────────────── */

/* Only "Overview" sits flat above the groups today — Tech has no
   equivalents yet to Women's My Involvement / Resource Library /
   Saved, so there's nothing else to list here. */
const TOP_LINKS = [TECH_OVERVIEW];

/* Per-section accents — still a real signal-color system (one hue
   per discipline: red for audio, blue for video, violet for
   lighting, cyan for streaming, amber for operations, slate for
   team, zinc for gear, teal for records) but deepened from the old
   broadcast-console palette so each stays legible against the new
   light aqua-glass background. Lines up with each group's card
   color in techConfig.js. */
const GROUP_ACCENTS = {
  team:       '#3d5872',
  audio:      '#b3261e',
  video:      '#1d5fa8',
  lighting:   '#6d28d9',
  streaming:  '#0e7c91',
  operations: '#92650a',
  gear:       '#52525b',
  records:    '#0f7a6c',
};
/* Overview's own accent — the same core aqua as the rest of the
   "Blue Glass Over Water" theme, used as the shell's primary
   identity. */
const DEFAULT_ACCENT = '#1ba8c4';

const PATH_ACCENTS = {};
TECH_GROUPS.forEach(group => {
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
  ripple.className = 'tps-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

export default function TechShell({
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
     chrome — same exception as WebsiteShell: dragging the whole
     "Tech / Production" entry off the main rail keeps this shell's
     own nav dropdown, since that pop-out carries the whole section. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Tech / Production section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'tech');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-tech-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.tech?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-tech-unlocked', '1'); } catch {}
  };

  /* Which pages this tech has chosen to see in their own copy of
     the menu — same "hidden unless turned off" model as Website
     Ministry, toggled from the profile avatar's "Page Settings" tab
     (TechMenuSettings). */
  const [pageVisibility] = useUserStoreKey(TECH_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = TOP_LINKS.filter(p => p.path === TECH_OVERVIEW.path || isTechPageVisible(pageVisibility, p.path));
  const visibleGroups = TECH_GROUPS
    .map(group => ({ ...group, items: group.items.filter(i => isTechPageVisible(pageVisibility, i.path)) }))
    .filter(group => group.items.length > 0);

  /* ── Drag-to-detach ── same gesture as WebsiteShell/main NavRail. */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Tech / Production has its own control-knob trigger. */
  useEffect(() => {
    document.body.classList.add('tps-shell-active');
    return () => document.body.classList.remove('tps-shell-active');
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
    const rect = document.querySelector('.tps-nav-dropdown')?.getBoundingClientRect();
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
      <div className="tps-page">
        <TpsFrame />
        <div className="tps-lock-wrap" role="dialog" aria-modal="true" aria-label="Tech / Production is locked">
          <div className="tps-lock-card">
            <div className="tps-lock-icon" aria-hidden="true">🔒</div>
            <div className="tps-lock-eyebrow">Tech / Production</div>
            <h2 className="tps-lock-title">This space is locked</h2>
            <p className="tps-lock-sub">Enter the code to continue.</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              className="tps-lock-input"
              placeholder="Code"
              value={challenge.value}
              onChange={e => setChallenge({ value: e.target.value, error: '' })}
              onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
            />
            {challenge.error && <div className="tps-lock-err">{challenge.error}</div>}
            <button
              type="button"
              className="tps-lock-btn"
              onClick={(e) => { spawnRipple(e); submitChallenge(); }}
              disabled={!challenge.value.trim()}
            >
              Unlock
            </button>
            <button
              type="button"
              className="tps-lock-settings-link"
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
    <div className="tps-page">
      <TpsFrame />

      {dragging && (
        <div className="tps-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="tps-main">
        <header className="tps-header">
          <div className="tps-header-row">
            {keepNav && (
            <div className="tps-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`tps-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={(e) => { spawnRipple(e); setNavOpen(o => !o); }}
                aria-label="Open Tech / Production menu"
                aria-expanded={navOpen}
              >
                🎛
              </button>

              {navOpen && (
                <nav className="tps-nav-dropdown">
                  <button type="button" className="tps-exit" onClick={(e) => { spawnRipple(e); navigate('/calendar'); }}>
                    ← Ministry Hub
                  </button>

                  <div className="tps-brand">
                    <span className="tps-brand-mark">📡</span>
                    <span className="tps-brand-name">Tech / Production</span>
                  </div>

                  <div className="tps-nav-scroll" ref={navScrollRef}>
                    <div
                      className="tps-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="tps-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== TECH_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="tps-nav-group" key={group.key}>
                        <div className="tps-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="tps-header-text">
              <div className="tps-crumbs">Tech / Production Ministry</div>
              <div className="tps-title-row">
                {icon && <span className="tps-title-icon">{icon}</span>}
                <h1 className="tps-title">{title}</h1>
                <div className="tps-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="tps-avatar"
                      onClick={(e) => { spawnRipple(e); onProfileClick(e); }}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="tps-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="tps-content" key={pathname}>{children}</div>
      </div>
    </div>
  );
}

/* Decorative "blue glass" border — a translucent glass channel inset
   from the shell's edge plus four river-stone corner clusters. Same
   construction as WebsiteShell's WbsFrame, just renamed to keep the
   .tps- prefix. Rendered above the water backdrop in both the locked
   and unlocked states. */
function TpsFrame() {
  return (
    <div className="tps-frame" aria-hidden="true">
      <span className="tps-frame-corner tps-frame-corner--tl" />
      <span className="tps-frame-corner tps-frame-corner--tr" />
      <span className="tps-frame-corner tps-frame-corner--bl" />
      <span className="tps-frame-corner tps-frame-corner--br" />
    </div>
  );
}

function NavLink({ page, active, onClick, accent, registerRef, draggable, onDragStart, onDragEnd }) {
  return (
    <button
      ref={registerRef}
      type="button"
      className={`tps-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--tps-link-accent': accent }}
      onClick={(e) => { spawnRipple(e); onClick(page.path); }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="tps-nav-link-icon">{page.icon}</span>
      <span className="tps-nav-link-label">{page.label}</span>
    </button>
  );
}
