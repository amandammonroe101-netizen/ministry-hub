import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MISSIONS_OVERVIEW, MISSIONS_GROUPS } from './missionsConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './MissionsShell.css';

/* ─────────────────────────────────────────────────────────────
   Missions Ministry — bespoke shell

   A self-contained nav + header for the Missions Ministry section,
   built to feel like a field-briefing / flight-deck rather than a
   tab inside the app's dark glass shell. Replaces NavRail + the
   shared .app-topbar entirely for any page that opts in.
   Mirrors WomensShell.jsx / MensShell.jsx exactly in structure and
   behavior — only the visual theme and copy differ (ocean-horizon
   navy/teal with passport-stamp coral instead of blush or rust, a
   drifting-plane/compass motif instead of petals or topo contours).

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here.
   ───────────────────────────────────────────────────────────── */

/* Only "Overview" sits flat above the groups — Missions has no
   equivalents yet to Women's My Involvement / Resource Library /
   Saved, so there's nothing else to list here. */
const TOP_LINKS = [MISSIONS_OVERVIEW];

/* Small drifting glyphs — a passing-overhead motif standing in for
   Women's falling petals / Men's topographic grain. */
const DRIFT_GLYPHS = ['✈️', '🧭', '🌊', '🗺️', '⛵', '🌍', '✈️', '🧭', '🌊', '🗺️'];

/* Adventure/global per-section accents — mirrors missionsConfig.js's
   GROUP colors exactly, key for key, so the shell nav and the rest
   of the ministry read as one coherent identity. */
const GROUP_ACCENTS = {
  missionaries: '#3d8bbd', // ocean blue
  trips:        '#d9954a', // warm amber-orange
  field:        '#4f9e7a', // travel green
  prayer:       '#7c7fdb', // dusk violet
  giving:       '#c9a13f', // passport gold
  engagement:   '#c9503f', // passport-stamp red
  team:         '#ab9264', // sandy khaki
  records:      '#3d9c9c', // teal
};
const DEFAULT_ACCENT = '#e0723f'; // sunset coral

