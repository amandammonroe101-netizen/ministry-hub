import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { WOMENS_OVERVIEW, WOMENS_MY_INVOLVEMENT, WOMENS_RESOURCE_LIBRARY, WOMENS_SAVED, WOMENS_GROUPS } from './womensConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { WOMENS_VISIBILITY_STORAGE_KEY, isWomensPageVisible } from './womensVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './WomensShell.css';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — bespoke shell (prototype)

   A self-contained nav + header for the Women's Ministry section,
   built to feel like its own warm, editorial space rather than a
   tab inside the app's dark glass shell. Replaces NavRail + the
   shared .app-topbar entirely for any page that opts in.

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup (stats bar, search, card grid, slide-over, etc.) as
   children here — see AllWomen.jsx / PrayerGroups.jsx.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [WOMENS_OVERVIEW, WOMENS_MY_INVOLVEMENT, WOMENS_RESOURCE_LIBRARY, WOMENS_SAVED];

const PETALS = ['🌸', '🌷', '✿', '🌸', '🌷', '✿', '🌸', '🌷', '✿', '🌷'];

/* Pastel per-section accents (readable at ~45-50% lightness against
   the white/pink shell background — distinct from the base rose and
   from each other) used to tint each nav group's active pill + link. */
const GROUP_ACCENTS = {
  members:      '#d1698f',
  discipleship: '#a374c4',
  events:       '#c98a4a',
  care:         '#c9598a',
  team:         '#4f9e7a',
  records:      '#3f9c9c',
};
const DEFAULT_ACCENT = '#d1698f';

const PATH_ACCENTS = {};
WOMENS_GROUPS.forEach(group => {
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
   entirely within the light pink/white family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'wms-time-night';
  if (hour < 12) return 'wms-time-morning';
  if (hour < 17) return 'wms-time-afternoon';
  if (hour < 21) return 'wms-time-evening';
  return 'wms-time-night';
}

export default function WomensShell({
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
  /* Detached pop-out windows (drag-to-detach into their own Electron
     window) show only this page's content — no nav chrome, matching
     how the app-wide NavRail is suppressed in App.jsx for every other
     detached page. Exception: dragging the whole "Women's Ministry"
     entry off the main rail (rather than one sub-page out of the
     dropdown) keeps this shell's own nav dropdown, since that pop-out
     is meant to carry the whole ministry section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Women's Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. There's
     no "forgot code" reset here on purpose: the code is set from the
     main Settings page, which is never itself locked, so a member
     can always go there to change or remove it. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'womens');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-womens-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.womens?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-womens-unlocked', '1'); } catch {}
  };

  /* Which pages this woman has chosen to see in her own copy of the
     menu — same "hidden unless turned off" model as the main app's
     Settings > Visible Categories, just scoped to this circle and
     toggled per-page from the profile avatar's "Customize Menu" tab
     (see WomensMenuSettings). */
  const [pageVisibility] = useUserStoreKey(WOMENS_VISIBILITY_STORAGE_KEY, {});
  const visibleTopLinks = useMemo(
    () => TOP_LINKS.filter(p => p.path === WOMENS_OVERVIEW.path || isWomensPageVisible(pageVisibility, p.path)),
    [pageVisibility]
  );
  const visibleGroups = useMemo(
    () => WOMENS_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isWomensPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  /* ── Drag-to-detach ──
        Same gesture as the main NavRail (Electron only): dragging a nav
        link out of the dropdown panel pops that page into its own
        sidebar-less window. `dragging` drives the on-screen hint;
        `detachedRoutes` (broadcast by the main process) hides whichever
        items are currently popped out so they don't show in two places. */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const petalsRef = useRef(null);
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Women's Ministry has its own rose-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('wms-shell-active');
    return () => document.body.classList.remove('wms-shell-active');
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
    const rect = document.querySelector('.wms-nav-dropdown')?.getBoundingClientRect();
    // Released off the window entirely, or outside the dropdown panel
    // in any direction — both read as "tear this page off".
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
    const el = petalsRef.current;
    if (!el) return;
    const relX = (e.clientX / window.innerWidth - 0.5) * 2;
    const relY = (e.clientY / window.innerHeight - 0.5) * 2;
    el.style.transform = `translate(${relX * 12}px, ${relY * 9}px)`;
  }

  function registerLink(path) {
    return (el) => {
      if (el) linkRefs.current.set(path, el);
      else linkRefs.current.delete(path);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="wms-picture-frame">
        <div className={`wms-page ${timeClass}`}>
          <div className="wms-bloom bloom-a" />
          <div className="wms-bloom bloom-b" />
          <div className="wms-lock-wrap" role="dialog" aria-modal="true" aria-label="Women's Ministry is locked">
            <div className="wms-lock-card">
              <div className="wms-lock-icon" aria-hidden="true">🔒</div>
              <div className="wms-lock-eyebrow">Women's Ministry</div>
              <h2 className="wms-lock-title">This space is locked</h2>
              <p className="wms-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="wms-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="wms-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="wms-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="wms-lock-settings-link"
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
    <div className="wms-picture-frame">
    <div className={`wms-page ${timeClass}`} onMouseMove={handlePointerMove}>
      <div className="wms-bloom bloom-a" />
      <div className="wms-bloom bloom-b" />
      <div className="wms-petals" ref={petalsRef} aria-hidden="true">
        {PETALS.map((p, i) => (
          <span className="wms-petal" key={i}>{p}</span>
        ))}
      </div>

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="wms-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="wms-main">
        <header className="wms-header">
          <div className="wms-header-row">
            {keepNav && (
            <div className="wms-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`wms-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Women's Ministry menu"
                aria-expanded={navOpen}
              >
                🌹
              </button>

              {navOpen && (
                <nav className="wms-nav-dropdown">
                  <button type="button" className="wms-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="wms-brand">
                    <span className="wms-brand-mark">✦</span>
                    <span className="wms-brand-name">Women's Ministry</span>
                  </div>

                  <div className="wms-nav-scroll" ref={navScrollRef}>
                    <div
                      className="wms-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="wms-nav-group">
                      {visibleTopLinks.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== WOMENS_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="wms-nav-group" key={group.key}>
                        <div className="wms-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="wms-header-text">
              <div className="wms-crumbs">Women's Ministry</div>
              <div className="wms-title-row">
                {icon && <span className="wms-title-icon">{icon}</span>}
                <h1 className="wms-title">{title}</h1>
                <div className="wms-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="wms-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="wms-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="wms-content" key={pathname}>{children}</div>
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
      className={`wms-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--wms-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="wms-nav-link-icon">{page.icon}</span>
      <span className="wms-nav-link-label">{page.label}</span>
    </button>
  );
}
