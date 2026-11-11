import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DISCIPLESHIP_OVERVIEW, DISCIPLESHIP_MY_INVOLVEMENT, DISCIPLESHIP_RESOURCE_LIBRARY, DISCIPLESHIP_SAVED, DISCIPLESHIP_GROUPS } from './discipleshipConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { DISCIPLESHIP_VISIBILITY_STORAGE_KEY, isDiscipleshipPageVisible } from './discipleshipVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './DiscipleshipShell.css';

/* ─────────────────────────────────────────────────────────────
   Discipleship Ministry — bespoke shell

   A self-contained nav + header for the Discipleship Ministry
   section, built to feel like its own steady, growth-minded space
   rather than a tab inside the app's dark glass shell. Replaces
   NavRail + the shared .app-topbar entirely for any page that
   opts in. Mirrors WomensShell.jsx / MensShell.jsx exactly in
   structure/behavior — only the visual theme and copy differ
   (a cool teal-blue "River of Life" palette with a warm gold
   light-on-water accent, distinct from Administration's cool
   slate/steel, plus flowing current streaks and drifting light
   glints instead of petals or topography).

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see ComingSoon.jsx.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [DISCIPLESHIP_OVERVIEW, DISCIPLESHIP_MY_INVOLVEMENT, DISCIPLESHIP_RESOURCE_LIBRARY, DISCIPLESHIP_SAVED];

/* Light glints on the water — plain text symbols (not pictograph
   emoji) so CSS can tint them; a gold subset is picked out via
   .dps-leaf:nth-child(3/7/10) in DiscipleshipShell.css, the rest
   stay pale white for scattered sunlight on the current. */
const LEAVES = ['✦', '⋆', '˖', '∘', '✦', '⋆', '˖', '∘', '✦', '⋆'];

/* Per-section accents (readable against the dark pine/forest shell
   background — distinct from the base gold and from each other)
   used to tint each nav group's active pill + link. */
const GROUP_ACCENTS = {
  path:        '#60a5fa',
  bible:       '#fbbf24',
  groups:      '#2dd4bf',
  mentorship:  '#a78bfa',
  equipping:   '#6ee7b7',
  leadership:  '#fb7185',
  team:        '#f472b6',
  records:     '#d9a441',
};
const DEFAULT_ACCENT = '#d9a441';

const PATH_ACCENTS = {};
DISCIPLESHIP_GROUPS.forEach(group => {
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

/* Time-of-day variant, chosen once per mount — stays within the
   teal/gold family, just shifts warmth (mirrors WomensShell). */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'dps-time-night';
  if (hour < 12) return 'dps-time-morning';
  if (hour < 17) return 'dps-time-afternoon';
  if (hour < 21) return 'dps-time-evening';
  return 'dps-time-night';
}

export default function DiscipleshipShell({
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
     chrome — same exception as WomensShell: dragging the whole
     "Discipleship Ministry" entry off the main rail keeps this
     shell's own nav dropdown, since that pop-out carries the whole
     section. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Discipleship Ministry section can be
     code-gated from Settings → Page Settings (see lib/pageLocks.js).
     Unlocking is session-scoped — a fresh browser session
     re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'discipleship');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-discipleship-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.discipleship?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-discipleship-unlocked', '1'); } catch {}
  };

  /* Which pages this person has chosen to see in their own copy of
     the menu — same "hidden unless turned off" model as Women's,
     toggled from the profile avatar's "Page Settings" tab
     (DiscipleshipMenuSettings). */
  const [pageVisibility] = useUserStoreKey(DISCIPLESHIP_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = useMemo(
    () => TOP_LINKS.filter(p => p.path === DISCIPLESHIP_OVERVIEW.path || isDiscipleshipPageVisible(pageVisibility, p.path)),
    [pageVisibility]
  );
  const visibleGroups = useMemo(
    () => DISCIPLESHIP_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isDiscipleshipPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  /* ── Drag-to-detach ── same gesture as WomensShell/MensShell/main NavRail. */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const leavesRef = useRef(null);
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Discipleship Ministry has its own leaf-shaped
     trigger. */
  useEffect(() => {
    document.body.classList.add('dps-shell-active');
    return () => document.body.classList.remove('dps-shell-active');
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
    const rect = document.querySelector('.dps-nav-dropdown')?.getBoundingClientRect();
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

  function handlePointerMove(e) {
    const el = leavesRef.current;
    if (!el) return;
    const relX = (e.clientX / window.innerWidth - 0.5) * 2;
    const relY = (e.clientY / window.innerHeight - 0.5) * 2;
    el.style.transform = `translate(${relX * 10}px, ${relY * 8}px)`;
  }

  function registerLink(path) {
    return (el) => {
      if (el) linkRefs.current.set(path, el);
      else linkRefs.current.delete(path);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="dps-picture-frame">
        <div className={`dps-page ${timeClass}`}>
          <div className="dps-glow glow-a" />
          <div className="dps-glow glow-b" />
          <div className="dps-lock-wrap" role="dialog" aria-modal="true" aria-label="Discipleship Ministry is locked">
            <div className="dps-lock-card">
              <div className="dps-lock-icon" aria-hidden="true">🔒</div>
              <div className="dps-lock-eyebrow">Discipleship Ministry</div>
              <h2 className="dps-lock-title">This space is locked</h2>
              <p className="dps-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="dps-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="dps-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="dps-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="dps-lock-settings-link"
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
    <div className="dps-picture-frame">
    <div className={`dps-page ${timeClass}`} onMouseMove={handlePointerMove}>
      <div className="dps-path-track" aria-hidden="true" />
      <div className="dps-river-current" aria-hidden="true" />
      <div className="dps-glow glow-a" />
      <div className="dps-glow glow-b" />
      <div className="dps-leaves" ref={leavesRef} aria-hidden="true">
        {LEAVES.map((l, i) => (
          <span className="dps-leaf" key={i}>{l}</span>
        ))}
      </div>

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="dps-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="dps-main">
        <header className="dps-header">
          <div className="dps-header-row">
            {keepNav && (
            <div className="dps-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`dps-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Discipleship Ministry menu"
                aria-expanded={navOpen}
              >
                🌿
              </button>

              {navOpen && (
                <nav className="dps-nav-dropdown">
                  <button type="button" className="dps-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="dps-brand">
                    <span className="dps-brand-mark">🌱</span>
                    <span className="dps-brand-name">Discipleship Ministry</span>
                  </div>

                  <div className="dps-nav-scroll" ref={navScrollRef}>
                    <div
                      className="dps-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.28)}, ${hexToRgba(pill.accent, 0.07)})`,
                        borderColor: hexToRgba(pill.accent, 0.35),
                      }}
                    />
                    <div className="dps-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== DISCIPLESHIP_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="dps-nav-group" key={group.key}>
                        <div className="dps-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="dps-header-text">
              <div className="dps-crumbs">Discipleship Ministry</div>
              <div className="dps-title-row">
                {icon && <span className="dps-title-icon">{icon}</span>}
                <h1 className="dps-title">{title}</h1>
                <div className="dps-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="dps-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="dps-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="dps-content" key={pathname}>{children}</div>
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
      className={`dps-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--dps-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="dps-nav-link-icon">{page.icon}</span>
      <span className="dps-nav-link-label">{page.label}</span>
    </button>
  );
}
