import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MENS_OVERVIEW, MENS_GROUPS } from './mensConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { MENS_VISIBILITY_STORAGE_KEY, isMensPageVisible } from './mensVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './MensShell.css';

/* ─────────────────────────────────────────────────────────────
   Men's Ministry — bespoke shell

   A self-contained nav + header for the Men's Ministry section,
   built to feel like a rugged, no-frills field HQ rather than a
   tab inside the app's dark glass shell. Replaces NavRail + the
   shared .app-topbar entirely for any page that opts in.
   Mirrors WomensShell.jsx exactly in structure/behavior — only
   the visual theme and copy differ (deep navy/slate/rust instead
   of blush/rose-gold, bold Space Grotesk instead of cursive
   serif, topographic texture instead of falling petals).

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see AllMen.jsx.
   ───────────────────────────────────────────────────────────── */

/* Only "Overview" sits flat above the groups today — Men's has no
   equivalents yet to Women's My Involvement / Resource Library /
   Saved, so there's nothing else to list here. */
const TOP_LINKS = [MENS_OVERVIEW];

/* Rugged per-section accents (readable against the dark navy shell
   background — distinct from the base rust and from each other)
   used to tint each nav group's active pill + link. */
const GROUP_ACCENTS = {
  members:      '#4f8f6f',
  discipleship: '#b07f3f',
  events:       '#c9603f',
  service:      '#4f7fa0',
  family:       '#a04f3f',
  team:         '#8a8478',
  records:      '#3f7a7a',
};
const DEFAULT_ACCENT = '#c9603f';

const PATH_ACCENTS = {};
MENS_GROUPS.forEach(group => {
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
   navy/slate family, just shifts warmth (mirrors WomensShell). */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'mns-time-night';
  if (hour < 12) return 'mns-time-morning';
  if (hour < 17) return 'mns-time-afternoon';
  if (hour < 21) return 'mns-time-evening';
  return 'mns-time-night';
}

export default function MensShell({
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
     "Men's Ministry" entry off the main rail keeps this shell's own
     nav dropdown, since that pop-out carries the whole section. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Men's Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'mens');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-mens-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.mens?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-mens-unlocked', '1'); } catch {}
  };

  /* Which pages this man has chosen to see in his own copy of the
     menu — same "hidden unless turned off" model as Women's, toggled
     from the profile avatar's "Page Settings" tab (MensMenuSettings). */
  const [pageVisibility] = useUserStoreKey(MENS_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = useMemo(
    () => TOP_LINKS.filter(p => p.path === MENS_OVERVIEW.path || isMensPageVisible(pageVisibility, p.path)),
    [pageVisibility]
  );
  const visibleGroups = useMemo(
    () => MENS_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isMensPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  /* ── Drag-to-detach ── same gesture as WomensShell/main NavRail. */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const grainRef = useRef(null);
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Men's Ministry has its own compass-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('mns-shell-active');
    return () => document.body.classList.remove('mns-shell-active');
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
    const rect = document.querySelector('.mns-nav-dropdown')?.getBoundingClientRect();
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
    const el = grainRef.current;
    if (!el) return;
    const relX = (e.clientX / window.innerWidth - 0.5) * 2;
    const relY = (e.clientY / window.innerHeight - 0.5) * 2;
    el.style.transform = `translate(${relX * 8}px, ${relY * 6}px)`;
  }

  function registerLink(path) {
    return (el) => {
      if (el) linkRefs.current.set(path, el);
      else linkRefs.current.delete(path);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="mns-picture-frame">
        <div className={`mns-page ${timeClass}`}>
          <div className="mns-glow glow-a" />
          <div className="mns-glow glow-b" />
          <div className="mns-lock-wrap" role="dialog" aria-modal="true" aria-label="Men's Ministry is locked">
            <div className="mns-lock-card">
              <div className="mns-lock-icon" aria-hidden="true">🔒</div>
              <div className="mns-lock-eyebrow">Men's Ministry</div>
              <h2 className="mns-lock-title">This space is locked</h2>
              <p className="mns-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="mns-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="mns-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="mns-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="mns-lock-settings-link"
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
    <div className="mns-picture-frame">
    <div className={`mns-page ${timeClass}`} onMouseMove={handlePointerMove}>
      <div className="mns-topo" aria-hidden="true" />
      <div className="mns-glow glow-a" />
      <div className="mns-glow glow-b" />
      <div className="mns-grain" ref={grainRef} aria-hidden="true" />

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="mns-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="mns-main">
        <header className="mns-header">
          <div className="mns-header-row">
            {keepNav && (
            <div className="mns-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`mns-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Men's Ministry menu"
                aria-expanded={navOpen}
              >
                🧭
              </button>

              {navOpen && (
                <nav className="mns-nav-dropdown">
                  <button type="button" className="mns-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="mns-brand">
                    <span className="mns-brand-mark">⛰</span>
                    <span className="mns-brand-name">Men's Ministry</span>
                  </div>

                  <div className="mns-nav-scroll" ref={navScrollRef}>
                    <div
                      className="mns-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.30)}, ${hexToRgba(pill.accent, 0.08)})`,
                        borderColor: hexToRgba(pill.accent, 0.4),
                      }}
                    />
                    <div className="mns-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== MENS_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="mns-nav-group" key={group.key}>
                        <div className="mns-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="mns-header-text">
              <div className="mns-crumbs">Men's Ministry</div>
              <div className="mns-title-row">
                {icon && <span className="mns-title-icon">{icon}</span>}
                <h1 className="mns-title">{title}</h1>
                <div className="mns-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="mns-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="mns-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="mns-content" key={pathname}>{children}</div>
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
      className={`mns-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--mns-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="mns-nav-link-icon">{page.icon}</span>
      <span className="mns-nav-link-label">{page.label}</span>
    </button>
  );
}