const PATH_ACCENTS = {};
MISSIONS_GROUPS.forEach(group => {
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

/* Time-of-day variant, chosen once per mount — here it reads as a
   sky/horizon shift (dawn, day, dusk, night) rather than just mood
   lighting, fitting the travel theme. Mirrors WomensShell/MensShell. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'mss-time-night';
  if (hour < 12) return 'mss-time-morning';
  if (hour < 17) return 'mss-time-afternoon';
  if (hour < 21) return 'mss-time-evening';
  return 'mss-time-night';
}

export default function MissionsShell({
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
     chrome — same exception as WomensShell/MensShell: dragging the
     whole "Missions Ministry" entry off the main rail keeps this
     shell's own nav dropdown, since that pop-out carries the whole
     section. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Missions Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'missions');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-missions-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.missions?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-missions-unlocked', '1'); } catch {}
  };

  /* ── Drag-to-detach ── same gesture as WomensShell/MensShell/main NavRail. */
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const driftRef = useRef(null);
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this shell
     is mounted — Missions Ministry has its own plane-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('mss-shell-active');
    return () => document.body.classList.remove('mss-shell-active');
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
    const rect = document.querySelector('.mss-nav-dropdown')?.getBoundingClientRect();
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
    const el = driftRef.current;
    if (!el) return;
    const relX = (e.clientX / window.innerWidth - 0.5) * 2;
    const relY = (e.clientY / window.innerHeight - 0.5) * 2;
    el.style.transform = `translate(${relX * 10}px, ${relY * 7}px)`;
  }

  function registerLink(path) {
    return (el) => {
      if (el) linkRefs.current.set(path, el);
      else linkRefs.current.delete(path);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="mss-picture-frame">
        <div className={`mss-page ${timeClass}`}>
          <div className="mss-glow glow-a" />
          <div className="mss-glow glow-b" />
          <div className="mss-lock-wrap" role="dialog" aria-modal="true" aria-label="Missions Ministry is locked">
            <div className="mss-lock-card">
              <div className="mss-lock-icon" aria-hidden="true">🔒</div>
              <div className="mss-lock-eyebrow">Missions Ministry</div>
              <h2 className="mss-lock-title">This space is locked</h2>
              <p className="mss-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="mss-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="mss-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="mss-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="mss-lock-settings-link"
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
    <div className="mss-picture-frame">
    <div className={`mss-page ${timeClass}`} onMouseMove={handlePointerMove}>
      <div className="mss-horizon" aria-hidden="true" />
      <div className="mss-parchment" aria-hidden="true" />
      <svg className="mss-flightpaths" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
        <path className="mss-flightpath fp-1" pathLength="1" d="M -60,560 C 260,180 640,660 1260,260" />
        <path className="mss-flightpath fp-2" pathLength="1" d="M -60,180 C 320,520 720,80 1260,480" />
        <path className="mss-flightpath fp-3" pathLength="1" d="M -60,700 C 380,340 780,760 1260,120" />
        <path className="mss-flightpath fp-4" pathLength="1" d="M 1260,650 C 900,250 500,700 -60,300" />
        <path className="mss-flightpath fp-5" pathLength="1" d="M -60,80 C 200,300 1000,-40 1260,340" />
        <path className="mss-flightpath fp-6" pathLength="1" d="M 1260,60 C 850,500 350,20 -60,480" />
        <path className="mss-flightpath fp-7" pathLength="1" d="M -60,420 C 460,300 760,540 1260,420" />
        <path className="mss-flightpath fp-8 fp-takeoff" pathLength="1" d="M 260,880 C 220,620 420,340 880,140" />
        <path className="mss-flightpath fp-9 fp-takeoff" pathLength="1" d="M 980,900 C 860,640 620,380 140,110" />
        <path className="mss-flightpath fp-10 fp-takeoff" pathLength="1" d="M 620,920 C 660,660 520,400 210,190" />
      </svg>
      <div className="mss-glow glow-a" />
      <div className="mss-glow glow-b" />
      <div className="mss-drift" ref={driftRef} aria-hidden="true">
        {DRIFT_GLYPHS.map((g, i) => (
          <span className="mss-drift-glyph" key={i}>{g}</span>
        ))}
      </div>

      {/* Drag-to-detach hint — shown only while a nav link is being
          dragged, so the gesture is discoverable. */}
      {dragging && (
        <div className="mss-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="mss-main">
        <header className="mss-header">
          <div className="mss-header-row">
            {keepNav && (
            <div className="mss-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`mss-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Missions Ministry menu"
                aria-expanded={navOpen}
              >
                ✈️
              </button>

              {navOpen && (
                <nav className="mss-nav-dropdown">
                  <button type="button" className="mss-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="mss-brand">
                    <span className="mss-brand-mark">🧭</span>
                    <span className="mss-brand-name">Missions Ministry</span>
                  </div>

                  <div className="mss-nav-scroll" ref={navScrollRef}>
                    <div
                      className="mss-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.28)}, ${hexToRgba(pill.accent, 0.07)})`,
                        borderColor: hexToRgba(pill.accent, 0.35),
                      }}
                    />
                    <div className="mss-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== MISSIONS_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {MISSIONS_GROUPS.map(group => (
                      <div className="mss-nav-group" key={group.key}>
                        <div className="mss-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="mss-header-text">
              <div className="mss-crumbs">Missions Ministry</div>
              <div className="mss-title-row">
                {icon && <span className="mss-title-icon">{icon}</span>}
                <h1 className="mss-title">{title}</h1>
                <div className="mss-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="mss-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="mss-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="mss-content" key={pathname}>{children}</div>
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
      className={`mss-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--mss-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="mss-nav-link-icon">{page.icon}</span>
      <span className="mss-nav-link-label">{page.label}</span>
    </button>
  );
}
